"""Nạp và dựng prompt cho tầng sinh câu trả lời.

Prompt được giữ ở file markdown riêng chứ không nhúng vào code Python: người
viết prompt và người viết code là hai vai khác nhau, và diff của một file
markdown đọc được trong Pull Request, còn diff của một chuỗi nhiều dòng trong
Python thì không.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

PROMPT_DIR = Path(__file__).parent

# Câu miễn trừ trách nhiệm — brief mục 7.5 yêu cầu hiển thị ở MỌI câu trả lời.
# Gắn ở tầng API chứ không để LLM tự sinh, vì LLM có thể quên hoặc viết khác đi.
DISCLAIMER = "Thông tin mang tính giáo dục, không thay thế tư vấn của bác sĩ."


@lru_cache(maxsize=4)
def load_prompt(name: str = "system_vi") -> str:
    path = PROMPT_DIR / f"{name}.md"
    if not path.exists():
        raise FileNotFoundError(f"Không có prompt {name!r} tại {path}")
    return path.read_text(encoding="utf-8")


def format_context(hits) -> str:
    """Biến kết quả truy xuất thành khối TÀI LIỆU đánh số cho prompt.

    Mỗi nguồn mang theo cơ quan ban hành và NĂM. Năm là bắt buộc: nó là thứ duy
    nhất cho mô hình biết hướng dẫn nào mới hơn khi hai nguồn nói khác nhau.
    """
    blocks = []
    for i, h in enumerate(hits, 1):
        m = h.metadata
        head = f"[{i}] {m.get('title', '')} — {m.get('issuer', '')}, {m.get('published', '')}"
        if m.get("doc_code"):
            head += f" ({m['doc_code']})"
        if not m.get("doc_code_verified", True):
            head += " [số hiệu chưa xác minh]"
        where = m.get("section_path", "")
        if where:
            head += f"\n    Mục: {where}"
        blocks.append(f"{head}\n{h.text}")
    return "\n\n---\n\n".join(blocks)


def format_profile(profile: dict | None, catalog=None) -> str:
    """Tóm tắt hồ sơ bệnh nhân, chỉ những trường thực sự dùng để cá nhân hoá.

    Cố tình không nhận và không in tên, số điện thoại hay bất cứ trường định danh
    nào — ràng buộc PII ở brief mục 7.4.

    Tên tiếng Việt của bệnh lấy từ danh mục trong registry, không viết cứng ở đây.
    """
    if not profile:
        return "Chưa có hồ sơ. Trả lời ở mức chung, không suy đoán về người hỏi."

    if catalog is None:
        from src.rag.chunk import default_catalog

        catalog = default_catalog()

    parts = []
    if profile.get("age"):
        parts.append(f"Tuổi: {profile['age']}")
    if profile.get("primary_condition"):
        parts.append(f"Bệnh chính: {catalog.label_vi(profile['primary_condition'])}")
    if profile.get("comorbidities"):
        joined = ", ".join(catalog.label_vi(c) for c in profile["comorbidities"])
        parts.append(f"Bệnh nền kèm theo: {joined}")
    if profile.get("diagnosed_at"):
        parts.append(f"Thời điểm chẩn đoán: {profile['diagnosed_at']}")
    return "\n".join(parts) if parts else "Chưa có hồ sơ."


def build_generation_prompt(question: str, hits, profile: dict | None = None, catalog=None) -> str:
    """Ghép prompt hoàn chỉnh để đưa vào LLM."""
    return (
        load_prompt("system_vi")
        .replace("{patient_profile}", format_profile(profile, catalog))
        .replace("{context}", format_context(hits))
        .replace("{question}", question.strip())
    )
