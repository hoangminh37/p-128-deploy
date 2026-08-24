"""Thu thập và gom nhóm những câu người học đã trả lời sai.

KHÔNG CẦN BẢNG MỚI. Mọi thứ cần cho tính năng này đã nằm sẵn trong
``quiz_sessions`` từ lượt nộp bài đầu tiên:

    questions[i]  →  {question, options, correct_index, explanation, ...}
    answers[i]    →  người học đã chọn gì

Ghép hai mảng theo chỉ số là ra câu nào sai, sai vào đáp án nào, và giải thích
đúng ra sao. Việc duy nhất còn thiếu là đường đưa nó ra ngoài.

VÌ SAO GOM NHÓM THEO NỘI DUNG CÂU HỎI:

Một người có thể gặp cùng một khái niệm ở nhiều đề khác nhau. Sai ba lần về
"thời điểm đo đường huyết" là một tín hiệu mạnh hơn hẳn ba lỗi rời rạc — nó nói
rằng chỗ đó thật sự chưa hiểu, chứ không phải bấm nhầm. Nên gom lại và đếm.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.core.logging import get_logger
from src.models.domain import QuizSession

logger = get_logger(__name__)

#: Số lượt làm bài gần nhất quét ngược để tìm câu sai. Đủ sâu để thấy quy luật,
#: không sâu tới mức lôi lại lỗi từ tháng trước mà người học đã khắc phục.
MAX_SESSIONS_SCANNED = 20

#: Trần số nhóm câu sai trả về. Người học nhìn 50 lỗi cùng lúc thì bỏ cuộc.
MAX_MISTAKE_GROUPS = 15


@dataclass
class Mistake:
    """Một câu đã trả lời sai, đã gom các lần lặp lại."""

    question: str
    options: list[str]
    correct_index: int
    explanation: str
    #: Đáp án người học đã chọn, mới nhất trước. Cùng một câu sai hai lần theo
    #: hai kiểu khác nhau là chuyện thường, và biết họ chọn gì mới đoán được họ
    #: đang hiểu nhầm ở đâu.
    chosen: list[int] = field(default_factory=list)
    times_wrong: int = 0
    topic: str = ""
    quiz_id: str = ""
    source_ref: str | None = None


def _key(question: str) -> str:
    """Khoá gom nhóm: bỏ dấu, hạ chữ thường, gộp khoảng trắng.

    Cùng một khái niệm được hỏi lại thường không trùng từng chữ, nhưng LLM có
    xu hướng lặp gần nguyên văn khi ra đề trên cùng trích đoạn. Chuẩn hoá nhẹ
    bắt được phần lớn, và gom nhầm hai câu khác nhau chỉ làm mất một dòng chứ
    không gây hại.
    """
    lowered = question.lower().strip()
    decomposed = unicodedata.normalize("NFD", lowered)
    stripped = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return " ".join(stripped.replace("đ", "d").split())


def extract_mistakes(sessions: list[QuizSession]) -> list[Mistake]:
    """Rút câu sai từ các lượt ĐÃ NỘP, gom nhóm và xếp theo mức nghiêm trọng.

    Nhận thẳng danh sách session chứ không tự truy vấn — tách được phần logic
    này ra khỏi database thì test nó không cần dựng DB tạm.

    Args:
        sessions: các lượt làm bài, MỚI NHẤT TRƯỚC.

    Returns:
        Nhóm câu sai, câu sai nhiều lần đứng trước; cùng số lần thì câu gặp gần
        đây đứng trước.
    """
    theo_khoa: dict[str, Mistake] = {}

    for session in sessions:
        if session.submitted_at is None:
            continue  # chưa nộp thì chưa có gì để nói là sai

        questions = session.questions or []
        answers = session.answers or []

        for index, question in enumerate(questions):
            if index >= len(answers):
                break  # dữ liệu lệch, bỏ qua thay vì nổ

            chon = answers[index]
            dung = question.get("correct_index")
            if chon == dung:
                continue

            khoa = _key(question.get("question", ""))
            if not khoa:
                continue

            nhom = theo_khoa.get(khoa)
            if nhom is None:
                nhom = Mistake(
                    question=question.get("question", ""),
                    options=list(question.get("options") or []),
                    correct_index=dung if isinstance(dung, int) else -1,
                    explanation=question.get("explanation", ""),
                    topic=session.topic or "",
                    # Lượt gần nhất được ghi lại, vì `sessions` mới nhất trước.
                    quiz_id=session.id,
                    source_ref=session.source_ref,
                )
                theo_khoa[khoa] = nhom

            nhom.times_wrong += 1
            if isinstance(chon, int):
                nhom.chosen.append(chon)

    ket_qua = list(theo_khoa.values())
    # Sai nhiều lần lên trước. `sessions` vốn đã mới-trước nên dict giữ đúng thứ
    # tự gặp lại, và sort ổn định của Python bảo toàn nó khi số lần bằng nhau.
    ket_qua.sort(key=lambda m: m.times_wrong, reverse=True)
    return ket_qua[:MAX_MISTAKE_GROUPS]


async def collect_mistakes(db: AsyncSession, patient_id: str | None) -> list[Mistake]:
    """Đọc các lượt đã nộp của người này rồi rút ra câu sai."""
    if not patient_id:
        return []

    result = await db.execute(
        select(QuizSession)
        .filter(
            QuizSession.patient_id == patient_id,
            QuizSession.submitted_at.isnot(None),
        )
        .order_by(QuizSession.submitted_at.desc())
        .limit(MAX_SESSIONS_SCANNED)
    )
    sessions = list(result.scalars().all())
    mistakes = extract_mistakes(sessions)

    logger.info(
        "[quiz_mistakes] %s: %d nhóm câu sai từ %d lượt đã nộp",
        patient_id,
        len(mistakes),
        len(sessions),
    )
    return mistakes
