
from pydantic import BaseModel


class QuizDataSchema(BaseModel):
    question: str
    options: list[str]
    correct_index: int


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
