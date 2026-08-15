"""Node: llm_generate — CoT generation với JSON schema output."""

from __future__ import annotations

import json
import re

from src.agent.prompts.generate import generate_prompt
from src.agent.state import AgentState
from src.core.logging import get_logger
from src.services.llm.factory import get_quality_llm

logger = get_logger(__name__)

MAX_CONTEXT_CHARS = 6000  # giới hạn context để tránh vượt context window


def _build_context(relevant_strips: list[dict]) -> str:
    """Format docs thành context string cho prompt."""
    parts = []
    total = 0
    for doc in relevant_strips:
        chunk = f"[{doc['doc_id']}] {doc.get('title', '')}\n{doc['content']}\n"
        if total + len(chunk) > MAX_CONTEXT_CHARS:
            break
        parts.append(chunk)
        total += len(chunk)
    return "\n---\n".join(parts)


def _parse_llm_response(raw: str) -> dict:
    """Parse JSON từ LLM output, fallback nếu malformed."""
    import re
    # 1. Tìm block JSON (đôi khi LLM bọc trong ```json ... ```)
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    json_str = match.group() if match else raw
    
    # 2. Thử parse trực tiếp
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        pass
        
    # 3. Chữa cháy: LLM thường hay quên escape newline (xuống dòng thật trong chuỗi)
    # Thay thế các newline bên trong ngoặc kép bằng \n
    try:
        # Regex tìm chuỗi "..." và replace newline bên trong
        def replace_newlines(m):
            return m.group(0).replace('\n', '\\n')
        repaired_str = re.sub(r'"(?:\\"|[^"])*"', replace_newlines, json_str, flags=re.DOTALL)
        return json.loads(repaired_str)
    except json.JSONDecodeError:
        pass
        
    # 4. Fallback mạnh nhất: Dùng Regex trích xuất trường "answer" trực tiếp
    ans_match = re.search(r'"answer"\s*:\s*"(.*?)"(?:\s*,|\s*\})', json_str, re.DOTALL)
    answer = ans_match.group(1).replace('\\n', '\n') if ans_match else raw.strip()
    
    return {"analysis": "", "answer": answer, "claims": []}


async def llm_generate_node(state: AgentState) -> AgentState:
    """Node 9 — LLM Generation với Chain-of-Thought.

    Input: relevant_strips (đã qua CRAG filter)
    Output: analysis (CoT), response (answer), citations
    """
    query = state.get("rewritten_query") or state.get("query", "")
    relevant_strips = state.get("relevant_strips", [])

    context = _build_context(relevant_strips)
    logger.info("[llm_generate] query=%.60s | docs=%d", query, len(relevant_strips))

    try:
        llm = get_quality_llm()
        chain = generate_prompt | llm
        result = await chain.ainvoke({"query": query, "context": context})
        parsed = _parse_llm_response(result.content)

        # Build citations từ claims
        doc_map = {d["doc_id"]: d for d in relevant_strips}
        citations = []
        for claim in parsed.get("claims", []):
            doc_id = claim.get("cited_doc_id", "")
            if doc_id in doc_map:
                doc = doc_map[doc_id]
                citations.append(
                    {
                        "doc_id": doc_id,
                        "title": doc.get("title", ""),
                        "source": doc.get("source", ""),
                        "snippet": claim.get("sentence", "")[:200],
                    }
                )

        return {
            **state,
            "analysis": parsed.get("analysis", ""),
            "response": parsed.get("answer", ""),
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
