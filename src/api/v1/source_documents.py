"""Read-only patient view of approved source documents used by citations."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.api.v1.auth import get_current_user
from src.rag.registry import load_registry
from src.rag.store import VectorStore
from src.schemas.patient import UserInfo
from src.schemas.source_document import SourceDocumentChunk, SourceDocumentResponse

router = APIRouter(prefix="/sources", tags=["sources"])
_CONTEXT_RADIUS = 2


@router.get("/documents/{document_id}", response_model=SourceDocumentResponse)
async def get_source_document(
    document_id: str,
    chunk_id: str = Query(..., min_length=1),
    _current_user: UserInfo = Depends(get_current_user),
) -> SourceDocumentResponse:
    """Return only an approved document and prove which chunk was cited.

    The registry is the approval boundary.  The vector store supplies the exact
    cleaned chunks that the agent could have read; raw uploads and pending
    documents are never exposed through this route.
    """
    try:
        document = load_registry().by_id(document_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài liệu nguồn") from exc

    if document.status != "approved":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tài liệu này chưa có trong thư viện")

    chunks = await asyncio.to_thread(VectorStore().document_chunks, document_id)
    if not chunks:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tài liệu chưa sẵn sàng để xem")
    highlighted_index = next(
        (index for index, chunk in enumerate(chunks) if chunk["chunk_id"] == chunk_id),
        None,
    )
    if highlighted_index is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy đoạn được trích dẫn")

    # A guideline may have hundreds of chunks. Returning the whole document to
    # open one citation creates a slow, overwhelming page and makes different
    # citations look identical. The selected chunk plus its immediate context is
    # the source evidence the patient needs; the official URL remains available
    # when the publisher provides one.
    context_start = max(0, highlighted_index - _CONTEXT_RADIUS)
    context_end = highlighted_index + _CONTEXT_RADIUS + 1
    visible_chunks = chunks[context_start:context_end]

    return SourceDocumentResponse(
        document_id=document.doc_id,
        title=document.citation_title,
        issuer=document.citation_issuer,
        doc_code=document.doc_code,
        url=document.url,
        published=document.published,
        highlighted_chunk_id=chunk_id,
        total_chunks=len(chunks),
        chunks=[SourceDocumentChunk(**chunk) for chunk in visible_chunks],
    )
