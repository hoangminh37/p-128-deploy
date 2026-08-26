"""Test cho bước lọc rác, cắt chunk và gắn metadata."""

import json

import pytest

from src.rag.chunk import (
    DropStat,
    build_chunks,
    count_tokens,
    deduplicate,
    filter_elements,
    group_into_chunks,
)
from src.rag.config import RagSettings
from src.rag.elements import Element, TableCell, TableStructure
from src.rag.registry import SourceDoc
from src.rag.structure import build_section_paths


@pytest.fixture
def settings():
    return RagSettings(chunk_max_tokens=200, chunk_overlap_tokens=40, chunk_min_chars=40)


@pytest.fixture
def doc():
    return SourceDoc(
        doc_id="test-doc",
        file="test.pdf",
        title="Hướng dẫn thử nghiệm",
        issuer="Bộ Y tế",
        published="2020",
        lang="vi",
        authority="vn_moh",
        diseases=["hypertension"],
    )


def text_el(text, page=1):
    return Element(kind="text", text=text, page=page)


LONG = "Người bệnh tăng huyết áp nên hạn chế lượng muối ăn vào dưới năm gam mỗi ngày. " * 3


class TestFilterElements:
    def test_bo_khoi_qua_ngan(self, settings):
        stats = DropStat()
        out = filter_elements([text_el("ngắn")], settings, stats)
        assert out == []
        assert stats.too_short == 1

    def test_bo_khoi_hanh_chinh(self, settings):
        stats = DropStat()
        out = filter_elements([text_el("Nơi nhận: Như trên; Lưu VT, KCB. " * 5)], settings, stats)
        assert out == []
        assert stats.boilerplate == 1

    def test_bo_danh_sach_tham_khao(self, settings):
        stats = DropStat()
        block = (
            "1. Nguyen VA, Tran MH, et al. Blood pressure control. Circulation. 2020.\n"
            "2. Smith J, Doe A, et al. Hypertension trends. Lancet. 2021.\n"
            "3. Le TT, Pham QD, et al. Diabetes care. BMJ. 2019.\n"
            "4. Kim S, Park J, et al. Metformin therapy. NEJM. 2022."
        )
        out = filter_elements([text_el(block)], settings, stats)
        assert out == []
        assert stats.reference == 1

    def test_giu_noi_dung_that(self, settings):
        stats = DropStat()
        out = filter_elements([text_el(LONG)], settings, stats)
        assert len(out) == 1

    def test_giu_bang_ngan(self, settings):
        stats = DropStat()
        table = Element(kind="table", text="| Độ | Tâm thu |\n| --- | --- |\n| 1 | 140 |")
        out = filter_elements([table], settings, stats)
        assert len(out) == 1

    def test_tieu_de_luon_duoc_giu(self, settings):
        stats = DropStat()
        out = filter_elements([Element(kind="heading", text="1. A", level=1)], settings, stats)
        assert len(out) == 1

    def test_bo_dong_chi_co_duong_dan(self, settings):
        stats = DropStat()
        out = filter_elements([text_el("(https://doi.org/10.2337/dc26-S002)")], settings, stats)
        assert out == []
        assert stats.boilerplate == 1

    def test_bo_slide_ban_quyen(self, settings):
        # Slide mở đầu của bộ ADA.
        stats = DropStat()
        legal = (
            "This slide deck contains content created, reviewed, and approved by the "
            "American Diabetes Association. You are free to use the slides without "
            "further permission as long as appropriate attribution is made."
        )
        out = filter_elements([text_el(legal)], settings, stats)
        assert out == []
        assert stats.boilerplate == 1

    def test_bo_khoi_lap_lai_nhieu_lan(self, settings):
        # Nhãn chương in lại ở chân mỗi slide — đủ dài để không bị lọc theo độ dài,
        # là chữ thật nên không bị lọc theo mật độ chữ. Chỉ tần suất lặp bắt được.
        stats = DropStat()
        label = "2. Diagnosis and Classification of Diabetes"
        els = [text_el(label) for _ in range(5)] + [text_el(LONG)]
        out = filter_elements(els, settings, stats)
        assert len(out) == 1
        assert out[0].text.startswith("Người bệnh")

    def test_khong_bo_khoi_lap_it_lan(self, settings):
        stats = DropStat()
        label = "Một dòng lặp lại đúng hai lần thôi thì vẫn giữ."
        out = filter_elements([text_el(label), text_el(label)], settings, stats)
        assert len(out) == 2

    def test_giu_khoi_ngan_nhung_la_noi_dung_that(self):
        # Dùng cấu hình mặc định của production, không dùng fixture rút gọn.
        prod = RagSettings()
        stats = DropStat()
        rec = (
            "2.5 Classify people with hyperglycemia into appropriate "
            "diagnostic categories to aid in personalized management. E"
        )
        assert len(rec) < prod.chunk_min_chars  # ngắn hơn ngưỡng chunk...
        out = filter_elements([text_el(rec)], prod, stats)
        assert len(out) == 1  # ...nhưng vẫn qua được ngưỡng khối


class TestGroupIntoChunks:
    def test_ton_trong_ngan_sach_token(self, settings):
        els = build_section_paths([text_el(LONG) for _ in range(6)])
        groups = group_into_chunks(els, settings)
        assert len(groups) > 1
        for g in groups:
            body = "\n\n".join(e.text for e in g)
            # Cho phép vượt do khối cuối không bị xé giữa chừng.
            assert count_tokens(body) <= settings.chunk_max_tokens * 2

    def test_bang_thanh_chunk_rieng(self, settings):
        els = build_section_paths(
            [text_el(LONG), Element(kind="table", text="| A | B |\n| --- | --- |\n| 1 | 2 |"), text_el(LONG)]
        )
        groups = group_into_chunks(els, settings)
        table_groups = [g for g in groups if g[0].kind == "table"]
        assert len(table_groups) == 1
        assert len(table_groups[0]) == 1

    def test_doi_muc_thi_dong_chunk(self, settings):
        els = [
            Element(kind="heading", text="1. A", level=1),
            text_el("Nội dung mục A dài đủ để không bị lọc bỏ vì quá ngắn."),
            Element(kind="heading", text="2. B", level=1),
            text_el("Nội dung mục B dài đủ để không bị lọc bỏ vì quá ngắn."),
        ]
        build_section_paths(els)
        groups = group_into_chunks(els, settings)
        assert len(groups) == 2

    def test_tieu_de_khong_tu_thanh_chunk(self, settings):
        els = build_section_paths([Element(kind="heading", text="1. A", level=1)])
        assert group_into_chunks(els, settings) == []


class TestBuildChunks:
    def test_metadata_day_du(self, settings, doc):
        els = build_section_paths(
            [Element(kind="heading", text="1. ĐỊNH NGHĨA", level=1), text_el(LONG)],
            doc_title=doc.citation_title,
        )
        chunks, _ = build_chunks(doc, els, settings)
        assert len(chunks) >= 1
        m = chunks[0].metadata
        for key in (
            "doc_id",
            "title",
            "issuer",
            "published",
            "published_year",
            "lang",
            "authority",
            "recency_rank",
            "priority",
            "section_path",
            "page_start",
            "diseases",
            "has_threshold",
            "token_count",
            "sha256",
        ):
            assert key in m, f"thiếu metadata {key}"
        assert m["published_year"] == 2020
        assert m["disease_hypertension"] is True

    def test_embed_text_co_tien_to_ngu_canh(self, settings, doc):
        els = build_section_paths(
            [Element(kind="heading", text="3. ĐIỀU TRỊ", level=1), text_el(LONG)],
            doc_title=doc.citation_title,
        )
        chunks, _ = build_chunks(doc, els, settings)
        assert chunks[0].embed_text.startswith("[Hướng dẫn thử nghiệm > 3. ĐIỀU TRỊ]")
        # text gốc giữ nguyên để làm snippet trích dẫn cho bệnh nhân
        assert not chunks[0].text.startswith("[")

    def test_gan_co_nguong_chan_doan(self, settings, doc):
        text = "Tăng huyết áp được xác định khi huyết áp tâm thu từ 140mmHg trở lên. " * 3
        chunks, _ = build_chunks(doc, build_section_paths([text_el(text)]), settings)
        assert chunks[0].metadata["has_threshold"] is True

    def test_gan_them_nhan_benh_tu_noi_dung(self, settings, doc):
        text = "Người bệnh đái tháo đường típ 2 cần kiểm soát HbA1c dưới 7 phần trăm. " * 3
        chunks, _ = build_chunks(doc, build_section_paths([text_el(text)]), settings)
        # doc khai báo hypertension, nội dung nói về đái tháo đường -> có cả hai
        assert chunks[0].metadata["disease_type2_diabetes"] is True
        assert chunks[0].metadata["disease_hypertension"] is True

    def test_loai_chunk_la_khoi_tham_khao_du_tung_khoi_khong_bi_loai(self, settings, doc):
        """Lọc hai tầng: khối lẻ lọt qua, nhưng ghép lại thành chunk thì phải bị loại.

        Đây là lỗi thật đo được trên corpus: từng mẩu trích dẫn riêng chưa đủ dấu
        hiệu, nhưng chunk ghép của chúng thì thành nguyên đoạn thư mục, và nó đã
        lên vị trí số 1 cho câu hỏi "tăng huyết áp nên ăn uống thế nào".
        """
        frag_a = (
            "The Trials of Hypertension Prevention Collaborative Research Group. Effects of "
            "weight loss and sodium reduction intervention on blood pressure. "
            "Arch Intern Med. 1997;157:657-667."
        )
        frag_b = (
            "17 . Filippini T, Malavolti M, Whelton PK, et al. Blood pressure effects of sodium "
            "reduction: dose-response meta-analysis. Circulation. 2021;143:1542-1567."
        )
        chunks, stats = build_chunks(doc, build_section_paths([text_el(frag_a), text_el(frag_b)]), settings)
        assert chunks == []
        assert stats.reference >= 1

    def test_giu_chunk_ngan_nhung_du_so_tu(self, doc):
        prod = RagSettings()
        rec = (
            "2.5 Classify people with hyperglycemia into appropriate "
            "diagnostic categories to aid in personalized management. E"
        )
        assert len(rec) < prod.chunk_min_chars  # 114 < 120
        chunks, _ = build_chunks(doc, build_section_paths([text_el(rec)]), prod)
        assert len(chunks) == 1  # giữ vì 16 từ >= chunk_min_words

    def test_bo_chunk_ngan_va_it_tu(self, doc):
        prod = RagSettings()
        chunks, stats = build_chunks(doc, build_section_paths([text_el("Table 2.1 xem bên dưới")]), prod)
        assert chunks == []
        assert stats.too_short == 1

    def test_bang_luon_duoc_giu_du_ngan(self, settings, doc):
        table = Element(kind="table", text="| Độ | Tâm thu |\n| --- | --- |\n| 1 | 140 |")
        chunks, _ = build_chunks(doc, build_section_paths([table]), settings)
        assert len(chunks) == 1
        assert chunks[0].metadata["kind"] == "table"

    def test_luu_luoi_bang_tu_parser_vao_metadata(self, settings, doc):
        table = Element(
            kind="table",
            text="| Độ | Tâm thu |\n| --- | --- |\n| 1 | 140 |",
            table=TableStructure(
                rows=2,
                columns=2,
                cells=[
                    TableCell("Độ", 0, 0, is_column_header=True),
                    TableCell("Tâm thu", 0, 1, is_column_header=True),
                    TableCell("1", 1, 0, is_row_header=True),
                    TableCell("140", 1, 1),
                ],
            ),
        )

        chunks, _ = build_chunks(doc, build_section_paths([table]), settings)

        structure = json.loads(chunks[0].metadata["table_structure"])
        assert structure["rows"] == 2
        assert structure["cells"][1]["text"] == "Tâm thu"
        assert structure["cells"][2]["is_row_header"] is True

    def test_chunk_id_on_dinh_theo_noi_dung(self, settings, doc):
        els = build_section_paths([text_el(LONG)])
        a, _ = build_chunks(doc, list(els), settings)
        b, _ = build_chunks(doc, list(build_section_paths([text_el(LONG)])), settings)
        assert a[0].chunk_id == b[0].chunk_id


class TestDeduplicate:
    def _chunk(self, text, doc_id="d1"):
        import hashlib

        from src.rag.chunk import Chunk

        return Chunk(
            chunk_id=f"{doc_id}-{text[:5]}",
            doc_id=doc_id,
            text=text,
            embed_text=text,
            metadata={"sha256": hashlib.sha256(text.encode()).hexdigest()},
        )

    def test_bo_trung_hoan_toan(self, settings):
        stats = DropStat()
        c = self._chunk(LONG)
        out = deduplicate([c, self._chunk(LONG)], settings, stats)
        assert len(out) == 1
        assert stats.duplicate == 1

    def test_khong_bo_trung_giua_hai_tai_lieu_khac_nhau(self, settings):
        # ESC và AHA nói giống nhau nhưng là hai nguồn trích dẫn khác nhau,
        # gộp lại là mất một nguồn.
        stats = DropStat()
        out = deduplicate([self._chunk(LONG, "esc"), self._chunk(LONG, "aha")], settings, stats)
        assert len(out) == 2
        assert stats.duplicate == 0

    def test_giu_noi_dung_khac_nhau(self, settings):
        stats = DropStat()
        other = "Đi bộ ba mươi phút mỗi ngày giúp kiểm soát đường huyết tốt hơn. " * 3
        out = deduplicate([self._chunk(LONG), self._chunk(other)], settings, stats)
        assert len(out) == 2
