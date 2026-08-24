"""Liệt kê model OpenRouter kèm GIÁ THẬT hôm nay, lọc theo nhu cầu của dự án này.

    python scripts/list_openrouter_models.py                  # 25 model rẻ nhất
    python scripts/list_openrouter_models.py --tim qwen       # lọc theo tên
    python scripts/list_openrouter_models.py --tat-ca --top 60

VÌ SAO KHÔNG CHÉP MỘT BẢNG GIÁ VÀO TÀI LIỆU:

Danh mục và giá của OpenRouter đổi liên tục. Một bảng chép tay là bảng sai sau
vài tuần, và cái sai đó lại trông rất đáng tin. Ngày 24/08/2026 Groq gỡ sạch
dòng Llama trong khi .env của dự án vẫn trỏ vào `llama-3.1-8b-instant` — mọi
lời gọi trả 404 và người trong nhóm mất hàng giờ đi thay API key vì tưởng key
hỏng. Script này hỏi thẳng nguồn, nên không bao giờ lỗi thời.

BỘ LỌC BẮT BUỘC: mọi node của agent đều đi qua ``with_structured_output``. Model
không hỗ trợ tool calling hoặc structured output sẽ làm hỏng cả pipeline dù rẻ
tới đâu, nên chúng bị loại thẳng chứ không hiện ra để ai đó lỡ tay chọn.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request

MODELS_URL = "https://openrouter.ai/api/v1/models"

#: Lượng token thật của MỘT lượt sinh quiz, đo ngày 24/08/2026 bằng
#: scripts/smoke_quiz.py (xin 7 câu trên một bài học cỡ trung bình).
#: Dùng làm đơn vị quy đổi để "0.15 đô mỗi triệu token" thành một con số
#: người ta hình dung được.
QUIZ_TOKENS_IN = 1473
QUIZ_TOKENS_OUT = 2989

#: Ngữ cảnh tối thiểu. Prompt sinh đề có thể mang tới 8000 ký tự trích đoạn.
MIN_CONTEXT = 32000


def fetch_models() -> list[dict]:
    req = urllib.request.Request(
        MODELS_URL,
        # Thiếu User-Agent thì Cloudflare của OpenRouter trả 403.
        headers={"User-Agent": "Mozilla/5.0 (compatible; P128/1.0)"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)["data"]


def usable(m: dict) -> dict | None:
    """Trả về bản rút gọn nếu model dùng được cho agent này, không thì None."""
    sup = set(m.get("supported_parameters") or [])
    if not ({"tools", "structured_outputs"} & sup):
        return None

    ctx = m.get("context_length") or 0
    if ctx < MIN_CONTEXT:
        return None

    p = m.get("pricing") or {}
    try:
        gia_vao = float(p.get("prompt") or 0) * 1_000_000
        gia_ra = float(p.get("completion") or 0) * 1_000_000
    except (TypeError, ValueError):
        return None

    # Model "free" có hạn mức thất thường và hay biến mất — không dùng cho thứ
    # người bệnh đang chờ.
    if gia_vao <= 0 and gia_ra <= 0:
        return None

    return {
        "id": m["id"],
        "ctx": ctx,
        "gia_vao": gia_vao,
        "gia_ra": gia_ra,
        "quiz_usd": (gia_vao * QUIZ_TOKENS_IN + gia_ra * QUIZ_TOKENS_OUT) / 1_000_000,
        "structured": "structured_outputs" in sup,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tim", type=str, default=None, help="Chỉ hiện model có chuỗi này trong tên")
    parser.add_argument("--top", type=int, default=25, help="Số dòng hiện ra")
    parser.add_argument("--tat-ca", action="store_true", help="Bỏ giới hạn --top")
    args = parser.parse_args()

    try:
        raw = fetch_models()
    except Exception as exc:
        print(f"Không gọi được OpenRouter: {exc}")
        return 1

    rows = [r for r in (usable(m) for m in raw) if r]
    if args.tim:
        rows = [r for r in rows if args.tim.lower() in r["id"].lower()]

    rows.sort(key=lambda r: r["quiz_usd"])
    hien = rows if args.tat_ca else rows[: args.top]

    print(f"\n{len(rows)} model dung duoc cho agent nay (co tool calling, ctx >= {MIN_CONTEXT:,}).")
    print(f"Cot $/quiz quy doi tu mot luot sinh de that: {QUIZ_TOKENS_IN} token vao, {QUIZ_TOKENS_OUT} token ra.\n")
    print(f"{'model':<46} {'ctx':>10} {'$/1M in':>9} {'$/1M out':>9} {'$/quiz':>10} {'struct':>7}")
    print("-" * 96)
    for r in hien:
        print(
            f"{r['id']:<46} {r['ctx']:>10,} {r['gia_vao']:>9.3f} {r['gia_ra']:>9.3f} "
            f"{r['quiz_usd']:>10.6f} {'yes' if r['structured'] else '-':>7}"
        )

    if hien:
        re_nhat = hien[0]
        print()
        print(f"Re nhat trong danh sach: {re_nhat['id']} — {1 / re_nhat['quiz_usd']:,.0f} de moi 1 do la.")
        print("Nhung RE KHONG PHAI TIEU CHI DUY NHAT: model nho hay sinh thieu cau va")
        print("dien dat tieng Viet kem. Chay scripts/eval_quiz_models.py de so chat luong that.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
