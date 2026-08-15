"""Đọc và kiểm tra data/registry.yaml.

Pipeline không bao giờ tự quét thư mục data/raw. Tài liệu chỉ được nạp khi có
mục tương ứng trong registry với status: approved — đó là cách hiện thực yêu cầu
"chỉ trả lời từ thư viện đã duyệt" của brief mục 7.1 ở tầng dữ liệu.
"""

from __future__ import annotations

import datetime as _dt
import json
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, field_validator

from src.rag.config import RagSettings, get_rag_settings
from src.rag.diseases import DiseaseCatalog

# Mã bệnh là chuỗi tự do ở tầng kiểu dữ liệu, và được đối chiếu với mục
# `diseases` của registry lúc nạp. Cố ý không dùng Literal: Literal khoá cứng
# danh sách bệnh vào code, mà đó chính là thứ vừa gỡ ra.
Disease = str
Authority = Literal["vn_moh", "international"]

# Trạng thái vòng đời của một tài liệu:
#   approved        — đã được biên tập viên duyệt, được phép vào vector store
#   pending_review  — biên tập viên vừa tải lên, ĐANG CHỜ DUYỆT, chưa được index
#   draft           — đang soạn, không đụng tới
#   quarantined     — đã xem xét và loại
DocStatus = Literal["approved", "pending_review", "draft", "quarantined"]


class SourceDoc(BaseModel):
    """Một tài liệu đã được duyệt vào thư viện."""

    doc_id: str
    file: str
    title: str
    title_vi: str | None = None
    issuer: str
    issuer_vi: str | None = None
    doc_code: str | None = None
    doc_code_verified: bool = False
    url: str | None = None
    published: str
    lang: Literal["vi", "en"]
    authority: Authority
    diseases: list[Disease]
    status: DocStatus = "approved"
    approved_by: str | None = None
    approved_at: str | None = None
    notes: str | None = None
    # Đặt khi tài liệu do biên tập viên tải lên lúc chạy, phân biệt với bộ
    # tài liệu nền được cấu hình sẵn trong registry.yaml.
    uploaded_at: str | None = None
    uploaded_by: str | None = None

    # Được tính sau khi nạp cả danh sách, không đọc từ YAML.
    recency_rank: int = Field(default=0, exclude=True)
    priority: float = Field(default=0.0, exclude=True)

    @field_validator("published")
    @classmethod
    def _check_published(cls, v: str) -> str:
        """Chấp nhận YYYY, YYYY-MM hoặc YYYY-MM-DD."""
        for fmt in ("%Y", "%Y-%m", "%Y-%m-%d"):
            try:
                _dt.datetime.strptime(v, fmt)
                return v
            except ValueError:
                continue
        raise ValueError(f"published phải là YYYY, YYYY-MM hoặc YYYY-MM-DD, nhận được {v!r}")

    @property
    def published_year(self) -> int:
        return int(self.published[:4])

    @property
    def citation_issuer(self) -> str:
        """Tên cơ quan ban hành hiển thị cho bệnh nhân — ưu tiên tiếng Việt."""
        return self.issuer_vi or self.issuer

    @property
    def citation_title(self) -> str:
        return self.title_vi or self.title


class QuarantinedDoc(BaseModel):
    """Tài liệu bị loại, giữ lại để không ai vô tình nạp lại."""

    doc_id: str
    file: str
    title: str
    issuer: str | None = None
    doc_code: str | None = None
    published: str | None = None
    lang: str | None = None
    status: Literal["quarantined"] = "quarantined"
    reasons: list[str]
    decided_by: str | None = None
    decided_at: str | None = None


class Registry(BaseModel):
    version: int
    ranking_policy: Literal["recency", "vn_first"]
    diseases: dict[str, dict] = Field(default_factory=dict)
    documents: list[SourceDoc] = Field(default_factory=list)
    quarantined: list[QuarantinedDoc] = Field(default_factory=list)

    # Dựng một lần lúc nạp, không đọc từ YAML.
    catalog_: DiseaseCatalog | None = Field(default=None, exclude=True, repr=False)

    model_config = {"arbitrary_types_allowed": True}

    @property
    def catalog(self) -> DiseaseCatalog:
        if self.catalog_ is None:
            self.catalog_ = DiseaseCatalog.from_mapping(self.diseases)
        return self.catalog_

    @property
    def diseases_in_scope(self) -> list[str]:
        return self.catalog.ids

    def approved(self) -> list[SourceDoc]:
        return [d for d in self.documents if d.status == "approved"]

    def pending(self) -> list[SourceDoc]:
        """Tài liệu biên tập viên đã tải lên nhưng chưa duyệt — chưa được index."""
        return [d for d in self.documents if d.status == "pending_review"]

    def by_id(self, doc_id: str) -> SourceDoc:
        for d in self.documents:
            if d.doc_id == doc_id:
                return d
        raise KeyError(f"Không có tài liệu doc_id={doc_id!r} trong registry")


def _assign_priority(docs: list[SourceDoc], policy: str, disease_ids: list[str] | None = None) -> None:
    """Gán recency_rank (1 = ưu tiên nhất) và priority trong khoảng [0, 1].

    priority được dùng làm điểm cộng khi xếp lại kết quả truy xuất, xem
    src/rag/store.py. Tính riêng cho từng bệnh, vì "hướng dẫn mới nhất về
    tăng huyết áp" và "hướng dẫn mới nhất về đái tháo đường" là hai câu hỏi
    khác nhau — một tài liệu 2026 về đái tháo đường không nên đè lên tài liệu
    2025 về tăng huyết áp.
    """
    for d in docs:
        d.recency_rank = 0
        d.priority = 0.0

    # Không truyền danh sách bệnh thì suy ra từ chính các tài liệu, để hàm này
    # dùng được độc lập (ví dụ trong test) mà vẫn không viết cứng tên bệnh nào.
    if disease_ids is None:
        disease_ids = sorted({x for d in docs for x in d.diseases})

    for disease in disease_ids:
        group = [d for d in docs if disease in d.diseases]
        if not group:
            continue

        if policy == "vn_first":
            # Bộ Y tế trước, trong cùng nhóm thì mới hơn trước.
            group.sort(key=lambda d: (d.authority != "vn_moh", -d.published_year))
        else:  # recency
            group.sort(key=lambda d: -d.published_year)

        n = len(group)
        for i, d in enumerate(group):
            rank = i + 1
            # Một tài liệu có thể thuộc nhiều bệnh; giữ thứ hạng tốt nhất.
            if d.recency_rank == 0 or rank < d.recency_rank:
                d.recency_rank = rank
                d.priority = 1.0 if n == 1 else round(1.0 - i / (n - 1), 4)


def load_registry(
    path: Path | None = None,
    policy_override: str | None = None,
    settings: RagSettings | None = None,
) -> Registry:
    """Nạp registry và tính thứ tự ưu tiên.

    CỐ Ý KHÔNG kiểm tra file gốc có tồn tại hay không. Trước đây hàm này ném
    FileNotFoundError khi thiếu bất kỳ file nào trong data/raw, nghĩa là server
    API — vốn chỉ cần đọc vector store đã dựng sẵn và không mang theo mấy trăm
    MB PDF — không khởi động nổi tầng RAG. Việc kiểm tra file chuyển sang
    verify_sources(), và chỉ pipeline ingest mới gọi.
    """
    settings = settings or get_rag_settings()
    path = path or settings.registry_path

    if not path.exists():
        raise FileNotFoundError(f"Không tìm thấy {path}. Đây là file bắt buộc, xem data/README.md.")

    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    registry = Registry.model_validate(raw)

    # Nạp thêm tài liệu do biên tập viên tải lên lúc chạy. Chúng nằm ở file
    # riêng để lần ghi của máy không xoá mất chú thích trong registry.yaml.
    registry.documents.extend(_load_uploads(settings))

    policy = policy_override or settings.ranking_policy or registry.ranking_policy

    catalog = registry.catalog  # dựng và kiểm tra mục `diseases` luôn ở đây
    unknown = {
        d.doc_id: sorted(set(d.diseases) - set(catalog.ids))
        for d in registry.documents
        if set(d.diseases) - set(catalog.ids)
    }
    if unknown:
        raise ValueError(
            "Tài liệu khai báo bệnh không có trong mục `diseases` của registry: "
            + "; ".join(f"{k} -> {v}" for k, v in unknown.items())
        )

    no_disease = [d.doc_id for d in registry.documents if not d.diseases]
    if no_disease:
        raise ValueError("Tài liệu không khai báo bệnh nào: " + ", ".join(no_disease))

    seen = {d.doc_id for d in registry.documents}
    if len(seen) != len(registry.documents):
        raise ValueError("Có doc_id trùng nhau trong registry")

    _assign_priority(registry.documents, policy, catalog.ids)
    registry.ranking_policy = policy  # type: ignore[assignment]
    return registry


def verify_sources(registry: Registry, settings: RagSettings | None = None) -> None:
    """Kiểm tra mọi tài liệu cần xử lý đều có file gốc trong data/raw.

    Chỉ pipeline ingest gọi hàm này. Server đọc vector store thì không cần file
    gốc, nên không nên bị chặn vì thiếu chúng.
    """
    settings = settings or get_rag_settings()
    need = registry.approved() + registry.pending()
    missing = [d.doc_id for d in need if not (settings.raw_dir / d.file).exists()]
    if missing:
        raise FileNotFoundError(
            "Registry khai báo tài liệu nhưng không tìm thấy file trong data/raw/: "
            + ", ".join(missing)
            + ".\nFile PDF không nằm trong git, xem data/README.md để biết cách lấy."
        )


def _uploads_path(settings: RagSettings) -> Path:
    return settings.registry_path.parent / "uploads.json"


def _load_uploads(settings: RagSettings) -> list[SourceDoc]:
    path = _uploads_path(settings)
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [SourceDoc.model_validate(d) for d in raw.get("documents", [])]


def save_uploads(docs: list[SourceDoc], settings: RagSettings | None = None) -> Path:
    """Ghi danh sách tài liệu tải lên xuống data/uploads.json.

    File này do máy quản lý, khác với registry.yaml do người viết tay. Tách ra
    hai file vì yaml.dump sẽ xoá sạch chú thích trong registry.yaml — mà phần
    lớn giá trị của file đó nằm ở chú thích ghi lý do duyệt hay loại tài liệu.
    """
    settings = settings or get_rag_settings()
    path = _uploads_path(settings)
    payload = {
        "note": "File do hệ thống ghi khi biên tập viên tải tài liệu lên. Đừng sửa tay.",
        "documents": [d.model_dump(mode="json") for d in docs],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def uploaded_docs(settings: RagSettings | None = None) -> list[SourceDoc]:
    """Chỉ những tài liệu do biên tập viên tải lên, không gồm bộ tài liệu nền."""
    return _load_uploads(settings or get_rag_settings())
