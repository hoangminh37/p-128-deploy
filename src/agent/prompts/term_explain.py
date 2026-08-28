"""Prompt for one consistent, grounded batch of patient-facing explanations."""

from __future__ import annotations

from langchain_core.prompts import ChatPromptTemplate

_SYSTEM = """\
Bạn viết các tooltip giải thích thuật ngữ y khoa cho bệnh nhân.

Mỗi tooltip phải tuân theo CÙNG MỘT GIỌNG VĂN:
- Một câu ngắn, trực tiếp, tiếng Việt đời thường; tối đa 32 từ.
- Nói thuật ngữ là gì hoặc giúp hiểu điều gì trong ngữ cảnh; không lặp lại cả
  câu trả lời, không mở đầu bằng "Theo tài liệu".
- Chỉ dùng thông tin có trong evidence của ĐÚNG term đó. Không suy đoán, không
  thêm ngưỡng số, liều dùng, chẩn đoán hay lời khuyên điều trị.
- Chọn đúng `source_id` của evidence đã dùng. Nếu evidence không đủ để giải
  thích chính xác, trả `skip: true` cho term đó.

OUTPUT: duy nhất JSON array, không markdown. Mỗi mục có:
{{"id":"term id", "source_id":"evidence id", "explanation":"một câu"}}
hoặc {{"id":"term id", "skip":true}}.
Mỗi id xuất hiện nhiều nhất một lần.
"""

_HUMAN = """\
Các thuật ngữ cần giải thích (JSON):
{terms_json}

Evidence từ tài liệu đã duyệt, được nhóm theo TERM id:
{definition_evidence}

Trả JSON array ngay:"""

term_explain_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", _SYSTEM),
        ("human", _HUMAN),
    ]
)
