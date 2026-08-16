"""Benchmark: CRAG Evaluator — Tuần tự vs Song Song.

Chạy:
    python3 scripts/benchmark_crag_parallel.py

Mô phỏng độ trễ LLM bằng asyncio.sleep (không cần API key thật).
Đo và so sánh thời gian giữa hai cách tiếp cận.
"""

from __future__ import annotations

import asyncio
import time
from statistics import mean, stdev
from typing import Any


# ── Mock chain giả lập độ trễ LLM ────────────────────────────────────────────

SIMULATED_LLM_LATENCY_S = 0.8  # 800ms — tiêu biểu cho Groq API
NUM_DOCS = 5                    # Số tài liệu cần đánh giá
NUM_RUNS = 5                    # Số lần đo để lấy trung bình


class _MockLLMResult:
    content = "relevant"


class _MockChain:
    """Giả lập một LangChain chain với độ trễ cố định."""

    async def ainvoke(self, _: Any) -> _MockLLMResult:
        await asyncio.sleep(SIMULATED_LLM_LATENCY_S)
        return _MockLLMResult()


# ── Phiên bản tuần tự (code CŨ) ──────────────────────────────────────────────

async def _sequential(chain: _MockChain, docs: list[dict]) -> list[dict]:
    """Mô phỏng vòng lặp for tuần tự — code trước khi tối ưu."""
    relevant = []
    for doc in docs:
        result = await chain.ainvoke({"query": "test", "document": doc["content"]})
        if "relevant" in result.content:
            relevant.append(doc)
    return relevant


# ── Phiên bản song song (code MỚI) ───────────────────────────────────────────

async def _evaluate_single_doc(chain: _MockChain, doc: dict) -> dict | None:
    result = await chain.ainvoke({"query": "test", "document": doc["content"]})
    return doc if "relevant" in result.content else None


async def _parallel(chain: _MockChain, docs: list[dict]) -> list[dict]:
    """Mô phỏng asyncio.gather — code sau khi tối ưu."""
    tasks = [_evaluate_single_doc(chain, doc) for doc in docs]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if isinstance(r, dict)]


# ── Hàm đo thời gian ─────────────────────────────────────────────────────────

async def _measure(fn, chain, docs, label: str, runs: int) -> list[float]:
    times = []
    for i in range(runs):
        t0 = time.perf_counter()
        result = await fn(chain, docs)
        elapsed = time.perf_counter() - t0
        times.append(elapsed)
        print(f"  [{label}] Lần {i+1}/{runs}: {elapsed*1000:.0f} ms — {len(result)} docs relevant")
    return times


# ── Main ─────────────────────────────────────────────────────────────────────

async def main() -> None:
    chain = _MockChain()
    docs = [
        {"doc_id": f"doc_{i}", "content": f"Tài liệu y tế số {i} về bệnh tiểu đường"}
        for i in range(NUM_DOCS)
    ]

    line = "─" * 60
    print(f"\n{line}")
    print(f"  BENCHMARK: CRAG Evaluator — Tuần tự vs Song Song")
    print(f"  Độ trễ mô phỏng mỗi lời gọi LLM : {SIMULATED_LLM_LATENCY_S*1000:.0f} ms")
    print(f"  Số tài liệu                       : {NUM_DOCS}")
    print(f"  Số lần đo                          : {NUM_RUNS}")
    print(f"{line}\n")

    # Đo tuần tự
    print("▶  TUẦN TỰ (code cũ):")
    seq_times = await _measure(_sequential, chain, docs, "SEQ", NUM_RUNS)

    print()

    # Đo song song
    print("▶  SONG SONG (code mới - asyncio.gather):")
    par_times = await _measure(_parallel, chain, docs, "PAR", NUM_RUNS)

    # Kết quả
    seq_avg  = mean(seq_times) * 1000
    seq_std  = stdev(seq_times) * 1000 if len(seq_times) > 1 else 0
    par_avg  = mean(par_times) * 1000
    par_std  = stdev(par_times) * 1000 if len(par_times) > 1 else 0
    speedup  = seq_avg / par_avg if par_avg > 0 else float("inf")
    saved_ms = seq_avg - par_avg

    print(f"\n{line}")
    print("  KẾT QUẢ")
    print(f"{line}")
    print(f"  Tuần tự  : {seq_avg:7.0f} ms ± {seq_std:.0f} ms")
    print(f"  Song song: {par_avg:7.0f} ms ± {par_std:.0f} ms")
    print(f"  Tăng tốc : {speedup:.1f}x  (tiết kiệm {saved_ms:.0f} ms/request)")
    print(f"{line}")

    # Kỳ vọng lý thuyết
    theoretical_seq = NUM_DOCS * SIMULATED_LLM_LATENCY_S * 1000
    theoretical_par = SIMULATED_LLM_LATENCY_S * 1000
    print(f"\n  Lý thuyết: tuần tự = {theoretical_seq:.0f} ms, song song = {theoretical_par:.0f} ms")

    # Kiểm tra pass/fail
    print()
    if par_avg < seq_avg * 0.5:
        print("  ✅  PASS — Song song nhanh hơn ít nhất 2x so với tuần tự.")
    else:
        print("  ❌  CẢNH BÁO — Mức tăng tốc thấp hơn kỳ vọng. Kiểm tra lại môi trường.")

    # Tính speedup lý thuyết thực tế
    expected_speedup = NUM_DOCS  # Lý tưởng là tăng n lần
    print(f"  ℹ️   Tăng tốc lý thuyết tối đa: {expected_speedup:.0f}x")
    print(f"  ℹ️   Tăng tốc đạt được         : {speedup:.1f}x")
    print()


if __name__ == "__main__":
    asyncio.run(main())
