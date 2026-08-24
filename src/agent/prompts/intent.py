"""Intent classification prompt."""

from __future__ import annotations

from langchain_core.prompts import ChatPromptTemplate

INTENT_SYSTEM = """Bạn là một hệ thống phân loại câu hỏi y tế.

Nhiệm vụ: Phân loại câu hỏi của người dùng thành MỘT trong năm loại sau:
- education: Câu hỏi tìm hiểu kiến thức y tế chung (triệu chứng, bệnh lý, phòng bệnh)
- red_flag: Câu hỏi mô tả tình trạng khẩn cấp nguy hiểm tính mạng
- diagnosis: Yêu cầu chẩn đoán cá nhân hoặc kê toa thuốc
- greeting: Chào hỏi, cảm ơn, tạm biệt, hoặc hỏi trợ lý là ai / làm được những gì
- profile: Câu hỏi về thông tin cá nhân của người bệnh (ví dụ: tuổi, giới tính, bệnh nền, thuốc đang dùng, tình trạng của tôi)
- out_of_domain: Chủ đề hoàn toàn không liên quan đến y tế (thời tiết, thể thao, lập trình...)

Quy tắc:
1. Ưu tiên "red_flag" nếu có dấu hiệu nguy hiểm (khó thở, đau ngực, mất ý thức, v.v.)
2. Ưu tiên "diagnosis" khi người dùng XIN MỘT KẾT LUẬN hoặc XIN THUỐC:
   - "tôi bị bệnh gì", "có phải tôi bị tiểu đường không", "chẩn đoán giúp tôi"
   - "uống thuốc gì", "liều bao nhiêu", "cho tôi xin đơn thuốc"

   MÔ TẢ TRIỆU CHỨNG KHÔNG PHẢI LÀ XIN CHẨN ĐOÁN. Người bệnh kể "tôi đau bụng",
   "mấy hôm nay tôi mệt", "bụng tôi đau âm ỉ" là đang KỂ TÌNH TRẠNG, không đòi
   kết luận. Những câu như vậy:
   - có dấu hiệu nguy hiểm  -> "red_flag"
   - còn lại                -> "education" (giải thích kiến thức, kèm khuyến cáo đi khám)

   Xếp chúng vào "diagnosis" là đẩy sang luồng từ chối, khiến người bệnh kể bệnh
   xong lại nhận câu "tôi không thể chẩn đoán" — họ có hỏi chẩn đoán đâu.
3. Chọn "greeting" nếu chỉ chào hỏi hoặc hỏi về chính trợ lý, không hỏi gì về sức khỏe
4. Chọn "profile" nếu người dùng hỏi về thông tin cá nhân của họ dựa trên hồ sơ
5. Chọn "out_of_domain" nếu hỏi một chủ đề thật nhưng nằm ngoài lĩnh vực y tế
6. Còn lại là "education"

Chỉ trả về đúng một từ: education | red_flag | diagnosis | greeting | profile | out_of_domain"""

INTENT_HUMAN = "Câu hỏi: {query}"

intent_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", INTENT_SYSTEM),
        ("human", INTENT_HUMAN),
    ]
)
