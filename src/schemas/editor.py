from typing import Literal, Optional
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
    source_url: Optional[str] = None
    issuer: Optional[str] = None
    doc_code: Optional[str] = None
    conditions: list[PatientCondition] = Field(default_factory=list)
    review_note: Optional[str] = None
    reject_reason: Optional[str] = None
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None


class EditorApproveRequest(BaseModel):
    content: Optional[str] = None
    note: Optional[str] = None


class EditorRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1)


class OutOfScopeLogSchema(BaseModel):
    log_id: str
    question: str
    ask_count: int
    last_asked_at: str
    drafted: bool
    drafted_item_id: Optional[str] = None


class OutOfScopeLogList(BaseModel):
    logs: list[OutOfScopeLogSchema] = Field(default_factory=list)
