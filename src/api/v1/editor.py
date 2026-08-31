import asyncio
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.v1.auth import get_editor_user
from src.core.database import async_session_maker, get_db
from src.core.logging import get_logger
from src.models.domain import EditorQueueItem as EditorQueueItemModel
from src.models.domain import OutOfScopeLog, PatientEditorialQuestion, PatientNotification
from src.rag.config import get_rag_settings

# Import rag modules
from src.rag.ingest import approve, stage_upload, start_indexing
from src.rag.ingest import reject as reject_source
from src.rag.registry import (
    QuarantinedDoc,
    SourceDoc,
    create_runtime_disease,
    load_registry,
    quarantined_uploads,
    runtime_diseases,
    set_runtime_disease_status,
    uploaded_docs,
)
from src.rag.store import VectorStore
from src.schemas.editor import (
    AnswerPatientEditorialQuestionRequest,
    EditorApproveRequest,
    EditorCondition,
    EditorConditionList,
    EditorConditionStatusRequest,
    EditorCreateConditionRequest,
    EditorDashboard,
    EditorDraftUpdateRequest,
    EditorItemStatus,
    EditorQueueItem,
    EditorQueueItemDetail,
    EditorQueueList,
    EditorRejectRequest,
    EditorSourceDocument,
    EditorSourceDocumentList,
    OutOfScopeLogList,
    OutOfScopeLogSchema,
    PatientEditorialQuestionList,
    PatientEditorialQuestionSchema,
    PatientEditorialQuestionStatus,
)
from src.schemas.patient import UserInfo

router = APIRouter(prefix="/editor", tags=["editor"])
logger = get_logger(__name__)


# Các định dạng có màn xem toàn văn ở frontend. Đây là năng lực trình bày của
# trình duyệt, tách khỏi SUPPORTED_SUFFIXES của ingest (Docling có thể đọc thêm
# DOCX/PPTX/XLSX nhưng không có nghĩa là ta nên giả vờ render chúng như PDF).
_VIEWER_MEDIA_TYPES = {
    ".pdf": ("pdf", "application/pdf"),
    ".md": ("markdown", "text/markdown"),
    ".markdown": ("markdown", "text/markdown"),
    ".mdown": ("markdown", "text/markdown"),
    ".mkdn": ("markdown", "text/markdown"),
}


def _viewer_type(filename: str) -> str:
    return _VIEWER_MEDIA_TYPES.get(Path(filename).suffix.lower(), ("unsupported", ""))[0]


def _source_file_path(document: SourceDoc) -> Path | None:
    """Resolve one registry file inside ``data/raw`` without path traversal.

    ``SourceDoc.file`` is editorial data, not a request path. Still constrain it
    to raw_dir before reading: a malformed manifest must never let an editor API
    expose .env, the database, or another file outside the document store.
    """
    raw_dir = get_rag_settings().raw_dir.resolve()
    candidate = (raw_dir / document.file).resolve()
    try:
        candidate.relative_to(raw_dir)
    except ValueError:
        logger.warning("[editor_documents] source file outside raw_dir for %s", document.doc_id)
        return None
    return candidate if candidate.is_file() else None


def _indexed_chunk_counts() -> dict[str, int]:
    """Read index coverage without embedding or issuing any external request."""
    stats = VectorStore().stats()
    return {str(doc_id): int(count) for doc_id, count in stats.get("per_doc", {}).items()}


def _source_document_schema(
    document: SourceDoc,
    *,
    source_origin: str,
    indexed_chunk_counts: dict[str, int] | None,
) -> EditorSourceDocument:
    """Build the editor-facing status from registry approval plus index facts."""
    if document.status == "indexing":
        index_status = "indexing"
        chunk_count = None
    elif document.status == "index_failed":
        index_status = "failed"
        chunk_count = None
    elif document.status != "approved":
        index_status = "not_applicable"
        chunk_count = None
    elif indexed_chunk_counts is None:
        index_status = "unavailable"
        chunk_count = None
    else:
        chunk_count = indexed_chunk_counts.get(document.doc_id, 0)
        index_status = "indexed" if chunk_count > 0 else "not_indexed"

    source_file = _source_file_path(document)

    return EditorSourceDocument(
        document_id=document.doc_id,
        title=document.citation_title,
        issuer=document.citation_issuer,
        doc_code=document.doc_code,
        published=document.published,
        conditions=document.diseases,
        source_origin=source_origin,
        approval_status=document.status,
        index_status=index_status,
        chunk_count=chunk_count,
        url=document.url,
        uploaded_at=document.uploaded_at,
        viewer_type=_viewer_type(document.file),
        source_file_available=source_file is not None,
        status_at=document.index_completed_at or document.approved_at or document.index_started_at,
        index_attempts=document.index_attempts,
        index_error=document.index_error,
        index_started_at=document.index_started_at,
        index_completed_at=document.index_completed_at,
    )


def _condition_schema(
    *,
    condition_id: str,
    config: dict,
    origin: str,
    runtime_status: str | None,
    created_at: str | None,
    updated_at: str | None,
    source_document_count: int,
    approved_source_count: int,
) -> EditorCondition:
    """Map one merged registry condition to the editor's safe API contract."""
    return EditorCondition(
        condition_id=condition_id,
        label_vi=str(config.get("label_vi") or condition_id),
        label_en=str(config["label_en"]) if config.get("label_en") else None,
        aliases=[str(alias) for alias in config.get("aliases", [])],
        origin=origin,  # type: ignore[arg-type]
        status=runtime_status or "active",  # type: ignore[arg-type]
        source_document_count=source_document_count,
        approved_source_count=approved_source_count,
        created_at=created_at,
        updated_at=updated_at,
    )


def _quarantined_document_schema(document: QuarantinedDoc, *, source_origin: str) -> EditorSourceDocument:
    """Expose a rejected source as history only; it is never queried by RAG."""
    return EditorSourceDocument(
        document_id=document.doc_id,
        title=document.title,
        issuer=document.issuer or "Chưa ghi nhận",
        doc_code=document.doc_code,
        published=document.published or "Chưa ghi nhận",
        conditions=[],
        source_origin=source_origin,
        approval_status="quarantined",
        index_status="not_applicable",
        chunk_count=None,
        viewer_type=_viewer_type(document.file),
        source_file_available=False,
        status_at=document.decided_at,
    )


def _uploaded_source_by_id(document_id: str) -> SourceDoc | None:
    """Find a runtime upload without treating static registry docs as queue work."""
    return next((document for document in uploaded_docs() if document.doc_id == document_id), None)


def _queue_status_for_source(document: SourceDoc) -> str:
    """Map source-of-truth RAG state to the legacy queue row for filtering."""
    return {
        "pending_review": "pending",
        "indexing": "indexing",
        "index_failed": "failed",
        "approved": "approved",
    }.get(document.status, "pending")


async def _synchronize_source_queue_states(db: AsyncSession) -> None:
    """Repair queue projections from uploads.json before serving editor pages.

    SQLite's existing editor_queue table has no job columns and must not become
    a second source of truth. This small projection lets old deployments show
    correct filters after a process restart while lifecycle facts stay in the
    SourceDoc record.
    """
    sources = {document.doc_id: document for document in uploaded_docs()}
    result = await db.execute(select(EditorQueueItemModel).filter(EditorQueueItemModel.origin == "editor_upload"))
    changed = False
    for item in result.scalars().all():
        source = sources.get(item.id)
        if source is None:
            continue
        expected = _queue_status_for_source(source)
        if item.status != expected:
            item.status = expected
            changed = True
    if changed:
        await db.commit()


def _queue_item_detail(item: EditorQueueItemModel) -> EditorQueueItemDetail:
    """Compose DB review fields with the authoritative source-index lifecycle."""
    source = _uploaded_source_by_id(item.id) if item.origin == "editor_upload" else None
    return EditorQueueItemDetail(
        item_id=item.id,
        title=item.title,
        origin=item.origin,
        topics=item.topics,
        created_at=item.created_at.isoformat() + "Z" if item.created_at else "",
        status=item.status,
        content=item.content,
        source_url=item.source_url,
        issuer=item.issuer,
        doc_code=item.doc_code,
        conditions=item.conditions,
        review_note=item.review_note,
        reject_reason=item.reject_reason,
        reviewed_at=item.reviewed_at.isoformat() + "Z" if item.reviewed_at else None,
        reviewed_by=item.reviewed_by,
        source_approval_status=source.status if source is not None else None,
        source_index_error=source.index_error if source is not None else None,
        indexed_chunk_count=source.indexed_chunks if source is not None else None,
        index_attempts=source.index_attempts if source is not None else None,
        index_started_at=source.index_started_at if source is not None else None,
        index_completed_at=source.index_completed_at if source is not None else None,
    )


def _patient_question_schema(item: PatientEditorialQuestion) -> PatientEditorialQuestionSchema:
    """Project only the request and editorial response BTV needs to handle."""
    return PatientEditorialQuestionSchema(
        request_id=item.id,
        question=item.question,
        status=item.status,  # type: ignore[arg-type]
        created_at=item.created_at,
        answer=item.answer,
        answered_at=item.answered_at,
    )


async def _finish_source_index_queue_projection(document_id: str, queue_status: str) -> None:
    """Persist the UI projection after a background job completes or fails."""
    async with async_session_maker() as session:
        result = await session.execute(select(EditorQueueItemModel).filter(EditorQueueItemModel.id == document_id))
        item = result.scalars().first()
        if item is None:
            logger.warning("[editor_index] missing queue item for source %s", document_id)
            return
        item.status = queue_status
        await session.commit()


async def _run_source_index(document_id: str, approved_by: str) -> None:
    """Execute parse/chunk/embed/index off the event loop and project its result."""
    try:
        await asyncio.to_thread(approve, document_id, approved_by)
    except Exception:
        # approve() persists source.index_error before re-raising. Never expose
        # traceback to the editor, but retain it in server logs for operators.
        logger.exception("[editor_index] index failed for %s", document_id)
        await _finish_source_index_queue_projection(document_id, "failed")
    else:
        await _finish_source_index_queue_projection(document_id, "approved")


@router.get("/dashboard", response_model=EditorDashboard)
async def get_dashboard(db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_editor_user)):
    await _synchronize_source_queue_states(db)
    result_pending = await db.execute(select(EditorQueueItemModel).filter(EditorQueueItemModel.status == "pending"))
    pending_count = len(result_pending.scalars().all())

    # .is_(False) chứ không phải `not ...`: đây là biểu thức SQLAlchemy dựng câu
    # SQL, toán tử `not` của Python sẽ ép nó về bool và mất luôn mệnh đề lọc.
    result_oos = await db.execute(select(OutOfScopeLog).filter(OutOfScopeLog.drafted.is_(False)))
    oos_count = len(result_oos.scalars().all())
    result_patient_questions = await db.execute(
        select(PatientEditorialQuestion).filter(PatientEditorialQuestion.status == "pending")
    )
    patient_question_count = len(result_patient_questions.scalars().all())

    return EditorDashboard(
        pending_count=pending_count,
        out_of_scope_count=oos_count,
        patient_question_count=patient_question_count,
    )


@router.get("/conditions", response_model=EditorConditionList)
async def get_conditions(current_user: UserInfo = Depends(get_editor_user)):
    """List the merged condition catalog used by upload validation and RAG."""
    settings = get_rag_settings()
    registry = load_registry(settings=settings)
    runtime = runtime_diseases(settings)
    conditions: list[EditorCondition] = []
    for condition_id, config in registry.diseases.items():
        docs = [document for document in registry.documents if condition_id in document.diseases]
        approved_count = sum(document.status == "approved" for document in docs)
        runtime_disease = runtime.get(condition_id)
        conditions.append(
            _condition_schema(
                condition_id=condition_id,
                config=config,
                origin="editor_runtime" if runtime_disease is not None else "system",
                runtime_status=runtime_disease.status if runtime_disease is not None else None,
                created_at=runtime_disease.created_at if runtime_disease is not None else None,
                updated_at=runtime_disease.updated_at if runtime_disease is not None else None,
                source_document_count=len(docs),
                approved_source_count=approved_count,
            )
        )
    conditions.sort(key=lambda item: (item.status != "active", item.label_vi.casefold()))
    return EditorConditionList(conditions=conditions)


@router.post("/conditions", response_model=EditorCondition, status_code=status.HTTP_201_CREATED)
async def create_condition(
    payload: EditorCreateConditionRequest,
    current_user: UserInfo = Depends(get_editor_user),
):
    """Create a runtime condition. It waits for a successfully indexed source."""
    settings = get_rag_settings()
    try:
        disease = await asyncio.to_thread(
            create_runtime_disease,
            disease_id=payload.condition_id,
            label_vi=payload.label_vi,
            label_en=payload.label_en,
            aliases=payload.aliases,
            created_by=current_user.user_id,
            settings=settings,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return _condition_schema(
        condition_id=payload.condition_id.strip().lower(),
        config=disease.model_dump(mode="json"),
        origin="editor_runtime",
        runtime_status=disease.status,
        created_at=disease.created_at,
        updated_at=disease.updated_at,
        source_document_count=0,
        approved_source_count=0,
    )


@router.post("/conditions/{condition_id}/status", response_model=EditorCondition)
async def update_condition_status(
    condition_id: str,
    payload: EditorConditionStatusRequest,
    current_user: UserInfo = Depends(get_editor_user),
):
    """Temporarily disable a runtime condition or re-enable one with sources."""
    settings = get_rag_settings()
    registry = load_registry(settings=settings)
    docs = [document for document in registry.documents if condition_id in document.diseases]
    approved_count = sum(document.status == "approved" for document in docs)
    if payload.status == "active" and approved_count == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Chưa thể bật bệnh này vì chưa có tài liệu nào được index thành công.",
        )
    try:
        disease = await asyncio.to_thread(
            set_runtime_disease_status,
            condition_id,
            payload.status,
            settings=settings,
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bệnh runtime") from exc

    return _condition_schema(
        condition_id=condition_id,
        config=disease.model_dump(mode="json"),
        origin="editor_runtime",
        runtime_status=disease.status,
        created_at=disease.created_at,
        updated_at=disease.updated_at,
        source_document_count=len(docs),
        approved_source_count=approved_count,
    )


@router.get("/documents", response_model=EditorSourceDocumentList)
async def get_source_documents(current_user: UserInfo = Depends(get_editor_user)):
    """List the actual RAG source registry, including documents uploaded at runtime.

    The registry is deliberately the source of truth here, rather than
    ``editor_queue``. A queue row says that an editor has work to do; the
    registry says whether a source is allowed to enter the assistant's library.
    """
    registry = load_registry()
    uploaded_ids = {document.doc_id for document in uploaded_docs()}

    try:
        indexed_chunk_counts = await asyncio.to_thread(_indexed_chunk_counts)
    except Exception:
        # A temporary Chroma failure must not hide the library itself. The UI
        # receives an explicit unknown index state instead of a misleading zero.
        logger.exception("[editor_documents] cannot read vector store status")
        indexed_chunk_counts = None

    documents = [
        _source_document_schema(
            document,
            source_origin="editor_upload" if document.doc_id in uploaded_ids else "system",
            indexed_chunk_counts=indexed_chunk_counts,
        )
        for document in registry.documents
    ]
    documents.extend(
        _quarantined_document_schema(document, source_origin="system") for document in registry.quarantined
    )

    # Runtime rejections live outside registry.yaml so a reject operation never
    # rewrites the curated manifest. Deduplicate in case an operator later moves
    # one of those records into the static quarantine section.
    known_ids = {document.document_id for document in documents}
    documents.extend(
        _quarantined_document_schema(document, source_origin="editor_upload")
        for document in quarantined_uploads()
        if document.doc_id not in known_ids
    )

    approval_order = {
        "index_failed": 0,
        "pending_review": 1,
        "indexing": 2,
        "draft": 3,
        "approved": 4,
        "quarantined": 5,
    }
    documents.sort(
        key=lambda document: (
            approval_order[document.approval_status],
            document.source_origin != "editor_upload",
            document.title.casefold(),
        )
    )
    return EditorSourceDocumentList(documents=documents)


@router.get("/documents/{document_id}/file")
async def get_source_document_file(
    document_id: str,
    _current_user: UserInfo = Depends(get_editor_user),
):
    """Return the original PDF or Markdown to an authenticated editor only.

    This is intentionally a separate response from the list API. The list
    stays small and fast even when the source is a large clinical guideline;
    bytes are read only after the editor explicitly opens one document.
    """
    try:
        document = load_registry().by_id(document_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài liệu nguồn") from exc

    source_file = _source_file_path(document)
    if source_file is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bản gốc của tài liệu này không có trên máy chủ hiện tại",
        )

    viewer = _VIEWER_MEDIA_TYPES.get(source_file.suffix.lower())
    if viewer is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Định dạng file này chưa có màn xem toàn văn",
        )

    _viewer_type_name, media_type = viewer
    return FileResponse(source_file, media_type=media_type, filename=source_file.name)


@router.get("/queue", response_model=EditorQueueList)
async def get_queue(
    status: EditorItemStatus = Query("pending"),
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_editor_user),
):
    await _synchronize_source_queue_states(db)
    result = await db.execute(
        select(EditorQueueItemModel)
        .filter(EditorQueueItemModel.status == status)
        .order_by(EditorQueueItemModel.created_at.desc())
    )
    items = result.scalars().all()

    queue_list = []
    for item in items:
        queue_list.append(
            EditorQueueItem(
                item_id=item.id,
                title=item.title,
                origin=item.origin,
                topics=item.topics,
                created_at=item.created_at.isoformat() + "Z" if item.created_at else "",
                status=item.status,
            )
        )
    return EditorQueueList(items=queue_list)


@router.get("/queue/{item_id}", response_model=EditorQueueItemDetail)
async def get_queue_item(
    item_id: str, db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_editor_user)
):
    await _synchronize_source_queue_states(db)
    result = await db.execute(select(EditorQueueItemModel).filter(EditorQueueItemModel.id == item_id))
    item = result.scalars().first()

    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Không tìm thấy mục {item_id}")

    return _queue_item_detail(item)


@router.post("/queue/upload", response_model=EditorQueueItemDetail, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    issuer: str = Form(...),
    published: str = Form(...),
    diseases: str = Form(...),  # Comma separated
    doc_code: str = Form(None),
    url: str = Form(None),
    notes: str = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_editor_user),
):
    """Lưu một *nguồn RAG* vào hàng chờ; upload không sinh dữ liệu phụ ngầm."""
    content = await file.read()
    disease_list = [d.strip() for d in diseases.split(",") if d.strip()]

    # 1. Gọi hệ thống RAG ingest để stage_upload (Lưu vật lý vào ổ cứng)
    try:
        ingest_res = stage_upload(
            filename=file.filename,
            content=content,
            title=title,
            issuer=issuer,
            published=published,
            diseases=disease_list,
            doc_code=doc_code,
            url=url,
            notes=notes,
            uploaded_by=current_user.user_id,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Tạo projection hàng đợi cho đúng một SourceDoc. Không tự chạy ETL bài học
    # hoặc sinh các QueueItem khác: những dữ liệu đó có vòng duyệt riêng và
    # không được phép làm lẫn trạng thái "đã có trong RAG" của tài liệu nguồn.
    db_item = EditorQueueItemModel(
        id=ingest_res.doc_id,
        title=title,
        origin="editor_upload",
        status="pending",
        content="",
        source_url=url,
        issuer=issuer,
        doc_code=doc_code,
        conditions=disease_list,
        topics=disease_list,
    )
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)

    return await get_queue_item(db_item.id, db, current_user)


@router.post("/queue/{item_id}/approve", response_model=EditorQueueItemDetail)
async def approve_queue_item(
    item_id: str,
    payload: EditorApproveRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_editor_user),
):
    result = await db.execute(select(EditorQueueItemModel).filter(EditorQueueItemModel.id == item_id))
    item = result.scalars().first()

    if not item:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy mục {item_id}")
    source = _uploaded_source_by_id(item_id) if item.origin == "editor_upload" else None

    if source is not None:
        # SourceDoc là nguồn sự thật. Không tin trạng thái projection trong DB
        # vì background job hoặc một lần restart có thể vừa thay đổi nó.
        try:
            await asyncio.to_thread(start_indexing, item_id, current_user.user_id)
        except Exception as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        item.status = "indexing"
        item.review_note = payload.note
        item.reviewed_at = datetime.utcnow()
        item.reviewed_by = current_user.user_id
        await db.commit()
        await db.refresh(item)

        # Hàm chạy background dùng thread vì Docling/embedding là code đồng bộ
        # và không được chiếm event loop đang phục vụ chat bệnh nhân.
        background_tasks.add_task(_run_source_index, item_id, current_user.user_id)
        return _queue_item_detail(item)

    # Question log không phải SourceDoc nên không có file gốc để đưa vào RAG.
    # Trước đây code vẫn đẩy id này vào approve(), tạo một lỗi nền im lặng.
    if item.status in ["approved", "rejected"]:
        raise HTTPException(status_code=409, detail=f"Mục {item.id} đã ở trạng thái {item.status}")

    final_content = payload.content if payload.content is not None else item.content
    if not final_content.strip():
        raise HTTPException(status_code=422, detail="Cần có nội dung trước khi duyệt bản nháp")
    if not item.conditions:
        raise HTTPException(status_code=422, detail="Cần gắn ít nhất một bệnh trước khi duyệt bản nháp")

    item.status = "approved"
    item.content = final_content
    item.review_note = payload.note
    item.reviewed_at = datetime.utcnow()
    item.reviewed_by = current_user.user_id
    await db.commit()
    await db.refresh(item)
    return _queue_item_detail(item)


@router.patch("/queue/{item_id}/draft", response_model=EditorQueueItemDetail)
async def update_queue_draft(
    item_id: str,
    payload: EditorDraftUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_editor_user),
):
    """Persist a question-log draft without promoting it out of ``draft``."""
    result = await db.execute(select(EditorQueueItemModel).filter(EditorQueueItemModel.id == item_id))
    item = result.scalars().first()
    if item is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy mục {item_id}")
    if item.status != "draft":
        raise HTTPException(status_code=409, detail="Chỉ mục đang ở trạng thái nháp mới có thể lưu chỉnh sửa")
    if item.origin != "question_log":
        raise HTTPException(status_code=409, detail="Chỉ bản nháp tạo từ câu hỏi chưa có tài liệu mới có thể sửa ở đây")

    known_conditions = set(load_registry().diseases)
    invalid_conditions = sorted(set(payload.conditions) - known_conditions)
    if invalid_conditions:
        raise HTTPException(
            status_code=422,
            detail="Bệnh áp dụng không còn tồn tại trong danh mục: " + ", ".join(invalid_conditions),
        )

    item.title = payload.title
    item.content = payload.content
    item.topics = payload.topics
    item.conditions = payload.conditions
    item.source_url = payload.source_url
    item.issuer = payload.issuer
    item.doc_code = payload.doc_code
    await db.commit()
    await db.refresh(item)
    return _queue_item_detail(item)


@router.post("/queue/{item_id}/reject", response_model=EditorQueueItemDetail)
async def reject_queue_item(
    item_id: str,
    payload: EditorRejectRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_editor_user),
):
    result = await db.execute(select(EditorQueueItemModel).filter(EditorQueueItemModel.id == item_id))
    item = result.scalars().first()

    if not item:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy mục {item_id}")
    source = _uploaded_source_by_id(item_id) if item.origin == "editor_upload" else None

    if source is not None:
        try:
            await asyncio.to_thread(reject_source, item_id, [payload.reason], current_user.user_id)
        except Exception as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    elif item.status in ["approved", "rejected"]:
        raise HTTPException(status_code=409, detail=f"Mục {item.id} đã ở trạng thái {item.status}")

    item.status = "rejected"
    item.reject_reason = payload.reason
    item.reviewed_at = datetime.utcnow()
    item.reviewed_by = current_user.user_id

    await db.commit()
    await db.refresh(item)

    return _queue_item_detail(item)


@router.post("/queue/{item_id}/retry-index", response_model=EditorQueueItemDetail)
async def retry_source_index(
    item_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_editor_user),
):
    """Run a previously failed source-index job again without re-uploading it."""
    result = await db.execute(select(EditorQueueItemModel).filter(EditorQueueItemModel.id == item_id))
    item = result.scalars().first()
    if item is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy mục {item_id}")

    source = _uploaded_source_by_id(item_id) if item.origin == "editor_upload" else None
    if source is None:
        raise HTTPException(status_code=409, detail="Chỉ tài liệu nguồn tải lên mới có thể chạy lại index")
    if source.status != "index_failed":
        raise HTTPException(status_code=409, detail="Chỉ có thể chạy lại tài liệu có trạng thái index thất bại")

    try:
        await asyncio.to_thread(start_indexing, item_id, current_user.user_id)
    except Exception as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    item.status = "indexing"
    item.reviewed_at = datetime.utcnow()
    item.reviewed_by = current_user.user_id
    await db.commit()
    await db.refresh(item)
    background_tasks.add_task(_run_source_index, item_id, current_user.user_id)
    return _queue_item_detail(item)


@router.get("/out-of-scope", response_model=OutOfScopeLogList)
async def get_out_of_scope_logs(db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_editor_user)):
    result = await db.execute(select(OutOfScopeLog).order_by(OutOfScopeLog.ask_count.desc()))
    logs = result.scalars().all()

    res = []
    for log in logs:
        res.append(
            OutOfScopeLogSchema(
                log_id=log.id,
                question=log.question,
                ask_count=log.ask_count,
                last_asked_at=log.last_asked_at.isoformat() + "Z" if log.last_asked_at else "",
                drafted=log.drafted,
                drafted_item_id=log.drafted_item_id,
            )
        )
    return OutOfScopeLogList(logs=res)


@router.post("/out-of-scope/{log_id}/draft", response_model=EditorQueueItemDetail, status_code=status.HTTP_201_CREATED)
async def draft_out_of_scope(
    log_id: str, db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_editor_user)
):
    result = await db.execute(select(OutOfScopeLog).filter(OutOfScopeLog.id == log_id))
    log = result.scalars().first()

    if not log:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy câu hỏi {log_id}")

    if log.drafted and log.drafted_item_id:
        return await get_queue_item(log.drafted_item_id, db, current_user)

    draft = EditorQueueItemModel(title=log.question[:120], origin="question_log", status="draft", content="")
    db.add(draft)
    await db.flush()

    log.drafted = True
    log.drafted_item_id = draft.id
    await db.commit()

    return await get_queue_item(draft.id, db, current_user)


@router.get("/patient-questions", response_model=PatientEditorialQuestionList)
async def list_patient_editorial_questions(
    request_status: PatientEditorialQuestionStatus | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_editor_user),
) -> PatientEditorialQuestionList:
    """List individual questions waiting for a BTV response, newest first."""
    statement = select(PatientEditorialQuestion).order_by(PatientEditorialQuestion.created_at.desc())
    if request_status is not None:
        statement = statement.filter(PatientEditorialQuestion.status == request_status)
    result = await db.execute(statement)
    return PatientEditorialQuestionList(requests=[_patient_question_schema(item) for item in result.scalars().all()])


@router.post("/patient-questions/{request_id}/answer", response_model=PatientEditorialQuestionSchema)
async def answer_patient_editorial_question(
    request_id: str,
    payload: AnswerPatientEditorialQuestionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_editor_user),
) -> PatientEditorialQuestionSchema:
    """Send one BTV-authored response to the patient notification inbox.

    The response is communication to this patient only. It is intentionally not
    indexed or fed back into RAG; an approved source document still follows the
    normal review and indexing lifecycle.
    """
    result = await db.execute(select(PatientEditorialQuestion).where(PatientEditorialQuestion.id == request_id))
    item = result.scalars().first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy yêu cầu phản hồi")
    if item.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Yêu cầu này đã được phản hồi")

    answer = payload.answer.strip()
    if answer == "":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nội dung phản hồi không được để trống"
        )

    item.status = "answered"
    item.answer = answer
    item.answered_at = datetime.utcnow()
    item.answered_by = current_user.user_id
    db.add(
        PatientNotification(
            patient_id=item.patient_id,
            editorial_question_id=item.id,
            kind="editor_response",
            title="Phản hồi từ biên tập viên y khoa",
            body=answer,
        )
    )
    await db.commit()
    await db.refresh(item)
    return _patient_question_schema(item)


@router.post("/seed-database")
async def seed_database_endpoint(db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_editor_user)):
    from scripts.init_db import init_db

    await init_db(reset=False)
    return {"status": "ok", "message": "Database seeded successfully"}
