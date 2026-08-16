"""Node: crag_evaluator — LLM đánh giá từng doc relevant/irrelevant (song song)."""

from __future__ import annotations

import asyncio
import time

from src.agent.prompts.generate import crag_prompt
from src.agent.state import AgentState
from src.core.logging import get_logger
from src.services.llm.factory import get_fast_llm

logger = get_logger(__name__)


async def _evaluate_single_doc(chain, query: str, doc: dict) -> dict | None:
    """Đánh giá một tài liệu duy nhất — dùng để chạy song song qua asyncio.gather.

    Trả về:
        - doc   nếu LLM kết luận là relevant
        - None  nếu LLM kết luận là irrelevant
        - doc   nếu LLM lỗi (an toàn hơn là bỏ qua)
    """
    try:
        result = await chain.ainvoke(
            {
                "query": query,
                "document": doc["content"][:800],  # truncate để tiết kiệm token
            }
        )
        verdict = result.content.strip().lower()
        if "relevant" in verdict and "irrelevant" not in verdict:
            logger.debug("[crag_evaluator] doc=%s → relevant", doc.get("doc_id"))
            return doc
        else:
            logger.debug("[crag_evaluator] doc=%s → irrelevant", doc.get("doc_id"))
            return None
    except Exception as exc:
        logger.warning(
            "[crag_evaluator] LLM eval failed for doc %s: %s — giữ lại để an toàn",
            doc.get("doc_id"),
            exc,
        )
        # Khi LLM fail → giữ doc lại (an toàn hơn là bỏ)
        return doc


async def crag_evaluator_node(state: AgentState) -> AgentState:
    """Node 7 — CRAG: Corrective RAG — lọc tài liệu không liên quan.

    Tất cả các lời gọi LLM đánh giá tài liệu được chạy SONG SONG qua
    asyncio.gather, giảm thời gian từ O(n) xuống O(1) so với tốc độ
    mạng/LLM của lần gọi chậm nhất.
    """
    query = state.get("rewritten_query") or state.get("query", "")
    retrieved_docs = state.get("retrieved_docs", [])

    if not retrieved_docs:
        logger.info("[crag_evaluator] no docs to evaluate → doctor_referral")
        return {**state, "relevant_strips": []}

    llm = get_fast_llm()
    chain = crag_prompt | llm

    t0 = time.perf_counter()

    # Tạo danh sách coroutine cho tất cả tài liệu — chưa chạy
    tasks = [_evaluate_single_doc(chain, query, doc) for doc in retrieved_docs]

    # Chạy tất cả đồng thời; return_exceptions=True đảm bảo một lỗi
    # không làm hỏng các tài liệu còn lại
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Lọc kết quả: bỏ None (irrelevant), giữ dict (relevant hoặc lỗi)
    relevant_strips: list[dict] = []
    for doc, result in zip(retrieved_docs, results):
        if isinstance(result, Exception):
            # Nếu gather bắt được ngoại lệ chưa xử lý → giữ doc lại
            logger.warning(
                "[crag_evaluator] unhandled exception for doc %s: %s — giữ lại",
                doc.get("doc_id"),
                result,
            )
            relevant_strips.append(doc)
        elif result is not None:
            relevant_strips.append(result)

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    logger.info(
        "[crag_evaluator] %d/%d docs relevant | %d docs chạy song song trong %d ms",
        len(relevant_strips),
        len(retrieved_docs),
        len(retrieved_docs),
        elapsed_ms,
    )
    return {**state, "relevant_strips": relevant_strips}
