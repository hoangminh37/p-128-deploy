"""Node: safety_disclaimer — gắn cảnh báo y tế, mức nặng nhẹ theo độ bám nguồn.

Node này nhận HAI mức khác nhau, và cố ý nói khác nhau:

``partially``  — phần lớn câu trả lời có nguồn, vài ý chưa đối chiếu được.
``no_support`` — Self-RAG không xác nhận được ý nào bám vào tài liệu đã duyệt.

Trước ngày 24/08/2026, ``no_support`` bị chặn hẳn ở ``doctor_referral`` và người
bệnh không đọc được gì. Nay câu trả lời vẫn được gửi đi — xem ``route_selfrag``
trong src/agent/graph.py để biết lý do và cả cái giá phải trả.

Đúng vì thế mà hai mức KHÔNG được dùng chung một câu cảnh báo. Một câu chung
chung cho cả hai làm người bệnh không phân biệt được "gần như chắc chắn" với
"chưa kiểm chứng được gì" — mà đó lại là khác biệt quan trọng nhất với họ.
"""

from __future__ import annotations

from src.agent.state import AgentState
from src.core.logging import get_logger

logger = get_logger(__name__)

#: Phần lớn nội dung có nguồn, chỉ vài ý chưa đối chiếu được.
DISCLAIMER_PARTIAL = (
    "\n\n---\n"
    "⚠️ **Lưu ý:** Một vài ý ở trên chưa đối chiếu được với tài liệu đã duyệt. "
    "Thông tin mang tính giáo dục, hãy hỏi bác sĩ trước khi áp dụng."
)

#: Không xác nhận được ý nào bám vào tài liệu. Nói thẳng điều đó, và nói rõ
#: PHẦN NÀO của câu hỏi nằm ngoài thư viện — thông báo cũ chỉ nói trống không
#: "thư viện chưa có tài liệu về chủ đề này", vừa sai vừa khiến người bệnh
#: tưởng mình hỏi sai.
DISCLAIMER_NO_SUPPORT = (
    "\n\n---\n"
    "⚠️ **Hãy đọc phần này trước khi làm theo.**\n\n"
    "Thư viện tài liệu của tôi hiện chỉ có hướng dẫn đã được duyệt cho "
    "**đái tháo đường típ 2** và **tăng huyết áp ở người trưởng thành**. "
    "Câu trả lời trên tôi **chưa đối chiếu được** với tài liệu nào trong đó — "
    "có thể vì câu hỏi của bạn còn nhắc tới bệnh khác, hoặc tới lứa tuổi mà "
    "thư viện chưa bao phủ.\n\n"
    "Nghĩa là: hãy coi đây là **thông tin tham khảo để bạn biết đường hỏi bác sĩ**, "
    "không phải hướng dẫn để làm theo. Đặc biệt với trẻ em, người có bệnh tim, "
    "hoặc người đang dùng nhiều loại thuốc — chế độ ăn và vận động phải do bác sĩ "
    "điều trị quyết định."
)


async def safety_disclaimer_node(state: AgentState) -> AgentState:
    """Node 12 — gắn cảnh báo vào cuối câu trả lời, mức tuỳ ``support_level``."""
    response = state.get("response", "")
    level = state.get("support_level", "partially")

    canh_bao = DISCLAIMER_NO_SUPPORT if level == "no_support" else DISCLAIMER_PARTIAL
    logger.info("[safety_disclaimer] gắn cảnh báo mức=%s", level)

    return {
        **state,
        "response": response + canh_bao,
        "metadata": {
            **state.get("metadata", {}),
            "has_disclaimer": True,
            "disclaimer_level": level,
        },
    }
