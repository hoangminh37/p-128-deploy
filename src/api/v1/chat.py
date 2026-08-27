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
from src.models.domain import Conversation, Message, Patient
from src.schemas.chat import ChatRequest, ChatResponse
from src.schemas.patient import UserInfo
from src.services.routine_memory import load_routine_memory, record_routine_updates

router = APIRouter()
logger = get_logger(__name__)

# Step event messages — hiển thị trên FE khi mỗi node bắt đầu
NODE_MESSAGES: dict[str, dict] = {
    "intent_router": {"message": "Đang phân tích câu hỏi...", "icon": "🔍"},
    "query_preprocessor": {"message": "Đang chuẩn bị ngữ cảnh câu hỏi...", "icon": "🔗"},
    "hybrid_retrieval": {"message": "Đang tìm kiếm tài liệu y tế...", "icon": "📚"},
    "generate_and_verify": {"message": "Đang tổng hợp và kiểm tra nguồn...", "icon": "✅"},
    "answer_verifier": {"message": "Đang kiểm chứng câu trả lời...", "icon": "✅"},
    "memory_checkpoint": {"message": "Đang lưu kết quả...", "icon": "💾"},
    "refuse_handler": {"message": "Đang xử lý yêu cầu...", "icon": "🛑"},
    "out_of_domain_handler": {"message": "Đang phản hồi...", "icon": "👋"},
    "emergency_handler": {"message": "Đang xử lý khẩn cấp...", "icon": "🚨"},
    "doctor_referral": {"message": "Đang chuyển hướng chuyên gia...", "icon": "👨‍⚕️"},
    "profile_handler": {"message": "Đang kiểm tra hồ sơ bệnh án...", "icon": "👤"},
}


async def _load_conversation_history(
    db: AsyncSession,
    *,
    patient_id: str,
    conversation_id: str | None,
    current_user: UserInfo,
) -> list[dict[str, str]]:
    """Authorize chat scope and load the six latest messages for coreference.

    A patient token may only invoke the graph with its own profile. Editors keep
    their cross-patient workflow, while an unknown or foreign conversation never
    becomes a target for new messages.
    """
    if current_user.role == "patient" and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Không có quyền dùng hồ sơ bệnh nhân này")
    if not conversation_id:
        return []

    conversation_result = await db.execute(
        select(Conversation).filter(Conversation.id == conversation_id, Conversation.patient_id == patient_id)
    )
    if not conversation_result.scalars().first():
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên hội thoại")

    messages_result = await db.execute(
        select(Message).filter(Message.conversation_id == conversation_id).order_by(Message.created_at.desc()).limit(6)
    )
    messages = list(reversed(messages_result.scalars().all()))
    return [{"role": message.role, "content": message.content} for message in messages]


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
        history = await _load_conversation_history(
            db,
            patient_id=request.patient_id,
            conversation_id=request.conversation_id,
            current_user=current_user,
        )
        routine_memory = await load_routine_memory(db, request.patient_id)
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
            "height_cm": patient.height_cm,
            "weight_kg": patient.weight_kg,
            "asking_as": patient.asking_as,
        }

        state = request.to_agent_state(patient_profile_dict, messages=history, patient_routine=routine_memory)
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
                    url=c.get("url") or None,
                    snippet=c.get("snippet", c.get("content", ""))[:300],
                    document_id=c.get("document_id") or None,
                    chunk_id=c.get("chunk_id") or None,
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
        elif intent in ["diagnosis", "prompt_injection", "refusal"]:
            status = "refused"
        elif intent == "doctor_referral":
            status = "referral"
        elif intent in ["greeting", "out_of_domain", "profile"]:
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

        # Red-flag không được lưu nội dung câu hỏi hay hồ sơ vào DB. API vẫn trả
        # ID tạm để frontend xử lý response như các trạng thái còn lại.
        if status == "red_flag":
            import uuid

            return ChatResponse(
                conversation_id=request.conversation_id or f"emergency_{uuid.uuid4().hex[:8]}",
                message_id=f"emergency_{uuid.uuid4().hex[:8]}",
                status=status,
                answer=answer,
                citations=[],
                support_level=None,
                disclaimer="⚠️ Tình huống có thể khẩn cấp. Hãy gọi 115 hoặc đến cơ sở cấp cứu gần nhất.",
                metadata=ResponseMetadata(latency_ms=latency_ms, cached=False),
            )

        await record_routine_updates(
            db,
            patient_id=request.patient_id,
            raw_updates=result.get("routine_updates", []),
            source_text=request.query,
        )

        import uuid
        from datetime import datetime

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
                    "document_id": c.document_id,
                    "chunk_id": c.chunk_id,
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
            meta_data=result.get("metadata", {}),
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
    except HTTPException:
        raise
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
    - ``annotations``: tooltip thuật ngữ, chạy sau done và không chặn câu trả lời
    """

    history = await _load_conversation_history(
        db,
        patient_id=request.patient_id,
        conversation_id=request.conversation_id,
        current_user=current_user,
    )
    routine_memory = await load_routine_memory(db, request.patient_id)

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
            "height_cm": patient.height_cm,
            "weight_kg": patient.weight_kg,
            "asking_as": patient.asking_as,
        }

        state = request.to_agent_state(patient_profile_dict, messages=history, patient_routine=routine_memory)
        final_state: dict = {}

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

                # Trích xuất state từ bất kỳ node nào kết thúc
                if event_type == "on_chain_end":
                    output = event.get("data", {}).get("output", {})
                    if isinstance(output, dict) and "response" in output:
                        final_state.update(output)

            # Red-flag kết thúc trước persistence: không ghi query hay profile
            # nhạy cảm vào conversation/message tables.
            if final_state.get("is_red_flag", False):
                import uuid

                answer = final_state.get("response", "")
                for start in range(0, len(answer), 80):
                    token_payload = json.dumps({"text": answer[start : start + 80]}, ensure_ascii=False)
                    yield f"event: token\ndata: {token_payload}\n\n"
                done_payload = json.dumps(
                    {
                        "conversation_id": request.conversation_id or f"emergency_{uuid.uuid4().hex[:8]}",
                        "message_id": f"emergency_{uuid.uuid4().hex[:8]}",
                        "status": "red_flag",
                        "answer": answer,
                        "citations": [],
                        "support_level": None,
                        "intent": "red_flag",
                        "disclaimer": "⚠️ Tình huống có thể khẩn cấp. Hãy gọi 115 hoặc đến cơ sở cấp cứu gần nhất.",
                    },
                    ensure_ascii=False,
                )
                yield f"event: done\ndata: {done_payload}\n\n"
                return

            # Save to DB at the end
            import uuid
            from datetime import datetime

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
                        "url": c.get("url") or None,
                        "snippet": c.get("snippet"),
                        "document_id": c.get("document_id") or None,
                        "chunk_id": c.get("chunk_id") or None,
                    }
                )

            status = "answered"
            intent = final_state.get("intent", "")
            support_level = final_state.get("support_level", "fully")
            is_red_flag = final_state.get("is_red_flag", False)
            answer = final_answer

            if is_red_flag:
                status = "red_flag"
            elif intent in ["diagnosis", "prompt_injection", "refusal"]:
                status = "refused"
            elif intent == "doctor_referral":
                status = "referral"
            elif intent in ["greeting", "out_of_domain", "profile"]:
                status = "answered"
            elif support_level == "partially":
                status = "partial"

            final_citations = citations_db if status not in ["red_flag", "refused", "referral"] else []
            final_support_level = support_level if status in ["answered", "partial"] else None
            disclaimer = (
                "⚠️ Thông tin mang tính giáo dục. Tham khảo bác sĩ trước khi áp dụng."
                if support_level != "fully"
                else ""
            )

            assistant_msg = Message(
                id=message_id,
                conversation_id=conversation_id,
                role="assistant",
                status=status,
                content=answer,
                citations=final_citations,
                support_level=final_support_level,
                disclaimer=disclaimer,
                meta_data=final_state.get("metadata", {}),
            )
            db.add(assistant_msg)

            await record_routine_updates(
                db,
                patient_id=request.patient_id,
                raw_updates=final_state.get("routine_updates", []),
                source_text=request.query,
            )

            await db.commit()

            # Chỉ phát token sau khi toàn bộ graph, gồm generate_and_verify và
            # routing NO_SUPPORT → referral, đã kết thúc. Không stream raw LLM.
            for start in range(0, len(answer), 80):
                token_payload = json.dumps({"text": answer[start : start + 80]}, ensure_ascii=False)
                yield f"event: token\ndata: {token_payload}\n\n"

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

            # ── Annotations event (bất đồng bộ, không block done) ─────────
            # Chỉ chạy cho câu trả lời có nội dung giáo dục thực sự.
            if status in ("answered", "partial") and answer and final_citations:
                try:
                    from src.agent.nodes.annotation.annotation_pipeline import run_annotation_pipeline
                    # Truyền retrieved_docs từ state để dùng làm fallback
                    # khi RAG search không tìm được định nghĩa riêng cho term
                    answer_chunks = [
                        {"content": d.get("content", ""), "chunk_id": d.get("chunk_id", ""), "document_id": d.get("document_id")}
                        for d in final_state.get("retrieved_docs", [])
                        if d.get("content")
                    ]
                    annotations = await run_annotation_pipeline(
                        answer=answer,
                        query=request.query,
                        answer_chunks=answer_chunks,
                    )
                    # Lưu cùng message để tooltip không biến mất khi bệnh nhân
                    # mở lại hội thoại. Không lưu audio/prompt mới, chỉ metadata
                    # đã grounded từ câu trả lời được phép hiển thị.
                    assistant_msg.meta_data = {
                        **(assistant_msg.meta_data or {}),
                        "term_annotations": annotations,
                    }
                    await db.commit()
                    ann_payload = json.dumps(
                        {"message_id": message_id, "annotations": annotations},
                        ensure_ascii=False,
                    )
                    yield f"event: annotations\ndata: {ann_payload}\n\n"
                    logger.info("[chat_stream] streamed %d annotations", len(annotations))
                except Exception as ann_exc:
                    # Annotation lỗi không được làm hỏng chat — im lặng bỏ qua
                    logger.warning("[chat_stream] annotation pipeline error: %s", ann_exc)

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
