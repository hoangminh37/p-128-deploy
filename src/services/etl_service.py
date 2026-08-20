import os
from pathlib import Path

from langchain_community.document_loaders import PyPDFLoader
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from src.core.database import async_session_maker
from src.models.domain import EditorQueueItem


class MicroArticle(BaseModel):
    title: str = Field(description="Tiêu đề bài học ngắn gọn, thân thiện với bệnh nhân")
    content: str = Field(description="Nội dung bài học, diễn đạt dễ hiểu. Khoảng 100-250 chữ.")
    category: str = Field(description="Danh mục bệnh (ví dụ: hypertension, type2_diabetes)")


class ArticleBatch(BaseModel):
    articles: list[MicroArticle]


async def process_pdf_background(file_path: str, category: str):
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

    if not os.environ.get("OPENAI_API_KEY"):
        print("[ETL Background] Lỗi: Thiếu OPENAI_API_KEY")
        return

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
    structured_llm = llm.with_structured_output(ArticleBatch)

    test_limit = 5  # Giới hạn 5 chunk để tiết kiệm thời gian test
    generated_items = []

    print("[ETL Background] Đang chạy LLM gpt-4o-mini để sinh bài học...")
    for i, doc in enumerate(docs[:test_limit]):
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
