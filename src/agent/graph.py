"""LangGraph pipeline — kết nối 13 nodes với conditional edges."""

from __future__ import annotations

from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from src.agent.nodes.generation.llm_generate import llm_generate_node
from src.agent.nodes.generation.memory_checkpoint import memory_checkpoint_node
from src.agent.nodes.generation.partial_rewrite import partial_rewrite_node
from src.agent.nodes.generation.safety_disclaimer import safety_disclaimer_node
from src.agent.nodes.generation.selfrag_verifier import selfrag_verifier_node
from src.agent.nodes.preprocessing.coref_resolution import coref_resolution_node
from src.agent.nodes.preprocessing.query_rewrite import query_rewrite_node
from src.agent.nodes.retrieval.crag_evaluator import crag_evaluator_node
from src.agent.nodes.retrieval.doctor_referral import doctor_referral_node
from src.agent.nodes.retrieval.hybrid_retrieval import hybrid_retrieval_node
from src.agent.nodes.safety.emergency_handler import emergency_handler_node
from src.agent.nodes.safety.intent_router import intent_router_node
from src.agent.nodes.safety.refuse_handler import refuse_handler_node
from src.agent.state import AgentState

MAX_RETRIES = 2


# ── Routing functions ─────────────────────────────────────────────────────────


def route_intent(state: AgentState) -> str:
    """Route sau intent_router."""
    if state.get("is_red_flag"):
        return "emergency_handler"
    intent = state.get("intent", "education")
    if intent == "diagnosis":
        return "refuse_handler"
    return "coref_resolution"


def route_crag(state: AgentState) -> str:
    """Route sau crag_evaluator."""
    if not state.get("relevant_strips"):
        return "doctor_referral"
    return "llm_generate"


def route_selfrag(state: AgentState) -> str:
    """Route sau selfrag_verifier."""
    level = state.get("support_level", "fully")
    if level == "fully":
        return "memory_checkpoint"
    if level == "partially":
        return "partial_rewrite"
    return "safety_disclaimer"  # no_support


def route_partial(state: AgentState) -> str:
    """Route sau partial_rewrite — retry loop hoặc give up."""
    if state.get("retry_count", 0) <= MAX_RETRIES:
        return "hybrid_retrieval"
    return "memory_checkpoint"


# ── Graph builder ─────────────────────────────────────────────────────────────


def build_graph() -> CompiledStateGraph:
    """Xây dựng LangGraph StateGraph với 13 nodes và conditional edges."""
    g = StateGraph(AgentState)

    # ── Stage 1: Safety ────────────────────────────────────────────────────
    g.add_node("intent_router", intent_router_node)
    g.add_node("emergency_handler", emergency_handler_node)
    g.add_node("refuse_handler", refuse_handler_node)

    # ── Stage 2: Preprocessing ────────────────────────────────────────────
    g.add_node("coref_resolution", coref_resolution_node)
    g.add_node("query_rewrite", query_rewrite_node)

    # ── Stage 3: Retrieval ────────────────────────────────────────────────
    g.add_node("hybrid_retrieval", hybrid_retrieval_node)
    g.add_node("crag_evaluator", crag_evaluator_node)
    g.add_node("doctor_referral", doctor_referral_node)

    # ── Stage 4: Generation ───────────────────────────────────────────────
    g.add_node("llm_generate", llm_generate_node)
    g.add_node("selfrag_verifier", selfrag_verifier_node)
    g.add_node("partial_rewrite", partial_rewrite_node)
    g.add_node("safety_disclaimer", safety_disclaimer_node)
    g.add_node("memory_checkpoint", memory_checkpoint_node)

    # ── Entry point ───────────────────────────────────────────────────────
    g.set_entry_point("intent_router")

    # ── Conditional edges ─────────────────────────────────────────────────
    g.add_conditional_edges(
        "intent_router",
        route_intent,
        {
            "emergency_handler": "emergency_handler",
            "refuse_handler": "refuse_handler",
            "coref_resolution": "coref_resolution",
        },
    )

    g.add_conditional_edges(
        "crag_evaluator",
        route_crag,
        {
            "doctor_referral": "doctor_referral",
            "llm_generate": "llm_generate",
        },
    )

    g.add_conditional_edges(
        "selfrag_verifier",
        route_selfrag,
        {
            "memory_checkpoint": "memory_checkpoint",
            "partial_rewrite": "partial_rewrite",
            "safety_disclaimer": "safety_disclaimer",
        },
    )

    g.add_conditional_edges(
        "partial_rewrite",
        route_partial,
        {
            "hybrid_retrieval": "hybrid_retrieval",
            "memory_checkpoint": "memory_checkpoint",
        },
    )

    # ── Linear edges ──────────────────────────────────────────────────────
    g.add_edge("coref_resolution", "query_rewrite")
    g.add_edge("query_rewrite", "hybrid_retrieval")
    g.add_edge("hybrid_retrieval", "crag_evaluator")
    g.add_edge("llm_generate", "selfrag_verifier")
    g.add_edge("safety_disclaimer", "memory_checkpoint")

    # ── Terminal edges ────────────────────────────────────────────────────
    g.add_edge("emergency_handler", END)
    g.add_edge("refuse_handler", END)
    g.add_edge("doctor_referral", END)
    g.add_edge("memory_checkpoint", END)

    return g.compile()


# Singleton — khởi tạo một lần khi module được import
agent = build_graph()
