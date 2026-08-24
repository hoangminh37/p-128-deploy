"""Liệt kê các model Groq mà API key hiện tại thực sự dùng được.

    python scripts/list_groq_models.py

VÌ SAO CẦN SCRIPT NÀY:

Groq gỡ model khỏi nền tảng khá thường xuyên và không báo trước. Ngày 24/08/2026
toàn bộ dòng Llama chat biến mất — cả ``llama-3.3-70b-versatile`` lẫn
``llama-3.1-8b-instant``, hai giá trị từng nằm trong ``.env`` của dự án này.

Triệu chứng lúc đó rất dễ dẫn người ta đi sai đường: mọi lời gọi LLM trả về
**404 model_not_found**, và phản xạ đầu tiên của ai cũng là "chắc API key hỏng"
rồi ngồi thay key. Nhưng key hỏng cho **401**, không phải 404 — 404 nghĩa là
request đã xác thực xong xuôi, chỉ là model không tồn tại.

Script này trả lời dứt điểm câu hỏi đó trong ba giây.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover
    pass

#: Model có ngữ cảnh dưới ngưỡng này không dùng cho agent được — chúng là
#: speech-to-text, TTS, hoặc bộ lọc prompt injection chứ không phải model chat.
MIN_USABLE_CONTEXT = 8192

#: Thứ tự ưu tiên khi gợi ý model thay thế, tốt nhất trước.
#:
#: Sắp tay chứ không lấy phần tử đầu bảng chữ cái: agent này phụ thuộc nặng vào
#: ``with_structured_output``, mà khả năng gọi hàm giữa các model chênh nhau rất
#: xa. ``groq/compound`` đứng đầu bảng chữ cái nhưng là hệ agentic có sẵn tool
#: của Groq, hành vi khác hẳn một model chat thuần — gợi ý nó ra là đẩy người
#: dùng vào một lớp lỗi mới. gpt-oss-120b là model đã chạy qua scripts/smoke_quiz.py.
UU_TIEN: tuple[str, ...] = (
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
)


def main() -> int:
    key = os.getenv("GROQ_API_KEY", "")
    if not key:
        print("Thiếu GROQ_API_KEY trong .env")
        return 1

    try:
        from groq import Groq
    except ImportError:
        print("Chưa cài package `groq`. Chạy: pip install groq")
        return 1

    try:
        rows = sorted(Groq(api_key=key).models.list().data, key=lambda m: m.id)
    except Exception as exc:
        print(f"Không gọi được Groq API: {exc}")
        return 1

    chat, khac = [], []
    for m in rows:
        ctx = getattr(m, "context_window", 0) or 0
        (chat if ctx >= MIN_USABLE_CONTEXT else khac).append((m.id, ctx, getattr(m, "owned_by", "")))

    print(f"\nKey này dùng được {len(rows)} model.\n")

    print("DÙNG ĐƯỢC CHO AGENT (ngữ cảnh đủ lớn)")
    print("-" * 74)
    for mid, ctx, owner in chat:
        print(f"  {mid:<44} ctx={ctx:<8} {owner}")

    print("\nKHÔNG DÙNG CHO AGENT (speech / TTS / prompt-guard)")
    print("-" * 74)
    for mid, ctx, owner in khac:
        print(f"  {mid:<44} ctx={ctx:<8} {owner}")

    hien_tai = os.getenv("MODEL_NAME", "")
    if hien_tai:
        con_song = any(mid == hien_tai for mid, _, _ in chat + khac)
        dau = "OK" if con_song else "KHÔNG CÒN TỒN TẠI"
        print(f"\nMODEL_NAME trong .env: {hien_tai}  ->  {dau}")
        if not con_song and chat:
            co_san = {mid for mid, _, _ in chat}
            goi_y = next((m for m in UU_TIEN if m in co_san), chat[0][0])
            print(f"Gợi ý đổi sang: {goi_y}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
