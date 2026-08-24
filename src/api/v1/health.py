"""API v1 — health + status endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from src.core.config import get_settings

router = APIRouter()


@router.get("/health", summary="Health check")
async def health() -> dict:
    """Kiểm tra app đang chạy."""
    from src.main import check_vectorstore

    settings = get_settings()
    rag_ready, chunk_count, note = check_vectorstore()

    # "degraded" chứ không phải "ok": app sống nhưng tính năng lõi đã chết. Trả
    # "ok" ở tình trạng này là lý do lỗi kho rỗng nằm im mà không ai biết.
    return {
        "status": "ok" if rag_ready else "degraded",
        "env": settings.app_env,
        "app": settings.app_name,
        "model": settings.model_name,
        "rag": {"ready": rag_ready, "chunks": chunk_count, "note": note},
    }


@router.get("/status", summary="Agent status")
async def status() -> dict:
    """Kiểm tra trạng thái LangGraph agent."""
    from src.agent.graph import agent

    nodes = list(agent.get_graph().nodes.keys())
    return {
        "status": "ready",
        "agent": "Medical AI Agent — LangGraph",
        "nodes": nodes,
        "node_count": len(nodes),
    }
