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

# ── Prompt Injection (Security) ──────────────────────────────────────────────
# Các pattern cố ý hỏi về cấu trúc nội bộ hoặc thao túng behavior của AI
PROMPT_INJECTION_KEYWORDS: list[str] = [
    # Hỏi về system prompt
    "system prompt",
    "system message",
    "prompt của bạn",
    "prompt gốc",
    "câu lệnh của bạn",
    "hướng dẫn của bạn",
    "instruction của bạn",
    "bạn được lập trình",
    "bạn được cài đặt",
    "bạn được huấn luyện",
    "nếu system prompt",
    "nếu prompt",
    # Yêu cầu bypass / ignore hướng dẫn
    "ignore previous",
    "forget previous",
    "bỏ qua hướng dẫn",
    "bỏ qua tất cả",
    "quên đi hướng dẫn",
    "giả vờ bạn là",
    "hãy đóng vai",
    "bây giờ bạn là",
    "từ bây giờ bạn",
    "pretend you are",
    "act as",
    "you are now",
    # Khai thác cấu trúc nội bộ
    "show me your prompt",
    "reveal your instructions",
    "what are your instructions",
    "tiết lộ prompt",
    "cho tôi xem prompt",
    "nội dung prompt",
]

