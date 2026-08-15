"""Node: refuse_handler — từ chối 100% yêu cầu chẩn đoán/kê toa (FR3.4)."""
from __future__ import annotations

from src.agent.state import AgentState
from src.core.logging import get_logger

logger = get_logger(__name__)

REFUSE_RESPONSE = """Xin lỗi, tôi **không thể** cung cấp chẩn đoán bệnh hoặc kê toa thuốc.

**Lý do:** Việc chẩn đoán và kê toa thuốc đòi hỏi thăm khám trực tiếp bởi bác sĩ có chuyên môn, \
không thể thực hiện qua AI một cách an toàn.

**Tôi có thể giúp bạn:**
- ✅ Giải thích thông tin về các bệnh lý phổ biến
- ✅ Mô tả triệu chứng chung của các bệnh
- ✅ Hướng dẫn phòng ngừa bệnh tật
- ✅ Cung cấp thông tin về thuốc (không phải kê toa)

Hãy đặt câu hỏi theo hướng giáo dục y tế, hoặc **liên hệ bác sĩ** để được tư vấn trực tiếp."""


async def refuse_handler_node(state: AgentState) -> AgentState:
    """Node 3 — từ chối yêu cầu chẩn đoán/kê toa.

    - Template cố định, KHÔNG gọi LLM
    - Từ chối 100% theo FR3.4
    """
    logger.info("[refuse_handler] Diagnosis/prescription request refused")

    return {
        **state,
        "response": REFUSE_RESPONSE,
        "intent": "diagnosis",
        "support_level": "fully",
        "citations": [],
        "metadata": {**state.get("metadata", {}), "node": "refuse_handler"},
    }
