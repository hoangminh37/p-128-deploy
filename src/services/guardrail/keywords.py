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
