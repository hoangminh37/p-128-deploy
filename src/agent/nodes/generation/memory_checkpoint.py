"""Node: memory_checkpoint — finalize state (MVP: in-memory, no DB)."""

from __future__ import annotations

import time

from src.agent.state import AgentState
from src.core.logging import get_logger

logger = get_logger(__name__)


async def memory_checkpoint_node(state: AgentState) -> AgentState:
    """Finalize pipeline sau khi câu trả lời đã qua gate generate-and-verify.

    MVP: Chỉ log + cập nhật metadata (không lưu PostgreSQL/Redis).
    Post-MVP: Lưu Q&A + citations vào PostgreSQL, update Redis session.
    """
    state.get("query", "")
    response = state.get("response", "")
    support_level = state.get("support_level", "fully")
    intent = state.get("intent", "education")

    logger.info(
        "[memory_checkpoint] DONE | intent=%s | support=%s | response_len=%d",
        intent,
        support_level,
        len(response),
    )

    metadata = {
        **state.get("metadata", {}),
        "node": "memory_checkpoint",
        "completed": True,
        "completed_at": time.time(),
        "intent": intent,
        "support_level": support_level,
    }

    return {**state, "metadata": metadata}
