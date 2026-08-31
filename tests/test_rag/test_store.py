"""Test cho tầng embedding và vector store.

Không gọi mạng và không nạp mô hình thật: dùng embedder giả và collection giả.
Phần được kiểm là logic của ta — chọn provider, dựng mệnh đề lọc, quy đổi
khoảng cách thành độ tương đồng, và cộng điểm ưu tiên theo năm ban hành.
"""

import json
import sys
from types import SimpleNamespace

import pytest

from src.rag.config import RagSettings
from src.rag.store import ChromaStore, CohereEmbedder, Hit, VectorStore, _TokenBudget, make_embedder


class FakeEmbedder:
    def __init__(self, dim=4):
        self.dim = dim
        self.doc_calls: list[list[str]] = []
        self.query_calls: list[str] = []

    def embed_documents(self, texts):
        self.doc_calls.append(list(texts))
        return [[0.1] * self.dim for _ in texts]

    def embed_query(self, text):
        self.query_calls.append(text)
        return [0.1] * self.dim


class FakeCollection:
    """Chroma giả, trả về đúng kết quả được nạp sẵn."""

    def __init__(self, response=None, count=100):
        self.response = response or {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}
        self.get_response: dict = {"ids": [], "documents": [], "metadatas": []}
        self._count = count
        self.last_query: dict = {}
        self.last_get: dict = {}
        self.deleted: list = []

    def query(self, **kwargs):
        self.last_query = kwargs
        return self.response

    def count(self):
        return self._count

    def delete(self, where=None):
        self.deleted.append(where)
        self._count = 0

    def get(self, **kwargs):
        self.last_get = kwargs
        if kwargs.get("where") is not None:
            return self.get_response
        return {"metadatas": [{"doc_id": "a"}, {"doc_id": "a"}, {"doc_id": "b"}]}


@pytest.fixture
def store(tmp_path, monkeypatch):
    settings = RagSettings(vectorstore_dir=tmp_path / "vs", recency_weight=0.2, min_similarity=0.3, top_k=3)
    s = ChromaStore.__new__(ChromaStore)  # bỏ qua __init__ để khỏi cần chromadb thật
    s.settings = settings
    s.collection = FakeCollection()
    s._embedder = FakeEmbedder()
    return s


def make_response(rows):
    """rows: list of (id, text, metadata, distance)."""
    return {
        "ids": [[r[0] for r in rows]],
        "documents": [[r[1] for r in rows]],
        "metadatas": [[r[2] for r in rows]],
        "distances": [[r[3] for r in rows]],
    }


class TestMakeEmbedder:
    def test_chon_theo_cau_hinh(self, monkeypatch):
        import src.rag.store as store_mod

        monkeypatch.setattr(store_mod, "CohereEmbedder", lambda s: "COHERE")
        monkeypatch.setattr(store_mod, "LocalEmbedder", lambda s: "LOCAL")
        monkeypatch.setattr(store_mod, "OpenAIEmbedder", lambda s: "OPENAI")

        assert make_embedder(RagSettings(embedding_provider="cohere")) == "COHERE"
        assert make_embedder(RagSettings(embedding_provider="local")) == "LOCAL"
        assert make_embedder(RagSettings(embedding_provider="openai")) == "OPENAI"


class TestEmbeddingConfig:
    def test_so_chieu_theo_provider(self):
        assert RagSettings(embedding_provider="cohere").embedding_dimensions == 1024
        assert RagSettings(embedding_provider="local").embedding_dimensions == 1024
        assert RagSettings(embedding_provider="openai").embedding_dimensions == 1536

    def test_ten_model_theo_provider(self):
        assert RagSettings(embedding_provider="cohere").embedding_model == "embed-multilingual-v3.0"
        assert RagSettings(embedding_provider="local").embedding_model == "BAAI/bge-m3"
        assert RagSettings(embedding_provider="openai").embedding_model == "text-embedding-3-small"

    def test_cohere_client_co_deadline_va_khong_tu_retry(self, monkeypatch):
        """Timeout SDK phải nhỏ hơn deadline retrieval để request chat không treo."""

        captured: dict = {}

        class FakeClientV2:
            def __init__(self, **kwargs):
                captured.update(kwargs)

        monkeypatch.setitem(sys.modules, "cohere", SimpleNamespace(ClientV2=FakeClientV2))
        settings = RagSettings(COHERE_API_KEY="test-key", cohere_timeout_seconds=4.0)

        CohereEmbedder(settings)

        assert captured["timeout"] == 4.0
        assert captured["max_retries"] == 0

    def test_query_khong_cho_rate_limit(self):
        budget = _TokenBudget(tokens_per_minute=10)
        budget.consume(10)

        with pytest.raises(RuntimeError, match="không chờ"):
            budget.consume(1, wait=False)


class TestAsymmetricEmbedding:
    """Câu hỏi và tài liệu phải đi qua hai đường khác nhau.

    Với Cohere, `search_query` và `search_document` là hai biểu diễn được huấn
    luyện riêng. Dùng nhầm không gây lỗi gì cả — chỉ làm chất lượng truy xuất
    tụt âm thầm, nên phải khoá lại bằng test.
    """

    def test_truy_van_dung_embed_query(self, store):
        store.search("người bệnh nên ăn gì")
        assert store.embedder.query_calls == ["người bệnh nên ăn gì"]
        assert store.embedder.doc_calls == []

    def test_nap_chunk_dung_embed_documents(self, store):
        from src.rag.chunk import Chunk

        store.collection.upsert = lambda **kw: None
        store.upsert([Chunk(chunk_id="c1", doc_id="d", text="x", embed_text="ngữ cảnh x")])
        assert store.embedder.doc_calls == [["ngữ cảnh x"]]
        assert store.embedder.query_calls == []


class TestSearchFilter:
    def test_dung_khoa_loc_sinh_tu_ma_benh(self, store):
        store.search("abc", disease="hypertension")
        assert store.collection.last_query["where"] == {"disease_hypertension": True}

    def test_khoa_loc_hop_le_cho_benh_bat_ky(self, store):
        # Bệnh thứ ba thêm vào registry cũng lọc được, không phải sửa code.
        store.search("abc", disease="copd")
        assert store.collection.last_query["where"] == {"disease_copd": True}

    def test_loc_or_khi_ho_so_co_nhieu_benh(self, store):
        store.search("abc", disease=["type2_diabetes", "hypertension"])
        assert store.collection.last_query["where"] == {
            "$or": [
                {"disease_type2_diabetes": True},
                {"disease_hypertension": True},
            ]
        }

    def test_khong_loc_khi_khong_chi_dinh_benh(self, store):
        store.search("abc")
        assert store.collection.last_query["where"] is None

    def test_loc_theo_allow_list_tai_lieu_da_duyet(self, store):
        store.search("abc", allowed_doc_ids=["doc-a", "doc-b"])
        assert store.collection.last_query["where"] == {"doc_id": {"$in": ["doc-a", "doc-b"]}}

    def test_ghep_allow_list_voi_loc_benh(self, store):
        store.search("abc", disease="hypertension", allowed_doc_ids=["doc-a"])
        assert store.collection.last_query["where"] == {
            "$and": [
                {"disease_hypertension": True},
                {"doc_id": {"$in": ["doc-a"]}},
            ]
        }

    def test_allow_list_rong_khong_goi_embedding(self, store):
        assert store.search("abc", allowed_doc_ids=[]) == []
        assert store.embedder.query_calls == []


class TestSearchScoring:
    def test_quy_doi_khoang_cach_thanh_do_tuong_dong(self, store):
        store.collection.response = make_response([("c1", "text", {"priority": 0.0}, 0.25)])
        hits = store.search("abc")
        assert hits[0].similarity == pytest.approx(0.75)

    def test_cong_diem_cho_tai_lieu_moi_hon(self, store):
        # Cùng độ tương đồng, tài liệu priority cao hơn phải xếp trên.
        store.collection.response = make_response(
            [
                ("cu", "tài liệu cũ", {"priority": 0.0, "published_year": 2010}, 0.20),
                ("moi", "tài liệu mới", {"priority": 1.0, "published_year": 2025}, 0.20),
            ]
        )
        hits = store.search("abc")
        assert [h.chunk_id for h in hits] == ["moi", "cu"]
        assert hits[0].score == pytest.approx(0.8 + 0.2 * 1.0)

    def test_do_tuong_dong_cao_hon_van_thang_du_cu_hon(self, store):
        # Recency chỉ là điểm cộng, không được đè bẹp mức liên quan ngữ nghĩa.
        store.collection.response = make_response(
            [
                ("cu_rat_lien_quan", "x", {"priority": 0.0}, 0.10),
                ("moi_it_lien_quan", "y", {"priority": 1.0}, 0.50),
            ]
        )
        hits = store.search("abc")
        assert hits[0].chunk_id == "cu_rat_lien_quan"

    def test_loai_ket_qua_duoi_nguong(self, store):
        store.collection.response = make_response(
            [
                ("tot", "x", {"priority": 0.0}, 0.30),  # similarity 0.70
                ("te", "y", {"priority": 0.0}, 0.90),  # similarity 0.10 < 0.3
            ]
        )
        hits = store.search("abc")
        assert [h.chunk_id for h in hits] == ["tot"]

    def test_rong_khi_khong_gi_vuot_nguong(self, store):
        store.collection.response = make_response([("te", "y", {"priority": 0.0}, 0.95)])
        # Mảng rỗng là tín hiệu để agent đi nhánh doctor_referral (brief mục 7.1).
        assert store.search("abc") == []

    def test_cat_dung_top_k(self, store):
        rows = [(f"c{i}", "x", {"priority": 0.0}, 0.1) for i in range(10)]
        store.collection.response = make_response(rows)
        assert len(store.search("abc")) == 3  # top_k=3 trong fixture

    def test_diem_cong_recency_tat_duoc(self, store):
        store.settings = store.settings.model_copy(update={"recency_weight": 0.0})
        store.collection.response = make_response(
            [
                ("cu", "x", {"priority": 0.0}, 0.20),
                ("moi", "y", {"priority": 1.0}, 0.20),
            ]
        )
        hits = store.search("abc")
        assert hits[0].score == hits[1].score

    def test_hoa_diem_thi_sap_xep_theo_chunk_id_de_lap_lai_duoc(self, store):
        store.collection.response = make_response(
            [
                ("chunk-z", "z", {"priority": 0.0}, 0.20),
                ("chunk-a", "a", {"priority": 0.0}, 0.20),
            ]
        )

        assert [hit.chunk_id for hit in store.search("abc")] == ["chunk-a", "chunk-z"]


class TestDeleteByDoc:
    def test_xoa_theo_doc_id(self, store):
        removed = store.delete_by_doc("tai-lieu-x")
        assert store.collection.deleted == [{"doc_id": "tai-lieu-x"}]
        assert removed == 100  # count 100 -> 0


class TestDocumentChunks:
    def test_chi_lay_chunk_cua_mot_tai_lieu_va_sap_xep_theo_thu_tu_doc(self, store):
        store.collection.get_response = {
            "ids": ["doc-a::0002::later", "doc-a::0001::first"],
            "documents": ["Nội dung sau", "Nội dung đầu"],
            "metadatas": [
                {"section_path": "Phần 2", "page_start": 3, "page_end": 4},
                {
                    "section_path": "Phần 1",
                    "page_start": 1,
                    "page_end": 1,
                    "table_structure": json.dumps(
                        {
                            "rows": 2,
                            "columns": 2,
                            "cells": [{"text": "A", "row": 0, "column": 0}],
                        }
                    ),
                },
            ],
        }

        chunks = store.document_chunks("doc-a")

        assert store.collection.last_get["where"] == {"doc_id": "doc-a"}
        assert store.collection.last_get["include"] == ["documents", "metadatas"]
        assert [chunk["chunk_id"] for chunk in chunks] == ["doc-a::0001::first", "doc-a::0002::later"]
        assert chunks[0]["section_path"] == "Phần 1"
        assert chunks[0]["table"]["cells"][0]["text"] == "A"
        assert chunks[1]["page_end"] == 4


class TestHitCitation:
    def test_dung_hinh_dang_citation_cua_hop_dong_api(self):
        hit = Hit(
            chunk_id="c1",
            text="x" * 500,
            metadata={
                "title": "Hướng dẫn THA",
                "issuer": "Bộ Y tế",
                "doc_code": "3192/QĐ-BYT",
                "url": "",
            },
            similarity=0.8,
            score=0.9,
        )
        c = hit.citation
        assert set(c) == {"title", "issuer", "doc_code", "url", "snippet"}
        assert c["url"] is None  # chuỗi rỗng phải thành null theo hợp đồng
        assert len(c["snippet"]) == 300  # giới hạn 300 ký tự của api-contract.md


class TestStats:
    def test_dem_chunk_theo_tai_lieu(self, store):
        assert store.stats()["per_doc"] == {"a": 2, "b": 1}


class TestDualModeVectorStore:
    def test_tu_dong_chuyen_backend_theo_database_url(self, monkeypatch):
        from src.core.config import get_settings
        from src.rag.store import ChromaStore, PgVectorStore

        # Khi database_url là postgresql
        monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost:5432/db")
        get_settings.cache_clear()
        store_pg = VectorStore()
        assert isinstance(store_pg, PgVectorStore)
        assert store_pg.collection is store_pg

        # Khi database_url là sqlite
        monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///./data/app.db")
        get_settings.cache_clear()
        store_sqlite = VectorStore()
        assert isinstance(store_sqlite, ChromaStore)

        get_settings.cache_clear()

    def test_pgvector_store_method_parity(self):
        from sqlalchemy import create_engine

        from src.models.domain import Base, MedicalChunk
        from src.rag.store import PgVectorStore

        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)

        store = PgVectorStore()
        store._sync_engine = engine

        assert store.count() == 0
        assert store.collection.count() == 0
        assert store.stats() == {"total": 0, "per_doc": {}}

        with engine.begin() as conn:
            conn.execute(
                MedicalChunk.__table__.insert().values(
                    chunk_id="doc1::001",
                    doc_id="doc1",
                    text="Chăm sóc bệnh tiểu đường",
                    embed_text="Chăm sóc bệnh tiểu đường",
                    disease="type2_diabetes",
                    priority=1.0,
                    section_path="Section > Sub",
                    page_start=5,
                    page_end=6,
                    table_structure={"headers": ["A"], "rows": [["1"]]},
                    metadata_json={"disease_type2_diabetes": True},
                    # SQLite does not have pgvector's bind processor. This
                    # parity test exercises count/read/delete only, so a JSON
                    # representation is enough to populate the nullable
                    # column without pretending SQLite can run vector search.
                    embedding=json.dumps([0.05] * 1024),
                )
            )

        assert store.count() == 1
        assert store.stats() == {"total": 1, "per_doc": {"doc1": 1}}

        doc_chunks = store.document_chunks("doc1")
        assert len(doc_chunks) == 1
        assert doc_chunks[0]["chunk_id"] == "doc1::001"
        assert doc_chunks[0]["content"] == "Chăm sóc bệnh tiểu đường"
        assert doc_chunks[0]["page_start"] == 5
        assert doc_chunks[0]["page_end"] == 6
        assert doc_chunks[0]["table"] == {"headers": ["A"], "rows": [["1"]]}

        assert store.delete_by_doc("doc1") == 1
        assert store.count() == 0

        store.reset()
        assert store.count() == 0
