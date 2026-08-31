"""API coverage for BTV runtime condition management."""

from __future__ import annotations

import textwrap
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.api.v1 import editor
from src.api.v1.auth import get_editor_user
from src.main import app
from src.rag.config import RagSettings
from src.schemas.patient import UserInfo

REGISTRY = textwrap.dedent("""
    version: 1
    ranking_policy: recency
    diseases:
      hypertension:
        label_vi: Tăng huyết áp
        label_en: Hypertension
        keywords: hypertension|huyết\\s*áp
    documents: []
""")


@pytest_asyncio.fixture
async def editor_conditions_client(monkeypatch, tmp_path: Path) -> AsyncIterator[AsyncClient]:
    registry_path = tmp_path / "registry.yaml"
    registry_path.write_text(REGISTRY, encoding="utf-8")
    (tmp_path / "raw").mkdir()
    settings = RagSettings(
        registry_path=registry_path,
        runtime_registry_path=tmp_path / "registry_runtime.yaml",
        raw_dir=tmp_path / "raw",
    )
    monkeypatch.setattr(editor, "get_rag_settings", lambda: settings)

    async def override_editor() -> UserInfo:
        return UserInfo(user_id="u_editor", email="editor@example.com", role="editor", patient_id=None)

    app.dependency_overrides[get_editor_user] = override_editor
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_editor_user, None)


@pytest.mark.asyncio
async def test_btv_can_create_and_list_runtime_condition(editor_conditions_client: AsyncClient) -> None:
    created = await editor_conditions_client.post(
        "/api/v1/editor/conditions",
        json={
            "condition_id": "asthma",
            "label_vi": "Hen phế quản",
            "label_en": "Asthma",
            "aliases": ["hen", "hen suyễn"],
        },
    )
    assert created.status_code == 201
    assert created.json()["status"] == "waiting_for_sources"

    listed = await editor_conditions_client.get("/api/v1/editor/conditions")
    assert listed.status_code == 200
    conditions = {item["condition_id"]: item for item in listed.json()["conditions"]}
    assert conditions["asthma"]["origin"] == "editor_runtime"
    assert conditions["asthma"]["approved_source_count"] == 0

    cannot_activate = await editor_conditions_client.post(
        "/api/v1/editor/conditions/asthma/status", json={"status": "active"}
    )
    assert cannot_activate.status_code == 409
