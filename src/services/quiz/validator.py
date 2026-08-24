"""Kiểm định bộ đề do LLM sinh ra — thuần luật, không gọi LLM.

VÌ SAO KHÔNG DÙNG LLM ĐỂ TỰ CHẤM ĐỀ CỦA CHÍNH NÓ:

Những lỗi hay gặp nhất ở đề trắc nghiệm do LLM sinh đều là lỗi ĐẾM ĐƯỢC — thừa
thiếu đáp án, `correct_index` trỏ ra ngoài mảng, hai đáp án trùng chữ, hay chèn
"Tất cả các đáp án trên" vào vị trí D. Một vòng gọi LLM nữa để bắt mấy lỗi này
vừa chậm gấp đôi, vừa không chắc chắn bằng vài dòng Python, lại còn tốn token.

Luật ở đây chạy trong micro giây và cho kết quả y hệt nhau mỗi lần chạy, nên
test được mà không cần mock gì cả.
"""

from __future__ import annotations

import re
import unicodedata

from src.core.logging import get_logger

logger = get_logger(__name__)

OPTIONS_PER_QUESTION = 4

#: Các dạng đáp án "ăn gian" — chúng biến câu trắc nghiệm thành câu đố mẹo và
#: không đo được người học có hiểu bài hay không.
BANNED_OPTION_PATTERNS: tuple[str, ...] = (
    "tat ca cac dap an tren",
    "tat ca dap an tren",
    "tat ca deu dung",
    "tat ca deu sai",
    "khong dap an nao dung",
    "khong co dap an nao",
    "ca a va b",
    "ca b va c",
    "ca a va c",
    "a va b deu dung",
    "cac dap an tren deu dung",
)

#: Câu hỏi chạm vào chẩn đoán hoặc kê đơn thì loại thẳng — trợ lý này là công cụ
#: giáo dục, và một đề trắc nghiệm hỏi "nên uống thuốc nào" chính là đang kê đơn
#: dưới lớp vỏ ôn tập. Cùng lằn ranh mà refuse_handler đang giữ ở luồng chat.
BANNED_QUESTION_PATTERNS: tuple[str, ...] = (
    "uong thuoc gi",
    "uong thuoc nao",
    "dung thuoc gi",
    "dung thuoc nao",
    "thuoc nao phu hop",
    "lieu luong bao nhieu",
    "lieu bao nhieu",
    "may vien",
    "may don vi insulin",
    "tiem bao nhieu",
    "ban dang bi benh gi",
    "bac dang bi benh gi",
    "chan doan la gi",
    "co phai bi",
)


def _normalize(text: str) -> str:
    """Bỏ dấu, gộp khoảng trắng, hạ chữ thường — để so khớp mẫu không lệ thuộc dấu.

    LLM viết "Tất cả các đáp án trên" hay "tat ca cac dap an tren" đều phải bị
    bắt như nhau, và người dùng gõ thiếu dấu cũng vậy.
    """
    lowered = text.lower().strip()
    decomposed = unicodedata.normalize("NFD", lowered)
    stripped = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    stripped = stripped.replace("đ", "d")
    return re.sub(r"[^a-z0-9]+", " ", stripped).strip()


class QuizValidationError(ValueError):
    """Bộ đề không dùng được. Message tiếng Việt, đi thẳng vào log."""


def validate_question(raw: dict, position: int) -> dict:
    """Kiểm định một câu. Trả về câu đã chuẩn hoá, hoặc ném QuizValidationError."""
    question = (raw.get("question") or "").strip()
    if not question:
        raise QuizValidationError(f"Câu {position}: thiếu nội dung câu hỏi")

    if any(pat in _normalize(question) for pat in BANNED_QUESTION_PATTERNS):
        raise QuizValidationError(f"Câu {position}: mang tính chẩn đoán hoặc kê đơn — {question[:60]}")

    options = [str(opt).strip() for opt in (raw.get("options") or [])]
    if len(options) != OPTIONS_PER_QUESTION:
        raise QuizValidationError(f"Câu {position}: có {len(options)} đáp án, cần đúng {OPTIONS_PER_QUESTION}")

    if any(not opt for opt in options):
        raise QuizValidationError(f"Câu {position}: có đáp án rỗng")

    normalized = [_normalize(opt) for opt in options]
    if len(set(normalized)) != OPTIONS_PER_QUESTION:
        raise QuizValidationError(f"Câu {position}: có đáp án trùng nhau")

    for opt_norm, opt in zip(normalized, options, strict=True):
        if any(pat in opt_norm for pat in BANNED_OPTION_PATTERNS):
            raise QuizValidationError(f"Câu {position}: đáp án bị cấm — {opt}")

    correct_index = raw.get("correct_index")
    if not isinstance(correct_index, int) or not 0 <= correct_index < OPTIONS_PER_QUESTION:
        raise QuizValidationError(f"Câu {position}: correct_index={correct_index!r} không hợp lệ")

    difficulty = raw.get("difficulty") or "medium"
    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "medium"

    explanation = (raw.get("explanation") or "").strip()
    if not explanation:
        # Giải thích trống không làm đề sai, chỉ làm nó kém đi. Vá bằng câu mặc
        # định thay vì vứt cả bộ đề đi và gọi lại LLM lần nữa.
        explanation = f"Đáp án đúng là: {options[correct_index]}"

    return {
        "question": question,
        "options": options,
        "correct_index": correct_index,
        "difficulty": difficulty,
        "explanation": explanation,
    }


def validate_quiz(raw_questions: list[dict], min_questions: int) -> list[dict]:
    """Lọc bộ đề, giữ lại các câu hợp lệ.

    Bỏ từng câu hỏng chứ không bỏ cả bộ: LLM thường chỉ hỏng một hai câu, và ra
    ít câu vẫn hơn là bắt người bệnh ngồi chờ sinh lại từ đầu. Chỉ khi số câu
    còn lại tụt dưới ``min_questions`` mới coi như thất bại và để tầng trên retry.
    """
    valid: list[dict] = []
    for position, raw in enumerate(raw_questions, start=1):
        try:
            valid.append(validate_question(raw, position))
        except QuizValidationError as exc:
            logger.warning("[quiz_validator] loại câu hỏi: %s", exc)

    if len(valid) < min_questions:
        raise QuizValidationError(f"Chỉ có {len(valid)}/{len(raw_questions)} câu hợp lệ, cần tối thiểu {min_questions}")

    for index, question in enumerate(valid):
        question["index"] = index

    return valid
