"""Contract tests cho topology và routing của LangGraph v2."""

from src.agent.graph import agent, route_generation, route_intent, route_retrieval


def test_graph_chi_chua_cac_node_v2():
    names = set(agent.get_graph().nodes)

    assert {
        "intent_router",
        "emergency_handler",
        "refuse_handler",
        "out_of_domain_handler",
        "profile_handler",
        "query_preprocessor",
        "hybrid_retrieval",
        "generate_and_verify",
        "answer_verifier",
        "doctor_referral",
        "memory_checkpoint",
    } <= names
    assert (
        not {
            "coref_resolution",
            "query_rewrite",
            "crag_evaluator",
            "llm_generate",
            "selfrag_verifier",
            "partial_rewrite",
            "safety_disclaimer",
        }
        & names
    )


def test_safety_routing_ket_thuc_truoc_retrieval():
    assert route_intent({"is_red_flag": True}) == "emergency_handler"
    assert route_intent({"intent": "diagnosis"}) == "refuse_handler"
    assert route_intent({"intent": "prompt_injection"}) == "refuse_handler"
    assert route_intent({"intent": "greeting"}) == "out_of_domain_handler"
    assert route_intent({"intent": "profile"}) == "profile_handler"


def test_retrieval_va_generation_fail_closed():
    assert route_retrieval({"retrieved_docs": []}) == "doctor_referral"
    assert route_retrieval({"retrieved_docs": [{"content": "x"}]}) == "generate_and_verify"
    assert route_generation({"support_level": "no_support", "answers_question": True}) == "doctor_referral"
    assert route_generation({"support_level": "unknown", "answers_question": True}) == "doctor_referral"
    assert route_generation({"support_level": "fully", "answers_question": False}) == "doctor_referral"
    assert route_generation({"support_level": "partially", "answers_question": True}) == "memory_checkpoint"
