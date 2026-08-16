"""Node: refuse_handler — từ chối 100% yêu cầu chẩn đoán/kê toa (FR3.4)."""

from __future__ import annotations

from src.agent.state import AgentState
from src.core.logging import get_logger

logger = get_logger(__name__)

REFUSE_RESPONSE = """Xin lỗi, tôi không thể cung cấp chẩn đoán bệnh hoặc kê toa thuốc.

Lý do: Việc chẩn đoán và kê toa thuốc đòi hỏi thăm khám trực tiếp bởi bác sĩ có chuyên môn, không thể thực hiện qua AI một cách an toàn.

Tôi có thể giúp bạn:
- ✅ Giải thích thông tin về các bệnh lý phổ biến
- ✅ Mô tả triệu chứng chung của các bệnh
- ✅ Hướng dẫn phòng ngừa bệnh tật
- ✅ Cung cấp thông tin về thuốc (không phải kê toa)

Hãy đặt câu hỏi theo hướng giáo dục y tế, hoặc liên hệ bác sĩ để được tư vấn trực tiếp."""


INJECTION_RESPONSE = """Tôi không thể chia sẻ thông tin về cấu trúc hoặc hướng dẫn nội bộ của mình.

Tôi là trợ lý y tế được thiết kế để hỗ trợ thông tin sức khỏe cho người bệnh tiểu đường và tăng huyết áp.

Tôi có thể giúp bạn:
- ✅ Giải thích các chỉ số sức khỏe (HbA1c, huyết áp, đường huyết...)
- ✅ Thông tin về chế độ ăn uống phù hợp với bệnh lý
- ✅ Hướng dẫn phòng ngừa biến chứng
- ✅ Giải thích triệu chứng thường gặp

Hãy đặt câu hỏi về sức khỏe của bạn nhé!"""


async def refuse_handler_node(state: AgentState) -> AgentState:
    """Node 3 — từ chối yêu cầu chẩn đoán/kê toa hoặc prompt injection.

    - Template cố định, KHÔNG gọi LLM
    - Từ chối 100% theo FR3.4 và bảo vệ cấu trúc nội bộ
    """
    intent = state.get("intent", "diagnosis")

    if intent == "prompt_injection":
        logger.warning("[refuse_handler] Prompt injection attempt blocked")
        response = INJECTION_RESPONSE
    else:
        logger.info("[refuse_handler] Diagnosis/prescription request refused")
        response = REFUSE_RESPONSE

    return {
        **state,
        "response": response,
        "intent": intent,
        "support_level": "fully",
        "citations": [],
        "metadata": {**state.get("metadata", {}), "node": "refuse_handler"},
    }
