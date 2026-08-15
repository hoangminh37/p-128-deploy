"""Test cho danh mục bệnh đọc từ registry.

Điểm quan trọng nhất mà các test này khoá lại: thêm bệnh thứ ba chỉ cần sửa
YAML, không đụng file Python nào. Vì vậy phần lớn test dưới đây dựng một danh
mục ba bệnh trong đó có một bệnh HOÀN TOÀN KHÔNG xuất hiện ở bất cứ đâu trong
mã nguồn — nếu ở đâu đó còn viết cứng tên bệnh, chúng sẽ đỏ.
"""

import pytest

from src.rag.diseases import DiseaseCatalog

THREE = {
    "type2_diabetes": {
        "label_vi": "đái tháo đường típ 2",
        "label_en": "Type 2 diabetes",
        "keywords": r"đái\s*tháo\s*đường|diabet|hba1c",
    },
    "hypertension": {
        "label_vi": "tăng huyết áp",
        "label_en": "Hypertension",
        "keywords": r"tăng\s*huyết\s*áp|hypertens|mmhg",
    },
    # Bệnh thứ ba, chưa hề có trong code — brief mục 6 nói giai đoạn đầu nhắm 2-3 bệnh.
    "copd": {
        "label_vi": "bệnh phổi tắc nghẽn mạn tính",
        "label_en": "COPD",
        "keywords": r"phổi\s*tắc\s*nghẽn|copd|khó\s*thở\s*mạn",
    },
}


@pytest.fixture
def catalog():
    return DiseaseCatalog.from_mapping(THREE)


class TestFromMapping:
    def test_nap_du_ba_benh(self, catalog):
        assert catalog.ids == ["type2_diabetes", "hypertension", "copd"]

    def test_danh_muc_rong_thi_bao_loi(self):
        with pytest.raises(ValueError, match="rỗng"):
            DiseaseCatalog([])

    def test_thieu_keywords_thi_bao_loi(self):
        with pytest.raises(ValueError, match="keywords"):
            DiseaseCatalog.from_mapping({"x": {"label_vi": "X"}})

    def test_regex_hong_thi_bao_loi_ro_rang(self):
        with pytest.raises(ValueError, match="regex hợp lệ"):
            DiseaseCatalog.from_mapping({"x": {"keywords": "["}})

    def test_gop_dong_cua_yaml_khong_lam_hong_regex(self):
        # YAML dạng `>-` gập xuống dòng thành khoảng trắng; nếu không bỏ đi thì
        # nhánh regex sẽ thành "hba1c| glucose" và không khớp gì cả.
        cat = DiseaseCatalog.from_mapping({"x": {"keywords": "hba1c|\n      glucose"}})
        assert cat.detect("theo dõi glucose máu") == ["x"]

    def test_thieu_nhan_thi_dung_ma_benh(self):
        cat = DiseaseCatalog.from_mapping({"x": {"keywords": "abc"}})
        assert cat.label_vi("x") == "x"


class TestDetect:
    def test_nhan_ra_tung_benh(self, catalog):
        assert catalog.detect("Bệnh đái tháo đường típ 2") == ["type2_diabetes"]
        assert catalog.detect("Điều trị tăng huyết áp") == ["hypertension"]

    def test_nhan_ra_benh_thu_ba_ma_code_khong_he_biet(self, catalog):
        assert catalog.detect("Người bệnh phổi tắc nghẽn mạn tính") == ["copd"]

    def test_nhan_ra_nhieu_benh_cung_luc(self, catalog):
        found = catalog.detect("Bệnh nhân đái tháo đường kèm tăng huyết áp")
        assert set(found) == {"type2_diabetes", "hypertension"}

    def test_khong_lien_quan_thi_rong(self, catalog):
        assert catalog.detect("Quy trình tiếp đón người bệnh tại khoa khám") == []

    def test_khop_ca_tieng_anh(self, catalog):
        assert "hypertension" in catalog.detect("blood pressure of 130/80 mmHg")


class TestMetadata:
    def test_sinh_du_cot_cho_moi_benh(self, catalog):
        flags = catalog.metadata_flags(["hypertension"])
        assert flags == {
            "disease_type2_diabetes": False,
            "disease_hypertension": True,
            "disease_copd": False,
        }

    def test_khoa_loc_khop_voi_cot_metadata(self, catalog):
        # Đây là hợp đồng ngầm giữa chunk.py và store.py: mệnh đề lọc của
        # Chroma phải trỏ đúng tên cột mà bước build chunk sinh ra.
        for disease_id in catalog.ids:
            assert catalog.metadata_key(disease_id) in catalog.metadata_flags([])


class TestLookup:
    def test_lay_ten_tieng_viet(self, catalog):
        assert catalog.label_vi("copd") == "bệnh phổi tắc nghẽn mạn tính"

    def test_benh_la_thi_tra_lai_ma(self, catalog):
        # Hồ sơ cũ có thể chứa mã bệnh đã bỏ; không được làm sập prompt.
        assert catalog.label_vi("khong-ton-tai") == "khong-ton-tai"

    def test_truy_cap_benh_la_bao_loi_ro_rang(self, catalog):
        with pytest.raises(KeyError, match="Đang có"):
            catalog["khong-ton-tai"]

    def test_kiem_tra_thuoc_danh_muc(self, catalog):
        assert "copd" in catalog
        assert "asthma" not in catalog


class TestCatalogThat:
    """Kiểm danh mục thật trong data/registry.yaml."""

    def test_registry_that_dung_duoc(self):
        from src.rag.registry import load_registry

        catalog = load_registry().catalog
        assert set(catalog.ids) == {"type2_diabetes", "hypertension"}
        assert catalog.label_vi("hypertension") == "tăng huyết áp"

    def test_tu_khoa_that_nhan_ra_noi_dung_that(self):
        from src.rag.registry import load_registry

        catalog = load_registry().catalog
        assert catalog.detect("Tăng huyết áp là khi huyết áp tâm thu ≥ 140mmHg") == ["hypertension"]
        assert catalog.detect("kiểm soát HbA1c dưới 7%") == ["type2_diabetes"]
