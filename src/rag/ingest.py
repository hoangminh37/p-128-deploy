"""Luồng biên tập viên tải tài liệu lên lúc chạy — FR4.1 và FR4.3 của PRD.

Khác với `pipeline.py` (chạy theo lô, dành cho bộ tài liệu nền được cấu hình
sẵn), module này phục vụ đúng một tình huống: một người có chuyên môn y tế đưa
một file mới vào hệ thống và muốn nó trả lời được câu hỏi của bệnh nhân.

Vòng đời một tài liệu tải lên:

    stage_upload()   -> lưu file, tạo bản ghi status=pending_review
                        (CHƯA parse, CHƯA vào vector store)
    approve()        -> parse -> sửa cấu trúc -> chunk -> embed -> index,
                        đổi status=approved
    reject()         -> chuyển sang quarantine, xoá file
    remove()         -> gỡ tài liệu đã duyệt, xoá sạch chunk khỏi store

Vì sao tách stage và approve thay vì index thẳng khi upload: brief mục 7.1 nói
hệ thống chỉ được trả lời từ thư viện ĐÃ DUYỆT. Nếu file vừa upload đã vào store
ngay thì giữa lúc tải lên và lúc có người đọc lại, bệnh nhân có thể nhận câu trả
lời trích từ tài liệu chưa ai kiểm. Ở đây trạng thái pending_review là hàng rào
thật: `Registry.approved()` không trả về nó, nên không đường nào để nó lọt vào
vector store.

LƯU Ý CHO PHÍA BACKEND: `approve()` chạy Docling nên mất vài phút với tài liệu
trăm trang. Đừng gọi thẳng trong request handler — đẩy sang BackgroundTasks của
FastAPI hoặc một worker, rồi cho giao diện hỏi trạng thái.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from src.rag.chunk import Chunk, DropStat, build_chunks
from src.rag.config import RagSettings, get_rag_settings
from src.rag.registry import (
    QuarantinedDoc,
    Registry,
    SourceDoc,
    load_registry,
    save_uploads,
    uploaded_docs,
)
from src.rag.structure import repair_document

logger = logging.getLogger(__name__)

# Định dạng Docling đọc được và đã kiểm chứng trên corpus của dự án.
SUPPORTED_SUFFIXES = {".pdf", ".pptx", ".docx", ".md", ".html", ".htm", ".xlsx"}


class IngestError(RuntimeError):
    """Lỗi ở tầng nghiệp vụ, hiển thị được cho biên tập viên."""


@dataclass
class IngestResult:
    doc_id: str
    status: str
    chunks: int = 0
    dropped: dict[str, int] = field(default_factory=dict)
    repairs: dict[str, int] = field(default_factory=dict)
    message: str = ""

    def as_dict(self) -> dict:
        return {
            "doc_id": self.doc_id,
            "status": self.status,
            "chunks": self.chunks,
            "dropped": self.dropped,
            "repairs": self.repairs,
            "message": self.message,
        }


# -----------------------------------------------------------------------------
# Tiện ích
# -----------------------------------------------------------------------------


def slugify(text: str, max_len: int = 60) -> str:
    """Biến tiêu đề tiếng Việt thành mã an toàn để làm doc_id và tên file."""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.replace("đ", "d").replace("Đ", "D")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:max_len] or "tai-lieu"


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _require_docling() -> None:
    try:
        import docling  # noqa: F401
    except ImportError as e:
        raise IngestError(
            "Chưa cài Docling nên không parse được tài liệu tải lên. Chạy: pip install -r requirements-rag.txt"
        ) from e


def _unique_doc_id(base: str, registry: Registry) -> str:
    existing = {d.doc_id for d in registry.documents} | {q.doc_id for q in registry.quarantined}
    if base not in existing:
        return base
    for i in range(2, 1000):
        candidate = f"{base}-{i}"
        if candidate not in existing:
            return candidate
    raise IngestError(f"Không sinh được doc_id duy nhất từ {base!r}")


# -----------------------------------------------------------------------------
# 1. Tải lên — chỉ lưu file và ghi nhận, chưa xử lý gì
# -----------------------------------------------------------------------------


def stage_upload(
    filename: str,
    content: bytes,
    *,
    title: str,
    issuer: str,
    published: str,
    diseases: list[str],
    lang: str = "vi",
    authority: str = "vn_moh",
    doc_code: str | None = None,
    url: str | None = None,
    uploaded_by: str | None = None,
    notes: str | None = None,
    settings: RagSettings | None = None,
) -> IngestResult:
    """Nhận file từ biên tập viên, lưu lại, đưa vào hàng chờ duyệt.

    Không parse và không index ở bước này — cố ý, xem docstring của module.
    Hàm chạy nhanh nên gọi thẳng trong request handler được.
    """
    settings = settings or get_rag_settings()
    registry = load_registry(settings=settings)

    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise IngestError(f"Không hỗ trợ định dạng {suffix!r}. Chấp nhận: {', '.join(sorted(SUPPORTED_SUFFIXES))}")
    if not content:
        raise IngestError("File rỗng")

    unknown = sorted(set(diseases) - set(registry.catalog.ids))
    if unknown:
        raise IngestError(
            f"Bệnh không có trong phạm vi: {', '.join(unknown)}. "
            f"Đang hỗ trợ: {', '.join(registry.catalog.ids)}. "
            "Muốn thêm bệnh mới thì bổ sung mục `diseases` trong data/registry.yaml."
        )
    if not diseases:
        raise IngestError("Phải khai báo tài liệu này thuộc bệnh nào")

    doc_id = _unique_doc_id(slugify(title), registry)
    stored_name = f"{doc_id}{suffix}"

    settings.raw_dir.mkdir(parents=True, exist_ok=True)
    (settings.raw_dir / stored_name).write_bytes(content)

    doc = SourceDoc(
        doc_id=doc_id,
        file=stored_name,
        title=title,
        issuer=issuer,
        doc_code=doc_code,
        doc_code_verified=False,
        url=url,
        published=published,
        lang=lang,  # type: ignore[arg-type]
        authority=authority,  # type: ignore[arg-type]
        diseases=diseases,
        status="pending_review",
        uploaded_at=_now(),
        uploaded_by=uploaded_by,
        notes=notes,
    )

    docs = uploaded_docs(settings)
    docs.append(doc)
    save_uploads(docs, settings)

    logger.info("nhận tài liệu %s, chờ duyệt", doc_id)
    return IngestResult(
        doc_id=doc_id,
        status="pending_review",
        message="Đã nhận tài liệu. Cần một biên tập viên duyệt trước khi hệ thống được dùng nó.",
    )


# -----------------------------------------------------------------------------
# 2. Duyệt — xử lý và đưa vào vector store
# -----------------------------------------------------------------------------


def process(doc: SourceDoc, settings: RagSettings | None = None, catalog=None) -> tuple[list[Chunk], DropStat, dict]:
    """Parse -> sửa cấu trúc -> chunk cho một tài liệu. Không đụng vector store.

    Đây là lõi dùng chung với pipeline chạy theo lô, tách ra để cả hai đường
    (chạy lô và tải lên lúc chạy) đi qua đúng một cách xử lý dữ liệu — không có
    chuyện tài liệu upload được chunk khác kiểu với tài liệu nền.
    """
    _require_docling()
    from src.rag.parse import parse_document, to_elements

    settings = settings or get_rag_settings()
    source = settings.raw_dir / doc.file
    if not source.exists():
        raise IngestError(f"Không tìm thấy file gốc của {doc.doc_id} tại {source}")

    dl_doc = parse_document(doc, settings)
    elements = repair_document(to_elements(dl_doc), doc_title=doc.citation_title)
    chunks, drops = build_chunks(doc, elements, settings, catalog=catalog)

    repairs: dict[str, int] = {}
    for el in elements:
        for r in el.repairs:
            key = r.split(":")[0]
            repairs[key] = repairs.get(key, 0) + 1

    return chunks, drops, repairs


def approve(
    doc_id: str,
    approved_by: str,
    settings: RagSettings | None = None,
    store=None,
) -> IngestResult:
    """Duyệt một tài liệu đang chờ: xử lý và nạp vào vector store.

    CHẬM — parse tài liệu trăm trang mất vài phút. Chạy nền, đừng chặn request.
    """
    settings = settings or get_rag_settings()
    registry = load_registry(settings=settings)
    doc = registry.by_id(doc_id)

    if doc.status == "approved":
        raise IngestError(f"Tài liệu {doc_id} đã được duyệt rồi")
    if doc.status != "pending_review":
        raise IngestError(f"Chỉ duyệt được tài liệu đang ở trạng thái pending_review, {doc_id} đang là {doc.status}")

    chunks, drops, repairs = process(doc, settings, catalog=registry.catalog)
    if not chunks:
        raise IngestError(
            f"Xử lý xong nhưng không ra chunk nào từ {doc_id}. "
            "Nhiều khả năng file là bản scan không có lớp text, hoặc nội dung "
            "toàn bảng biểu và ảnh. Kiểm tra data/interim/markdown/ để xem bộ "
            "parse đọc ra được gì."
        )

    if store is None:
        from src.rag.store import VectorStore

        store = VectorStore(settings)

    # Xoá trước rồi nạp lại, phòng trường hợp duyệt lại sau khi đã sửa.
    store.delete_by_doc(doc_id)
    store.upsert(chunks)

    doc.status = "approved"
    doc.approved_by = approved_by
    doc.approved_at = _now()
    _persist(doc, settings)

    logger.info("duyệt %s: %d chunk vào store", doc_id, len(chunks))
    return IngestResult(
        doc_id=doc_id,
        status="approved",
        chunks=len(chunks),
        dropped=drops.as_dict(),
        repairs=repairs,
        message=f"Đã duyệt và nạp {len(chunks)} chunk vào thư viện.",
    )


# -----------------------------------------------------------------------------
# 3. Từ chối và gỡ bỏ
# -----------------------------------------------------------------------------


def reject(doc_id: str, reasons: list[str], decided_by: str, settings: RagSettings | None = None) -> IngestResult:
    """Từ chối tài liệu đang chờ duyệt: xoá file, giữ lại lý do."""
    settings = settings or get_rag_settings()
    registry = load_registry(settings=settings)
    doc = registry.by_id(doc_id)

    if doc.status == "approved":
        raise IngestError(f"{doc_id} đã được duyệt — dùng remove() nếu muốn gỡ khỏi thư viện")
    if not reasons:
        raise IngestError("Phải ghi lý do từ chối, để lần sau không ai tải lại nhầm")

    quarantined = QuarantinedDoc(
        doc_id=doc.doc_id,
        file=doc.file,
        title=doc.title,
        issuer=doc.issuer,
        doc_code=doc.doc_code,
        published=doc.published,
        lang=doc.lang,
        reasons=reasons,
        decided_by=decided_by,
        decided_at=_now(),
    )
    _quarantine_file(doc, settings)
    _remove_from_uploads(doc_id, settings)
    _append_quarantine_log(quarantined, settings)

    return IngestResult(doc_id=doc_id, status="quarantined", message="Đã từ chối và ghi lại lý do.")


def remove(doc_id: str, settings: RagSettings | None = None, store=None) -> IngestResult:
    """Gỡ một tài liệu đã duyệt khỏi thư viện và xoá sạch chunk của nó."""
    settings = settings or get_rag_settings()
    registry = load_registry(settings=settings)
    registry.by_id(doc_id)  # ném KeyError nếu doc_id không tồn tại

    if store is None:
        from src.rag.store import VectorStore

        store = VectorStore(settings)
    removed = store.delete_by_doc(doc_id)

    if any(d.doc_id == doc_id for d in uploaded_docs(settings)):
        _remove_from_uploads(doc_id, settings)
        note = ""
    else:
        # Tài liệu nền nằm trong registry.yaml do người viết tay — không tự sửa
        # file đó, chỉ báo lại để có người xoá mục tương ứng qua Pull Request.
        note = " Tài liệu này khai trong data/registry.yaml, cần xoá mục đó bằng PR."

    return IngestResult(
        doc_id=doc_id,
        status="removed",
        chunks=removed,
        message=f"Đã xoá {removed} chunk khỏi thư viện.{note}",
    )


# -----------------------------------------------------------------------------
# Ghi trạng thái xuống đĩa
# -----------------------------------------------------------------------------


def _persist(doc: SourceDoc, settings: RagSettings) -> None:
    docs = uploaded_docs(settings)
    for i, d in enumerate(docs):
        if d.doc_id == doc.doc_id:
            docs[i] = doc
            save_uploads(docs, settings)
            return
    # Không nằm trong uploads.json nghĩa là tài liệu nền của registry.yaml —
    # file đó do người quản, code không ghi đè.
    logger.warning("%s không nằm trong uploads.json, không ghi lại trạng thái", doc.doc_id)


def _remove_from_uploads(doc_id: str, settings: RagSettings) -> None:
    docs = [d for d in uploaded_docs(settings) if d.doc_id != doc_id]
    save_uploads(docs, settings)


def _quarantine_file(doc: SourceDoc, settings: RagSettings) -> None:
    src = settings.raw_dir / doc.file
    if not src.exists():
        return
    dest_dir = settings.raw_dir.parent / "quarantine"
    dest_dir.mkdir(parents=True, exist_ok=True)
    src.replace(dest_dir / doc.file)


def _append_quarantine_log(entry: QuarantinedDoc, settings: RagSettings) -> None:
    """Ghi lý do từ chối vào data/quarantine/rejected.json."""
    import json

    path = settings.raw_dir.parent / "quarantine" / "rejected.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    items = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    items.append(entry.model_dump(mode="json"))
    path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# -----------------------------------------------------------------------------
# Đọc trạng thái, cho giao diện biên tập viên
# -----------------------------------------------------------------------------


def list_pending(settings: RagSettings | None = None) -> list[dict]:
    """Tài liệu đang chờ duyệt, để dựng màn hình HITL của biên tập viên."""
    registry = load_registry(settings=settings or get_rag_settings())
    return [
        {
            "doc_id": d.doc_id,
            "title": d.title,
            "issuer": d.issuer,
            "published": d.published,
            "diseases": d.diseases,
            "uploaded_at": d.uploaded_at,
            "uploaded_by": d.uploaded_by,
        }
        for d in registry.pending()
    ]
