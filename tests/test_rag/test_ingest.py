"""Test cho luồng biên tập viên tải tài liệu lên (FR4.1, FR4.3).

Test ở đây KHÔNG cần Docling: chúng kiểm phần hàng rào nghiệp vụ — cái gì được
vào thư viện, cái gì bị chặn, và trạng thái được ghi lại thế nào. Phần parse
thật đã có test riêng ở tầng dưới.

Điều quan trọng nhất được khoá lại: tài liệu vừa tải lên KHÔNG bao giờ tự động
vào vector store. Brief mục 7.1 nói hệ thống chỉ được trả lời từ thư viện đã
duyệt, nên đây là ràng buộc an toàn chứ không phải chi tiết tiện dụng.
"""

import json
import textwrap

import pytest

from src.rag.config import RagSettings
from src.rag.ingest import (
    IngestError,
    list_pending,
    reject,
    remove,
    slugify,
    stage_upload,
)
from src.rag.registry import load_registry

REGISTRY_YAML = textwrap.dedent("""
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
""")


@pytest.fixture
def settings(tmp_path):
    (tmp_path / "raw").mkdir()
    (tmp_path / "quarantine").mkdir()
    reg = tmp_path / "registry.yaml"
    reg.write_text(REGISTRY_YAML, encoding="utf-8")
    return RagSettings(registry_path=reg, raw_dir=tmp_path / "raw")


VALID = {
    "title": "Hướng dẫn điều trị tăng huyết áp",
    "issuer": "Bộ Y tế",
    "published": "2026",
    "diseases": ["hypertension"],
}


class FakeStore:
    """Vector store giả, chỉ ghi lại nó được gọi những gì."""

    def __init__(self):
        self.deleted: list[str] = []
        self.upserted: list = []

    def delete_by_doc(self, doc_id):
        self.deleted.append(doc_id)
        return 7

    def upsert(self, chunks):
        self.upserted.extend(chunks)
        return len(chunks)


class TestSlugify:
    def test_bo_dau_tieng_viet(self):
        assert slugify("Hướng dẫn Đái tháo đường típ 2") == "huong-dan-dai-thao-duong-tip-2"

    def test_chuoi_khong_co_ky_tu_hop_le(self):
        assert slugify("!!! ???") == "tai-lieu"

    def test_cat_theo_do_dai(self):
        assert len(slugify("a" * 200)) == 60


class TestStageUpload:
    def test_luu_file_va_ghi_nhan_cho_duyet(self, settings):
        result = stage_upload("huongdan.pdf", b"%PDF-1.4 noi dung", settings=settings, **VALID)

        assert result.status == "pending_review"
        assert (settings.raw_dir / f"{result.doc_id}.pdf").read_bytes().startswith(b"%PDF")

        uploads = json.loads((settings.registry_path.parent / "uploads.json").read_text(encoding="utf-8"))
        assert len(uploads["documents"]) == 1
        assert uploads["documents"][0]["status"] == "pending_review"

    def test_tai_lieu_moi_tai_len_khong_tu_vao_thu_vien(self, settings):
        """Hàng rào HITL — điều quan trọng nhất của cả module này."""
        stage_upload("a.pdf", b"%PDF", settings=settings, **VALID)
        registry = load_registry(settings=settings)

        assert registry.approved() == []  # không có gì để index
        assert len(registry.pending()) == 1  # nhưng vẫn nhìn thấy để duyệt

    def test_tu_choi_dinh_dang_khong_ho_tro(self, settings):
        with pytest.raises(IngestError, match="Không hỗ trợ định dạng"):
            stage_upload("virus.exe", b"MZ", settings=settings, **VALID)

    def test_tu_choi_file_rong(self, settings):
        with pytest.raises(IngestError, match="rỗng"):
            stage_upload("a.pdf", b"", settings=settings, **VALID)

    def test_tu_choi_benh_ngoai_pham_vi(self, settings):
        bad = {**VALID, "diseases": ["asthma"]}
        with pytest.raises(IngestError, match="không có trong phạm vi"):
            stage_upload("a.pdf", b"%PDF", settings=settings, **bad)

    def test_bao_cach_them_benh_moi_khi_bao_loi(self, settings):
        bad = {**VALID, "diseases": ["copd"]}
        with pytest.raises(IngestError, match="registry.yaml"):
            stage_upload("a.pdf", b"%PDF", settings=settings, **bad)

    def test_tu_choi_khi_khong_khai_benh(self, settings):
        bad = {**VALID, "diseases": []}
        with pytest.raises(IngestError):
            stage_upload("a.pdf", b"%PDF", settings=settings, **bad)

    def test_doc_id_khong_trung_khi_cung_tieu_de(self, settings):
        a = stage_upload("a.pdf", b"%PDF", settings=settings, **VALID)
        b = stage_upload("b.pdf", b"%PDF", settings=settings, **VALID)
        assert a.doc_id != b.doc_id
        assert b.doc_id.endswith("-2")

    def test_ghi_nhan_nguoi_tai_len(self, settings):
        stage_upload("a.pdf", b"%PDF", settings=settings, uploaded_by="bs.an", **VALID)
        doc = load_registry(settings=settings).pending()[0]
        assert doc.uploaded_by == "bs.an"
        assert doc.uploaded_at is not None

    def test_so_hieu_van_ban_mac_dinh_la_chua_xac_minh(self, settings):
        stage_upload("a.pdf", b"%PDF", settings=settings, doc_code="1234/QĐ-BYT", **VALID)
        doc = load_registry(settings=settings).pending()[0]
        assert doc.doc_code == "1234/QĐ-BYT"
        assert doc.doc_code_verified is False


class TestListPending:
    def test_liet_ke_cho_man_hinh_duyet(self, settings):
        stage_upload("a.pdf", b"%PDF", settings=settings, uploaded_by="bs.an", **VALID)
        items = list_pending(settings)
        assert len(items) == 1
        assert items[0]["title"] == VALID["title"]
        assert items[0]["diseases"] == ["hypertension"]

    def test_rong_khi_chua_ai_tai_gi(self, settings):
        assert list_pending(settings) == []


class TestReject:
    def test_chuyen_file_sang_quarantine_va_giu_ly_do(self, settings):
        r = stage_upload("a.pdf", b"%PDF", settings=settings, **VALID)
        reject(r.doc_id, ["ngoài phạm vi nội dung"], "bs.binh", settings=settings)

        assert not (settings.raw_dir / f"{r.doc_id}.pdf").exists()
        assert (settings.raw_dir.parent / "quarantine" / f"{r.doc_id}.pdf").exists()

        log = json.loads((settings.raw_dir.parent / "quarantine" / "rejected.json").read_text(encoding="utf-8"))
        assert log[0]["reasons"] == ["ngoài phạm vi nội dung"]
        assert log[0]["decided_by"] == "bs.binh"

    def test_bat_buoc_ghi_ly_do(self, settings):
        r = stage_upload("a.pdf", b"%PDF", settings=settings, **VALID)
        with pytest.raises(IngestError, match="lý do"):
            reject(r.doc_id, [], "bs.binh", settings=settings)

    def test_khong_con_trong_hang_cho_sau_khi_tu_choi(self, settings):
        r = stage_upload("a.pdf", b"%PDF", settings=settings, **VALID)
        reject(r.doc_id, ["trùng nội dung"], "bs.binh", settings=settings)
        assert list_pending(settings) == []


class TestRemove:
    def test_xoa_chunk_khoi_store(self, settings):
        r = stage_upload("a.pdf", b"%PDF", settings=settings, **VALID)
        store = FakeStore()
        result = remove(r.doc_id, settings=settings, store=store)

        assert store.deleted == [r.doc_id]
        assert result.chunks == 7
        assert list_pending(settings) == []

    def test_bao_loi_khi_khong_co_tai_lieu(self, settings):
        with pytest.raises(KeyError):
            remove("khong-ton-tai", settings=settings, store=FakeStore())


class TestApproveGuards:
    """Kiểm hàng rào của approve mà không cần chạy Docling."""

    def test_chi_duyet_duoc_tai_lieu_dang_cho(self, settings, monkeypatch):
        from src.rag import ingest

        r = stage_upload("a.pdf", b"%PDF", settings=settings, **VALID)

        # Giả lập tài liệu đã duyệt rồi.
        docs = ingest.uploaded_docs(settings)
        docs[0].status = "approved"
        ingest.save_uploads(docs, settings)

        with pytest.raises(IngestError, match="đã được duyệt"):
            ingest.approve(r.doc_id, "bs.binh", settings=settings, store=FakeStore())

    def test_bao_loi_ro_khi_khong_ra_chunk_nao(self, settings, monkeypatch):
        from src.rag import ingest
        from src.rag.chunk import DropStat

        r = stage_upload("a.pdf", b"%PDF", settings=settings, **VALID)
        monkeypatch.setattr(ingest, "process", lambda *a, **k: ([], DropStat(), {}))

        with pytest.raises(IngestError, match="không ra chunk nào"):
            ingest.approve(r.doc_id, "bs.binh", settings=settings, store=FakeStore())

    def test_duyet_thanh_cong_thi_xoa_cu_roi_nap_moi(self, settings, monkeypatch):
        from src.rag import ingest
        from src.rag.chunk import Chunk, DropStat

        r = stage_upload("a.pdf", b"%PDF", settings=settings, **VALID)
        fake_chunks = [Chunk(chunk_id="c1", doc_id=r.doc_id, text="x", embed_text="x")]
        monkeypatch.setattr(ingest, "process", lambda *a, **k: (fake_chunks, DropStat(), {"merged_text": 3}))

        store = FakeStore()
        result = ingest.approve(r.doc_id, "bs.binh", settings=settings, store=store)

        assert result.status == "approved"
        assert result.chunks == 1
        assert result.repairs == {"merged_text": 3}
        # Xoá trước rồi nạp, để duyệt lại lần hai không nhân đôi chunk.
        assert store.deleted == [r.doc_id]
        assert len(store.upserted) == 1

        doc = load_registry(settings=settings).by_id(r.doc_id)
        assert doc.status == "approved"
        assert doc.approved_by == "bs.binh"
        assert doc.approved_at is not None

    def test_sau_khi_duyet_thi_vao_thu_vien(self, settings, monkeypatch):
        from src.rag import ingest
        from src.rag.chunk import Chunk, DropStat

        r = stage_upload("a.pdf", b"%PDF", settings=settings, **VALID)
        monkeypatch.setattr(
            ingest,
            "process",
            lambda *a, **k: ([Chunk(chunk_id="c1", doc_id=r.doc_id, text="x", embed_text="x")], DropStat(), {}),
        )
        ingest.approve(r.doc_id, "bs.binh", settings=settings, store=FakeStore())

        registry = load_registry(settings=settings)
        assert len(registry.approved()) == 1
        assert registry.pending() == []
