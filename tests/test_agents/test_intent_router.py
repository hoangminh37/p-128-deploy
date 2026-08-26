"""Contract tests for semantic scope/task decisions at the graph entry point."""

from types import SimpleNamespace

import pytest
from langchain_core.runnables import RunnableLambda

from src.agent.nodes.safety import intent_router
from src.agent.nodes.safety.intent_router import parse_intent_decision
from src.agent.prompts.intent import INTENT_SYSTEM, intent_prompt


def test_meal_recommendation_luon_nam_trong_pham_vi():
    decision = parse_intent_decision('{"intent":"education","scope":"in_scope","task_kind":"meal_recommendation"}')

    assert decision == ("education", "in_scope", "meal_recommendation")


def test_dien_giai_nguong_chi_so_la_mot_task_kind_rieng():
    decision = parse_intent_decision(
        '{"intent":"education","scope":"in_scope","task_kind":"measurement_interpretation"}'
    )

    assert decision == ("education", "in_scope", "measurement_interpretation")


def test_ngoai_pham_vi_that_su_ket_thuc_o_ood():
    decision = parse_intent_decision('{"intent":"out_of_domain","scope":"out_of_scope","task_kind":"out_of_scope"}')

    assert decision == ("out_of_domain", "out_of_scope", "out_of_scope")


def test_output_loi_format_fail_open_ve_education():
    assert parse_intent_decision("không theo JSON") == ("education", "in_scope", "health_education")


def test_red_flag_legacy_mot_tu_khong_bao_gio_roi_ve_education():
    assert parse_intent_decision("red_flag") == ("red_flag", "in_scope", "safety")


def test_prompt_phan_biet_y_dinh_bua_an_va_khong_chen_json_template_variable():
    assert "meal_recommendation" in INTENT_SYSTEM
    assert "không nhắc tên bệnh" in INTENT_SYSTEM

    rendered = intent_prompt.format(patient_context="Không có hồ sơ", query="Tối nay nên ăn như nào?")
    assert '"task_kind"' in rendered


@pytest.mark.asyncio
async def test_router_dua_bua_an_vao_luong_education(monkeypatch):
    llm = RunnableLambda(
        lambda _: SimpleNamespace(content='{"intent":"education","scope":"in_scope","task_kind":"meal_recommendation"}')
    )
    monkeypatch.setattr(intent_router, "get_fast_llm", lambda: llm)

    result = await intent_router.intent_router_node(
        {
            "query": "Tối nay nên ăn như nào?",
            "patient_profile": {"primary_condition": "hypertension"},
        }
    )

    assert result["intent"] == "education"
    assert result["scope"] == "in_scope"
    assert result["task_kind"] == "meal_recommendation"
