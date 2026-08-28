"""Tests for the editor's real RAG-source library view."""

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.api.v1 import editor
from src.api.v1.auth import get_editor_user
from src.main import app
from src.rag.config import RagSettings
from src.rag.registry import QuarantinedDoc, SourceDoc
from src.schemas.patient import UserInfo


def _document(doc_id: str, *, status: str = "approved", uploaded: bool = False) -> SourceDoc:
    return SourceDoc(
        doc_id=doc_id,
        file=f"{doc_id}.pdf",
        title=f"Tài liệu {doc_id}",
        issuer="Bộ Y tế",
        published="2026",
        lang="vi",
        authority="vn_moh",
        diseases=["type2_diabetes"],
        status=status,  # type: ignore[arg-type]
        uploaded_at="2026-08-27T06:00:00+00:00" if uploaded else None,
    )


class _Registry:
    def __init__(self, documents: list[SourceDoc], quarantined: list[QuarantinedDoc]):
        self.documents = documents
        self.quarantined = quarantined

    def by_id(self, document_id: str) -> SourceDoc:
        for document in self.documents:
            if document.doc_id == document_id:
                return document
        raise KeyError(document_id)


@pytest_asyncio.fixture
async def editor_client(monkeypatch) -> AsyncIterator[AsyncClient]:
    indexed = _document("indexed")
    awaiting_index = _document("awaiting-index")
    pending_upload = _document("pending-upload", status="pending_review", uploaded=True)
    rejected = QuarantinedDoc(
        doc_id="rejected-source",
        file="rejected-source.pdf",
        title="Tài liệu đã từ chối",
        reasons=["Không còn hiệu lực"],
    )

    monkeypatch.setattr(
        editor,
        "load_registry",
        lambda: _Registry([indexed, awaiting_index, pending_upload], [rejected]),
    )
    monkeypatch.setattr(editor, "uploaded_docs", lambda: [pending_upload])
    monkeypatch.setattr(editor, "quarantined_uploads", lambda: [])

    class _Store:
        def stats(self):
            return {"total": 3, "per_doc": {"indexed": 3}}

    monkeypatch.setattr(editor, "VectorStore", _Store)

    async def override_editor() -> UserInfo:
        return UserInfo(user_id="u_editor", email="editor@example.com", role="editor", patient_id=None)

    app.dependency_overrides[get_editor_user] = override_editor
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_editor_user, None)


@pytest.mark.asyncio
async def test_thu_vien_tai_lieu_phan_biet_duyet_va_index(editor_client):
    response = await editor_client.get("/api/v1/editor/documents")

    assert response.status_code == 200
    documents = {document["document_id"]: document for document in response.json()["documents"]}

    assert documents["indexed"]["approval_status"] == "approved"
    assert documents["indexed"]["index_status"] == "indexed"
    assert documents["indexed"]["chunk_count"] == 3
    assert documents["indexed"]["viewer_type"] == "pdf"
    # Test registry intentionally has no filesystem fixture: list API has to
    # report this truthfully rather than invent a preview URL.
    assert documents["indexed"]["source_file_available"] is False

    assert documents["awaiting-index"]["approval_status"] == "approved"
    assert documents["awaiting-index"]["index_status"] == "not_indexed"
    assert documents["awaiting-index"]["chunk_count"] == 0

    assert documents["pending-upload"]["source_origin"] == "editor_upload"
    assert documents["pending-upload"]["approval_status"] == "pending_review"
    assert documents["pending-upload"]["index_status"] == "not_applicable"
    assert documents["pending-upload"]["chunk_count"] is None

    assert documents["rejected-source"]["approval_status"] == "quarantined"
    assert documents["rejected-source"]["index_status"] == "not_applicable"


@pytest.mark.asyncio
async def test_thu_vien_khong_bao_nham_la_chua_index_khi_store_khong_doc_duoc(editor_client, monkeypatch):
    class _BrokenStore:
        def __init__(self):
            raise RuntimeError("Chroma unavailable")

    monkeypatch.setattr(editor, "VectorStore", _BrokenStore)
    response = await editor_client.get("/api/v1/editor/documents")

    assert response.status_code == 200
    documents = {document["document_id"]: document for document in response.json()["documents"]}
    assert documents["indexed"]["index_status"] == "unavailable"
    assert documents["awaiting-index"]["index_status"] == "unavailable"
    assert documents["pending-upload"]["index_status"] == "not_applicable"


@pytest.mark.asyncio
async def test_mo_file_goc_pdf_tu_kho_file_da_dang_ky(editor_client, monkeypatch, tmp_path):
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    pdf_bytes = b"%PDF-1.4\nreal-source-bytes\n%%EOF"
    (raw_dir / "indexed.pdf").write_bytes(pdf_bytes)
    monkeypatch.setattr(editor, "get_rag_settings", lambda: RagSettings(raw_dir=raw_dir))

    list_response = await editor_client.get("/api/v1/editor/documents")
    assert list_response.status_code == 200
    indexed = next(item for item in list_response.json()["documents"] if item["document_id"] == "indexed")
    assert indexed["source_file_available"] is True

    response = await editor_client.get("/api/v1/editor/documents/indexed/file")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.content == pdf_bytes


@pytest.mark.asyncio
async def test_mo_file_markdown_nguyen_ban_tu_kho_file(editor_client, monkeypatch, tmp_path):
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    markdown = "# Hướng dẫn\n\n| Mức | Glucose |\n| --- | --- |\n| 1 | <70 mg/dL |\n"
    (raw_dir / "markdown-source.md").write_text(markdown, encoding="utf-8")
    source = _document("markdown-source")
    source.file = "markdown-source.md"
    monkeypatch.setattr(editor, "load_registry", lambda: _Registry([source], []))
    monkeypatch.setattr(editor, "uploaded_docs", lambda: [])
    monkeypatch.setattr(editor, "get_rag_settings", lambda: RagSettings(raw_dir=raw_dir))

    list_response = await editor_client.get("/api/v1/editor/documents")
    assert list_response.status_code == 200
    listed = list_response.json()["documents"]
    assert listed == [
        {
            "document_id": "markdown-source",
            "title": "Tài liệu markdown-source",
            "issuer": "Bộ Y tế",
            "doc_code": None,
            "published": "2026",
            "conditions": ["type2_diabetes"],
            "source_origin": "system",
            "approval_status": "approved",
            "index_status": "not_indexed",
            "chunk_count": 0,
            "url": None,
            "uploaded_at": None,
            "viewer_type": "markdown",
            "source_file_available": True,
            "status_at": None,
            "index_attempts": 0,
            "index_error": None,
            "index_started_at": None,
            "index_completed_at": None,
        }
    ]

    response = await editor_client.get("/api/v1/editor/documents/markdown-source/file")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")
    assert response.text == markdown
