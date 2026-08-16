"""Tests cho True Streaming buffer — kiểm tra logic regex extract answer từ JSON LLM.

CHẠY:
    # Từ thư mục gốc project:
    .venv/bin/python -m pytest tests/test_api/test_streaming_buffer.py -v --noconftest

Không cần server, không cần API key, không cần DB.
Toàn bộ test dùng mock để kiểm tra đúng logic buffer trong chat.py.

Các nhóm test:
    TestAnswerRegex         — kiểm tra regex _ANSWER_RE với nhiều dạng JSON đầu vào
    TestBufferLogic         — kiểm tra logic extract + yield incremental
    TestTokenContent        — kiểm tra nội dung token không chứa JSON artifact
    TestNodeFilter          — kiểm tra filter chỉ bắt token từ llm_generate
    TestEdgeCases           — các trường hợp biên (LLM ngắt kết nối, buffer rỗng...)
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from typing import AsyncGenerator

import pytest

# ── Regex được copy từ chat.py để test cô lập ────────────────────────────────
_ANSWER_RE = re.compile(r'"answer"\s*:\s*"((?:[^"\\]|\\.)*)"?', re.DOTALL)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_token_event(content: str, node: str = "llm_generate") -> dict:
    """Tạo event on_chat_model_stream giả."""
    class _Chunk:
        def __init__(self, c): self.content = c
    return {
        "event": "on_chat_model_stream",
        "name": "ChatGroq",
        "data": {"chunk": _Chunk(content)},
        "metadata": {"langgraph_node": node},
    }


def _make_end_event(response: str = "") -> dict:
    """Tạo event on_chain_end."""
    return {
        "event": "on_chain_end",
        "name": "llm_generate",
        "data": {"output": {"response": response, "citations": []}},
        "metadata": {"langgraph_node": "llm_generate"},
    }


async def _run_buffer(events: list[dict]) -> tuple[list[str], float | None]:
    """
    Chạy đúng logic buffer từ chat.py trên danh sách event.
    Trả về (tokens_yielded, ttft_ms).
    """
    _raw_buffer: str = ""
    _streamed_len: int = 0

    tokens: list[str] = []
    t_start = time.perf_counter()
    ttft_ms: float | None = None

    for event in events:
        event_type = event.get("event", "")
        if event_type != "on_chat_model_stream":
            continue
        node_name = event.get("metadata", {}).get("langgraph_node", "")
        if node_name != "llm_generate":
            continue
        chunk = event.get("data", {}).get("chunk")
        if not chunk or not chunk.content:
            continue

        _raw_buffer += chunk.content
        m = _ANSWER_RE.search(_raw_buffer)
        if m:
            raw_answer = m.group(1)
            try:
                decoded = json.loads(f'"{raw_answer}"')
            except json.JSONDecodeError:
                decoded = raw_answer.replace("\\n", "\n").replace('\\"', '"')
            new_text = decoded[_streamed_len:]
            if new_text:
                _streamed_len = len(decoded)
                tokens.append(new_text)
                if ttft_ms is None:
                    ttft_ms = (time.perf_counter() - t_start) * 1000

    return tokens, ttft_ms


def _tokenize(text: str, size: int = 3) -> list[str]:
    """Chia chuỗi thành tokens nhỏ kích thước `size` ký tự."""
    return [text[i:i+size] for i in range(0, len(text), size)]


# ── TestAnswerRegex ──────────────────────────────────────────────────────────

class TestAnswerRegex:
    """Kiểm tra _ANSWER_RE hoạt động đúng với nhiều dạng JSON."""

    def test_extract_answer_don_gian(self):
        buf = '{"analysis": "test", "answer": "Đây là câu trả lời", "claims": []}'
        m = _ANSWER_RE.search(buf)
        assert m is not None
        assert m.group(1) == "Đây là câu trả lời"

    def test_extract_khi_answer_chua_dong(self):
        """Buffer chưa nhận đủ JSON — answer chưa có dấu đóng \" vẫn match."""
        buf = '{"analysis": "test", "answer": "Đang nhả dần...'
        m = _ANSWER_RE.search(buf)
        assert m is not None
        assert "Đang nhả dần" in m.group(1)

    def test_answer_co_newline_escaped(self):
        """answer chứa \\n phải được nhận dạng."""
        buf = '{"analysis": "x", "answer": "Dòng 1\\nDòng 2", "claims": []}'
        m = _ANSWER_RE.search(buf)
        assert m is not None
        raw = m.group(1)
        decoded = json.loads(f'"{raw}"')
        assert decoded == "Dòng 1\nDòng 2"

    def test_answer_co_dau_ngoac_kep_escaped(self):
        """answer chứa \\" bên trong phải không bị nhầm là kết thúc."""
        buf = r'{"analysis":"x","answer":"Ông nói \"hello\"","claims":[]}'
        m = _ANSWER_RE.search(buf)
        assert m is not None
        raw = m.group(1)
        decoded = json.loads(f'"{raw}"')
        assert decoded == 'Ông nói "hello"'

    def test_khong_match_khi_chua_co_answer(self):
        """Buffer chỉ có analysis, chưa tới answer → không match."""
        buf = '{"analysis": "Suy luận từng bước...'
        m = _ANSWER_RE.search(buf)
        assert m is None

    def test_analysis_co_tu_answer_khong_nham(self):
        """Từ 'answer' xuất hiện trong analysis không được match nhầm."""
        buf = '{"analysis": "The answer is unclear", "answer": "Câu trả lời đúng"}'
        m = _ANSWER_RE.search(buf)
        assert m is not None
        # Phải lấy nội dung của trường "answer":, không phải của "analysis":
        assert m.group(1) == "Câu trả lời đúng"

    def test_answer_co_unicode_day_du(self):
        """Unicode đầy đủ tiếng Việt phải được giữ nguyên."""
        buf = '{"analysis":"x","answer":"Người bệnh tiểu đường","claims":[]}'
        m = _ANSWER_RE.search(buf)
        assert m is not None
        assert "Người bệnh tiểu đường" in m.group(1)


# ── TestBufferLogic ──────────────────────────────────────────────────────────

class TestBufferLogic:
    """Kiểm tra logic tích lũy buffer và yield incremental."""

    @pytest.mark.asyncio
    async def test_noi_dung_khop_sau_khi_gop_tokens(self):
        """Ghép tất cả tokens lại phải ra đúng nội dung answer."""
        llm_output = '{"analysis": "suy luận", "answer": "Câu trả lời hoàn chỉnh [doc_0].", "claims": []}'
        expected = json.loads(llm_output)["answer"]

        events = [_make_token_event(tok) for tok in _tokenize(llm_output, 4)]
        tokens, _ = await _run_buffer(events)

        assert "".join(tokens) == expected

    @pytest.mark.asyncio
    async def test_khong_co_token_truoc_khi_gap_answer(self):
        """Không được yield gì trước khi buffer chứa 'answer':'."""
        # Chỉ gửi phần analysis, chưa tới answer
        partial = '{"analysis": "suy luận từng bước rất dài...'
        events = [_make_token_event(tok) for tok in _tokenize(partial, 3)]
        tokens, ttft = await _run_buffer(events)

        assert tokens == [], f"Chưa có answer → không được yield. Nhận được: {tokens}"
        assert ttft is None

    @pytest.mark.asyncio
    async def test_ttft_xuat_hien_truoc_khi_xong_toan_bo(self):
        """TTFT phải nhỏ hơn nhiều so với tổng thời gian chạy."""
        llm_output = (
            '{"analysis": "suy luận", '
            '"answer": "Câu trả lời dài cần nhiều thời gian nhả.", '
            '"claims": []}'
        )

        async def _gen():
            for tok in _tokenize(llm_output, 3):
                await asyncio.sleep(0.01)  # 10ms mỗi token
                yield tok

        _raw_buffer = ""
        _streamed_len = 0
        tokens = []
        t_start = time.perf_counter()
        ttft_ms = None

        async for tok in _gen():
            _raw_buffer += tok
            m = _ANSWER_RE.search(_raw_buffer)
            if m:
                raw = m.group(1)
                try:
                    decoded = json.loads(f'"{raw}"')
                except json.JSONDecodeError:
                    decoded = raw.replace("\\n", "\n")
                new_text = decoded[_streamed_len:]
                if new_text:
                    _streamed_len = len(decoded)
                    tokens.append(new_text)
                    if ttft_ms is None:
                        ttft_ms = (time.perf_counter() - t_start) * 1000

        total_ms = (time.perf_counter() - t_start) * 1000

        assert ttft_ms is not None, "Phải có ít nhất một token được yield"
        assert ttft_ms < total_ms * 0.8, (
            f"TTFT ({ttft_ms:.0f}ms) phải nhỏ hơn 80% tổng ({total_ms:.0f}ms) "
            "— người dùng thấy chữ trước khi pipeline xong"
        )

    @pytest.mark.asyncio
    async def test_chi_yield_phan_moi_tang_them(self):
        """Mỗi lần yield chỉ chứa phần TEXT MỚI, không lặp lại text cũ."""
        llm_output = '{"analysis":"x","answer":"ABCDEF","claims":[]}'
        events = [_make_token_event(tok) for tok in _tokenize(llm_output, 3)]

        tokens, _ = await _run_buffer(events)

        # Ghép lại phải đúng, không bị duplicate
        assert "".join(tokens) == "ABCDEF"
        # Không token nào được chứa lại nội dung của token trước
        combined = ""
        for tok in tokens:
            assert not combined.endswith(tok[:3]) or len(tok) <= 1, (
                f"Token '{tok}' có vẻ bị lặp lại phần đã yield trước"
            )
            combined += tok

    @pytest.mark.asyncio
    async def test_newline_escaped_duoc_decode_dung(self):
        """\\n trong JSON phải được decode thành newline thật."""
        llm_output = '{"analysis":"x","answer":"Dòng 1\\n\\nDòng 2","claims":[]}'
        expected = json.loads(llm_output)["answer"]  # "Dòng 1\n\nDòng 2"

        events = [_make_token_event(tok) for tok in _tokenize(llm_output, 3)]
        tokens, _ = await _run_buffer(events)

        full = "".join(tokens)
        assert full == expected, (
            f"Newline chưa được decode đúng.\n"
            f"Mong đợi: {repr(expected)}\n"
            f"Nhận được: {repr(full)}"
        )


# ── TestTokenContent ─────────────────────────────────────────────────────────

class TestTokenContent:
    """Kiểm tra token stream không bị lẫn JSON artifacts."""

    SAMPLE_LLM_OUTPUT = (
        '{"analysis": "Phân tích bệnh nhân.", '
        '"answer": "Bệnh nhân nên ăn nhạt [doc_0].", '
        '"claims": [{"cited_doc_id": "doc_0", "sentence": "ăn nhạt"}]}'
    )

    @pytest.mark.asyncio
    async def test_khong_co_tu_khoa_json_trong_token(self):
        """Token stream không được chứa các từ khoá JSON nội bộ."""
        events = [_make_token_event(tok) for tok in _tokenize(self.SAMPLE_LLM_OUTPUT, 4)]
        tokens, _ = await _run_buffer(events)
        full = "".join(tokens)

        forbidden = ['"analysis"', '"claims"', '"cited_doc_id"', '"sentence"']
        for word in forbidden:
            assert word not in full, (
                f"Chuỗi JSON '{word}' bị lọt vào token stream gửi về Frontend!"
            )

    @pytest.mark.asyncio
    async def test_khong_co_dau_ngoac_mo_json_trong_token(self):
        """Ký tự {{ không được xuất hiện đầu token."""
        events = [_make_token_event(tok) for tok in _tokenize(self.SAMPLE_LLM_OUTPUT, 4)]
        tokens, _ = await _run_buffer(events)
        full = "".join(tokens)

        # Nội dung answer hợp lệ không bắt đầu bằng dấu ngoặc nhọn JSON
        assert not full.startswith("{"), (
            "Token đầu tiên không được là dấu ngoặc JSON"
        )

    @pytest.mark.asyncio
    async def test_noi_dung_khop_answer_trong_json(self):
        """Ghép tất cả tokens phải bằng đúng giá trị answer trong JSON."""
        expected = json.loads(self.SAMPLE_LLM_OUTPUT)["answer"]
        events = [_make_token_event(tok) for tok in _tokenize(self.SAMPLE_LLM_OUTPUT, 4)]
        tokens, _ = await _run_buffer(events)
        full = "".join(tokens)

        assert full == expected, (
            f"Nội dung token stream sai.\n"
            f"Mong đợi: {repr(expected)}\n"
            f"Nhận được: {repr(full)}"
        )

    @pytest.mark.asyncio
    async def test_citation_marker_duoc_giu_lai(self):
        """Marker [doc_0] trong answer phải được giữ nguyên trong token stream."""
        events = [_make_token_event(tok) for tok in _tokenize(self.SAMPLE_LLM_OUTPUT, 4)]
        tokens, _ = await _run_buffer(events)
        full = "".join(tokens)

        assert "[doc_0]" in full, "Citation marker [doc_0] phải được giữ lại trong token stream"


# ── TestNodeFilter ───────────────────────────────────────────────────────────

class TestNodeFilter:
    """Kiểm tra bộ lọc node_name == 'llm_generate'."""

    ANSWER_JSON = '{"analysis":"x","answer":"Câu trả lời thật","claims":[]}'

    @pytest.mark.asyncio
    async def test_bo_qua_token_tu_crag_evaluator(self):
        """Token từ node crag_evaluator không được yield ra ngoài."""
        # Gửi token từ crag_evaluator (LLM phụ)
        crag_json = '{"analysis":"x","answer":"CÂU TRẢ LỜI CRAG — KHÔNG NÊN THẤY","claims":[]}'
        crag_events = [_make_token_event(tok, node="crag_evaluator") for tok in _tokenize(crag_json, 3)]
        # Gửi token từ llm_generate (LLM chính)
        main_events = [_make_token_event(tok, node="llm_generate") for tok in _tokenize(self.ANSWER_JSON, 3)]

        tokens, _ = await _run_buffer(crag_events + main_events)
        full = "".join(tokens)

        assert "CÂU TRẢ LỜI CRAG" not in full, (
            "Token từ crag_evaluator bị lọt vào stream gửi về Frontend!"
        )
        assert "Câu trả lời thật" in full, (
            "Token từ llm_generate phải được yield"
        )

    @pytest.mark.asyncio
    async def test_bo_qua_token_tu_selfrag_verifier(self):
        """Token từ selfrag_verifier không được yield ra ngoài."""
        selfrag_json = '{"analysis":"x","answer":"KẾT QUẢ SELFRAG — KHÔNG NÊN THẤY","claims":[]}'
        selfrag_events = [_make_token_event(tok, node="selfrag_verifier") for tok in _tokenize(selfrag_json, 3)]
        main_events = [_make_token_event(tok, node="llm_generate") for tok in _tokenize(self.ANSWER_JSON, 3)]

        tokens, _ = await _run_buffer(selfrag_events + main_events)
        full = "".join(tokens)

        assert "KẾT QUẢ SELFRAG" not in full
        assert "Câu trả lời thật" in full

    @pytest.mark.asyncio
    async def test_khong_co_token_khi_khong_co_llm_generate(self):
        """Nếu không có event nào từ llm_generate, stream phải rỗng."""
        other_events = [
            _make_token_event('{"answer":"text"}', node="crag_evaluator"),
            _make_token_event('{"answer":"text"}', node="query_rewrite"),
        ]
        tokens, ttft = await _run_buffer(other_events)

        assert tokens == [], "Không có llm_generate → không được yield gì"
        assert ttft is None


# ── TestEdgeCases ─────────────────────────────────────────────────────────────

class TestEdgeCases:
    """Các trường hợp biên và dữ liệu bất thường."""

    @pytest.mark.asyncio
    async def test_answer_rong(self):
        """answer rỗng '' không được gây lỗi."""
        llm_output = '{"analysis":"x","answer":"","claims":[]}'
        events = [_make_token_event(tok) for tok in _tokenize(llm_output, 3)]
        tokens, ttft = await _run_buffer(events)
        # Không crash, tokens có thể rỗng hoặc không
        assert isinstance(tokens, list)

    @pytest.mark.asyncio
    async def test_buffer_rong_khong_crash(self):
        """Không có event nào không gây lỗi."""
        tokens, ttft = await _run_buffer([])
        assert tokens == []
        assert ttft is None

    @pytest.mark.asyncio
    async def test_token_rong_bi_bo_qua(self):
        """Token rỗng '' không được tạo ra output."""

        class EmptyChunk:
            content = ""

        events = [{"event": "on_chat_model_stream", "data": {"chunk": EmptyChunk()}, "metadata": {"langgraph_node": "llm_generate"}}]
        tokens, ttft = await _run_buffer(events)
        assert tokens == []

    @pytest.mark.asyncio
    async def test_answer_nhieu_doan_chia_boi_newline(self):
        """answer nhiều đoạn với \\n\\n phải decode đúng."""
        llm_output = (
            '{"analysis":"x",'
            '"answer":"Đoạn 1.\\n\\nĐoạn 2.\\n\\nĐoạn 3.",'
            '"claims":[]}'
        )
        expected = json.loads(llm_output)["answer"]
        events = [_make_token_event(tok) for tok in _tokenize(llm_output, 3)]
        tokens, _ = await _run_buffer(events)
        full = "".join(tokens)

        assert full == expected
        # Phải có đúng hai cặp newline
        assert full.count("\n\n") == 2, (
            f"Mong đợi 2 cặp \\n\\n, nhận được {full.count(chr(10)+chr(10))}"
        )

    @pytest.mark.asyncio
    async def test_answer_co_ky_tu_dac_biet(self):
        """answer có dấu ngoặc vuông, ngoặc tròn, %, ≥ phải giữ nguyên."""
        llm_output = (
            '{"analysis":"x",'
            '"answer":"HbA1c ≥ 7% [doc_0]. Tỷ lệ (50%) giảm.",'
            '"claims":[]}'
        )
        expected = json.loads(llm_output)["answer"]
        events = [_make_token_event(tok) for tok in _tokenize(llm_output, 4)]
        tokens, _ = await _run_buffer(events)
        full = "".join(tokens)

        assert full == expected, f"Ký tự đặc biệt bị mất: {repr(full)} vs {repr(expected)}"
