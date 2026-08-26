"""LangGraph v2 — safety, one preprocessing call, retrieval, generate+verify."""

from __future__ import annotations

from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from src.agent.nodes.generation.answer_verifier import answer_verifier_node
from src.agent.nodes.generation.generate_and_verify import generate_and_verify_node
from src.agent.nodes.generation.memory_checkpoint import memory_checkpoint_node
from src.agent.nodes.generation.profile_handler import profile_handler_node
from src.agent.nodes.preprocessing.query_preprocessor import query_preprocessor_node
from src.agent.nodes.retrieval.doctor_referral import doctor_referral_node
from src.agent.nodes.retrieval.hybrid_retrieval import hybrid_retrieval_node
from src.agent.nodes.safety.emergency_handler import emergency_handler_node
from src.agent.nodes.safety.intent_router import intent_router_node
from src.agent.nodes.safety.out_of_domain_handler import out_of_domain_handler_node
from src.agent.nodes.safety.refuse_handler import refuse_handler_node
from src.agent.state import AgentState


def route_intent(state: AgentState) -> str:
    """Định tuyến an toàn trước khi query chạm vào retrieval hoặc LLM quality."""
    if state.get("is_red_flag"):
        return "emergency_handler"

    intent = state.get("intent", "education")
    if intent in ("diagnosis", "prompt_injection"):
        return "refuse_handler"
    if intent in ("greeting", "out_of_domain"):
        return "out_of_domain_handler"
    if intent == "profile":
        return "profile_handler"
    return "query_preprocessor"


def route_retrieval(state: AgentState) -> str:
    """Không có tài liệu thì không được gọi node sinh câu trả lời."""
    return "generate_and_verify" if state.get("retrieved_docs") else "doctor_referral"


def route_generation(state: AgentState) -> str:
    """Chỉ câu trả lời bám nguồn và đúng trọng tâm mới đi tới output."""
    if not state.get("answers_question", False):
        return "doctor_referral"
    if state.get("support_level") not in {"fully", "partially"}:
        return "doctor_referral"
    return "memory_checkpoint"


def build_graph() -> CompiledStateGraph:
    """Biên dịch pipeline v2 với kiểm chứng độc lập trước khi phát đáp án.

    Happy path dùng bốn LLM calls: intent router, query preprocessor, generation
    và verifier độc lập. Các nhánh emergency/refusal/greeting/profile kết thúc
    trước retrieval theo nguyên tắc safety-first.
    """
    graph = StateGraph(AgentState)

    # Gate 1 — Safety and intent
    graph.add_node("intent_router", intent_router_node)
    graph.add_node("emergency_handler", emergency_handler_node)
    graph.add_node("refuse_handler", refuse_handler_node)
    graph.add_node("out_of_domain_handler", out_of_domain_handler_node)
    graph.add_node("profile_handler", profile_handler_node)

    # Gate 2–5 — Context, retrieval, generate, independent verification
    graph.add_node("query_preprocessor", query_preprocessor_node)
    graph.add_node("hybrid_retrieval", hybrid_retrieval_node)
    graph.add_node("generate_and_verify", generate_and_verify_node)
    graph.add_node("answer_verifier", answer_verifier_node)
    graph.add_node("doctor_referral", doctor_referral_node)

    # Gate 5 — finalization
    graph.add_node("memory_checkpoint", memory_checkpoint_node)

    graph.set_entry_point("intent_router")
    graph.add_conditional_edges(
        "intent_router",
        route_intent,
        {
            "emergency_handler": "emergency_handler",
            "refuse_handler": "refuse_handler",
            "out_of_domain_handler": "out_of_domain_handler",
            "profile_handler": "profile_handler",
            "query_preprocessor": "query_preprocessor",
        },
    )
    graph.add_edge("query_preprocessor", "hybrid_retrieval")
    graph.add_conditional_edges(
        "hybrid_retrieval",
        route_retrieval,
        {
            "generate_and_verify": "generate_and_verify",
            "doctor_referral": "doctor_referral",
        },
    )
    graph.add_edge("generate_and_verify", "answer_verifier")
    graph.add_conditional_edges(
        "answer_verifier",
        route_generation,
        {
            "memory_checkpoint": "memory_checkpoint",
            "doctor_referral": "doctor_referral",
        },
    )

    for node in (
        "emergency_handler",
        "refuse_handler",
        "out_of_domain_handler",
        "profile_handler",
        "doctor_referral",
        "memory_checkpoint",
    ):
        graph.add_edge(node, END)

    return graph.compile()


# Singleton — graph chỉ chứa node thuần; persistence hội thoại vẫn nằm ở API.
agent = build_graph()
