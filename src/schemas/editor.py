from typing import Literal

from pydantic import BaseModel, Field

EditorItemStatus = Literal["draft", "pending", "approved", "rejected"]
EditorItemOrigin = Literal["question_log", "editor_upload"]
PatientCondition = Literal["type2_diabetes", "hypertension"]


class EditorDashboard(BaseModel):
    """Response GET /editor/dashboard."""

    pending_count: int = Field(..., ge=0)
    out_of_scope_count: int = Field(..., ge=0)


class EditorQueueItem(BaseModel):
    """Một dòng trong GET /editor/queue."""

    item_id: str
    title: str = Field(..., max_length=120)
    origin: EditorItemOrigin
    topics: list[str] = Field(default_factory=list)
    created_at: str
    status: EditorItemStatus


class EditorQueueList(BaseModel):
    items: list[EditorQueueItem] = Field(default_factory=list)


class EditorQueueItemDetail(EditorQueueItem):
    """Chi tiết một mục trong hàng đợi."""

    content: str
    source_url: str | None = None
    issuer: str | None = None
    doc_code: str | None = None
    conditions: list[PatientCondition] = Field(default_factory=list)
    review_note: str | None = None
    reject_reason: str | None = None
    reviewed_at: str | None = None
    reviewed_by: str | None = None


class EditorApproveRequest(BaseModel):
    content: str | None = None
    note: str | None = None


class EditorRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1)


class OutOfScopeLogSchema(BaseModel):
    log_id: str
    question: str
    ask_count: int
    last_asked_at: str
    drafted: bool
    drafted_item_id: str | None = None


class OutOfScopeLogList(BaseModel):
    logs: list[OutOfScopeLogSchema] = Field(default_factory=list)
