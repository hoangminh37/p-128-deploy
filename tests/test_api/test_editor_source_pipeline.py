"""API contract for the editor's source-upload → RAG-ready lifecycle.

The real parser/embedding stack is deliberately not started here. The test
holds the background job at ``indexing`` and verifies the safety boundary that
matters to patients: a staged or in-progress source is not in
``Registry.approved()`` and cannot be retrieved by the agent.
"""

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from src.api.v1 import editor
from src.api.v1.auth import get_editor_user
from src.core.database import get_db
from src.main import app
from src.models.domain import Base
from src.rag import ingest
from src.rag.config import RagSettings
from src.rag.registry import load_registry, uploaded_docs
from src.schemas.patient import UserInfo

REGISTRY_YAML = """
version: 1
ranking_policy: recency
diseases:
  hypertension:
    label_vi: "tăng huyết áp"
    label_en: "Hypertension"
    keywords: "tăng huyết áp|hypertens"
  type2_diabetes:
    label_vi: "đái tháo đường típ 2"
    label_en: "Type 2 diabetes"
    keywords: "đái tháo đường|diabet"
documents: []
"""


@pytest_asyncio.fixture
async def source_pipeline_client(monkeypatch, tmp_path) -> AsyncIterator[tuple[AsyncClient, RagSettings]]:
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    registry_path = tmp_path / "registry.yaml"
    registry_path.write_text(REGISTRY_YAML, encoding="utf-8")
    rag_settings = RagSettings(registry_path=registry_path, raw_dir=raw_dir)

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'editor.db'}")
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    async def hold_background_job(_document_id: str, _approved_by: str) -> None:
        # Deliberately leave the durable SourceDoc at indexing.
        return None

    def stage_in_temp(**kwargs):
        return ingest.stage_upload(settings=rag_settings, **kwargs)

    def start_in_temp(document_id: str, started_by: str):
        return ingest.start_indexing(document_id, started_by, settings=rag_settings)

    monkeypatch.setattr(editor, "stage_upload", stage_in_temp)
    monkeypatch.setattr(editor, "start_indexing", start_in_temp)
    monkeypatch.setattr(editor, "uploaded_docs", lambda: uploaded_docs(rag_settings))
    monkeypatch.setattr(editor, "async_session_maker", session_factory)
    monkeypatch.setattr(editor, "_run_source_index", hold_background_job)

    async def override_editor() -> UserInfo:
        return UserInfo(user_id="u_editor", email="editor@example.com", role="editor", patient_id=None)

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_editor_user] = override_editor
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client, rag_settings
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_editor_user, None)
        await engine.dispose()


@pytest.mark.asyncio
async def test_editor_upload_chi_vao_rag_sau_khi_index_thanh_cong(source_pipeline_client):
    client, rag_settings = source_pipeline_client
    upload = await client.post(
        "/api/v1/editor/queue/upload",
        data={
            "title": "Hướng dẫn tăng huyết áp mới",
            "issuer": "Bộ Y tế",
            "published": "2026",
            "diseases": "hypertension",
        },
        files={"file": ("huong-dan.md", b"# Noi dung", "text/markdown")},
    )

    assert upload.status_code == 201
    staged = upload.json()
    assert staged["status"] == "pending"
    assert staged["source_approval_status"] == "pending_review"
    document_id = staged["item_id"]
    assert load_registry(settings=rag_settings).approved() == []

    started = await client.post(f"/api/v1/editor/queue/{document_id}/approve", json={})

    assert started.status_code == 200
    payload = started.json()
    assert payload["status"] == "indexing"
    assert payload["source_approval_status"] == "indexing"
    assert payload["index_attempts"] == 1
    assert load_registry(settings=rag_settings).approved() == []

    # A parser/embedding error is durable, visible, and retryable; it never
    # turns the source into an approved document by accident.
    ingest.mark_index_failed(document_id, "Không đọc được lớp chữ của file", settings=rag_settings)
    failed = await client.get(f"/api/v1/editor/queue/{document_id}")
    assert failed.status_code == 200
    assert failed.json()["status"] == "failed"
    assert failed.json()["source_index_error"] == "Không đọc được lớp chữ của file"
    assert load_registry(settings=rag_settings).approved() == []

    retried = await client.post(f"/api/v1/editor/queue/{document_id}/retry-index")
    assert retried.status_code == 200
    assert retried.json()["status"] == "indexing"
    assert retried.json()["index_attempts"] == 2
    assert load_registry(settings=rag_settings).approved() == []
