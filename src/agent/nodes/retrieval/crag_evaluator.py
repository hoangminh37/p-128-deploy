"""Node: crag_evaluator — CRAG lọc tài liệu không liên quan, MỘT lượt gọi cho cả lô.

LỊCH SỬ VÀ LÝ DO ĐỔI:

Bản trước chấm mỗi tài liệu một lượt gọi LLM, chạy song song bằng
``asyncio.gather``. Về thời gian thì tốt — O(1) theo lượt gọi chậm nhất. Nhưng
về SỐ LƯỢNG request thì vẫn là ``top_k`` request rời rạc cho một câu hỏi, mà
``top_k`` là 8 rồi tăng lên 12, 16 qua các vòng retry.

Cộng với 5 lượt của các node khác (intent, coref, rewrite, generate, verify),
một câu hỏi ngốn 13 lượt gọi ở trường hợp tốt và ~45 lượt khi retry hai vòng.
Đó là lý do hệ thống đâm vào hạn mức Groq chỉ với vài người dùng đồng thời.

Chấm theo lô đưa phần CRAG từ ``top_k`` lượt về **1 lượt**, tức 13 → 6 cho một
câu hỏi bình thường.

ĐÁNH ĐỔI đã cân nhắc: nhồi 8 tài liệu vào một prompt làm mô hình chấm kém sắc
hơn so với soi từng cái. Chấp nhận được, vì CRAG chỉ là bộ lọc thô — chốt chặn
thật là ``selfrag_verifier`` phía sau, nơi câu trả lời không bám nguồn sẽ bị
đẩy sang ``doctor_referral``. Và luật ở đây thiên về GIỮ LẠI khi phân vân, nên
sai số nghiêng về phía an toàn.
"""

from __future__ import annotations

import re
import time

from src.agent.prompts.generate import crag_batch_prompt
from src.agent.state import AgentState
from src.core.logging import get_logger
from src.services.llm.factory import get_fast_llm

logger = get_logger(__name__)

#: Số ký tự mỗi tài liệu đưa vào prompt. Thấp hơn bản một-doc-một-lượt (800) vì
#: giờ tất cả nằm chung một prompt — 8 x 800 là quá dài và làm loãng phán đoán.
DOC_CHARS_IN_BATCH = 500


def _parse_verdict(raw: str, total: int) -> list[int] | None:
    """Đọc dãy số LLM trả về thành các chỉ số 0-based.

    Trả ``None`` khi không đọc được — tầng trên sẽ giữ lại toàn bộ tài liệu.
    Phân biệt rõ với danh sách rỗng: "none" là mô hình đã quyết, còn không đọc
    được là mô hình chưa trả lời gì dùng được.
    """
    text = raw.strip().lower()
    if not text:
        return None
    if "none" in text and not any(ch.isdigit() for ch in text):
        return []

    so = [int(m) for m in re.findall(r"\d+", text)]
    # Bỏ số ngoài khoảng thay vì vứt cả câu trả lời: mô hình đôi khi kèm theo
    # một con số lạc (số thứ tự dòng, năm trong tài liệu).
    trong_khoang = [n - 1 for n in so if 1 <= n <= total]
    if not trong_khoang:
        return None

    # Khử trùng lặp, giữ thứ tự xuất hiện.
    da_thay: set[int] = set()
    ket_qua: list[int] = []
    for i in trong_khoang:
        if i not in da_thay:
            da_thay.add(i)
            ket_qua.append(i)
    return ket_qua


async def crag_evaluator_node(state: AgentState) -> AgentState:
    """Node 7 — lọc tài liệu không liên quan bằng một lượt gọi LLM duy nhất."""
    query = state.get("rewritten_query") or state.get("query", "")
    retrieved_docs = state.get("retrieved_docs", [])

    if not retrieved_docs:
        logger.info("[crag_evaluator] no docs to evaluate → doctor_referral")
        return {**state, "relevant_strips": []}

    khoi = "\n\n".join(
        f"[Tài liệu {i}]\n{doc.get('content', '')[:DOC_CHARS_IN_BATCH]}"
        for i, doc in enumerate(retrieved_docs, start=1)
    )

    t0 = time.perf_counter()
    chain = crag_batch_prompt | get_fast_llm()

    try:
        result = await chain.ainvoke({"query": query, "documents": khoi})
        chon = _parse_verdict(result.content, len(retrieved_docs))
    except Exception as exc:
        logger.warning("[crag_evaluator] LLM lỗi: %s — giữ lại toàn bộ tài liệu", exc)
        chon = None

    if chon is None:
        # Không đọc được phán quyết. Giữ hết còn hơn đẩy nhầm một câu hỏi trả lời
        # được xuống doctor_referral — cùng nguyên tắc "phân vân thì giữ" của bản cũ.
        relevant_strips = list(retrieved_docs)
        logger.warning("[crag_evaluator] không đọc được phán quyết — giữ cả %d doc", len(relevant_strips))
    else:
        relevant_strips = [retrieved_docs[i] for i in chon]

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    logger.info(
        "[crag_evaluator] %d/%d docs relevant | 1 lượt gọi LLM trong %d ms",
        len(relevant_strips),
        len(retrieved_docs),
        elapsed_ms,
    )

    return {**state, "relevant_strips": relevant_strips}
