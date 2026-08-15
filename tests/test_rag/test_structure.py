"""Test cho bốn phép sửa cấu trúc lấy ý từ paper MinerU-Popo.

File này không cần Docling: nó chỉ làm việc trên Element, nên chạy được ở mọi máy
và ở CI mà không phải cài 3GB dependency.
"""

from src.rag.elements import Element
from src.rag.structure import (
    attach_captions,
    build_section_paths,
    merge_continued_tables,
    merge_truncated_text,
    repair_document,
    repair_heading_levels,
)


def heading_el(text, level=1, page=1):
    return Element(kind="heading", text=text, level=level, page=page)


def text_el(text, page=1):
    return Element(kind="text", text=text, page=page)


def table_el(text, page=1):
    return Element(kind="table", text=text, page=page)


class TestRepairHeadingLevels:
    def test_lay_cap_theo_danh_so(self):
        els = [
            heading_el("1. ĐỊNH NGHĨA", level=4),
            heading_el("1.1. Phân loại", level=4),
            heading_el("1.1.2. Chi tiết", level=1),
        ]
        repair_heading_levels(els)
        assert [e.level for e in els] == [1, 2, 3]

    def test_so_la_ma_la_cap_mot(self):
        els = [heading_el("III. ĐIỀU TRỊ", level=5)]
        repair_heading_levels(els)
        assert els[0].level == 1

    def test_chuong_va_phu_luc_la_cap_mot(self):
        els = [heading_el("Chương II", level=3), heading_el("Phụ lục 1", level=6)]
        repair_heading_levels(els)
        assert [e.level for e in els] == [1, 1]

    def test_muc_chu_cai_la_cap_bon(self):
        els = [heading_el("a) Thuốc lợi tiểu", level=2)]
        repair_heading_levels(els)
        assert els[0].level == 4

    def test_khong_co_danh_so_thi_giu_nguyen(self):
        els = [heading_el("KHUYẾN CÁO CHUNG", level=2)]
        repair_heading_levels(els)
        assert els[0].level == 2

    def test_ghi_lai_dau_vet_sua(self):
        els = [heading_el("1. ĐỊNH NGHĨA", level=4)]
        repair_heading_levels(els)
        assert any(r.startswith("heading_level:") for r in els[0].repairs)


class TestMergeTruncatedText:
    def test_noi_doan_bi_cat_qua_trang(self):
        els = [
            text_el("Người bệnh tăng huyết áp nên hạn chế lượng muối ăn vào", page=3),
            text_el("dưới 5 gam mỗi ngày để kiểm soát huyết áp.", page=4),
        ]
        out = merge_truncated_text(els)
        assert len(out) == 1
        assert "muối ăn vào dưới 5 gam" in out[0].text

    def test_khong_noi_khi_doan_truoc_da_tron_cau(self):
        els = [text_el("Đây là một câu hoàn chỉnh.", page=1), text_el("câu sau viết thường.", page=2)]
        assert len(merge_truncated_text(els)) == 2

    def test_khong_noi_khi_doan_sau_la_dau_muc_moi(self):
        els = [text_el("Các thuốc thường dùng gồm", page=1), text_el("- Thuốc lợi tiểu", page=1)]
        assert len(merge_truncated_text(els)) == 2

    def test_khong_noi_khi_doan_sau_viet_hoa(self):
        els = [text_el("Danh sách dưới đây", page=1), text_el("Thuốc chẹn beta được dùng", page=1)]
        assert len(merge_truncated_text(els)) == 2

    def test_khong_noi_khi_cach_nhau_qua_mot_trang(self):
        els = [text_el("phần đầu chưa kết thúc", page=1), text_el("phần sau ở rất xa", page=9)]
        assert len(merge_truncated_text(els)) == 2

    def test_noi_lien_khi_co_gach_noi(self):
        els = [text_el("bệnh nhân bị tăng huyết-", page=1), text_el("áp cần theo dõi định kỳ", page=2)]
        out = merge_truncated_text(els)
        assert len(out) == 1
        assert "tăng huyếtáp" in out[0].text

    def test_danh_sach_rong(self):
        assert merge_truncated_text([]) == []


class TestMergeContinuedTables:
    def test_ghep_bang_qua_trang(self):
        a = table_el("| Phân độ | Tâm thu |\n| --- | --- |\n| Độ 1 | 140-159 |", page=5)
        b = table_el("| Độ 2 | 160-179 |\n| Độ 3 | >=180 |", page=6)
        out = merge_continued_tables([a, b])
        assert len(out) == 1
        assert "Độ 3" in out[0].text

    def test_bo_dong_tieu_de_lap_lai(self):
        a = table_el("| Phân độ | Tâm thu |\n| --- | --- |\n| Độ 1 | 140-159 |", page=5)
        b = table_el("| Phân độ | Tâm thu |\n| --- | --- |\n| Độ 2 | 160-179 |", page=6)
        out = merge_continued_tables([a, b])
        assert out[0].text.count("Phân độ") == 1

    def test_khong_ghep_khi_khac_so_cot(self):
        a = table_el("| A | B |\n| --- | --- |\n| 1 | 2 |", page=5)
        b = table_el("| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |", page=6)
        assert len(merge_continued_tables([a, b])) == 2

    def test_khong_ghep_khi_cach_xa_trang(self):
        a = table_el("| A | B |\n| --- | --- |\n| 1 | 2 |", page=5)
        b = table_el("| A | B |\n| --- | --- |\n| 3 | 4 |", page=40)
        assert len(merge_continued_tables([a, b])) == 2


class TestAttachCaptions:
    def test_caption_dung_truoc_bang(self):
        els = [
            Element(kind="caption", text="Bảng 1. Phân độ tăng huyết áp", page=1),
            table_el("| A | B |", page=1),
        ]
        out = attach_captions(els)
        assert len(out) == 1
        assert out[0].kind == "table"
        assert "Bảng 1" in out[0].text

    def test_caption_dung_sau_bang(self):
        els = [table_el("| A | B |", page=1), Element(kind="caption", text="Nguồn: Bộ Y tế", page=1)]
        out = attach_captions(els)
        assert len(out) == 1
        assert "Nguồn: Bộ Y tế" in out[0].text

    def test_caption_mo_coi_thanh_van_ban(self):
        els = [Element(kind="caption", text="Hình 3. Sơ đồ điều trị", page=1)]
        out = attach_captions(els)
        assert out[0].kind == "text"


class TestBuildSectionPaths:
    def test_duong_dan_long_nhau(self):
        els = [
            heading_el("1. ĐỊNH NGHĨA", level=1),
            text_el("Nội dung định nghĩa ở đây."),
            heading_el("2. ĐIỀU TRỊ", level=1),
            heading_el("2.1. Thuốc", level=2),
            text_el("Nội dung về thuốc."),
        ]
        build_section_paths(els, doc_title="Hướng dẫn THA")
        assert els[1].section_path == ["Hướng dẫn THA", "1. ĐỊNH NGHĨA"]
        assert els[4].section_path == ["Hướng dẫn THA", "2. ĐIỀU TRỊ", "2.1. Thuốc"]

    def test_tieu_de_cung_cap_thi_thay_the_nhau(self):
        els = [heading_el("2.1. A", level=2), heading_el("2.2. B", level=2), text_el("nội dung")]
        build_section_paths(els)
        assert els[2].section_path == ["2.2. B"]

    def test_khoi_truoc_moi_tieu_de(self):
        els = [text_el("Đoạn mở đầu chưa thuộc mục nào.")]
        build_section_paths(els, doc_title="Tài liệu")
        assert els[0].section_path == ["Tài liệu"]


class TestRepairDocument:
    def test_chay_ca_bon_phep_theo_dung_thu_tu(self):
        els = [
            heading_el("1. ĐIỀU TRỊ", level=5),
            text_el("Người bệnh nên hạn chế muối ăn vào", page=1),
            text_el("dưới 5 gam mỗi ngày.", page=2),
            Element(kind="caption", text="Bảng 1. Mục tiêu huyết áp", page=2),
            table_el("| Nhóm | Mục tiêu |\n| --- | --- |\n| Chung | <140/90 |", page=2),
            table_el("| Nhóm | Mục tiêu |\n| --- | --- |\n| ĐTĐ | <130/80 |", page=3),
        ]
        out = repair_document(els, doc_title="Hướng dẫn THA")

        headings = [e for e in out if e.kind == "heading"]
        assert headings[0].level == 1

        texts = [e for e in out if e.kind == "text"]
        assert len(texts) == 1
        assert "muối ăn vào dưới 5 gam" in texts[0].text

        tables = [e for e in out if e.kind == "table"]
        assert len(tables) == 1
        assert "Bảng 1" in tables[0].text
        assert "ĐTĐ" in tables[0].text
        assert tables[0].section_path == ["Hướng dẫn THA", "1. ĐIỀU TRỊ"]
