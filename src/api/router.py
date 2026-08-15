"""API router hub — gộp tất cả versioned routers."""

from __future__ import annotations

from fastapi import APIRouter

from src.api.v1.chat import router as chat_router
from src.api.v1.health import router as health_router

router = APIRouter()
router.include_router(chat_router, prefix="/v1", tags=["chat"])
router.include_router(health_router, prefix="/v1", tags=["health"])
