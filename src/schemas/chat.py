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

    def to_agent_state(self, patient_profile_dict: dict[str, Any]) -> dict[str, Any]:
        """Convert to initial AgentState dict cho LangGraph."""
        return {
            "query": self.query,
            "patient_id": self.patient_id,
            "patient_profile": patient_profile_dict,
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


class ConversationSummary(BaseModel):
    conversation_id: str
    title: str
    last_message_at: str
    message_count: int


class ConversationList(BaseModel):
    conversations: list[ConversationSummary] = Field(default_factory=list)


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: str
    
    # Optional fields for assistant
    message_id: str | None = None
    status: Literal["answered", "partial", "red_flag", "refused", "referral"] | None = None
    citations: list[Citation] = Field(default_factory=list)
    support_level: Literal["fully", "partially", "no_support"] | None = None


class ConversationDetail(BaseModel):
    conversation_id: str
    messages: list[ConversationMessage] = Field(default_factory=list)

