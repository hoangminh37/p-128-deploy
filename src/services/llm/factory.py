"""LLM factory — trả về BaseChatModel dựa theo provider config."""

from __future__ import annotations

from langchain_core.language_models import BaseChatModel

from src.core.config import get_settings
from src.core.exceptions import LLMError


def get_llm(provider: str | None = None) -> BaseChatModel:
    """Factory function — chọn LLM provider theo config hoặc tham số.

    Args:
        provider: "groq" | "openai" | None (dùng settings.llm_provider)

    Returns:
        BaseChatModel instance đã cấu hình

    Raises:
        LLMError: Khi API key thiếu hoặc provider không hợp lệ
    """
    settings = get_settings()
    provider = provider or settings.llm_provider

    if provider == "groq":
        if not settings.groq_api_key:
            raise LLMError("groq", "GROQ_API_KEY is not set in .env")
        from langchain_groq import ChatGroq  # lazy import

        return ChatGroq(
            model=settings.model_name,
            api_key=settings.groq_api_key,  # type: ignore[arg-type]
            temperature=settings.llm_temperature,
        )

    if provider == "openai":
        if not settings.openai_api_key:
            raise LLMError("openai", "OPENAI_API_KEY is not set in .env")
        from langchain_openai import ChatOpenAI  # lazy import

        return ChatOpenAI(
            model="gpt-4o-mini",
            api_key=settings.openai_api_key,  # type: ignore[arg-type]
            temperature=settings.llm_temperature,
        )

    raise LLMError(provider, f"Unknown provider '{provider}'. Use 'groq' or 'openai'.")


def get_fast_llm() -> BaseChatModel:
    """Convenience: luôn dùng Groq cho các node cần tốc độ (intent, guardrail)."""
    return get_llm("groq")


def get_quality_llm() -> BaseChatModel:
    """Convenience: LLM cho generation/verification, theo LLM_PROVIDER trong .env.

    Bản trước luôn chọn OpenAI khi OPENAI_API_KEY có mặt, BỎ QUA LLM_PROVIDER.
    Một key hết hạn mức vẫn là một chuỗi khác rỗng, nên toàn bộ node sinh câu trả
    lời chết với lỗi 429 trong khi .env đã ghi rõ LLM_PROVIDER=groq. Nay tôn trọng
    cấu hình, chỉ đổi provider khi provider được chọn thiếu key.
    """
    settings = get_settings()
    provider = settings.llm_provider

    if provider == "openai" and not settings.openai_api_key:
        return get_llm("groq")
    if provider == "groq" and not settings.groq_api_key:
        return get_llm("openai")
    return get_llm(provider)
