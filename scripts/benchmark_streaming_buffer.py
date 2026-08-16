"""Benchmark: True Streaming — Kiểm tra buffer logic mà không cần server.

Mô phỏng luồng token từ LangGraph astream_events và đo:
  1. TTFT (Time To First Token): thời gian từ khi bắt đầu đến token đầu tiên
  2. Xác minh không có ký tự JSON lọt vào stream (không có {, "analysis", "claims")
  3. Xác minh nội dung token khớp với câu trả lời mong đợi

Chạy:
    python3 scripts/benchmark_streaming_buffer.py
"""

from __future__ import annotations

import asyncio
import json
import time
from statistics import mean, stdev

# ── Cấu hình ─────────────────────────────────────────────────────────────────
NUM_RUNS = 5
SIMULATED_LLM_LATENCY_MS = 30   # ms mỗi token — tiêu biểu cho Groq streaming
ANSWER_MARKER = '"answer":'

# ── Mẫu JSON output từ LLM (nhả ra từng token ~30ms một) ────────────────────
# Đây là đúng dạng LLM thật sẽ nhả ra qua on_chat_model_stream
SIMULATED_LLM_OUTPUT = (
    '{"analysis": "Bệnh tiểu đường type 2 cần kiêng thực phẩm có chỉ số đường huyết cao.", '
    '"answer": "Người bệnh tiểu đường type 2 cần kiêng:\\n\\n'
    "1. **Đường và đồ ngọt**: bánh kẹo, nước ngọt có gas.\\n\\n"
    "2. **Tinh bột tinh chế**: cơm trắng, bánh mì trắng, bún.\\n\\n"
    "3. **Chất béo bão hòa**: thịt mỡ, đồ chiên rán.\\n\\n"
    "Thay vào đó nên ăn: rau xanh, ngũ cốc nguyên hạt, đạm nạc [doc_0].\", "
    '"claims": [{"cited_doc_id": "doc_0", "sentence": "Ăn rau xanh giúp kiểm soát đường huyết"}]}'
)


# ── EXPECTED_ANSWER: parse từ JSON để đảm bảo đúng encoding ─────────────────
# (KHÔNG hardcode string literal vì dễ sai thứ tự escape)
import json as _json
EXPECTED_ANSWER: str = _json.loads(SIMULATED_LLM_OUTPUT)["answer"]



# ── Mô phỏng astream_events từ LangGraph ─────────────────────────────────────

async def _mock_astream_events(token_size: int = 3):
    """Giả lập luồng sự kiện từ LangGraph astream_events.

    Chia SIMULATED_LLM_OUTPUT thành các token nhỏ (token_size ký tự mỗi token)
    và phát ra từng token với delay mô phỏng độ trễ mạng.
    """
    text = SIMULATED_LLM_OUTPUT

    # Phát sự kiện on_chain_start (node bắt đầu)
    yield {
        "event": "on_chain_start",
        "name": "llm_generate",
        "data": {},
        "metadata": {},
    }

    # Phát từng token nhỏ
    for i in range(0, len(text), token_size):
        token = text[i: i + token_size]
        await asyncio.sleep(SIMULATED_LLM_LATENCY_MS / 1000)
        yield {
            "event": "on_chat_model_stream",
            "name": "ChatGroq",
            "data": {
                "chunk": _MockChunk(token),
            },
            "metadata": {"langgraph_node": "llm_generate"},
        }

    # Phát sự kiện on_chain_end (node kết thúc)
    yield {
        "event": "on_chain_end",
        "name": "llm_generate",
        "data": {"output": {"response": EXPECTED_ANSWER, "citations": []}},
        "metadata": {},
    }


class _MockChunk:
    """Mock AIMessageChunk."""
    def __init__(self, content: str):
        self.content = content


# ── Logic buffer — COPY từ chat.py để kiểm tra cô lập ──────────────────────

async def _simulate_streaming(run_id: int) -> dict:
    """Mô phỏng đúng logic buffer regex từ chat.py và đo các chỉ số."""
    import re as _re
    _raw_buffer: str = ""
    _streamed_len: int = 0
    _ANSWER_RE = _re.compile(r'"answer"\s*:\s*"((?:[^"\\]|\\.)*)"?', _re.DOTALL)

    tokens_yielded: list[str] = []
    t_start = time.perf_counter()
    ttft_ms: float | None = None

    async for event in _mock_astream_events(token_size=3):
        event_type = event.get("event", "")

        if event_type == "on_chat_model_stream":
            node_name = event.get("metadata", {}).get("langgraph_node", "")
            if node_name != "llm_generate":
                continue

            chunk = event.get("data", {}).get("chunk")
            if chunk and chunk.content:
                _raw_buffer += chunk.content

                m = _ANSWER_RE.search(_raw_buffer)
                if m:
                    raw_answer = m.group(1)
                    try:
                        decoded = json.loads(f'"{raw_answer}"')
                    except json.JSONDecodeError:
                        decoded = raw_answer.replace("\\n", "\n").replace('\\"', '"')

                    new_text = decoded[_streamed_len:]
                    if new_text:
                        _streamed_len = len(decoded)
                        tokens_yielded.append(new_text)

                        # Ghi lại TTFT khi yield token đầu tiên
                        if ttft_ms is None:
                            ttft_ms = (time.perf_counter() - t_start) * 1000

    total_ms = (time.perf_counter() - t_start) * 1000
    full_text = "".join(tokens_yielded)

    return {
        "ttft_ms": ttft_ms or total_ms,
        "total_ms": total_ms,
        "token_count": len(tokens_yielded),
        "full_text": full_text,
    }


# ── Kiểm tra tính đúng đắn của nội dung ─────────────────────────────────────

def _validate_output(result: dict) -> list[str]:
    """Kiểm tra token stream không bị lẫn cú pháp JSON."""
    errors = []
    text = result["full_text"]

    # 1. Không được có ký tự JSON thô
    forbidden = ['"analysis"', '"claims"', '"cited_doc_id"', '{"']
    for f in forbidden:
        if f in text:
            errors.append(f"❌ Lỗi: Chuỗi JSON '{f}' bị lọt vào token stream!")

    # 2. Nội dung phải khớp với expected (normalize whitespace)
    norm_actual   = " ".join(text.split())
    norm_expected = " ".join(EXPECTED_ANSWER.split())
    if norm_actual != norm_expected:
        errors.append(
            f"❌ Lỗi: Nội dung không khớp!\n"
            f"   Mong đợi: {norm_expected[:80]}...\n"
            f"   Nhận được: {norm_actual[:80]}..."
        )

    # 3. Phải có token
    if result["token_count"] == 0:
        errors.append("❌ Lỗi: Không có token nào được yield!")

    return errors


# ── Main ─────────────────────────────────────────────────────────────────────

async def main() -> None:
    line = "─" * 60
    print(f"\n{line}")
    print("  BENCHMARK: True Streaming — Buffer XML Logic")
    print(f"  Độ trễ mô phỏng mỗi token : {SIMULATED_LLM_LATENCY_MS} ms")
    print(f"  Số ký tự output của LLM    : {len(SIMULATED_LLM_OUTPUT)}")
    print(f"  Số lần đo                   : {NUM_RUNS}")
    print(f"{line}\n")

    ttft_list: list[float] = []
    total_list: list[float] = []
    all_errors: list[str] = []

    for i in range(1, NUM_RUNS + 1):
        result = await _simulate_streaming(i)
        ttft_list.append(result["ttft_ms"])
        total_list.append(result["total_ms"])
        errors = _validate_output(result)
        all_errors.extend(errors)

        status = "✅" if not errors else "❌"
        print(
            f"  [{status}] Lần {i}/{NUM_RUNS}: "
            f"TTFT={result['ttft_ms']:.0f}ms | "
            f"Total={result['total_ms']:.0f}ms | "
            f"{result['token_count']} tokens"
        )

    # Kết quả
    ttft_avg  = mean(ttft_list)
    ttft_std  = stdev(ttft_list) if len(ttft_list) > 1 else 0
    total_avg = mean(total_list)

    print(f"\n{line}")
    print("  KẾT QUẢ ĐO THỜI GIAN")
    print(f"{line}")
    print(f"  TTFT trung bình  : {ttft_avg:6.0f} ms ± {ttft_std:.0f} ms")
    print(f"  Hoàn thành TB    : {total_avg:6.0f} ms")
    print(f"  Tỷ lệ TTFT/Total : {ttft_avg/total_avg*100:.1f}%")
    print()

    # Phân tích TTFT
    # Lý thuyết: TTFT ≈ (số token trước "answer":) × latency/token
    prefix_len = len('{"analysis": "Bệnh tiểu đường type 2 cần kiêng thực phẩm có chỉ số đường huyết cao.", "answer": ')
    theoretical_ttft = (prefix_len / 3) * SIMULATED_LLM_LATENCY_MS
    print(f"  Lý thuyết TTFT   : ~{theoretical_ttft:.0f} ms (phải chờ qua phần analysis)")

    print(f"\n{line}")
    print("  KIỂM TRA TÍNH ĐÚNG ĐẮN")
    print(f"{line}")

    if all_errors:
        for err in set(all_errors):
            print(f"  {err}")
    else:
        print("  ✅  Không có lỗi nào — nội dung token khớp hoàn toàn.")
        print("  ✅  Không có cú pháp JSON lọt vào token stream.")

    # Tổng kết
    print(f"\n{line}")
    print("  TỔNG KẾT")
    print(f"{line}")

    if ttft_avg < total_avg * 0.5 and not all_errors:
        print(f"  ✅  PASS — True Streaming hoạt động đúng.")
        print(f"         Token đầu tiên xuất hiện sau {ttft_avg:.0f} ms")
        print(f"         ({ttft_avg/total_avg*100:.0f}% tổng thời gian) — người dùng thấy chữ sớm.")
    else:
        if ttft_avg >= total_avg * 0.5:
            print(f"  ⚠️   CẢNH BÁO: TTFT chiếm {ttft_avg/total_avg*100:.0f}% tổng thời gian.")
            print("         Buffer logic cần xem xét lại.")
        if all_errors:
            print(f"  ❌  Có {len(set(all_errors))} lỗi cần sửa.")
    print()


if __name__ == "__main__":
    asyncio.run(main())
