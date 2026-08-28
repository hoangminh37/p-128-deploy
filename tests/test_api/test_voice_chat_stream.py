"""Regression coverage for the server-owned voice chat flow."""

from collections.abc import AsyncIterator
from types import SimpleNamespace

import pytest
from fastapi.responses import StreamingResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.v1 import voice
from src.api.v1.auth import get_current_user
from src.core.database import get_db
from src.main import app
from src.schemas.patient import UserInfo


@pytest.mark.asyncio
async def test_voice_chat_transcribes_then_delegates_to_canonical_chat_stream(monkeypatch):
    """The client must not have to chain STT and the medical agent itself."""

    captured: dict[str, object] = {}

    async def override_db() -> AsyncIterator[AsyncSession]:
        yield SimpleNamespace()  # type: ignore[misc]

    async def override_current_user() -> UserInfo:
        return UserInfo(
            user_id="u_voice",
            email="voice@example.com",
            role="patient",
            patient_id="p_voice",
        )

    async def fake_get_patient(db: AsyncSession, patient_id: str):
        assert patient_id == "p_voice"
        return SimpleNamespace(id=patient_id, primary_condition="hypertension", comorbidities=[])

    async def fake_transcribe_upload(*, audio, patient) -> str:
        assert patient.id == "p_voice"
        assert await audio.read() == b"recording"
        return "Tôi nên đo huyết áp lúc nào?"

    async def fake_chat_stream(request, db, current_user):
        captured["request"] = request

        async def events():
            yield 'event: done\ndata: {"message_id":"m_voice","status":"answered"}\n\n'

        return StreamingResponse(events(), media_type="text/event-stream")

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_current_user
    monkeypatch.setattr(voice, "_get_patient", fake_get_patient)
    monkeypatch.setattr(voice, "_transcribe_upload", fake_transcribe_upload)
    monkeypatch.setattr(voice, "chat_stream", fake_chat_stream)

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/voice/chat/stream",
                data={"patient_id": "p_voice"},
                files={"audio": ("question.webm", b"recording", "audio/webm")},
            )
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    assert 'event: transcript\ndata: {"transcript": "Tôi nên đo huyết áp lúc nào?"}' in response.text
    assert 'event: done\ndata: {"message_id":"m_voice","status":"answered"}' in response.text
    request = captured["request"]
    assert request.query == "Tôi nên đo huyết áp lúc nào?"
    assert request.patient_id == "p_voice"
