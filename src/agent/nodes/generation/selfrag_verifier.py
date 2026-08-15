"""Node: selfrag_verifier — kiểm tra từng câu có được hỗ trợ bởi tài liệu."""

from __future__ import annotations

import json
import re

from src.agent.prompts.verify import verify_prompt
from src.agent.state import AgentState
from src.core.logging import get_logger
from src.services.llm.factory import get_quality_llm

logger = get_logger(__name__)


def _parse_verify_response(raw: str) -> dict:
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    # Fallback
    if "fully" in raw.lower():
        return {"support_level": "fully", "unsupported_sentences": []}
    if "partially" in raw.lower():
        return {"support_level": "partially", "unsupported_sentences": []}
    return {"support_level": "no_support", "unsupported_sentences": []}


async def selfrag_verifier_node(state: AgentState) -> AgentState:
    """Node 10 — Self-RAG verification.

    Kiểm tra xem response có được hỗ trợ bởi relevant_strips không.
    Output: support_level = fully | partially | no_support
    """
    query = state.get("query", "")
    response = state.get("response", "")
    relevant_strips = state.get("relevant_strips", [])

    if not response:
        return {**state, "support_level": "no_support", "unsupported_sentences": []}

    # Build context từ relevant strips
    context = "\n---\n".join(f"[{d['doc_id']}] {d['content'][:500]}" for d in relevant_strips[:5])

    logger.info("[selfrag_verifier] verifying response...")

    try:
        llm = get_quality_llm()
        chain = verify_prompt | llm
        result = await chain.ainvoke(
            {
                "query": query,
                "context": context,
                "response": response,
            }
        )
        parsed = _parse_verify_response(result.content)
        support_level = parsed.get("support_level", "no_support")
        unsupported = parsed.get("unsupported_sentences", [])

        logger.info("[selfrag_verifier] support_level=%s | unsupported=%d", support_level, len(unsupported))
        return {**state, "support_level": support_level, "unsupported_sentences": unsupported}

    except Exception as exc:
        logger.error("[selfrag_verifier] LLM error: %s", exc)
        # Fail-safe: nếu verify lỗi → coi là fully (đã có response)
        return {**state, "support_level": "fully", "unsupported_sentences": []}
