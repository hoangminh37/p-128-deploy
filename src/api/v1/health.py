"""API v1 — health + status endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from src.core.config import get_settings

router = APIRouter()


@router.get("/health", summary="Health check")
async def health() -> dict:
    """Kiểm tra app đang chạy."""
    settings = get_settings()
    return {"status": "ok", "env": settings.app_env, "app": settings.app_name}


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
