from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
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
    secret_key: str = "super-secret-key-for-jwt-dev"

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
    database_url: str = "sqlite+aiosqlite:///./data/app.db"

    @field_validator("database_url", mode="before")
    @classmethod
    def fix_async_db_url(cls, v: str) -> str:
        """Railway cung cấp DATABASE_URL dạng postgresql://, asyncpg cần postgresql+asyncpg://; SQLite cần sqlite+aiosqlite://"""
        if not v:
            return "sqlite+aiosqlite:///./data/app.db"
        if isinstance(v, str):
            if v.startswith("postgresql://"):
                return v.replace("postgresql://", "postgresql+asyncpg://", 1)
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+asyncpg://", 1)
            if v.startswith("sqlite:///") and not v.startswith("sqlite+aiosqlite:///"):
                return v.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
