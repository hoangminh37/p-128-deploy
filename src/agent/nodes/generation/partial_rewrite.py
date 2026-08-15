"""Node: partial_rewrite — điều khiển retry loop khi response chưa đủ nguồn."""
from __future__ import annotations

from src.agent.state import AgentState
from src.core.logging import get_logger

logger = get_logger(__name__)

MAX_RETRIES = 2


async def partial_rewrite_node(state: AgentState) -> AgentState:
    """Node 11 — xử lý khi support_level = partially.

    Logic:
    - retry_count < MAX_RETRIES → tăng counter, routing sẽ loop về hybrid_retrieval
    - retry_count >= MAX_RETRIES → cho qua (routing sẽ đi memory_checkpoint)

    Note: Node này chỉ cập nhật state, routing logic nằm ở graph.py.
    """
    retry_count = state.get("retry_count", 0) + 1
    unsupported = state.get("unsupported_sentences", [])

    logger.info("[partial_rewrite] retry=%d/%d | unsupported=%d sentences",
                retry_count, MAX_RETRIES, len(unsupported))

    # Cập nhật query để tìm kiếm tốt hơn (focus vào phần thiếu nguồn)
    if unsupported and retry_count <= MAX_RETRIES:
        focus = " ".join(unsupported[:2])[:200]  # lấy 2 câu đầu thiếu nguồn
        rewritten = f"{state.get('rewritten_query', state.get('query', ''))} {focus}"
    else:
        rewritten = state.get("rewritten_query", state.get("query", ""))

    return {
        **state,
        "retry_count": retry_count,
        "rewritten_query": rewritten,
    }
