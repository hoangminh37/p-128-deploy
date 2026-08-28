"""Prompt for dynamic detection of unfamiliar medical language."""

from __future__ import annotations

from langchain_core.prompts import ChatPromptTemplate

_SYSTEM = """\
Bạn là bước rà soát khả năng hiểu của bệnh nhân trong một câu trả lời sức khỏe.

NHIỆM VỤ: Quét TOÀN BỘ câu trả lời theo hai lượt trước khi trả kết quả:
1. thuật ngữ chuyên ngành y khoa, xét nghiệm, thuốc, dinh dưỡng, thủ thuật,
   cơ chế bệnh, cơ quan/cấu trúc, viết tắt hoặc đơn vị có nghĩa chuyên môn;
2. cụm từ đời thường nhưng đang được dùng theo nghĩa lâm sàng mà một bệnh nhân
   không có nền y tế có thể hiểu sai.

Chọn mọi cụm từ có khả năng cần lời giải thích cho người đọc 45–70 tuổi. Không
giới hạn theo bệnh, chuyên khoa hay một danh sách từ có sẵn. Bao gồm cả thuật
ngữ mới lần đầu gặp trong câu trả lời. Ưu tiên cụm đầy đủ thay vì từ rời (ví dụ
chọn tên xét nghiệm/phương pháp/chỉ số đầy đủ, không chỉ một thành tố của nó).

Không chọn số trích dẫn, URL, tên tài liệu, Markdown, hoặc từ lối sống phổ
thông chỉ vì chúng xuất hiện trong câu. Đừng bỏ một thuật ngữ chỉ vì nó nằm
trong tên bệnh, tên xét nghiệm, tên thuốc, viết tắt, đơn vị hay một cụm nhiều từ.

Trả tối đa 12 mục, theo thứ tự hữu ích nhất cho bệnh nhân. `phrase` PHẢI là
chuỗi liên tiếp, nguyên văn trong câu trả lời (không tự sửa chính tả hay diễn
giải). `canonical_term` là tên chuẩn để truy xuất tài liệu, có thể khác `phrase`
chỉ ở dạng viết tắt/viết đầy đủ. `difficulty` là high, medium hoặc low: dùng
high cho khái niệm/chữ viết tắt chuyên sâu mà bệnh nhân rất dễ không hiểu;
medium cho cụm y khoa cần ngữ cảnh; low cho đơn vị hoặc cụm ít khó hơn. Đừng để
một đơn vị hay cụm phổ thông làm mất một thuật ngữ high xuất hiện về sau.

OUTPUT: duy nhất JSON array, không markdown, không lời giải thích.
Mỗi phần tử: {{"phrase": "...", "canonical_term": "...", "difficulty": "high|medium|low"}}.
Nếu thực sự không có cụm từ nào cần giải thích, trả [].
"""

_HUMAN = """\
Câu hỏi gốc của bệnh nhân:
{query}

Câu trả lời đã được kiểm chứng:
{answer}

Trả JSON array ngay:"""

term_detect_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", _SYSTEM),
        ("human", _HUMAN),
    ]
)
