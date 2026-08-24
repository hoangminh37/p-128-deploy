"""ETL nền: bóc tách PDF đã tải lên thành bài học chờ biên tập viên duyệt.

CẢNH BÁO HIỆU NĂNG — CHƯA SỬA, đã báo cho người phụ trách deploy (24/08/2026):

``editor.py`` gọi hàm này qua ``BackgroundTasks`` của FastAPI. Đó KHÔNG phải một
hàng đợi — nó chạy trong CÙNG process, CÙNG event loop với API, ngay sau khi
response được trả về.

Cộng thêm ``loader.load_and_split()`` ở dưới là code ĐỒNG BỘ gọi thẳng trong
coroutine, nên trong lúc bóc tách một PDF vài chục trang, **event loop bị chặn
hoàn toàn** — mọi bệnh nhân đang chat đều đứng hình, không phải chậm mà là đứng.

Hai cách xử lý, theo thứ tự công sức:

1. Bọc ``load_and_split()`` trong ``asyncio.to_thread`` — một dòng, gỡ được phần
   chặn nặng nhất. Các lượt gọi LLM phía sau vốn đã là ``await`` nên không chặn.
2. Đưa hẳn ra worker riêng (Celery/RQ/arq) nếu thư viện mở rộng thật.
"""

from pathlib import Path

from langchain_community.document_loaders import PyPDFLoader
from pydantic import BaseModel, Field

from src.core.config import get_settings
from src.core.database import async_session_maker
from src.core.exceptions import LLMError
from src.models.domain import EditorQueueItem
from src.services.llm.factory import get_quality_llm

#: Số chunk đầu tiên của tài liệu được đưa qua LLM.
#:
#: Đây từng là biến `test_limit = 5` viết thẳng trong hàm — một giới hạn đặt ra
#: để chạy thử cho nhanh, rồi ở lại thành hành vi thật. Hệ quả: tài liệu Bộ Y tế
#: vài trăm trang chỉ được đọc 5 chunk đầu, phần còn lại không bao giờ thành bài
#: học. Nay là tham số của hàm, giá trị dưới chỉ là mặc định.
DEFAULT_CHUNK_LIMIT = 5


class MicroArticle(BaseModel):
    title: str = Field(description="Tiêu đề bài học ngắn gọn, thân thiện với bệnh nhân")
    content: str = Field(description="Nội dung bài học, diễn đạt dễ hiểu. Khoảng 100-250 chữ.")
    category: str = Field(description="Danh mục bệnh (ví dụ: hypertension, type2_diabetes)")


class ArticleBatch(BaseModel):
    articles: list[MicroArticle]


async def process_pdf_background(file_path: str, category: str, chunk_limit: int = DEFAULT_CHUNK_LIMIT):
    """
    Background task to parse PDF, split to chunks, generate micro-articles,
    and save them as 'EditorQueueItem' for HITL review.
    """
    print(f"[ETL Background] Bắt đầu bóc tách tài liệu: {file_path}")

    try:
        loader = PyPDFLoader(file_path)
        docs = loader.load_and_split()
        print(f"[ETL Background] Đã trích xuất {len(docs)} chunks.")
    except Exception as e:
        print(f"[ETL Background] Lỗi đọc PDF: {e}")
        return

    # Đi qua factory thay vì dựng ChatOpenAI thẳng: bản trước khoá cứng vào
    # OpenAI nên bỏ qua LLM_PROVIDER, và cả luồng ETL chết theo hạn mức OpenAI
    # trong khi phần còn lại của hệ thống vẫn chạy ngon trên Groq.
    settings = get_settings()
    try:
        structured_llm = get_quality_llm().with_structured_output(ArticleBatch)
    except LLMError as exc:
        print(f"[ETL Background] Không khởi tạo được LLM: {exc}")
        return

    generated_items = []

    print(f"[ETL Background] Đang chạy {settings.model_name} để sinh bài học...")
    for i, doc in enumerate(docs[:chunk_limit]):
        prompt = f"""
Bạn là một chuyên gia giáo dục y tế tận tâm đang biên soạn "Sách giáo khoa mini" cho bệnh nhân.
Trích đoạn gốc từ Bộ Y Tế:
{doc.page_content}

Yêu cầu:
- Bóc tách thành 1-2 bài học Micro-learning.
- Giọng văn thân thiện, xưng hô "Bạn" hoặc "Bác".
- Nếu đoạn này không chứa thông tin hữu ích (chỉ là mục lục, tác giả...), trả về mảng rỗng [].
Danh mục bệnh: {category}
        """
        try:
            res = await structured_llm.ainvoke(prompt)
            if res and res.articles:
                generated_items.extend(res.articles)
                print(f"[ETL Background] Chunk {i + 1}: Sinh được {len(res.articles)} bài.")
            else:
                print(f"[ETL Background] Chunk {i + 1}: Bỏ qua.")
        except Exception as e:
            print(f"[ETL Background] Lỗi LLM ở Chunk {i + 1}: {e}")

    if not generated_items:
        print("[ETL Background] Không có bài học nào được sinh ra.")
        return

    print(f"[ETL Background] Đang lưu {len(generated_items)} bài học vào Editor Queue chờ duyệt...")
    async with async_session_maker() as session:
        try:
            for item in generated_items:
                queue_item = EditorQueueItem(
                    title=item.title,
                    content=item.content,
                    origin="editor_upload",
                    status="pending",
                    source_url=Path(file_path).name,
                    topics=[item.category],
                )
                session.add(queue_item)
            await session.commit()
            print("[ETL Background] ✅ Đã lưu vào Queue thành công!")
        except Exception as e:
            await session.rollback()
            print(f"[ETL Background] Lỗi Database: {e}")
