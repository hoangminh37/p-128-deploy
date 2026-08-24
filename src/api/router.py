"""API router hub — gộp tất cả versioned routers."""

from __future__ import annotations

from fastapi import APIRouter

from src.api.v1.auth import router as auth_router
from src.api.v1.chat import router as chat_router
from src.api.v1.conversations import router as conversations_router
from src.api.v1.editor import router as editor_router
from src.api.v1.health import router as health_router
from src.api.v1.learning import router as learning_router
from src.api.v1.patients import router as patients_router
from src.api.v1.quiz import router as quiz_router

router = APIRouter(prefix="/v1")

router.include_router(health_router, tags=["health"])
router.include_router(auth_router, tags=["auth"])
router.include_router(patients_router, tags=["patients"])
router.include_router(chat_router, tags=["chat"])
router.include_router(conversations_router, tags=["conversations"])
router.include_router(editor_router, tags=["editor"])
router.include_router(learning_router, tags=["learning"])
router.include_router(quiz_router, tags=["quiz"])
