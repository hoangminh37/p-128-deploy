"""Node: coref_resolution — giải quyết đại từ tham chiếu trong câu hỏi."""
from __future__ import annotations

from src.agent.prompts.rewrite import coref_prompt
from src.agent.state import AgentState
from src.core.logging import get_logger
from src.services.llm.factory import get_fast_llm

logger = get_logger(__name__)


async def coref_resolution_node(state: AgentState) -> AgentState:
    """Node 4 — resolve đại từ tham chiếu.

    Ví dụ: "Thuốc đó có tác dụng phụ không?" → "Metformin có tác dụng phụ không?"
    """
    query = state.get("query", "")
    messages = state.get("messages", [])

    # Nếu không có lịch sử → bỏ qua, dùng query gốc
    if not messages:
        logger.info("[coref_resolution] No history — skipping")
        return {**state, "resolved_query": query}

    # Format lịch sử hội thoại
    history_text = "\n".join(
        f"{m.get('role', 'user').capitalize()}: {m.get('content', '')}"
        for m in messages[-6:]  # chỉ lấy 6 lượt gần nhất
    )

    try:
        llm = get_fast_llm()
        chain = coref_prompt | llm
        result = await chain.ainvoke({"history": history_text, "query": query})
        resolved = result.content.strip() or query
        logger.info("[coref_resolution] resolved: %.80s", resolved)
        return {**state, "resolved_query": resolved}
    except Exception as exc:
        logger.warning("[coref_resolution] failed, using original query: %s", exc)
        return {**state, "resolved_query": query}
