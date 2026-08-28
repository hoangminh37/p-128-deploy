"""Trạng thái sẵn sàng của RAG trong tiến trình FastAPI hiện tại.

``check_vectorstore`` đã chạy lúc startup. Lưu kết quả ở đây để các request
không thử mở lại một Chroma đang lỗi/treo rồi giữ SSE của bệnh nhân vô hạn.
Trạng thái chỉ là cache runtime: restart server sẽ kiểm tra lại kho từ đầu.
"""

from __future__ import annotations

from dataclasses import dataclass
from threading import Lock


@dataclass(frozen=True)
class RagReadiness:
    ready: bool | None = None
    chunk_count: int = 0
    note: str = "chưa kiểm tra"


_lock = Lock()
_readiness = RagReadiness()


def set_rag_readiness(*, ready: bool, chunk_count: int, note: str) -> None:
    """Ghi kết quả preflight tại startup; không làm I/O trong request path."""
    global _readiness
    with _lock:
        _readiness = RagReadiness(ready=ready, chunk_count=chunk_count, note=note)


def get_rag_readiness() -> RagReadiness:
    """Đọc snapshot bất biến để node retrieval quyết định fail-fast an toàn."""
    with _lock:
        return _readiness
