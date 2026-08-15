"""Danh mục bệnh — đọc từ data/registry.yaml, không viết cứng trong code.

Trước đây tên bệnh nằm rải rác ở 7 chỗ trong 6 file: kiểu Literal của Pydantic,
regex từ khoá, hai cột metadata, mệnh đề lọc của vector store, bảng tên tiếng
Việt trong prompt, và danh sách choices của CLI. Thêm bệnh thứ ba — điều brief
mục 6 nói rõ là có thể xảy ra — nghĩa là phải sửa cả 6 file và rất dễ sót một chỗ.

Giờ mọi thứ đi qua đây, và đây thì đọc từ registry. Thêm bệnh = thêm một mục
trong YAML rồi ingest lại.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class DiseaseSpec:
    """Một bệnh trong phạm vi sản phẩm."""

    id: str
    label_vi: str
    label_en: str
    keywords: re.Pattern[str] = field(compare=False, repr=False)

    @property
    def metadata_key(self) -> str:
        """Tên cột boolean trong metadata của chunk, cũng là khoá lọc của Chroma.

        Chroma không lọc được theo phần tử của danh sách, nên mỗi bệnh cần một
        cột boolean riêng thay vì một trường mảng.
        """
        return f"disease_{self.id}"


class DiseaseCatalog:
    """Tập hợp các bệnh trong phạm vi, dựng từ registry."""

    def __init__(self, specs: list[DiseaseSpec]):
        if not specs:
            raise ValueError("Danh mục bệnh rỗng — kiểm tra mục `diseases` trong registry.yaml")
        self._specs = {s.id: s for s in specs}

    @classmethod
    def from_mapping(cls, raw: dict[str, dict]) -> DiseaseCatalog:
        specs = []
        for disease_id, cfg in raw.items():
            keywords = cfg.get("keywords", "")
            # YAML dạng `>-` gập dòng thành khoảng trắng; bỏ hết khoảng trắng
            # thừa để regex không bị chèn dấu cách vào giữa các nhánh `|`.
            pattern = re.sub(r"\s*\n\s*", "", keywords).strip()
            if not pattern:
                raise ValueError(f"Bệnh {disease_id!r} thiếu `keywords` trong registry.yaml")
            try:
                compiled = re.compile(pattern, re.IGNORECASE)
            except re.error as e:
                raise ValueError(f"`keywords` của bệnh {disease_id!r} không phải regex hợp lệ: {e}") from e
            specs.append(
                DiseaseSpec(
                    id=disease_id,
                    label_vi=cfg.get("label_vi") or disease_id,
                    label_en=cfg.get("label_en") or disease_id,
                    keywords=compiled,
                )
            )
        return cls(specs)

    # -- tra cứu --------------------------------------------------------------

    @property
    def ids(self) -> list[str]:
        return list(self._specs)

    def __contains__(self, disease_id: object) -> bool:
        return disease_id in self._specs

    def __getitem__(self, disease_id: str) -> DiseaseSpec:
        try:
            return self._specs[disease_id]
        except KeyError:
            raise KeyError(f"Bệnh {disease_id!r} không có trong registry. Đang có: {', '.join(self.ids)}") from None

    def label_vi(self, disease_id: str) -> str:
        """Tên tiếng Việt để hiển thị. Bệnh lạ thì trả lại nguyên id, không nổ."""
        spec = self._specs.get(disease_id)
        return spec.label_vi if spec else disease_id

    def metadata_key(self, disease_id: str) -> str:
        return f"disease_{disease_id}"

    # -- dùng khi xử lý dữ liệu ------------------------------------------------

    def detect(self, text: str) -> list[str]:
        """Đoán chủ đề bệnh của một đoạn văn bản theo từ khoá.

        Chỉ bổ sung cho nhãn cấp tài liệu chứ không thay thế: một đoạn trong
        hướng dẫn đái tháo đường có nhắc huyết áp vẫn thuộc tài liệu đái tháo
        đường, nhưng gắn thêm nhãn tăng huyết áp giúp truy xuất chéo cho bệnh
        nhân mắc đồng thời hai bệnh (brief mục P3 và R6).
        """
        return [s.id for s in self._specs.values() if s.keywords.search(text)]

    def metadata_flags(self, diseases: list[str]) -> dict[str, bool]:
        """Sinh các cột boolean cho metadata của chunk, một cột cho mỗi bệnh."""
        return {s.metadata_key: s.id in diseases for s in self._specs.values()}
