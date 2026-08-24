from pydantic import BaseModel


class QuizDataSchema(BaseModel):
    """Câu trắc nghiệm tĩnh gắn liền một bài học, sinh một lần lúc chạy ETL.

    ``explanation`` để ``None`` được vì các bài đã nằm sẵn trong DB từ trước
    ngày 24/08/2026 không có trường này. Chỗ hiển thị phải tự lo phần thiếu —
    xem ``_giai_thich`` trong src/api/v1/learning.py.
    """

    question: str
    options: list[str]
    correct_index: int
    explanation: str | None = None


class MicroArticleSchema(BaseModel):
    id: str
    title: str
    content: str
    full_content: str | None = None
    category: str
    quiz_data: QuizDataSchema | None = None
    origin_source: str | None = None


class CompleteLessonRequest(BaseModel):
    answer_index: int


class GamificationStats(BaseModel):
    total_score: int
    current_streak: int
    completed_articles: list[str]


class CompleteLessonResponse(BaseModel):
    """Kết quả trả lời câu hỏi của bài học hằng ngày.

    VÌ SAO TRẢ 200 KỂ CẢ KHI SAI:

    Endpoint này từng ném 400 "Sai đáp án, không được cộng điểm!" cho câu trả
    lời sai. Người học nhận đúng một dòng chữ đỏ, không biết đáp án đúng là gì,
    cũng không biết mình sai ở chỗ nào — tức là trả lời sai xong vẫn không học
    được gì, mà đó mới là lúc đáng học nhất. Sai một câu trắc nghiệm ôn tập
    không phải lỗi giao thức. Cùng lý do với ``submit_quiz`` ở
    src/api/v1/quiz.py.

    ĐÁNH ĐỔI ĐÃ BIẾT: trả về ``correct_index`` nghĩa là người học đoán sai một
    lần rồi chọn lại cho đúng vẫn được +10 HP. Chấp nhận, vì HP hiện không mở
    khoá gì cả — nó chỉ là con số động viên — còn việc hiểu vì sao mình sai thì
    quan trọng thật. Ngày nào HP mở khoá một thứ gì đó, chỗ này phải xem lại.
    """

    is_correct: bool
    correct_index: int
    #: Luôn có chữ, kể cả khi bài học cũ chưa có ``explanation``.
    explanation: str
    hp_earned: int
    stats: GamificationStats


class DailyLessonResponse(BaseModel):
    lesson: MicroArticleSchema | None = None
    day_number: int
    stats: GamificationStats


class LearningPathItemSchema(BaseModel):
    day_number: int
    disease_category: str
    article: MicroArticleSchema


class LearningLibraryResponse(BaseModel):
    learning_paths: list[LearningPathItemSchema]
    completed_articles: list[str]
