"""Node: out_of_domain_handler — xử lý câu chào hỏi hoặc câu ngoài phạm vi."""

from __future__ import annotations

from src.agent.state import AgentState
from src.core.logging import get_logger

logger = get_logger(__name__)

# Chào hỏi / hỏi trợ lý là ai — người dùng đang thăm dò xem hỏi được những gì,
# nên câu trả lời phải nói rõ năng lực và gợi ý câu hỏi mẫu.
GREETING_RESPONSE = """Xin chào! Tôi là Trợ lý Sức khoẻ AI.

Tôi giúp bạn tra cứu thông tin sức khoẻ dựa trên các tài liệu y khoa đã được biên tập viên duyệt, và luôn kèm nguồn để bạn kiểm chứng. Bạn có thể hỏi tôi về:

- Cách theo dõi và chăm sóc bệnh mạn tính (tăng huyết áp, tiểu đường...)
- Chế độ ăn uống, vận động, lối sống lành mạnh
- Ý nghĩa của các chỉ số và cách chuẩn bị trước khi đi khám

Có ba việc tôi không làm: chẩn đoán bệnh cho bạn, kê toa hay chỉnh liều thuốc, và thay thế bác sĩ trong tình huống cấp cứu.

Bạn muốn tìm hiểu điều gì về sức khoẻ hôm nay?"""

# Câu hỏi thật nhưng ngoài lĩnh vực y tế (thời tiết, thể thao...) — nói thẳng là
# ngoài phạm vi rồi kéo về đúng việc, không vòng vo.
OFF_TOPIC_RESPONSE = """Câu hỏi này nằm ngoài phạm vi của tôi — tôi chỉ tra cứu được các tài liệu về sức khoẻ và y tế.

Bạn có thể hỏi tôi về cách chăm sóc bệnh mạn tính, chế độ ăn uống và vận động, hoặc cách chuẩn bị trước khi đi khám. Tôi luôn trả lời kèm nguồn tài liệu để bạn kiểm chứng.

Bạn cần tôi giúp gì về sức khoẻ không?"""


async def out_of_domain_handler_node(state: AgentState) -> AgentState:
    """Node xử lý câu chào hỏi hoặc câu hỏi không liên quan đến y tế.

    - Template cố định, KHÔNG gọi LLM
    - Phân biệt hai tình huống qua ``ood_kind``: chào hỏi thì giới thiệu năng
      lực, ngoài phạm vi thì nói rõ giới hạn. Gộp chung một câu sẽ khiến người
      chào hỏi tưởng mình vừa bị từ chối.
    """
    ood_kind = state.get("ood_kind") or ("greeting" if state.get("intent") == "greeting" else "off_topic")
    is_greeting = ood_kind == "greeting"

    logger.info("[out_of_domain_handler] kind=%s", ood_kind)

    return {
        **state,
        "response": GREETING_RESPONSE if is_greeting else OFF_TOPIC_RESPONSE,
        "intent": "greeting" if is_greeting else "out_of_domain",
        "ood_kind": ood_kind,
        "support_level": "fully",
        "citations": [],
        "metadata": {**state.get("metadata", {}), "node": "out_of_domain_handler"},
    }
