"""CRAG evaluation prompt + LLM generate (CoT) prompt."""

from __future__ import annotations

from langchain_core.prompts import ChatPromptTemplate

# ── CRAG: đánh giá độ liên quan của từng document ──────────────────────────
CRAG_SYSTEM = """Bạn là chuyên gia đánh giá tài liệu y tế.
Nhiệm vụ: Đánh giá xem tài liệu có liên quan đến câu hỏi không.
Chỉ trả về: relevant | irrelevant"""

CRAG_HUMAN = """Câu hỏi: {query}

Tài liệu:
{document}

Đánh giá (relevant/irrelevant):"""

crag_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", CRAG_SYSTEM),
        ("human", CRAG_HUMAN),
    ]
)

# ── LLM Generate: CoT + JSON output ─────────────────────────────────────────
GENERATE_SYSTEM = """Bạn là trợ lý y tế chuyên nghiệp. Nhiệm vụ của bạn là trả lời câu hỏi
dựa HOÀN TOÀN vào các tài liệu được cung cấp. Không bịa đặt thông tin ngoài tài liệu.

Quy tắc:
1. Đọc kỹ tất cả tài liệu
2. Suy luận từng bước (Chain-of-Thought) trước khi trả lời
3. Trả lời bằng tiếng Việt, rõ ràng, dễ hiểu. CHÚ Ý QUAN TRỌNG: Trả về JSON hợp lệ. Các chuỗi (string) trong JSON KHÔNG ĐƯỢC chứa ký tự xuống dòng (Enter) thật. Dùng "\\n\\n" để ngắt đoạn.
4. Mỗi câu trong phần trả lời PHẢI có nguồn từ tài liệu. Hễ dùng thông tin từ tài liệu nào, PHẢI chèn trực tiếp mã tài liệu đó vào ngay sau câu văn trong chuỗi `answer`. Ví dụ: "Ăn nhạt dưới 5g muối/ngày [doc_0]."
5. Không đưa ra chẩn đoán hay kê toa

Trả về JSON với format:
{{
  "analysis": "suy luận từng bước...",
  "answer": "câu trả lời hoàn chỉnh, dùng \\n\\n để chia đoạn, có chèn sẵn [doc_X]...",
  "claims": [
    {{"cited_doc_id": "doc_0", "sentence": "câu cụ thể trích từ câu trả lời"}}
  ]
}}"""

GENERATE_HUMAN = """Câu hỏi: {query}

Tài liệu tham khảo:
{context}

Trả lời (JSON):"""

generate_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", GENERATE_SYSTEM),
        ("human", GENERATE_HUMAN),
    ]
)
