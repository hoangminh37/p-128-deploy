"""Tests for opening an exact approved RAG source from a chat citation."""

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.api.v1 import source_documents
from src.api.v1.auth import get_current_user
from src.main import app
from src.rag.registry import SourceDoc
from src.schemas.chat import Citation
from src.schemas.patient import UserInfo


class _Registry:
    def __init__(self, document: SourceDoc):
        self.document = document

    def by_id(self, document_id: str) -> SourceDoc:
        if document_id != self.document.doc_id:
            raise KeyError(document_id)
        return self.document


class _Store:
    def document_chunks(self, document_id: str) -> list[dict]:
        assert document_id == "vn-moh-htn"
        return [
            {
                "chunk_id": "vn-moh-htn::0001::first",
                "content": "Đoạn mở đầu của tài liệu.",
                "section_path": "Mở đầu",
                "page_start": 1,
                "page_end": 1,
            },
            {
                "chunk_id": "vn-moh-htn::0002::cited",
                "content": "Đoạn đã dùng để trả lời người bệnh.",
                "section_path": "Theo dõi tại nhà",
                "page_start": 2,
                "page_end": 2,
            },
        ]


@pytest_asyncio.fixture
async def source_client(monkeypatch) -> AsyncIterator[AsyncClient]:
    document = SourceDoc(
        doc_id="vn-moh-htn",
        file="huong-dan.pdf",
        title="Hypertension guideline",
        title_vi="Hướng dẫn tăng huyết áp",
        issuer="Ministry of Health",
        issuer_vi="Bộ Y tế",
        doc_code="3192/QĐ-BYT",
        url="https://example.test/huong-dan.pdf",
        published="2025",
        lang="vi",
        authority="vn_moh",
        diseases=["hypertension"],
        status="approved",
    )
    monkeypatch.setattr(source_documents, "load_registry", lambda: _Registry(document))
    monkeypatch.setattr(source_documents, "VectorStore", _Store)

    async def override_current_user() -> UserInfo:
        return UserInfo(user_id="u_patient", email="patient@example.com", role="patient", patient_id="p_patient")

    app.dependency_overrides[get_current_user] = override_current_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_mo_tai_lieu_da_duyet_va_danh_dau_dung_chunk_da_trich(source_client):
    response = await source_client.get(
        "/api/v1/sources/documents/vn-moh-htn",
        params={"chunk_id": "vn-moh-htn::0002::cited"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "Hướng dẫn tăng huyết áp"
    assert payload["highlighted_chunk_id"] == "vn-moh-htn::0002::cited"
    assert payload["total_chunks"] == 2
    assert [chunk["chunk_id"] for chunk in payload["chunks"]] == [
        "vn-moh-htn::0001::first",
        "vn-moh-htn::0002::cited",
    ]


@pytest.mark.asyncio
async def test_tu_choi_chunk_khong_thuoc_tai_lieu_da_trich(source_client):
    response = await source_client.get(
        "/api/v1/sources/documents/vn-moh-htn",
        params={"chunk_id": "vn-moh-htn::9999::unknown"},
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_chi_tra_doan_duoc_trich_va_ngu_canh_lan_can(source_client, monkeypatch):
    class _LargeStore:
        def document_chunks(self, document_id: str) -> list[dict]:
            assert document_id == "vn-moh-htn"
            return [
                {
                    "chunk_id": f"vn-moh-htn::{index:04d}::chunk",
                    "content": f"Nội dung {index}",
                    "section_path": None,
                    "page_start": index,
                    "page_end": index,
                }
                for index in range(1, 8)
            ]

    monkeypatch.setattr(source_documents, "VectorStore", _LargeStore)
    response = await source_client.get(
        "/api/v1/sources/documents/vn-moh-htn",
        params={"chunk_id": "vn-moh-htn::0004::chunk"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_chunks"] == 7
    assert [chunk["chunk_id"] for chunk in payload["chunks"]] == [
        "vn-moh-htn::0002::chunk",
        "vn-moh-htn::0003::chunk",
        "vn-moh-htn::0004::chunk",
        "vn-moh-htn::0005::chunk",
        "vn-moh-htn::0006::chunk",
    ]


def test_citation_khong_bien_url_rong_thanh_lien_ket_chet():
    citation = Citation(
        id=1,
        title="Tài liệu",
        issuer="Bộ Y tế",
        doc_code=None,
        url="   ",
        snippet="Đoạn trích",
        document_id=" doc-a ",
        chunk_id=" chunk-a ",
    )

    assert citation.url is None
    assert citation.document_id == "doc-a"
    assert citation.chunk_id == "chunk-a"
