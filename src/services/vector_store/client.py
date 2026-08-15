"""Qdrant client singleton — khởi tạo một lần, dùng lại toàn bộ app."""
from __future__ import annotations

from functools import lru_cache

from qdrant_client import QdrantClient

from src.core.config import get_settings
from src.core.logging import get_logger

logger = get_logger(__name__)


@lru_cache(maxsize=1)
def get_qdrant_client() -> QdrantClient:
    """Trả về QdrantClient singleton (cached via lru_cache)."""
    settings = get_settings()
    client = QdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key or None,
        timeout=10,
    )
    logger.info("Qdrant client connected: %s", settings.qdrant_url)
    return client
