"""HTTP schemas: ChatRequest, ChatResponse, StreamEvent."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class Citation(BaseModel):
    id: int = Field(..., ge=1)
    title: str
    issuer: str
    doc_code: str | None = None
    url: str | None = None
    snippet: str = Field(..., max_length=300)
    # Hai khoá này đưa người đọc từ citation vào đúng đoạn đã được truy xuất.
    # Optional để lịch sử chat lưu trước khi có tính năng này vẫn đọc được.
    document_id: str | None = None
    chunk_id: str | None = None

    @field_validator("url", "document_id", "chunk_id", mode="before")
    @classmethod
    def _blank_optional_source_value_is_none(cls, value: object) -> object:
        """Do not serialize Chroma's empty metadata strings as working links."""
        if isinstance(value, str):
            return value.strip() or None
        return value


class ChatRequest(BaseModel):
    """Request body cho POST /api/v1/chat và /api/v1/chat/stream."""

    query: str = Field(..., min_length=1, max_length=5000)
    patient_id: str
    conversation_id: str | None = None

    def to_agent_state(
        self,
        patient_profile_dict: dict[str, Any],
        messages: list[dict[str, str]] | None = None,
        patient_routine: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Convert to initial AgentState dict cho LangGraph."""
        return {
            "query": self.query,
            "patient_id": self.patient_id,
            "patient_profile": patient_profile_dict,
            "messages": messages or [],
            "patient_routine": patient_routine or [],
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
