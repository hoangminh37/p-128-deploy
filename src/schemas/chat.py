"""HTTP schemas: ChatRequest, ChatResponse, StreamEvent."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from src.schemas.patient import Citation, Message, PatientProfile


class ChatRequest(BaseModel):
    """Request body cho POST /api/v1/chat và /api/v1/chat/stream."""

    message: str = Field(..., min_length=1, max_length=4096)
    patient_id: str = "anonymous"
    patient_profile: PatientProfile = Field(default_factory=PatientProfile)
    history: list[Message] = Field(default_factory=list)

    def to_agent_state(self) -> dict[str, Any]:
        """Convert to initial AgentState dict cho LangGraph."""
        return {
            "query": self.message,
            "patient_id": self.patient_id,
            "patient_profile": self.patient_profile.model_dump(),
            "messages": [m.model_dump() for m in self.history],
            "retry_count": 0,
            "metadata": {},
        }


class ChatResponse(BaseModel):
    """Response cho POST /api/v1/chat (non-streaming)."""

    response: str
    intent: str = ""
    support_level: str = "fully"
    citations: list[Citation] = Field(default_factory=list)
    disclaimer: str = ""


class StepEvent(BaseModel):
    """SSE event: step — trạng thái xử lý của từng node."""

    node: str
    message: str
    icon: str = "⚙️"


class TokenEvent(BaseModel):
    """SSE event: token — từng từ của response đã verified."""

    text: str


class DoneEvent(BaseModel):
    """SSE event: done — kết thúc pipeline."""

    citations: list[Citation] = Field(default_factory=list)
    support_level: str = "fully"
    intent: str = ""
    disclaimer: str = ""
