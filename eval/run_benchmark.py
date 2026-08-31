#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path


def main():
    print("========================================")
    print("🏆 BẮT ĐẦU CHẠY BENCHMARK TOÀN DIỆN")
    print("========================================")

    # 1. Generate Dataset
    print("\n[1/4] Khởi tạo Dataset...")
    subprocess.run([sys.executable, "eval/create_eval_dataset.py"], check=True)

    # 2. Run Baselines
    print("\n[2/4] Chạy Baseline 1 (Direct LLM) & Baseline 2 (Naive RAG)...")
    subprocess.run([sys.executable, "eval/run_baselines.py"], check=True)

    # 3. Run Agent and evaluate with Ragas
    print("\n[3/4] Chạy LangGraph Agent và đánh giá RAGAS...")
    subprocess.run([sys.executable, "eval/run_ragas_eval.py"], check=True)

    # 4. Run Custom LLM Judge (Guardrails & Format)
    print("\n[4/5] Chạy Custom LLM Judge (đánh giá Guardrails)...")
    subprocess.run([sys.executable, "eval/run_custom_eval.py"], check=True)

    # 5. Generate Combined Report
    print("\n[5/5] Đang tổng hợp báo cáo Benchmark...")
    data_path = Path("eval/results/eval_dataset.json")
    if not data_path.exists():
        print("Không tìm thấy kết quả để báo cáo.")
        return

    report_path = Path("eval/results/benchmark_report.md")
    ragas_report_path = Path("eval/results/report.md")
    custom_report_path = Path("eval/results/custom_report.md")

    ragas_content = "Chưa có kết quả đánh giá RAGAS."
    if ragas_report_path.exists():
        with open(ragas_report_path, encoding="utf-8") as f:
            ragas_content = f.read()

    custom_content = "Chưa có kết quả đánh giá Custom Judge."
    if custom_report_path.exists():
        with open(custom_report_path, encoding="utf-8") as f:
            custom_content = f.read()

    # Get a sample question and answers
    sample_comparison = ""
    try:
        with open(data_path, encoding="utf-8") as f:
            dataset = json.load(f)

        with open("eval/results/eval_dataset_baselines.json", encoding="utf-8") as f:
            baseline_data = json.load(f)

        if len(dataset.get("question", [])) > 0:
            q = dataset["question"][0]
            gt = dataset["ground_truth"][0]
            ans_agent = dataset["answer"][0] if "answer" in dataset and len(dataset["answer"]) > 0 else "N/A"
            ans_b1 = baseline_data["answer_baseline_1"][0] if "answer_baseline_1" in baseline_data else "N/A"
            ans_b2 = baseline_data["answer_baseline_2"][0] if "answer_baseline_2" in baseline_data else "N/A"

            sample_comparison = f"""
### Mẫu so sánh (Câu hỏi 1)
**Câu hỏi:** {q}
**Ground Truth:** {gt}

**Baseline 1 (Direct LLM):**
> {ans_b1}

**Baseline 2 (Naive RAG):**
> {ans_b2}

**Proposed Agent (LangGraph):**
> {ans_agent}
"""
    except Exception as e:
        sample_comparison = f"Không thể tạo mẫu so sánh: {e}"

    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# 🏆 Báo cáo Benchmark Hệ Thống Medical AI\n\n")
        f.write("Báo cáo so sánh chất lượng giữa các hệ thống (Baseline vs Proposed Agent).\n\n")
        f.write("## 1. Hệ thống thử nghiệm\n")
        f.write("- **Baseline 1 (Direct LLM)**: LLM thuần, không dùng tài liệu y tế.\n")
        f.write("- **Baseline 2 (Naive RAG)**: Trích xuất vector cơ bản, đưa vào LLM, không kiểm duyệt.\n")
        f.write("- **Proposed Agent (LangGraph)**: Hệ thống RAG cá nhân hoá + Intent Router + Self-RAG Verifier.\n\n")

        f.write("## 2. Kết quả đánh giá RAGAS (Chỉ áp dụng cho câu hỏi Kiến thức)\n")
        f.write(ragas_content + "\n\n")

        f.write("## 3. Kết quả đánh giá Custom Judge (Đánh giá Guardrails toàn bộ Dataset)\n")
        f.write(custom_content + "\n\n")

        f.write("## 4. So sánh trực quan\n")
        f.write(sample_comparison + "\n")

        f.write(
            "\n*(Vui lòng xem file `eval/results/eval_dataset.json` và `eval/results/eval_dataset_baselines.json` để xem toàn bộ 50 câu trả lời của 3 hệ thống)*\n"
        )

    print(f"\n✅ Đã hoàn thành Benchmark! Xem kết quả tổng hợp tại: {report_path}")


if __name__ == "__main__":
    main()
