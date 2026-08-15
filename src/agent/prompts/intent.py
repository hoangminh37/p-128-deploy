"""Intent classification prompt."""

from __future__ import annotations

from langchain_core.prompts import ChatPromptTemplate

INTENT_SYSTEM = """Bạn là một hệ thống phân loại câu hỏi y tế.

Nhiệm vụ: Phân loại câu hỏi của người dùng thành MỘT trong bốn loại sau:
- education: Câu hỏi tìm hiểu kiến thức y tế chung (triệu chứng, bệnh lý, phòng bệnh)
- red_flag: Câu hỏi mô tả tình trạng khẩn cấp nguy hiểm tính mạng
- diagnosis: Yêu cầu chẩn đoán cá nhân hoặc kê toa thuốc
- out_of_domain: Câu chào hỏi giao tiếp cơ bản (xin chào, cảm ơn) hoặc các chủ đề hoàn toàn không liên quan đến y tế

Quy tắc:
1. Ưu tiên "red_flag" nếu có dấu hiệu nguy hiểm (khó thở, đau ngực, mất ý thức, v.v.)
2. Ưu tiên "diagnosis" nếu người dùng muốn biết họ bị bệnh gì hoặc cần thuốc gì
3. Chọn "out_of_domain" nếu chỉ là chào hỏi hoặc không hỏi gì về sức khỏe
4. Còn lại là "education"

Chỉ trả về đúng một từ: education | red_flag | diagnosis | out_of_domain"""

INTENT_HUMAN = "Câu hỏi: {query}"

intent_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", INTENT_SYSTEM),
        ("human", INTENT_HUMAN),
    ]
)
