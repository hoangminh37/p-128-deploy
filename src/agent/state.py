"""AgentState — shared state schema cho toàn bộ LangGraph pipeline."""

from __future__ import annotations

from typing import Literal, TypedDict


class AgentState(TypedDict, total=False):
    """Immutable-style state được truyền qua tất cả LangGraph nodes.

    total=False → tất cả fields đều optional (node chỉ set fields nó cần).
    """

    # ── Input (từ ChatRequest) ───────────────────────────────────────────────
    query: str  # câu hỏi gốc của người dùng
    patient_id: str  # "anonymous" nếu không có auth
    patient_profile: dict  # PatientProfile.model_dump()
    messages: list[dict]  # lịch sử hội thoại [{role, content}]
    patient_routine: list[dict]  # routine bền vững, chỉ từ phát biểu rõ ràng của người bệnh

    # ── Routing ─────────────────────────────────────────────────────────────
    intent: Literal[
        "education",
        "red_flag",
        "diagnosis",
        "greeting",
        "out_of_domain",
        "profile",
        "prompt_injection",
        "doctor_referral",
    ]
    scope: Literal["in_scope", "out_of_scope"]  # phạm vi semantic, độc lập với intent an toàn
    task_kind: Literal[
        "health_education",
        "meal_recommendation",
        "activity_plan",
        "monitoring_plan",
        "appointment_preparation",
        "self_care_plan",
        "measurement_interpretation",
        "profile_question",
        "greeting",
        "out_of_scope",
        "safety",
    ]
    is_red_flag: bool
    ood_kind: Literal["greeting", "off_topic"]  # phân nhánh trong out_of_domain_handler

    # ── Preprocessing ────────────────────────────────────────────────────────
    preprocessed_query: str  # coreference + rewrite + patient profile, trong một LLM call
    routine_updates: list[dict]  # routine mới được trích từ câu hỏi hiện tại

    # ── Retrieval ───────────────────────────────────────────────────────────
    retrieved_docs: list[dict]  # tài liệu truy xuất [{content, metadata}]

    # ── Generation ──────────────────────────────────────────────────────────
    analysis: str  # reasoning nội bộ, không trả qua API
    response: str  # câu trả lời cuối gửi về FE
    citations: list[dict]  # [{doc_id, title, source, snippet}]

    # ── Verification (Self-RAG) ─────────────────────────────────────────────
    support_level: Literal["fully", "partially", "no_support"]
    answers_question: bool  # câu trả lời có đúng trọng tâm câu hỏi không

    # ── Meta ────────────────────────────────────────────────────────────────
    error: str | None
    metadata: dict  # timing, token counts, node trace, v.v.
