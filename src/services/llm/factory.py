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
    """Convenience: dùng OpenAI gpt-4o-mini cho generation/verification."""
    settings = get_settings()
    # Fallback về groq nếu openai key không có
    if settings.openai_api_key:
        return get_llm("openai")
    return get_llm("groq")
