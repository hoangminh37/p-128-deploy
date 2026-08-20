from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.v1.auth import get_current_user
from src.core.database import get_db
from src.models.domain import Article, PatientProgress
from src.schemas.learning import (
    CompleteLessonRequest,
    DailyLessonResponse,
    GamificationStats,
    LearningLibraryResponse,
    MicroArticleSchema,
)
from src.schemas.patient import UserInfo

router = APIRouter(prefix="/learning", tags=["learning"])


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
    result_progress = await db.execute(
        select(PatientProgress).filter(PatientProgress.patient_id == current_user.patient_id)
    )
    progress = result_progress.scalars().first()
    completed_articles = progress.completed_articles if progress else []

    result_articles = await db.execute(select(Article))
    all_articles = result_articles.scalars().all()

    articles_out = []
    for a in all_articles:
        articles_out.append(
            MicroArticleSchema(id=a.id, title=a.title, content=a.content, category=a.category, quiz_data=a.quiz_data)
        )

    return LearningLibraryResponse(articles=articles_out, completed_articles=completed_articles)


@router.post("/complete-lesson/{article_id}", response_model=GamificationStats)
async def complete_lesson(
    article_id: str,
    request: CompleteLessonRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    # Verify the answer
    result_article = await db.execute(select(Article).filter(Article.id == article_id))
    article = result_article.scalars().first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if article.quiz_data:
        correct_index = article.quiz_data.get("correct_index")
        if request.answer_index != correct_index:
            raise HTTPException(status_code=400, detail="Sai đáp án, không được cộng điểm!")

    result = await db.execute(select(PatientProgress).filter(PatientProgress.patient_id == current_user.patient_id))
    progress = result.scalars().first()

    if not progress:
        progress = PatientProgress(patient_id=current_user.patient_id, completed_articles=[])
        db.add(progress)

    completed = list(progress.completed_articles or [])
    if article_id not in completed:
        completed.append(article_id)
        progress.completed_articles = completed

        now = datetime.utcnow()
        today = now.date()
        last_date = progress.last_completed_at.date() if progress.last_completed_at else None

        # Chỉ cộng điểm & chuỗi nếu chưa hoàn thành bài nào trong ngày hôm nay
        if last_date != today:
            progress.total_score = (progress.total_score or 0) + 10
            if last_date and (today - last_date).days == 1:
                progress.current_streak = (progress.current_streak or 0) + 1
            else:
                progress.current_streak = 1
            progress.last_completed_at = now

        await db.commit()
        await db.refresh(progress)

    return GamificationStats(
        total_score=progress.total_score,
        current_streak=progress.current_streak,
        completed_articles=progress.completed_articles,
    )
