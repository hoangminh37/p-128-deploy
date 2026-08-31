from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_serializer, field_validator

EditorItemStatus = Literal["draft", "pending", "indexing", "failed", "approved", "rejected"]
EditorItemOrigin = Literal["question_log", "editor_upload"]
PatientEditorialQuestionStatus = Literal["pending", "answered"]
# Condition IDs are registry data, not a code enum. Keeping this as ``str`` is
# what allows a BTV-added runtime condition to flow from upload to RAG without a
# backend redeploy.
PatientCondition = str
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
EditorConditionOrigin = Literal["system", "editor_runtime"]
EditorConditionStatus = Literal["waiting_for_sources", "active", "inactive"]


class EditorDashboard(BaseModel):
    """Response GET /editor/dashboard."""

    pending_count: int = Field(..., ge=0)
    out_of_scope_count: int = Field(..., ge=0)
    patient_question_count: int = Field(default=0, ge=0)


class EditorCondition(BaseModel):
    """One condition available in the RAG registry and the BTV upload form."""

    condition_id: str
    label_vi: str
    label_en: str | None = None
    aliases: list[str] = Field(default_factory=list)
    origin: EditorConditionOrigin
    status: EditorConditionStatus
    source_document_count: int = Field(default=0, ge=0)
    approved_source_count: int = Field(default=0, ge=0)
    created_at: str | None = None
    updated_at: str | None = None


class EditorConditionList(BaseModel):
    conditions: list[EditorCondition] = Field(default_factory=list)


class EditorCreateConditionRequest(BaseModel):
    condition_id: str = Field(min_length=2, max_length=64)
    label_vi: str = Field(min_length=2, max_length=120)
    label_en: str | None = Field(default=None, max_length=120)
    aliases: list[str] = Field(default_factory=list, max_length=20)


class EditorConditionStatusRequest(BaseModel):
    status: Literal["active", "inactive"]


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


class EditorDraftUpdateRequest(BaseModel):
    """Complete editable working copy of a question-log draft."""

    title: str = Field(min_length=1, max_length=120)
    content: str = ""
    topics: list[str] = Field(default_factory=list, max_length=20)
    conditions: list[PatientCondition] = Field(default_factory=list, max_length=20)
    source_url: str | None = Field(default=None, max_length=2_000)
    issuer: str | None = Field(default=None, max_length=240)
    doc_code: str | None = Field(default=None, max_length=120)

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        title = value.strip()
        if title == "":
            raise ValueError("Tiêu đề bản nháp không được để trống")
        return title

    @field_validator("source_url", "issuer", "doc_code", mode="before")
    @classmethod
    def blank_metadata_is_none(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @field_validator("topics", "conditions")
    @classmethod
    def normalize_list_values(cls, values: list[str]) -> list[str]:
        """Trim and deduplicate editor input without changing its order."""
        normalized: list[str] = []
        for value in values:
            item = value.strip()
            if item and item not in normalized:
                normalized.append(item)
        return normalized


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


class PatientEditorialQuestionSchema(BaseModel):
    """A patient request visible to BTV without unrelated profile details."""

    request_id: str
    question: str
    status: PatientEditorialQuestionStatus
    created_at: datetime
    answer: str | None = None
    answered_at: datetime | None = None

    @field_serializer("created_at", "answered_at", when_used="json")
    def serialize_audit_datetime_as_utc(self, value: datetime | None) -> str | None:
        """Expose audit timestamps as unambiguous UTC ISO-8601 values.

        SQLite's existing rows were written with ``datetime.utcnow()``, so
        they are naive values even though the application has always treated
        them as UTC. Normalise at the API boundary rather than changing old
        records or weakening the frontend's strict timestamp contract.
        """
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


class PatientEditorialQuestionList(BaseModel):
    requests: list[PatientEditorialQuestionSchema] = Field(default_factory=list)


class AnswerPatientEditorialQuestionRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=4_000)
