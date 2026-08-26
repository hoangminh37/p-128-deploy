"""Node: doctor_referral — fallback khi không có tài liệu liên quan."""

from __future__ import annotations

from src.agent.state import AgentState
from src.core.logging import get_logger

logger = get_logger(__name__)

REFERRAL_RESPONSE = """Thư viện tài liệu của tôi chưa có đủ thông tin để trả lời chính xác câu hỏi này của bạn.

Tôi chỉ trả lời dựa trên các tài liệu y khoa đã được biên tập viên duyệt, và tôi không đoán khi tài liệu chưa nói rõ — với chuyện sức khoẻ thì một câu trả lời chắp vá còn nguy hiểm hơn là không trả lời.

Bạn nên làm gì tiếp:
- 👨‍⚕️ Hỏi trực tiếp bác sĩ hoặc dược sĩ có chuyên môn — họ nắm được tình trạng cụ thể của bạn
- 📞 Đường dây tư vấn sức khoẻ: 1800 599 920 (miễn phí, 24/7)
- 🏥 Hoặc đến phòng khám / bệnh viện gần nhất nếu bạn thấy lo lắng

Bạn cũng có thể thử hỏi lại theo cách khác, hoặc hỏi tôi một câu về chủ đề gần với vấn đề của bạn — biết đâu thư viện có tài liệu nói về phần đó."""


async def doctor_referral_node(state: AgentState) -> AgentState:
    """Node 8 — Doctor Referral fallback.

    Kích hoạt khi không có tài liệu, hoặc khi generate_and_verify xác định câu
    trả lời lạc đề / không đủ nguồn. Các tình huống đều quy về "kho tài liệu
    không đủ để trả lời".

    Template cố định, không gọi LLM. Đặt intent = "doctor_referral" để API map
    được sang status "referral" cho frontend — thiếu dòng này thì câu từ chối
    bị gắn nhãn "answered" và hiện ra như một câu trả lời bình thường.
    """
    logger.info("[doctor_referral] không đủ tài liệu cho câu hỏi hiện tại")

    return {
        **state,
        "response": REFERRAL_RESPONSE,
        "intent": "doctor_referral",
        "support_level": "no_support",
        "citations": [],
        "metadata": {**state.get("metadata", {}), "node": "doctor_referral"},
    }
