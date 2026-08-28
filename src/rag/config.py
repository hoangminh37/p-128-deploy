"""Toàn bộ tham số điều chỉnh được của pipeline RAG — một chỗ duy nhất.

Đổi số ở đây rồi chạy lại `make rag-build` là đủ để thử nghiệm; không cần
sờ vào code xử lý. Mỗi tham số đều ghi rõ vì sao chọn giá trị đó, để khi
báo cáo đánh giá cần giải trình thì có sẵn lý do.

Đọc được từ biến môi trường bằng tiền tố `RAG_`, ví dụ `RAG_TOP_K=8`.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Thư mục gốc của repo, suy ra từ vị trí file này (src/rag/config.py -> lên 3 cấp).
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"


class RagSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="RAG_",
        extra="ignore",
    )

    # ---- Đường dẫn ----------------------------------------------------------
    registry_path: Path = DATA_DIR / "registry.yaml"
    raw_dir: Path = DATA_DIR / "raw"
    interim_dir: Path = DATA_DIR / "interim"
    processed_dir: Path = DATA_DIR / "processed"
    vectorstore_dir: Path = DATA_DIR / "vectorstore"

    # ---- Cắt chunk ----------------------------------------------------------
    # 500 token ~ 350-400 từ tiếng Việt: đủ dài để giữ trọn một khuyến cáo lâm
    # sàng kèm ngữ cảnh, đủ ngắn để không kéo nhiễu vào context window. Ngưỡng
    # này chọn theo cách MinerU-Popo mô tả ở mục 4.3: cắt tại ranh giới đoạn văn
    # chứ không cắt giữa câu.
    chunk_max_tokens: int = Field(default=500, ge=128, le=2000)
    # Chồng lấn 1 đoạn văn giữa hai chunk liền nhau, để câu bị cắt ở biên vẫn
    # còn nguyên ở một trong hai chunk.
    chunk_overlap_tokens: int = Field(default=80, ge=0, le=400)
    # Chunk hoàn chỉnh được giữ nếu ĐỦ DÀI hoặc ĐỦ SỐ TỪ — chỉ cần một trong hai.
    # Dùng hai điều kiện vì chúng bắt hai loại nội dung khác nhau: đoạn văn dài
    # thì đủ ký tự, còn một khuyến cáo ngắn gọn kiểu "2.5 Classify people with
    # hyperglycemia into appropriate diagnostic categories to aid in personalized
    # management." chỉ có 114 ký tự nhưng 16 từ — là nội dung thật và phải giữ.
    # Ngược lại "Table 2.1" hay "(https://doi.org/...)" trượt cả hai điều kiện.
    chunk_min_chars: int = Field(default=120, ge=0)
    chunk_min_words: int = Field(default=12, ge=0)
    # Ngưỡng cho TỪNG KHỐI, thấp hơn nhiều ngưỡng chunk. Lý do: một khuyến cáo
    # thật có thể chỉ dài 115 ký tự (đã gặp trong bộ slide ADA) — lọc từng khối
    # ở mức 120 là xoá mất nội dung thật. Khối ngắn được phép gộp lại thành
    # chunk, rồi mới áp ngưỡng chunk_min_chars ở bước cuối.
    element_min_chars: int = Field(default=30, ge=0)
    # Khối có nội dung y hệt nhau lặp lại nhiều hơn ngưỡng này là chân trang
    # hoặc chân slide, không phải nội dung.
    repeated_element_threshold: int = Field(default=3, ge=2)
    # Bảng không bao giờ bị cắt đôi, nhưng bảng quá lớn thì cắt theo hàng.
    table_max_tokens: int = Field(default=900, ge=256, le=4000)

    # ---- Khử trùng lặp ------------------------------------------------------
    # Slide ADA lặp lại rất nhiều khuyến cáo giữa các slide tổng kết.
    # Hai chunk có độ tương đồng Jaccard >= ngưỡng này thì giữ lại một.
    dedup_jaccard_threshold: float = Field(default=0.90, ge=0.5, le=1.0)

    # ---- Embedding ----------------------------------------------------------
    # "cohere" — API, free tier hào phóng, mạnh cho tiếng Việt (MẶC ĐỊNH)
    # "local"  — chạy bge-m3 trên máy, miễn phí và offline nhưng chậm và nặng RAM
    # "openai" — API, cần tài khoản còn quota
    #
    # Vì sao mặc định là Cohere thay vì local: embed toàn bộ corpus bằng bge-m3
    # trên CPU mất khoảng 50 phút, còn qua API là 1-2 phút. Quan trọng hơn, mô
    # hình local buộc server phải nạp 2.5GB RAM để embed câu hỏi người dùng —
    # free tier của Render chỉ có 512MB nên không deploy được. Chọn API là giải
    # quyết cả hai vấn đề bằng một lựa chọn.
    #
    # ĐỔI PROVIDER THÌ BẮT BUỘC INDEX LẠI (`make rag-index`): số chiều vector
    # khác nhau, và kể cả cùng số chiều thì không gian vector cũng khác nhau.
    embedding_provider: Literal["cohere", "local", "openai"] = "cohere"

    # embed-multilingual-v3.0: 1024 chiều, mạnh cho tiếng Việt.
    cohere_embedding_model: str = "embed-multilingual-v3.0"
    cohere_embedding_dimensions: int = 1024
    # Cohere giới hạn 96 văn bản mỗi lần gọi.
    cohere_batch_size: int = Field(default=96, ge=1, le=96)
    # Hạn mức của gói trial là 100.000 token/phút. Đặt thấp hơn để chừa biên độ:
    # ta đếm token bằng cl100k còn Cohere đếm bằng tokenizer riêng, hai bên lệch
    # nhau vài phần trăm, và đâm vào trần thì cả lần ingest hỏng giữa chừng.
    # Nâng lên nếu team lên gói trả phí.
    cohere_tokens_per_minute: int = Field(default=80_000, ge=1000)
    # Giới hạn cho MỘT request embedding. Đây là lớp bảo vệ thứ hai bên trong
    # RAG_RETRIEVAL_TIMEOUT_SECONDS: SDK Cohere không được phép treo một query
    # người dùng vô hạn khi mạng hoặc provider có sự cố.
    cohere_timeout_seconds: float = Field(default=6.0, ge=1.0, le=60.0)
    # Khoá đọc thẳng từ biến COHERE_API_KEY, không có tiền tố RAG_.
    cohere_api_key: str = Field(default="", validation_alias="COHERE_API_KEY")

    # bge-m3: đa ngôn ngữ, mạnh cho tiếng Việt, 1024 chiều, độ dài tối đa 8192 token.
    local_embedding_model: str = "BAAI/bge-m3"
    local_embedding_dimensions: int = 1024
    # bge-m3 khuyến nghị chuẩn hoá vector để dùng khoảng cách cosine.
    local_embedding_normalize: bool = True

    openai_embedding_model: str = "text-embedding-3-small"
    openai_embedding_dimensions: int = 1536

    embedding_batch_size: int = Field(default=64, ge=1, le=2048)

    @property
    def embedding_model(self) -> str:
        return {
            "cohere": self.cohere_embedding_model,
            "local": self.local_embedding_model,
            "openai": self.openai_embedding_model,
        }[self.embedding_provider]

    @property
    def embedding_dimensions(self) -> int:
        return {
            "cohere": self.cohere_embedding_dimensions,
            "local": self.local_embedding_dimensions,
            "openai": self.openai_embedding_dimensions,
        }[self.embedding_provider]

    # ---- Vector store -------------------------------------------------------
    collection_name: str = "medical_docs"

    # Mở Chroma, tạo embedding câu hỏi hoặc đọc index cục bộ đều là I/O. Không
    # để một file index hỏng, ổ đĩa chậm hoặc SDK embedding treo giữ SSE vô hạn.
    # Hết thời gian, agent fail-closed sang doctor_referral; có thể điều chỉnh
    # bằng RAG_RETRIEVAL_TIMEOUT_SECONDS mà không phải sửa node.
    # 10 giây chừa thời gian nạp SDK ở request đầu tiên; riêng request Cohere
    # bị giới hạn 6 giây nên một provider treo vẫn không giữ giao diện vô hạn.
    retrieval_timeout_seconds: float = Field(default=10.0, ge=1.0, le=120.0)

    # ---- Truy xuất ----------------------------------------------------------
    # Lấy rộng ở tầng vector rồi mới xếp lại — cách này rẻ hơn nhiều so với
    # tăng thẳng top_k, và cho tầng rerank/recency chỗ để làm việc.
    top_k_fetch: int = Field(default=24, ge=1, le=200)
    # Số chunk thực sự đưa vào prompt. 6 là điểm cân bằng: đủ nguồn để trả lời
    # một câu hỏi giáo dục sức khoẻ, chưa tới mức bị "lost in the middle".
    top_k: int = Field(default=6, ge=1, le=50)
    # Trọng số cộng thêm cho tài liệu mới. Team chốt chính sách recency ngày
    # 15/08/2026: khi hai hướng dẫn mâu thuẫn thì lấy số của bản mới hơn.
    # 0.0 = bỏ qua năm ban hành, chỉ xét độ tương đồng ngữ nghĩa.
    recency_weight: float = Field(default=0.15, ge=0.0, le=1.0)
    # Dưới ngưỡng tương đồng này coi như thư viện không có tài liệu phù hợp
    # -> đi nhánh doctor_referral thay vì cố trả lời (brief mục 7.1).
    #
    # NGƯỠNG NÀY GẮN VỚI TỪNG PROVIDER EMBEDDING — đổi provider là phải đo lại,
    # vì mỗi mô hình có thang tương đồng riêng.
    #
    # Đo trên corpus thật với Cohere embed-multilingual-v3.0, 14 câu hỏi tiếng Việt:
    #     trong phạm vi : 0.570 - 0.783  (thấp nhất: "Tiểu đường có ăn được cơm không?")
    #     ngoài phạm vi : 0.365 - 0.454  (cao nhất: "Cách nấu phở bò ngon")
    # Khoảng trống 0.116, lấy 0.50 nằm giữa, chừa biên độ cả hai phía.
    #
    # Lưu ý: 14 câu là mẫu nhỏ. Nên hiệu chỉnh lại trên bộ 50 case của eval/
    # trước khi chốt cho bản đánh giá cuối.
    min_similarity: float = Field(default=0.50, ge=0.0, le=1.0)

    # ---- Sinh câu trả lời ---------------------------------------------------
    # 0.0 vì đây là nội dung y tế: cùng một câu hỏi phải ra cùng một câu trả lời,
    # và mọi sự "sáng tạo" của mô hình ở đây đều là rủi ro chứ không phải giá trị.
    # Lưu ý: src/config.py hiện để 0.7 cho agent chung — chỗ sinh câu trả lời
    # y khoa phải dùng giá trị này, không dùng giá trị kia.
    generation_temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    generation_model: str = "gpt-4o-mini"
    generation_max_tokens: int = Field(default=1200, ge=256, le=8000)

    # ---- Chính sách xếp hạng ------------------------------------------------
    # Giá trị mặc định lấy từ data/registry.yaml; đặt ở đây để override khi thử.
    ranking_policy: Literal["recency", "vn_first"] | None = None


@lru_cache
def get_rag_settings() -> RagSettings:
    return RagSettings()
