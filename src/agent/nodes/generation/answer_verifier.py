"""Independent answer verifier — fail closed before an answer reaches the API."""

from __future__ import annotations

import asyncio
import re

from src.agent.nodes.generation.generate_and_verify import _build_context
from src.agent.prompts.answer_verifier import answer_verifier_prompt
from src.agent.state import AgentState
from src.core.config import get_settings
from src.core.logging import get_logger
from src.services.llm.factory import get_quality_llm_with_fallback

logger = get_logger(__name__)

_VERIFICATION_RE = re.compile(
    r"<\s*verification\s*>(.*?)<\s*/\s*verification\s*>",
    re.DOTALL | re.IGNORECASE,
)
_DECISION_RE = re.compile(r"decision\s*:\s*(pass|fail)", re.IGNORECASE)
_REASON_RE = re.compile(r"reason\s*:\s*(.+)", re.IGNORECASE)


def _parse_verification(raw: str) -> tuple[bool, str]:
    """Parse the verifier's narrow contract; malformed output never passes."""
    section = _VERIFICATION_RE.search(raw or "")
    if not section:
        return False, "Kết quả kiểm chứng không đúng định dạng."
    content = section.group(1).strip()
    decision = _DECISION_RE.search(content)
    reason = _REASON_RE.search(content)
    if not decision or decision.group(1).lower() != "pass":
        return False, (reason.group(1).strip() if reason else "Nguồn chưa đủ khớp với câu hỏi.")[:160]
    return True, (reason.group(1).strip() if reason else "Đã kiểm chứng độc lập.")[:160]


async def answer_verifier_node(state: AgentState) -> AgentState:
    """Approve only an independently grounded, on-topic answer.

    ``generate_and_verify`` still checks strict output/citations. This node is
    deliberately a separate model call so a model cannot approve its own
    interpretation. Any error or uncertain verdict becomes ``no_support``.
    """
    answer = state.get("response", "")
    context, labels = _build_context(state.get("retrieved_docs", []))
    if not answer or not labels:
        return {
            **state,
            "response": "",
            "citations": [],
            "support_level": "no_support",
            "answers_question": False,
            "metadata": {
                **state.get("metadata", {}),
                "answer_verification": {"decision": "fail", "reason": "Không có câu trả lời đủ điều kiện kiểm."},
            },
        }

    try:
        chain = get_quality_llm_with_fallback(lambda llm: answer_verifier_prompt | llm)
        async with asyncio.timeout(get_settings().llm_quality_total_timeout_seconds):
            result = await chain.ainvoke(
                {
                    "original_query": state.get("query", ""),
                    "query": state.get("preprocessed_query") or state.get("query", ""),
                    "answer": answer,
                    "context": context,
                }
            )
        approved, reason = _parse_verification(str(result.content))
    except TimeoutError:
        logger.error("[answer_verifier] quality chain timed out; withholding answer")
        approved, reason = False, "Không thể hoàn tất kiểm chứng trong thời gian cho phép."
    except Exception as exc:
        logger.error("[answer_verifier] LLM failed; withholding answer: %s", exc)
        approved, reason = False, "Không thể hoàn tất kiểm chứng độc lập."

    verification = {"decision": "pass" if approved else "fail", "reason": reason}
    logger.info("[answer_verifier] decision=%s", verification["decision"])
    metadata = {**state.get("metadata", {}), "answer_verification": verification}
    if approved:
        return {**state, "metadata": metadata}

    return {
        **state,
        "response": "",
        "citations": [],
        "support_level": "no_support",
        "answers_question": False,
        "metadata": metadata,
    }
