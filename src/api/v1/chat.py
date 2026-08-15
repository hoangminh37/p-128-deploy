"""API v1 — chat endpoints: POST /chat (sync) + POST /chat/stream (SSE)."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from src.agent.graph import agent
from src.core.logging import get_logger
from src.schemas.chat import ChatRequest, ChatResponse

router = APIRouter()
logger = get_logger(__name__)

# Step event messages — hiển thị trên FE khi mỗi node bắt đầu
NODE_MESSAGES: dict[str, dict] = {
    "intent_router":    {"message": "🔍 Đang phân tích câu hỏi...",         "icon": "🔍"},
    "coref_resolution": {"message": "🔗 Đang xử lý ngữ cảnh hội thoại...", "icon": "🔗"},
    "query_rewrite":    {"message": "✏️ Đang tối ưu câu hỏi...",            "icon": "✏️"},
    "hybrid_retrieval": {"message": "📚 Đang tìm kiếm tài liệu y tế...",   "icon": "📚"},
    "crag_evaluator":   {"message": "🔬 Đang đánh giá độ liên quan...",     "icon": "🔬"},
    "llm_generate":     {"message": "✍️ Đang tổng hợp câu trả lời...",      "icon": "✍️"},
    "selfrag_verifier": {"message": "✅ Đang kiểm tra độ tin cậy...",       "icon": "✅"},
    "partial_rewrite":  {"message": "🔄 Đang tìm kiếm bổ sung...",          "icon": "🔄"},
    "safety_disclaimer":{"message": "⚠️ Đang thêm cảnh báo y tế...",       "icon": "⚠️"},
    "memory_checkpoint":{"message": "💾 Đang lưu kết quả...",               "icon": "💾"},
}


# ── POST /chat — synchronous (dùng để test, không streaming) ─────────────────

@router.post("/chat", response_model=ChatResponse, summary="Chat (sync)")
async def chat(request: ChatRequest) -> ChatResponse:
    """Gọi Medical AI Agent và trả về kết quả đầy đủ (không streaming).

    Dùng cho test hoặc client không hỗ trợ SSE.
    """
    try:
        state = request.to_agent_state()
        result = await agent.ainvoke(state)

        from src.schemas.patient import Citation
        citations = [Citation(**c) for c in result.get("citations", [])]

        return ChatResponse(
            response=result.get("response", ""),
            intent=result.get("intent", ""),
            support_level=result.get("support_level", "fully"),
            citations=citations,
        )
    except Exception as exc:
        logger.error("[chat] error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── POST /chat/stream — SSE streaming ────────────────────────────────────────

@router.post("/chat/stream", summary="Chat (SSE stream)")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    """Gọi Medical AI Agent với Server-Sent Events streaming.

    Phát 3 loại event:
    - ``step``: trạng thái từng node (realtime)
    - ``token``: từng từ của response đã verified
    - ``done``: citations + support_level + disclaimer
    """
    async def generate():
        state = request.to_agent_state()
        final_state: dict = {}

        try:
            # ── Step events (realtime per node) ──────────────────────────
            async for event in agent.astream_events(state, version="v2"):
                event_name = event.get("name", "")
                event_type = event.get("event", "")

                if event_type == "on_chain_start" and event_name in NODE_MESSAGES:
                    info = NODE_MESSAGES[event_name]
                    payload = json.dumps({
                        "node": event_name,
                        "message": info["message"],
                        "icon": info["icon"],
                    }, ensure_ascii=False)
                    yield f"event: step\ndata: {payload}\n\n"

                # Capture final state từ memory_checkpoint output
                if event_type == "on_chain_end" and event_name == "memory_checkpoint":
                    final_state = event.get("data", {}).get("output", {})

                # Fallback: lấy từ graph end event
                if event_type == "on_chain_end" and event_name == "__end__":
                    output = event.get("data", {}).get("output", {})
                    if output and not final_state:
                        final_state = output

            # ── Token events (word-by-word) ───────────────────────────────
            response_text = final_state.get("response", "")
            for word in response_text.split(" "):
                if word:
                    payload = json.dumps({"text": word + " "}, ensure_ascii=False)
                    yield f"event: token\ndata: {payload}\n\n"
                    await asyncio.sleep(0.025)  # ~40 words/sec

            # ── Done event ────────────────────────────────────────────────
            done_payload = json.dumps({
                "citations": final_state.get("citations", []),
                "support_level": final_state.get("support_level", "fully"),
                "intent": final_state.get("intent", ""),
                "disclaimer": "⚠️ Thông tin mang tính giáo dục. Tham khảo bác sĩ trước khi áp dụng."
                if final_state.get("support_level") != "fully" else "",
            }, ensure_ascii=False)
            yield f"event: done\ndata: {done_payload}\n\n"

        except Exception as exc:
            logger.error("[chat_stream] error: %s", exc)
            error_payload = json.dumps({"error": str(exc)}, ensure_ascii=False)
            yield f"event: error\ndata: {error_payload}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
