"""Cắt tài liệu đã sửa cấu trúc thành chunk kèm metadata đầy đủ.

Ba nguyên tắc:

1. Không cắt giữa câu. Chunk luôn kết thúc ở ranh giới một khối nội dung.
2. Chunk mang theo ngữ cảnh. Văn bản đem đi embedding được ghép thêm đường dẫn
   tiêu đề ở đầu, nên "Liều khởi đầu 500 mg/ngày" vẫn tìm được khi hỏi về
   metformin, dù bản thân câu đó không nhắc chữ metformin.
3. Bảng không bị xé. Bảng là một chunk riêng; bảng quá lớn thì cắt theo hàng
   và lặp lại dòng tiêu đề ở mỗi mảnh.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from functools import lru_cache

from src.rag.config import RagSettings, get_rag_settings
from src.rag.diseases import DiseaseCatalog
from src.rag.elements import Element
from src.rag.normalize import (
    clean_text,
    has_clinical_threshold,
    is_boilerplate,
    is_byline_block,
    is_reference_block,
    jaccard,
    shingles,
    strip_noise_lines,
)
from src.rag.registry import SourceDoc


@dataclass
class Chunk:
    chunk_id: str
    doc_id: str
    text: str  # nội dung gốc — dùng làm snippet trích dẫn cho bệnh nhân
    embed_text: str  # nội dung có tiền tố ngữ cảnh — dùng để embedding
    metadata: dict = field(default_factory=dict)


@dataclass
class DropStat:
    """Đếm số khối bị loại theo lý do, để báo cáo lại sau khi build."""

    boilerplate: int = 0
    reference: int = 0
    byline: int = 0
    too_short: int = 0
    out_of_scope: int = 0
    duplicate: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "boilerplate": self.boilerplate,
            "reference": self.reference,
            "byline": self.byline,
            "too_short": self.too_short,
            "out_of_scope": self.out_of_scope,
            "duplicate": self.duplicate,
        }


@lru_cache(maxsize=1)
def default_catalog() -> DiseaseCatalog:
    """Danh mục bệnh mặc định, đọc từ registry. Cache vì nó không đổi khi chạy."""
    from src.rag.registry import load_registry

    return load_registry().catalog


@lru_cache(maxsize=1)
def _encoder():
    """Tokenizer dùng để đo độ dài chunk — cl100k_base.

    Cố ý dùng một tokenizer cố định, KHÔNG đổi theo model embedding đang bật.
    Hai lý do: (1) độ dài chunk phải ổn định để đổi provider không phải chunk lại
    toàn bộ corpus, (2) nó chỉ dùng để ước lượng, không cần khớp tuyệt đối.

    An toàn cho cả hai provider đang hỗ trợ: giới hạn 500 token ở đây nhỏ hơn
    nhiều so với 8192 token của bge-m3 và 8191 của text-embedding-3-small. Với
    tiếng Việt, cl100k đếm ra nhiều token hơn tokenizer của bge-m3, nên nếu có
    lệch thì lệch về phía chunk ngắn hơn dự kiến — an toàn, không bị cắt cụt.
    """
    import tiktoken

    return tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    return len(_encoder().encode(text))


# -----------------------------------------------------------------------------
# Lọc rác
# -----------------------------------------------------------------------------


def filter_elements(elements: list[Element], settings: RagSettings, stats: DropStat) -> list[Element]:
    """Bỏ những khối chắc chắn không có giá trị giáo dục.

    Thứ tự kiểm tra có chủ ý: nhận dạng rác TRƯỚC khi cắt dòng nhiễu, để một
    khối hành chính bị đếm vào đúng lý do "boilerplate" chứ không rơi nhầm sang
    "too_short" sau khi bị cắt hết dòng. Số liệu trong manifest nhờ vậy mới
    phản ánh đúng chuyện gì đã xảy ra với data.

    Bảng được miễn hai bộ lọc dựa trên mật độ chữ. Bảng có giá trị nhất trong
    corpus này lại là bảng ít chữ nhất — bảng phân độ huyết áp gần như toàn số,
    tỷ lệ chữ cái khoảng 0.19, sẽ bị is_boilerplate loại oan nếu không miễn.
    """
    kept: list[Element] = []
    for el in elements:
        if el.kind == "heading":
            kept.append(el)
            continue

        text = clean_text(el.text)
        if not text:
            stats.too_short += 1
            continue

        if is_reference_block(text):
            stats.reference += 1
            continue

        if el.kind != "table" and is_byline_block(text):
            stats.byline += 1
            continue

        if el.kind != "table":
            if is_boilerplate(text):
                stats.boilerplate += 1
                continue
            text = strip_noise_lines(text)
            if not text:
                stats.boilerplate += 1
                continue
            if len(text) < settings.element_min_chars:
                stats.too_short += 1
                continue

        el.text = text
        kept.append(el)

    return drop_repeated_elements(kept, settings, stats)


def drop_repeated_elements(elements: list[Element], settings: RagSettings, stats: DropStat) -> list[Element]:
    """Bỏ khối có nội dung lặp đi lặp lại — chân trang, chân slide, nhãn mục.

    Bộ slide ADA in lại tên chương ở mỗi slide ("2. Diagnosis and Classification
    of Diabetes" xuất hiện hàng chục lần). Lọc theo độ dài không bắt được vì có
    khối dài tới hơn 40 ký tự, còn lọc theo mật độ chữ cũng không, vì chúng là
    chữ thật. Dấu hiệu đúng là tần suất lặp.

    Chỉ áp cho khối ngắn: một đoạn dài giống hệt nhau lặp lại là chuyện khác,
    và bước khử trùng lặp ở cấp chunk mới là chỗ xử lý nó.
    """
    from collections import Counter

    counts = Counter(el.text.strip().lower() for el in elements if el.kind not in ("heading", "table"))
    repeated = {text for text, n in counts.items() if n >= settings.repeated_element_threshold and len(text) < 200}
    if not repeated:
        return elements

    kept = []
    for el in elements:
        if el.kind not in ("heading", "table") and el.text.strip().lower() in repeated:
            stats.boilerplate += 1
            continue
        kept.append(el)
    return kept


# -----------------------------------------------------------------------------
# Cắt chunk
# -----------------------------------------------------------------------------


def _context_prefix(section_path: list[str]) -> str:
    """Dòng ngữ cảnh đặt ở đầu văn bản đem đi embedding."""
    if not section_path:
        return ""
    return "[" + " > ".join(section_path) + "]\n"


def _split_table(el: Element, max_tokens: int) -> list[Element]:
    """Cắt bảng quá lớn theo hàng, lặp lại dòng tiêu đề ở mỗi mảnh."""
    if count_tokens(el.text) <= max_tokens:
        return [el]

    lines = el.text.split("\n")
    header_end = 0
    for i, line in enumerate(lines[:3]):
        if "|" in line:
            header_end = i + 1
            if i + 1 < len(lines) and set(lines[i + 1].replace("|", "").strip()) <= set("-: "):
                header_end = i + 2
            break
    header = lines[:header_end]
    body = lines[header_end:]

    parts: list[Element] = []
    buf: list[str] = []
    for line in body:
        buf.append(line)
        if count_tokens("\n".join(header + buf)) >= max_tokens:
            parts.append(
                Element(
                    kind="table",
                    text="\n".join(header + buf),
                    page=el.page,
                    ref=el.ref,
                    section_path=list(el.section_path),
                    repairs=[*el.repairs, "table_split"],
                )
            )
            buf = []
    if buf:
        parts.append(
            Element(
                kind="table",
                text="\n".join(header + buf),
                page=el.page,
                ref=el.ref,
                section_path=list(el.section_path),
                repairs=[*el.repairs, "table_split"],
            )
        )
    return parts or [el]


def group_into_chunks(elements: list[Element], settings: RagSettings) -> list[list[Element]]:
    """Gom khối liền nhau cùng một mục thành chunk, tôn trọng ngân sách token.

    Chunk bị đóng lại khi: đổi sang mục khác (section_path thay đổi), gặp bảng,
    hoặc thêm khối nữa thì vượt ngân sách token.
    """
    groups: list[list[Element]] = []
    current: list[Element] = []
    current_tokens = 0
    current_path: list[str] | None = None

    def flush() -> None:
        nonlocal current, current_tokens
        if current:
            groups.append(current)
        current = []
        current_tokens = 0

    for el in elements:
        if el.kind == "heading":
            # Tiêu đề không tự thành chunk; nó đã nằm trong section_path của
            # các khối phía sau. Nhưng nó là ranh giới tự nhiên để đóng chunk.
            flush()
            current_path = None
            continue

        if el.kind == "table":
            flush()
            for part in _split_table(el, settings.table_max_tokens):
                groups.append([part])
            current_path = None
            continue

        tokens = count_tokens(el.text)

        if current_path is not None and el.section_path != current_path:
            flush()

        if current and current_tokens + tokens > settings.chunk_max_tokens:
            tail = _overlap_tail(current, settings.chunk_overlap_tokens)
            flush()
            current = list(tail)
            current_tokens = sum(count_tokens(e.text) for e in current)

        current.append(el)
        current_tokens += tokens
        current_path = el.section_path

    flush()
    return [g for g in groups if g]


def _overlap_tail(group: list[Element], overlap_tokens: int) -> list[Element]:
    """Lấy vài khối cuối của chunk trước để mở đầu chunk sau."""
    if overlap_tokens <= 0:
        return []
    tail: list[Element] = []
    total = 0
    for el in reversed(group):
        t = count_tokens(el.text)
        if total + t > overlap_tokens and tail:
            break
        tail.insert(0, el)
        total += t
        if total >= overlap_tokens:
            break
    # Không lấy nguyên cả chunk cũ làm phần chồng lấn.
    return tail if len(tail) < len(group) else tail[-1:]


# -----------------------------------------------------------------------------
# Gắn metadata
# -----------------------------------------------------------------------------


def _page_range(group: list[Element]) -> tuple[int | None, int | None]:
    pages = [e.page for e in group if e.page is not None]
    return (min(pages), max(pages)) if pages else (None, None)


def _keep_chunk(text: str, kind: str, settings: RagSettings) -> bool:
    """Chunk có đáng giữ không: đủ dài HOẶC đủ số từ. Bảng thì luôn giữ."""
    if not text:
        return False
    if kind == "table":
        return True
    if len(text) >= settings.chunk_min_chars:
        return True
    return len(re.findall(r"\w+", text)) >= settings.chunk_min_words


def build_chunks(
    doc: SourceDoc,
    elements: list[Element],
    settings: RagSettings | None = None,
    catalog: DiseaseCatalog | None = None,
) -> tuple[list[Chunk], DropStat]:
    """Từ danh sách khối đã sửa cấu trúc ra danh sách chunk kèm metadata.

    `catalog` quyết định các cột nhãn bệnh trong metadata. Không truyền thì lấy
    danh mục mặc định từ registry — nhưng nên truyền vào khi đã có sẵn, để khỏi
    đọc lại file cho mỗi tài liệu.
    """
    settings = settings or get_rag_settings()
    catalog = catalog or default_catalog()
    stats = DropStat()

    elements = filter_elements(elements, settings, stats)
    groups = group_into_chunks(elements, settings)

    chunks: list[Chunk] = []
    for idx, group in enumerate(groups):
        text = "\n\n".join(e.text for e in group).strip()
        if not _keep_chunk(text, group[0].kind, settings):
            stats.too_short += 1
            continue

        # Lọc lại lần hai ở MỨC CHUNK, không chỉ ở mức khối.
        # Lý do phát hiện được từ dữ liệu thật: một chunk là ghép của nhiều khối,
        # và một khối trích dẫn lẻ có thể chưa đủ dấu hiệu để bị loại, nhưng ghép
        # dăm bảy khối như vậy lại thì thành nguyên một đoạn thư mục. Chunk kiểu
        # đó đã lọt lên vị trí số 1 cho câu hỏi "tăng huyết áp nên ăn uống thế nào".
        if group[0].kind != "table":
            if is_reference_block(text):
                stats.reference += 1
                continue
            if is_byline_block(text):
                stats.byline += 1
                continue

        section_path = group[0].section_path
        embed_text = _context_prefix(section_path) + text

        # Nhãn bệnh: lấy hợp của nhãn cấp tài liệu và nhãn suy từ nội dung.
        # Nhãn cấp tài liệu luôn đúng; nhãn nội dung giúp bệnh nhân mắc đồng
        # thời hai bệnh vẫn tìm được đoạn nói về bệnh kia (brief P3, R6).
        diseases = sorted(set(doc.diseases) | set(catalog.detect(text)))

        page_start, page_end = _page_range(group)
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()

        metadata = {
            # nguồn gốc
            "doc_id": doc.doc_id,
            "title": doc.citation_title,
            "issuer": doc.citation_issuer,
            "doc_code": doc.doc_code or "",
            "doc_code_verified": doc.doc_code_verified,
            "url": doc.url or "",
            "published": doc.published,
            "published_year": doc.published_year,
            "lang": doc.lang,
            "authority": doc.authority,
            # xếp hạng
            "recency_rank": doc.recency_rank,
            "priority": doc.priority,
            # định vị trong tài liệu
            "section_path": " > ".join(section_path),
            "page_start": page_start if page_start is not None else -1,
            "page_end": page_end if page_end is not None else -1,
            "kind": group[0].kind,
            # phân loại nội dung — một cột boolean cho mỗi bệnh trong danh mục,
            # sinh động theo registry chứ không liệt kê cứng ở đây
            "diseases": ",".join(diseases),
            **catalog.metadata_flags(diseases),
            "has_threshold": has_clinical_threshold(text),
            # kiểm chứng
            "token_count": count_tokens(embed_text),
            "char_count": len(text),
            "sha256": digest,
            "repairs": ",".join(sorted({r.split(":")[0] for e in group for r in e.repairs})),
        }
        if group[0].kind == "table" and group[0].table is not None:
            # Chroma metadata accepts scalar values only.  Lưu JSON ở đây để
            # vector search vẫn dùng cùng một collection, còn endpoint source
            # có thể dựng lại đúng hàng/cột/cell span mà không đoán từ Markdown.
            metadata["table_structure"] = json.dumps(group[0].table.as_dict(), ensure_ascii=False)

        chunks.append(
            Chunk(
                chunk_id=f"{doc.doc_id}::{idx:04d}::{digest[:8]}",
                doc_id=doc.doc_id,
                text=text,
                embed_text=embed_text,
                metadata=metadata,
            )
        )

    chunks = deduplicate(chunks, settings, stats)
    return chunks, stats


def deduplicate(chunks: list[Chunk], settings: RagSettings, stats: DropStat) -> list[Chunk]:
    """Bỏ chunk trùng hoặc gần trùng — chỉ so sánh trong cùng một tài liệu.

    Cố ý KHÔNG khử trùng lặp giữa các tài liệu: ESC 2024 và AHA/ACC 2025 nói
    những điều rất giống nhau, nhưng chúng là hai nguồn trích dẫn khác nhau và
    có năm ban hành khác nhau. Gộp lại là làm mất một nguồn.
    """
    threshold = settings.dedup_jaccard_threshold
    seen_exact: set[tuple[str, str]] = set()
    kept: list[Chunk] = []
    # Vân tay gom theo doc_id: chỉ so trong cùng tài liệu nên không cần duyệt cả
    # corpus. Không có bước này thì so sánh là O(n^2) trên toàn bộ chunk và
    # build một corpus vài nghìn chunk mất hàng chục phút.
    fingerprints: dict[str, list[set[str]]] = {}

    for c in chunks:
        digest = (c.doc_id, c.metadata["sha256"])
        if digest in seen_exact:
            stats.duplicate += 1
            continue

        sh = shingles(c.text)
        bucket = fingerprints.setdefault(c.doc_id, [])

        # Hai tập chênh lệch kích thước quá nhiều thì Jaccard không thể đạt
        # ngưỡng, bỏ qua luôn phép giao tốn kém.
        lo = len(sh) * threshold
        hi = len(sh) / threshold if threshold else float("inf")
        near_dup = any(lo <= len(other) <= hi and jaccard(sh, other) >= threshold for other in bucket)
        if near_dup:
            stats.duplicate += 1
            continue

        seen_exact.add(digest)
        bucket.append(sh)
        kept.append(c)

    return kept


_WS = re.compile(r"\s+")


def preview(chunk: Chunk, width: int = 160) -> str:
    """Một dòng gọn để soi chunk bằng mắt khi kiểm tra chất lượng."""
    body = _WS.sub(" ", chunk.text)[:width]
    return f"[{chunk.metadata['section_path'][:70]}] {body}"
