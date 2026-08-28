"""Node: hybrid_retrieval — Dense vector search từ ChromaDB (MVP: dense only)."""

from __future__ import annotations

import asyncio
from time import perf_counter

from src.agent.state import AgentState
from src.core.logging import get_logger
from src.rag.config import get_rag_settings
from src.rag.registry import load_registry
from src.rag.runtime import get_rag_readiness
from src.rag.store import VectorStore

logger = get_logger(__name__)


def _search_vectorstore_sync(
    *,
    query: str,
    disease: str | list[str] | None,
    approved_doc_ids: list[str],
    top_k: int,
):
    """Mở Chroma và search ngoài event loop để I/O cục bộ không chặn SSE."""
    started_at = perf_counter()
    logger.info("[hybrid_retrieval] opening Chroma vector store")
    store = VectorStore()
    logger.info("[hybrid_retrieval] Chroma opened in %.0f ms", (perf_counter() - started_at) * 1000)

    search_started_at = perf_counter()
    hits = store.search(
        query=query,
        disease=disease,
        allowed_doc_ids=approved_doc_ids,
        top_k=top_k,
    )
    logger.info("[hybrid_retrieval] vector search completed in %.0f ms", (perf_counter() - search_started_at) * 1000)
    return hits


def _condition_filter(profile: dict) -> str | list[str] | None:
    """Build one metadata filter from the primary condition and comorbidities.

    A secondary diagnosis is still a diagnosis.  Restricting retrieval to only
    ``primary_condition`` silently hid approved guidance relevant to patients
    with both conditions.
    """
    conditions: list[str] = []
    for condition in [profile.get("primary_condition"), *(profile.get("comorbidities") or [])]:
        if isinstance(condition, str) and condition and condition not in conditions:
            conditions.append(condition)
    if len(conditions) == 1:
        return conditions[0]
    return conditions or None


async def hybrid_retrieval_node(state: AgentState) -> AgentState:
    """Node 6 — tìm kiếm tài liệu y tế từ ChromaDB.

    MVP: Dense vector search. Số chunk lấy ra luôn dùng ``RAG_TOP_K`` để
    retrieval, generation và verifier cùng nhìn một tập context có cấu hình.
    Post-MVP: + BM25 hybrid, metadata filter theo disease_type.
    """
    query = state.get("preprocessed_query") or state.get("query", "")
    settings = get_rag_settings()
    top_k = settings.top_k
    timeout_seconds = getattr(settings, "retrieval_timeout_seconds", 12.0)
    disease = _condition_filter(state.get("patient_profile", {}))
    disease_label = ",".join(disease) if isinstance(disease, list) else disease
    started_at = perf_counter()
    registry_elapsed_ms = 0
    search_elapsed_ms = 0

    logger.info(
        "[hybrid_retrieval] searching query (%d chars) | top_k=%d | disease=%s | task=%s",
        len(query),
        top_k,
        disease_label or "all",
        state.get("task_kind", "health_education"),
    )

    readiness = get_rag_readiness()
    if readiness.ready is False:
        total_elapsed_ms = round((perf_counter() - started_at) * 1000)
        logger.error(
            "[hybrid_retrieval] skipped: RAG unavailable at startup | note=%s | total=%d ms",
            readiness.note,
            total_elapsed_ms,
        )
        return {
            **state,
            "retrieved_docs": [],
            "error": "rag_unavailable",
            "metadata": {
                **state.get("metadata", {}),
                "retrieval_context": {
                    "query": query,
                    "disease_filter": disease or None,
                    "approved_document_count": 0,
                    "top_k": top_k,
                    "returned_count": 0,
                    "status": "unavailable",
                    "reason": readiness.note,
                    "timing_ms": {"registry": 0, "search": 0, "total": total_elapsed_ms},
                },
            },
        }

    try:
        # Đây là hàng rào cuối cùng trước LLM: metadata trong Chroma không đủ
        # để chứng minh một chunk vẫn được phép dùng. Ví dụ process chết sau
        # upsert nhưng trước khi SourceDoc được chốt approved. Chỉ Registry là
        # nguồn sự thật của quyết định biên tập.
        registry_started_at = perf_counter()
        approved_doc_ids = [document.doc_id for document in load_registry().approved()]
        registry_elapsed_ms = round((perf_counter() - registry_started_at) * 1000)
        logger.info(
            "[hybrid_retrieval] registry resolved %d approved docs in %d ms",
            len(approved_doc_ids),
            registry_elapsed_ms,
        )
        if not approved_doc_ids:
            hits = []
        else:
            search_started_at = perf_counter()
            try:
                hits = await asyncio.wait_for(
                    asyncio.to_thread(
                        _search_vectorstore_sync,
                        query=query,
                        disease=disease,
                        approved_doc_ids=approved_doc_ids,
                        top_k=top_k,
                    ),
                    timeout=timeout_seconds,
                )
            except TimeoutError:
                search_elapsed_ms = round((perf_counter() - search_started_at) * 1000)
                total_elapsed_ms = round((perf_counter() - started_at) * 1000)
                logger.error(
                    "[hybrid_retrieval] timed out after %d ms (limit=%.2fs); routing safely without sources",
                    search_elapsed_ms,
                    timeout_seconds,
                )
                return {
                    **state,
                    "retrieved_docs": [],
                    "error": "retrieval_timeout",
                    "metadata": {
                        **state.get("metadata", {}),
                        "retrieval_context": {
                            "query": query,
                            "disease_filter": disease or None,
                            "approved_document_count": len(approved_doc_ids),
                            "top_k": top_k,
                            "returned_count": 0,
                            "status": "timeout",
                            "timing_ms": {
                                "registry": registry_elapsed_ms,
                                "search": search_elapsed_ms,
                                "total": total_elapsed_ms,
                            },
                        },
                    },
                }
            search_elapsed_ms = round((perf_counter() - search_started_at) * 1000)

        # Defense in depth: Chroma đã nhận allow-list, nhưng không giao quyền
        # cho tầng hạ tầng. Một fake/old collection trả dữ liệu lạc danh sách
        # vẫn bị loại trước khi chạm generation hoặc citation.
        approved_doc_id_set = set(approved_doc_ids)
        hits = [hit for hit in hits if str(hit.metadata.get("doc_id", "")) in approved_doc_id_set]

        # Serialize Hit → dict để lưu vào AgentState
        retrieved_docs = [
            {
                "id": i + 1,
                "title": hit.metadata.get("title", f"Tài liệu {i + 1}"),
                "issuer": hit.metadata.get("issuer", "Cơ sở y tế"),
                "doc_code": hit.metadata.get("doc_code"),
                "url": hit.metadata.get("url"),
                "snippet": hit.text[:300],
                # Internal fields needed for agent
                "doc_id": hit.chunk_id,
                "document_id": hit.metadata.get("doc_id", ""),
                "chunk_id": hit.chunk_id,
                "content": hit.text,
            }
            for i, hit in enumerate(hits)
        ]

        total_elapsed_ms = round((perf_counter() - started_at) * 1000)
        logger.info(
            "[hybrid_retrieval] found %d docs | registry=%d ms | search=%d ms | total=%d ms",
            len(retrieved_docs),
            registry_elapsed_ms,
            search_elapsed_ms,
            total_elapsed_ms,
        )
        return {
            **state,
            "retrieved_docs": retrieved_docs,
            "metadata": {
                **state.get("metadata", {}),
                # Keep ``retrieval`` as the list used by existing audit/log
                # consumers.  Request settings live separately so adding
                # observability does not silently change that contract.
                "retrieval": [
                    {
                        "document_id": hit.metadata.get("doc_id") or None,
                        "chunk_id": hit.chunk_id,
                        "similarity": round(float(getattr(hit, "similarity", 0.0)), 6),
                        "score": round(float(getattr(hit, "score", 0.0)), 6),
                    }
                    for hit in hits
                ],
                "retrieval_context": {
                    "query": query,
                    "disease_filter": disease or None,
                    "approved_document_count": len(approved_doc_ids),
                    "top_k": top_k,
                    "returned_count": len(hits),
                    "status": "ok",
                    "timing_ms": {
                        "registry": registry_elapsed_ms,
                        "search": search_elapsed_ms,
                        "total": total_elapsed_ms,
                    },
                },
            },
        }

    except Exception as exc:
        total_elapsed_ms = round((perf_counter() - started_at) * 1000)
        logger.error("[hybrid_retrieval] unexpected error after %d ms: %s", total_elapsed_ms, exc)
        return {
            **state,
            "retrieved_docs": [],
            "error": str(exc),
            "metadata": {
                **state.get("metadata", {}),
                "retrieval_context": {
                    "query": query,
                    "disease_filter": disease or None,
                    "approved_document_count": 0,
                    "top_k": top_k,
                    "returned_count": 0,
                    "status": "error",
                    "timing_ms": {
                        "registry": registry_elapsed_ms,
                        "search": search_elapsed_ms,
                        "total": total_elapsed_ms,
                    },
                },
            },
        }
