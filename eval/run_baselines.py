#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

# Thêm đường dẫn project vào sys.path để import
sys.path.append(str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()

try:
    from langchain_core.messages import HumanMessage, SystemMessage

    from src.rag.store import VectorStore
    from src.services.llm.factory import get_llm
except ImportError:
    print("❌ Lỗi import. Hãy chắc chắn bạn đang chạy script này từ thư mục gốc của project.")
    sys.exit(1)


def run_baseline_1(query: str, patient_profile: dict) -> str:
    """Baseline 1: Direct LLM - Không RAG, không nhúng hồ sơ (hoặc nhúng rất cơ bản)."""
    llm = get_llm()
    # Để công bằng, baseline vẫn nên biết một chút về người dùng nếu họ hỏi thông tin cá nhân.
    profile_text = ""
    if patient_profile:
        profile_text = f"Thông tin bệnh nhân: {patient_profile}"

    prompt = f"""Bạn là trợ lý tư vấn sức khoẻ.
{profile_text}
Hãy trả lời câu hỏi sau của người dùng.
Câu hỏi: {query}"""

    messages = [SystemMessage(content="Bạn là một trợ lý ảo về sức khỏe."), HumanMessage(content=prompt)]
    response = llm.invoke(messages)
    return str(response.content)


def run_baseline_2(query: str, patient_profile: dict) -> str:
    """Baseline 2: Naive RAG - Tìm kiếm vector thuần túy, đưa vào context cho LLM."""
    llm = get_llm()
    store = VectorStore()

    # 1. Tìm kiếm tài liệu
    disease_filter = None
    if patient_profile and isinstance(patient_profile.get("diseases"), list):
        disease_filter = patient_profile["diseases"]

    hits = store.search(query=query, disease=disease_filter, top_k=5)

    context = "\n\n".join([f"Tài liệu {i + 1}: {hit.text}" for i, hit in enumerate(hits)])

    profile_text = ""
    if patient_profile:
        profile_text = f"Thông tin bệnh nhân: {patient_profile}"

    prompt = f"""Bạn là trợ lý tư vấn sức khoẻ. Dựa vào NGỮ CẢNH dưới đây, hãy trả lời câu hỏi của người dùng.
Nếu ngữ cảnh không có thông tin, hãy nói bạn không biết.

NGỮ CẢNH:
{context}

{profile_text}
Câu hỏi: {query}"""

    messages = [
        SystemMessage(content="Bạn là trợ lý y khoa. Chỉ trả lời dựa vào ngữ cảnh được cung cấp."),
        HumanMessage(content=prompt),
    ]
    response = llm.invoke(messages)
    return str(response.content)


def main(mock: bool = False):
    print("🚀 Bắt đầu chạy Baselines Evaluation...")
    data_path = Path("eval/results/eval_dataset.json")
    if not data_path.exists():
        print(f"❌ Không tìm thấy {data_path}. Chạy create_eval_dataset.py trước.")
        return

    with open(data_path, encoding="utf-8") as f:
        dataset = json.load(f)

    questions = dataset["question"]
    profiles = dataset.get("patient_profile", [{}] * len(questions))

    if mock:
        print("⚠️ Chế độ MOCK: Chỉ chạy 3 test cases đầu tiên.")
        questions = questions[:3]
        profiles = profiles[:3]

    ans_baseline1 = []
    ans_baseline2 = []

    for i, (q, p) in enumerate(zip(questions, profiles)):
        print(f"[{i + 1}/{len(questions)}] Đang xử lý: {q[:50]}...")
        try:
            b1 = run_baseline_1(q, p)
            ans_baseline1.append(b1)
        except Exception as e:
            print(f"Lỗi Baseline 1 câu {i}: {e}")
            ans_baseline1.append(f"ERROR: {e}")

        try:
            b2 = run_baseline_2(q, p)
            ans_baseline2.append(b2)
        except Exception as e:
            print(f"Lỗi Baseline 2 câu {i}: {e}")
            ans_baseline2.append(f"ERROR: {e}")

    dataset["answer_baseline_1"] = ans_baseline1
    dataset["answer_baseline_2"] = ans_baseline2

    out_path = Path("eval/results/eval_dataset_baselines.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)

    print(f"✅ Đã chạy xong Baselines và lưu kết quả vào {out_path}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mock", action="store_true", help="Chạy chế độ mock (3 cases)")
    args = parser.parse_args()
    main(mock=args.mock)
