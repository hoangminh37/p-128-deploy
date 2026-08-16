"""Keyword lists cho safety guardrail — emergency & diagnosis detection."""

from __future__ import annotations

# ── Emergency (FR3.2) ────────────────────────────────────────────────────────
# Các từ khóa/cụm từ chỉ tình trạng nguy hiểm tính mạng cần cấp cứu ngay
EMERGENCY_KEYWORDS: list[str] = [
    # Hô hấp / Tim mạch
    "khó thở",
    "thở không được",
    "đau ngực",
    "tức ngực",
    "nhồi máu cơ tim",
    "đột quỵ",
    "liệt nửa người",
    "méo miệng",
    # Ý thức
    "mất ý thức",
    "ngất xỉu",
    "bất tỉnh",
    "co giật",
    "động kinh",
    # Chảy máu
    "xuất huyết",
    "chảy máu không cầm",
    "nôn ra máu",
    "đi ngoài ra máu",
    # Ngộ độc / Tai nạn
    "uống nhầm thuốc",
    "ngộ độc",
    "nuốt phải hóa chất",
    "tai nạn giao thông",
    "bỏng nặng",
    # Sản khoa
    "sinh non",
    "vỡ ối",
]

# ── Diagnosis / Prescription (FR3.4) ────────────────────────────────────────
# Các từ khóa yêu cầu chẩn đoán hoặc kê toa — phải từ chối 100%
DIAGNOSIS_KEYWORDS: list[str] = [
    # Chẩn đoán
    "tôi bị bệnh gì",
    "tôi mắc bệnh gì",
    "chẩn đoán cho tôi",
    "tôi có bị không",
    "tôi có mắc không",
    # Kê toa
    "kê toa",
    "kê đơn",
    "cho tôi đơn thuốc",
    "thuốc nào tốt hơn",
    "tôi nên uống thuốc gì",
    "liều dùng của tôi",
    "tôi uống bao nhiêu",
    "tôi có thể dùng",
    "đổi thuốc",
    "dừng thuốc",
]

# ── Smalltalk / chào hỏi ─────────────────────────────────────────────────────
# Regex (không phải substring) vì chúng phải khớp TRỌN câu hỏi: chữ "chào" nằm
# trong một câu hỏi y tế thật thì không được tính là lời chào. Xem check_smalltalk.
#
# Tách hai nhóm để ghép được với nhau: "Hi bạn là ai?" là lời chào GHÉP câu hỏi
# danh tính, gộp chung một danh sách thì không khớp được ca đó.

# Nhóm 1 — lời chào thuần.
GREETING_PATTERNS: list[str] = [
    r"(?:xin\s+)?ch[aà]o(?:\s+buổi\s+(?:sáng|trưa|chiều|tối))?"
    r"(?:\s+(?:bạn|em|anh|chị|bác\s*sĩ|trợ\s*lý|ad|shop|mọi\s*người))?",
    r"h(?:i+|e+y+|ello+|allo+|ullo)",
    r"alo+",
    r"yo",
]

# Nhóm 2 — hỏi về chính trợ lý, cảm ơn, tạm biệt.
SMALLTALK_PATTERNS: list[str] = [
    # Danh tính / năng lực
    r"(?:bạn|em|mày|trợ\s*lý|ai)\s*(?:là\s*ai|tên\s*(?:là\s*)?gì|là\s*(?:cái\s*)?gì)",
    r"(?:bạn|em|trợ\s*lý)\s*(?:có\s*thể\s*)?(?:làm|giúp)\s*(?:được\s*)?(?:gì|những\s*gì)[^?]*",
    r"(?:đây|này|trang\s*này|app\s*này)\s*là\s*(?:trang|app|web|hệ\s*thống|cái)?\s*gì",
    r"(?:tôi|mình)\s*(?:có\s*thể\s*)?hỏi\s*(?:được\s*)?(?:gì|những\s*gì)[^?]*",
    r"giới\s*thiệu(?:\s*(?:về\s*)?(?:bản\s*thân|bạn|hệ\s*thống))?",
    # Cảm ơn / tạm biệt / xác nhận
    r"(?:xin\s+)?c[aả]m\s*[oơ]n(?:\s+(?:bạn|em|nhé|nha|ạ))*",
    r"thank(?:s|\s*you)?(?:\s+(?:bạn|nhé))?",
    r"(?:tạm\s*biệt|bye+|goodbye|bai)(?:\s+(?:bạn|nhé|nha))?",
    r"ok(?:ay)?(?:\s+(?:bạn|nhé|nha))?",
]
