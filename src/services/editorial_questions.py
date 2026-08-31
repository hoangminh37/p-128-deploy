"""Persistence for patient questions that verified RAG cannot answer."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.domain import OutOfScopeLog, PatientEditorialQuestion


async def record_unanswered_patient_question(
    db: AsyncSession,
    *,
    patient_id: str,
    conversation_id: str | None,
    question: str,
) -> PatientEditorialQuestion:
    """Create an individual BTV request and update the aggregate gap metric.

    Do not deduplicate patient requests: each question belongs to one patient
    and deserves its own answer. The aggregate ``OutOfScopeLog`` is updated
    separately so BTV can still prioritize which library gaps occur most.
    The caller owns the transaction and commits it with the chat messages.
    """
    normalized_question = " ".join(question.split())
    now = datetime.utcnow()

    log_result = await db.execute(
        select(OutOfScopeLog).where(OutOfScopeLog.question == normalized_question)
    )
    log = log_result.scalars().first()
    if log is None:
        db.add(
            OutOfScopeLog(
                question=normalized_question,
                ask_count=1,
                last_asked_at=now,
            )
        )
    else:
        log.ask_count += 1
        log.last_asked_at = now

    request = PatientEditorialQuestion(
        patient_id=patient_id,
        conversation_id=conversation_id,
        question=question.strip(),
        status="pending",
    )
    db.add(request)
    return request
