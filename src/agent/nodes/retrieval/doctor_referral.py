"""Node: doctor_referral — fallback khi không có tài liệu liên quan."""

from __future__ import annotations

from src.agent.state import AgentState
from src.core.logging import get_logger

logger = get_logger(__name__)

REFERRAL_RESPONSE = """Xin lỗi, tôi không tìm thấy đủ thông tin trong cơ sở dữ liệu y tế để \
trả lời câu hỏi của bạn một cách chính xác.

**Khuyến nghị:**
- 👨‍⚕️ Hãy liên hệ trực tiếp với bác sĩ hoặc cơ sở y tế để được tư vấn chuyên sâu
- 📞 Đường dây hỗ trợ y tế: **1800 599 920** (miễn phí, 24/7)
- 🏥 Hoặc đến phòng khám/bệnh viện gần nhất

Tôi có thể giúp bạn với các câu hỏi y tế tổng quát khác — hãy thử diễn đạt lại câu hỏi."""


async def doctor_referral_node(state: AgentState) -> AgentState:
    """Node 8 — Doctor Referral fallback.

    Kích hoạt khi: relevant_strips = [] sau CRAG evaluation.
    - Template cố định, không gọi LLM
    - Hướng dẫn người dùng tìm bác sĩ thực
    """
    query = state.get("query", "")
    logger.info("[doctor_referral] no relevant docs for query=%.60s", query)

    return {
        **state,
        "response": REFERRAL_RESPONSE,
        "support_level": "no_support",
        "citations": [],
        "metadata": {**state.get("metadata", {}), "node": "doctor_referral"},
    }
