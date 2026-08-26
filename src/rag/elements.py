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
class TableCell:
    """Một ô bảng có vị trí từ parser, không suy ra từ Markdown phẳng."""

    text: str
    row: int
    column: int
    row_span: int = 1
    column_span: int = 1
    is_column_header: bool = False
    is_row_header: bool = False

    def as_dict(self) -> dict[str, int | str | bool]:
        return {
            "text": self.text,
            "row": self.row,
            "column": self.column,
            "row_span": self.row_span,
            "column_span": self.column_span,
            "is_column_header": self.is_column_header,
            "is_row_header": self.is_row_header,
        }


@dataclass
class TableStructure:
    """Lưới bảng nguyên bản do parser nhận diện, dùng để hiển thị source."""

    rows: int
    columns: int
    cells: list[TableCell] = field(default_factory=list)

    def as_dict(self) -> dict[str, int | list[dict[str, int | str | bool]]]:
        return {
            "rows": self.rows,
            "columns": self.columns,
            "cells": [cell.as_dict() for cell in self.cells],
        }


@dataclass
class Element:
    """Một khối nội dung trong tài liệu, theo thứ tự đọc."""

    kind: ElementKind
    text: str
    level: int | None = None
    page: int | None = None
    ref: str | None = None
    # Chỉ có với bảng. `text` vẫn được giữ nguyên cho embedding/citation; phần
    # có cấu trúc này dành riêng cho màn đối chiếu nguồn.
    table: TableStructure | None = None
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
