"""Đọc file gốc bằng Docling và quy về danh sách Element phẳng.

Docling (arXiv 2501.17887, giấy phép MIT, chạy hoàn toàn local) lo phần khó:
dựng lại bố cục trang, thứ tự đọc, và cấu trúc bảng bằng TableFormer. Nó cũng
đọc được PPTX nên bộ slide ADA đi chung một đường với các file PDF.

Tắt OCR có chủ đích: cả 5 tài liệu đều đã có lớp text (đã kiểm tra bằng pypdf),
và theo chính bài báo Docling, OCR chiếm khoảng 60% thời gian chuyển đổi. Bật
OCR ở đây chỉ tốn thời gian mà không thêm chữ nào.

Kết quả parse được cache xuống data/interim/ để lần chạy sau không phải làm lại —
parse toàn bộ corpus mất khoảng 10 phút trên CPU, còn đọc cache thì tính bằng giây.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

# Tắt torch.compile TRƯỚC khi bất cứ thứ gì kéo torch vào.
# Mô hình layout của Docling gọi torch.compile, và trên Windows không cài
# Visual Studio Build Tools thì backend inductor không tìm thấy trình biên dịch
# `cl` rồi ném InductorError giữa chừng, làm hỏng cả lần parse. Chạy eager cho
# kết quả y hệt, chỉ chậm hơn chút — đổi lại nó chạy được trên máy mọi người
# trong team mà không ai phải cài thêm gì.
os.environ.setdefault("TORCH_COMPILE_DISABLE", "1")
os.environ.setdefault("TORCHDYNAMO_DISABLE", "1")

from src.rag.config import RagSettings, get_rag_settings  # noqa: E402
from src.rag.elements import Element, ElementKind  # noqa: E402
from src.rag.registry import SourceDoc  # noqa: E402

logger = logging.getLogger(__name__)

# Nhãn của Docling -> loại Element của ta. Nhãn không có trong bảng này bị bỏ.
_LABEL_MAP: dict[str, ElementKind] = {
    "title": "heading",
    "section_header": "heading",
    "text": "text",
    "paragraph": "text",
    "list_item": "list_item",
    "table": "table",
    "caption": "caption",
    "code": "code",
    "formula": "formula",
}

# Nhãn bị bỏ hẳn, kèm lý do:
#   picture/chart      — agent trả lời bằng chữ, không hiển thị ảnh
#   page_header/footer — Docling đã xếp vào lớp furniture, iterate_items tự bỏ
#   document_index     — mục lục, không có nội dung
#   reference/footnote — khối trích dẫn, đã có bộ lọc riêng ở chunk.py
#   form/key_value/checkbox — không xuất hiện trong tài liệu hướng dẫn lâm sàng
_SKIP_LABELS = {
    "picture",
    "chart",
    "page_header",
    "page_footer",
    "document_index",
    "reference",
    "footnote",
    "form",
    "key_value_region",
    "checkbox_selected",
    "checkbox_unselected",
    "empty_value",
    "marker",
}


def _converter():
    """Dựng DocumentConverter, tắt OCR cho PDF."""
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    pdf_options = PdfPipelineOptions()
    pdf_options.do_ocr = False  # xem docstring của module
    pdf_options.do_table_structure = True
    pdf_options.table_structure_options.do_cell_matching = True

    return DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pdf_options)})


def _cache_paths(doc: SourceDoc, settings: RagSettings) -> tuple[Path, Path]:
    json_path = settings.interim_dir / "docling" / f"{doc.doc_id}.json"
    md_path = settings.interim_dir / "markdown" / f"{doc.doc_id}.md"
    return json_path, md_path


def parse_document(doc: SourceDoc, settings: RagSettings | None = None, force: bool = False):
    """Parse một tài liệu, dùng cache nếu đã có.

    Trả về DoclingDocument. Bản markdown cũng được ghi ra data/interim/markdown/
    để người trong team mở đọc bằng mắt mà kiểm tra bộ parse có đọc đúng không —
    đây là cách rẻ nhất để bắt lỗi trước khi lỗi chui vào vector store.
    """
    from docling_core.types.doc.document import DoclingDocument

    settings = settings or get_rag_settings()
    json_path, md_path = _cache_paths(doc, settings)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.parent.mkdir(parents=True, exist_ok=True)

    if json_path.exists() and not force:
        logger.info("dùng cache: %s", json_path.name)
        return DoclingDocument.load_from_json(json_path)

    source = settings.raw_dir / doc.file
    logger.info("parse %s (%s)", doc.doc_id, source.name)
    result = _converter().convert(source)
    dl_doc = result.document

    dl_doc.save_as_json(json_path)
    md_path.write_text(dl_doc.export_to_markdown(), encoding="utf-8")
    return dl_doc


def to_elements(dl_doc) -> list[Element]:
    """Duyệt DoclingDocument theo thứ tự đọc và quy về danh sách Element."""
    elements: list[Element] = []

    for item, _level in dl_doc.iterate_items():
        label = getattr(getattr(item, "label", None), "value", None)
        if label is None or label in _SKIP_LABELS:
            continue

        kind = _LABEL_MAP.get(label)
        if kind is None:
            continue

        if kind == "table":
            try:
                text = item.export_to_markdown(dl_doc)
            except TypeError:  # phòng khi chữ ký hàm đổi giữa các bản Docling
                text = item.export_to_markdown()
        else:
            text = getattr(item, "text", "") or ""

        if not text.strip():
            continue

        prov = getattr(item, "prov", None) or []
        page = getattr(prov[0], "page_no", None) if prov else None

        if kind == "heading":
            # Docling đánh title là cấp 0, section_header có .level riêng.
            level = 1 if label == "title" else int(getattr(item, "level", 1) or 1) + 1
        else:
            level = None

        elements.append(
            Element(
                kind=kind,
                text=text,
                level=level,
                page=page,
                ref=getattr(item, "self_ref", None),
            )
        )

    return elements
