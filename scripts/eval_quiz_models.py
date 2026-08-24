"""So sánh chất lượng đề trắc nghiệm giữa nhiều model — trả lời "đổi model có tốt hơn không".

    # So các model Groq đang có
    python scripts/eval_quiz_models.py

    # So model Groq với model OpenRouter trong CÙNG một bảng
    # (xem giá trước: python scripts/list_openrouter_models.py)
    python scripts/eval_quiz_models.py --models openai/gpt-oss-120b \
        --openrouter deepseek/deepseek-v4-flash qwen/qwen3-235b-a22b-2507

    # Groq hết hạn mức thì chuyển trọng tài sang provider khác.
    # Giữ NGUYÊN một trọng tài cho cả bảng — đổi giữa chừng là so bằng hai thước.
    python scripts/eval_quiz_models.py --openrouter openai/gpt-oss-120b \
        --trong-tai-provider openrouter

HAI TẦNG CHẤM, CỐ Ý TÁCH RỜI:

1. **Cấu trúc** — chạy chính ``validate_quiz`` của production. Thuần luật, không
   tốn token, kết quả y hệt nhau mỗi lần. Model nào hay sinh đề hỏng lộ ra ngay.

2. **Sư phạm** — LLM-as-a-Judge, cùng khuôn với ``eval/run_custom_eval.py``.
   Chấm bốn thứ mà luật không đo được: có bám trích đoạn không, có đúng MỘT đáp
   án đúng không, có hỏi HIỂU hay chỉ hỏi thuộc lòng, và câu chữ có vừa sức
   người bệnh không.

VÌ SAO CẦN TẦNG 2: đề sai kiểu nguy hiểm nhất vẫn qua được tầng 1. Câu
"Phương pháp nào dùng khi bệnh nhân có CAD đa mạch? A. PCI B. CABG" có đủ 4 đáp
án, không trùng, correct_index hợp lệ — nhưng là câu hỏi trình độ bác sĩ, hỏi
một cụ 75 tuổi, bằng từ viết tắt tiếng Anh. Chỉ có tầng 2 bắt được.

Trọng tài luôn là MỘT model cố định cho mọi thí sinh, nếu không thì đang so
bằng những cái thước khác nhau.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
from dataclasses import dataclass, field

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover
    pass

# Trace của LangSmith không giúp gì cho việc chấm, mà key hỏng thì spam stderr
# tới mức lấp mất bảng kết quả. Phải GÁN ĐÈ chứ không dùng setdefault:
# load_dotenv() ở trên đã đặt biến này thành "true" từ .env rồi, nên setdefault
# sẽ không có tác dụng gì. Cùng cách mà eval/run_custom_eval.py đang làm.
os.environ["LANGCHAIN_TRACING_V2"] = "false"

from pydantic import BaseModel, Field  # noqa: E402

from src.core.exceptions import LLMError  # noqa: E402
from src.services.quiz.context import QuizContext  # noqa: E402
from src.services.quiz.generator import QuizGenerationError, generate_quiz  # noqa: E402

#: Model làm trọng tài. Cố định cho mọi thí sinh để phép so công bằng.
JUDGE_MODEL = "openai/gpt-oss-120b"

#: Số câu xin mỗi lượt và số lượt chạy mỗi model. Chạy nhiều lượt vì LLM không
#: tất định — một lượt may mắn không nói lên điều gì.
QUESTIONS_PER_RUN = 5
RUNS_PER_MODEL = 3


# ── Bộ đề bài chấm ───────────────────────────────────────────────────────────

FIXTURES: list[dict] = [
    {
        "ten": "bài học dày, người cao tuổi",
        "topic": "Theo dõi đường huyết tại nhà",
        "profile": (
            "- Tuổi: 75\n- Bệnh chính: tiểu đường típ 2\n- Bệnh đồng mắc: cao huyết áp\n"
            "- Người học chính là bệnh nhân.\n"
            "- Lưu ý: người cao tuổi. Dùng câu chữ thật đơn giản, xưng hô 'bác'."
        ),
        "context": (
            "## Vì sao cần theo dõi đường huyết tại nhà\n\n"
            "Đường huyết là lượng đường (glucose) trong máu. Với người đái tháo đường típ 2, "
            "đường huyết lên xuống thất thường trong ngày.\n\n"
            "**Thời điểm đo quan trọng nhất là lúc đói buổi sáng**, trước khi ăn gì. Chỉ số này "
            "phản ánh khả năng kiểm soát đường huyết qua đêm. Mục tiêu thường đặt ở 4,4 - 7,2 mmol/L, "
            "nhưng con số cụ thể do bác sĩ điều trị quyết định.\n\n"
            "Đo sau ăn 2 giờ cho biết cơ thể xử lý bữa ăn thế nào. Nếu chỉ số sau ăn cao hơn nhiều "
            "so với lúc đói, điều đó gợi ý bữa đó nhiều tinh bột hấp thu nhanh.\n\n"
            "## Chế độ ăn chia nhỏ bữa\n\n"
            "Chia thành năm đến sáu bữa nhỏ giúp đường huyết không tăng vọt sau ăn. Mỗi bữa cần đủ "
            "chất xơ từ rau xanh, vì chất xơ làm chậm tốc độ hấp thu đường vào máu."
        ),
    },
    {
        "ten": "ngữ cảnh mỏng, người chăm sóc",
        "topic": "Muối và huyết áp",
        "profile": (
            "- Tuổi: 42\n- Bệnh chính: cao huyết áp\n- Bệnh đồng mắc: không có\n"
            "- Người học là NGƯỜI CHĂM SÓC, không phải bệnh nhân. Đặt câu hỏi ở góc nhìn chăm sóc."
        ),
        # Cố tình ngắn: đây là ca hay làm model yếu bịa thêm cho đủ số câu.
        "context": (
            "Ăn nhạt là biện pháp nền tảng cho người tăng huyết áp. Khuyến cáo dùng dưới 5 gam muối "
            "mỗi ngày, tương đương khoảng một thìa cà phê gạt ngang. Nguồn muối lớn nhất trong bữa ăn "
            "người Việt không phải muối rắc thêm mà là nước mắm, nước tương, mì chính và thực phẩm chế biến sẵn."
        ),
    },
    {
        "ten": "trích đoạn có bẫy kê đơn",
        "topic": "Thuốc hạ đường huyết đường uống",
        "profile": (
            "- Tuổi: 58\n- Bệnh chính: tiểu đường típ 2\n- Bệnh đồng mắc: không có\n"
            "- Người học chính là bệnh nhân."
        ),
        # Trích đoạn có tên thuốc và liều. Model tốt phải hỏi về KIẾN THỨC
        # (vì sao uống cùng bữa ăn) chứ không hỏi "nên uống thuốc nào, liều bao nhiêu".
        "context": (
            "Metformin là thuốc thường được lựa chọn đầu tiên cho người đái tháo đường típ 2. "
            "Thuốc hoạt động bằng cách giảm lượng đường gan sản xuất và giúp cơ thể sử dụng insulin "
            "hiệu quả hơn. Tác dụng phụ hay gặp nhất là rối loạn tiêu hoá, thường giảm dần sau vài tuần. "
            "Uống thuốc cùng hoặc ngay sau bữa ăn giúp hạn chế tác dụng phụ này. "
            "Việc lựa chọn thuốc và liều dùng hoàn toàn do bác sĩ điều trị quyết định dựa trên "
            "chức năng thận, cân nặng và các bệnh kèm theo của từng người."
        ),
    },
]


def _fixture_context(fixture: dict) -> QuizContext:
    """Bọc fixture thành QuizContext để đưa vào hàm production."""
    return QuizContext(
        topic=fixture["topic"],
        context=fixture["context"],
        profile=fixture["profile"],
        citations=[],
        grounded=True,
    )


# ── Trọng tài ────────────────────────────────────────────────────────────────


class JudgeResult(BaseModel):
    """Điểm sư phạm cho một bộ đề."""

    grounded: int = Field(
        description="Số câu mà CẢ câu hỏi lẫn đáp án đúng đều suy ra được từ trích đoạn, không bịa thêm."
    )
    one_correct: int = Field(
        description="Số câu có đúng MỘT đáp án đúng. Câu có hai đáp án cùng đúng thì KHÔNG tính."
    )
    tests_understanding: int = Field(
        description="Số câu kiểm tra HIỂU (vì sao, khi nào, tình huống). Câu chỉ hỏi thuộc lòng con số hay tên gọi thì KHÔNG tính."
    )
    patient_appropriate: int = Field(
        description="Số câu vừa sức người bệnh: không dùng từ viết tắt tiếng Anh chưa giải thích, không hỏi quyết định chuyên môn của bác sĩ, xưng hô đúng hồ sơ."
    )
    nhan_xet: str = Field(description="Một câu tiếng Việt nêu điểm yếu rõ nhất của bộ đề này.")


JUDGE_PROMPT = """Bạn chấm chất lượng một bộ đề trắc nghiệm giáo dục sức khoẻ dành cho người bệnh mãn tính.

HỒ SƠ NGƯỜI HỌC:
{profile}

TRÍCH ĐOẠN TÀI LIỆU (nguồn duy nhất đề được phép dựa vào):
{context}

BỘ ĐỀ CẦN CHẤM (tổng {n} câu):
{quiz}

Đếm chính xác, không ước lượng. Mỗi chỉ số là SỐ CÂU đạt, từ 0 đến {n}.
Nghiêm khắc: một câu hỏi trình độ bác sĩ (chọn phương pháp điều trị, đọc chỉ số
chuyên khoa) hoặc dùng từ viết tắt tiếng Anh chưa giải thích thì KHÔNG đạt
patient_appropriate, dù nó có nằm trong trích đoạn.

Trả về DUY NHẤT một đối tượng JSON, không kèm chữ nào khác, theo đúng dạng:
{{"grounded": <số>, "one_correct": <số>, "tests_understanding": <số>,
  "patient_appropriate": <số>, "nhan_xet": "<một câu tiếng Việt>"}}"""


@dataclass
class ModelScore:
    """Điểm gộp của một model qua nhiều lượt và nhiều fixture."""

    ten: str
    cau_yeu_cau: int = 0
    cau_hop_le: int = 0
    loi_goi: int = 0
    loi_kiem_dinh: int = 0
    loi_han_muc: int = 0
    do_tre_ms: list[int] = field(default_factory=list)
    grounded: int = 0
    one_correct: int = 0
    understanding: int = 0
    appropriate: int = 0
    cau_da_cham: int = 0
    nhan_xet: list[str] = field(default_factory=list)

    def ty_le(self, tu_so: int) -> float:
        return 100.0 * tu_so / self.cau_da_cham if self.cau_da_cham else 0.0


def _llm(model_id: str, provider: str):
    """Dựng LLM cho một model cụ thể, KHÔNG đi qua LLM_PROVIDER trong .env.

    Cố ý không dùng ``get_llm()`` của production: ở đây mỗi thí sinh là một cặp
    (provider, model) do dòng lệnh chỉ định, còn ``get_llm`` luôn đọc model từ
    cấu hình chung nên mọi thí sinh sẽ nhận cùng một id.
    """
    from src.core.config import get_settings

    settings = get_settings()

    if provider == "groq":
        if not settings.groq_api_key:
            raise LLMError("groq", "GROQ_API_KEY chưa đặt")
        from langchain_groq import ChatGroq

        return ChatGroq(model=model_id, api_key=settings.groq_api_key, temperature=0.3)

    if provider == "openrouter":
        if not settings.openrouter_api_key:
            raise LLMError("openrouter", "OPENROUTER_API_KEY chưa đặt")
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=model_id,
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
            temperature=0.3,
        )

    if not settings.openai_api_key:
        raise LLMError("openai", "OPENAI_API_KEY chưa đặt")
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(model=model_id, api_key=settings.openai_api_key, temperature=0.3)


def _format_quiz(questions: list[dict]) -> str:
    dong = []
    for q in questions:
        dong.append(f"Câu {q['index'] + 1}: {q['question']}")
        for j, o in enumerate(q["options"]):
            dau = " (ĐÁP ÁN ĐÚNG)" if j == q["correct_index"] else ""
            dong.append(f"   {'ABCD'[j]}. {o}{dau}")
        dong.append(f"   Giải thích: {q['explanation']}")
    return "\n".join(dong)


async def _cham_mot_luot(judge, fixture: dict, questions: list[dict]) -> JudgeResult | None:
    try:
        return await judge.ainvoke(
            JUDGE_PROMPT.format(
                profile=fixture["profile"],
                context=fixture["context"],
                quiz=_format_quiz(questions),
                n=len(questions),
            )
        )
    except Exception as exc:
        print(f"      (trọng tài lỗi: {exc})")
        return None


async def do_mot_model(model_id: str, provider: str, judge) -> ModelScore:
    import time

    diem = ModelScore(ten=f"{model_id}")

    try:
        llm = _llm(model_id, provider)
    except Exception as exc:
        print(f"  Không khởi tạo được: {exc}")
        diem.loi_goi = RUNS_PER_MODEL * len(FIXTURES)
        return diem

    for fixture in FIXTURES:
        for lan in range(1, RUNS_PER_MODEL + 1):
            diem.cau_yeu_cau += QUESTIONS_PER_RUN
            print(f"    {fixture['ten']} · lượt {lan}/{RUNS_PER_MODEL} ... ", end="", flush=True)

            bat_dau = time.time()
            try:
                # Gọi THẲNG hàm production, không dựng chain riêng. Nhờ vậy bảng
                # này đo đúng thứ người dùng gặp: vòng lui tool-calling ->
                # json_mode, số lần retry, ngưỡng câu tối thiểu, và cả validator.
                hop_le = await generate_quiz(
                    _fixture_context(fixture), QUESTIONS_PER_RUN, llm=llm
                )
            except Exception as exc:
                text = str(exc)
                if "429" in text or "rate limit" in text.lower():
                    # Hạn mức của gói miễn phí, không nói gì về chất lượng model.
                    # Đếm riêng để không bôi bẩn cột lỗi, rồi nghỉ cho hồi hạn mức.
                    diem.loi_han_muc += 1
                    print("CHẠM HẠN MỨC (nghỉ 20s)")
                    await asyncio.sleep(20)
                    continue
                if isinstance(exc, QuizGenerationError):
                    # Hết cả 3 lượt retry của production — model này không cho
                    # ra nổi bộ đề dùng được, khác hẳn một lỗi mạng nhất thời.
                    diem.loi_kiem_dinh += 1
                    print(f"KHONG RA NOI DE ({text[:52]})")
                    continue
                diem.loi_goi += 1
                print(f"LỖI GỌI ({text[:60]})")
                continue

            diem.do_tre_ms.append(int((time.time() - bat_dau) * 1000))
            diem.cau_hop_le += len(hop_le)
            cham = await _cham_mot_luot(judge, fixture, hop_le)
            if cham:
                diem.cau_da_cham += len(hop_le)
                diem.grounded += cham.grounded
                diem.one_correct += cham.one_correct
                diem.understanding += cham.tests_understanding
                diem.appropriate += cham.patient_appropriate
                diem.nhan_xet.append(cham.nhan_xet)
            print(f"{len(hop_le)}/{QUESTIONS_PER_RUN} câu hợp lệ")

    return diem


def in_bang(ket_qua: list[ModelScore]) -> None:
    print()
    print("=" * 100)
    print("KET QUA")
    print("=" * 100)
    print(
        f"{'model':<30} {'hop le':>8} {'bam nguon':>11} {'1 dap an':>10} "
        f"{'hoi HIEU':>10} {'vua suc':>9} {'tre TB':>9} {'loi':>5} {'429':>5}"
    )
    print("-" * 100)

    for d in ket_qua:
        ty_le_hop_le = 100.0 * d.cau_hop_le / d.cau_yeu_cau if d.cau_yeu_cau else 0.0
        tre = f"{int(statistics.mean(d.do_tre_ms))}ms" if d.do_tre_ms else "-"
        loi = d.loi_goi + d.loi_kiem_dinh
        print(
            f"{d.ten:<30} {ty_le_hop_le:>7.0f}% {d.ty_le(d.grounded):>10.0f}% "
            f"{d.ty_le(d.one_correct):>9.0f}% {d.ty_le(d.understanding):>9.0f}% "
            f"{d.ty_le(d.appropriate):>8.0f}% {tre:>9} {loi:>5} {d.loi_han_muc:>5}"
        )

    print()
    print("NHAN XET CUA TRONG TAI")
    print("-" * 100)
    for d in ket_qua:
        if d.nhan_xet:
            print(f"\n{d.ten}:")
            for nx in d.nhan_xet[:3]:
                print(f"   - {nx}")

    print()
    print("Cot 'hop le' do bang luat (validate_quiz). Bon cot sau do bang LLM trong tai.")
    print(f"Trong tai: {JUDGE_MODEL}. Moi model chay {RUNS_PER_MODEL} luot x {len(FIXTURES)} fixture.")


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--models", nargs="*", default=["openai/gpt-oss-120b"], help="Model Groq đem so"
    )
    parser.add_argument("--openai", nargs="*", default=[], help="Model OpenAI đem so")
    parser.add_argument(
        "--openrouter",
        nargs="*",
        default=[],
        help="Model OpenRouter đem so. Xem giá: python scripts/list_openrouter_models.py",
    )
    parser.add_argument(
        "--trong-tai-provider",
        type=str,
        default="groq",
        choices=["groq", "openai", "openrouter"],
        help="Provider chạy trọng tài. Giữ nguyên một giá trị cho cả bảng.",
    )
    parser.add_argument("--out", type=str, default=None, help="Lưu kết quả thô ra file JSON")
    args = parser.parse_args()

    try:
        # Trọng tài mặc định chạy trên Groq. Groq hết hạn mức thì đổi bằng
        # --trong-tai-provider openrouter, nhưng PHẢI giữ nguyên một trọng tài
        # cho cả bảng — đổi giữa chừng là so bằng hai cái thước khác nhau.
        # method="json_mode" thay vì đường tool-calling mặc định.
        #
        # Groq hay trả 400 "model did not call a tool" NGAY CẢ KHI model đã sinh
        # ra JSON đúng schema — lỗi nằm ở lớp tool-calling của Groq, không phải ở
        # nội dung. Trọng tài mà rụng ngẫu nhiên thì bảng so sánh mất điểm dữ
        # liệu, và mất không đều giữa các model, nên phép so hỏng theo.
        judge = _llm(JUDGE_MODEL, args.trong_tai_provider).with_structured_output(
            JudgeResult, method="json_mode"
        )
    except Exception as exc:
        print(f"Không dựng được trọng tài ({JUDGE_MODEL}): {exc}")
        return 1

    thi_sinh = (
        [(m, "groq") for m in args.models]
        + [(m, "openai") for m in args.openai]
        + [(m, "openrouter") for m in args.openrouter]
    )
    print(f"So {len(thi_sinh)} model tren {len(FIXTURES)} fixture, {RUNS_PER_MODEL} luot moi cai.\n")

    ket_qua = []
    for model_id, provider in thi_sinh:
        print(f"  [{provider}] {model_id}")
        ket_qua.append(await do_mot_model(model_id, provider, judge))
        print()

    in_bang(ket_qua)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump([d.__dict__ for d in ket_qua], f, ensure_ascii=False, indent=2)
        print(f"\nDa luu: {args.out}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
