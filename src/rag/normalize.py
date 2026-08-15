"""Làm sạch văn bản trích từ PDF/PPTX — trọng tâm là tiếng Việt.

Đây là chỗ quyết định data "sạch" hay không. Mọi hàm ở đây đều thuần tuý
(vào chuỗi, ra chuỗi hoặc bool), không đọc file, không gọi mạng — nên test
được dễ và chạy nhanh. Xem tests/test_rag/test_normalize.py.
"""

from __future__ import annotations

import re
import unicodedata

# --- Ký tự vô hình và ký tự thay thế -----------------------------------------
# PDF hay chèn soft hyphen, zero-width space, non-breaking space. Chúng làm hỏng
# so khớp chuỗi và làm tokenizer đếm sai, nên bỏ hoặc quy về dấu cách thường.
_INVISIBLE = dict.fromkeys(map(ord, "­​‌‍⁠﻿"), None)
_SPACES = {ord(c): " " for c in "     　"}

# --- Sửa lỗi font tiếng Việt kiểu cũ -----------------------------------------
# Nhiều văn bản Bộ Y tế được soạn bằng bộ font TCVN3/VNI rồi xuất ra PDF. Khi
# trích text, một số chữ có dấu móc ra sai ký tự Unicode. Ví dụ thật gặp trong
# QĐ 6858/QĐ-BYT: "CHẤT LƯỢNG" trích ra thành "CHẤT LƢỢNG" (U+01B0 -> U+01A2/01B0
# lẫn lộn). Bảng dưới đây quy các ký tự đó về đúng chữ cái tiếng Việt.
_LEGACY_CHARS = {
    "Ƣ": "Ư",  # Ƣ  latin capital letter oi -> dùng sai cho Ư
    "ƣ": "ư",  # ƣ
    "Đ": "Đ",  # Đ  đúng rồi, giữ nguyên để bảng đầy đủ
    "Ð": "Đ",  # Ð  latin capital eth -> hay bị dùng thay cho Đ
    "": "‰",
    "’": "'",
    "‘": "'",
    "“": '"',
    "”": '"',
    "–": "-",  # en dash
    "—": "-",  # em dash
    "−": "-",  # minus sign
    "ﬁ": "fi",
    "ﬂ": "fl",
}
_LEGACY_TABLE = str.maketrans(_LEGACY_CHARS)

# --- Mẫu nhận dạng rác --------------------------------------------------------

# Dòng chỉ có số trang, hoặc "Trang 3/19", "Page 12 of 107".
_PAGE_NUMBER = re.compile(r"^\s*(?:trang|page)?\s*\d{1,4}\s*(?:/|of|trên)?\s*\d{0,4}\s*$", re.IGNORECASE)

# Dòng mục lục kiểu "3.2. Điều trị ................ 45"
_TOC_LINE = re.compile(r"\.{4,}\s*\d{1,4}\s*$")

# Khối hành chính cuối văn bản pháp quy Việt Nam — không có giá trị giáo dục.
_VN_ADMIN = re.compile(
    r"^\s*(?:"
    r"nơi\s*nhận|"
    r"kt\.?\s*bộ\s*trưởng|"
    r"tm\.?\s*(?:chính\s*phủ|ban)|"
    r"thứ\s*trưởng|"
    r"bộ\s*trưởng\s*$|"
    r"lưu\s*:?\s*vt|"
    r"\(đã\s*ký\)|"
    r"ký\s*bởi|"
    r"chữ\s*ký\s*số"
    r")",
    re.IGNORECASE,
)

# Một mục trong danh sách tài liệu tham khảo: "12. Nguyen VA, Smith J, et al. ..."
_REFERENCE_ENTRY = re.compile(
    r"^\s*(?:\[\d{1,4}\]|\d{1,4}\.)\s+[A-ZÀ-Ỹ][^\n]{15,}?"
    r"(?:et\s+al\.|,\s*[A-Z][a-z]+\s+[A-Z]{1,3}\b|\bdoi:|\bhttps?://)",
    re.IGNORECASE | re.MULTILINE,
)

# Tiêu đề khối tài liệu tham khảo.
_REFERENCE_HEADING = re.compile(
    r"^\s*(?:references?|bibliography|tài\s*liệu\s*tham\s*khảo)\s*:?\s*$",
    re.IGNORECASE,
)

# Dấu hiệu của một trích dẫn tạp chí, KHÔNG phụ thuộc vào việc có đánh số hay không.
# Cần thiết vì trong hướng dẫn AHA/ACC 2025 và ESC 2024, bộ parse trả về khối
# tham khảo dưới nhãn "text" thường và số thứ tự đã mất, nên bộ lọc dựa vào
# tiền tố "12." hoàn toàn không bắt được. Bốn dấu hiệu dưới đây thì không mất:
_CITATION_SIGNATURE = re.compile(
    r"(?:"
    r"\b\d{4}\s*;\s*\d{1,4}\s*:\s*\d|"  # 2016;17:1001 — năm;tập:trang
    r"\bet\s+al\.|"
    r"\bdoi\s*:\s*10\.|"
    r"\bPMID\b"
    r")",
    re.IGNORECASE,
)

# Mở đầu kiểu danh sách tác giả: "Rossi GP, ..." hoặc "Fravel MA, ...".
_STARTS_LIKE_CITATION = re.compile(r"^\s*[A-Z][a-zA-Z'’-]+\s+[A-Z]{1,3}[,.]\s")

# Dòng chỉ chứa đường dẫn hoặc DOI — chân trang trích dẫn, không có nội dung.
_URL_ONLY = re.compile(r"^\s*\(?\s*(?:https?://|doi\s*:|www\.)\S+\s*\)?\s*[.;]?\s*$", re.IGNORECASE)

# Khối bản quyền, xin phép sử dụng. Bộ slide ADA mở đầu bằng đúng loại này.
_LEGAL = re.compile(
    r"(?:all\s+rights\s+reserved|©|\bcopyright\b|without\s+further\s+permission|"
    r"appropriate\s+attribution|created,?\s+reviewed,?\s+and\s+approved\s+by|"
    r"bản\s*quyền|mọi\s*quyền\s*được\s*bảo\s*lưu)",
    re.IGNORECASE,
)

# Học hàm, học vị, chứng chỉ hành nghề. Dùng để nhận ra khối danh sách tác giả
# ở đầu các hướng dẫn quốc tế và khối "Ban biên soạn" của văn bản Bộ Y tế.
# Cố ý phân biệt hoa thường: viết hoa mới là chức danh, tránh bắt nhầm chữ
# thường trong văn xuôi.
_CREDENTIAL = re.compile(
    r"\b(?:MD|PhD|MPH|MSc|PharmD|DrPH|ScD|MHSc|PA-C|FNP|RN|BSN|"
    r"FAHA|FACC|FASPC|FACP|FAAN|FASH|FASN|FSCAI|FESC)\b"
)
_VN_CREDENTIAL = re.compile(r"\b(?:GS|PGS|TS|ThS|BSCK[IV]+|BS|DS)\.")

# Ngưỡng chẩn đoán / chỉ số xét nghiệm — dùng để gắn cờ chunk cần thận trọng
# khi các hướng dẫn khác năm mâu thuẫn nhau.
_THRESHOLD = re.compile(
    r"(?:"
    r"\d{2,3}\s*/\s*\d{2,3}\s*mm\s*hg|"  # 140/90 mmHg
    r"\d{2,3}\s*mm\s*hg|"  # 140mmHg — dạng "từ 140mmHg trở lên" trong QĐ 3192
    r"\bhba1c\b|"
    r"\bmmol\s*/\s*l\b|"
    r"\bmg\s*/\s*d[lL]\b|"
    r"[≥≤<>]\s*\d+(?:[.,]\d+)?\s*(?:%|mmol|mg|mmhg|g\b)"
    r")",
    re.IGNORECASE,
)

# Từ khoá nhận diện bệnh KHÔNG nằm ở đây — chúng được cấu hình trong mục
# `diseases` của data/registry.yaml và nạp qua src/rag/diseases.py. Module này
# giữ nguyên tính chất thuần tuý: vào chuỗi, ra chuỗi hoặc bool, không đọc file.


def normalize_unicode(text: str) -> str:
    """Chuẩn hoá Unicode về NFC và sửa ký tự font cũ.

    NFC quan trọng với tiếng Việt: "ệ" có thể được lưu thành 1 ký tự (U+1EC7)
    hoặc 3 ký tự tổ hợp. Không chuẩn hoá thì hai chuỗi nhìn giống hệt nhau lại
    không bằng nhau, và embedding cũng khác nhau.
    """
    if not text:
        return ""
    text = text.translate(_INVISIBLE).translate(_SPACES).translate(_LEGACY_TABLE)
    return unicodedata.normalize("NFC", text)


def dehyphenate(text: str) -> str:
    """Nối lại từ bị gạch nối xuống dòng: "hyper-\\ntension" -> "hypertension".

    Chỉ nối khi phần sau bắt đầu bằng chữ thường, để không phá "COVID-\\n19"
    hay các gạch nối thật trong "non-\\nHDL".
    """
    return re.sub(r"(\w)-\s*\n\s*([a-zà-ỹ])", r"\1\2", text)


def collapse_whitespace(text: str) -> str:
    """Gộp khoảng trắng thừa nhưng vẫn giữ ranh giới đoạn văn (2 dòng trống)."""
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clean_text(text: str) -> str:
    """Pipeline làm sạch đầy đủ cho một đoạn văn bản."""
    return collapse_whitespace(dehyphenate(normalize_unicode(text)))


def strip_noise_lines(text: str) -> str:
    """Bỏ từng dòng là số trang, dòng mục lục, hoặc khối hành chính."""
    kept = []
    for line in text.split("\n"):
        s = line.strip()
        if not s:
            kept.append("")
            continue
        if _PAGE_NUMBER.match(s) or _TOC_LINE.search(s) or _VN_ADMIN.match(s):
            continue
        kept.append(line)
    return collapse_whitespace("\n".join(kept))


def alpha_ratio(text: str) -> float:
    """Tỷ lệ ký tự là chữ cái. Dùng để loại khối toàn số/ký hiệu."""
    if not text:
        return 0.0
    letters = sum(1 for c in text if c.isalpha())
    return letters / len(text)


def is_reference_block(text: str, min_entries: int = 3, min_ratio: float = 0.4) -> bool:
    """Đoạn này có phải danh sách tài liệu tham khảo không.

    Ba cách nhận dạng, vì khối tham khảo đến từ bộ parse ở nhiều hình dạng khác nhau:

    1. Tiêu đề "TÀI LIỆU THAM KHẢO" / "References".
    2. Danh sách có đánh số ("12. Nguyen VA, et al. ...") — mật độ dòng.
    3. Mật độ dấu hiệu trích dẫn tạp chí, không cần đánh số.

    Cách thứ 3 là cách quan trọng nhất và được thêm sau khi đo trên dữ liệu thật:
    hai hướng dẫn AHA/ACC 2025 và ESC 2024 có 359 chunk là mục tham khảo mà hai
    cách đầu KHÔNG bắt được chunk nào, vì bộ parse trả chúng về dưới nhãn "text"
    và số thứ tự đã bị mất. Hậu quả đo được: câu hỏi "tăng huyết áp nên ăn uống
    thế nào" trả về hai mục thư mục ở vị trí số 1 và số 2.

    Ngưỡng 2 dấu hiệu trên 100 từ được chọn từ phân bố thật của corpus: khối
    tham khảo nằm ở khoảng 2.4–7.3, còn văn xuôi lâm sàng có nhắc một nghiên cứu
    chỉ khoảng 0.3–0.6.
    """
    stripped = text.strip()
    if _REFERENCE_HEADING.match(stripped):
        return True

    lines = [line for line in text.split("\n") if line.strip()]
    if len(lines) >= min_entries:
        hits = len(_REFERENCE_ENTRY.findall(text))
        if hits >= min_entries and hits / len(lines) >= min_ratio:
            return True

    signatures = len(_CITATION_SIGNATURE.findall(text))
    if not signatures:
        return False

    # Mảnh trích dẫn ngắn: mở đầu bằng danh sách tác giả là đủ chắc chắn.
    if _STARTS_LIKE_CITATION.match(stripped):
        return True

    words = len(re.findall(r"\w+", text))
    if not words:
        return False
    return signatures >= 3 and signatures / (words / 100) >= 2.0


def is_boilerplate(text: str) -> bool:
    """Đoạn không mang nội dung giáo dục: khối hành chính, mục lục, bản quyền, quá ngắn."""
    s = text.strip()
    if not s:
        return True
    if _VN_ADMIN.match(s):
        return True
    if _PAGE_NUMBER.match(s):
        return True
    if _URL_ONLY.match(s):
        return True
    # Giới hạn độ dài để một đoạn nội dung thật có lỡ nhắc chữ "bản quyền"
    # cũng không bị loại nhầm.
    if len(s) < 600 and _LEGAL.search(s):
        return True
    lines = [line for line in s.split("\n") if line.strip()]
    if lines and sum(1 for line in lines if _TOC_LINE.search(line)) / len(lines) > 0.5:
        return True
    # Toàn số và ký hiệu, gần như không có chữ.
    if len(s) < 400 and alpha_ratio(s) < 0.35:
        return True
    return False


def is_byline_block(text: str, min_credentials: int = 5, max_chars: int = 3000) -> bool:
    """Đoạn này có phải danh sách tác giả / ban biên soạn không.

    Cả hướng dẫn AHA/ACC 2025 lẫn ESC 2024 đều mở đầu bằng danh sách dài tên
    người kèm học vị ("Daniel W. Jones, MD, FAHA, Chair; ..."). Khối này là chữ
    thật, dài, mật độ chữ cái cao, nên trượt hết các bộ lọc khác — nhưng nó
    không trả lời được câu hỏi nào của bệnh nhân. Dấu hiệu nhận biết là mật độ
    chức danh dày bất thường.
    """
    if len(text) > max_chars:
        return False
    n = len(_CREDENTIAL.findall(text)) + len(_VN_CREDENTIAL.findall(text))
    return n >= min_credentials


def has_clinical_threshold(text: str) -> bool:
    """Đoạn có chứa ngưỡng chẩn đoán hoặc chỉ số xét nghiệm không.

    Chunk được gắn cờ này là chunk dễ mâu thuẫn nhất giữa các hướng dẫn khác
    năm (140/90 của QĐ 3192 năm 2010 so với 130/80 của AHA/ACC 2025). Tầng sinh
    câu trả lời dùng cờ này để bắt buộc nêu rõ đang trích hướng dẫn năm nào.
    """
    return bool(_THRESHOLD.search(text))


def shingles(text: str, size: int = 5) -> set[str]:
    """Tập n-gram từ, dùng để đo trùng lặp gần đúng giữa hai chunk."""
    words = re.findall(r"\w+", text.lower())
    if len(words) < size:
        return {" ".join(words)} if words else set()
    return {" ".join(words[i : i + size]) for i in range(len(words) - size + 1)}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / (len(a) + len(b) - inter)
