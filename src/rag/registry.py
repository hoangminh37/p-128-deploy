"""Đọc và kiểm tra data/registry.yaml.

Pipeline không bao giờ tự quét thư mục data/raw. Tài liệu chỉ được nạp khi có
mục tương ứng trong registry với status: approved — đó là cách hiện thực yêu cầu
"chỉ trả lời từ thư viện đã duyệt" của brief mục 7.1 ở tầng dữ liệu.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import re
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field, field_validator

from src.rag.config import RagSettings, get_rag_settings
from src.rag.diseases import DiseaseCatalog

# Mã bệnh là chuỗi tự do ở tầng kiểu dữ liệu, và được đối chiếu với mục
# `diseases` của registry lúc nạp. Cố ý không dùng Literal: Literal khoá cứng
# danh sách bệnh vào code, mà đó chính là thứ vừa gỡ ra.
Disease = str
Authority = Literal["vn_moh", "international"]
RuntimeDiseaseStatus = Literal["waiting_for_sources", "active", "inactive"]

_RUNTIME_REGISTRY_VERSION = 1
_DISEASE_ID_RE = re.compile(r"^[a-z][a-z0-9_]{1,63}$")

# Trạng thái vòng đời của một tài liệu:
#   approved        — index thành công, được phép vào vector store
#   pending_review  — biên tập viên vừa tải lên, ĐANG CHỜ DUYỆT, chưa được index
#   indexing        — đang parse/chunk/embed/index; vẫn KHÔNG được agent dùng
#   index_failed    — index thất bại; giữ file và lỗi để biên tập viên thử lại
#   draft           — đang soạn, không đụng tới
#   quarantined     — đã xem xét và loại
DocStatus = Literal[
    "approved",
    "pending_review",
    "indexing",
    "index_failed",
    "draft",
    "quarantined",
]


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

    # Trạng thái job index nằm cùng bản ghi nguồn thay vì chỉ nằm trong hàng
    # đợi UI. uploads.json vì thế là nguồn sự thật duy nhất cho câu hỏi an
    # toàn quan trọng nhất: "agent đã được phép dùng tài liệu này chưa?".
    index_attempts: int = Field(default=0, ge=0)
    index_started_at: str | None = None
    index_started_by: str | None = None
    index_completed_at: str | None = None
    index_error: str | None = None
    indexed_chunks: int | None = Field(default=None, ge=0)

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

    @property
    def active_disease_ids(self) -> list[str]:
        """Conditions that are currently allowed to surface in patient RAG."""
        return [
            disease_id for disease_id, config in self.diseases.items() if config.get("status", "active") == "active"
        ]

    def approved(self) -> list[SourceDoc]:
        # Deactivating a runtime condition must take effect immediately even
        # though its chunks remain in Chroma for recoverable re-activation.
        # The retrieval allow-list is built from this method.
        active = set(self.active_disease_ids)
        return [d for d in self.documents if d.status == "approved" and active.intersection(d.diseases)]

    def pending(self) -> list[SourceDoc]:
        """Tài liệu biên tập viên đã tải lên nhưng chưa duyệt — chưa được index."""
        return [d for d in self.documents if d.status == "pending_review"]

    def indexing(self) -> list[SourceDoc]:
        """Tài liệu đang xử lý nền; tuyệt đối chưa thuộc thư viện RAG."""
        return [d for d in self.documents if d.status == "indexing"]

    def failed(self) -> list[SourceDoc]:
        """Tài liệu giữ lại để biên tập viên xem lỗi và chạy lại index."""
        return [d for d in self.documents if d.status == "index_failed"]

    def by_id(self, doc_id: str) -> SourceDoc:
        for d in self.documents:
            if d.doc_id == doc_id:
                return d
        raise KeyError(f"Không có tài liệu doc_id={doc_id!r} trong registry")


class RuntimeDisease(BaseModel):
    """Một bệnh do BTV thêm qua UI, nằm ngoài registry nền được commit."""

    label_vi: str = Field(min_length=2, max_length=120)
    label_en: str | None = Field(default=None, max_length=120)
    aliases: list[str] = Field(default_factory=list)
    keywords: str = Field(min_length=1)
    status: RuntimeDiseaseStatus = "waiting_for_sources"
    created_by: str
    created_at: str
    updated_at: str


class RuntimeRegistry(BaseModel):
    version: int = _RUNTIME_REGISTRY_VERSION
    diseases: dict[str, RuntimeDisease] = Field(default_factory=dict)


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
    if not isinstance(raw, dict):
        raise ValueError(f"{path} không có định dạng registry YAML hợp lệ")
    raw = _merge_runtime_diseases(raw, settings)
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


def _runtime_registry_path(settings: RagSettings) -> Path:
    return settings.runtime_registry_path or (settings.registry_path.parent / "registry_runtime.yaml")


def _load_runtime_registry(settings: RagSettings) -> RuntimeRegistry:
    """Missing runtime file simply means no editor-created conditions yet."""
    path = _runtime_registry_path(settings)
    if not path.exists():
        return RuntimeRegistry()
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ValueError(f"Không đọc được danh mục bệnh runtime: {exc}") from exc
    if raw is None:
        return RuntimeRegistry()
    if not isinstance(raw, dict):
        raise ValueError("Danh mục bệnh runtime không đúng định dạng YAML")
    return RuntimeRegistry.model_validate(raw)


def _merge_runtime_diseases(base: dict[str, Any], settings: RagSettings) -> dict[str, Any]:
    """Merge base catalog with runtime entries without ever mutating base YAML."""
    runtime = _load_runtime_registry(settings)
    merged = dict(base)
    base_diseases = base.get("diseases")
    if not isinstance(base_diseases, dict):
        raise ValueError("registry.yaml thiếu mục diseases")
    diseases = dict(base_diseases)
    collisions = sorted(set(diseases).intersection(runtime.diseases))
    if collisions:
        raise ValueError("Danh mục runtime trùng mã bệnh nền: " + ", ".join(collisions))
    for disease_id, disease in runtime.diseases.items():
        diseases[disease_id] = disease.model_dump(mode="json")
    merged["diseases"] = diseases
    return merged


@contextmanager
def _runtime_registry_lock(path: Path) -> Iterator[None]:
    """Serialize writers while atomic replacement keeps readers safe."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = path.with_suffix(path.suffix + ".lock")
    with lock_path.open("a+") as lock_file:
        try:
            import fcntl

            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        except ImportError:  # pragma: no cover - Windows does not ship fcntl
            pass
        try:
            yield
        finally:
            try:
                import fcntl

                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
            except ImportError:  # pragma: no cover - Windows does not ship fcntl
                pass


def _save_runtime_registry(runtime: RuntimeRegistry, settings: RagSettings) -> Path:
    """Write atomically: a crash may keep the old file, never a half-written YAML."""
    path = _runtime_registry_path(settings)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.stem}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as temp_file:
            yaml.safe_dump(
                runtime.model_dump(mode="json"),
                temp_file,
                allow_unicode=True,
                sort_keys=False,
                default_flow_style=False,
            )
            temp_file.flush()
            os.fsync(temp_file.fileno())
        os.replace(temp_name, path)
    except Exception:
        Path(temp_name).unlink(missing_ok=True)
        raise
    return path


def _utc_now() -> str:
    return _dt.datetime.now(_dt.UTC).isoformat(timespec="seconds")


def _normalize_aliases(label_vi: str, label_en: str | None, aliases: list[str]) -> list[str]:
    values = [label_vi, label_en or "", *aliases]
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = " ".join(value.split())
        key = cleaned.casefold()
        if cleaned and key not in seen:
            normalized.append(cleaned)
            seen.add(key)
    return normalized


def _keywords_from_aliases(aliases: list[str]) -> str:
    """Generate literal patterns so BTV never has to write arbitrary regex."""
    return "|".join(re.escape(alias).replace(r"\ ", r"\s+") for alias in aliases)


def create_runtime_disease(
    *,
    disease_id: str,
    label_vi: str,
    label_en: str | None,
    aliases: list[str],
    created_by: str,
    settings: RagSettings | None = None,
) -> RuntimeDisease:
    """Create a BTV-managed condition without touching ``registry.yaml``."""
    settings = settings or get_rag_settings()
    disease_id = disease_id.strip().lower()
    if not _DISEASE_ID_RE.fullmatch(disease_id):
        raise ValueError("Mã bệnh chỉ gồm chữ thường, số và dấu gạch dưới; bắt đầu bằng chữ cái.")
    label_vi = " ".join(label_vi.split())
    label_en = " ".join(label_en.split()) if label_en else None
    if len(label_vi) < 2:
        raise ValueError("Tên tiếng Việt của bệnh cần ít nhất 2 ký tự.")
    normalized_aliases = _normalize_aliases(label_vi, label_en, aliases)
    now = _utc_now()

    with _runtime_registry_lock(_runtime_registry_path(settings)):
        base = yaml.safe_load(settings.registry_path.read_text(encoding="utf-8"))
        base_diseases = base.get("diseases", {}) if isinstance(base, dict) else {}
        if disease_id in base_diseases:
            raise ValueError(f"Mã bệnh {disease_id!r} đã thuộc danh mục nền.")
        runtime = _load_runtime_registry(settings)
        if disease_id in runtime.diseases:
            raise ValueError(f"Mã bệnh {disease_id!r} đã tồn tại trong danh mục runtime.")

        disease = RuntimeDisease(
            label_vi=label_vi,
            label_en=label_en,
            aliases=normalized_aliases,
            keywords=_keywords_from_aliases(normalized_aliases),
            status="waiting_for_sources",
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        runtime.diseases[disease_id] = disease
        _save_runtime_registry(runtime, settings)
    return disease


def set_runtime_disease_status(
    disease_id: str,
    status: RuntimeDiseaseStatus,
    *,
    settings: RagSettings | None = None,
) -> RuntimeDisease:
    settings = settings or get_rag_settings()
    with _runtime_registry_lock(_runtime_registry_path(settings)):
        runtime = _load_runtime_registry(settings)
        try:
            disease = runtime.diseases[disease_id]
        except KeyError:
            raise KeyError(f"Không có bệnh runtime {disease_id!r}") from None
        disease.status = status
        disease.updated_at = _utc_now()
        _save_runtime_registry(runtime, settings)
    return disease


def activate_runtime_diseases_with_sources(disease_ids: list[str], settings: RagSettings | None = None) -> list[str]:
    """Only a successful source indexing run may activate a new disease."""
    settings = settings or get_rag_settings()
    activated: list[str] = []
    with _runtime_registry_lock(_runtime_registry_path(settings)):
        runtime = _load_runtime_registry(settings)
        for disease_id in disease_ids:
            disease = runtime.diseases.get(disease_id)
            if disease is not None and disease.status == "waiting_for_sources":
                disease.status = "active"
                disease.updated_at = _utc_now()
                activated.append(disease_id)
        if activated:
            _save_runtime_registry(runtime, settings)
    return activated


def runtime_diseases(settings: RagSettings | None = None) -> dict[str, RuntimeDisease]:
    return _load_runtime_registry(settings or get_rag_settings()).diseases


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


def quarantined_uploads(settings: RagSettings | None = None) -> list[QuarantinedDoc]:
    """Những tài liệu upload đã bị từ chối, giữ để hiển thị lịch sử vận hành.

    ``reject()`` đưa file gốc vào quarantine và ghi metadata ở đây thay vì để
    nó lẫn với registry đang hoạt động. Hàm đọc riêng giúp giao diện biên tập
    vẫn liệt kê được trạng thái từ chối mà không có nguy cơ nạp nó vào RAG.
    """
    settings = settings or get_rag_settings()
    path = settings.raw_dir.parent / "quarantine" / "rejected.json"
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [QuarantinedDoc.model_validate(item) for item in raw]
