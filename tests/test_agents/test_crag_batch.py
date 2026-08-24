"""Tests cho CRAG Evaluator — bản chấm theo lô (một lượt gọi LLM cho cả lô).

THAY THẾ ``test_crag_parallel.py``. File cũ kiểm hàm ``_evaluate_single_doc``
và cách chạy song song bằng ``asyncio.gather`` — cả hai đã bị gỡ khi CRAG chuyển
sang chấm theo lô để cắt ``top_k`` lượt gọi xuống còn 1.

Những YÊU CẦU mà file cũ bảo vệ vẫn được giữ nguyên ở đây, chỉ đổi cách kiểm:

    - tài liệu liên quan thì giữ, không liên quan thì bỏ
    - LLM lỗi thì GIỮ LẠI tài liệu, không được bỏ
    - nội dung tài liệu bị cắt bớt trước khi vào prompt
    - danh sách rỗng đầu vào thì thoát sớm, không gọi LLM

Và thêm một yêu cầu mới mà bản một-doc-một-lượt không cần: phán quyết trả về là
văn bản tự do, nên phải phân biệt "mô hình bảo không có gì liên quan" với "không
đọc được mô hình nói gì".

CHẠY:
    .venv/bin/python -m pytest tests/test_agents/test_crag_batch.py -v
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agent.nodes.retrieval.crag_evaluator import (
    DOC_CHARS_IN_BATCH,
    _parse_verdict,
    crag_evaluator_node,
)


def make_docs(n: int) -> list[dict]:
    return [{"doc_id": f"doc_{i}", "content": f"Nội dung tài liệu {i}"} for i in range(n)]


def patched_chain(verdict: str | None = None, loi: Exception | None = None):
    """Thay `crag_batch_prompt | llm` bằng một chain giả.

    Trả về (context manager, mock chain) để test soi được prompt đã gửi đi.
    """
    chain = AsyncMock()
    if loi is not None:
        chain.ainvoke.side_effect = loi
    else:
        chain.ainvoke.return_value = MagicMock(content=verdict)

    prompt = MagicMock()
    prompt.__or__ = MagicMock(return_value=chain)

    ctx = patch.multiple(
        "src.agent.nodes.retrieval.crag_evaluator",
        crag_batch_prompt=prompt,
        get_fast_llm=MagicMock(return_value=MagicMock()),
    )
    return ctx, chain


# ── Đọc phán quyết ───────────────────────────────────────────────────────────


def test_doc_day_so_thanh_chi_so_0_based():
    assert _parse_verdict("1,3,4", total=5) == [0, 2, 3]


def test_none_nghia_la_khong_co_gi_lien_quan():
    """Khác hẳn 'không đọc được' — đây là mô hình đã quyết."""
    assert _parse_verdict("none", total=5) == []
    assert _parse_verdict("  NONE  ", total=5) == []


def test_khong_doc_duoc_thi_tra_ve_none():
    """Rỗng hay lảm nhảm đều là chưa có phán quyết dùng được."""
    assert _parse_verdict("", total=5) is None
    assert _parse_verdict("tôi không chắc lắm", total=5) is None


def test_so_ngoai_khoang_bi_bo_chu_khong_vut_ca_cau():
    """Mô hình đôi khi kèm một con số lạc — năm trong tài liệu, số dòng."""
    assert _parse_verdict("1, 2, 99", total=3) == [0, 1]


def test_so_trung_lap_bi_khu_va_giu_thu_tu():
    assert _parse_verdict("3,1,3,1", total=5) == [2, 0]


def test_toan_so_ngoai_khoang_coi_nhu_khong_doc_duoc():
    assert _parse_verdict("77, 88", total=3) is None


# ── Toàn node ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_giu_dung_tai_lieu_duoc_chon():
    ctx, _ = patched_chain("1,3")
    with ctx:
        state = await crag_evaluator_node({"query": "q", "retrieved_docs": make_docs(4)})

    assert [d["doc_id"] for d in state["relevant_strips"]] == ["doc_0", "doc_2"]


@pytest.mark.asyncio
async def test_chi_goi_llm_mot_lan_duy_nhat_cho_ca_lo():
    """Đây là lý do tồn tại của cả thay đổi này."""
    ctx, chain = patched_chain("1")
    with ctx:
        await crag_evaluator_node({"query": "q", "retrieved_docs": make_docs(8)})

    assert chain.ainvoke.await_count == 1


@pytest.mark.asyncio
async def test_llm_loi_thi_giu_lai_toan_bo():
    """Bỏ sót nguồn tốn kém hơn giữ thừa — giữ nguyên luật của bản cũ."""
    ctx, _ = patched_chain(loi=RuntimeError("Groq 429"))
    with ctx:
        state = await crag_evaluator_node({"query": "q", "retrieved_docs": make_docs(5)})

    assert len(state["relevant_strips"]) == 5


@pytest.mark.asyncio
async def test_phan_quyet_khong_doc_duoc_thi_giu_lai_toan_bo():
    ctx, _ = patched_chain("ừm để tôi xem đã")
    with ctx:
        state = await crag_evaluator_node({"query": "q", "retrieved_docs": make_docs(3)})

    assert len(state["relevant_strips"]) == 3


@pytest.mark.asyncio
async def test_none_thi_relevant_strips_rong():
    """Rỗng đẩy luồng xuống doctor_referral — đúng ý đồ, không phải lỗi."""
    ctx, _ = patched_chain("none")
    with ctx:
        state = await crag_evaluator_node({"query": "q", "retrieved_docs": make_docs(3)})

    assert state["relevant_strips"] == []


@pytest.mark.asyncio
async def test_khong_co_doc_thi_khong_goi_llm():
    ctx, chain = patched_chain("1")
    with ctx:
        state = await crag_evaluator_node({"query": "q", "retrieved_docs": []})

    assert state["relevant_strips"] == []
    chain.ainvoke.assert_not_awaited()


@pytest.mark.asyncio
async def test_noi_dung_tai_lieu_bi_cat_truoc_khi_vao_prompt():
    """Tám tài liệu dài nguyên bản sẽ làm loãng phán đoán và đội token."""
    docs = [{"doc_id": "d0", "content": "x" * 5000}]
    ctx, chain = patched_chain("1")
    with ctx:
        await crag_evaluator_node({"query": "q", "retrieved_docs": docs})

    gui_di = chain.ainvoke.await_args[0][0]["documents"]
    assert "x" * DOC_CHARS_IN_BATCH in gui_di
    assert "x" * (DOC_CHARS_IN_BATCH + 1) not in gui_di


@pytest.mark.asyncio
async def test_tai_lieu_duoc_danh_so_tu_1():
    """Prompt đánh số từ 1 còn mảng đánh từ 0 — lệch một là map sai tài liệu."""
    ctx, chain = patched_chain("1")
    with ctx:
        await crag_evaluator_node({"query": "q", "retrieved_docs": make_docs(3)})

    gui_di = chain.ainvoke.await_args[0][0]["documents"]
    assert "[Tài liệu 1]" in gui_di
    assert "[Tài liệu 3]" in gui_di
    assert "[Tài liệu 0]" not in gui_di
