"""Authenticated voice endpoints for the patient chat experience.

The endpoints deliberately do not call the agent. Transcription returns text
to the browser, which then follows the existing `/chat/stream` path (including
RAG, verifier, red flags, audit logging and citations). Speech only accepts a
persisted assistant message, so it cannot be used to make arbitrary text sound
like a medical response from this product.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.v1.auth import get_current_user
from src.api.v1.chat import chat_stream
from src.core.config import get_settings
from src.core.database import get_db
from src.core.logging import get_logger
from src.models.domain import Conversation, Message, Patient
from src.rag.registry import load_registry
from src.schemas.chat import ChatRequest
from src.schemas.patient import UserInfo
from src.schemas.voice import VoiceSpeechRequest, VoiceTranscriptionResponse
from src.services.voice import VoiceService, VoiceServiceError

router = APIRouter(prefix="/voice", tags=["voice"])
logger = get_logger(__name__)

# MediaRecorder does not have one universal MIME type across Safari, Chromium
# and Firefox. These are the formats the browser may produce for this UI.
_ALLOWED_AUDIO_TYPES = frozenset(
    {"audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"}
)


def _require_patient_access(patient_id: str, current_user: UserInfo) -> None:
    if current_user.role == "patient" and current_user.patient_id != patient_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền dùng hồ sơ bệnh nhân này")


async def _get_patient(db: AsyncSession, patient_id: str) -> Patient:
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalars().first()
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ bệnh nhân")
    return patient


def _medical_keywords_for_patient(patient: Patient) -> list[str]:
    """Build STT hints from approved in-scope source metadata, not a code list.

    Document titles and identifiers are editorially reviewed already. Supplying
    a compact list helps preserve names such as HbA1c without changing what the
    agent is allowed to answer; the returned transcript still goes through the
    normal intent and retrieval pipeline.
    """
    conditions = {patient.primary_condition, *(patient.comorbidities or [])}
    try:
        documents = load_registry().approved()
    except Exception as exc:  # A registry issue must not turn voice into a dead end.
        logger.warning("[voice] cannot load registry keyword hints: %s", exc)
        return []

    candidates: list[str] = []
    for document in documents:
        if not conditions.intersection(document.diseases):
            continue
        candidates.extend(
            value.strip()
            for value in (document.citation_title, document.doc_code or "", *document.diseases)
            if isinstance(value, str) and value.strip()
        )

    # Preserve source order while dropping duplicates; the API accepts a
    # sequence and receives a bounded prompt even when an editor catalog grows.
    return list(dict.fromkeys(candidates))[:30]


def _safe_filename(filename: str | None, content_type: str) -> str:
    """Give the SDK a filename without trusting a browser-provided path."""
    suffix_by_type = {
        "audio/webm": ".webm",
        "audio/mp4": ".m4a",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/ogg": ".ogg",
    }
    suffix = suffix_by_type[content_type]
    candidate = (filename or "recording").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    return candidate if candidate.lower().endswith(suffix) else f"recording{suffix}"


def _voice_unavailable(exc: Exception) -> HTTPException:
    logger.warning("[voice] provider unavailable: %s", type(exc).__name__)
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Dịch vụ giọng nói đang tạm thời không phản hồi. Bạn có thể gõ câu hỏi hoặc thử lại sau ít phút.",
    )


async def _transcribe_upload(*, audio: UploadFile, patient: Patient) -> str:
    """Validate and transcribe one in-memory recording.

    Kept in this module so `/voice/transcriptions` and the full voice-chat
    endpoint apply precisely the same size, MIME and patient-specific keyword
    rules. Neither caller stores ``content`` or the raw audio file.
    """
    content_type = (audio.content_type or "").lower().split(";", 1)[0]
    if content_type not in _ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Định dạng ghi âm chưa được hỗ trợ. Hãy thử lại bằng trình duyệt hiện đại.",
        )

    settings = get_settings()
    content = await audio.read(settings.voice_max_audio_bytes + 1)
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Không nhận được âm thanh")
    if len(content) > settings.voice_max_audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Bản ghi quá dài. Hãy nói ngắn hơn rồi thử lại.",
        )

    try:
        return await asyncio.to_thread(
            VoiceService(settings=settings).transcribe,
            filename=_safe_filename(audio.filename, content_type),
            content=content,
            content_type=content_type,
            keywords=_medical_keywords_for_patient(patient),
        )
    except VoiceServiceError as exc:
        raise _voice_unavailable(exc) from exc
    except Exception as exc:  # Provider details must not leak to patients.
        raise _voice_unavailable(exc) from exc


@router.post("/transcriptions", response_model=VoiceTranscriptionResponse)
async def transcribe_voice(
    patient_id: str = Form(...),
    audio: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> VoiceTranscriptionResponse:
    """Transcribe a short recording in memory; recordings are never persisted."""
    _require_patient_access(patient_id, current_user)
    patient = await _get_patient(db, patient_id)
    transcript = await _transcribe_upload(audio=audio, patient=patient)

    return VoiceTranscriptionResponse(transcript=transcript)


@router.post("/chat/stream", summary="Voice chat (STT + agent SSE)")
async def voice_chat_stream(
    patient_id: str = Form(...),
    audio: UploadFile = File(...),
    conversation_id: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> StreamingResponse:
    """Run one voice turn entirely on the server.

    The browser sends a recording once. The server validates/transcribes it,
    then hands the resulting text to the exact existing chat SSE flow. This
    preserves LangGraph routing, RAG, verifier, red-flag handling, persistence,
    citations and routine memory without letting the client decide any of those
    steps. The initial ``transcript`` event is only for the UI to show what was
    understood before normal ``step``/``token``/``done`` events begin.
    """
    _require_patient_access(patient_id, current_user)
    patient = await _get_patient(db, patient_id)
    transcript = await _transcribe_upload(audio=audio, patient=patient)

    # Delegate authorization/history/persistence/agent execution to the one
    # canonical chat route rather than recreating medical workflow here.
    agent_stream = await chat_stream(
        ChatRequest(
            query=transcript,
            patient_id=patient_id,
            conversation_id=conversation_id,
        ),
        db=db,
        current_user=current_user,
    )

    async def generate():
        transcript_payload = json.dumps({"transcript": transcript}, ensure_ascii=False)
        yield f"event: transcript\ndata: {transcript_payload}\n\n"
        async for chunk in agent_stream.body_iterator:
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/speech", response_class=Response)
async def synthesize_verified_answer(
    request: VoiceSpeechRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> Response:
    """Read one persisted, non-emergency assistant answer aloud as MP3."""
    _require_patient_access(request.patient_id, current_user)
    await _get_patient(db, request.patient_id)

    result = await db.execute(
        select(Message).join(Conversation).where(
            Message.id == request.message_id,
            Message.role == "assistant",
            Message.status.in_(("answered", "partial", "refused", "referral")),
            Conversation.patient_id == request.patient_id,
        )
    )
    message = result.scalars().first()
    if message is None:
        # Red-flag answers are intentionally not available through TTS. The
        # user must see emergency guidance immediately instead of relying on
        # delayed audio playback.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy câu trả lời có thể đọc thành tiếng")

    settings = get_settings()
    if len(message.content) > settings.voice_tts_max_chars:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Câu trả lời này quá dài để đọc thành tiếng. Bạn vẫn có thể đọc nội dung trên màn hình.",
        )

    try:
        audio = await asyncio.to_thread(VoiceService(settings=settings).synthesize, text=message.content)
    except VoiceServiceError as exc:
        raise _voice_unavailable(exc) from exc
    except Exception as exc:
        raise _voice_unavailable(exc) from exc

    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": 'inline; filename="eduhealth-answer.mp3"',
        },
    )
