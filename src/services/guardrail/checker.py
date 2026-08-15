"""Guardrail checker — rule-based keyword matching (fast, no LLM)."""

from __future__ import annotations

from src.services.guardrail.keywords import DIAGNOSIS_KEYWORDS, EMERGENCY_KEYWORDS


def check_emergency(query: str) -> bool:
    """Trả về True nếu query chứa từ khóa khẩn cấp.

    Rule-based — không gọi LLM để đảm bảo tốc độ và tính an toàn.
    """
    q = query.lower()
    return any(kw in q for kw in EMERGENCY_KEYWORDS)


def check_diagnosis_request(query: str) -> bool:
    """Trả về True nếu query yêu cầu chẩn đoán hoặc kê toa.

    Rule-based — từ chối 100% theo FR3.4.
    """
    q = query.lower()
    return any(kw in q for kw in DIAGNOSIS_KEYWORDS)


def classify_guardrail(query: str) -> str | None:
    """Quick pre-check trước khi vào LangGraph.

    Returns:
        "red_flag"  — cần emergency handler
        "diagnosis" — cần refuse handler
        None        — an toàn, tiếp tục pipeline
    """
    if check_emergency(query):
        return "red_flag"
    if check_diagnosis_request(query):
        return "diagnosis"
    return None
