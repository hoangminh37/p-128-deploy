"""Khôi phục cấu trúc cấp tài liệu từ danh sách khối cấp trang.

Đây là phần lấy ý từ paper MinerU-Popo (arXiv 2605.24973). Paper huấn luyện một
mô hình 4B để làm bốn việc; ở quy mô dự án này ta hiện thực bản heuristic của
đúng bốn việc đó, dùng chính các dấu hiệu cấu trúc mà paper mô tả ở mục 4.1:

  1. text truncation      -> merge_truncated_text()   (paper 4.1 mục 3)
  2. table truncation     -> merge_continued_tables() (paper 4.1 mục 4)
  3. title hierarchy      -> repair_heading_levels()  (paper phụ lục B, tiêu chí 2)
  4. image-text assoc.    -> attach_captions()

Vì sao không dùng thẳng mô hình của paper: nó cần fine-tune Qwen3-VL-4B trên
8 GPU H200, không khả thi cho dự án này. Nhưng chính paper chỉ ra rằng phần lớn
tín hiệu nằm ở quy tắc cấu trúc — đánh số tiêu đề, dấu câu kết đoạn, số cột của
bảng — nên bản heuristic vẫn xử lý được đúng loại lỗi mà bộ parse cấp trang bỏ sót.

Toàn bộ file này chỉ làm việc trên Element nên test được không cần Docling.
"""

from __future__ import annotations

import re

from src.rag.elements import Element
from src.rag.normalize import clean_text

# --- Nhận dạng đánh số tiêu đề ------------------------------------------------
# Thứ tự quan trọng: mẫu cụ thể hơn phải đứng trước.
_NUMBERING = [
    # 1.2.3. Tiêu đề  -> cấp 3
    (re.compile(r"^\s*(\d+)\.(\d+)\.(\d+)\.?\s+\S"), 3),
    # 1.2. Tiêu đề    -> cấp 2
    (re.compile(r"^\s*(\d+)\.(\d+)\.?\s+\S"), 2),
    # 1. Tiêu đề      -> cấp 1
    (re.compile(r"^\s*(\d+)\.\s+\S"), 1),
    # I. / II. / IV.  -> cấp 1 (văn bản pháp quy Việt Nam hay dùng)
    (re.compile(r"^\s*([IVXLC]+)\.\s+\S"), 1),
    # Chương I        -> cấp 1
    (re.compile(r"^\s*(?:chương|phần)\s+[IVXLC\d]+", re.IGNORECASE), 1),
    # Phụ lục 1       -> cấp 1
    (re.compile(r"^\s*phụ\s*lục", re.IGNORECASE), 1),
    # a) / b)         -> cấp 4
    (re.compile(r"^\s*[a-zà-ỹ]\)\s+\S"), 4),
]

# Dấu kết câu. Đoạn kết thúc bằng các ký tự này thì coi như đã trọn ý.
_SENTENCE_END = tuple(".;:!?…)»\"'")

# Đoạn sau bắt đầu bằng những mẫu này thì chắc chắn là đoạn mới, không phải
# phần tiếp của đoạn trước.
_STARTS_NEW = re.compile(
    r"^\s*(?:"
    r"[-•▪–]\s|"  # gạch đầu dòng
    r"\d+[.)]\s|"  # 1. hoặc 1)
    r"[a-zà-ỹ][.)]\s|"  # a. hoặc a)
    r"[IVXLC]+\.\s|"  # I.
    r"(?:chương|phần|phụ\s*lục|bảng|hình|lưu\s*ý|ghi\s*chú)\b"
    r")",
    re.IGNORECASE,
)


def repair_heading_levels(elements: list[Element]) -> list[Element]:
    """Sửa cấp tiêu đề dựa vào cách đánh số trong văn bản.

    Bộ parse suy cấp tiêu đề chủ yếu từ cỡ chữ, nên với văn bản pháp quy Việt Nam
    (cỡ chữ gần như đồng đều, phân cấp thể hiện qua đánh số) nó thường ra sai.
    Khi có đánh số thì đánh số là bằng chứng mạnh hơn, ta lấy theo đánh số.
    """
    for el in elements:
        if el.kind != "heading":
            continue
        for pattern, level in _NUMBERING:
            if pattern.match(el.text):
                if el.level != level:
                    el.repairs.append(f"heading_level:{el.level}->{level}")
                    el.level = level
                break
        else:
            # Không có đánh số thì giữ nguyên cấp của bộ parse, nhưng chặn giá
            # trị vô lý để cây tiêu đề không bị vỡ.
            if el.level is None or el.level < 1:
                el.level = 1
            el.level = min(el.level, 6)
    return elements


def merge_truncated_text(elements: list[Element]) -> list[Element]:
    """Nối lại đoạn văn bị ngắt bởi sang trang hoặc sang cột.

    Điều kiện nối, theo đúng tinh thần bộ lọc mà MinerU-Popo dùng ở mục 4.1(3)
    — dựa vào dấu câu kết thúc và tiền tố mở đầu:

      * hai khối liền nhau, cùng là văn bản thường
      * khối trước KHÔNG kết thúc bằng dấu kết câu
      * khối sau bắt đầu bằng chữ thường và không phải đầu mục mới
      * không có tiêu đề chen giữa (đã đảm bảo vì hai khối liền nhau)
      * cách nhau tối đa 1 trang

    Trường hợp gạch nối cuối dòng ("điều-" / "trị") thì nối liền không thêm dấu cách.
    """
    if not elements:
        return elements

    merged: list[Element] = [elements[0]]
    for cur in elements[1:]:
        prev = merged[-1]

        if not _can_merge(prev, cur):
            merged.append(cur)
            continue

        if prev.text.rstrip().endswith("-"):
            prev.text = prev.text.rstrip()[:-1] + cur.text.lstrip()
        else:
            prev.text = prev.text.rstrip() + " " + cur.text.lstrip()

        prev.repairs.append(f"merged_text:p{prev.page}+p{cur.page}")
        # Khối gộp trải qua nhiều trang; giữ trang bắt đầu, trang kết thúc suy ra sau.
        prev.page = prev.page if prev.page is not None else cur.page

    return merged


def _can_merge(prev: Element, cur: Element) -> bool:
    if prev.kind not in ("text", "list_item") or cur.kind != "text":
        return False
    if not prev.text or not cur.text:
        return False
    if prev.text.rstrip().endswith(_SENTENCE_END):
        return False
    if _STARTS_NEW.match(cur.text):
        return False

    first = cur.text.lstrip()[:1]
    if not first or not first.islower():
        return False

    if prev.page is not None and cur.page is not None and abs(cur.page - prev.page) > 1:
        return False
    return True


def _table_columns(markdown: str) -> int:
    """Đếm số cột của bảng dạng markdown, lấy theo dòng đầu tiên có dấu |."""
    for line in markdown.split("\n"):
        if "|" in line:
            return len([c for c in line.split("|") if c.strip()])
    return 0


def _table_header(markdown: str) -> str:
    for line in markdown.split("\n"):
        if "|" in line:
            return line.strip()
    return ""


def merge_continued_tables(elements: list[Element]) -> list[Element]:
    """Ghép bảng bị cắt qua trang thành một bảng.

    Dấu hiệu dùng để nhận biết, giống MinerU-Popo mục 4.1(4): hai bảng nằm ở
    ranh giới trang, cùng số cột, và giữa chúng không có caption riêng. Nếu
    bảng sau lặp lại đúng dòng tiêu đề của bảng trước thì bỏ dòng lặp đó đi.
    """
    if not elements:
        return elements

    out: list[Element] = [elements[0]]
    for cur in elements[1:]:
        prev = out[-1]

        if (
            prev.kind == "table"
            and cur.kind == "table"
            and prev.page is not None
            and cur.page is not None
            and 0 <= cur.page - prev.page <= 1
            and _table_columns(prev.text) > 0
            and _table_columns(prev.text) == _table_columns(cur.text)
        ):
            body = cur.text
            head = _table_header(cur.text)
            if head and head == _table_header(prev.text):
                # Bỏ dòng tiêu đề lặp và dòng phân cách ngay dưới nó.
                lines = cur.text.split("\n")
                drop = 1
                if len(lines) > 1 and set(lines[1].replace("|", "").strip()) <= set("-: "):
                    drop = 2
                body = "\n".join(lines[drop:])
            prev.text = prev.text.rstrip() + "\n" + body.lstrip()
            prev.repairs.append(f"merged_table:p{prev.page}+p{cur.page}")
            continue

        out.append(cur)
    return out


def attach_captions(elements: list[Element]) -> list[Element]:
    """Gắn caption vào bảng ngay trước hoặc ngay sau nó.

    Đây là bản rút gọn của bài toán image-text association trong paper. Ảnh bị bỏ
    hẳn (agent trả lời bằng chữ, không hiển thị ảnh), nên chỉ còn phần bảng:
    caption đứng sát bảng được nhập vào chính khối bảng, để chunk chứa bảng vẫn
    biết bảng đó nói về cái gì thay vì trơ ra một mớ số.
    """
    out: list[Element] = []
    i = 0
    while i < len(elements):
        el = elements[i]

        if el.kind == "caption":
            nxt = elements[i + 1] if i + 1 < len(elements) else None
            prv = out[-1] if out else None
            if nxt is not None and nxt.kind == "table":
                nxt.text = el.text.strip() + "\n\n" + nxt.text
                nxt.repairs.append("caption_before")
                i += 1
                continue
            if prv is not None and prv.kind == "table":
                prv.text = prv.text.rstrip() + "\n\n" + el.text.strip()
                prv.repairs.append("caption_after")
                i += 1
                continue
            # Caption mồ côi: giữ lại như văn bản thường, còn hơn vứt đi.
            el.kind = "text"

        out.append(el)
        i += 1
    return out


def build_section_paths(elements: list[Element], doc_title: str | None = None) -> list[Element]:
    """Điền section_path cho từng khối bằng một ngăn xếp tiêu đề.

    Đây là bước "structural enrichment" ở mục 4.3 của paper: sau khi cấp tiêu đề
    đã đúng, mỗi khối nội dung được gắn đường dẫn tiêu đề dẫn tới nó. Đường dẫn
    này về sau được ghép vào đầu văn bản đem đi embedding, nên một chunk viết
    "Liều khởi đầu là 500 mg" vẫn truy xuất được đúng vì nó mang theo ngữ cảnh
    "... > 3. ĐIỀU TRỊ > 3.2. Metformin".
    """
    stack: list[tuple[int, str]] = []
    base = [doc_title] if doc_title else []

    for el in elements:
        if el.kind == "heading":
            level = el.level or 1
            while stack and stack[-1][0] >= level:
                stack.pop()
            heading_text = clean_text(el.text)
            el.section_path = base + [t for _, t in stack] + [heading_text]
            stack.append((level, heading_text))
        else:
            el.section_path = base + [t for _, t in stack]
    return elements


def repair_document(elements: list[Element], doc_title: str | None = None) -> list[Element]:
    """Chạy đủ bốn phép sửa, đúng thứ tự.

    Thứ tự có ý nghĩa: phải sửa cấp tiêu đề trước khi dựng đường dẫn tiêu đề,
    và phải gắn caption trước khi ghép bảng để caption không bị kẹt giữa hai
    mảnh bảng và chặn mất phép ghép.
    """
    elements = repair_heading_levels(elements)
    elements = attach_captions(elements)
    elements = merge_continued_tables(elements)
    elements = merge_truncated_text(elements)
    elements = build_section_paths(elements, doc_title)
    return elements
