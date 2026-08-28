"""Small server-side adapter for OpenAI transcription and speech APIs.

The browser never receives an OpenAI key. This service intentionally knows
nothing about LangGraph: callers transcribe first, then send text through the
existing guarded chat route; speech is only generated from a stored assistant
answer after verification has completed.
"""

from __future__ import annotations

from typing import Any

from src.core.config import Settings, get_settings


class VoiceServiceError(RuntimeError):
    """A safe, provider-independent error for the voice API layer."""


class VoiceService:
    def __init__(self, *, settings: Settings | None = None, client: Any | None = None) -> None:
        self.settings = settings or get_settings()
        self._client = client

    @property
    def client(self) -> Any:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise VoiceServiceError("OPENAI_API_KEY chưa được cấu hình cho chức năng giọng nói")
            try:
                from openai import OpenAI
            except ImportError as exc:  # pragma: no cover - covered by app dependencies
                raise VoiceServiceError("Ứng dụng chưa cài OpenAI SDK cho chức năng giọng nói") from exc
            self._client = OpenAI(api_key=self.settings.openai_api_key)
        return self._client

    def transcribe(
        self,
        *,
        filename: str,
        content: bytes,
        content_type: str,
        keywords: list[str],
    ) -> str:
        """Return only the transcript; neither the audio nor the response is stored."""
        result = self.client.audio.transcriptions.create(
            model=self.settings.voice_transcribe_model,
            file=(filename, content, content_type),
            language="vi",
            keywords=keywords,
            timeout=self.settings.voice_api_timeout_seconds,
        )
        transcript = result if isinstance(result, str) else getattr(result, "text", "")
        if not isinstance(transcript, str) or not transcript.strip():
            raise VoiceServiceError("Dịch vụ không nhận được nội dung lời nói")
        return transcript.strip()

    def synthesize(self, *, text: str) -> bytes:
        """Synthesize a verified answer using an accessible Vietnamese delivery."""
        result = self.client.audio.speech.create(
            model=self.settings.voice_tts_model,
            voice=self.settings.voice_tts_voice,
            input=text,
            response_format="mp3",
            instructions=(
                "Đọc tiếng Việt rõ ràng, ấm áp và chậm vừa phải. "
                "Đọc chính xác thuật ngữ y khoa, số đo và đơn vị. "
                "Không tự thêm, bỏ bớt hoặc diễn giải nội dung."
            ),
            timeout=self.settings.voice_api_timeout_seconds,
        )
        content = getattr(result, "content", None)
        if not isinstance(content, bytes) or not content:
            raise VoiceServiceError("Dịch vụ không tạo được âm thanh")
        return content
