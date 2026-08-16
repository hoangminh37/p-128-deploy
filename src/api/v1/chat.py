"""API v1 — chat endpoints: POST /chat (sync) + POST /chat/stream (SSE)."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.agent.graph import agent
from src.api.v1.auth import get_current_user
from src.core.database import get_db
from src.core.logging import get_logger
from src.models.domain import Patient
from src.schemas.chat import ChatRequest, ChatResponse
from src.schemas.patient import UserInfo

router = APIRouter()
logger = get_logger(__name__)

# Step event messages — hiển thị trên FE khi mỗi node bắt đầu
NODE_MESSAGES: dict[str, dict] = {
    "intent_router": {"message": "Đang phân tích câu hỏi...", "icon": "🔍"},
    "coref_resolution": {"message": "Đang xử lý ngữ cảnh hội thoại...", "icon": "🔗"},
    "query_rewrite": {"message": "Đang tối ưu câu hỏi...", "icon": "✏️"},
    "hybrid_retrieval": {"message": "Đang tìm kiếm tài liệu y tế...", "icon": "📚"},
    "crag_evaluator": {"message": "Đang đánh giá độ liên quan...", "icon": "🔬"},
    "llm_generate": {"message": "Đang tổng hợp câu trả lời...", "icon": "✍️"},
    "selfrag_verifier": {"message": "Đang kiểm tra độ tin cậy...", "icon": "✅"},
    "partial_rewrite": {"message": "Đang tìm kiếm bổ sung...", "icon": "🔄"},
    "safety_disclaimer": {"message": "Đang thêm cảnh báo y tế...", "icon": "⚠️"},
    "memory_checkpoint": {"message": "Đang lưu kết quả...", "icon": "💾"},
    "refuse_handler": {"message": "Đang xử lý yêu cầu...", "icon": "🛑"},
    "out_of_domain_handler": {"message": "Đang phản hồi...", "icon": "👋"},
    "emergency_handler": {"message": "Đang xử lý khẩn cấp...", "icon": "🚨"},
    "doctor_referral": {"message": "Đang chuyển hướng chuyên gia...", "icon": "👨‍⚕️"},
    "profile_handler": {"message": "Đang kiểm tra hồ sơ bệnh án...", "icon": "👤"},
}


# ── POST /chat — synchronous (dùng để test, không streaming) ─────────────────


@router.post("/chat", response_model=ChatResponse, summary="Chat (sync)")
async def chat(
    request: ChatRequest, db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_current_user)
) -> ChatResponse:
    """Gọi Medical AI Agent và trả về kết quả đầy đủ (không streaming).

    Dùng cho test hoặc client không hỗ trợ SSE.
    """
    import time

    start_time = time.time()
    try:
        # Fetch real patient profile
        result = await db.execute(select(Patient).filter(Patient.id == request.patient_id))
        patient = result.scalars().first()
        if not patient:
            raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ bệnh nhân")

        patient_profile_dict = {
            "patient_id": patient.id,
            "age": patient.age,
            "primary_condition": patient.primary_condition,
            "comorbidities": patient.comorbidities,
            "diagnosed_at": patient.diagnosed_at,
            "asking_as": patient.asking_as,
        }

        state = request.to_agent_state(patient_profile_dict)
        result = await agent.ainvoke(state)

        from src.schemas.chat import Citation, ResponseMetadata

        # Ensure citations match the new schema
        raw_citations = result.get("citations", [])
        citations = []
        answer = result.get("response", "")
        for i, c in enumerate(raw_citations):
            cid = i + 1
            doc_id = c.get("doc_id")

            # Replace [doc_X] with [cid] in answer
            if doc_id and f"[{doc_id}]" in answer:
                answer = answer.replace(f"[{doc_id}]", f"[{cid}]")

            citations.append(
                Citation(
                    id=cid,
                    title=c.get("title", f"Tài liệu {cid}"),
                    issuer=c.get("issuer", "Cơ sở y tế"),
                    doc_code=c.get("doc_code"),
                    url=c.get("url"),
                    snippet=c.get("snippet", c.get("content", ""))[:300],
                )
            )

        # Map status based on agent intent/support_level
        intent = result.get("intent", "")
        support_level = result.get("support_level", "fully")
        is_red_flag = result.get("is_red_flag", False)

        from typing import Literal

        status: Literal["answered", "partial", "red_flag", "refused", "referral"]

        if is_red_flag:
            status = "red_flag"
        elif intent in ["diagnosis", "refusal"]:
            status = "refused"
        elif intent == "doctor_referral":
            status = "referral"
        elif intent in ["greeting", "out_of_domain", "profile", "prompt_injection"]:
            # Lời chào KHÔNG phải lời từ chối. Map sang "refused" khiến frontend
            # dựng khối màu từ chối cho một câu "Xin chào" — xem ResponseStates.
            status = "answered"
        elif support_level == "partially":
            status = "partial"
        else:
            status = "answered"

        latency_ms = int((time.time() - start_time) * 1000)

        # Đảm bảo answer luôn chứa marker [id] của mọi citation để qua cửa Zod schema của Frontend
        if citations and status not in ["red_flag", "refused", "referral"]:
            missing_markers = [f"[{c.id}]" for c in citations if f"[{c.id}]" not in answer]
            if missing_markers:
                answer = f"{answer.strip()} {''.join(missing_markers)}"

        # Nếu status là 3 loại này thì KHÔNG ĐƯỢC có citations (Zod schema bắt buộc rỗng)
        if status in ["red_flag", "refused", "referral"]:
            citations = []

        import uuid
        from datetime import datetime

        from src.models.domain import Conversation, Message

        # Save to DB
        conversation_id = request.conversation_id
        if not conversation_id:
            # Create new conversation
            conversation_id = f"c_{uuid.uuid4().hex[:6].upper()}"
            # Lấy 60 ký tự đầu làm title
            title = request.query[:60] if len(request.query) <= 60 else request.query[:57] + "..."
            new_conv = Conversation(
                id=conversation_id,
                patient_id=request.patient_id,
                title=title,
                last_message_at=datetime.utcnow(),
                message_count=2,
            )
            db.add(new_conv)
        else:
            # Update existing conversation
            conv_result = await db.execute(select(Conversation).filter(Conversation.id == conversation_id))
            existing_conv = conv_result.scalars().first()
            if existing_conv:
                existing_conv.last_message_at = datetime.utcnow()
                existing_conv.message_count += 2

        message_id = f"m_{uuid.uuid4().hex[:6].upper()}"

        # Add user message
        user_msg = Message(
            conversation_id=conversation_id,
            role="user",
            content=request.query,
        )
        db.add(user_msg)

        # Format citations for DB
        citations_db = []
        for c in citations:
            citations_db.append(
                {
                    "id": c.id,
                    "title": c.title,
                    "issuer": c.issuer,
                    "doc_code": c.doc_code,
                    "url": c.url,
                    "snippet": c.snippet,
                }
            )

        # Add assistant message
        assistant_msg = Message(
            id=message_id,
            conversation_id=conversation_id,
            role="assistant",
            status=status,
            content=answer,
            citations=citations_db,
            support_level=support_level if status in ["answered", "partial"] else None,
            disclaimer="⚠️ Thông tin mang tính giáo dục. Tham khảo bác sĩ trước khi áp dụng.",
        )
        db.add(assistant_msg)

        await db.commit()

        return ChatResponse(
            conversation_id=conversation_id,
            message_id=message_id,
            status=status,
            answer=answer,
            citations=citations,
            support_level=support_level if status in ["answered", "partial"] else None,
            disclaimer="⚠️ Thông tin mang tính giáo dục. Tham khảo bác sĩ trước khi áp dụng.",
            metadata=ResponseMetadata(latency_ms=latency_ms, cached=False),
        )
    except Exception as exc:
        logger.error("[chat] error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── POST /chat/stream — SSE streaming ────────────────────────────────────────


@router.post("/chat/stream", summary="Chat (SSE stream)")
async def chat_stream(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> StreamingResponse:
    """API streaming: Trả về SSE (Server-Sent Events) realtime. Gọi Medical AI Agent với Server-Sent Events streaming.

    Phát 3 loại event:
    - ``step``: trạng thái từng node (realtime)
    - ``token``: từng từ của response đã verified
    - ``done``: citations + support_level + disclaimer
    """

    async def generate():
        # Fetch real patient profile
        result = await db.execute(select(Patient).filter(Patient.id == request.patient_id))
        patient = result.scalars().first()
        if not patient:
            error_payload = json.dumps({"error": "Không tìm thấy hồ sơ bệnh nhân"}, ensure_ascii=False)
            yield f"event: error\ndata: {error_payload}\n\n"
            return

        patient_profile_dict = {
            "patient_id": patient.id,
            "age": patient.age,
            "primary_condition": patient.primary_condition,
            "comorbidities": patient.comorbidities,
            "diagnosed_at": patient.diagnosed_at,
            "asking_as": patient.asking_as,
        }

        state = request.to_agent_state(patient_profile_dict)
        final_state: dict = {}

        # ── Bộ đệm XML raw từ LLM ──────────────────────────────────────
        # LLM nhả output có dạng: <analysis>...</analysis><answer>...</answer>
        # Chiến lược: tìm chuỗi "<answer>", stream nội dung sau nó.
        import re
        _raw_buffer: str = ""    # Tích lũy toàn bộ text thô từ LLM
        _streamed_len: int = 0   # Số ký tụ answer đã yield
        _ANSWER_OPEN_RE = re.compile(r"<\s*answer\s*>(.*)", re.DOTALL | re.IGNORECASE)

        try:
            # ── Step events (realtime per node) ──────────────────────────
            async for event in agent.astream_events(state, version="v2"):
                event_name = event.get("name", "")
                event_type = event.get("event", "")

                if event_type == "on_chain_start" and event_name in NODE_MESSAGES:
                    info = NODE_MESSAGES[event_name]
                    payload = json.dumps(
                        {
                            "node": event_name,
                            "message": info["message"],
                            "icon": info["icon"],
                        },
                        ensure_ascii=False,
                    )
                    yield f"event: step\ndata: {payload}\n\n"

                # ── True Streaming: bắt token trực tiếp từ node llm_generate ──
                if event_type == "on_chat_model_stream":
                    # Chỉ xử lý token từ node tạo câu trả lời chính
                    # tránh nhầm token từ crag_evaluator, selfrag_verifier, v.v.
                    node_name = event.get("metadata", {}).get("langgraph_node", "")
                    if node_name != "llm_generate":
                        pass  # Bỏ qua token từ các node LLM khác
                    else:
                        chunk = event.get("data", {}).get("chunk")
                        if chunk and hasattr(chunk, "content") and chunk.content:
                            _raw_buffer += chunk.content

                            # Dùng regex tìm phần sau thẻ <answer>
                            m = _ANSWER_OPEN_RE.search(_raw_buffer)
                            if m:
                                raw_answer = m.group(1)
                                # Lọc bỏ thẻ đóng </answer> nếu LLM đã sinh xong
                                raw_answer = re.sub(r"<\s*/\s*answer\s*>", "", raw_answer, flags=re.IGNORECASE)
                                
                                # Chỉ yield phần mới tăng thêm
                                new_text = raw_answer[_streamed_len:]
                                if new_text:
                                    _streamed_len = len(raw_answer)
                                    payload = json.dumps({"text": new_text}, ensure_ascii=False)
                                    yield f"event: token\ndata: {payload}\n\n"

                # Trích xuất state từ bất kỳ node nào kết thúc
                if event_type == "on_chain_end":
                    output = event.get("data", {}).get("output", {})
                    if isinstance(output, dict) and "response" in output:
                        final_state.update(output)

            # Save to DB at the end
            import uuid
            from datetime import datetime

            from src.models.domain import Conversation, Message

            conversation_id = request.conversation_id
            if not conversation_id:
                conversation_id = f"c_{uuid.uuid4().hex[:6].upper()}"
                title = request.query[:60] if len(request.query) <= 60 else request.query[:57] + "..."
                new_conv = Conversation(
                    id=conversation_id,
                    patient_id=request.patient_id,
                    title=title,
                    last_message_at=datetime.utcnow(),
                    message_count=2,
                )
                db.add(new_conv)
            else:
                conv_result = await db.execute(select(Conversation).filter(Conversation.id == conversation_id))
                existing_conv = conv_result.scalars().first()
                if existing_conv:
                    existing_conv.last_message_at = datetime.utcnow()
                    existing_conv.message_count += 2

            message_id = f"m_{uuid.uuid4().hex[:6].upper()}"

            # User message
            db.add(
                Message(
                    conversation_id=conversation_id,
                    role="user",
                    content=request.query,
                )
            )

            # Format citations and replace markers
            citations_db = []
            final_answer = final_state.get("response", "")
            for i, c in enumerate(final_state.get("citations", [])):
                cid = i + 1
                doc_id = c.get("doc_id")
                
                if doc_id and f"[{doc_id}]" in final_answer:
                    final_answer = final_answer.replace(f"[{doc_id}]", f"[{cid}]")
                    
                citations_db.append(
                    {
                        "id": cid,
                        "title": c.get("title"),
                        "issuer": c.get("issuer"),
                        "doc_code": c.get("doc_code"),
                        "url": c.get("url"),
                        "snippet": c.get("snippet"),
                    }
                )

            status = "answered"
            intent = final_state.get("intent", "")
            support_level = final_state.get("support_level", "fully")
            is_red_flag = final_state.get("is_red_flag", False)
            answer = final_answer

            if is_red_flag:
                status = "red_flag"
            elif intent in ["diagnosis", "refusal"]:
                status = "refused"
            elif intent == "doctor_referral":
                status = "referral"
            elif intent in ["greeting", "out_of_domain", "profile", "prompt_injection"]:
                status = "answered"
            elif support_level == "partially":
                status = "partial"

            final_citations = citations_db if status not in ["red_flag", "refused", "referral"] else []
            final_support_level = support_level if status in ["answered", "partial"] else None
            disclaimer = "⚠️ Thông tin mang tính giáo dục. Tham khảo bác sĩ trước khi áp dụng." if support_level != "fully" else ""

            db.add(Message(
                id=message_id,
                conversation_id=conversation_id,
                role="assistant",
                status=status,
                content=answer,
                citations=final_citations,
                support_level=final_support_level,
                disclaimer=disclaimer
            ))

            await db.commit()

            # ── Done event ────────────────────────────────────────────────
            done_payload = json.dumps(
                {
                    "conversation_id": conversation_id,
                    "message_id": message_id,
                    "status": status,
                    "answer": answer,
                    "citations": final_citations,
                    "support_level": final_support_level,
                    "intent": intent,
                    "disclaimer": disclaimer,
                },
                ensure_ascii=False,
            )
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
