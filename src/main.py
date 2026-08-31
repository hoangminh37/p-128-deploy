"""FastAPI application factory — Medical AI Agent."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.router import router
from src.core.config import get_settings
from src.core.database import (
    ensure_consultation_schema,
    ensure_editorial_response_schema,
    ensure_patient_profile_schema,
    ensure_routine_memory_schema,
)
from src.core.logging import get_logger

logger = get_logger(__name__)


def check_vectorstore() -> tuple[bool, int, str]:
    """Đếm số chunk trong kho vector. Trả về (sẵn sàng, số chunk, ghi chú).

    VÌ SAO KIỂM LÚC KHỞI ĐỘNG:

    Kho rỗng KHÔNG gây lỗi ở đâu cả. `hybrid_retrieval` trả 0 doc, rồi
    `route_retrieval` đưa mọi câu hỏi xuống `doctor_referral`.
    Người dùng thấy "tôi không đủ tài liệu, hãy gặp bác sĩ" — một câu trả lời hợp
    lệ, đúng thiết kế, và che kín việc kho tài liệu không hề được nạp.

    Chuyện này đã xảy ra thật: `data/vectorstore/` từng nằm trong .gitignore
    trong khi CI deploy chỉ đẩy những gì git theo dõi.
    """
    try:
        from src.rag.store import VectorStore

        count = VectorStore().count()
    except Exception as exc:  # pragma: no cover — kho hỏng hoặc thiếu thư viện
        return False, 0, f"không mở được kho vector: {exc}"

    if count == 0:
        return False, 0, "kho vector RỖNG — mọi câu hỏi giáo dục sẽ rơi xuống doctor_referral"
    return True, count, "ok"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("Starting %s in %s mode", settings.app_name, settings.app_env)
    logger.info("LLM provider: %s | model: %s", settings.llm_provider, settings.model_name)
    await ensure_routine_memory_schema()
    await ensure_patient_profile_schema()
    await ensure_consultation_schema()
    await ensure_editorial_response_schema()

    # BackgroundTasks không sống qua restart. Đừng để một dòng "đang index"
    # cũ trông như job còn chạy: đánh dấu bền vững để BTV nhìn thấy lỗi và chủ
    # động retry, còn Registry.approved() vẫn giữ hàng rào không cho agent dùng.
    from src.rag.ingest import recover_interrupted_indexes

    interrupted = await asyncio.to_thread(recover_interrupted_indexes)
    if interrupted:
        logger.warning("RAG: %d job index bị gián đoạn, chờ biên tập viên thử lại", len(interrupted))

    ready, count, note = check_vectorstore()
    # Retrieval đọc snapshot này trước khi mở Chroma. Nếu preflight đã thất bại
    # thì mỗi câu hỏi phải fail-closed ngay, không được thử lại index hỏng và
    # làm SSE đứng mãi ở bước tìm tài liệu.
    from src.rag.runtime import set_rag_readiness

    set_rag_readiness(ready=ready, chunk_count=count, note=note)
    if ready:
        logger.info("RAG: %d chunk trong kho vector", count)
    else:
        # Không chặn khởi động: luồng chat vẫn chạy được cho các nhánh không cần
        # truy xuất (cấp cứu, từ chối, hồ sơ), và chặn app lại thì mất luôn cả
        # những nhánh đó. Nhưng phải hét thật to trong log.
        logger.error("=" * 70)
        logger.error("RAG CHƯA SẴN SÀNG: %s", note)
        logger.error("Kiểm: data/vectorstore/ có lên tới container không?")
        logger.error("=" * 70)

    yield
    logger.info("Shutting down %s", settings.app_name)


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        description="Medical AI Agent — FastAPI + LangGraph | RAG Pipeline với Safety Guardrails",
        version="2.0.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # CORS
    origins = [orig.strip() for orig in settings.cors_origins.split(",") if orig.strip()]
    if "*" in origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # Routes
    app.include_router(router, prefix="/api")

    return app


app = create_app()
