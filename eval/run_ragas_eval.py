#!/usr/bin/env python3
import argparse
import json
import os
import sys
import types
from pathlib import Path

# Sửa lỗi thư viện ragas 0.4.x bị lỗi import với langchain_community v0.3+
mock_vertexai = types.ModuleType("langchain_community.chat_models.vertexai")
mock_vertexai.ChatVertexAI = None
sys.modules["langchain_community.chat_models.vertexai"] = mock_vertexai

# Cố gắng load .env để lấy OPENAI_API_KEY (RAGAS cần dùng LLM để chấm điểm)
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    env_file = Path(".env")
    if env_file.exists():
        with open(env_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    k, v = line.split("=", 1)
                    if k not in os.environ:
                        os.environ[k] = v.strip().strip("'\"")


def get_agent_response(question: str) -> str:
    """
    [MÔ PHỎNG] Hàm gọi Agent của bạn.
    Thực tế bạn sẽ import Agent vào đây và gọi agent.invoke({"messages": [question]})
    """
    # Trả về chuỗi rỗng tĩnh để mô phỏng. Khi bạn code xong Agent, hãy thay bằng logic thật.
    return "Câu trả lời từ AI Agent của bạn sẽ nằm ở đây."


def run_evaluation(mock: bool = False):
    print("🚀 Khởi động RAGAS Evaluation...")

    # 1. Load data
    data_path = Path("eval/results/eval_dataset.json")
    if not data_path.exists():
        print(f"❌ Không tìm thấy file {data_path}. Hãy chạy script tạo dataset trước.")
        return

    with open(data_path, encoding="utf-8") as f:
        dataset_dict = json.load(f)

    # Nếu chưa có 'answer' (ví dụ file vừa tạo xong), ta cần chạy qua Agent để lấy answer
    if "answer" not in dataset_dict or len(dataset_dict["answer"]) == 0:
        print("🤖 Bắt đầu chạy câu hỏi qua Agent để lấy câu trả lời...")
        dataset_dict["answer"] = []
        for i, q in enumerate(dataset_dict["question"]):
            # Nếu chạy cờ --mock, ta gán luôn ground_truth làm answer để test script chạy cho nhanh & pass
            if mock:
                answer = dataset_dict["ground_truth"][i]
            else:
                answer = get_agent_response(q)
            dataset_dict["answer"].append(answer)

        # Lưu lại dataset đã có answer để lần sau không phải chạy lại Agent
        with open(data_path, "w", encoding="utf-8") as f:
            json.dump(dataset_dict, f, ensure_ascii=False, indent=2)

    # Cắt giảm số lượng test case nếu dataset quá lớn (để test script nhanh)
    # RAGAS tốn tiền API OpenAI, nên khi test script ta có thể chỉ chạy 3-5 câu
    if mock:
        print("⚠️ Chế độ MOCK: Cắt dataset xuống 3 câu để test luồng RAGAS...")
        for key in dataset_dict:
            dataset_dict[key] = dataset_dict[key][:3]

    print(f"📊 Bắt đầu chấm điểm {len(dataset_dict['question'])} câu hỏi bằng RAGAS...")

    # Tắt LangSmith để tránh lỗi 403 (Failed to POST)
    os.environ["LANGCHAIN_TRACING_V2"] = "false"

    try:
        from datasets import Dataset
        from langchain_openai import ChatOpenAI, OpenAIEmbeddings
        from ragas import evaluate
        from ragas.embeddings import LangchainEmbeddingsWrapper
        from ragas.llms import LangchainLLMWrapper
        from ragas.metrics import (
            answer_relevancy,
            context_precision,
            context_recall,
            faithfulness,
        )
    except ImportError:
        print("❌ Chưa cài đặt đủ thư viện 'ragas', 'datasets', 'langchain-openai'.")
        print("👉 Hãy chạy: .venv/bin/pip install ragas datasets langchain-openai")
        return

    if not os.environ.get("OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY").startswith("sk-your"):
        print("❌ Thiếu OPENAI_API_KEY hợp lệ trong file .env")
        print("👉 Vui lòng mở file .env và điền API key thật của OpenAI.")
        return

    # Khởi tạo LLM và Embeddings rõ ràng qua Langchain Wrapper để tránh lỗi tương thích
    evaluator_llm = LangchainLLMWrapper(ChatOpenAI(model="gpt-4o-mini"))
    evaluator_embeddings = LangchainEmbeddingsWrapper(OpenAIEmbeddings(model="text-embedding-3-small"))

    # 2. Convert to HuggingFace Dataset format required by RAGAS
    hf_dataset = Dataset.from_dict(dataset_dict)

    # 3. Define Metrics
    metrics = [
        faithfulness,
        answer_relevancy,
        context_precision,
        context_recall,
    ]

    # 4. Run Evaluate
    results = evaluate(hf_dataset, metrics=metrics, llm=evaluator_llm, embeddings=evaluator_embeddings)

    # 5. Report Results
    print("\n" + "=" * 40)
    print("📈 KẾT QUẢ ĐÁNH GIÁ (RAGAS METRICS)")
    print("=" * 40)

    metrics_report = {}
    if hasattr(results, "to_pandas"):
        df = results.to_pandas()
        for col in df.columns:
            if df[col].dtype in ["float64", "float32"] and col not in [
                "question",
                "answer",
                "contexts",
                "ground_truth",
            ]:
                val = df[col].mean()
                print(f" - {col}: {val:.3f}")
                metrics_report[col] = val
    elif hasattr(results, "items"):
        for metric, value in results.items():
            print(f" - {metric}: {value:.3f}")
            metrics_report[metric] = value
    else:
        print("Không thể parse kết quả từ RAGAS.")

    # Generate Markdown Report (Deliverable 10)
    report_path = Path("eval/results/report.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# Evaluation Evidence — Team XXX\n\n")
        f.write("## 1. RAG Quality Metrics (RAGAS)\n\n")
        f.write("| Metric | Score | Benchmark |\n")
        f.write("|--------|-------|-----------|\n")
        for metric, value in metrics_report.items():
            status = "✅ PASS" if value >= 0.7 else "❌ FAIL"
            f.write(f"| {metric} | {value:.2f} | > 0.7 ({status}) |\n")
        f.write("\n*(Báo cáo được tạo tự động bởi eval/run_ragas_eval.py)*\n")

    print(f"\n✅ Đã xuất báo cáo tại: {report_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mock", action="store_true", help="Chạy chế độ giả lập answer và chỉ đánh giá 3 câu đầu để tiết kiệm token."
    )
    args = parser.parse_args()

    run_evaluation(mock=args.mock)
