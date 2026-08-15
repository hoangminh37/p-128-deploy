"""Node: hybrid_retrieval — Dense vector search từ ChromaDB (MVP: dense only)."""

from __future__ import annotations

import asyncio

from src.agent.state import AgentState
from src.core.logging import get_logger
from src.rag.store import VectorStore

logger = get_logger(__name__)


async def hybrid_retrieval_node(state: AgentState) -> AgentState:
    """Node 6 — tìm kiếm tài liệu y tế từ ChromaDB.

    MVP: Dense vector search (top_k=8).
    Post-MVP: + BM25 hybrid, metadata filter theo disease_type.
    """
    query = state.get("rewritten_query") or state.get("resolved_query") or state.get("query", "")
    retry_count = state.get("retry_count", 0)

    # Tăng top_k khi retry (cần nhiều doc hơn)
    top_k = 8 + retry_count * 4

    logger.info("[hybrid_retrieval] query=%.80s | top_k=%d", query, top_k)

    try:
        store = VectorStore()
        hits = await asyncio.to_thread(store.search, query=query, top_k=top_k)

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
                "content": hit.text,
            }
            for i, hit in enumerate(hits)
        ]

        logger.info("[hybrid_retrieval] found %d docs", len(retrieved_docs))
        return {**state, "retrieved_docs": retrieved_docs}

    except Exception as exc:
        logger.error("[hybrid_retrieval] unexpected error: %s", exc)
        return {**state, "retrieved_docs": [], "error": str(exc)}
