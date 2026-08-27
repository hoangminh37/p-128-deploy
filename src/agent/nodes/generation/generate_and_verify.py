"""V2 generation: tạo câu trả lời và đánh giá grounding trong một LLM call."""

from __future__ import annotations

import asyncio
import re

from src.agent.prompts.generate import generate_and_verify_prompt
from src.agent.state import AgentState
from src.core.config import get_settings
from src.core.logging import get_logger
from src.rag.config import get_rag_settings
from src.services.llm.factory import get_quality_llm_with_fallback
from src.services.routine_memory import format_routine_memory

logger = get_logger(__name__)

MAX_CONTEXT_CHARS = 12_000  # tăng để LLM có nhiều context hơn → câu trả lời chi tiết hơn
MAX_SNIPPET_CHARS = 350
DISCLAIMER_PARTIAL = "⚠️ Một vài ý có thể chưa được tài liệu bao phủ đầy đủ; hãy hỏi bác sĩ trước khi áp dụng."

_TAG_RE = {
    name: re.compile(rf"<\s*{name}\s*>(.*?)<\s*/\s*{name}\s*>", re.DOTALL | re.IGNORECASE)
    for name in ("analysis", "answer", "verdict")
}
_DOC_MARKER_RE = re.compile(r"\[\s*(doc_\d+)\s*\]", re.IGNORECASE)
_SUPPORT_RE = re.compile(r"support_level\s*:\s*(fully|partially|no_support)", re.IGNORECASE)
_ANSWERED_RE = re.compile(r"answers_question\s*:\s*(true|false)", re.IGNORECASE)
_SENTENCE_BOUNDARY_RE = re.compile(r"[.!?\n]")


def _tag_content(raw: str, name: str) -> str:
    match = _TAG_RE[name].search(raw or "")
    return match.group(1).strip() if match else ""


def _build_context(docs: list[dict]) -> tuple[str, dict[str, dict]]:
    parts: list[str] = []
    labels: dict[str, dict] = {}
    total = 0
    for index, doc in enumerate(docs):
        label = f"doc_{index}"
        part = f"[{label}] {doc.get('title', '')}\n{doc.get('content', '')}\n"
        if total + len(part) > MAX_CONTEXT_CHARS:
            break
        parts.append(part)
        labels[label] = doc
        total += len(part)
    return "\n---\n".join(parts), labels


def _patient_context(state: AgentState) -> str:
    profile = state.get("patient_profile", {})
    profile_parts = []
    if profile.get("age"):
        profile_parts.append(f"Tuổi: {profile['age']}")
    if profile.get("primary_condition"):
        profile_parts.append(f"Bệnh chính: {profile['primary_condition']}")
    if profile.get("comorbidities"):
        profile_parts.append(f"Bệnh đồng mắc: {profile['comorbidities']}")
    if profile.get("diagnosed_at"):
        profile_parts.append(f"Thời điểm chẩn đoán: {profile['diagnosed_at']}")
    if profile.get("height_cm"):
        profile_parts.append(f"Chiều cao: {profile['height_cm']} cm")
    if profile.get("weight_kg"):
        profile_parts.append(f"Cân nặng: {profile['weight_kg']} kg")
    profile_text = "; ".join(profile_parts) if profile_parts else "Không có hồ sơ liên quan."
    routine_text = format_routine_memory(state.get("patient_routine", []))
    return f"Hồ sơ: {profile_text}\nRoutine tự khai:\n{routine_text}"


def _cited_labels(answer: str, labels: dict[str, dict]) -> list[str]:
    seen: set[str] = set()
    cited: list[str] = []
    for match in _DOC_MARKER_RE.finditer(answer):
        label = match.group(1).lower()
        if label in labels and label not in seen:
            seen.add(label)
            cited.append(label)
    return cited


def _sentence_for_label(answer: str, label: str) -> str:
    index = answer.find(f"[{label}]")
    if index == -1:
        return ""
    start = 0
    for boundary in _SENTENCE_BOUNDARY_RE.finditer(answer, 0, index):
        start = boundary.end()
    end = _SENTENCE_BOUNDARY_RE.search(answer, index)
    return answer[start : end.end() if end else len(answer)].strip()


def _citations(answer: str, labels: dict[str, dict], cited: list[str]) -> list[dict]:
    # Keep one citation for every marker label.  The API later renumbers
    # ``[doc_N]`` markers from this exact list; deduplicating a same-chunk label
    # here left an unreplaced marker in the answer and made answer/source views
    # disagree. Retrieval IDs are already unique in normal Chroma results.
    return [
        {
            "doc_id": label,
            "document_id": labels[label].get("document_id") or None,
            # A legacy/hand-built retrieved doc may not carry these fields.
            # Keep that citation viewable as a plain source card instead of
            # constructing a broken /sources/ URL in the client.
            "chunk_id": labels[label].get("chunk_id") or labels[label].get("doc_id") or None,
            "title": labels[label].get("title", ""),
            "source": labels[label].get("source", ""),
            "issuer": labels[label].get("issuer") or "Cơ sở y tế",
            "doc_code": labels[label].get("doc_code"),
            "url": labels[label].get("url"),
            "snippet": (_sentence_for_label(answer, label) or labels[label].get("content", ""))[:MAX_SNIPPET_CHARS],
        }
        for label in cited
    ]


def _parse(raw: str, labels: dict[str, dict]) -> tuple[str, str, str, bool, list[dict]]:
    """Parse strict output. Bất kỳ format/grounding lỗi nào đều là no_support."""
    analysis = _tag_content(raw, "analysis")
    answer = _tag_content(raw, "answer")
    verdict = _tag_content(raw, "verdict")

    support_match = _SUPPORT_RE.search(verdict)
    answered_match = _ANSWERED_RE.search(verdict)
    support_level = support_match.group(1).lower() if support_match else "no_support"
    answers_question = bool(answered_match and answered_match.group(1).lower() == "true")

    cited = _cited_labels(answer, labels)
    markers = [match.group(1).lower() for match in _DOC_MARKER_RE.finditer(answer)]
    has_invalid_marker = any(marker not in labels for marker in markers)
    if support_level not in {"fully", "partially", "no_support"}:
        support_level = "no_support"
    if not answer or not cited or has_invalid_marker or not answers_question:
        support_level = "no_support"
        answers_question = False
        answer = ""
        cited = []
    elif support_level == "partially" and DISCLAIMER_PARTIAL not in answer:
        answer = f"{answer.rstrip()}\n\n{DISCLAIMER_PARTIAL}"
    elif support_level == "no_support":
        answer = ""
        cited = []

    return analysis, answer, support_level, answers_question, _citations(answer, labels, cited)


async def generate_and_verify_node(state: AgentState) -> AgentState:
    """Sinh answer + verdict; lỗi provider luôn fail-safe về doctor_referral."""
    query = state.get("preprocessed_query") or state.get("query", "")
    context, labels = _build_context(state.get("retrieved_docs", []))
    if not labels:
        return {
            **state,
            "response": "",
            "citations": [],
            "support_level": "no_support",
            "answers_question": False,
        }

    settings = get_settings()
    rag_settings = get_rag_settings()
    generation_audit = {
        "provider": settings.llm_provider,
        "model": settings.model_for(settings.llm_provider),
        "temperature": rag_settings.generation_temperature,
    }

    try:
        chain = get_quality_llm_with_fallback(lambda llm: generate_and_verify_prompt | llm)
        async with asyncio.timeout(settings.llm_quality_total_timeout_seconds):
            result = await chain.ainvoke(
                {
                    "query": query,
                    "context": context,
                    "patient_context": _patient_context(state),
                    "task_kind": state.get("task_kind", "health_education"),
                }
            )
        analysis, answer, support_level, answers_question, citations = _parse(result.content, labels)
    except TimeoutError:
        logger.error("[generate_and_verify] quality chain timed out; withholding answer")
        analysis, answer, support_level, answers_question, citations = "", "", "no_support", False, []
    except Exception as exc:
        logger.error("[generate_and_verify] LLM failed; withholding answer: %s", exc)
        analysis, answer, support_level, answers_question, citations = "", "", "no_support", False, []

    logger.info(
        "[generate_and_verify] support=%s | answers_question=%s | citations=%d",
        support_level,
        answers_question,
        len(citations),
    )
    return {
        **state,
        "analysis": analysis,
        "response": answer,
        "citations": citations,
        "support_level": support_level,
        "answers_question": answers_question,
        "metadata": {
            **state.get("metadata", {}),
            "generation": generation_audit,
        },
    }
