"""LLM factory — trả về BaseChatModel dựa theo provider config."""

from __future__ import annotations

from collections.abc import Callable

from langchain_core.language_models import BaseChatModel
from langchain_core.runnables import Runnable

from src.core.config import get_settings
from src.core.exceptions import LLMError
from src.core.logging import get_logger

logger = get_logger(__name__)


def get_llm(provider: str | None = None, max_tokens: int | None = None) -> BaseChatModel:
    """Factory function — chọn LLM provider theo config hoặc tham số.

    Args:
        provider: "groq" | "openai" | "openrouter" | None (dùng settings.llm_provider)
        max_tokens: trần token đầu ra. None thì dùng settings.llm_max_tokens.

    Returns:
        BaseChatModel instance đã cấu hình

    Raises:
        LLMError: Khi API key thiếu hoặc provider không hợp lệ
    """
    settings = get_settings()
    provider = provider or settings.llm_provider
    max_tokens = max_tokens or settings.max_tokens_for(provider)

    if provider == "groq":
        if not settings.groq_api_key:
            raise LLMError("groq", "GROQ_API_KEY is not set in .env")
        from langchain_groq import ChatGroq  # lazy import

        return ChatGroq(
            model=settings.model_for("groq"),
            api_key=settings.groq_api_key,  # type: ignore[arg-type]
            temperature=settings.llm_temperature,
            max_tokens=max_tokens,
            # Groq cũng phục vụ dòng gpt-oss, cũng đốt token vào suy luận.
            #
            # Truyền THẲNG chứ không qua `model_kwargs`: ChatGroq khai
            # `reasoning_effort` thành tham số riêng ở cấp lớp và TỪ CHỐI khởi
            # tạo nếu thấy nó nằm trong model_kwargs — lỗi ValidationError làm
            # chết cả `get_fast_llm()`, tức là chết ngay node intent_router,
            # tức là mọi câu hỏi chat đều hỏng.
            reasoning_effort=settings.llm_reasoning_effort,
        )

    if provider == "openai":
        if not settings.openai_api_key:
            raise LLMError("openai", "OPENAI_API_KEY is not set in .env")
        from langchain_openai import ChatOpenAI  # lazy import

        return ChatOpenAI(
            model=settings.model_for("openai"),
            api_key=settings.openai_api_key,  # type: ignore[arg-type]
            temperature=settings.llm_temperature,
            max_tokens=max_tokens,
        )

    if provider == "openrouter":
        if not settings.openrouter_api_key:
            raise LLMError("openrouter", "OPENROUTER_API_KEY is not set in .env")
        from langchain_openai import ChatOpenAI  # lazy import

        # OpenRouter nói đúng giao thức OpenAI, chỉ khác base URL — nên dùng lại
        # ChatOpenAI thay vì kéo thêm một SDK nữa vào dự án.
        #
        # Hai header dưới là quy ước riêng của OpenRouter để ghi nguồn gọi. Không
        # bắt buộc, nhưng thiếu thì request bị xếp vào hạng ẩn danh và dễ ăn hạn
        # mức chặt hơn.
        return ChatOpenAI(
            model=settings.model_for("openrouter"),
            api_key=settings.openrouter_api_key,  # type: ignore[arg-type]
            base_url=settings.openrouter_base_url,
            temperature=settings.llm_temperature,
            max_tokens=max_tokens,
            default_headers={
                "HTTP-Referer": "https://github.com/AI20K-Build-Phase-Cohort-3/P-128",
                "X-Title": "P-128 Health Education AI Agent",
            },
            # ĐỊNH TUYẾN THEO TỐC ĐỘ, KHÔNG THEO GIÁ.
            #
            # Cùng một id model, OpenRouter chuyển tiếp tới nhiều nhà cung cấp
            # khác nhau và mặc định chọn nơi RẺ NHẤT. Đo ngày 24/08/2026:
            # gpt-oss-120b qua tuyến mặc định mất 137 GIÂY một lượt, trong khi
            # chính model đó trên Groq mất ~8 giây — chậm gấp 17 lần. Frontend
            # bỏ cuộc ở giây 90, nên người bệnh thấy lỗi trong khi máy chủ vẫn
            # đang chạy.
            #
            # Chênh lệch giá giữa các tuyến là vài phần nghìn đô một đề. Chênh
            # lệch tốc độ là ranh giới giữa dùng được và không.
            #
            # `reasoning.effort` ghìm phần suy luận nội bộ — xem `llm_reasoning_effort`
            # trong src/core/config.py để biết vì sao nó quyết định sống chết.
            extra_body={
                "provider": {"sort": "throughput"},
                # Ghìm bằng max_tokens, KHÔNG bằng effort — xem
                # `llm_reasoning_max_tokens` trong src/core/config.py để biết
                # số đo. effort chỉ là gợi ý và ghìm rất lỏng.
                "reasoning": {"max_tokens": settings.llm_reasoning_max_tokens},
            },
        )

    raise LLMError(provider, f"Unknown provider '{provider}'. Use 'groq', 'openai' or 'openrouter'.")


def get_fast_llm() -> BaseChatModel:
    """LLM cho các node cần tốc độ và chỉ trả lời cực ngắn.

    Dùng ở intent_router (một từ), crag_evaluator (một dãy số), coref_resolution
    và query_rewrite (một câu). Trần token nhỏ ở đây không phải để tiết kiệm mà
    để KHÔNG ĐẬP VÀO hạn mức token/phút — xem `llm_max_tokens_fast`.
    """
    return get_llm("groq", max_tokens=get_settings().llm_max_tokens_fast)


def quality_providers() -> list[str]:
    """Provider dùng cho generation, provider chính đứng đầu, dự bị theo sau.

    Chỉ liệt kê provider CÓ KEY. Thứ tự dự bị cố định để hành vi lặp lại được
    giữa các lần chạy — không xáo trộn theo dict order hay môi trường.
    """
    settings = get_settings()
    co_key = {
        "groq": bool(settings.groq_api_key),
        "openai": bool(settings.openai_api_key),
        "openrouter": bool(settings.openrouter_api_key),
    }

    thu_tu: list[str] = []
    if co_key.get(settings.llm_provider):
        thu_tu.append(settings.llm_provider)
    # Groq đứng trước trong danh sách dự bị: gói miễn phí không bao giờ hết tiền
    # giữa chừng, và đo được là nhanh nhất (3,7s so với 23,5s của OpenRouter
    # trên cùng openai/gpt-oss-120b, ngày 24/08/2026).
    for du_bi in ("groq", "openrouter", "openai"):
        if du_bi not in thu_tu and co_key[du_bi]:
            thu_tu.append(du_bi)
    return thu_tu


def with_provider_fallback(build_one: Callable[[str], Runnable]) -> Runnable:
    """Dựng một Runnable tự chuyển sang provider khác khi provider chính GÃY.

    KHÁC HẲN cơ chế cũ trong ``get_quality_llm``: bản đó chỉ kiểm KEY CÓ TỒN TẠI
    hay không, nên một key còn nguyên nhưng hết tiền vẫn được coi là dùng được.
    Đúng chuyện đã xảy ra ngày 24/08/2026: OPENROUTER_API_KEY hợp lệ nhưng tài
    khoản chưa nạp tiền, mọi lời gọi trả 402, và nhánh dự bị không bao giờ chạy
    vì theo nó thì provider chính "vẫn ổn".

    Nhận CALLABLE chứ không nhận Runnable dựng sẵn, vì mỗi provider phải được
    dựng riêng từ đầu: ``with_structured_output`` phải áp lên từng model cụ thể,
    không áp được lên một ``RunnableWithFallbacks`` đã ghép — cùng lý do
    ``bind()`` không dùng được với structured output (xem ``_build_chain`` trong
    src/services/quiz/generator.py).

    Args:
        build_one: hàm nhận tên provider, trả về Runnable hoàn chỉnh cho provider đó.

    Lỗi nào cũng kích hoạt dự bị. Hẹp hơn thì phải liệt kê từng lớp ngoại lệ của
    từng SDK — mà 402, 429, 503 và lỗi mạng nằm ở các lớp khác nhau tuỳ provider,
    nên liệt kê thiếu là lại rơi vào đúng cái bẫy "im lặng không chuyển" ở trên.
    """
    thu_tu = quality_providers()
    if not thu_tu:
        raise LLMError("none", "Không provider nào có API key. Kiểm lại .env")

    chinh = build_one(thu_tu[0])
    du_bi = [build_one(p) for p in thu_tu[1:]]
    if not du_bi:
        return chinh

    logger.info("[llm] provider chính=%s | dự bị=%s", thu_tu[0], ", ".join(thu_tu[1:]))
    return chinh.with_fallbacks(du_bi)


def get_quality_llm() -> BaseChatModel:
    """Convenience: LLM cho generation/verification, theo LLM_PROVIDER trong .env.

    Bản trước luôn chọn OpenAI khi OPENAI_API_KEY có mặt, BỎ QUA LLM_PROVIDER.
    Một key hết hạn mức vẫn là một chuỗi khác rỗng, nên toàn bộ node sinh câu trả
    lời chết với lỗi 429 trong khi .env đã ghi rõ LLM_PROVIDER=groq. Nay tôn trọng
    cấu hình, chỉ đổi provider khi provider được chọn thiếu key.
    """
    settings = get_settings()
    provider = settings.llm_provider

    # Thiếu key của provider chính thì lùi sang provider khác CÒN KEY, thay vì
    # chết ngay. Duyệt theo thứ tự cố định để hành vi lặp lại được.
    co_key = {
        "groq": bool(settings.groq_api_key),
        "openai": bool(settings.openai_api_key),
        "openrouter": bool(settings.openrouter_api_key),
    }
    if co_key.get(provider):
        return get_llm(provider)

    for du_bi in ("openrouter", "groq", "openai"):
        if du_bi != provider and co_key[du_bi]:
            return get_llm(du_bi)

    # Không provider nào có key — để get_llm ném LLMError với thông báo rõ ràng.
    return get_llm(provider)
