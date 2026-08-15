#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path

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


def run_custom_evaluation(mock: bool = False):
    print("🚀 Khởi động Custom LLM-as-a-Judge Evaluation...")

    data_path = Path("eval/results/eval_dataset.json")
    if not data_path.exists():
        print(f"❌ Không tìm thấy file {data_path}. Hãy chạy create_eval_dataset.py trước.")
        return

    with open(data_path, encoding="utf-8") as f:
        dataset_dict = json.load(f)

    if "answer" not in dataset_dict or len(dataset_dict["answer"]) == 0:
        print(
            "❌ Dataset chưa có cột 'answer'. Vui lòng chạy eval/run_ragas_eval.py trước để Agent sinh ra câu trả lời."
        )
        if mock:
            print("⚠️ Chế độ MOCK: Dùng tạm ground_truth làm answer để test script.")
            dataset_dict["answer"] = dataset_dict["ground_truth"]
        else:
            return

    try:
        from langchain_openai import ChatOpenAI
        from pydantic import BaseModel, Field
    except ImportError:
        print("❌ Chưa cài đặt đủ thư viện 'langchain-openai', 'pydantic'.")
        print("👉 Hãy chạy: pip install langchain-openai pydantic")
        return

    if not os.environ.get("OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY").startswith("sk-your"):
        print("❌ Thiếu OPENAI_API_KEY hợp lệ trong file .env")
        return

    os.environ["LANGCHAIN_TRACING_V2"] = "false"

    class EvaluationResult(BaseModel):
        has_citation: int = Field(
            description="1 nếu câu trả lời CÓ trích dẫn nguồn (footnote/link/tên tài liệu). 0 nếu không có."
        )
        has_next_questions: int = Field(
            description="1 nếu câu trả lời CÓ gợi ý 3 câu hỏi tái khám/câu hỏi liên quan ở cuối. 0 nếu không có."
        )
        has_disclaimer: int = Field(
            description="1 nếu câu trả lời CÓ chứa câu miễn trừ trách nhiệm y tế (VD: Thông tin mang tính giáo dục, không thay thế tư vấn...). 0 nếu không."
        )
        tone_score: int = Field(
            description="Điểm từ 1 đến 5 đánh giá giọng điệu thấu cảm, dễ hiểu, lịch sự và không hù dọa bệnh nhân (5 là xuất sắc)."
        )
        reasoning: str = Field(description="Giải thích ngắn gọn lý do chấm điểm.")

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    structured_llm = llm.with_structured_output(EvaluationResult)

    questions = dataset_dict["question"]
    answers = dataset_dict["answer"]

    if mock:
        print("⚠️ Chế độ MOCK: Chỉ đánh giá 3 câu đầu để tiết kiệm token.")
        questions = questions[:3]
        answers = answers[:3]

    print(f"📊 Bắt đầu chấm {len(questions)} câu hỏi theo định dạng PRD...")

    total_citation = 0
    total_next_q = 0
    total_disclaimer = 0
    total_tone = 0

    results_log = []

    for i, (q, a) in enumerate(zip(questions, answers)):
        prompt = f"""
        Bạn là giám khảo đánh giá chất lượng câu trả lời của AI Y tế theo tiêu chuẩn khắt khe.
        Hãy đọc Câu hỏi và Câu trả lời dưới đây, sau đó chấm điểm dựa trên các tiêu chí.

        Câu hỏi: {q}
        Câu trả lời: {a}
        """
        try:
            eval_res = structured_llm.invoke(prompt)
            total_citation += eval_res.has_citation
            total_next_q += eval_res.has_next_questions
            total_disclaimer += eval_res.has_disclaimer
            total_tone += eval_res.tone_score

            results_log.append(
                {
                    "question": q,
                    "scores": {
                        "citation": eval_res.has_citation,
                        "next_questions": eval_res.has_next_questions,
                        "disclaimer": eval_res.has_disclaimer,
                        "tone": eval_res.tone_score,
                    },
                    "reasoning": eval_res.reasoning,
                }
            )
        except Exception as e:
            print(f"Lỗi khi chấm câu {i + 1}: {e}")
            continue

    num_evals = len(results_log)
    if num_evals == 0:
        print("Không có kết quả nào được chấm.")
        return

    avg_citation = total_citation / num_evals
    avg_next_q = total_next_q / num_evals
    avg_disclaimer = total_disclaimer / num_evals
    avg_tone = total_tone / num_evals

    print("\n" + "=" * 40)
    print("📈 KẾT QUẢ ĐÁNH GIÁ (CUSTOM LLM JUDGE)")
    print("=" * 40)
    print(f" - Citation Compliance: {avg_citation:.2%} (Mục tiêu: 100%)")
    print(f" - Next-best Questions: {avg_next_q:.2%} (Mục tiêu: > 80%)")
    print(f" - Disclaimer Included: {avg_disclaimer:.2%} (Mục tiêu: 100%)")
    print(f" - Tone & Empathy Score: {avg_tone:.2f}/5.0 (Mục tiêu: > 4.5)")

    # Generate Markdown Report
    os.makedirs("eval/results", exist_ok=True)
    report_path = Path("eval/results/custom_report.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# Evaluation Evidence — Custom LLM Judge\n\n")
        f.write("## 2. Business Formatting & Tone Metrics\n\n")
        f.write("| Metric | Score | Target | Status |\n")
        f.write("|--------|-------|--------|--------|\n")
        f.write(
            f"| Citation Compliance | {avg_citation:.2%} | 100% | {'✅ PASS' if avg_citation == 1 else '❌ FAIL'} |\n"
        )
        f.write(
            f"| Next-best Questions | {avg_next_q:.2%} | > 80% | {'✅ PASS' if avg_next_q >= 0.8 else '❌ FAIL'} |\n"
        )
        f.write(f"| Disclaimer | {avg_disclaimer:.2%} | 100% | {'✅ PASS' if avg_disclaimer == 1 else '❌ FAIL'} |\n")
        f.write(f"| Tone & Empathy | {avg_tone:.2f}/5.0 | > 4.5 | {'✅ PASS' if avg_tone >= 4.5 else '❌ FAIL'} |\n")
        f.write("\n*(Báo cáo được tạo tự động bởi eval/run_custom_eval.py)*\n")

    print(f"\n✅ Đã xuất báo cáo tại: {report_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mock", action="store_true", help="Chạy chế độ giả lập đánh giá 3 câu đầu để tiết kiệm token."
    )
    args = parser.parse_args()

    run_custom_evaluation(mock=args.mock)
