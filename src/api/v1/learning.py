from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.v1.auth import get_current_user
from src.core.database import get_db
from src.models.domain import Article, PatientProgress
from src.schemas.learning import (
    CompleteLessonRequest,
    CompleteLessonResponse,
    DailyLessonResponse,
    GamificationStats,
    LearningLibraryResponse,
    MicroArticleSchema,
)
from src.schemas.patient import UserInfo

router = APIRouter(prefix="/learning", tags=["learning"])

#: HP cộng cho một bài học hằng ngày, tối đa một lần mỗi ngày.
HP_PER_LESSON = 10


def _giai_thich(quiz_data: dict | None, is_correct: bool) -> str:
    """Câu giải thích gửi kèm kết quả, luôn có chữ.

    Bài học sinh trước ngày 24/08/2026 không có ``explanation`` trong
    ``quiz_data``. Thay vì để trống — người trả lời sai lại nhận được đúng con
    số 0 thông tin, y như hồi còn ném 400 — thì nêu thẳng đáp án đúng. Kém hơn
    một câu giải thích thật, nhưng vẫn nói được điều tối thiểu.
    """
    if not quiz_data:
        return "Bài học này chưa có câu hỏi kiểm tra."

    ghi_chu = (quiz_data.get("explanation") or "").strip()
    if ghi_chu:
        return ghi_chu

    options = quiz_data.get("options") or []
    dung = quiz_data.get("correct_index")
    if isinstance(dung, int) and 0 <= dung < len(options):
        moc = "Chính xác" if is_correct else "Đáp án đúng"
        return f"{moc}: {options[dung]}"
    return "Bạn xem lại phần nội dung bài học phía trên nhé."


@router.get("/daily-lesson", response_model=DailyLessonResponse)
async def get_daily_lesson(db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    # 1. Fetch PatientProgress
    result = await db.execute(select(PatientProgress).filter(PatientProgress.patient_id == current_user.patient_id))
    progress = result.scalars().first()

    if not progress:
        progress = PatientProgress(patient_id=current_user.patient_id, completed_articles=[])
        db.add(progress)
        await db.commit()
        await db.refresh(progress)

    completed_articles = progress.completed_articles or []
    day_number = len(completed_articles) + 1

    stats = GamificationStats(
        total_score=progress.total_score or 0,
        current_streak=progress.current_streak or 0,
        completed_articles=completed_articles,
    )

    # Check if already completed a lesson today
    today = datetime.utcnow().date()
    if progress.last_completed_at and progress.last_completed_at.date() == today:
        return DailyLessonResponse(lesson=None, day_number=day_number, stats=stats)

    # 2. Fetch an uncompleted Article for the lesson
    result_articles = await db.execute(select(Article))
    all_articles = result_articles.scalars().all()

    uncompleted = [a for a in all_articles if a.id not in completed_articles]

    # Fallback mock lesson if DB is empty
    if not uncompleted and not all_articles:
        mock_lesson = MicroArticleSchema(
            id="mock_1",
            title="Đường huyết là gì?",
            content="Đường huyết (hay glucose máu) là lượng đường có trong máu của bạn. Đây là nguồn năng lượng chính cho cơ thể hoạt động. Hãy tưởng tượng nó như xăng chạy xe máy vậy. Nếu đường huyết quá cao hoặc quá thấp đều ảnh hưởng đến sức khoẻ.",
            category="general",
        )
        return DailyLessonResponse(lesson=mock_lesson, day_number=day_number, stats=stats)

    if not uncompleted:
        return DailyLessonResponse(lesson=None, day_number=day_number, stats=stats)

    next_article = uncompleted[0]
    lesson = MicroArticleSchema(
        id=next_article.id,
        title=next_article.title,
        content=next_article.content,
        category=next_article.category,
        quiz_data=next_article.quiz_data,
    )

    return DailyLessonResponse(lesson=lesson, day_number=day_number, stats=stats)


@router.get("/library", response_model=LearningLibraryResponse)
async def get_learning_library(db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    from src.models.domain import LearningPath, Patient

    result_progress = await db.execute(
        select(PatientProgress).filter(PatientProgress.patient_id == current_user.patient_id)
    )
    progress = result_progress.scalars().first()
    completed_articles = progress.completed_articles if progress else []

    # Lấy primary_condition từ hồ sơ bệnh nhân
    if not current_user.patient_id:
        return LearningLibraryResponse(learning_paths=[], completed_articles=completed_articles)

    result_patient = await db.execute(select(Patient).filter(Patient.id == current_user.patient_id))
    patient = result_patient.scalars().first()
    if not patient:
        return LearningLibraryResponse(learning_paths=[], completed_articles=completed_articles)

    primary_condition = patient.primary_condition

    # Join LearningPath và Article theo bệnh của bệnh nhân
    result = await db.execute(
        select(LearningPath, Article)
        .join(Article, LearningPath.article_id == Article.id)
        .filter(LearningPath.disease_category == primary_condition)
        .order_by(LearningPath.day_number)
    )

    paths = []
    for lp, article in result.all():
        paths.append(
            {
                "day_number": lp.day_number,
                "disease_category": lp.disease_category,
                "article": MicroArticleSchema(
                    id=article.id,
                    title=article.title,
                    content=article.content,
                    full_content=article.full_content,
                    category=article.category,
                    quiz_data=article.quiz_data,
                    origin_source=article.origin_source,
                ),
            }
        )

    return LearningLibraryResponse(learning_paths=paths, completed_articles=completed_articles)


@router.post("/complete-lesson/{article_id}", response_model=CompleteLessonResponse)
async def complete_lesson(
    article_id: str,
    request: CompleteLessonRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> CompleteLessonResponse:
    """Chấm câu hỏi của bài học hằng ngày và đánh dấu hoàn thành nếu đúng.

    Trả 200 cho cả câu đúng lẫn câu sai — xem ``CompleteLessonResponse`` để
    biết vì sao 400 là lựa chọn sai ở đây. Sai thì không đánh dấu hoàn thành,
    không cộng HP, nhưng vẫn nhận được đáp án đúng kèm lời giải thích và làm
    lại được ngay.
    """
    result_article = await db.execute(select(Article).filter(Article.id == article_id))
    article = result_article.scalars().first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    quiz_data = article.quiz_data or None
    correct_index = quiz_data.get("correct_index") if quiz_data else None
    if not isinstance(correct_index, int):
        # Bài không có câu hỏi thì đọc xong là tính hoàn thành. Giữ nguyên hành
        # vi cũ để bài cũ trong DB không kẹt lại.
        correct_index = request.answer_index

    is_correct = request.answer_index == correct_index

    result = await db.execute(select(PatientProgress).filter(PatientProgress.patient_id == current_user.patient_id))
    progress = result.scalars().first()

    if not progress:
        progress = PatientProgress(patient_id=current_user.patient_id, completed_articles=[])
        db.add(progress)
        await db.flush()

    hp_earned = 0
    completed = list(progress.completed_articles or [])

    if is_correct and article_id not in completed:
        completed.append(article_id)
        progress.completed_articles = completed

        now = datetime.utcnow()
        today = now.date()
        last_date = progress.last_completed_at.date() if progress.last_completed_at else None

        # Chỉ cộng điểm & chuỗi nếu chưa hoàn thành bài nào trong ngày hôm nay
        if last_date != today:
            hp_earned = HP_PER_LESSON
            progress.total_score = (progress.total_score or 0) + hp_earned
            if last_date and (today - last_date).days == 1:
                progress.current_streak = (progress.current_streak or 0) + 1
            else:
                progress.current_streak = 1
            progress.last_completed_at = now

        await db.commit()
        await db.refresh(progress)

    return CompleteLessonResponse(
        is_correct=is_correct,
        correct_index=correct_index,
        explanation=_giai_thich(quiz_data, is_correct),
        hp_earned=hp_earned,
        stats=GamificationStats(
            total_score=progress.total_score or 0,
            current_streak=progress.current_streak or 0,
            completed_articles=progress.completed_articles or [],
        ),
    )
