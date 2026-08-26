"""V2 preprocessing: gộp coreference resolution và query rewrite."""

from __future__ import annotations

import json
import re

from src.agent.prompts.rewrite import preprocess_prompt
from src.agent.state import AgentState
from src.core.logging import get_logger
from src.services.llm.factory import get_fast_llm
from src.services.routine_memory import format_routine_memory

logger = get_logger(__name__)

_QUERY_RE = re.compile(r"<\s*query\s*>(.*?)<\s*/\s*query\s*>", re.DOTALL | re.IGNORECASE)
_ROUTINE_RE = re.compile(
    r"<\s*routine_updates\s*>(.*?)<\s*/\s*routine_updates\s*>",
    re.DOTALL | re.IGNORECASE,
)


def _format_history(messages: list[dict]) -> str:
    if not messages:
        return "Không có lịch sử hội thoại."
    return "\n".join(
        f"{message.get('role', 'user').capitalize()}: {message.get('content', '')}" for message in messages[-6:]
    )


def _format_profile(profile: dict) -> str:
    values: list[str] = []
    if profile.get("age"):
        values.append(f"Tuổi: {profile['age']}")
    if profile.get("primary_condition"):
        values.append(f"Bệnh chính: {profile['primary_condition']}")
    if profile.get("comorbidities"):
        values.append(f"Bệnh đồng mắc: {profile['comorbidities']}")
    if profile.get("diagnosed_at"):
        values.append(f"Thời điểm chẩn đoán: {profile['diagnosed_at']}")
    if profile.get("height_cm"):
        values.append(f"Chiều cao: {profile['height_cm']} cm")
    if profile.get("weight_kg"):
        values.append(f"Cân nặng: {profile['weight_kg']} kg")
    if profile.get("medications"):
        values.append(f"Thuốc đang dùng: {', '.join(profile['medications'])}")
    return "; ".join(values) if values else "Không có thông tin hồ sơ liên quan."


def _parse_response(raw: str, fallback_query: str) -> tuple[str, list[dict]]:
    """Only structured output can add routine; malformed output stores nothing."""
    query_match = _QUERY_RE.search(raw or "")
    routine_match = _ROUTINE_RE.search(raw or "")
    query = query_match.group(1).strip() if query_match else fallback_query

    if not routine_match:
        return query or fallback_query, []
    try:
        updates = json.loads(routine_match.group(1).strip())
    except json.JSONDecodeError:
        updates = []
    return query or fallback_query, updates if isinstance(updates, list) else []


async def query_preprocessor_node(state: AgentState) -> AgentState:
    """Chuẩn hoá câu hỏi trong một fast-LLM call; lỗi thì an toàn dùng query gốc."""
    query = state.get("query", "")

    try:
        chain = preprocess_prompt | get_fast_llm()
        result = await chain.ainvoke(
            {
                "query": query,
                "history": _format_history(state.get("messages", [])),
                "patient_profile": _format_profile(state.get("patient_profile", {})),
                "patient_routine": format_routine_memory(state.get("patient_routine", [])),
                "task_kind": state.get("task_kind", "health_education"),
            }
        )
        preprocessed, routine_updates = _parse_response(result.content, query)
    except Exception as exc:
        logger.warning("[query_preprocessor] failed; using original query: %s", exc)
        preprocessed = query
        routine_updates = []

    logger.info("[query_preprocessor] query prepared (%d chars)", len(preprocessed))
    return {
        **state,
        "preprocessed_query": preprocessed,
        "routine_updates": routine_updates,
        "metadata": {
            **state.get("metadata", {}),
            "preprocessed_query": preprocessed,
        },
    }
