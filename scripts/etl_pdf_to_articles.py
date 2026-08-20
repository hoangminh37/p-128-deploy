import argparse
import json
import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from langchain_community.document_loaders import PyPDFLoader
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field


class MicroArticle(BaseModel):
    title: str = Field(description="Tiêu đề bài học ngắn gọn, thân thiện với bệnh nhân (dưới 15 chữ)")
    content: str = Field(
        description="Nội dung bài học, diễn đạt cực kỳ dễ hiểu, bình dân, tránh thuật ngữ y khoa phức tạp. Độ dài khoảng 100-250 chữ."
    )
    category: str = Field(description="Danh mục bệnh (ví dụ: hypertension, type2_diabetes)")


class ArticleBatch(BaseModel):
    articles: list[MicroArticle]


def extract_and_transform(pdf_path: str, category: str, output_path: str):
    print("🚀 Bắt đầu quá trình ETL (Extract-Transform-Load) cho Thư Viện Y Khoa")
    print(f"📄 Đang đọc file PDF: {pdf_path}")

    try:
        loader = PyPDFLoader(pdf_path)
        docs = loader.load_and_split()
        print(f"✅ Đã trích xuất {len(docs)} trang/phân đoạn.")
    except Exception as e:
        print(f"❌ Lỗi đọc PDF: {e}. Vui lòng kiểm tra lại đường dẫn và đảm bảo đã cài pypdf.")
        return

    if not os.environ.get("OPENAI_API_KEY"):
        print("❌ Thiếu OPENAI_API_KEY trong file .env")
        return

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
    structured_llm = llm.with_structured_output(ArticleBatch)

    all_articles = []

    # Chỉ xử lý 10 chunks đầu tiên để test luồng, tránh tốn thời gian và tiền API.
    # Trong môi trường production, có thể bỏ [:10] để chạy toàn bộ file.
    test_limit = 10
    print(f"🧠 Đang dùng LLM gpt-4o-mini để biên dịch (Giới hạn {test_limit} chunks đầu tiên)...")

    for i, doc in enumerate(docs[:test_limit]):
        print(f" - Đang xử lý phân đoạn {i + 1}/{test_limit}...")
        prompt = f"""
Bạn là một chuyên gia giáo dục y tế tận tâm đang biên soạn "Sách giáo khoa mini" cho bệnh nhân.
Dưới đây là một trích đoạn từ Hướng dẫn Y khoa gốc của Bộ Y Tế (Rất hàn lâm).
Hãy đọc hiểu và bóc tách những thông tin quan trọng nhất thành 1 đến 3 bài học ngắn (Micro-learning) để bệnh nhân bình dân có thể đọc và tự hiểu dễ dàng.

Trích đoạn gốc:
{doc.page_content}

Yêu cầu:
- Giọng văn thân thiện, thấu cảm, xưng hô "Bạn" hoặc "Bác".
- Giải thích các thuật ngữ khó (ví dụ: HATT -> Huyết áp tâm thu) bằng ngôn ngữ đời thường.
- Tuyệt đối KHÔNG bịa đặt sai kiến thức y khoa gốc.
- Nếu đoạn này không chứa thông tin gì hữu ích cho giáo dục bệnh nhân (chỉ có mục lục, tên bác sĩ tham gia biên soạn...), hãy trả về mảng articles rỗng [].

Danh mục bệnh: {category}
        """
        try:
            res = structured_llm.invoke(prompt)
            if res and res.articles:
                all_articles.extend([a.model_dump() for a in res.articles])
                print(f"   -> Đã sinh ra {len(res.articles)} bài học.")
            else:
                print("   -> Bỏ qua (không có thông tin phù hợp).")
        except Exception as e:
            print(f"   ❌ Lỗi gọi LLM ở phân đoạn {i + 1}: {e}")

    # Lưu kết quả
    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(all_articles, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 Thành công! Đã tạo ra tổng cộng {len(all_articles)} bài học Micro-learning.")
    print(f"💾 File lưu tại: {output_path}")
    print("👉 Bước tiếp theo: Load dữ liệu này vào Database (bảng Article) của Backend.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=str, default="data/raw/vn-moh-3192-2010-htn.pdf")
    parser.add_argument("--category", type=str, default="hypertension")
    parser.add_argument("--out", type=str, default="data/processed/articles.json")
    args = parser.parse_args()

    extract_and_transform(args.pdf, args.category, args.out)
