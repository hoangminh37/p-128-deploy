"""Test cho bộ làm sạch văn bản.

Các ví dụ ở đây lấy từ chính 5 tài liệu trong data/raw, không phải bịa ra —
mục đích là khoá lại đúng những lỗi thật đã gặp.
"""

import unicodedata

from src.rag.normalize import (
    alpha_ratio,
    clean_text,
    collapse_whitespace,
    dehyphenate,
    has_clinical_threshold,
    is_boilerplate,
    is_byline_block,
    is_reference_block,
    jaccard,
    normalize_unicode,
    shingles,
    strip_noise_lines,
)


class TestNormalizeUnicode:
    def test_chuan_hoa_ve_nfc(self):
        # "ệ" dạng tổ hợp (e + dấu mũ + dấu nặng) phải ra cùng chuỗi với dạng dựng sẵn.
        combining = unicodedata.normalize("NFD", "bệnh")
        assert combining != "bệnh"
        assert normalize_unicode(combining) == "bệnh"

    def test_sua_ky_tu_font_cu(self):
        # Lỗi thật gặp khi trích text từ QĐ 6858/QĐ-BYT.
        assert normalize_unicode("CHẤT LƢỢNG") == "CHẤT LƯỢNG"
        assert normalize_unicode("Ðái tháo đường") == "Đái tháo đường"

    def test_bo_ky_tu_vo_hinh(self):
        assert normalize_unicode("tăng\u200bhuyết\u00adáp") == "tănghuyếtáp"

    def test_quy_dau_nhay_cong_ve_dau_thuong(self):
        assert normalize_unicode("“huyết áp”") == '"huyết áp"'
        assert normalize_unicode("130–139 mmHg") == "130-139 mmHg"

    def test_chuoi_rong(self):
        assert normalize_unicode("") == ""


class TestDehyphenate:
    def test_noi_tu_bi_gach_xuong_dong(self):
        assert dehyphenate("hyper-\ntension") == "hypertension"
        assert dehyphenate("điều-\n  trị") == "điềutrị"

    def test_khong_pha_gach_noi_that(self):
        # Phần sau viết hoa hoặc là số thì giữ nguyên gạch nối.
        assert dehyphenate("COVID-\n19") == "COVID-\n19"
        assert dehyphenate("non-\nHDL") == "non-\nHDL"


class TestCollapseWhitespace:
    def test_gop_khoang_trang_giu_doan_van(self):
        assert collapse_whitespace("a   b\n\n\n\nc") == "a b\n\nc"

    def test_cat_dau_cuoi(self):
        assert collapse_whitespace("  xin chào  ") == "xin chào"


class TestStripNoiseLines:
    def test_bo_so_trang(self):
        assert strip_noise_lines("Nội dung thật\n12\nNội dung nữa") == "Nội dung thật\nNội dung nữa"
        assert "Trang 3/19" not in strip_noise_lines("Trang 3/19\nabc")

    def test_bo_dong_muc_luc(self):
        text = "3.2. Điều trị ...................... 45\nNội dung thật ở đây"
        assert "3.2. Điều trị" not in strip_noise_lines(text)

    def test_bo_khoi_hanh_chinh(self):
        text = "Nội dung thật\nNơi nhận:\n- Như trên;"
        assert "Nơi nhận" not in strip_noise_lines(text)

    def test_khong_dung_toi_noi_dung_binh_thuong(self):
        text = "Tăng huyết áp là khi huyết áp tâm thu ≥ 140mmHg."
        assert strip_noise_lines(text) == text


class TestIsReferenceBlock:
    def test_nhan_ra_danh_sach_tham_khao(self):
        block = (
            "1. Nguyen VA, Tran MH, et al. Blood pressure control. Circulation. 2020.\n"
            "2. Smith J, Doe A, et al. Hypertension trends. Lancet. 2021.\n"
            "3. Le TT, Pham QD, et al. Diabetes care in Vietnam. BMJ. 2019.\n"
            "4. Kim S, Park J, et al. Metformin therapy. NEJM. 2022."
        )
        assert is_reference_block(block)

    def test_nhan_ra_tieu_de_tham_khao(self):
        assert is_reference_block("TÀI LIỆU THAM KHẢO")
        assert is_reference_block("References")

    def test_khong_bat_nham_van_xuoi(self):
        text = (
            "1. Định nghĩa\n"
            "Tăng huyết áp là khi huyết áp tâm thu từ 140 mmHg trở lên.\n"
            "Đây là bệnh mạn tính phổ biến ở người trưởng thành."
        )
        assert not is_reference_block(text)

    def test_bat_trich_dan_khong_danh_so(self):
        # Trích thật từ hướng dẫn AHA/ACC 2025 — số thứ tự đã mất khi parse,
        # nên bộ lọc dựa vào tiền tố "12." không bắt được.
        block = (
            "Zomer E, Gurusamy K, Leach R, et al. Interventions that cause weight loss and the "
            "impact on cardiovascular risk factors: a systematic review and meta-analysis. "
            "Obes Rev. 2016;17:1001-1011. Blumenthal JA, Babyak MA, Hinderliter A, et al. "
            "Effects of the DASH diet alone and in combination with exercise. "
            "Arch Intern Med. 2010;170:126-135."
        )
        assert is_reference_block(block)

    def test_bat_manh_trich_dan_ngan(self):
        # Chunk 14 từ, mở đầu bằng danh sách tác giả.
        assert is_reference_block(
            "Fravel MA, Ernst M. Drug interactions with antihypertensives. Curr Hypertens Rep. 2021;23:14."
        )

    def test_khong_bat_doan_lam_sang_co_nhac_mot_nghien_cuu(self):
        # Mật độ dấu hiệu thấp — đây là nội dung thật, phải giữ.
        text = (
            "Nhiều nghiên cứu cho thấy giảm cân giúp hạ huyết áp ở người thừa cân. "
            "Theo phân tích gộp năm 2016, mỗi kilôgam cân nặng giảm được tương ứng "
            "với mức hạ huyết áp tâm thu khoảng 1 mmHg. Vì vậy người bệnh thừa cân "
            "được khuyến khích giảm cân từ từ và duy trì lâu dài."
        )
        assert not is_reference_block(text)

    def test_khong_bat_khuyen_cao_danh_so_cua_ada(self):
        text = (
            "5.37 Counsel adults with type 1 diabetes and type 2 diabetes to engage in "
            "2-3 sessions per week of resistance exercise on nonconsecutive days."
        )
        assert not is_reference_block(text)


class TestIsBoilerplate:
    def test_bat_khoi_hanh_chinh(self):
        assert is_boilerplate("KT. BỘ TRƯỞNG")
        assert is_boilerplate("Nơi nhận:")

    def test_bat_khoi_toan_so(self):
        assert is_boilerplate("12  34  56  78  90  11  22")

    def test_khong_bat_noi_dung_that(self):
        assert not is_boilerplate("Người bệnh tăng huyết áp nên hạn chế lượng muối ăn vào dưới 5 gam mỗi ngày.")

    def test_chuoi_rong_la_rac(self):
        assert is_boilerplate("   ")


class TestIsBylineBlock:
    def test_bat_danh_sach_tac_gia_quoc_te(self):
        # Mở đầu hướng dẫn AHA/ACC 2025.
        text = (
            "Daniel W. Jones, MD, FAHA, Chair; Keith C. Ferdinand, MD, FACC, FAHA, FASPC, "
            "Vice Chair; Sandra J. Taler, MD, FAHA, Vice Chair; Heather M. Johnson, MD, MS, "
            "FAHA, FACC, FASPC; Daichi Shimbo, MD; Marwah Abdalla, MD, MPH, FAHA, FACC"
        )
        assert is_byline_block(text)

    def test_bat_ban_bien_soan_tieng_viet(self):
        text = "Ban biên soạn: PGS.TS. Nguyễn Văn A; TS. Trần Thị B; ThS. Lê Văn C; BS. Phạm Thị D; DS. Hoàng Văn E"
        assert is_byline_block(text)

    def test_khong_bat_van_xuoi_lam_sang(self):
        text = (
            "Người bệnh tăng huyết áp nên hạn chế lượng muối ăn vào dưới 5 gam mỗi ngày. "
            "Bác sĩ điều trị sẽ theo dõi huyết áp định kỳ và điều chỉnh khi cần."
        )
        assert not is_byline_block(text)

    def test_khong_bat_khi_chi_co_vai_chuc_danh(self):
        assert not is_byline_block("Nghiên cứu do BS. Nguyễn Văn A thực hiện.")

    def test_khong_ap_dung_cho_doan_qua_dai(self):
        # Một chương dài có lỡ nhắc nhiều chức danh vẫn phải được giữ.
        text = "Nội dung lâm sàng. " * 200 + "MD PhD MPH RN FAHA FACC"
        assert not is_byline_block(text)


class TestHasClinicalThreshold:
    def test_bat_nguong_huyet_ap(self):
        assert has_clinical_threshold("huyết áp tâm thu ≥ 140mmHg")
        assert has_clinical_threshold("BP of 130/80 mm Hg or higher")

    def test_bat_chi_so_duong_huyet(self):
        assert has_clinical_threshold("HbA1c dưới 7%")
        assert has_clinical_threshold("glucose huyết tương ≥ 7,0 mmol/L")

    def test_khong_bat_van_xuoi_thuong(self):
        assert not has_clinical_threshold("Người bệnh nên đi bộ đều đặn mỗi ngày.")


class TestDedupHelpers:
    def test_jaccard_trung_hoan_toan(self):
        s = shingles("người bệnh nên hạn chế muối dưới năm gam mỗi ngày")
        assert jaccard(s, s) == 1.0

    def test_jaccard_khac_han(self):
        a = shingles("người bệnh nên hạn chế muối dưới năm gam mỗi ngày")
        b = shingles("đi bộ ba mươi phút mỗi ngày giúp kiểm soát đường huyết")
        assert jaccard(a, b) < 0.1

    def test_jaccard_tap_rong(self):
        assert jaccard(set(), {"a"}) == 0.0


class TestAlphaRatio:
    def test_toan_chu(self):
        assert alpha_ratio("abcxyz") == 1.0

    def test_toan_so(self):
        assert alpha_ratio("123456") == 0.0

    def test_chuoi_rong(self):
        assert alpha_ratio("") == 0.0


class TestCleanText:
    def test_chay_du_pipeline(self):
        raw = "Tăng  huyết áp là  khi huyết-\náp tâm thu ≥ 140mmHg.\n\n\n\nĐây là bệnh mạn tính."
        out = clean_text(raw)
        assert "huyếtáp" in out
        assert "  " not in out
        assert "\n\n\n" not in out
