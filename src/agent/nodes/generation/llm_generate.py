"""Node: llm_generate — CoT generation với XML-tags output."""

from __future__ import annotations

import re

from src.agent.prompts.generate import generate_prompt
from src.agent.state import AgentState
from src.core.logging import get_logger
from src.services.llm.factory import get_quality_llm

logger = get_logger(__name__)

MAX_CONTEXT_CHARS = 6000  # giới hạn context để tránh vượt context window
MAX_SNIPPET_CHARS = 200

# ── Regex bóc tách output ───────────────────────────────────────────────────
_ANALYSIS_RE = re.compile(r"<\s*analysis\s*>(.*?)<\s*/\s*analysis\s*>", re.DOTALL | re.IGNORECASE)
_ANSWER_RE = re.compile(r"<\s*answer\s*>(.*?)<\s*/\s*answer\s*>", re.DOTALL | re.IGNORECASE)
_ANSWER_OPEN_RE = re.compile(r"<\s*answer\s*>(.*)", re.DOTALL | re.IGNORECASE)
_TAG_FRAGMENT_RE = re.compile(r"<\s*/?\s*(?:analysis|answer)\s*>", re.IGNORECASE)
_FENCE_RE = re.compile(r"```[a-zA-Z]*")

# Marker tài liệu: [doc_0]. Nhóm nhiều mã trong một cặp ngoặc sẽ được tách ra.
_DOC_MARKER_RE = re.compile(r"\[\s*(doc_\d+)\s*\]", re.IGNORECASE)
_GROUPED_MARKER_RE = re.compile(r"\[\s*doc_\d+(?:\s*[,;/]\s*doc_\d+)+\s*\]", re.IGNORECASE)
_SENTENCE_BOUNDARY_RE = re.compile(r"[.!?\n]")

# Cặp ngoặc kép LLM hay bọc quanh câu trả lời (tàn dư thói quen xuất JSON).
_QUOTE_PAIRS = {'"': '"', "'": "'", "“": "”", "«": "»"}


def _build_context(relevant_strips: list[dict]) -> tuple[str, dict[str, dict]]:
    """Format docs thành context string + map nhãn ``doc_N`` → strip gốc.

    Nhãn ngắn được dùng thay cho ``doc_id`` thật (vốn là chunk_id dài kiểu
    ``tang-huyet-ap::0003::a1b2c3d4``) để LLM chép lại chính xác trong marker.
    """
    parts: list[str] = []
    label_map: dict[str, dict] = {}
    total = 0
    for idx, doc in enumerate(relevant_strips):
        label = f"doc_{idx}"
        chunk = f"[{label}] {doc.get('title', '')}\n{doc.get('content', '')}\n"
        if total + len(chunk) > MAX_CONTEXT_CHARS:
            break
        parts.append(chunk)
        label_map[label] = doc
        total += len(chunk)
    return "\n---\n".join(parts), label_map


def _strip_wrapping_quotes(text: str) -> str:
    """Gỡ cặp ngoặc kép bọc trọn khối văn bản (không đụng ngoặc kép giữa câu)."""
    text = text.strip()
    while len(text) >= 2 and text[0] in _QUOTE_PAIRS and text[-1] == _QUOTE_PAIRS[text[0]]:
        inner = text[1:-1].strip()
        if not inner:
            break
        text = inner
    return text


def _clean_text(text: str) -> str:
    """Dọn ký tự lạ LLM hay chèn thêm: tag thừa, code fence, \\n literal, ngoặc bọc."""
    if not text:
        return ""
    text = _TAG_FRAGMENT_RE.sub("", text)
    text = _FENCE_RE.sub("", text)
    text = text.replace("\\n", "\n")  # LLM đôi khi vẫn viết \n dạng literal
    text = _strip_wrapping_quotes(text)
    text = re.sub(r"[ \t]+(\n)", r"\1", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _normalize_markers(text: str) -> str:
    """Chuẩn hoá marker về đúng dạng ``[doc_N]`` để downstream so khớp được.

    - ``[doc_0, doc_1]`` → ``[doc_0][doc_1]``
    - ``[ DOC_2 ]``      → ``[doc_2]``
    """

    def _expand(match: re.Match[str]) -> str:
        ids = re.findall(r"doc_\d+", match.group(0), flags=re.IGNORECASE)
        return "".join(f"[{doc_id.lower()}]" for doc_id in ids)

    text = _GROUPED_MARKER_RE.sub(_expand, text)
    return _DOC_MARKER_RE.sub(lambda m: f"[{m.group(1).lower()}]", text)


def _extract_cited_labels(text: str) -> list[str]:
    """Trích mã tài liệu trực tiếp từ văn bản, giữ thứ tự xuất hiện, bỏ trùng."""
    seen: set[str] = set()
    ordered: list[str] = []
    for match in _DOC_MARKER_RE.finditer(text):
        label = match.group(1).lower()
        if label not in seen:
            seen.add(label)
            ordered.append(label)
    return ordered


def _parse_llm_response(raw: str) -> dict:
    """Bóc tách <analysis> / <answer> từ output XML-tags của LLM.

    Chuỗi fallback (LLM càng lệch format thì càng xuống sâu):
    1. Đủ cặp thẻ mở/đóng.
    2. Có <answer> nhưng thiếu thẻ đóng → lấy tới hết chuỗi.
    3. Chỉ có <analysis> → phần còn lại sau </analysis> coi là câu trả lời.
    4. Không có thẻ nào → dùng nguyên văn sau khi gỡ tag rác.
    """
    raw = raw or ""

    analysis_match = _ANALYSIS_RE.search(raw)
    analysis = analysis_match.group(1) if analysis_match else ""

    answer_match = _ANSWER_RE.search(raw)
    if answer_match:
        answer = answer_match.group(1)
    else:
        open_match = _ANSWER_OPEN_RE.search(raw)
        if open_match:
            answer = open_match.group(1)
        elif analysis_match:
            answer = raw[analysis_match.end() :]
        else:
            answer = raw

    answer = _normalize_markers(_clean_text(answer))
    if not answer:
        # Không bóc được gì → thà trả nguyên văn còn hơn trả rỗng cho người dùng.
        answer = _normalize_markers(_clean_text(raw))

    return {
        "analysis": _clean_text(analysis),
        "answer": answer,
        "cited_doc_ids": _extract_cited_labels(answer),
    }


def _tidy_spacing(text: str) -> str:
    """Dọn khoảng trắng thừa còn lại sau khi gỡ marker khỏi câu."""
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"[ \t]+([.,;:!?])", r"\1", text)
    text = re.sub(r"[ \t]+(\n)", r"\1", text)
    return text.strip()


def _sentence_for_label(text: str, label: str) -> str:
    """Lấy câu chứa marker ``[label]`` để làm snippet cho citation."""
    idx = text.find(f"[{label}]")
    if idx == -1:
        return ""
    start = 0
    for match in _SENTENCE_BOUNDARY_RE.finditer(text, 0, idx):
        start = match.end()
    end_match = _SENTENCE_BOUNDARY_RE.search(text, idx)
    end = end_match.end() if end_match else len(text)
    return text[start:end].strip()


def _build_citation(label: str, doc: dict, answer: str) -> dict:
    """Dựng citation từ nhãn trong câu trả lời + metadata của doc gốc."""
    snippet = _sentence_for_label(answer, label) or doc.get("content", "")
    return {
        # doc_id là nhãn khớp với marker trong answer — chat.py dựa vào đó để
        # đổi [doc_0] thành [1], [2]… trước khi trả về frontend.
        "doc_id": label,
        "chunk_id": doc.get("doc_id", ""),  # chunk_id thật, giữ lại để truy vết
        "title": doc.get("title", ""),
        "source": doc.get("source", ""),
        "issuer": doc.get("issuer") or "Cơ sở y tế",
        "doc_code": doc.get("doc_code"),
        "url": doc.get("url"),
        "snippet": snippet[:MAX_SNIPPET_CHARS],
    }


async def llm_generate_node(state: AgentState) -> AgentState:
    """Node 9 — LLM Generation với Chain-of-Thought.

    Input: relevant_strips (đã qua CRAG filter)
    Output: analysis (CoT), response (answer), citations
    """
    query = state.get("rewritten_query") or state.get("query", "")
    relevant_strips = state.get("relevant_strips", [])

    context, label_map = _build_context(relevant_strips)
    logger.info("[llm_generate] query=%.60s | docs=%d", query, len(relevant_strips))

    try:
        llm = get_quality_llm()
        chain = generate_prompt | llm
        result = await chain.ainvoke({"query": query, "context": context})
        parsed = _parse_llm_response(result.content)
        answer = parsed["answer"]

        # Marker LLM bịa ra (không có trong context) bị gỡ khỏi câu trả lời —
        # nếu để lại, frontend sẽ hiện nguyên chuỗi [doc_9] vì không có citation khớp.
        cited_labels: list[str] = []
        for label in parsed["cited_doc_ids"]:
            if label in label_map:
                cited_labels.append(label)
            else:
                logger.warning("[llm_generate] gỡ marker không có trong context: [%s]", label)
                answer = answer.replace(f"[{label}]", "")
        answer = _tidy_spacing(answer)

        citations = [_build_citation(label, label_map[label], answer) for label in cited_labels]

        logger.info("[llm_generate] answer=%d chars | citations=%d", len(answer), len(citations))
        return {
            **state,
            "analysis": parsed["analysis"],
            "response": answer,
            "citations": citations,
        }

    except Exception as exc:
        logger.error("[llm_generate] LLM error: %s", exc)
        return {
            **state,
            "response": "Xin lỗi, đã có lỗi khi tạo câu trả lời. Vui lòng thử lại.",
            "citations": [],
            "error": str(exc),
        }
