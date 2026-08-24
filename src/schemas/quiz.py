"""HTTP schemas cho Mini-Quiz Generation — POST /api/v1/quiz.

Ba nguồn ngữ cảnh, một hợp đồng:

- ``article``      — bệnh nhân vừa đọc xong một bài trong Thư viện.
- ``conversation`` — bệnh nhân vừa chat xong, hỏi lại chính chủ đề đó.
- ``profile``      — không gắn với bài hay phiên nào, ra đề theo hồ sơ bệnh.

VÌ SAO ``QuizQuestion`` KHÔNG CÓ ``correct_index``:

Đáp án đúng nằm lại trong bảng ``QuizSession`` ở server. Trả nó về trình duyệt
thì người học chỉ cần mở tab Network là thấy hết đáp án, mà điểm HP lại cộng
vào cùng một sổ với bài học hằng ngày. Chấm ở server giữ cho hai nguồn điểm
đáng tin như nhau. Đáp án đúng chỉ lộ ra ở ``QuizResult`` — sau khi đã nộp bài.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from src.schemas.chat import Citation
from src.schemas.learning import GamificationStats

QuizSource = Literal["article", "conversation", "profile", "mistakes"]
QuizDifficulty = Literal["easy", "medium", "hard"]

#: Chặn trên/dưới số câu mỗi đề. Trên 10 câu thì người bệnh mãn tính lớn tuổi bỏ
#: dở giữa chừng.
#:
#: Sàn từng là 3 với lý do "dưới 3 câu không đánh giá được gì". Hạ xuống 2 ngày
#: 24/08/2026 cho khối "Ôn tập nhanh" ở cuối mỗi bài trong Thư viện: khối đó
#: không nhằm ĐÁNH GIÁ mà nhằm bắt người đọc dừng lại một nhịp và tự trả lời,
#: ngay sau khi đọc xong. Hai câu là mức người vừa đọc 800 chữ còn chịu làm;
#: năm câu ở đúng chỗ đó thì phần lớn bỏ qua. Bài kiểm tra thật vẫn mặc định 5.
MIN_QUESTIONS = 2
MAX_QUESTIONS = 10
DEFAULT_QUESTIONS = 5

#: Số câu đúng tối thiểu (theo tỉ lệ) để tính là qua bài và được cộng HP.
#:
#: Lưu ý với đề 2 câu: 1/2 = 0.5 < 0.6 nên phải đúng CẢ HAI mới được HP. Đó là
#: chủ ý — đề càng ngắn, đoán mò càng dễ trúng một câu.
PASS_RATIO = 0.6

#: HP cộng cho mỗi câu đúng. Cùng thang với +10 HP của một bài học hằng ngày
#: (xem ``complete_lesson`` trong src/api/v1/learning.py) nhưng chia nhỏ ra.
HP_PER_CORRECT = 5


class QuizRequest(BaseModel):
    """Request body cho POST /api/v1/quiz.

    ``article_id`` và ``conversation_id`` bắt buộc theo ``source`` — ràng buộc
    này nằm ở validator bên dưới chứ không để endpoint tự kiểm, để client nhận
    422 kèm thông báo rõ ràng thay vì 500 ở tận tầng service.
    """

    source: QuizSource
    article_id: str | None = None
    conversation_id: str | None = None
    num_questions: int = Field(default=DEFAULT_QUESTIONS, ge=MIN_QUESTIONS, le=MAX_QUESTIONS)

    @model_validator(mode="after")
    def check_source_ref(self) -> QuizRequest:
        if self.source == "article" and not self.article_id:
            raise ValueError("source='article' bắt buộc phải có article_id")
        if self.source == "conversation" and not self.conversation_id:
            raise ValueError("source='conversation' bắt buộc phải có conversation_id")
        return self

    @property
    def source_ref(self) -> str | None:
        """Khoá của nguồn ngữ cảnh, dùng để lưu và để tra cache."""
        if self.source == "article":
            return self.article_id
        if self.source == "conversation":
            return self.conversation_id
        return None


class QuizQuestion(BaseModel):
    """Một câu trắc nghiệm gửi cho người học. Cố ý KHÔNG có đáp án đúng."""

    index: int = Field(..., ge=0)
    question: str
    options: list[str] = Field(..., min_length=4, max_length=4)
    difficulty: QuizDifficulty = "medium"


class QuizMetadata(BaseModel):
    latency_ms: int
    cached: bool = False
    #: True khi đề được dựng trên trích đoạn tài liệu gốc (Thư viện hoặc RAG),
    #: False khi chỉ dựa vào hồ sơ bệnh — lúc đó FE nên nói rõ với người học.
    grounded: bool = True


class QuizResponse(BaseModel):
    """Response cho POST /api/v1/quiz."""

    quiz_id: str
    source: QuizSource
    topic: str
    questions: list[QuizQuestion] = Field(default_factory=list)
    disclaimer: str
    citations: list[Citation] = Field(default_factory=list)
    metadata: QuizMetadata


class QuizSubmitRequest(BaseModel):
    """Request body cho POST /api/v1/quiz/{quiz_id}/submit.

    ``answers[i]`` là lựa chọn cho câu thứ ``i``. Dùng ``-1`` cho câu bỏ trống —
    ``None`` cũng chấp nhận được nhưng buộc mọi client phải phân biệt hai kiểu
    dữ liệu trong cùng một mảng.
    """

    answers: list[int] = Field(..., min_length=MIN_QUESTIONS, max_length=MAX_QUESTIONS)


class QuizResult(BaseModel):
    """Kết quả một câu, chỉ trả về SAU khi người học đã nộp bài."""

    index: int
    question: str
    options: list[str]
    your_answer: int
    correct_index: int
    is_correct: bool
    explanation: str


class QuizSubmitResponse(BaseModel):
    """Response cho POST /api/v1/quiz/{quiz_id}/submit."""

    quiz_id: str
    score: int
    total: int
    passed: bool
    results: list[QuizResult] = Field(default_factory=list)
    hp_earned: int
    #: Thang điểm/streak dùng chung với Thư viện học tập.
    stats: GamificationStats


class QuizHistoryItem(BaseModel):
    quiz_id: str
    source: QuizSource
    topic: str
    score: int | None = None
    total: int
    created_at: str
    submitted_at: str | None = None


class QuizHistoryResponse(BaseModel):
    items: list[QuizHistoryItem] = Field(default_factory=list)


class QuizMistake(BaseModel):
    """Một chỗ người học chưa nắm, gom từ mọi lượt đã nộp."""

    question: str
    options: list[str]
    correct_index: int
    explanation: str
    #: Các đáp án người học đã chọn, mới nhất trước. Sai cùng một câu theo hai
    #: kiểu khác nhau nói lên nhiều hơn là chỉ biết "đã sai".
    chosen: list[int] = Field(default_factory=list)
    times_wrong: int
    topic: str
    quiz_id: str


class QuizMistakesResponse(BaseModel):
    """Response cho GET /api/v1/quiz/mistakes."""

    items: list[QuizMistake] = Field(default_factory=list)
    #: Tổng số lượt sai, kể cả lặp lại — khác `len(items)` vốn đã gom nhóm.
    total_wrong: int = 0
    #: Số lượt làm bài đã nộp mà thống kê này dựa vào.
    sessions_scanned: int = 0
