"""Benchmark: True Streaming — Thời gian tới token đầu tiên (TTFT).

Chạy (server phải đang chạy trên localhost:8000):
    python3 scripts/benchmark_streaming_ttft.py

Đo:
  1. TTFT (Time To First Token): thời gian từ khi gửi request đến khi nhận token đầu tiên.
  2. Thời gian hoàn thành toàn bộ stream.
  3. Số lượng token nhận được.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from statistics import mean, stdev

# ── Cấu hình ─────────────────────────────────────────────────────────────────
BASE_URL = "http://localhost:8000"
NUM_RUNS = 3   # Số lần đo — tăng lên nếu muốn kết quả chính xác hơn

# ── Payload mẫu ───────────────────────────────────────────────────────────────
SAMPLE_REQUEST = {
    "query": "Bệnh tiểu đường type 2 cần kiêng ăn gì?",
    "patient_id": "P001",
    "conversation_id": None,
    "messages": [],
}

# JWT token để xác thực — lấy từ endpoint /auth/token trước
# Để trống sẽ bỏ qua header Authorization (dùng khi không có auth)
AUTH_TOKEN = ""   # ← Điền JWT token vào đây nếu cần


async def _measure_stream_once(session, run_id: int) -> dict:
    """Gọi /chat/stream một lần và đo các chỉ số thời gian."""
    import httpx

    headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}
    if AUTH_TOKEN:
        headers["Authorization"] = f"Bearer {AUTH_TOKEN}"

    t_start = time.perf_counter()
    ttft_ms: float | None = None
    total_tokens: int = 0
    steps: list[str] = []
    full_text: str = ""

    async with session.stream(
        "POST",
        f"{BASE_URL}/api/v1/chat/stream",
        json=SAMPLE_REQUEST,
        headers=headers,
        timeout=60.0,
    ) as response:
        if response.status_code != 200:
            body = await response.aread()
            print(f"  ❌  Lỗi HTTP {response.status_code}: {body.decode()[:200]}")
            return {"error": True}

        async for raw_line in response.aiter_lines():
            raw_line = raw_line.strip()
            if not raw_line:
                continue

            # Phân tích dòng SSE
            if raw_line.startswith("event:"):
                event_type = raw_line[len("event:"):].strip()
            elif raw_line.startswith("data:"):
                data_str = raw_line[len("data:"):].strip()
                try:
                    payload = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                now = time.perf_counter()

                if event_type == "step":
                    steps.append(payload.get("node", ""))

                elif event_type == "token":
                    total_tokens += 1
                    full_text += payload.get("text", "")

                    # Ghi lại TTFT chỉ lần đầu tiên nhận token
                    if ttft_ms is None:
                        ttft_ms = (now - t_start) * 1000
                        print(
                            f"  [Lần {run_id}] ⚡ Token đầu tiên nhận sau: {ttft_ms:.0f} ms"
                        )

                elif event_type == "done":
                    t_done = time.perf_counter()
                    total_ms = (t_done - t_start) * 1000
                    print(
                        f"  [Lần {run_id}] ✅ Hoàn thành: {total_ms:.0f} ms | "
                        f"{total_tokens} tokens | {len(steps)} bước xử lý"
                    )
                    return {
                        "ttft_ms": ttft_ms or total_ms,
                        "total_ms": total_ms,
                        "total_tokens": total_tokens,
                        "steps": steps,
                        "error": False,
                    }

    return {"ttft_ms": ttft_ms or 99999, "total_ms": 99999, "error": False}


async def _check_server_alive() -> bool:
    """Kiểm tra server có đang chạy không."""
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{BASE_URL}/health", timeout=3.0)
            return resp.status_code == 200
    except Exception:
        return False


async def main() -> None:
    try:
        import httpx
    except ImportError:
        print("❌  Thiếu thư viện httpx. Chạy: pip install httpx")
        sys.exit(1)

    line = "─" * 60

    # Kiểm tra server
    print(f"\n{line}")
    print("  BENCHMARK: True Streaming — Thời gian tới token đầu tiên")
    print(f"  Server  : {BASE_URL}")
    print(f"  Số lần đo: {NUM_RUNS}")
    print(f"{line}\n")

    alive = await _check_server_alive()
    if not alive:
        print(f"❌  Server tại {BASE_URL} không phản hồi.")
        print("   Hãy chạy server trước: make dev  hoặc  uvicorn src.main:app --reload")
        print()
        print("   Bạn vẫn có thể kiểm tra CRAG parallel bằng:")
        print("   python3 scripts/benchmark_crag_parallel.py")
        sys.exit(1)

    print("✅  Server đang chạy.\n")
    print("▶  Bắt đầu đo TTFT (Time To First Token):\n")

    ttft_list: list[float] = []
    total_list: list[float] = []

    async with httpx.AsyncClient() as session:
        for i in range(1, NUM_RUNS + 1):
            result = await _measure_stream_once(session, i)
            if result.get("error"):
                continue
            ttft_list.append(result["ttft_ms"])
            total_list.append(result["total_ms"])
            await asyncio.sleep(1.0)  # Nghỉ 1 giây giữa các lần đo

    if not ttft_list:
        print("❌  Không có lần đo nào thành công.")
        sys.exit(1)

    # Kết quả
    ttft_avg  = mean(ttft_list)
    ttft_std  = stdev(ttft_list) if len(ttft_list) > 1 else 0
    total_avg = mean(total_list)

    print(f"\n{line}")
    print("  KẾT QUẢ")
    print(f"{line}")
    print(f"  TTFT trung bình   : {ttft_avg:7.0f} ms ± {ttft_std:.0f} ms")
    print(f"  Hoàn thành TB     : {total_avg:7.0f} ms")
    print(f"  Tỷ lệ TTFT/Total  : {ttft_avg/total_avg*100:.1f}%")
    print(f"{line}\n")

    # Đánh giá chất lượng streaming
    print("  ĐÁNH GIÁ:")
    if ttft_avg < 2000:
        print(f"  ✅  PASS — Token đầu tiên đến trong {ttft_avg:.0f} ms (< 2 giây).")
        print("         Đây là True Streaming thật sự, không phải giả lập.")
    elif ttft_avg < 5000:
        print(f"  ⚠️   CẦN CẢI THIỆN — TTFT = {ttft_avg:.0f} ms (2–5 giây).")
        print("         Kiểm tra lại bộ đệm buffer trong chat.py.")
    else:
        print(f"  ❌  FAIL — TTFT = {ttft_avg:.0f} ms (> 5 giây).")
        print("         Token chưa được streaming thật. Kiểm tra on_chat_model_stream.")

    ratio = ttft_avg / total_avg
    if ratio < 0.3:
        print(f"  ✅  Tỷ lệ TTFT/Total = {ratio*100:.1f}% — Người dùng thấy chữ sớm.")
    else:
        print(f"  ⚠️   Tỷ lệ TTFT/Total = {ratio*100:.1f}% — Người dùng còn chờ lâu.")
    print()


if __name__ == "__main__":
    asyncio.run(main())
