"""Node: crag_evaluator — LLM đánh giá từng doc relevant/irrelevant."""
from __future__ import annotations

from src.agent.prompts.generate import crag_prompt
from src.agent.state import AgentState
from src.core.logging import get_logger
from src.services.llm.factory import get_fast_llm

logger = get_logger(__name__)


async def crag_evaluator_node(state: AgentState) -> AgentState:
    """Node 7 — CRAG: Corrective RAG — lọc tài liệu không liên quan.

    Với mỗi retrieved_doc, gọi LLM đánh giá relevant/irrelevant.
    Kết quả: relevant_strips = danh sách doc relevant.
    """
    query = state.get("rewritten_query") or state.get("query", "")
    retrieved_docs = state.get("retrieved_docs", [])

    if not retrieved_docs:
        logger.info("[crag_evaluator] no docs to evaluate → doctor_referral")
        return {**state, "relevant_strips": []}

    llm = get_fast_llm()
    chain = crag_prompt | llm
    relevant_strips = []

    for doc in retrieved_docs:
        try:
            result = await chain.ainvoke({
                "query": query,
                "document": doc["content"][:800],  # truncate để tiết kiệm token
            })
            verdict = result.content.strip().lower()
            if "relevant" in verdict and "irrelevant" not in verdict:
                relevant_strips.append(doc)
                logger.debug("[crag_evaluator] doc=%s → relevant", doc["doc_id"])
            else:
                logger.debug("[crag_evaluator] doc=%s → irrelevant", doc["doc_id"])
        except Exception as exc:
            logger.warning("[crag_evaluator] LLM eval failed for doc %s: %s", doc.get("doc_id"), exc)
            # Khi LLM fail → giữ doc lại (an toàn hơn là bỏ)
            relevant_strips.append(doc)

    logger.info("[crag_evaluator] %d/%d docs relevant", len(relevant_strips), len(retrieved_docs))
    return {**state, "relevant_strips": relevant_strips}
