"""Node: query_rewrite — ghép patient profile vào query để tối ưu retrieval."""

from __future__ import annotations

from src.agent.prompts.rewrite import rewrite_prompt
from src.agent.state import AgentState
from src.core.logging import get_logger
from src.services.llm.factory import get_fast_llm

logger = get_logger(__name__)


async def query_rewrite_node(state: AgentState) -> AgentState:
    """Node 5 — viết lại query có kết hợp hồ sơ bệnh nhân.

    Ví dụ:
    resolved_query: "Bệnh tiểu đường type 2 là gì?"
    patient_profile: {age: 55, conditions: ["cao huyết áp"]}
    → rewritten: "Bệnh tiểu đường type 2 ở người cao tuổi có cao huyết áp là gì?"
    """
    resolved_query = state.get("resolved_query") or state.get("query", "")
    patient_profile = state.get("patient_profile", {})

    # Format patient profile cho prompt
    profile_parts = []
    if patient_profile.get("age"):
        profile_parts.append(f"Tuổi: {patient_profile['age']}")
    if patient_profile.get("gender"):
        profile_parts.append(f"Giới tính: {patient_profile['gender']}")
    if patient_profile.get("conditions"):
        profile_parts.append(f"Bệnh nền: {', '.join(patient_profile['conditions'])}")
    if patient_profile.get("medications"):
        profile_parts.append(f"Thuốc đang dùng: {', '.join(patient_profile['medications'])}")

    profile_text = "; ".join(profile_parts) if profile_parts else "Không có thông tin"

    try:
        llm = get_fast_llm()
        chain = rewrite_prompt | llm
        result = await chain.ainvoke(
            {
                "patient_profile": profile_text,
                "resolved_query": resolved_query,
            }
        )
        rewritten = result.content.strip() or resolved_query
        logger.info("[query_rewrite] rewritten: %.80s", rewritten)
        return {**state, "rewritten_query": rewritten}
    except Exception as exc:
        logger.warning("[query_rewrite] failed, using resolved_query: %s", exc)
        return {**state, "rewritten_query": resolved_query}
