"""Sinh đề trắc nghiệm bằng LangChain structured output.

Vòng đời một đề:

    context (3 nguồn) → prompt → structured_output
                                   │        │
                          tool-calling   json_mode ◄── đổi sang khi Groq
                                   │        │           nuốt tool call
                                   ▼        ▼
                                validator thuần luật
                                   │              │
                              đủ câu          thiếu câu
                                   │              │
                                   ▼              ▼
                                 trả về      thử lại (tổng 3 lượt)

Đề trắc nghiệm cần bám sát trích đoạn: nhiệt độ cao làm LLM tự tin bịa ra
những đáp án nghe rất hợp lý mà tài liệu không hề nói. Nhiệt độ lấy từ
``llm_temperature`` của cấu hình chung — xem ``_build_chain`` để biết vì sao
không đặt riêng ở đây.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from src.agent.prompts.quiz import quiz_prompt
from src.core.logging import get_logger
from src.services.llm.factory import get_llm, with_provider_fallback
from src.services.quiz.context import QuizContext
from src.services.quiz.validator import QuizValidationError, validate_quiz

logger = get_logger(__name__)

#: Số lần gọi lại LLM khi bộ đề không qua được validator.
MAX_ATTEMPTS = 3

#: Xin dư câu để validator có chỗ mà loại — đề 5 câu thì xin 6.
#:
#: Trước để 2 (xin 7). Hạ xuống 1 vì mỗi câu thừa tốn ~430 token đầu ra, mà
#: token đầu ra chính là thứ đội thời gian chờ và đụng hạn mức token/phút. Một
#: câu dư vẫn đủ chỗ cho validator loại, và nếu loại quá tay thì đã có retry.
OVERGENERATE = 1


class QuizQuestionDraft(BaseModel):
    """Một câu trắc nghiệm do LLM sinh — bản nháp, CHƯA qua kiểm định."""

    question: str = Field(description="Câu hỏi ngắn gọn, dưới 30 chữ, tiếng Việt đời thường")
    options: list[str] = Field(description="Đúng 4 đáp án, mỗi đáp án dưới 20 chữ, độ dài tương đương nhau")
    correct_index: int = Field(description="Vị trí đáp án đúng trong mảng options, từ 0 đến 3")
    explanation: str = Field(description="1-2 câu giải thích vì sao đáp án đó đúng, dựa vào trích đoạn tài liệu")
    difficulty: str = Field(default="medium", description="Độ khó: easy | medium | hard")


class QuizSet(BaseModel):
    """Bộ đề LLM trả về."""

    questions: list[QuizQuestionDraft] = Field(description="Danh sách câu trắc nghiệm")


class QuizGenerationError(RuntimeError):
    """Hết lượt thử mà vẫn không ra được bộ đề dùng được."""


#: Dấu hiệu của lỗi tool-calling phía Groq, không phải lỗi nội dung.
TOOL_CALL_BUG_MARKERS: tuple[str, ...] = ("tool_use_failed", "did not call a tool")


def _build_chain(json_mode: bool = False, llm=None):
    """Dựng chain sinh đề. Tách hàm riêng để test thay thế được bằng fake LLM.

    HAI ĐƯỜNG RA STRUCTURED OUTPUT, VÌ KHÔNG ĐƯỜNG NÀO TỐT CẢ HAI MẶT.

    Đo thực tế trên Groq + gpt-oss-120b ngày 24/08/2026:

    - **tool-calling** (mặc định): xin 7 câu thì trả đủ 7, chất lượng tốt. Nhưng
      Groq trả 400 ``tool_use_failed`` — "model did not call a tool" — NGAY CẢ
      KHI model đã sinh JSON đúng schema. Trúng 2/3 fixture ngữ cảnh mỏng, và
      ~8% số chunk trong một lượt chạy ETL.
    - **json_mode**: không bao giờ dính lỗi trên, nhưng SINH THIẾU — xin 7 chỉ
      trả 4-5. Không có schema dạng tool để bám, model dễ dừng sớm.

    Nên: đi tool-calling trước để lấy đủ số câu; chỉ khi trúng đúng lỗi đó mới
    đổi sang json_mode ở lượt sau. Xem vòng lặp trong ``generate_quiz``.

    Ngữ cảnh mỏng KHÔNG phải ca hiếm với luồng quiz — người bệnh chat hai câu
    rồi bấm "Kiểm tra kiến thức" là kịch bản thường gặp nhất của nguồn
    ``conversation``. Không có đường lui thì cả 3 lượt retry cùng trượt một kiểu
    và người bệnh nhận 503.

    ``json_mode`` đòi prompt mô tả rõ hình dạng JSON — xem cuối
    ``src/agent/prompts/quiz.py``. Dấu ba chấm hay chú thích lọt vào khối JSON
    mẫu sẽ làm Groq trả ``json_validate_failed``.

    KHÔNG dùng ``llm.bind(temperature=...)`` ở đây, dù thoạt nhìn nó có vẻ chạy.
    ``BaseChatModel.bind`` trả về ``_ChatModelBinding``, mà lớp này lúc runtime
    là ``RunnableBinding`` thuần — ``with_structured_output`` tới được nó qua
    ``__getattr__``, và ``__getattr__`` uỷ quyền thẳng về model CHƯA bind. Kết
    quả: chain dựng xong không lỗi, nhưng nhiệt độ vừa đặt bị nuốt im lặng.
    ``llm_temperature`` trong .env đang là 0.3, vốn đã đủ thấp cho việc ra đề.
    """

    def dung_chain(model):
        if json_mode:
            return quiz_prompt | model.with_structured_output(QuizSet, method="json_mode")
        return quiz_prompt | model.with_structured_output(QuizSet)

    # LLM truyền vào tay (test, hoặc so sánh model) thì dùng đúng nó, không ghép
    # dự bị — người gọi đang muốn đo CHÍNH model đó.
    if llm is not None:
        return dung_chain(llm)

    # Mặc định: ghép dự bị. Provider chính hết tín dụng (402) hay chạm hạn mức
    # (429) thì tự chuyển sang provider còn lại ngay trong cùng lượt gọi.
    #
    # Phải dựng RIÊNG cho từng provider chứ không ghép dự bị rồi mới gọi
    # with_structured_output — `RunnableWithFallbacks` không có phương thức đó,
    # cùng lý do `bind()` không dùng được (xem đoạn trên).
    return with_provider_fallback(lambda p: dung_chain(get_llm(p)))


async def generate_quiz(context: QuizContext, num_questions: int, llm=None) -> list[dict]:
    """Sinh và kiểm định một bộ đề.

    Args:
        context: ngữ cảnh đã dựng từ một trong ba nguồn.
        num_questions: số câu người học yêu cầu.
        llm: ghi đè model, chỉ dùng cho việc đo. Bỏ trống thì lấy theo .env.

            Có tham số này để ``scripts/eval_quiz_models.py`` chạy đúng đường mà
            người dùng thật đi qua — gồm cả vòng lui từ tool-calling sang
            json_mode. Bản trước bộ đo tự dựng chain riêng ép sẵn json_mode, nên
            nó đo một nhánh code không ai chạm tới, và bỏ sót chính cái đang cần
            đo là độ tin cậy của đường tool-calling.

    Returns:
        Danh sách câu đã kiểm định, mỗi câu có ``index``, ``question``,
        ``options``, ``correct_index``, ``explanation``, ``difficulty``.

    Raises:
        QuizGenerationError: hết ``MAX_ATTEMPTS`` mà vẫn không đủ câu hợp lệ.
    """
    payload = {
        "topic": context.topic,
        "profile": context.profile,
        "context": context.context,
        "num_questions": num_questions + OVERGENERATE,
    }

    last_error: Exception | None = None
    json_mode = False

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            result = await _build_chain(json_mode, llm).ainvoke(payload)
        except Exception as exc:
            last_error = exc
            if not json_mode and any(m in str(exc) for m in TOOL_CALL_BUG_MARKERS):
                # Lỗi nền tảng chứ không phải nội dung — thử lại y hệt sẽ hỏng y
                # hệt. Đổi đường ra cho lượt sau.
                json_mode = True
                logger.warning("[quiz_generator] lần %d: tool-calling hỏng, đổi sang json_mode", attempt)
            else:
                logger.warning("[quiz_generator] lần %d: LLM lỗi — %s", attempt, exc)
            continue

        drafts = [q.model_dump() for q in (result.questions if result else [])]
        logger.info(
            "[quiz_generator] lần %d (%s): LLM trả về %d câu",
            attempt,
            "json_mode" if json_mode else "tool-calling",
            len(drafts),
        )

        try:
            # Ngưỡng tối thiểu là 3 câu chứ không phải `num_questions`: một đề 4
            # câu chắc chắn đúng vẫn dùng được, còn gọi lại LLM chỉ vì thiếu một
            # câu thì người bệnh phải ngồi chờ thêm mấy giây cho một cải thiện
            # mà họ không nhận ra.
            minimum = min(num_questions, 3)
            validated = validate_quiz(drafts, min_questions=minimum)
        except QuizValidationError as exc:
            last_error = exc
            logger.warning("[quiz_generator] lần %d: kiểm định trượt — %s", attempt, exc)
            continue

        # Cắt về đúng số câu đã hứa với người học, đánh lại index cho liền mạch.
        final = validated[:num_questions]
        for index, question in enumerate(final):
            question["index"] = index

        logger.info("[quiz_generator] hoàn tất: %d câu sau %d lần thử", len(final), attempt)
        return final

    raise QuizGenerationError(f"Không sinh được bộ đề sau {MAX_ATTEMPTS} lần thử: {last_error}")
