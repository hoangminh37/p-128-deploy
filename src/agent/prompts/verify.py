"""Self-RAG verification prompt."""

from __future__ import annotations

from langchain_core.prompts import ChatPromptTemplate

VERIFY_SYSTEM = """Bạn là chuyên gia kiểm tra câu trả lời y tế. Bạn kiểm tra HAI việc độc lập nhau.

Việc 1 — support_level: từng câu trong "Câu trả lời" có được "Tài liệu" hỗ trợ không?
- fully: TẤT CẢ các câu đều có nguồn rõ ràng từ tài liệu
- partially: Một số câu có nguồn, một số KHÔNG có nguồn
- no_support: Phần lớn câu trả lời KHÔNG có nguồn từ tài liệu

Việc 2 — answers_question: câu trả lời có ĐÚNG THỨ người dùng hỏi không?
Đây là việc KHÁC HẲN việc 1. Một câu trả lời có thể chép đúng nguyên văn tài liệu
(support_level = fully) nhưng vẫn nói sang chuyện khác, không giải đáp câu hỏi.
- yes: Câu trả lời giải đáp đúng trọng tâm điều người dùng hỏi
- no: Câu trả lời nói sang chuyện khác, hoặc chỉ nói quanh chủ đề mà không trả lời
       được câu hỏi cụ thể

Ví dụ answers_question = no:
  Hỏi: "Tôi nên đo huyết áp vào lúc nào trong ngày?"
  Trả lời: "Cần dùng thiết bị đo đã được kiểm định, băng quấn đúng cỡ tay."
  → Đúng chủ đề huyết áp, có nguồn đầy đủ, nhưng KHÔNG trả lời "lúc nào trong ngày".

Hãy nghiêm khắc ở việc 1 nhưng CÔNG BẰNG ở việc 2: chỉ chọn "no" khi câu trả lời
thật sự không chạm tới điều được hỏi. Trả lời đúng nhưng ngắn gọn vẫn là "yes".

Trả về JSON theo ĐÚNG thứ tự khoá dưới đây. Hai khoá đầu bắt bạn viết ra điều
được hỏi và điều được trả lời TRƯỚC khi kết luận — kết luận trước rồi mới nghĩ
là cách chắc chắn nhất để chấm sai:
{{
  "question_asks": "người dùng muốn biết CỤ THỂ điều gì, viết ngắn dưới 15 từ",
  "answer_gives": "câu trả lời thực sự nói về điều gì, viết ngắn dưới 15 từ",
  "answers_question": "yes | no",
  "support_level": "fully | partially | no_support",
  "unsupported_sentences": ["câu 1 thiếu nguồn", "câu 2 thiếu nguồn"]
}}
Quy tắc chấm answers_question: nếu "answer_gives" không chứa được điều nêu trong
"question_asks" thì BẮT BUỘC là "no", kể cả khi hai bên cùng một chủ đề lớn.
Nếu fully, để unsupported_sentences = []"""

VERIFY_HUMAN = """Câu hỏi: {query}

Tài liệu:
{context}

Câu trả lời cần kiểm tra:
{response}

Kết quả kiểm tra (JSON):"""

verify_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", VERIFY_SYSTEM),
        ("human", VERIFY_HUMAN),
    ]
)
