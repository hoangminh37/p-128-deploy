import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from langchain_community.document_loaders import PyPDFLoader  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from src.core.config import get_settings  # noqa: E402
from src.services.llm.factory import get_quality_llm  # noqa: E402


class Quiz(BaseModel):
    question: str = Field(description="Câu hỏi trắc nghiệm ôn tập kiến thức bài học")
    options: list[str] = Field(description="Danh sách 4 đáp án dưới dạng chuỗi")
    correct_index: int = Field(description="Vị trí đáp án đúng (từ 0 đến 3)")
    explanation: str = Field(
        default="",
        description=(
            "1-2 câu ngắn gọn giải thích VÌ SAO đáp án đó đúng, viết cho người bệnh đọc, "
            "không dùng thuật ngữ chuyên môn. Đây là thứ người trả lời SAI sẽ đọc, nên "
            "phải nói được cái ý mà họ đang hiểu nhầm chứ không chỉ nhắc lại đáp án."
        ),
    )


class MicroArticle(BaseModel):
    title: str = Field(description="Tiêu đề bài học ngắn gọn, thân thiện với bệnh nhân (dưới 15 chữ)")
    full_content: str = Field(
        description="""Nội dung bài học chi tiết, format Markdown. Yêu cầu:
- Dài ít nhất 500-800 chữ
- Dùng ## cho tiêu đề mục, ### cho tiêu đề phụ
- Dùng **in đậm** cho thuật ngữ quan trọng
- Dùng > blockquote cho lời khuyên hoặc cảnh báo quan trọng
- Phải có ít nhất 1 ví dụ thực tế so sánh dễ hiểu (ví dụ: 'Hãy tưởng tượng...' hoặc 'Ví dụ: Anh Minh 55 tuổi...')
- Giải thích rõ ràng từng thuật ngữ y khoa khi xuất hiện lần đầu
- Giọng văn thân thiện, ấm áp, xưng 'Bạn'
- Kết thúc bằng mục '## Điểm cần nhớ' tóm tắt 3-5 ý chính bằng bullet points"""
    )
    content: str = Field(
        description="Bản tóm tắt siêu ngắn (khoảng 80-100 chữ) dùng cho banner micro-learning hàng ngày."
    )
    category: str = Field(description="Danh mục bệnh (ví dụ: hypertension, type2_diabetes)")
    quiz: Quiz | None = Field(
        default=None,
        description="Câu hỏi trắc nghiệm 4 đáp án, đánh giá hiểu biết thực sự, không hỏi theo kiểu máy móc",
    )


class ArticleBatch(BaseModel):
    articles: list[MicroArticle]


def extract_and_transform(pdf_path: str, category: str, output_path: str, chunk_limit: int = 10):
    print("🚀 Bắt đầu quá trình ETL (Extract-Transform-Load) cho Thư Viện Y Khoa")
    print(f"📄 Đang đọc file PDF: {pdf_path}")
    origin_source = Path(pdf_path).name

    try:
        loader = PyPDFLoader(pdf_path)
        docs = loader.load_and_split()
        print(f"✅ Đã trích xuất {len(docs)} trang/phân đoạn.")
    except Exception as e:
        print(f"❌ Lỗi đọc PDF: {e}. Vui lòng kiểm tra lại đường dẫn và đảm bảo đã cài pypdf.")
        return

    # Đi qua factory chứ không dựng ChatOpenAI thẳng: bản trước khoá cứng vào
    # OpenAI nên bỏ qua LLM_PROVIDER trong .env, và script chết theo hạn mức
    # OpenAI dù cả hệ thống đang chạy trên Groq.
    settings = get_settings()
    try:
        structured_llm = get_quality_llm().with_structured_output(ArticleBatch)
    except Exception as e:
        print(f"❌ Không khởi tạo được LLM: {e}")
        return

    all_articles = []

    tong = min(chunk_limit, len(docs))
    print(f"🧠 Đang dùng {settings.model_name} để biên dịch ({tong}/{len(docs)} phân đoạn)...")

    for i, doc in enumerate(docs[:chunk_limit]):
        print(f" - Đang xử lý phân đoạn {i + 1}/{tong}...")
        prompt = f"""Bạn là chuyên gia giáo dục y tế, biên soạn "Sách giáo khoa bệnh nhân" từ Hướng dẫn Y khoa chính thức của Bộ Y Tế Việt Nam.

TRÍCH ĐOẠN GỐC TỪ TÀI LIỆU Y KHOA:
{doc.page_content}

NHIỆM VỤ: Chuyển đổi nội dung trên thành các bài học dễ hiểu cho bệnh nhân.

YÊU CẦU CHẤT LƯỢNG CHO TỪNG BÀI HỌC:

1. **full_content** — Bài viết đầy đủ (ít nhất 500 chữ), PHẢI có:
   - Các mục rõ ràng với ## heading
   - Ít nhất 1 ví dụ thực tế sinh động: "Ví dụ: Ông Nam 60 tuổi bị tiểu đường..." hoặc tương tự
   - Giải thích mọi thuật ngữ y khoa bằng ngôn ngữ đời thường ngay khi xuất hiện
   - Blockquote cho cảnh báo/lời khuyên quan trọng: > ⚠️ **Lưu ý:**...
   - Mục "## Điểm cần nhớ" cuối bài với 3-5 bullet points tóm tắt
   - Giọng thân thiện, xưng "Bạn"

2. **content** — Tóm tắt 80-100 chữ cho banner nhỏ

3. **quiz** — Câu hỏi kiểm tra hiểu biết THỰC SỰ (không hỏi máy móc), 4 đáp án.
   Bắt buộc kèm **explanation**: 1-2 câu ngắn, dễ hiểu, nói rõ vì sao đáp án đó đúng.
   Viết cho người vừa trả lời SAI đọc — nêu đúng chỗ dễ hiểu nhầm, đừng chỉ chép lại đáp án.

QUAN TRỌNG:
- Tuyệt đối KHÔNG bịa thêm thông tin y khoa ngoài tài liệu gốc
- Nếu đoạn không có thông tin hữu ích cho bệnh nhân → trả về mảng articles rỗng []
- Mỗi chunk chỉ sinh 1-2 bài học thật sự chất lượng, không cần nhiều mà thiếu chiều sâu

Danh mục bệnh: {category}"""
        try:
            res = structured_llm.invoke(prompt)
            if res and res.articles:
                for a in res.articles:
                    article_dict = a.model_dump()
                    article_dict["origin_source"] = origin_source

                    # Convert quiz to quiz_data structure for DB
                    if article_dict.get("quiz"):
                        article_dict["quiz_data"] = article_dict.pop("quiz")
                    else:
                        article_dict["quiz_data"] = None
                        article_dict.pop("quiz", None)

                    all_articles.append(article_dict)
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
    parser.add_argument(
        "--chunk-limit",
        type=int,
        default=10,
        help="Số phân đoạn đầu tiên đưa qua LLM. Đặt lớn để bóc hết tài liệu.",
    )
    args = parser.parse_args()

    extract_and_transform(args.pdf, args.category, args.out, args.chunk_limit)
