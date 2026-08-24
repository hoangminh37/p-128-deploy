"""LangGraph pipeline — kết nối 13 nodes với conditional edges."""

from __future__ import annotations

from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from src.agent.nodes.generation.llm_generate import llm_generate_node
from src.agent.nodes.generation.memory_checkpoint import memory_checkpoint_node
from src.agent.nodes.generation.partial_rewrite import partial_rewrite_node
from src.agent.nodes.generation.profile_handler import profile_handler_node
from src.agent.nodes.generation.safety_disclaimer import safety_disclaimer_node
from src.agent.nodes.generation.selfrag_verifier import selfrag_verifier_node
from src.agent.nodes.preprocessing.coref_resolution import coref_resolution_node
from src.agent.nodes.preprocessing.query_rewrite import query_rewrite_node
from src.agent.nodes.retrieval.crag_evaluator import crag_evaluator_node
from src.agent.nodes.retrieval.doctor_referral import doctor_referral_node
from src.agent.nodes.retrieval.hybrid_retrieval import hybrid_retrieval_node
from src.agent.nodes.safety.emergency_handler import emergency_handler_node
from src.agent.nodes.safety.intent_router import intent_router_node
from src.agent.nodes.safety.out_of_domain_handler import out_of_domain_handler_node
from src.agent.nodes.safety.refuse_handler import refuse_handler_node
from src.agent.state import AgentState

MAX_RETRIES = 2


# ── Routing functions ─────────────────────────────────────────────────────────


def route_intent(state: AgentState) -> str:
    """Route sau intent_router."""
    if state.get("is_red_flag"):
        return "emergency_handler"
    intent = state.get("intent", "education")
    if intent in ("diagnosis", "prompt_injection"):
        return "refuse_handler"
    if intent in ("greeting", "out_of_domain"):
        return "out_of_domain_handler"
    if intent == "profile":
        return "profile_handler"
    return "coref_resolution"


def route_crag(state: AgentState) -> str:
    """Route sau crag_evaluator."""
    if not state.get("relevant_strips"):
        return "doctor_referral"
    return "llm_generate"


def route_selfrag(state: AgentState) -> str:
    """Route sau selfrag_verifier.

    QUYẾT ĐỊNH SẢN PHẨM, đổi ngày 24/08/2026 theo yêu cầu của chủ dự án:

    ``no_support`` nay đi qua ``safety_disclaimer`` thay vì ``doctor_referral``.
    Nghĩa là câu trả lời VẪN ĐƯỢC GỬI ĐI, kèm cảnh báo nặng, thay vì bị vứt bỏ.

    Vì sao đổi: một câu hỏi thật đã sinh ra 2654 ký tự kèm 3 trích dẫn rồi bị
    loại sạch, và người bệnh nhận về "thư viện chưa có tài liệu về chủ đề này"
    — trong khi thư viện CÓ tài liệu về cao huyết áp và tiểu đường, chỉ thiếu
    phần bệnh tim và người dưới 18 tuổi. Thông báo đó vừa sai vừa làm sản phẩm
    vô dụng với phần lớn câu hỏi có nhiều bệnh cùng lúc.

    LƯU Ý: điều này NGƯỢC với ràng buộc số 1 trong docs/gate1/brief.md, mục
    "Ràng buộc an toàn — không thương lượng". Chủ dự án đã biết và vẫn quyết
    như vậy, với lập luận: người dùng nào cũng phải được phục vụ, và cảnh báo
    "chỉ mang tính tham khảo" là đủ cho nội dung giáo dục.

    HAI LẰN RANH GIỮ NGUYÊN, KHÔNG ĐỔI:

    - Cấp cứu (``is_red_flag``) vẫn ngắt luồng trước mọi thứ — xem ``route_intent``.
    - Xin chẩn đoán hay kê đơn vẫn bị từ chối — xem ``route_intent``.
    - ``answers_question = False`` vẫn sang ``doctor_referral``: câu trả lời nói
      sang chuyện khác thì gửi đi cũng không giúp được ai, chỉ gây nhiễu.
    """
    if not state.get("answers_question", True):
        return "doctor_referral"

    level = state.get("support_level", "fully")
    if level == "fully":
        return "memory_checkpoint"
    # partially VÀ no_support đều gửi đi kèm cảnh báo. Mức cảnh báo khác nhau —
    # xem safety_disclaimer_node.
    return "safety_disclaimer"


def route_partial(state: AgentState) -> str:
    """Route sau partial_rewrite — retry loop hoặc give up.

    Hết lượt retry mà vẫn "partially" thì đi qua safety_disclaimer: câu trả lời
    còn phần chưa có nguồn nên bắt buộc phải kèm cảnh báo trước khi gửi đi.
    """
    if state.get("retry_count", 0) <= MAX_RETRIES:
        return "hybrid_retrieval"
    return "safety_disclaimer"


# ── Graph builder ─────────────────────────────────────────────────────────────


def build_graph() -> CompiledStateGraph:
    """Xây dựng LangGraph StateGraph với 13 nodes và conditional edges."""
    g = StateGraph(AgentState)

    # ── Stage 1: Safety ────────────────────────────────────────────────────
    g.add_node("intent_router", intent_router_node)
    g.add_node("emergency_handler", emergency_handler_node)
    g.add_node("refuse_handler", refuse_handler_node)
    g.add_node("out_of_domain_handler", out_of_domain_handler_node)
    g.add_node("profile_handler", profile_handler_node)

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
            "out_of_domain_handler": "out_of_domain_handler",
            "profile_handler": "profile_handler",
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
            "safety_disclaimer": "safety_disclaimer",
            "doctor_referral": "doctor_referral",
        },
    )

    g.add_conditional_edges(
        "partial_rewrite",
        route_partial,
        {
            "hybrid_retrieval": "hybrid_retrieval",
            "safety_disclaimer": "safety_disclaimer",
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
    g.add_edge("out_of_domain_handler", END)
    g.add_edge("profile_handler", END)
    g.add_edge("doctor_referral", END)
    g.add_edge("memory_checkpoint", END)

    return g.compile()


# Singleton — khởi tạo một lần khi module được import
agent = build_graph()
