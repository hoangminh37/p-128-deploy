"""Tests parser/gate của node generate_and_verify v2."""

import asyncio
from types import SimpleNamespace

import pytest
from langchain_core.runnables import RunnableLambda

from src.agent.nodes.generation import generate_and_verify

DOCS = [
    {
        "doc_id": "chunk_1",
        "document_id": "vn-moh-3192-2010-htn",
        "chunk_id": "vn-moh-3192-2010-htn::0004::digest",
        "title": "Hướng dẫn tăng huyết áp",
        "issuer": "Bộ Y tế",
        "content": "Người bệnh tăng huyết áp cần theo dõi huyết áp định kỳ.",
    }
]


def test_fully_supported_giu_citation_hop_le():
    _, labels = generate_and_verify._build_context(DOCS)
    raw = """<analysis>Nguồn đủ.</analysis>
<answer>Bạn nên theo dõi huyết áp định kỳ [doc_0].</answer>
<verdict>support_level: fully
answers_question: true</verdict>"""

    analysis, answer, level, answers_question, citations = generate_and_verify._parse(raw, labels)

    assert analysis == "Nguồn đủ."
    assert answer == "Bạn nên theo dõi huyết áp định kỳ [doc_0]."
    assert level == "fully"
    assert answers_question is True
    assert citations[0]["document_id"] == "vn-moh-3192-2010-htn"
    assert citations[0]["chunk_id"] == "vn-moh-3192-2010-htn::0004::digest"


def test_partial_them_disclaimer_inline_mot_lan():
    _, labels = generate_and_verify._build_context(DOCS)
    raw = """<analysis>Nguồn mới trả lời một phần.</analysis>
<answer>Bạn nên theo dõi huyết áp định kỳ [doc_0].</answer>
<verdict>support_level: partially
answers_question: true</verdict>"""

    _, answer, level, answers_question, citations = generate_and_verify._parse(raw, labels)

    assert level == "partially"
    assert answers_question is True
    assert answer.count(generate_and_verify.DISCLAIMER_PARTIAL) == 1
    assert len(citations) == 1


def test_invalid_or_uncited_answer_becomes_no_support():
    _, labels = generate_and_verify._build_context(DOCS)
    raw = """<analysis></analysis>
<answer>Hãy dùng thuốc này [doc_99].</answer>
<verdict>support_level: fully
answers_question: true</verdict>"""

    _, answer, level, answers_question, citations = generate_and_verify._parse(raw, labels)

    assert answer == ""
    assert level == "no_support"
    assert answers_question is False
    assert citations == []


def test_no_support_never_releases_draft_answer():
    _, labels = generate_and_verify._build_context(DOCS)
    raw = """<analysis>Tài liệu không đủ.</analysis>
<answer>Đây là phần dự thảo [doc_0].</answer>
<verdict>support_level: no_support
answers_question: false</verdict>"""

    _, answer, level, answers_question, citations = generate_and_verify._parse(raw, labels)

    assert answer == ""
    assert level == "no_support"
    assert answers_question is False
    assert citations == []


def test_patient_context_co_routine_nhung_khong_phai_citation_source():
    context = generate_and_verify._patient_context(
        {
            "patient_profile": {
                "age": 60,
                "primary_condition": "hypertension",
                "diagnosed_at": "2024-05",
                "height_cm": 165,
                "weight_kg": 68.5,
            },
            "patient_routine": [{"category": "activity", "fact": "Tôi đi bộ 30 phút mỗi sáng."}],
        }
    )

    assert "Tuổi: 60" in context
    assert "Thời điểm chẩn đoán: 2024-05" in context
    assert "Chiều cao: 165 cm" in context
    assert "Cân nặng: 68.5 kg" in context
    assert "Tôi đi bộ 30 phút mỗi sáng." in context


def test_moi_marker_hop_le_deu_co_citation_ke_ca_khi_cung_chunk():
    docs = [
        {
            "chunk_id": "chunk_same",
            "document_id": "doc_a",
            "title": "Hướng dẫn A",
            "issuer": "Bộ Y tế",
            "content": "Nội dung có căn cứ.",
        },
        {
            "chunk_id": "chunk_same",
            "document_id": "doc_a",
            "title": "Hướng dẫn A",
            "issuer": "Bộ Y tế",
            "content": "Nội dung có căn cứ.",
        },
    ]
    _, labels = generate_and_verify._build_context(docs)
    raw = """<analysis>Nguồn đủ.</analysis>
<answer>Ý thứ nhất [doc_0]. Ý thứ hai [doc_1].</answer>
<verdict>support_level: fully
answers_question: true</verdict>"""

    _, answer, level, answered, citations = generate_and_verify._parse(raw, labels)

    assert answer
    assert level == "fully"
    assert answered is True
    assert [citation["doc_id"] for citation in citations] == ["doc_0", "doc_1"]


@pytest.mark.asyncio
async def test_generation_timeout_khong_de_lo_cau_tra_loi_chua_kiem_chung(monkeypatch):
    async def never_returns(_: object) -> object:
        await asyncio.Future()

    monkeypatch.setattr(
        generate_and_verify,
        "get_quality_llm_with_fallback",
        lambda _: RunnableLambda(never_returns),
    )
    monkeypatch.setattr(
        generate_and_verify,
        "get_settings",
        lambda: SimpleNamespace(
            llm_provider="openai",
            model_for=lambda _: "test-model",
            llm_quality_total_timeout_seconds=0.01,
        ),
    )
    monkeypatch.setattr(generate_and_verify, "get_rag_settings", lambda: SimpleNamespace(generation_temperature=0.0))

    result = await generate_and_verify.generate_and_verify_node(
        {"query": "Tôi nên theo dõi huyết áp thế nào?", "retrieved_docs": DOCS}
    )

    assert result["response"] == ""
    assert result["citations"] == []
    assert result["support_level"] == "no_support"
    assert result["answers_question"] is False
