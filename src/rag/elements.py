"""Kiểu dữ liệu trung gian giữa bộ parse và bộ cắt chunk.

Đây là ranh giới cố ý: Docling trả về `DoclingDocument` với cấu trúc riêng của
nó, còn toàn bộ phần xử lý phía sau chỉ làm việc trên `Element` — một danh sách
phẳng theo thứ tự đọc. Nhờ vậy đổi bộ parse (Docling sang thứ khác) chỉ phải
sửa src/rag/parse.py, và test cho phần xử lý chạy được mà không cần cài Docling.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ElementKind = Literal["heading", "text", "list_item", "table", "caption", "code", "formula"]


@dataclass
class Element:
    """Một khối nội dung trong tài liệu, theo thứ tự đọc."""

    kind: ElementKind
    text: str
    level: int | None = None
    page: int | None = None
    ref: str | None = None
    # Đường dẫn tiêu đề dẫn tới khối này, ví dụ
    # ["Hướng dẫn chẩn đoán và điều trị tăng huyết áp", "3. ĐIỀU TRỊ", "3.2. Thuốc"].
    # Được điền ở bước structure.build_section_paths.
    section_path: list[str] = field(default_factory=list)
    # Ghi lại các phép sửa đã áp lên khối này, để soi lại khi data ra sai.
    repairs: list[str] = field(default_factory=list)

    @property
    def is_block(self) -> bool:
        """Khối nội dung thật, khác với tiêu đề."""
        return self.kind != "heading"
