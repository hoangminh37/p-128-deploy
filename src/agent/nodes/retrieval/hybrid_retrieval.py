"""Node: hybrid_retrieval — Dense vector search từ ChromaDB (MVP: dense only)."""

from __future__ import annotations

import asyncio

from src.agent.state import AgentState
from src.core.logging import get_logger
from src.rag.config import get_rag_settings
from src.rag.store import VectorStore

logger = get_logger(__name__)


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
    top_k = get_rag_settings().top_k
    disease = _condition_filter(state.get("patient_profile", {}))
    disease_label = ",".join(disease) if isinstance(disease, list) else disease

    logger.info(
        "[hybrid_retrieval] searching query (%d chars) | top_k=%d | disease=%s | task=%s",
        len(query),
        top_k,
        disease_label or "all",
        state.get("task_kind", "health_education"),
    )

    try:
        store = VectorStore()
        hits = await asyncio.to_thread(store.search, query=query, disease=disease, top_k=top_k)

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

        logger.info("[hybrid_retrieval] found %d docs", len(retrieved_docs))
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
                    "top_k": top_k,
                    "returned_count": len(hits),
                },
            },
        }

    except Exception as exc:
        logger.error("[hybrid_retrieval] unexpected error: %s", exc)
        return {**state, "retrieved_docs": [], "error": str(exc)}
