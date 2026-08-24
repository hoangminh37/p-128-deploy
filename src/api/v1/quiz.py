"""API v1 — Trắc nghiệm kiến thức (Mini-Quiz Generation).

Ba endpoint khép kín vòng lặp Giáo dục: Học (Thư viện) → Hỏi (Chatbot) → Đánh giá.

    POST /quiz                  sinh đề từ article | conversation | profile | mistakes
    GET  /quiz/mistakes         những chỗ người học đã trả lời sai, kèm giải thích
    POST /quiz/{quiz_id}/submit nộp bài, chấm ở server, cộng HP
    GET  /quiz/history          lịch sử làm bài của người đang đăng nhập

Đáp án đúng KHÔNG rời khỏi server ở bước sinh đề. Nó nằm trong
``QuizSession.questions`` và chỉ lộ ra ở response của bước nộp bài.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.v1.auth import get_current_user
from src.core.database import get_db
from src.core.logging import get_logger
from src.models.domain import Patient, PatientProgress, QuizSession
from src.schemas.chat import Citation
from src.schemas.learning import GamificationStats
from src.schemas.patient import UserInfo
from src.schemas.quiz import (
    HP_PER_CORRECT,
    PASS_RATIO,
    QuizHistoryItem,
    QuizHistoryResponse,
    QuizMetadata,
    QuizMistake,
    QuizMistakesResponse,
    QuizQuestion,
    QuizRequest,
    QuizResponse,
    QuizResult,
    QuizSubmitRequest,
    QuizSubmitResponse,
)
from src.services.quiz.context import (
    QuizContextError,
    build_from_article,
    build_from_conversation,
    build_from_mistakes,
    build_from_profile,
)
from src.services.quiz.generator import QuizGenerationError, generate_quiz
from src.services.quiz.mistakes import MAX_SESSIONS_SCANNED, collect_mistakes

router = APIRouter(prefix="/quiz", tags=["quiz"])
logger = get_logger(__name__)

DISCLAIMER = (
    "⚠️ Bài trắc nghiệm mang tính giáo dục, dựa trên tài liệu hướng dẫn của Bộ Y tế. "
    "Không thay thế chẩn đoán hay chỉ định của bác sĩ."
)


async def _load_patient(db: AsyncSession, patient_id: str | None) -> Patient | None:
    if not patient_id:
        return None
    result = await db.execute(select(Patient).filter(Patient.id == patient_id))
    return result.scalars().first()


# ── POST /quiz — sinh đề ─────────────────────────────────────────────────────


@router.post("", response_model=QuizResponse, summary="Sinh đề trắc nghiệm kiến thức")
async def create_quiz(
    request: QuizRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> QuizResponse:
    """Sinh bộ trắc nghiệm A/B/C/D bằng LangChain, bám theo tài liệu Bộ Y tế.

    Nguồn ngữ cảnh do ``source`` quyết định — xem ``src/services/quiz/context.py``.
    """
    started_at = time.time()
    patient = await _load_patient(db, current_user.patient_id)

    try:
        if request.source == "article":
            context = await build_from_article(db, request.article_id, patient)
        elif request.source == "conversation":
            context = await build_from_conversation(db, request.conversation_id, current_user.patient_id, patient)
        elif request.source == "mistakes":
            context = await build_from_mistakes(db, patient, current_user.patient_id)
        else:
            context = await build_from_profile(db, patient, current_user.patient_id)
    except QuizContextError as exc:
        # Thiếu bài, thiếu phiên chat hay chưa khai hồ sơ đều là lỗi của yêu cầu
        # chứ không phải sự cố máy chủ — trả 404 để FE hiện đúng thông báo.
        logger.info("[quiz] không dựng được ngữ cảnh: %s", exc)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    try:
        questions = await generate_quiz(context, request.num_questions)
    except QuizGenerationError as exc:
        logger.error("[quiz] sinh đề thất bại: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chưa soạn được bài trắc nghiệm lúc này. Bạn thử lại sau ít phút nhé.",
        ) from exc

    session = QuizSession(
        patient_id=current_user.patient_id,
        source=request.source,
        source_ref=request.source_ref,
        topic=context.topic,
        questions=questions,
        citations=context.citations,
        total=len(questions),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    latency_ms = int((time.time() - started_at) * 1000)
    logger.info("[quiz] %s | source=%s | %d câu | %dms", session.id, request.source, len(questions), latency_ms)

    return QuizResponse(
        quiz_id=session.id,
        source=request.source,
        topic=context.topic,
        # Bỏ correct_index và explanation — hai trường này ở lại DB.
        questions=[
            QuizQuestion(
                index=q["index"],
                question=q["question"],
                options=q["options"],
                difficulty=q["difficulty"],
            )
            for q in questions
        ],
        disclaimer=DISCLAIMER,
        citations=[Citation(**c) for c in context.citations],
        metadata=QuizMetadata(latency_ms=latency_ms, cached=False, grounded=context.grounded),
    )


# ── POST /quiz/{quiz_id}/submit — chấm bài ───────────────────────────────────


@router.post("/{quiz_id}/submit", response_model=QuizSubmitResponse, summary="Nộp bài trắc nghiệm")
async def submit_quiz(
    quiz_id: str,
    request: QuizSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> QuizSubmitResponse:
    """Chấm bài ở server và cộng HP vào cùng sổ điểm với Thư viện học tập.

    Trả 200 kèm kết quả từng câu kể cả khi sai hết. Sai một câu trắc nghiệm ôn
    tập không phải lỗi giao thức, và người học cần thấy giải thích để học lại —
    đó mới là điểm của vòng "Đánh giá".
    """
    result = await db.execute(
        select(QuizSession).filter(
            QuizSession.id == quiz_id,
            QuizSession.patient_id == current_user.patient_id,
        )
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Không tìm thấy bài trắc nghiệm {quiz_id}")

    if session.submitted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bài trắc nghiệm này đã được nộp rồi")

    questions = session.questions or []
    if len(request.answers) != len(questions):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Bài có {len(questions)} câu nhưng nhận được {len(request.answers)} đáp án",
        )

    results: list[QuizResult] = []
    score = 0
    for question, answer in zip(questions, request.answers, strict=True):
        is_correct = answer == question["correct_index"]
        score += int(is_correct)
        results.append(
            QuizResult(
                index=question["index"],
                question=question["question"],
                options=question["options"],
                your_answer=answer,
                correct_index=question["correct_index"],
                is_correct=is_correct,
                explanation=question["explanation"],
            )
        )

    total = len(questions)
    passed = total > 0 and score / total >= PASS_RATIO
    hp_earned = score * HP_PER_CORRECT if passed else 0

    session.answers = list(request.answers)
    session.score = score
    session.hp_earned = hp_earned
    session.submitted_at = datetime.now(UTC).replace(tzinfo=None)

    stats = await _award_hp(db, current_user.patient_id, hp_earned)
    await db.commit()

    logger.info("[quiz] %s nộp bài: %d/%d | +%d HP", quiz_id, score, total, hp_earned)

    return QuizSubmitResponse(
        quiz_id=quiz_id,
        score=score,
        total=total,
        passed=passed,
        results=results,
        hp_earned=hp_earned,
        stats=stats,
    )


async def _award_hp(db: AsyncSession, patient_id: str | None, hp: int) -> GamificationStats:
    """Cộng HP vào ``PatientProgress`` — cùng bảng mà Thư viện học tập đang dùng.

    KHÔNG đụng tới ``current_streak`` và ``last_completed_at``: chuỗi ngày là
    phần thưởng cho việc học bài hằng ngày, do ``complete_lesson`` quản. Cho
    trắc nghiệm cộng streak nữa thì người học làm liên tiếp 5 bài trắc nghiệm
    trong một buổi cũng lên chuỗi, và con số đó mất hết ý nghĩa.
    """
    result = await db.execute(select(PatientProgress).filter(PatientProgress.patient_id == patient_id))
    progress = result.scalars().first()

    if not progress:
        progress = PatientProgress(patient_id=patient_id, completed_articles=[], total_score=0, current_streak=0)
        db.add(progress)
        await db.flush()

    if hp:
        progress.total_score = (progress.total_score or 0) + hp

    return GamificationStats(
        total_score=progress.total_score or 0,
        current_streak=progress.current_streak or 0,
        completed_articles=progress.completed_articles or [],
    )


# ── GET /quiz/history — lịch sử ──────────────────────────────────────────────


@router.get("/history", response_model=QuizHistoryResponse, summary="Lịch sử làm bài trắc nghiệm")
async def get_quiz_history(
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> QuizHistoryResponse:
    """Các lượt làm bài của người đang đăng nhập, mới nhất trước."""
    result = await db.execute(
        select(QuizSession)
        .filter(QuizSession.patient_id == current_user.patient_id)
        .order_by(QuizSession.created_at.desc())
        .limit(limit)
    )

    items = [
        QuizHistoryItem(
            quiz_id=session.id,
            source=session.source,
            topic=session.topic,
            score=session.score,
            total=session.total,
            created_at=session.created_at.isoformat() + "Z" if session.created_at else "",
            submitted_at=session.submitted_at.isoformat() + "Z" if session.submitted_at else None,
        )
        for session in result.scalars().all()
    ]

    return QuizHistoryResponse(items=items)


# ── GET /quiz/mistakes — những chỗ chưa nắm ──────────────────────────────────


@router.get("/mistakes", response_model=QuizMistakesResponse, summary="Những câu đã trả lời sai")
async def get_quiz_mistakes(
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> QuizMistakesResponse:
    """Các chỗ người học chưa nắm, gom nhóm theo nội dung câu hỏi.

    Trả kèm ``explanation`` và ``correct_index`` — khác hẳn bước sinh đề vốn giấu
    đáp án. Ở đây người học đã nộp bài rồi, và mục đích của màn ôn lại chính là
    cho họ thấy đáp án đúng cùng lý do.

    Câu sai nhiều lần đứng trước: sai ba lần về cùng một khái niệm là dấu hiệu
    chưa hiểu thật, không phải bấm nhầm.
    """
    mistakes = await collect_mistakes(db, current_user.patient_id)

    result = await db.execute(
        select(func.count())
        .select_from(QuizSession)
        .filter(
            QuizSession.patient_id == current_user.patient_id,
            QuizSession.submitted_at.isnot(None),
        )
    )
    da_nop = result.scalar_one_or_none() or 0

    return QuizMistakesResponse(
        items=[
            QuizMistake(
                question=m.question,
                options=m.options,
                correct_index=m.correct_index,
                explanation=m.explanation,
                chosen=m.chosen,
                times_wrong=m.times_wrong,
                topic=m.topic,
                quiz_id=m.quiz_id,
            )
            for m in mistakes
        ],
        total_wrong=sum(m.times_wrong for m in mistakes),
        sessions_scanned=min(da_nop, MAX_SESSIONS_SCANNED),
    )
