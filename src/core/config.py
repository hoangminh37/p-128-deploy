from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ─────────────────────────────────────────────────────────────────
    app_name: str = "Medical AI Agent"
    app_env: Literal["development", "production", "test"] = "development"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_host: str = "0.0.0.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = "http://localhost:5180"

    # ── LLM ─────────────────────────────────────────────────────────────────
    openai_api_key: str = ""
    groq_api_key: str = ""
    llm_provider: Literal["groq", "openai"] = "groq"
    model_name: str = "llama-3.3-70b-versatile"
    llm_temperature: float = Field(default=0.3, ge=0.0, le=2.0)

    # ── Embedding ───────────────────────────────────────────────────────────
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536

    # ── LangSmith Tracing ───────────────────────────────────────────────────
    langchain_api_key: str = ""
    langchain_tracing_v2: bool = True
    langchain_project: str = "ai20k-medical-agent"

    # ── Legacy / Compatibility ───────────────────────────────────────────────
    # Kept for backward-compat with old config.py consumers
    database_url: str = "sqlite:///./data/app.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
