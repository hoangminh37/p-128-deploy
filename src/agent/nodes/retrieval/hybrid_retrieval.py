"""Node: hybrid_retrieval — Dense vector search từ Qdrant (MVP: dense only)."""

from __future__ import annotations

from src.agent.state import AgentState
from src.core.exceptions import RetrievalFailed
from src.core.logging import get_logger
from src.services.vector_store.retriever import search_similar

logger = get_logger(__name__)


async def hybrid_retrieval_node(state: AgentState) -> AgentState:
    """Node 6 — tìm kiếm tài liệu y tế từ Qdrant.

    MVP: Dense vector search (top_k=8).
    Post-MVP: + BM25 hybrid, metadata filter theo disease_type.
    """
    query = state.get("rewritten_query") or state.get("resolved_query") or state.get("query", "")
    retry_count = state.get("retry_count", 0)

    # Tăng top_k khi retry (cần nhiều doc hơn)
    top_k = 8 + retry_count * 4

    logger.info("[hybrid_retrieval] query=%.80s | top_k=%d", query, top_k)

    try:
        docs = await search_similar(query, top_k=top_k)

        # Serialize Document → dict để lưu vào AgentState
        retrieved_docs = [
            {
                "doc_id": f"doc_{i}",
                "content": doc.page_content,
                "metadata": doc.metadata,
                "title": doc.metadata.get("title", f"Tài liệu {i + 1}"),
                "source": doc.metadata.get("source", ""),
            }
            for i, doc in enumerate(docs)
        ]

        logger.info("[hybrid_retrieval] found %d docs", len(retrieved_docs))
        return {**state, "retrieved_docs": retrieved_docs}

    except RetrievalFailed as exc:
        logger.error("[hybrid_retrieval] Qdrant error: %s", exc)
        return {**state, "retrieved_docs": [], "error": str(exc)}
    except Exception as exc:
        logger.error("[hybrid_retrieval] unexpected error: %s", exc)
        return {**state, "retrieved_docs": [], "error": str(exc)}
