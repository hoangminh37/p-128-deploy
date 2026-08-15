"""Self-RAG verification prompt."""
from __future__ import annotations

from langchain_core.prompts import ChatPromptTemplate

VERIFY_SYSTEM = """Bạn là chuyên gia kiểm tra tính xác thực của câu trả lời y tế.
Nhiệm vụ: Kiểm tra xem từng câu trong phần "Câu trả lời" có được hỗ trợ bởi "Tài liệu" không.

Phân loại:
- fully: TẤT CẢ các câu đều có nguồn rõ ràng từ tài liệu
- partially: Một số câu có nguồn, một số KHÔNG có nguồn
- no_support: Phần lớn câu trả lời KHÔNG có nguồn từ tài liệu

Trả về JSON:
{{
  "support_level": "fully | partially | no_support",
  "unsupported_sentences": ["câu 1 thiếu nguồn", "câu 2 thiếu nguồn"]
}}
Nếu fully, để unsupported_sentences = []"""

VERIFY_HUMAN = """Câu hỏi: {query}

Tài liệu:
{context}

Câu trả lời cần kiểm tra:
{response}

Kết quả kiểm tra (JSON):"""

verify_prompt = ChatPromptTemplate.from_messages([
    ("system", VERIFY_SYSTEM),
    ("human", VERIFY_HUMAN),
])
