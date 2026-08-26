"""Tests for preserving Docling table cell coordinates through parsing."""

from types import SimpleNamespace

from src.rag.parse import _table_structure


def _cell(**values):
    return SimpleNamespace(**values)


def test_luu_cell_va_header_tu_docling_thay_vi_suy_dien_markdown():
    item = SimpleNamespace(
        data=SimpleNamespace(
            num_rows=2,
            num_cols=2,
            table_cells=[
                _cell(
                    text="Tiêu chí",
                    start_row_offset_idx=0,
                    start_col_offset_idx=0,
                    row_span=1,
                    col_span=1,
                    column_header=True,
                    row_header=False,
                ),
                _cell(
                    text="Glucose huyết",
                    start_row_offset_idx=0,
                    start_col_offset_idx=1,
                    row_span=1,
                    col_span=1,
                    column_header=True,
                    row_header=False,
                ),
                _cell(
                    text="Mức 1",
                    start_row_offset_idx=1,
                    start_col_offset_idx=0,
                    row_span=1,
                    col_span=1,
                    column_header=False,
                    row_header=True,
                ),
            ],
        )
    )

    structure = _table_structure(item)

    assert structure is not None
    assert (structure.rows, structure.columns) == (2, 2)
    assert [cell.text for cell in structure.cells[:2]] == ["Tiêu chí", "Glucose huyết"]
    assert structure.cells[0].is_column_header is True
    assert structure.cells[2].is_row_header is True


def test_bang_khong_co_cell_hop_le_dung_fallback_an_toan():
    item = SimpleNamespace(data=SimpleNamespace(num_rows=2, num_cols=2, table_cells=[]))
    assert _table_structure(item) is None
