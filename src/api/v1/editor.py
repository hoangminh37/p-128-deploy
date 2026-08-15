from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.core.database import get_db
from src.models.domain import EditorQueueItem as EditorQueueItemModel, OutOfScopeLog
from src.schemas.editor import (
    EditorApproveRequest, EditorDashboard, EditorItemStatus, 
    EditorQueueItem, EditorQueueItemDetail, EditorQueueList, 
    EditorRejectRequest, OutOfScopeLogList, OutOfScopeLogSchema
)
from src.api.v1.auth import get_editor_user
from src.schemas.patient import UserInfo

# Import rag modules
from src.rag.ingest import stage_upload, approve

router = APIRouter(prefix="/editor", tags=["editor"])

@router.get("/dashboard", response_model=EditorDashboard)
async def get_dashboard(db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_editor_user)):
    result_pending = await db.execute(select(EditorQueueItemModel).filter(EditorQueueItemModel.status == "pending"))
    pending_count = len(result_pending.scalars().all())
    
    result_oos = await db.execute(select(OutOfScopeLog).filter(OutOfScopeLog.drafted == False))
    oos_count = len(result_oos.scalars().all())
    
    return EditorDashboard(pending_count=pending_count, out_of_scope_count=oos_count)

@router.get("/queue", response_model=EditorQueueList)
async def get_queue(status: EditorItemStatus = Query("pending"), db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_editor_user)):
    result = await db.execute(
        select(EditorQueueItemModel)
        .filter(EditorQueueItemModel.status == status)
        .order_by(EditorQueueItemModel.created_at.desc())
    )
    items = result.scalars().all()
    
    queue_list = []
    for item in items:
        queue_list.append(EditorQueueItem(
            item_id=item.id,
            title=item.title,
            origin=item.origin,
            topics=item.topics,
            created_at=item.created_at.isoformat() + "Z" if item.created_at else "",
            status=item.status
        ))
    return EditorQueueList(items=queue_list)

@router.get("/queue/{item_id}", response_model=EditorQueueItemDetail)
async def get_queue_item(item_id: str, db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_editor_user)):
    result = await db.execute(select(EditorQueueItemModel).filter(EditorQueueItemModel.id == item_id))
    item = result.scalars().first()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy mục {item_id}"
        )
        
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
        reviewed_by=item.reviewed_by
    )

@router.post("/queue/upload", response_model=EditorQueueItemDetail, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    issuer: str = Form(...),
    published: str = Form(...),
    diseases: str = Form(...),  # Comma separated
    doc_code: str = Form(None),
    url: str = Form(None),
    notes: str = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_editor_user)
):
    """Tải lên tài liệu y khoa. Tài liệu sẽ ở trạng thái chờ duyệt."""
    content = await file.read()
    disease_list = [d.strip() for d in diseases.split(",") if d.strip()]
    
    # 1. Gọi hệ thống RAG ingest để stage_upload
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
            uploaded_by=current_user.user_id
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    # 2. Tạo bản ghi trong PostgreSQL để quản lý
    db_item = EditorQueueItemModel(
        id=ingest_res.doc_id,
        title=title,
        origin="upload",
        status="pending",
        content="",
        source_url=url,
        issuer=issuer,
        doc_code=doc_code,
        conditions=disease_list,
        topics=disease_list
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
    current_user: UserInfo = Depends(get_editor_user)
):
    result = await db.execute(select(EditorQueueItemModel).filter(EditorQueueItemModel.id == item_id))
    item = result.scalars().first()
    
    if not item:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy mục {item_id}")
    if item.status in ["approved", "rejected"]:
        raise HTTPException(status_code=409, detail=f"Mục {item.id} đã ở trạng thái {item.status}")
        
    # Đổi trạng thái trong Postgres
    item.status = "approved"
    item.content = payload.content if payload.content else item.content
    item.review_note = payload.note
    item.reviewed_at = datetime.utcnow()
    item.reviewed_by = current_user.user_id
    
    await db.commit()
    await db.refresh(item)
    
    # KÍCH HOẠT QUÁ TRÌNH NHÚNG (DOCLING -> VECTORDB) TRONG BACKGROUND
    background_tasks.add_task(approve, item_id)
    
    return await get_queue_item(item_id, db, current_user)

@router.post("/queue/{item_id}/reject", response_model=EditorQueueItemDetail)
async def reject_queue_item(
    item_id: str, 
    payload: EditorRejectRequest, 
    db: AsyncSession = Depends(get_db), 
    current_user: UserInfo = Depends(get_editor_user)
):
    result = await db.execute(select(EditorQueueItemModel).filter(EditorQueueItemModel.id == item_id))
    item = result.scalars().first()
    
    if not item:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy mục {item_id}")
    if item.status in ["approved", "rejected"]:
        raise HTTPException(status_code=409, detail=f"Mục {item.id} đã ở trạng thái {item.status}")
        
    item.status = "rejected"
    item.reject_reason = payload.reason
    item.reviewed_at = datetime.utcnow()
    item.reviewed_by = current_user.user_id
    
    await db.commit()
    await db.refresh(item)
    
    return await get_queue_item(item_id, db, current_user)

@router.get("/out-of-scope", response_model=OutOfScopeLogList)
async def get_out_of_scope_logs(db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_editor_user)):
    result = await db.execute(
        select(OutOfScopeLog).order_by(OutOfScopeLog.ask_count.desc())
    )
    logs = result.scalars().all()
    
    res = []
    for log in logs:
        res.append(OutOfScopeLogSchema(
            log_id=log.id,
            question=log.question,
            ask_count=log.ask_count,
            last_asked_at=log.last_asked_at.isoformat() + "Z" if log.last_asked_at else "",
            drafted=log.drafted,
            drafted_item_id=log.drafted_item_id
        ))
    return OutOfScopeLogList(logs=res)

@router.post("/out-of-scope/{log_id}/draft", response_model=EditorQueueItemDetail, status_code=status.HTTP_201_CREATED)
async def draft_out_of_scope(log_id: str, db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_editor_user)):
    result = await db.execute(select(OutOfScopeLog).filter(OutOfScopeLog.id == log_id))
    log = result.scalars().first()
    
    if not log:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy câu hỏi {log_id}")
        
    if log.drafted and log.drafted_item_id:
        return await get_queue_item(log.drafted_item_id, db, current_user)
        
    draft = EditorQueueItemModel(
        title=log.question[:120],
        origin="question_log",
        status="draft",
        content=""
    )
    db.add(draft)
    await db.flush()
    
    log.drafted = True
    log.drafted_item_id = draft.id
    await db.commit()
    
    return await get_queue_item(draft.id, db, current_user)
