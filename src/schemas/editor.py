from typing import Literal

from pydantic import BaseModel, Field

EditorItemStatus = Literal["draft", "pending", "indexing", "failed", "approved", "rejected"]
EditorItemOrigin = Literal["question_log", "editor_upload"]
PatientCondition = Literal["type2_diabetes", "hypertension"]
SourceOrigin = Literal["system", "editor_upload"]
SourceApprovalStatus = Literal[
    "approved",
    "pending_review",
    "indexing",
    "index_failed",
    "draft",
    "quarantined",
]
SourceIndexStatus = Literal["indexed", "indexing", "failed", "not_indexed", "not_applicable", "unavailable"]
# Loại có thể trình bày trực tiếp trong trình duyệt. Giá trị này mô tả file
# thật của nguồn, không suy ra từ title hay từ các chunk trong Vector Store.
SourceViewerType = Literal["pdf", "markdown", "unsupported"]


class EditorDashboard(BaseModel):
    """Response GET /editor/dashboard."""

    pending_count: int = Field(..., ge=0)
    out_of_scope_count: int = Field(..., ge=0)


class EditorSourceDocument(BaseModel):
    """Một tài liệu nguồn trong thư viện thật mà agent có thể hoặc sẽ có thể dùng.

    ``approval_status`` lấy từ registry — nguồn sự thật của ranh giới duyệt.
    ``index_status`` được đối chiếu với Vector Store ở thời điểm gọi API, để
    giao diện không nói một tài liệu "đã duyệt" là đã dùng được khi index đang
    thiếu hoặc lỗi.
    """

    document_id: str
    title: str
    issuer: str
    doc_code: str | None = None
    published: str
    conditions: list[str] = Field(default_factory=list)
    source_origin: SourceOrigin
    approval_status: SourceApprovalStatus
    index_status: SourceIndexStatus
    chunk_count: int | None = Field(default=None, ge=0)
    url: str | None = None
    uploaded_at: str | None = None
    viewer_type: SourceViewerType
    # File gốc không được commit vào Git. Vì vậy phải trả sự thật này cho UI:
    # nguồn có thể đã index và agent vẫn dùng được, nhưng bản PDF/Markdown gốc
    # có thể không nằm trên chính server đang chạy.
    source_file_available: bool
    # Là lúc trạng thái hiện tại được quyết định: duyệt với nguồn được phép,
    # hoặc từ chối với nguồn quarantine. Một số registry cũ chỉ lưu ngày.
    status_at: str | None = None
    index_attempts: int = Field(default=0, ge=0)
    index_error: str | None = None
    index_started_at: str | None = None
    index_completed_at: str | None = None


class EditorSourceDocumentList(BaseModel):
    documents: list[EditorSourceDocument] = Field(default_factory=list)


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
    # Có giá trị khi hàng đợi này đại diện cho một SourceDoc tải lên. Các mục
    # question_log không phải file nguồn RAG nên không có lifecycle index.
    source_approval_status: SourceApprovalStatus | None = None
    source_index_error: str | None = None
    indexed_chunk_count: int | None = Field(default=None, ge=0)
    index_attempts: int | None = Field(default=None, ge=0)
    index_started_at: str | None = None
    index_completed_at: str | None = None


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
