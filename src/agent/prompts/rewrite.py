"""Query rewrite prompt — ghép patient profile vào query."""
from __future__ import annotations

from langchain_core.prompts import ChatPromptTemplate

COREF_SYSTEM = """Bạn là trợ lý giải quyết tham chiếu ngôn ngữ trong hội thoại y tế.
Nhiệm vụ: Dựa vào lịch sử hội thoại, hãy viết lại câu hỏi cuối sao cho đứng độc lập,
không còn đại từ mơ hồ (nó, ông ấy, bệnh đó, thuốc này, v.v.).
Chỉ trả về câu hỏi đã viết lại, không giải thích."""

COREF_HUMAN = """Lịch sử hội thoại:
{history}

Câu hỏi cần giải quyết tham chiếu: {query}

Câu hỏi đã viết lại:"""

coref_prompt = ChatPromptTemplate.from_messages([
    ("system", COREF_SYSTEM),
    ("human", COREF_HUMAN),
])

REWRITE_SYSTEM = """Bạn là trợ lý y tế. Hãy viết lại câu hỏi của bệnh nhân để tối ưu cho
việc tìm kiếm tài liệu y tế, kết hợp thông tin hồ sơ bệnh nhân nếu có liên quan.
Chỉ trả về câu hỏi đã viết lại (tối đa 2 câu), không giải thích thêm."""

REWRITE_HUMAN = """Hồ sơ bệnh nhân: {patient_profile}
Câu hỏi: {resolved_query}

Câu hỏi tối ưu cho tìm kiếm:"""

rewrite_prompt = ChatPromptTemplate.from_messages([
    ("system", REWRITE_SYSTEM),
    ("human", REWRITE_HUMAN),
])
