"""AgentState — shared state schema cho toàn bộ LangGraph pipeline."""
from __future__ import annotations

from typing import Literal, TypedDict


class AgentState(TypedDict, total=False):
    """Immutable-style state được truyền qua tất cả LangGraph nodes.

    total=False → tất cả fields đều optional (node chỉ set fields nó cần).
    """

    # ── Input (từ ChatRequest) ───────────────────────────────────────────────
    query: str                          # câu hỏi gốc của người dùng
    patient_id: str                     # "anonymous" nếu không có auth
    patient_profile: dict               # PatientProfile.model_dump()
    messages: list[dict]                # lịch sử hội thoại [{role, content}]

    # ── Routing ─────────────────────────────────────────────────────────────
    intent: Literal["education", "red_flag", "diagnosis"]
    is_red_flag: bool

    # ── Preprocessing ────────────────────────────────────────────────────────
    resolved_query: str                 # sau coref_resolution
    rewritten_query: str                # sau query_rewrite (ghép patient_profile)

    # ── Retrieval ───────────────────────────────────────────────────────────
    retrieved_docs: list[dict]          # raw docs từ Qdrant [{content, metadata}]
    relevant_strips: list[dict]         # docs sau CRAG filter

    # ── Generation ──────────────────────────────────────────────────────────
    analysis: str                       # chain-of-thought reasoning (internal)
    response: str                       # câu trả lời cuối gửi về FE
    citations: list[dict]               # [{doc_id, title, source, snippet}]

    # ── Verification (Self-RAG) ─────────────────────────────────────────────
    support_level: Literal["fully", "partially", "no_support"]
    unsupported_sentences: list[str]    # câu chưa có nguồn

    # ── Control flow ─────────────────────────────────────────────────────────
    retry_count: int                    # số lần partial_rewrite đã thực hiện

    # ── Meta ────────────────────────────────────────────────────────────────
    error: str | None
    metadata: dict                      # timing, token counts, node trace, v.v.
