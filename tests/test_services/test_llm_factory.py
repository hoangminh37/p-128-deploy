"""Temperature contracts for deterministic medical-agent calls."""

from types import SimpleNamespace

from src.services.llm import factory


def _settings() -> SimpleNamespace:
    return SimpleNamespace(
        llm_provider="openai",
        openai_api_key="available",
        groq_api_key="",
        openrouter_api_key="",
        llm_max_tokens_fast=512,
        agent_temperature=0.0,
    )


def test_fast_agent_nodes_use_deterministic_temperature(monkeypatch):
    calls: list[tuple[tuple, dict]] = []
    monkeypatch.setattr(factory, "get_settings", _settings)
    monkeypatch.setattr(factory, "get_llm", lambda *args, **kwargs: calls.append((args, kwargs)) or "LLM")

    assert factory.get_fast_llm() == "LLM"
    assert calls == [(('openai',), {"max_tokens": 512, "temperature": 0.0})]


def test_quality_medical_answer_uses_rag_generation_temperature(monkeypatch):
    calls: list[tuple[tuple, dict]] = []
    monkeypatch.setattr(factory, "get_settings", _settings)
    monkeypatch.setattr(factory, "get_rag_settings", lambda: SimpleNamespace(generation_temperature=0.0))
    monkeypatch.setattr(factory, "get_llm", lambda *args, **kwargs: calls.append((args, kwargs)) or "LLM")

    assert factory.get_quality_llm() == "LLM"
    assert calls == [(('openai',), {"temperature": 0.0})]
