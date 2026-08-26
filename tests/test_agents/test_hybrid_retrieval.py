"""Tests for retrieval context passed from semantic task routing."""

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


@pytest.mark.asyncio
async def test_retrieval_loc_theo_benh_nen_va_nhan_task_kind(monkeypatch):
    store = _Store()
    monkeypatch.setattr(hybrid_retrieval, "VectorStore", lambda: store)

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
            "top_k": 8,
        }
    ]
    assert result["retrieved_docs"][0]["title"] == "Chế độ ăn"
    assert result["retrieved_docs"][0]["document_id"] == "vn-moh-diet"
    assert result["retrieved_docs"][0]["chunk_id"] == "chunk_1"


@pytest.mark.asyncio
async def test_retrieval_gom_ca_benh_dong_mac(monkeypatch):
    store = _Store()
    monkeypatch.setattr(hybrid_retrieval, "VectorStore", lambda: store)

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
