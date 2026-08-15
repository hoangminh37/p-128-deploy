"""Vector store retriever — tìm kiếm tài liệu y tế từ Qdrant."""

from __future__ import annotations

from functools import lru_cache

from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore

from src.core.config import get_settings
from src.core.exceptions import RetrievalFailed
from src.core.logging import get_logger
from src.services.vector_store.client import get_qdrant_client

logger = get_logger(__name__)


@lru_cache(maxsize=1)
def _get_vector_store() -> QdrantVectorStore:
    settings = get_settings()
    embeddings = OpenAIEmbeddings(
        model=settings.embedding_model,
        api_key=settings.openai_api_key,  # type: ignore[arg-type]
    )
    return QdrantVectorStore(
        client=get_qdrant_client(),
        collection_name=settings.qdrant_collection,
        embedding=embeddings,
    )


async def search_similar(query: str, top_k: int = 8) -> list[Document]:
    """Tìm top_k tài liệu ngữ nghĩa gần nhất với query.

    Returns:
        List[Document] — mỗi doc có .page_content và .metadata

    Raises:
        RetrievalFailed: khi Qdrant không phản hồi
    """
    try:
        store = _get_vector_store()
        retriever = store.as_retriever(search_kwargs={"k": top_k})
        docs = await retriever.ainvoke(query)
        logger.info("Retrieved %d docs for query: %.60s...", len(docs), query)
        return docs
    except Exception as exc:
        logger.error("Qdrant retrieval error: %s", exc)
        raise RetrievalFailed(str(exc)) from exc
