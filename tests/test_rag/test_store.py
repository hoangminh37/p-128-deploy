"""Test cho tầng embedding và vector store.

Không gọi mạng và không nạp mô hình thật: dùng embedder giả và collection giả.
Phần được kiểm là logic của ta — chọn provider, dựng mệnh đề lọc, quy đổi
khoảng cách thành độ tương đồng, và cộng điểm ưu tiên theo năm ban hành.
"""

import pytest

from src.rag.config import RagSettings
from src.rag.store import Hit, VectorStore, make_embedder


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
        self._count = count
        self.last_query: dict = {}
        self.deleted: list = []

    def query(self, **kwargs):
        self.last_query = kwargs
        return self.response

    def count(self):
        return self._count

    def delete(self, where=None):
        self.deleted.append(where)
        self._count = 0

    def get(self, include=None):
        return {"metadatas": [{"doc_id": "a"}, {"doc_id": "a"}, {"doc_id": "b"}]}


@pytest.fixture
def store(tmp_path, monkeypatch):
    settings = RagSettings(vectorstore_dir=tmp_path / "vs", recency_weight=0.2, min_similarity=0.3, top_k=3)
    s = VectorStore.__new__(VectorStore)  # bỏ qua __init__ để khỏi cần chromadb thật
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

    def test_khong_loc_khi_khong_chi_dinh_benh(self, store):
        store.search("abc")
        assert store.collection.last_query["where"] is None


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


class TestDeleteByDoc:
    def test_xoa_theo_doc_id(self, store):
        removed = store.delete_by_doc("tai-lieu-x")
        assert store.collection.deleted == [{"doc_id": "tai-lieu-x"}]
        assert removed == 100  # count 100 -> 0


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
