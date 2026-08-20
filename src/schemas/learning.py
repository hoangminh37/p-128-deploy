
from pydantic import BaseModel


class QuizDataSchema(BaseModel):
    question: str
    options: list[str]
    correct_index: int


class MicroArticleSchema(BaseModel):
    id: str
    title: str
    content: str
    category: str
    quiz_data: QuizDataSchema | None = None


class CompleteLessonRequest(BaseModel):
    answer_index: int


class GamificationStats(BaseModel):
    total_score: int
    current_streak: int
    completed_articles: list[str]


class DailyLessonResponse(BaseModel):
    lesson: MicroArticleSchema | None = None
    day_number: int
    stats: GamificationStats


class LearningLibraryResponse(BaseModel):
    articles: list[MicroArticleSchema]
    completed_articles: list[str]
