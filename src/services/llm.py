from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from src.config import get_settings


def get_llm() -> ChatOpenAI:
    settings = get_settings()
    return ChatOpenAI(
        model=settings.model_name,
        api_key=SecretStr(settings.openai_api_key) if settings.openai_api_key else None,
        temperature=settings.llm_temperature,
    )
