"""Voice adapter tests run entirely against a fake SDK client."""

from types import SimpleNamespace

import pytest

from src.core.config import Settings
from src.services.voice import VoiceService, VoiceServiceError


class _FakeTranscriptions:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(text="  Chỉ số HbA1c của tôi là bao nhiêu?  ")


class _FakeSpeech:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(content=b"ID3voice")


def _fake_client() -> tuple[SimpleNamespace, _FakeTranscriptions, _FakeSpeech]:
    transcriptions = _FakeTranscriptions()
    speech = _FakeSpeech()
    client = SimpleNamespace(audio=SimpleNamespace(transcriptions=transcriptions, speech=speech))
    return client, transcriptions, speech


def _settings() -> Settings:
    return Settings(
        openai_api_key="test-key",
        voice_transcribe_model="gpt-transcribe",
        voice_tts_model="gpt-4o-mini-tts",
        voice_tts_voice="alloy",
        voice_api_timeout_seconds=20,
    )


def test_transcribe_uses_vietnamese_and_editorial_keyword_hints():
    client, transcriptions, _ = _fake_client()
    service = VoiceService(settings=_settings(), client=client)

    transcript = service.transcribe(
        filename="question.webm",
        content=b"audio",
        content_type="audio/webm",
        keywords=["HbA1c", "đái tháo đường"],
    )

    assert transcript == "Chỉ số HbA1c của tôi là bao nhiêu?"
    assert transcriptions.calls == [
        {
            "model": "gpt-transcribe",
            "file": ("question.webm", b"audio", "audio/webm"),
            "language": "vi",
            "keywords": ["HbA1c", "đái tháo đường"],
            "timeout": 20.0,
        }
    ]


def test_synthesize_uses_tts_model_and_returns_only_audio_bytes():
    client, _, speech = _fake_client()
    service = VoiceService(settings=_settings(), client=client)

    assert service.synthesize(text="Nội dung đã xác minh") == b"ID3voice"
    call = speech.calls[0]
    assert call["model"] == "gpt-4o-mini-tts"
    assert call["voice"] == "alloy"
    assert call["input"] == "Nội dung đã xác minh"
    assert call["response_format"] == "mp3"
    assert call["timeout"] == 20.0


def test_voice_service_requires_server_openai_key():
    service = VoiceService(settings=Settings(openai_api_key=""))

    with pytest.raises(VoiceServiceError, match="OPENAI_API_KEY"):
        _ = service.client
