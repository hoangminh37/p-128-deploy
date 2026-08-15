"""HTTP schemas: ChatRequest, ChatResponse, StreamEvent."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class Citation(BaseModel):
    id: int = Field(..., ge=1)
    title: str
    issuer: str
    doc_code: str | None = None
    url: str | None = None
    snippet: str = Field(..., max_length=300)


class ChatRequest(BaseModel):
    """Request body cho POST /api/v1/chat và /api/v1/chat/stream."""

    query: str = Field(..., min_length=1, max_length=5000)
    patient_id: str
    conversation_id: str | None = None

    def to_agent_state(self) -> dict[str, Any]:
        """Convert to initial AgentState dict cho LangGraph."""
        return {
            "query": self.query,
            "patient_id": self.patient_id,
            # Mock patient_profile since FE doesn't send it anymore, backend MUST fetch it.
            # In a real system, this would be fetched from DB using patient_id.
            "patient_profile": {
                "patient_id": self.patient_id,
                "age": 30,
                "primary_condition": "hypertension",
                "comorbidities": [],
                "diagnosed_at": "2026-01",
                "asking_as": "self"
            },
            "messages": [],  # History should also be fetched from DB
            "retry_count": 0,
            "metadata": {},
        }


class ResponseMetadata(BaseModel):
    latency_ms: int
    cached: bool


class ChatResponse(BaseModel):
    """Response cho POST /api/v1/chat (non-streaming)."""

    conversation_id: str
    message_id: str
    status: Literal["answered", "partial", "red_flag", "refused", "referral"]
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    support_level: Literal["fully", "partially", "no_support"] | None = None
    disclaimer: str
    metadata: ResponseMetadata


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
