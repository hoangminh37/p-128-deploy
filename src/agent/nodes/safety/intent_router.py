"""Node: intent_router — Guardrail check + LLM intent classification."""

from __future__ import annotations

from src.agent.prompts.intent import intent_prompt
from src.agent.state import AgentState
from src.core.logging import get_logger
from src.services.guardrail.checker import classify_guardrail
from src.services.llm.factory import get_fast_llm

logger = get_logger(__name__)


async def intent_router_node(state: AgentState) -> AgentState:
    """Node 1 — phân loại intent.

    Logic:
    1. Rule-based guardrail check (nhanh, không tốn token)
    2. Nếu pass → LLM classify: education | red_flag | diagnosis
    """
    query = state.get("query", "")
    logger.info("[intent_router] query=%.80s", query)

    # ── Step 1: Fast rule-based check ──────────────────────────────────────
    guardrail_result = classify_guardrail(query)
    if guardrail_result == "red_flag":
        logger.warning("[intent_router] EMERGENCY detected (rule-based)")
        return {**state, "intent": "red_flag", "is_red_flag": True}

    if guardrail_result == "diagnosis":
        logger.warning("[intent_router] DIAGNOSIS request detected (rule-based)")
        return {**state, "intent": "diagnosis", "is_red_flag": False}

    # ── Step 2: LLM classify (chỉ khi rule-based pass) ──────────────────
    try:
        llm = get_fast_llm()
        chain = intent_prompt | llm
        result = await chain.ainvoke({"query": query})
        raw = result.content.strip().lower()

        # Parse LLM output — chỉ chấp nhận 4 giá trị hợp lệ
        valid_intents = {"education", "red_flag", "diagnosis", "out_of_domain"}
        intent = raw if raw in valid_intents else "education"
        is_red_flag = intent == "red_flag"

        logger.info("[intent_router] LLM intent=%s", intent)
        return {**state, "intent": intent, "is_red_flag": is_red_flag}

    except Exception as exc:
        logger.error("[intent_router] LLM failed, defaulting to education: %s", exc)
        return {**state, "intent": "education", "is_red_flag": False}
