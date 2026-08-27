"""Regression tests for dynamic, grounded medical-term annotations."""

from types import SimpleNamespace

import pytest
from langchain_core.runnables import RunnableLambda

from src.agent.nodes.annotation import annotation_pipeline as pipeline
from src.agent.prompts.term_detect import term_detect_prompt
from src.agent.prompts.term_explain import term_explain_prompt


def _term(phrase: str, canonical_term: str | None = None) -> pipeline.DetectedTerm:
    return pipeline.DetectedTerm(
        phrase=phrase,
        canonical_term=canonical_term or phrase,
        difficulty="high",
    )


def test_prompt_term_detect_va_explain_chi_nhan_cac_bien_dau_vao_hop_dong() -> None:
    """JSON examples must be literal text, not accidental template variables."""
    detected = term_detect_prompt.format(query="HbA1c là gì?", answer="HbA1c là một xét nghiệm.")
    explained = term_explain_prompt.format(terms_json="[]", definition_evidence="")

    assert '"phrase": "..."' in detected
    assert '"id":"term id"' in explained


def test_validate_terms_sau_khi_loai_candidate_sai_khong_cat_mat_thuat_ngu() -> None:
    """The detector may return a bad phrase first; valid later terms must survive."""
    answer = (
        "Cần theo dõi HbA1c, eGFR, microalbumin niệu, kháng insulin, "
        "bệnh võng mạc và nghiệm pháp dung nạp glucose."
    )
    detected = [_term("không có trong câu")] + [
        _term(value)
        for value in (
            "HbA1c",
            "eGFR",
            "microalbumin niệu",
            "kháng insulin",
            "bệnh võng mạc",
            "nghiệm pháp dung nạp glucose",
        )
    ]

    validated = pipeline._validate_detections(answer, detected)

    assert [item["phrase"] for item in validated] == [
        "HbA1c",
        "eGFR",
        "microalbumin niệu",
        "kháng insulin",
        "bệnh võng mạc",
        "nghiệm pháp dung nạp glucose",
    ]


def test_validate_detections_khong_dung_blacklist_tu_y_khoa() -> None:
    """Whether a phrase needs help is decided by the detector, not a code list."""
    answer = "Cần theo dõi huyết áp và biến cố tim mạch lớn."

    validated = pipeline._validate_detections(answer, [_term("huyết áp"), _term("biến cố tim mạch lớn")])

    assert [item["phrase"] for item in validated] == ["huyết áp", "biến cố tim mạch lớn"]


def test_validate_uu_tien_thuat_ngu_kho_hon_don_vi_khi_vuot_ngan_sach_tooltip() -> None:
    answer = (
        "Chỉ số đường huyết, tiểu đường type 2, Glucose huyết tương lúc đói, mg/dL, mmol/L, "
        "nghiệm pháp dung nạp glucose, HbA1c và triệu chứng tăng glucose huyết."
    )
    detected = [
        pipeline.DetectedTerm(phrase=phrase, canonical_term=phrase, difficulty=difficulty)
        for phrase, difficulty in (
            ("Chỉ số đường huyết", "medium"),
            ("tiểu đường type 2", "medium"),
            ("Glucose huyết tương lúc đói", "high"),
            ("mg/dL", "low"),
            ("mmol/L", "low"),
            ("nghiệm pháp dung nạp glucose", "high"),
            ("HbA1c", "high"),
            ("triệu chứng tăng glucose huyết", "medium"),
        )
    ]

    validated = pipeline._validate_detections(answer, detected)

    assert [item["phrase"] for item in validated] == [
        "Glucose huyết tương lúc đói",
        "nghiệm pháp dung nạp glucose",
        "HbA1c",
        "Chỉ số đường huyết",
        "tiểu đường type 2",
        "triệu chứng tăng glucose huyết",
    ]


@pytest.mark.asyncio
async def test_pipeline_batch_explain_dung_utf16_offset_va_mot_nguon(monkeypatch: pytest.MonkeyPatch) -> None:
    """Emoji before a term must not move the frontend hover range left or right."""
    answer = "🩺 HbA1c phản ánh đường huyết trung bình trong vài tháng."

    async def fake_detect(_: str, __: str) -> list[pipeline.DetectedTerm]:
        return [_term("HbA1c")]

    mock_llm = RunnableLambda(
        lambda _: SimpleNamespace(
            content=(
                '[{"id":"term_1","source_id":"answer_1",'
                '"explanation":"Đây là xét nghiệm cho biết đường huyết trung bình trong vài tháng gần đây."}]'
            )
        )
    )
    monkeypatch.setattr(pipeline, "_detect_terms", fake_detect)
    monkeypatch.setattr(pipeline, "get_fast_llm", lambda: mock_llm)

    annotations = await pipeline.run_annotation_pipeline(
        answer=answer,
        query="HbA1c là gì?",
        answer_chunks=[
            {
                "chunk_id": "chunk_hba1c",
                "document_id": "doc_diabetes",
                "content": "HbA1c phản ánh mức glucose trung bình trong vài tháng gần đây.",
            }
        ],
    )

    assert annotations == [
        {
            "term": "HbA1c",
            # Emoji uses two UTF-16 code units, then one space.
            "start_offset": 3,
            "end_offset": 8,
            "short_explanation": "Đây là xét nghiệm cho biết đường huyết trung bình trong vài tháng gần đây.",
            "source_chunk_id": "chunk_hba1c",
            "source_document_id": "doc_diabetes",
        }
    ]


def test_explanation_parser_bo_qua_object_khong_dung_contract() -> None:
    parsed = pipeline._parse_explanations(
        '[{"id":"term_1","source_id":"answer_1","explanation":"Một giải thích hợp lệ."},'
        '{"id": 7, "explanation": "Sai kiểu dữ liệu"}]'
    )

    assert len(parsed) == 1
    assert parsed[0].id == "term_1"
