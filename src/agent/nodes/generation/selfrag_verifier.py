"""Node: selfrag_verifier — kiểm tra từng câu có được hỗ trợ bởi tài liệu."""

from __future__ import annotations

import json
import re

from src.agent.prompts.verify import verify_prompt
from src.agent.state import AgentState
from src.core.logging import get_logger
from src.services.llm.factory import get_quality_llm

logger = get_logger(__name__)


# LLM hay kèm văn xuôi giải thích sau khối JSON ("Lý do: ..."), và đoạn văn đó
# có thể chứa dấu ngoặc nhọn làm regex tham lam nuốt quá tay. Ba regex dưới đây
# đọc thẳng từng trường, dùng khi json.loads thất bại.
_SUPPORT_RE = re.compile(r'"?support_level"?\s*[:=]\s*"?(fully|partially|no_support)', re.IGNORECASE)
_ANSWERS_RE = re.compile(r'"?answers_question"?\s*[:=]\s*"?(yes|no|true|false)', re.IGNORECASE)
_FALSE_VALUES = {"no", "false", "không", "khong"}


def _parse_verify_response(raw: str) -> dict:
    """Đọc kết quả verify. JSON là đường chính, regex từng trường là lưới hứng."""
    # 1. Khối JSON — thử tham lam (tới } cuối) rồi không tham lam (tới } đầu).
    for pattern in (r"\{.*\}", r"\{.*?\}"):
        match = re.search(pattern, raw, re.DOTALL)
        if not match:
            continue
        try:
            parsed = json.loads(match.group())
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and "support_level" in parsed:
            return parsed

    # 2. Bóc từng trường bằng regex. Quan trọng nhất là answers_question: nhánh
    # fallback cũ bỏ trắng trường này, nên mọi câu trả lời lạc đề đều lọt lưới.
    result: dict = {"unsupported_sentences": []}

    support_match = _SUPPORT_RE.search(raw)
    if support_match:
        result["support_level"] = support_match.group(1).lower()
    elif "no_support" in raw.lower():
        result["support_level"] = "no_support"
    elif "partially" in raw.lower():
        result["support_level"] = "partially"
    elif "fully" in raw.lower():
        result["support_level"] = "fully"
    else:
        result["support_level"] = "no_support"

    answers_match = _ANSWERS_RE.search(raw)
    if answers_match:
        result["answers_question"] = answers_match.group(1).lower()

    return result


def _parse_answers_question(parsed: dict) -> bool:
    """Đọc cờ answers_question, mặc định True khi thiếu hoặc không đọc được.

    Fail-open có chủ đích: verifier im lặng thì thà trả lời người dùng còn hơn
    đẩy họ đi gặp bác sĩ vì một lỗi parse.
    """
    value = parsed.get("answers_question", True)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() not in _FALSE_VALUES
    return True


async def selfrag_verifier_node(state: AgentState) -> AgentState:
    """Node 10 — Self-RAG verification.

    Kiểm tra xem response có được hỗ trợ bởi relevant_strips không.
    Output: support_level = fully | partially | no_support
    """
    query = state.get("query", "")
    response = state.get("response", "")
    relevant_strips = state.get("relevant_strips", [])

    if not response:
        return {
            **state,
            "support_level": "no_support",
            "unsupported_sentences": [],
            "answers_question": False,
        }

    # Build context từ relevant strips — nhãn doc_N phải trùng với nhãn
    # llm_generate đã dán, nếu không verifier sẽ tưởng mọi trích dẫn đều sai nguồn.
    context = "\n---\n".join(f"[doc_{i}] {d['content'][:500]}" for i, d in enumerate(relevant_strips[:5]))

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
        answers_question = _parse_answers_question(parsed)

        logger.info(
            "[selfrag_verifier] support_level=%s | answers_question=%s | unsupported=%d",
            support_level,
            answers_question,
            len(unsupported),
        )
        return {
            **state,
            "support_level": support_level,
            "unsupported_sentences": unsupported,
            "answers_question": answers_question,
        }

    except Exception as exc:
        logger.error("[selfrag_verifier] LLM error: %s", exc)
        # Fail-safe: nếu verify lỗi → coi là fully (đã có response)
        return {
            **state,
            "support_level": "fully",
            "unsupported_sentences": [],
            "answers_question": True,
        }
