"""Domain schemas: PatientProfile, Message, Citation."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PatientProfile(BaseModel):
    """Hồ sơ bệnh nhân — dùng để cá nhân hóa query."""

    age: int | None = Field(default=None, ge=0, le=150)
    gender: str | None = None  # "male" | "female" | "other"
    conditions: list[str] = Field(default_factory=list)  # bệnh nền: ["tiểu đường", "cao huyết áp"]
    medications: list[str] = Field(default_factory=list)  # thuốc đang dùng
    allergies: list[str] = Field(default_factory=list)


class Message(BaseModel):
    """Một lượt hội thoại (Q hoặc A)."""

    role: str  # "user" | "assistant"
    content: str


class Citation(BaseModel):
    """Nguồn tài liệu được trích dẫn trong câu trả lời."""

    doc_id: str
    title: str = ""
    source: str = ""
    snippet: str = ""
