import json
import os
from pathlib import Path


def create_eval_dataset():
    """
    Tạo evaluation dataset dựa trên file raw_test_cases.json.
    Giúp dễ dàng mở rộng (scale) lên hàng trăm câu hỏi từ các nguồn khác nhau.
    """
    dataset = {"question": [], "contexts": [], "ground_truth": [], "category": []}

    raw_file = Path("eval/data/raw_test_cases.json")
    if not raw_file.exists():
        print(f"Không tìm thấy file {raw_file}")
        return

    with open(raw_file, encoding="utf-8") as f:
        test_cases = json.load(f)

    for tc in test_cases:
        dataset["question"].append(tc["question"])
        dataset["contexts"].append(tc["contexts"])
        dataset["ground_truth"].append(tc["ground_truth"])
        dataset["category"].append(tc.get("category", "unknown"))

    os.makedirs("eval/results", exist_ok=True)
    out_path = "eval/results/eval_dataset.json"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)

    print(f"Đã đọc từ file raw và tạo dataset thành công tại {out_path} với {len(test_cases)} test cases.")


if __name__ == "__main__":
    create_eval_dataset()
