"""Tests cho CRAG Evaluator — kiểm tra tính đúng đắn và tính song song.

CHẠY:
    # Từ thư mục gốc project:
    .venv/bin/python -m pytest tests/test_agents/test_crag_parallel.py -v --noconftest

Các nhóm test:
    TestEvaluateSingleDoc  — kiểm tra hàm helper _evaluate_single_doc
    TestCragParallelism    — kiểm tra tính song song thực sự (timing)
    TestCragEvaluatorNode  — kiểm tra toàn bộ node với các trường hợp biên
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.agent.nodes.retrieval.crag_evaluator import (
    _evaluate_single_doc,
    crag_evaluator_node,
)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_doc(doc_id: str, content: str = "nội dung tài liệu y tế") -> dict:
    """Tạo dict tài liệu mẫu."""
    return {"doc_id": doc_id, "content": content, "title": f"Tài liệu {doc_id}"}


def _make_chain(verdict: str = "relevant", delay_s: float = 0.0) -> AsyncMock:
    """Tạo mock chain trả về verdict cố định, tuỳ chọn có delay."""
    mock_result = MagicMock()
    mock_result.content = verdict

    chain = AsyncMock()

    async def _ainvoke(inputs):
        if delay_s > 0:
            await asyncio.sleep(delay_s)
        return mock_result

    chain.ainvoke = _ainvoke
    return chain


def _make_state(docs: list[dict], query: str = "bệnh tiểu đường") -> dict:
    """Tạo AgentState tối thiểu cho crag_evaluator_node."""
    return {"query": query, "retrieved_docs": docs}


# ── TestEvaluateSingleDoc ────────────────────────────────────────────────────


class TestEvaluateSingleDoc:
    """Kiểm tra hàm helper _evaluate_single_doc."""

    @pytest.mark.asyncio
    async def test_tra_ve_doc_khi_relevant(self):
        """LLM trả 'relevant' → hàm phải trả về chính doc đó."""
        doc = _make_doc("doc_0")
        chain = _make_chain("relevant")
        result = await _evaluate_single_doc(chain, "câu hỏi", doc)
        assert result is doc, "Phải trả về đúng object doc, không phải bản sao"

    @pytest.mark.asyncio
    async def test_tra_ve_none_khi_irrelevant(self):
        """LLM trả 'irrelevant' → hàm phải trả về None."""
        doc = _make_doc("doc_1")
        chain = _make_chain("irrelevant")
        result = await _evaluate_single_doc(chain, "câu hỏi", doc)
        assert result is None

    @pytest.mark.asyncio
    async def test_tra_ve_none_khi_co_ca_hai_tu(self):
        """Verdict chứa 'relevant' nhưng cũng chứa 'irrelevant' → phải irrelevant."""
        doc = _make_doc("doc_2")
        chain = _make_chain("This document is irrelevant to the query")
        result = await _evaluate_single_doc(chain, "câu hỏi", doc)
        assert result is None, "Khi có 'irrelevant' trong verdict phải bỏ qua doc"

    @pytest.mark.asyncio
    async def test_giu_lai_doc_khi_llm_loi(self):
        """LLM ném exception → hàm phải giữ doc lại (an toàn hơn là bỏ qua)."""
        doc = _make_doc("doc_err")
        chain = AsyncMock()
        chain.ainvoke.side_effect = RuntimeError("API timeout")

        result = await _evaluate_single_doc(chain, "câu hỏi", doc)
        assert result is doc, "Khi LLM lỗi phải giữ lại doc, không được bỏ"

    @pytest.mark.asyncio
    async def test_verdict_khong_phan_biet_hoa_thuong(self):
        """Verdict 'RELEVANT' (hoa) phải được nhận ra."""
        doc = _make_doc("doc_3")
        chain = _make_chain("RELEVANT - tài liệu phù hợp")
        result = await _evaluate_single_doc(chain, "câu hỏi", doc)
        assert result is doc

    @pytest.mark.asyncio
    async def test_content_duoc_truncate_800_ky_tu(self):
        """Nội dung dài phải được truncate ≤ 800 ký tự trước khi gửi LLM."""
        long_content = "x" * 2000
        doc = _make_doc("doc_long", content=long_content)
        chain = AsyncMock()
        mock_result = MagicMock()
        mock_result.content = "relevant"
        chain.ainvoke.return_value = mock_result

        await _evaluate_single_doc(chain, "câu hỏi", doc)

        # Kiểm tra ainvoke được gọi với document đã truncate
        call_args = chain.ainvoke.call_args[0][0]
        assert len(call_args["document"]) <= 800, (
            f"document phải ≤ 800 ký tự, nhưng nhận được {len(call_args['document'])}"
        )


# ── TestCragParallelism ──────────────────────────────────────────────────────


class TestCragParallelism:
    """Kiểm tra tính song song thực sự qua timing."""

    DELAY_PER_DOC = 0.2  # 200ms mỗi doc — đủ nhỏ để test nhanh
    NUM_DOCS = 5
    # Nếu song song: ~0.2s. Nếu tuần tự: ~1.0s
    # Ngưỡng: nhanh hơn tuần tự ít nhất 3× (tức < 0.35s với 5 docs × 200ms)
    PARALLEL_THRESHOLD_S = DELAY_PER_DOC * NUM_DOCS / 3

    @pytest.mark.asyncio
    async def test_n_docs_chay_nhanh_hon_tuan_tu(self):
        """5 docs × 200ms phải hoàn thành dưới 350ms nếu thật sự song song."""
        docs = [_make_doc(f"doc_{i}") for i in range(self.NUM_DOCS)]
        chain = _make_chain("relevant", delay_s=self.DELAY_PER_DOC)

        t0 = time.perf_counter()
        state = _make_state(docs)
        # Patch chain thực tế bằng cách mock get_fast_llm
        from unittest.mock import patch, MagicMock

        mock_llm = MagicMock()

        # Build mock chain pipe: crag_prompt | llm phải tạo ra mock_chain
        # Cách đơn giản nhất: mock toàn bộ get_fast_llm và kết quả pipe
        patched_chain = _make_chain("relevant", delay_s=self.DELAY_PER_DOC)

        with (
            patch(
                "src.agent.nodes.retrieval.crag_evaluator.get_fast_llm",
                return_value=mock_llm,
            ),
            patch(
                "src.agent.nodes.retrieval.crag_evaluator.crag_prompt",
            ) as mock_prompt,
        ):
            # crag_prompt | llm → trả về patched_chain
            mock_prompt.__or__ = lambda self_inner, other: patched_chain

            result_state = await crag_evaluator_node(state)

        elapsed = time.perf_counter() - t0

        assert elapsed < self.PARALLEL_THRESHOLD_S, (
            f"Song song phải chạy xong trong {self.PARALLEL_THRESHOLD_S * 1000:.0f}ms, "
            f"nhưng mất {elapsed * 1000:.0f}ms — có thể đang chạy tuần tự!"
        )
        assert "relevant_strips" in result_state

    @pytest.mark.asyncio
    async def test_ket_qua_giu_du_5_docs(self):
        """Với 5 docs relevant, kết quả phải có đủ 5 (thứ tự không quan trọng)."""
        docs = [_make_doc(f"doc_{i}") for i in range(5)]
        chain = _make_chain("relevant")

        from unittest.mock import patch, MagicMock

        mock_llm = MagicMock()
        mock_prompt_instance = MagicMock()
        mock_prompt_instance.__or__ = lambda self_inner, other: chain

        with (
            patch(
                "src.agent.nodes.retrieval.crag_evaluator.get_fast_llm",
                return_value=mock_llm,
            ),
            patch(
                "src.agent.nodes.retrieval.crag_evaluator.crag_prompt",
                mock_prompt_instance,
            ),
        ):
            result = await crag_evaluator_node(_make_state(docs))

        strips = result["relevant_strips"]
        assert len(strips) == 5, f"Mong đợi 5 docs relevant, nhận được {len(strips)}"


# ── TestCragEvaluatorNode ────────────────────────────────────────────────────


class TestCragEvaluatorNode:
    """Kiểm tra hành vi node tổng thể với các trường hợp biên."""

    @pytest.mark.asyncio
    async def test_khong_co_docs_tra_ve_rong(self):
        """Khi retrieved_docs rỗng, relevant_strips phải là []."""
        state = _make_state(docs=[])
        result = await crag_evaluator_node(state)
        assert result["relevant_strips"] == []

    @pytest.mark.asyncio
    async def test_state_goc_duoc_giu_lai(self):
        """Node phải giữ nguyên các field khác trong state."""
        state = {
            "query": "câu hỏi gốc",
            "retrieved_docs": [],
            "patient_profile": {"patient_id": "P001"},
            "intent": "education",
        }
        result = await crag_evaluator_node(state)
        assert result["query"] == "câu hỏi gốc"
        assert result["patient_profile"] == {"patient_id": "P001"}
        assert result["intent"] == "education"

    @pytest.mark.asyncio
    async def test_uu_tien_rewritten_query(self):
        """Nếu có rewritten_query, phải dùng nó thay vì query gốc."""
        # Import trước khi dùng — tránh UnboundLocalError do Python
        # đánh dấu biến local khi thấy import phía dưới trong cùng scope
        from unittest.mock import patch, MagicMock

        docs = [_make_doc("doc_0")]
        chain = AsyncMock()
        chain.ainvoke.return_value = MagicMock(content="relevant")

        state = {
            "query": "query gốc",
            "rewritten_query": "query đã được tối ưu",
            "retrieved_docs": docs,
        }

        mock_llm = MagicMock()
        mock_prompt_instance = MagicMock()
        mock_prompt_instance.__or__ = lambda self_inner, other: chain

        with (
            patch(
                "src.agent.nodes.retrieval.crag_evaluator.get_fast_llm",
                return_value=mock_llm,
            ),
            patch(
                "src.agent.nodes.retrieval.crag_evaluator.crag_prompt",
                mock_prompt_instance,
            ),
        ):
            await crag_evaluator_node(state)

        # Kiểm tra chain được gọi với rewritten_query, không phải query gốc
        call_args = chain.ainvoke.call_args[0][0]
        assert call_args["query"] == "query đã được tối ưu", (
            "Node phải dùng rewritten_query khi có, không phải query gốc"
        )

    @pytest.mark.asyncio
    async def test_mot_doc_loi_khong_lam_hong_cac_doc_khac(self):
        """Khi một doc bị exception, các doc còn lại vẫn được đánh giá."""
        docs = [_make_doc(f"doc_{i}") for i in range(3)]

        call_count = 0

        async def _selective_fail(inputs):
            nonlocal call_count
            call_count += 1
            doc_content = inputs["document"]
            if "doc_1" in doc_content or call_count == 2:
                raise RuntimeError("LLM lỗi cho doc_1")
            return MagicMock(content="relevant")

        chain = AsyncMock()
        chain.ainvoke = _selective_fail

        from unittest.mock import patch, MagicMock

        mock_llm = MagicMock()
        mock_prompt_instance = MagicMock()
        mock_prompt_instance.__or__ = lambda self_inner, other: chain

        with (
            patch(
                "src.agent.nodes.retrieval.crag_evaluator.get_fast_llm",
                return_value=mock_llm,
            ),
            patch(
                "src.agent.nodes.retrieval.crag_evaluator.crag_prompt",
                mock_prompt_instance,
            ),
        ):
            result = await crag_evaluator_node(_make_state(docs))

        # Phải có ≥ 2 docs: doc_0 và doc_2 relevant, doc_1 lỗi nhưng được giữ lại
        strips = result["relevant_strips"]
        assert len(strips) >= 2, (
            f"Lỗi 1 doc không được ảnh hưởng {len(docs) - 1} doc còn lại. Nhận được {len(strips)} docs."
        )

    @pytest.mark.asyncio
    async def test_loc_dung_doc_irrelevant(self):
        """Doc được đánh giá irrelevant phải bị loại khỏi relevant_strips."""
        from unittest.mock import patch, MagicMock

        # Nhúng doc_id vào content để _selective_verdict có thể phân biệt hai doc
        docs = [
            _make_doc("doc_ok", content="doc_ok: nội dung phù hợp với câu hỏi"),
            _make_doc("doc_bad", content="doc_bad: nội dung không liên quan"),
        ]

        async def _selective_verdict(inputs):
            """Trả irrelevant khi content chứa 'doc_bad', ngược lại relevant."""
            verdict = "irrelevant" if "doc_bad" in inputs["document"] else "relevant"
            return MagicMock(content=verdict)

        chain = AsyncMock()
        chain.ainvoke = _selective_verdict

        mock_llm = MagicMock()
        mock_prompt_instance = MagicMock()
        mock_prompt_instance.__or__ = lambda self_inner, other: chain

        with (
            patch(
                "src.agent.nodes.retrieval.crag_evaluator.get_fast_llm",
                return_value=mock_llm,
            ),
            patch(
                "src.agent.nodes.retrieval.crag_evaluator.crag_prompt",
                mock_prompt_instance,
            ),
        ):
            result = await crag_evaluator_node(_make_state(docs))

        ids = [d["doc_id"] for d in result["relevant_strips"]]
        assert "doc_ok" in ids, "doc_ok phải được giữ lại"
        assert "doc_bad" not in ids, "doc_bad phải bị lọc ra"
