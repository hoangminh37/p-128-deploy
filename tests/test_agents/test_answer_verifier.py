"""Tests for the independent answer-grounding gate."""

from types import SimpleNamespace

import pytest
from langchain_core.runnables import RunnableLambda

from src.agent.nodes.generation import answer_verifier

DOCS = [
    {
        "doc_id": "chunk_1",
        "title": "Hướng dẫn xét nghiệm",
        "content": "Tài liệu mô tả một ngưỡng xét nghiệm cụ thể.",
    }
]


def test_parse_verification_fail_closed_khi_sai_format():
    assert answer_verifier._parse_verification("pass") == (False, "Kết quả kiểm chứng không đúng định dạng.")


def test_parse_verification_lay_duoc_ly_do_fail():
    approved, reason = answer_verifier._parse_verification(
        "<verification>decision: fail\nreason: Đổi chiều câu hỏi.</verification>"
    )

    assert approved is False
    assert reason == "Đổi chiều câu hỏi."


@pytest.mark.asyncio
async def test_verifier_chi_giu_cau_tra_loi_khi_pass(monkeypatch):
    llm = RunnableLambda(
        lambda _: SimpleNamespace(
            content="<verification>decision: pass\nreason: Đúng trọng tâm và bám nguồn.</verification>"
        )
    )
    monkeypatch.setattr(answer_verifier, "get_quality_llm_with_fallback", lambda build: build(llm))
    monkeypatch.setattr(answer_verifier, "get_settings", lambda: SimpleNamespace(llm_quality_total_timeout_seconds=1.0))

    result = await answer_verifier.answer_verifier_node(
        {
            "query": "Chỉ số này cao từ bao nhiêu?",
            "response": "Ngưỡng được nêu trong tài liệu [doc_0].",
            "citations": [{"doc_id": "doc_0"}],
            "support_level": "fully",
            "answers_question": True,
            "retrieved_docs": DOCS,
        }
    )

    assert result["response"] == "Ngưỡng được nêu trong tài liệu [doc_0]."
    assert result["metadata"]["answer_verification"]["decision"] == "pass"


@pytest.mark.asyncio
async def test_verifier_chan_cau_tra_loi_khi_lech_chieu_cau_hoi(monkeypatch):
    llm = RunnableLambda(
        lambda _: SimpleNamespace(
            content="<verification>decision: fail\nreason: Câu trả lời dùng ngưỡng đối nghịch.</verification>"
        )
    )
    monkeypatch.setattr(answer_verifier, "get_quality_llm_with_fallback", lambda build: build(llm))
    monkeypatch.setattr(answer_verifier, "get_settings", lambda: SimpleNamespace(llm_quality_total_timeout_seconds=1.0))

    result = await answer_verifier.answer_verifier_node(
        {
            "query": "Chỉ số này cao từ bao nhiêu?",
            "response": "Đây là nội dung về mức thấp [doc_0].",
            "citations": [{"doc_id": "doc_0"}],
            "support_level": "fully",
            "answers_question": True,
            "retrieved_docs": DOCS,
        }
    )

    assert result["response"] == ""
    assert result["citations"] == []
    assert result["support_level"] == "no_support"
    assert result["answers_question"] is False
    assert result["metadata"]["answer_verification"]["decision"] == "fail"


@pytest.mark.asyncio
async def test_verifier_timeout_chan_cau_tra_loi(monkeypatch):
    import asyncio

    async def never_returns(_: object) -> object:
        await asyncio.Future()

    monkeypatch.setattr(
        answer_verifier,
        "get_quality_llm_with_fallback",
        lambda _: RunnableLambda(never_returns),
    )
    monkeypatch.setattr(answer_verifier, "get_settings", lambda: SimpleNamespace(llm_quality_total_timeout_seconds=0.01))

    result = await answer_verifier.answer_verifier_node(
        {
            "query": "Chỉ số này cao từ bao nhiêu?",
            "response": "Ngưỡng được nêu trong tài liệu [doc_0].",
            "citations": [{"doc_id": "doc_0"}],
            "support_level": "fully",
            "answers_question": True,
            "retrieved_docs": DOCS,
        }
    )

    assert result["response"] == ""
    assert result["citations"] == []
    assert result["support_level"] == "no_support"
    assert result["metadata"]["answer_verification"]["decision"] == "fail"
