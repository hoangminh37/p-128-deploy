"""HTTP contracts for the optional voice interface.

Audio itself is deliberately absent from these response schemas. The server
uses it only to obtain a transcript and never persists the recording.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class VoiceTranscriptionResponse(BaseModel):
    """Vietnamese transcript returned after a short microphone recording."""

    transcript: str = Field(min_length=1, max_length=5_000)
    language: str = "vi"


class VoiceSpeechRequest(BaseModel):
    """Request to synthesize one already verified assistant message."""

    patient_id: str = Field(min_length=1, max_length=128)
    message_id: str = Field(min_length=1, max_length=128)
