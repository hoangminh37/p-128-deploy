"""Node: safety_disclaimer — gắn cảnh báo y tế khi no_support (FR#4)."""
from __future__ import annotations

from src.agent.state import AgentState
from src.core.logging import get_logger

logger = get_logger(__name__)

DISCLAIMER = (
    "\n\n---\n"
    "⚠️ **Lưu ý quan trọng:** Thông tin trên mang tính giáo dục và chưa được xác minh "
    "đầy đủ từ tài liệu y tế đáng tin cậy. Vui lòng tham khảo ý kiến bác sĩ hoặc "
    "chuyên gia y tế trước khi áp dụng bất kỳ thông tin nào."
)


async def safety_disclaimer_node(state: AgentState) -> AgentState:
    """Node 12 — gắn disclaimer y tế vào cuối response.

    Kích hoạt khi support_level = no_support (Self-RAG không xác nhận được).
    """
    response = state.get("response", "")
    logger.info("[safety_disclaimer] appending disclaimer to response")

    return {
        **state,
        "response": response + DISCLAIMER,
        "metadata": {**state.get("metadata", {}), "has_disclaimer": True},
    }
