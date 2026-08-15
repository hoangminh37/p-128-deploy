"""Node: emergency_handler — cảnh báo khẩn cấp, KHÔNG lưu PII (FR3.2)."""

from __future__ import annotations

from src.agent.state import AgentState
from src.core.logging import get_logger

logger = get_logger(__name__)

EMERGENCY_RESPONSE = """🚨 **CẢNH BÁO KHẨN CẤP**

Dựa trên mô tả của bạn, đây có thể là tình trạng **nguy hiểm tính mạng** cần được xử lý ngay lập tức.

**Hành động ngay:**
- 📞 Gọi **115** (Cấp cứu) ngay lập tức
- 📞 Hoặc nhờ người đưa đến cơ sở y tế gần nhất
- ❗ Không tự điều trị tại nhà

Tôi là AI và **không thể** thay thế sự chăm sóc y tế khẩn cấp. Hãy liên hệ bác sĩ ngay."""


async def emergency_handler_node(state: AgentState) -> AgentState:
    """Node 2 — xử lý tình trạng khẩn cấp.

    - Trả về response cảnh báo cố định (template)
    - KHÔNG gọi LLM (tốc độ + tính an toàn)
    - KHÔNG lưu PII vào log (FR3.2)
    """
    # KHÔNG log query để bảo vệ PII
    logger.warning("[emergency_handler] Triggered — returning emergency response")

    return {
        **state,
        "response": EMERGENCY_RESPONSE,
        "intent": "red_flag",
        "support_level": "fully",
        "citations": [],
        "metadata": {**state.get("metadata", {}), "node": "emergency_handler"},
    }
