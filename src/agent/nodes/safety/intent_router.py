"""Node: intent_router — Guardrail check + LLM intent classification."""

from __future__ import annotations

import asyncio
import json
import re

from src.agent.prompts.intent import intent_prompt
from src.agent.state import AgentState
from src.core.config import get_settings
from src.core.logging import get_logger
from src.services.guardrail.checker import classify_guardrail
from src.services.llm.factory import get_fast_llm

logger = get_logger(__name__)

VALID_INTENTS = {"education", "red_flag", "diagnosis", "greeting", "profile", "out_of_domain"}
VALID_TASK_KINDS = {
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
}
_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)
_LEGACY_DECISIONS = {
    "red_flag": ("red_flag", "in_scope", "safety"),
    "diagnosis": ("diagnosis", "in_scope", "safety"),
    "greeting": ("greeting", "in_scope", "greeting"),
    "profile": ("profile", "in_scope", "profile_question"),
    "out_of_domain": ("out_of_domain", "out_of_scope", "out_of_scope"),
    "education": ("education", "in_scope", "health_education"),
}


def _patient_context(state: AgentState) -> str:
    """Pass only the minimum context needed to recognise an in-scope request."""
    profile = state.get("patient_profile", {})
    conditions = [profile.get("primary_condition"), *(profile.get("comorbidities") or [])]
    known_conditions = [str(condition) for condition in conditions if condition]
    if not known_conditions:
        return "Chưa có bệnh nền trong hồ sơ."
    return f"Bệnh nền đã khai: {', '.join(known_conditions)}"


def parse_intent_decision(raw: str) -> tuple[str, str, str]:
    """Parse the narrow JSON contract and fail open to in-scope education.

    A malformed fast-model result must not wrongly reject a health/lifestyle
    question. Safety decisions made by the rule-based guardrail run before this
    parser and are therefore not weakened by the fail-open default.
    """
    candidate = raw.strip()
    if candidate.startswith("```"):
        candidate = candidate.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    legacy = _LEGACY_DECISIONS.get(candidate.lower())
    if legacy is not None:
        # Provider có thể tuân thủ hợp đồng v1 (một từ) trong lúc rollout prompt
        # JSON. Đặc biệt không được làm rơi `red_flag` về nhánh education.
        return legacy
    match = _JSON_OBJECT_RE.search(candidate)
    if match:
        candidate = match.group(0)

    try:
        decision = json.loads(candidate)
    except (json.JSONDecodeError, TypeError):
        return "education", "in_scope", "health_education"

    if not isinstance(decision, dict):
        return "education", "in_scope", "health_education"

    intent = str(decision.get("intent", "")).strip().lower()
    scope = str(decision.get("scope", "")).strip().lower()
    task_kind = str(decision.get("task_kind", "")).strip().lower()

    if intent not in VALID_INTENTS:
        return "education", "in_scope", "health_education"
    if intent == "out_of_domain" or scope == "out_of_scope":
        return "out_of_domain", "out_of_scope", "out_of_scope"
    if intent in {"red_flag", "diagnosis"}:
        return intent, "in_scope", "safety"
    if intent == "greeting":
        return "greeting", "in_scope", "greeting"
    if intent == "profile":
        return "profile", "in_scope", "profile_question"
    if task_kind not in VALID_TASK_KINDS or task_kind in {"greeting", "out_of_scope", "safety", "profile_question"}:
        task_kind = "health_education"
    return "education", "in_scope", task_kind


async def intent_router_node(state: AgentState) -> AgentState:
    """Node 1 — phân loại intent.

    Logic:
    1. Rule-based guardrail check (nhanh, không tốn token)
    2. Nếu pass → LLM trả scope + task_kind có cấu trúc
    """
    query = state.get("query", "")
    logger.info("[intent_router] processing query (%d chars)", len(query))

    # ── Step 1: Fast rule-based check ──────────────────────────────────────
    guardrail_result = classify_guardrail(query)
    if guardrail_result == "prompt_injection":
        logger.warning("[intent_router] PROMPT INJECTION detected (rule-based)")
        return {
            **state,
            "intent": "prompt_injection",
            "scope": "in_scope",
            "task_kind": "safety",
            "is_red_flag": False,
        }

    if guardrail_result == "red_flag":
        logger.warning("[intent_router] EMERGENCY detected (rule-based)")
        return {**state, "intent": "red_flag", "scope": "in_scope", "task_kind": "safety", "is_red_flag": True}

    if guardrail_result == "diagnosis":
        logger.warning("[intent_router] DIAGNOSIS request detected (rule-based)")
        return {**state, "intent": "diagnosis", "scope": "in_scope", "task_kind": "safety", "is_red_flag": False}

    if guardrail_result == "greeting":
        logger.info("[intent_router] GREETING detected (rule-based, không gọi LLM)")
        return {
            **state,
            "intent": "greeting",
            "scope": "in_scope",
            "task_kind": "greeting",
            "is_red_flag": False,
            "ood_kind": "greeting",
        }

    # ── Step 2: LLM classify (chỉ khi rule-based pass) ──────────────────
    try:
        llm = get_fast_llm()
        chain = intent_prompt | llm
        timeout_seconds = get_settings().llm_fast_timeout_seconds
        # HTTP timeout in ``get_fast_llm`` bounds the provider request.  The
        # coroutine timeout is a second guard for a stalled SDK/transport.
        async with asyncio.timeout(timeout_seconds):
            result = await chain.ainvoke({"query": query, "patient_context": _patient_context(state)})
        intent, scope, task_kind = parse_intent_decision(str(result.content))
        is_red_flag = intent == "red_flag"

        logger.info("[intent_router] LLM intent=%s | scope=%s | task=%s", intent, scope, task_kind)
        return {
            **state,
            "intent": intent,
            "scope": scope,
            "task_kind": task_kind,
            "is_red_flag": is_red_flag,
            "ood_kind": "greeting" if intent == "greeting" else "off_topic",
        }

    except TimeoutError:
        logger.warning("[intent_router] LLM timed out; defaulting to education")
        return {
            **state,
            "intent": "education",
            "scope": "in_scope",
            "task_kind": "health_education",
            "is_red_flag": False,
        }
    except Exception as exc:
        logger.error("[intent_router] LLM failed, defaulting to education: %s", exc)
        return {
            **state,
            "intent": "education",
            "scope": "in_scope",
            "task_kind": "health_education",
            "is_red_flag": False,
        }
