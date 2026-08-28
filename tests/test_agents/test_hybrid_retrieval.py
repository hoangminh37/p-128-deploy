"""Tests for retrieval context passed from semantic task routing."""

import time
from types import SimpleNamespace

import pytest

from src.agent.nodes.retrieval import hybrid_retrieval


class _Hit:
    chunk_id = "chunk_1"
    text = "Nội dung về chế độ ăn."
    metadata = {"title": "Chế độ ăn", "issuer": "Bộ Y tế", "doc_id": "vn-moh-diet"}


class _Store:
    def __init__(self):
        self.calls: list[dict] = []

    def search(self, **kwargs):
        self.calls.append(kwargs)
        return [_Hit()]


class _Registry:
    def approved(self):
        return [SimpleNamespace(doc_id="vn-moh-diet")]


def _approved_registry(monkeypatch):
    monkeypatch.setattr(hybrid_retrieval, "load_registry", lambda: _Registry())


@pytest.mark.asyncio
async def test_retrieval_loc_theo_benh_nen_va_nhan_task_kind(monkeypatch):
    store = _Store()
    monkeypatch.setattr(hybrid_retrieval, "VectorStore", lambda: store)
    monkeypatch.setattr(hybrid_retrieval, "get_rag_settings", lambda: SimpleNamespace(top_k=6))
    _approved_registry(monkeypatch)

    result = await hybrid_retrieval.hybrid_retrieval_node(
        {
            "preprocessed_query": "Chế độ ăn buổi tối cho người tăng huyết áp",
            "patient_profile": {"primary_condition": "hypertension"},
            "task_kind": "meal_recommendation",
        }
    )

    assert store.calls == [
        {
            "query": "Chế độ ăn buổi tối cho người tăng huyết áp",
            "disease": "hypertension",
            "allowed_doc_ids": ["vn-moh-diet"],
            "top_k": 6,
        }
    ]
    assert result["retrieved_docs"][0]["title"] == "Chế độ ăn"
    assert result["retrieved_docs"][0]["document_id"] == "vn-moh-diet"
    assert result["retrieved_docs"][0]["chunk_id"] == "chunk_1"


@pytest.mark.asyncio
async def test_retrieval_gom_ca_benh_dong_mac(monkeypatch):
    store = _Store()
    monkeypatch.setattr(hybrid_retrieval, "VectorStore", lambda: store)
    monkeypatch.setattr(hybrid_retrieval, "get_rag_settings", lambda: SimpleNamespace(top_k=6))
    _approved_registry(monkeypatch)

    await hybrid_retrieval.hybrid_retrieval_node(
        {
            "query": "Tôi nên ăn như nào?",
            "patient_profile": {
                "primary_condition": "type2_diabetes",
                "comorbidities": ["hypertension"],
            },
        }
    )

    assert store.calls[0]["disease"] == ["type2_diabetes", "hypertension"]


@pytest.mark.asyncio
async def test_retrieval_ton_trong_top_k_cau_hinh(monkeypatch):
    store = _Store()
    monkeypatch.setattr(hybrid_retrieval, "VectorStore", lambda: store)
    monkeypatch.setattr(hybrid_retrieval, "get_rag_settings", lambda: SimpleNamespace(top_k=3))
    _approved_registry(monkeypatch)

    result = await hybrid_retrieval.hybrid_retrieval_node(
        {"query": "Cách theo dõi huyết áp", "patient_profile": {"primary_condition": "hypertension"}}
    )

    assert store.calls[0]["top_k"] == 3
    assert result["metadata"]["retrieval_context"]["query"] == "Cách theo dõi huyết áp"
    assert result["metadata"]["retrieval_context"]["top_k"] == 3


@pytest.mark.asyncio
async def test_retrieval_khong_tim_chunk_khi_registry_khong_co_tai_lieu_duyet(monkeypatch):
    store = _Store()
    monkeypatch.setattr(hybrid_retrieval, "VectorStore", lambda: store)
    monkeypatch.setattr(hybrid_retrieval, "get_rag_settings", lambda: SimpleNamespace(top_k=3))
    monkeypatch.setattr(hybrid_retrieval, "load_registry", lambda: SimpleNamespace(approved=lambda: []))

    result = await hybrid_retrieval.hybrid_retrieval_node({"query": "Cách theo dõi huyết áp"})

    assert result["retrieved_docs"] == []
    assert store.calls == []
    assert result["metadata"]["retrieval_context"]["approved_document_count"] == 0


@pytest.mark.asyncio
async def test_retrieval_timeout_khong_lam_treo_chat(monkeypatch):
    class SlowStore:
        def __init__(self):
            time.sleep(0.08)

        def search(self, **_kwargs):
            return []

    monkeypatch.setattr(hybrid_retrieval, "VectorStore", SlowStore)
    monkeypatch.setattr(
        hybrid_retrieval,
        "get_rag_settings",
        lambda: SimpleNamespace(top_k=6, retrieval_timeout_seconds=0.02),
    )
    _approved_registry(monkeypatch)

    started_at = time.perf_counter()
    result = await hybrid_retrieval.hybrid_retrieval_node({"query": "Đường huyết bao nhiêu là cao?", "metadata": {}})

    context = result["metadata"]["retrieval_context"]
    assert time.perf_counter() - started_at < 0.07
    assert result["retrieved_docs"] == []
    assert result["error"] == "retrieval_timeout"
    assert context["status"] == "timeout"
    assert context["timing_ms"]["search"] >= 20


@pytest.mark.asyncio
async def test_retrieval_fail_fast_khi_startup_da_bao_rag_khong_san_sang(monkeypatch):
    monkeypatch.setattr(
        hybrid_retrieval,
        "get_rag_settings",
        lambda: SimpleNamespace(top_k=6, retrieval_timeout_seconds=0.02),
    )
    monkeypatch.setattr(
        hybrid_retrieval,
        "get_rag_readiness",
        lambda: SimpleNamespace(ready=False, note="Chroma không mở được"),
    )

    result = await hybrid_retrieval.hybrid_retrieval_node({"query": "Đường huyết bao nhiêu là cao?"})

    assert result["retrieved_docs"] == []
    assert result["error"] == "rag_unavailable"
    assert result["metadata"]["retrieval_context"]["status"] == "unavailable"
