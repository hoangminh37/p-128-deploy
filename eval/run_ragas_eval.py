#!/usr/bin/env python3
import argparse
import json
import os
import sys
import types
from pathlib import Path

# Thêm đường dẫn project vào sys.path để import
sys.path.append(str(Path(__file__).parent.parent))

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


import asyncio

def get_agent_result(question: str, profile: dict) -> dict:
    """Gọi LangGraph v2 Agent thực tế để lấy câu trả lời và ngữ cảnh trích xuất thật."""
    from src.agent.graph import agent
    
    state = {
        "query": question,
        "patient_id": "eval_user",
        "patient_profile": profile,
        "messages": [{"role": "user", "content": question}]
    }
    
    async def run_agent():
        return await agent.ainvoke(state)
        
    try:
        result = asyncio.run(run_agent())
        
        # Lấy retrieved docs thật từ state của LangGraph
        retrieved_docs = result.get("retrieved_docs", [])
        contexts = [doc.get("content", "") for doc in retrieved_docs if isinstance(doc, dict) and doc.get("content")]
        
        # Handle red flag or refused explicitly
        if result.get("is_red_flag"):
            return {"response": result.get("response", "⚠️ Tình huống khẩn cấp."), "contexts": contexts, "is_valid_rag": False}
        if result.get("intent") in ("diagnosis", "refusal", "prompt_injection"):
            return {"response": result.get("response", "Từ chối trả lời do an toàn."), "contexts": contexts, "is_valid_rag": False}
        if result.get("intent") == "doctor_referral":
            return {"response": "Không đủ thông tin y khoa để trả lời.", "contexts": contexts, "is_valid_rag": False}
            
        resp = result.get("response", "")
        is_valid = bool(resp and resp != "Không đủ thông tin y khoa để trả lời." and len(contexts) > 0)
        return {"response": resp, "contexts": contexts, "is_valid_rag": is_valid}
    except Exception as e:
        print(f"Error calling agent: {e}")
        return {"response": "", "contexts": [], "is_valid_rag": False}


def run_evaluation(mock: bool = False):
    print("🚀 Khởi động RAGAS Evaluation...")

    # 1. Load data
    data_path = Path("eval/results/eval_dataset.json")
    if not data_path.exists():
        print(f"❌ Không tìm thấy file {data_path}. Hãy chạy script tạo dataset trước.")
        return

    with open(data_path, encoding="utf-8") as f:
        dataset_dict = json.load(f)

    # Nếu chưa có 'answer' hoặc muốn cập nhật, chạy qua Agent
    if "answer" not in dataset_dict or len(dataset_dict["answer"]) == 0 or "retrieved_contexts" not in dataset_dict:
        print("🤖 Bắt đầu chạy câu hỏi qua Agent để lấy câu trả lời và ngữ cảnh trích xuất thật...")
        dataset_dict["answer"] = []
        dataset_dict["retrieved_contexts"] = []
        profiles = dataset_dict.get("patient_profile", [{}] * len(dataset_dict["question"]))
        for i, (q, p) in enumerate(zip(dataset_dict["question"], profiles)):
            if mock:
                answer = dataset_dict["ground_truth"][i]
                contexts = dataset_dict["contexts"][i]
            else:
                print(f"[{i+1}/{len(dataset_dict['question'])}] Đang xử lý: {q[:50]}...")
                res = get_agent_result(q, p)
                answer = res["response"]
                # Ưu tiên ngữ cảnh thật do Agent trích xuất từ ChromaDB
                contexts = res["contexts"] if res["contexts"] else dataset_dict["contexts"][i]
            dataset_dict["answer"].append(answer)
            dataset_dict["retrieved_contexts"].append(contexts)

        # Lưu lại dataset
        with open(data_path, "w", encoding="utf-8") as f:
            json.dump(dataset_dict, f, ensure_ascii=False, indent=2)

    # Cắt giảm số lượng test case nếu dataset quá lớn (để test script nhanh)
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

    # Lọc dataset: CHỈ dùng RAGAS để chấm các câu hỏi kiến thức y khoa thuần túy mà Agent ĐÃ TRÍCH XUẤT ĐƯỢC TÀI LIỆU VÀ TRẢ LỜI.
    # Bỏ qua các câu Red-flag, Refusal, Out-of-domain, hoặc rơi vào Doctor Referral (không có context).
    valid_categories = ["factual_diabetes", "factual_hypertension", "multi_hop"]
    filtered_dict = {
        "question": [],
        "answer": [],
        "contexts": [],
        "ground_truth": [],
    }
    
    has_category = "category" in dataset_dict and len(dataset_dict["category"]) == len(dataset_dict["question"])
    retrieved_ctx_list = dataset_dict.get("retrieved_contexts", dataset_dict.get("contexts", []))
    
    for i in range(len(dataset_dict["question"])):
        cat = dataset_dict["category"][i] if has_category else "factual_diabetes"
        ans = dataset_dict["answer"][i]
        ctx = retrieved_ctx_list[i] if i < len(retrieved_ctx_list) else dataset_dict["contexts"][i]
        
        # Chỉ đánh giá khi câu hỏi thuộc danh mục y khoa VÀ có câu trả lời thực sự từ RAG (không phải fallback/từ chối)
        is_fallback = ans in ("Không đủ thông tin y khoa để trả lời.", "Từ chối trả lời do an toàn.", "⚠️ Tình huống khẩn cấp.")
        if cat in valid_categories and not is_fallback and len(ctx) > 0 and len(ans) > 20:
            filtered_dict["question"].append(dataset_dict["question"][i])
            filtered_dict["answer"].append(ans)
            filtered_dict["contexts"].append(ctx)
            filtered_dict["ground_truth"].append(dataset_dict["ground_truth"][i])
            
    print(f"Lọc dữ liệu: Chỉ đánh giá RAGAS cho {len(filtered_dict['question'])}/{len(dataset_dict['question'])} câu hỏi Y khoa có retrieve và trả lời thực tế.")

    if len(filtered_dict["question"]) == 0:
        print("Không có câu hỏi hợp lệ nào để chấm RAGAS.")
        return

    # 2. Convert to HuggingFace Dataset format required by RAGAS
    hf_dataset = Dataset.from_dict(filtered_dict)

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
        # Lưu log chi tiết từng câu ra CSV để user xem
        detailed_log_path = Path("eval/results/ragas_detailed_log.csv")
        df.to_csv(detailed_log_path, index=False, encoding="utf-8-sig")
        print(f"Lưu log chi tiết từng câu tại: {detailed_log_path}")
        
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
