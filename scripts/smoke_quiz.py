"""Kiểm nhanh đường ống sinh đề trắc nghiệm — gọi LLM thật, KHÔNG cần database.

Dùng khi: vừa đổi prompt, vừa đổi provider, hoặc vừa thay API key và muốn biết
đề sinh ra có dùng được không trước khi mở cả app lên.

    python scripts/smoke_quiz.py
    python scripts/smoke_quiz.py --so-cau 8

Script dựng thẳng một ``QuizContext`` từ đoạn nội dung mẫu bên dưới, nên nó tách
riêng phần prompt → LangChain → validator ra khỏi phần truy xuất và database.
Đề hỏng thì biết ngay lỗi nằm ở prompt chứ không phải ở ChromaDB.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.services.quiz.context import QuizContext  # noqa: E402
from src.services.quiz.generator import QuizGenerationError, generate_quiz  # noqa: E402

# Một đoạn viết theo đúng kiểu bài học trong Thư viện: có heading, có blockquote,
# có mục "Điểm cần nhớ". Giữ nguyên văn phong đó để đề sinh ra giống thật.
NOI_DUNG_MAU = """
## Vì sao cần theo dõi đường huyết tại nhà

Đường huyết là lượng đường (glucose) có trong máu. Với người bệnh đái tháo đường típ 2,
đường huyết lên xuống thất thường trong ngày, và chỉ đo ở phòng khám mỗi vài tháng thì
không thấy được bức tranh đầy đủ.

**Thời điểm đo quan trọng nhất là lúc đói buổi sáng**, trước khi ăn gì. Chỉ số này phản ánh
khả năng kiểm soát đường huyết qua đêm. Mục tiêu thường được đặt ở mức 4,4 - 7,2 mmol/L,
nhưng con số cụ thể do bác sĩ điều trị quyết định cho từng người.

Đo sau ăn 2 giờ cho biết cơ thể xử lý bữa ăn vừa rồi thế nào. Nếu chỉ số sau ăn cao hơn
nhiều so với lúc đói, điều đó gợi ý khẩu phần bữa đó nhiều tinh bột hấp thu nhanh.

> Lưu ý: ghi lại kết quả kèm thời điểm đo và bữa ăn trước đó. Cuốn sổ ghi này giúp bác sĩ
> điều chỉnh phác đồ chính xác hơn nhiều so với một con số đơn lẻ.

## Chế độ ăn chia nhỏ bữa

Thay vì ba bữa lớn, chia thành năm đến sáu bữa nhỏ giúp đường huyết không tăng vọt sau ăn.
Mỗi bữa nên có đủ chất xơ từ rau xanh, vì chất xơ làm chậm tốc độ hấp thu đường vào máu.

## Điểm cần nhớ
- Đo đường huyết lúc đói buổi sáng là chỉ số nền tảng
- Đo sau ăn 2 giờ để biết bữa ăn ảnh hưởng thế nào
- Ghi sổ kèm thời điểm và bữa ăn, không chỉ ghi con số
- Chia nhỏ bữa ăn giúp đường huyết ổn định hơn
- Chất xơ từ rau xanh làm chậm hấp thu đường
"""

# Hồ sơ người cao tuổi có bệnh đồng mắc — ca cho thấy rõ phần cá nhân hoá nhất.
HO_SO_MAU = """- Tuổi: 75
- Bệnh chính: tiểu đường típ 2
- Bệnh đồng mắc: cao huyết áp
- Người học chính là bệnh nhân.
- Lưu ý: người cao tuổi. Dùng câu chữ thật đơn giản, xưng hô 'bác'."""


async def run(so_cau: int, duong_dan_luu: str | None) -> int:
    context = QuizContext(
        topic="Theo dõi đường huyết tại nhà",
        context=NOI_DUNG_MAU,
        profile=HO_SO_MAU,
        citations=[],
        grounded=True,
    )

    try:
        questions = await generate_quiz(context, num_questions=so_cau)
    except QuizGenerationError as exc:
        print(f"\nTHAT BAI: {exc}")
        print("\nKiem lai GROQ_API_KEY / OPENAI_API_KEY trong .env, va LLM_PROVIDER dang tro vao dau.")
        return 1

    print(f"\n{'=' * 72}")
    print(f"SINH DUOC {len(questions)}/{so_cau} CAU")
    print("=" * 72)
    for q in questions:
        print(f"\nCau {q['index'] + 1} [{q['difficulty']}]: {q['question']}")
        for i, opt in enumerate(q["options"]):
            dau = " <== DUNG" if i == q["correct_index"] else ""
            print(f"   {'ABCD'[i]}. {opt}{dau}")
        print(f"   Giai thich: {q['explanation']}")

    # Những gì validator lẽ ra đã bảo đảm. In ra để mắt người kiểm thấy luôn,
    # thay vì phải tin lời log.
    print(f"\n{'=' * 72}")
    print("KIEM TRA CAU TRUC")
    print("=" * 72)
    checks = {
        "moi cau dung 4 dap an": all(len(q["options"]) == 4 for q in questions),
        "correct_index trong [0,3]": all(0 <= q["correct_index"] <= 3 for q in questions),
        "index lien mach tu 0": [q["index"] for q in questions] == list(range(len(questions))),
        "cau nao cung co giai thich": all(q["explanation"].strip() for q in questions),
        "khong co dap an trung": all(len({o.lower() for o in q["options"]}) == 4 for q in questions),
    }
    for ten, dat in checks.items():
        print(f"  [{'OK' if dat else 'FAIL'}] {ten}")

    if duong_dan_luu:
        with open(duong_dan_luu, "w", encoding="utf-8") as f:
            json.dump(questions, f, ensure_ascii=False, indent=2)
        print(f"\nDa luu: {duong_dan_luu}")

    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--so-cau", type=int, default=5, help="Số câu muốn sinh (3-10)")
    parser.add_argument("--luu", type=str, default=None, help="Đường dẫn file JSON để lưu kết quả")
    args = parser.parse_args()

    sys.exit(asyncio.run(run(args.so_cau, args.luu)))
