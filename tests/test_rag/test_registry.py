"""Test cho registry — cổng vào của thư viện đã duyệt.

Kiểm hai thứ quan trọng nhất:
  * tài liệu không khai báo thì không vào được store (brief mục 7.1)
  * thứ tự ưu tiên tính đúng theo chính sách team đã chốt
"""

import textwrap

import pytest
from pydantic import ValidationError

from src.rag.config import RagSettings
from src.rag.registry import SourceDoc, _assign_priority, load_registry, verify_sources


def make_doc(doc_id, year, diseases, authority="international", **kw):
    return SourceDoc(
        doc_id=doc_id,
        file=f"{doc_id}.pdf",
        title=doc_id,
        issuer="X",
        published=str(year),
        lang=kw.pop("lang", "en"),
        authority=authority,
        diseases=diseases,
        **kw,
    )


class TestSourceDoc:
    def test_chap_nhan_ba_dinh_dang_ngay(self):
        for v in ("2020", "2020-08", "2020-08-31"):
            assert make_doc("d", v, ["hypertension"]).published == v

    def test_tu_choi_ngay_sai_dinh_dang(self):
        with pytest.raises(ValidationError):
            make_doc("d", "31/08/2020", ["hypertension"])

    def test_ma_benh_khong_bi_khoa_o_tang_kieu_du_lieu(self):
        # Mã bệnh là chuỗi tự do ở đây; việc đối chiếu với danh mục xảy ra lúc
        # load_registry (xem TestLoadRegistry). Nếu chỗ này dùng Literal thì
        # thêm bệnh mới lại phải sửa code — đúng thứ vừa gỡ bỏ.
        assert make_doc("d", "2020", ["copd"]).diseases == ["copd"]

    def test_nam_ban_hanh(self):
        assert make_doc("d", "2020-08-31", ["hypertension"]).published_year == 2020

    def test_uu_tien_ten_tieng_viet_khi_trich_dan(self):
        d = make_doc("d", "2020", ["hypertension"], issuer_vi="Bộ Y tế", title_vi="Hướng dẫn")
        assert d.citation_issuer == "Bộ Y tế"
        assert d.citation_title == "Hướng dẫn"

    def test_khong_co_ten_tieng_viet_thi_dung_ten_goc(self):
        d = make_doc("d", "2020", ["hypertension"])
        assert d.citation_issuer == "X"


class TestAssignPriorityRecency:
    def test_moi_hon_duoc_uu_tien_hon(self):
        docs = [
            make_doc("cu", 2010, ["hypertension"], authority="vn_moh"),
            make_doc("moi", 2025, ["hypertension"]),
            make_doc("giua", 2024, ["hypertension"]),
        ]
        _assign_priority(docs, "recency")
        by_id = {d.doc_id: d for d in docs}
        assert by_id["moi"].recency_rank == 1
        assert by_id["giua"].recency_rank == 2
        assert by_id["cu"].recency_rank == 3
        assert by_id["moi"].priority > by_id["giua"].priority > by_id["cu"].priority

    def test_tinh_rieng_cho_tung_benh(self):
        # Tài liệu 2026 về đái tháo đường không được đè lên tài liệu 2025 về THA.
        docs = [
            make_doc("dtd2026", 2026, ["type2_diabetes"]),
            make_doc("tha2025", 2025, ["hypertension"]),
        ]
        _assign_priority(docs, "recency")
        assert docs[0].recency_rank == 1
        assert docs[1].recency_rank == 1
        assert docs[0].priority == docs[1].priority == 1.0

    def test_mot_tai_lieu_duy_nhat_thi_uu_tien_toi_da(self):
        docs = [make_doc("only", 2010, ["hypertension"])]
        _assign_priority(docs, "recency")
        assert docs[0].priority == 1.0


class TestAssignPriorityVnFirst:
    def test_bo_y_te_len_dau_du_cu_hon(self):
        docs = [
            make_doc("moi_quoc_te", 2025, ["hypertension"]),
            make_doc("byt_cu", 2010, ["hypertension"], authority="vn_moh", lang="vi"),
        ]
        _assign_priority(docs, "vn_first")
        by_id = {d.doc_id: d for d in docs}
        assert by_id["byt_cu"].recency_rank == 1
        assert by_id["byt_cu"].priority > by_id["moi_quoc_te"].priority


class TestLoadRegistry:
    def _write(self, tmp_path, body, files=("a.pdf",)):
        raw = tmp_path / "raw"
        raw.mkdir(exist_ok=True)
        for f in files:
            (raw / f).write_bytes(b"%PDF-1.4")
        reg = tmp_path / "registry.yaml"
        reg.write_text(textwrap.dedent(body), encoding="utf-8")
        return reg, RagSettings(registry_path=reg, raw_dir=raw)

    BASE = """
        version: 1
        ranking_policy: recency
        diseases:
          hypertension:
            label_vi: "tăng huyết áp"
            label_en: "Hypertension"
            keywords: "tăng huyết áp|hypertens"
        documents:
          - doc_id: a
            file: a.pdf
            title: A
            issuer: Bộ Y tế
            published: "2020"
            lang: vi
            authority: vn_moh
            diseases: [hypertension]
            status: approved
        """

    def test_nap_duoc_va_tinh_uu_tien(self, tmp_path):
        reg, settings = self._write(tmp_path, self.BASE)
        r = load_registry(reg, settings=settings)
        assert len(r.approved()) == 1
        assert r.approved()[0].priority == 1.0

    def test_nap_duoc_ke_ca_khi_thieu_file_goc(self, tmp_path):
        # Server API không mang theo PDF, nên nạp registry không được phụ thuộc
        # vào việc file gốc có mặt hay không.
        reg, settings = self._write(tmp_path, self.BASE, files=())
        r = load_registry(reg, settings=settings)
        assert len(r.approved()) == 1

    def test_verify_sources_moi_la_cho_bao_thieu_file(self, tmp_path):
        reg, settings = self._write(tmp_path, self.BASE, files=())
        r = load_registry(reg, settings=settings)
        with pytest.raises(FileNotFoundError, match="data/raw"):
            verify_sources(r, settings)

    def test_verify_sources_qua_khi_du_file(self, tmp_path):
        reg, settings = self._write(tmp_path, self.BASE)
        verify_sources(load_registry(reg, settings=settings), settings)  # không ném

    def test_bao_loi_khi_benh_khong_co_trong_danh_muc(self, tmp_path):
        body = self.BASE.replace("diseases: [hypertension]", "diseases: [asthma]")
        reg, settings = self._write(tmp_path, body)
        with pytest.raises(ValueError, match="không có trong mục `diseases`"):
            load_registry(reg, settings=settings)

    def test_them_benh_moi_chi_can_sua_yaml(self, tmp_path):
        # Đây là điều toàn bộ đợt gỡ hardcode nhắm tới: bệnh thứ ba vào được
        # thư viện mà không sửa một dòng Python nào.
        body = self.BASE.replace(
            'keywords: "tăng huyết áp|hypertens"',
            'keywords: "tăng huyết áp|hypertens"\n'
            "          copd:\n"
            '            label_vi: "bệnh phổi tắc nghẽn mạn tính"\n'
            '            label_en: "COPD"\n'
            '            keywords: "phổi tắc nghẽn|copd"',
        ).replace("diseases: [hypertension]", "diseases: [copd]")
        reg, settings = self._write(tmp_path, body)
        r = load_registry(reg, settings=settings)
        assert "copd" in r.catalog
        assert r.approved()[0].diseases == ["copd"]
        assert r.catalog.label_vi("copd") == "bệnh phổi tắc nghẽn mạn tính"

    def test_bao_loi_khi_khong_co_registry(self, tmp_path):
        settings = RagSettings(registry_path=tmp_path / "khong-co.yaml", raw_dir=tmp_path)
        with pytest.raises(FileNotFoundError):
            load_registry(tmp_path / "khong-co.yaml", settings=settings)

    def test_ghi_de_chinh_sach_xep_hang(self, tmp_path):
        reg, settings = self._write(tmp_path, self.BASE)
        r = load_registry(reg, policy_override="vn_first", settings=settings)
        assert r.ranking_policy == "vn_first"

    def test_tai_lieu_khong_approved_thi_khong_vao_thu_vien(self, tmp_path):
        body = self.BASE.replace("status: approved", "status: draft")
        reg, settings = self._write(tmp_path, body)
        r = load_registry(reg, settings=settings)
        assert r.approved() == []

    def test_giu_lai_ly_do_cua_tai_lieu_bi_loai(self, tmp_path):
        body = self.BASE.rstrip() + textwrap.indent(
            '\nquarantined:\n  - doc_id: z\n    file: z.pdf\n    title: Z\n    reasons: ["ngoài phạm vi nội dung"]\n',
            " " * 8,
        )
        reg, settings = self._write(tmp_path, body)
        r = load_registry(reg, settings=settings)
        assert len(r.quarantined) == 1
        assert r.quarantined[0].reasons == ["ngoài phạm vi nội dung"]


def _corpus_present() -> bool:
    """File PDF/PPTX không nằm trong git, nên trên CI chúng không tồn tại."""
    try:
        load_registry()
    except FileNotFoundError:
        return False
    return True


@pytest.mark.skipif(
    not _corpus_present(),
    reason="Thiếu file gốc trong data/raw — bình thường trên CI, xem data/README.md",
)
class TestRegistryThat:
    """Kiểm chính file data/registry.yaml của dự án, không phải file dựng tạm."""

    def test_registry_that_hop_le(self):
        r = load_registry()
        assert len(r.approved()) == 5
        assert r.ranking_policy == "recency"

    def test_moi_tai_lieu_deu_thuoc_pham_vi(self):
        r = load_registry()
        for d in r.approved():
            assert set(d.diseases) <= {"type2_diabetes", "hypertension"}

    def test_tai_lieu_moi_nhat_moi_benh_duoc_uu_tien_nhat(self):
        r = load_registry()
        for disease in ("type2_diabetes", "hypertension"):
            group = [d for d in r.approved() if disease in d.diseases]
            top = min(group, key=lambda d: d.recency_rank)
            assert top.published_year == max(d.published_year for d in group)
