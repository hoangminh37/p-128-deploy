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

coref_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", COREF_SYSTEM),
        ("human", COREF_HUMAN),
    ]
)

REWRITE_SYSTEM = """Bạn là trợ lý y tế. Hãy viết lại câu hỏi của bệnh nhân để tối ưu cho
việc tìm kiếm tài liệu y tế.

QUY TẮC QUAN TRỌNG NHẤT — thông tin NÓI TRONG CÂU HỎI luôn THẮNG hồ sơ:

Hồ sơ chỉ là thông tin đã lưu từ trước, có thể cũ hoặc không phải của người đang
hỏi. Khi câu hỏi tự nêu tuổi, bệnh hay tình trạng, hãy GIỮ NGUYÊN những gì câu
hỏi nói và BỎ QUA phần hồ sơ mâu thuẫn với nó.

    Hồ sơ: 58 tuổi, tăng huyết áp
    Câu hỏi: "tôi 13 tuổi có bệnh tim, giờ bị thêm cao huyết áp thì ăn uống sao"
    ĐÚNG : "Chế độ ăn cho người 13 tuổi có bệnh tim kèm tăng huyết áp"
    SAI  : "Chế độ ăn cho người 58 tuổi bị tăng huyết áp"   <- nuốt mất tuổi 13

Viết sai chỗ này rất nguy hiểm: hệ thống sẽ đi tìm tài liệu cho người trưởng
thành rồi trả về cho một đứa trẻ, mà liều lượng và ngưỡng chỉ số của trẻ em khác
hẳn người lớn.

Chỉ bổ sung thông tin từ hồ sơ khi câu hỏi KHÔNG nói gì về mặt đó.

Chỉ trả về câu hỏi đã viết lại (tối đa 2 câu), không giải thích thêm."""

REWRITE_HUMAN = """Hồ sơ bệnh nhân: {patient_profile}
Câu hỏi: {resolved_query}

Câu hỏi tối ưu cho tìm kiếm:"""

rewrite_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", REWRITE_SYSTEM),
        ("human", REWRITE_HUMAN),
    ]
)
