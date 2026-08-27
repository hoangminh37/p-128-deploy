"""Temperature contracts for deterministic medical-agent calls."""

from types import SimpleNamespace

import pytest
from langchain_core.runnables import RunnableLambda

from src.services.llm import factory


def _settings() -> SimpleNamespace:
    return SimpleNamespace(
        llm_provider="openai",
        openai_api_key="available",
        groq_api_key="",
        openrouter_api_key="",
        llm_max_tokens_fast=512,
        llm_fast_timeout_seconds=12.0,
        llm_quality_timeout_seconds=15.0,
        agent_temperature=0.0,
    )


def test_fast_agent_nodes_use_deterministic_temperature(monkeypatch):
    calls: list[tuple[tuple, dict]] = []
    monkeypatch.setattr(factory, "get_settings", _settings)
    monkeypatch.setattr(factory, "get_llm", lambda *args, **kwargs: calls.append((args, kwargs)) or "LLM")

    assert factory.get_fast_llm() == "LLM"
    assert calls == [
        (("openai",), {"max_tokens": 512, "temperature": 0.0, "timeout": 12.0, "max_retries": 0})
    ]


def test_quality_medical_answer_uses_rag_generation_temperature(monkeypatch):
    calls: list[tuple[tuple, dict]] = []
    monkeypatch.setattr(factory, "get_settings", _settings)
    monkeypatch.setattr(factory, "get_rag_settings", lambda: SimpleNamespace(generation_temperature=0.0))
    monkeypatch.setattr(factory, "get_llm", lambda *args, **kwargs: calls.append((args, kwargs)) or "LLM")

    assert factory.get_quality_llm() == "LLM"
    assert calls == [(("openai",), {"temperature": 0.0, "timeout": 15.0, "max_retries": 0})]


@pytest.mark.asyncio
async def test_quality_chain_fallback_sang_provider_tiep_theo_khi_provider_chinh_loi(monkeypatch):
    settings = _settings()
    settings.groq_api_key = "available"
    calls: list[str] = []

    async def primary_fails(_: object) -> object:
        raise RuntimeError("provider chính lỗi")

    monkeypatch.setattr(factory, "get_settings", lambda: settings)
    monkeypatch.setattr(factory, "get_rag_settings", lambda: SimpleNamespace(generation_temperature=0.0))

    def fake_get_llm(provider: str, **_: object):
        calls.append(provider)
        return RunnableLambda(primary_fails) if provider == "openai" else RunnableLambda(lambda _: "fallback ok")

    monkeypatch.setattr(factory, "get_llm", fake_get_llm)

    result = await factory.get_quality_llm_with_fallback(lambda llm: llm).ainvoke({"query": "test"})

    assert result == "fallback ok"
    assert calls == ["openai", "groq"]
