from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ─────────────────────────────────────────────────────────────────
    app_name: str = "EduHealth AI"
    app_env: Literal["development", "production", "test"] = "development"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_host: str = "0.0.0.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = "http://localhost:5180"
    secret_key: str = "super-secret-key-for-jwt-dev"

    # ── LLM ─────────────────────────────────────────────────────────────────
    openai_api_key: str = ""
    groq_api_key: str = ""
    openrouter_api_key: str = ""
    llm_provider: Literal["groq", "openai", "openrouter"] = "groq"

    # OpenRouter nói giao thức OpenAI, chỉ khác base URL — nên dùng lại
    # ChatOpenAI thay vì thêm một thư viện nữa. Xem `get_llm` trong
    # src/services/llm/factory.py.
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # Model cho provider đang chọn ở `llm_provider`. Giữ nguyên tên biến này vì
    # .env và biến môi trường trên Railway đang dùng nó.
    #
    # Groq đã gỡ toàn bộ dòng Llama chat khỏi nền tảng (kiểm ngày 24/08/2026:
    # models.list() không còn llama-3.3-70b-versatile lẫn llama-3.1-8b-instant).
    # gpt-oss-120b là model mạnh nhất còn lại hỗ trợ structured output, mà mọi
    # node dùng with_structured_output đều phụ thuộc vào.
    model_name: str = "openai/gpt-oss-120b"

    # Model mặc định của TỪNG provider, dùng khi phải gọi provider không phải
    # `llm_provider` — `get_fast_llm()` luôn đòi Groq, còn `get_quality_llm()`
    # tự chuyển provider khi key của provider chính bị thiếu.
    #
    # Phải tách hai giá trị chứ không dùng chung `model_name`: id model của hai
    # bên KHÔNG dùng chéo được. "openai/gpt-oss-120b" là id trên Groq; gửi
    # nguyên chuỗi đó sang OpenAI sẽ nhận 404 model_not_found.
    groq_model: str = "openai/gpt-oss-120b"
    openai_model: str = "gpt-4o-mini"
    openrouter_model: str = "openai/gpt-oss-120b"

    llm_temperature: float = Field(default=0.3, ge=0.0, le=2.0)

    # Các node điều phối của agent (phân loại và chuẩn hoá truy vấn) phải cho
    # cùng kết quả khi nhận cùng đầu vào. Sự đa dạng không có ích ở đây, nhưng
    # có thể thay đổi truy vấn rồi kéo theo một bộ nguồn khác.
    agent_temperature: float = Field(default=0.0, ge=0.0, le=2.0)

    # Trần token đầu ra. Bảy câu trắc nghiệm tiếng Việt (câu hỏi + 4 đáp án +
    # giải thích mỗi câu) đo được ~3000 token, cộng phần suy luận nội bộ của
    # model reasoning. Trần thấp làm JSON đứt giữa chừng và ném
    # OutputParserException chứ không báo gì rõ ràng.
    # PHẢI VỪA HẠN MỨC TOKEN/PHÚT của provider, không chỉ vừa nhu cầu.
    #
    # Groq gói miễn phí: 8000 token/phút, và nó tính CẢ phần max_tokens ta xin
    # trước chứ không chỉ phần thực dùng. Đo ngày 24/08/2026: prompt sinh quiz
    # ~4800 token + max_tokens 8000 = ~12800 -> 413 "Request too large", dù đề
    # thật chỉ cần ~3000 token đầu ra.
    #
    # 3200 đủ cho 6 câu tiếng Việt kèm giải thích, và 4800 + 3200 = 8000 vừa khít.
    llm_max_tokens: int = Field(default=3200, ge=512, le=32000)

    # Groq gói miễn phí siết 8000 token/PHÚT và tính cả phần max_tokens xin
    # trước, nên nó cần trần thấp hơn hẳn các provider khác. OpenRouter không có
    # giới hạn đó, mà model reasoning lại đốt phần lớn ngân sách vào suy nghĩ
    # nội bộ — đo ngày 24/08/2026: DeepSeek tiêu 3201/3201 token rồi trả JSON
    # đứt giữa chừng. Cho nó rộng chỗ thì phần trả lời thật mới có đất.
    llm_max_tokens_generous: int = Field(default=8000, ge=512, le=32000)

    def max_tokens_for(self, provider: str) -> int:
        """Trần token đầu ra hợp với hạn mức của từng provider."""
        return self.llm_max_tokens if provider == "groq" else self.llm_max_tokens_generous

    # Trần riêng cho các node CHỈ cần câu trả lời ngắn: intent_router trả JSON
    # scope/task_kind, query_preprocessor trả một truy vấn đã chuẩn hoá.
    #
    # Không tách hai giá trị thì mỗi lời gọi nhỏ xíu đó cũng xin trước 8000
    # token, và gói miễn phí của Groq có hạn mức 8000 token/PHÚT — một request
    # duy nhất chiếm trọn cả phút, nhận 413 "Request too large". Cả luồng chat
    # chết ngay ở node đầu tiên.
    llm_max_tokens_fast: int = Field(default=512, ge=64, le=4096)

    # Mức suy luận nội bộ cho các model reasoning (dòng gpt-oss, deepseek...).
    #
    # ĐO NGÀY 24/08/2026 — gpt-oss-120b qua OpenRouter, mặc định:
    #     completion_tokens = 6000
    #     reasoning_tokens  = 5997      <- 99,95% ngân sách đốt vào suy nghĩ
    # Chỉ còn 3 token cho JSON, nên đầu ra luôn đứt và mất 137 giây mỗi lượt.
    # Nâng max_tokens chỉ cho nó NGHĨ NHIỀU HƠN, không giải quyết được gì.
    #
    # Sinh trắc nghiệm từ một trích đoạn cho sẵn không cần suy luận sâu: đề bài
    # đã nằm hết trong ngữ cảnh, việc còn lại là diễn đạt lại thành câu hỏi.
    # Đặt "low" để ngân sách token dồn vào phần đầu ra thật.
    #
    # Nhà cung cấp nào không hiểu tham số này thì bỏ qua nó, không lỗi.
    llm_reasoning_effort: Literal["low", "medium", "high"] = "low"

    # Trần CỨNG cho phần suy luận nội bộ, tính bằng token.
    #
    # `effort: "low"` chỉ là gợi ý và ghìm rất lỏng. Đo trên DeepSeek V4 Flash
    # qua OpenRouter, ngày 24/08/2026, cùng một đề 6 câu:
    #
    #     effort=low                 20,3s   2350 token ra
    #     reasoning.max_tokens=400   11,3s   1276 token ra   <- nhanh gap 1,8 lan
    #     exclude=true               31,5s   4008 token ra   <- te nhat
    #
    # Cả ba đều ra đủ 6 câu, nên đây thuần là chuyện tốc độ, không đánh đổi số
    # lượng. `exclude` phản tác dụng vì nó chỉ ẩn phần suy luận khỏi kết quả,
    # model vẫn nghĩ y nguyên.
    #
    # 400 token đủ cho model sắp xếp ý trước khi viết đề — việc ra đề từ một
    # trích đoạn cho sẵn vốn không cần suy luận sâu.
    llm_reasoning_max_tokens: int = Field(default=400, ge=0, le=8000)

    def model_for(self, provider: str) -> str:
        """Id model đúng cho provider được yêu cầu.

        Provider đang chọn thì lấy `model_name` (thứ người dùng khai trong .env);
        provider còn lại lấy mặc định riêng của nó.
        """
        if provider == self.llm_provider:
            return self.model_name
        if provider == "groq":
            return self.groq_model
        if provider == "openrouter":
            return self.openrouter_model
        return self.openai_model

    # ── Embedding ───────────────────────────────────────────────────────────
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536

    # ── LangSmith Tracing ───────────────────────────────────────────────────
    langchain_api_key: str = ""
    langchain_tracing_v2: bool = True
    langchain_project: str = "ai20k-medical-agent"

    # ── Legacy / Compatibility ───────────────────────────────────────────────
    # Kept for backward-compat with old config.py consumers
    database_url: str = "sqlite+aiosqlite:///./data/app.db"

    @field_validator("database_url", mode="before")
    @classmethod
    def fix_async_db_url(cls, v: str) -> str:
        """Railway cung cấp DATABASE_URL dạng postgresql://, asyncpg cần postgresql+asyncpg://; SQLite cần sqlite+aiosqlite://"""
        if not v:
            return "sqlite+aiosqlite:///./data/app.db"
        if isinstance(v, str):
            if v.startswith("postgresql://"):
                return v.replace("postgresql://", "postgresql+asyncpg://", 1)
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+asyncpg://", 1)
            if v.startswith("sqlite:///") and not v.startswith("sqlite+aiosqlite:///"):
                return v.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
