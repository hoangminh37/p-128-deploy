"""Domain schemas: UserInfo, LoginRequest, PatientProfile."""

from __future__ import annotations

import re
from datetime import UTC, date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_serializer, field_validator

_DIAGNOSED_AT_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


class UserInfo(BaseModel):
    """Thông tin tài khoản, trả kèm trong response đăng nhập."""

    user_id: str
    email: EmailStr
    role: Literal["patient", "editor", "doctor"]
    # Chỉ có giá trị khi role là "patient". Với editor thì luôn None.
    patient_id: str | None = None


class LoginRequest(BaseModel):
    """Dùng cho request POST /auth/login."""

    email: EmailStr
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    """Dùng cho response 200 của POST /auth/login."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserInfo


class PatientProfile(BaseModel):
    """Dùng cho request POST /patients/profile."""

    patient_id: str
    age: int = Field(..., ge=18, le=120)
    # Condition IDs are validated against the active runtime registry by the
    # patient endpoint. A Literal here would force a backend deploy whenever a
    # BTV adds a disease through the editorial workflow.
    primary_condition: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    comorbidities: list[str] = Field(default_factory=list)
    diagnosed_at: str | None = None
    height_cm: int | None = Field(default=None, ge=100, le=250)
    weight_kg: float | None = Field(default=None, ge=25, le=300)
    asking_as: Literal["self", "caregiver"] = "self"

    @field_validator("diagnosed_at")
    @classmethod
    def diagnosed_at_must_be_a_month(cls, value: str | None) -> str | None:
        """Keep the API contract aligned with the ``<input type=month>`` UI."""
        if value is not None and not _DIAGNOSED_AT_RE.fullmatch(value):
            raise ValueError("diagnosed_at phải theo định dạng YYYY-MM")
        if value is not None:
            try:
                diagnosed_month = date.fromisoformat(f"{value}-01")
            except ValueError as exc:
                raise ValueError("diagnosed_at phải theo định dạng YYYY-MM") from exc
            if diagnosed_month > date.today().replace(day=1):
                raise ValueError("Thời điểm chẩn đoán không thể ở tương lai")
        return value


class PatientProfileResponse(PatientProfile):
    """Dùng cho response 200 của POST /patients/profile và GET /patients/{patient_id}/profile."""

    updated_at: str
    # Nhãn là projection từ registry runtime, không ghi đè dữ liệu hồ sơ. Nhờ
    # vậy frontend không phải giữ một bảng tên bệnh hardcode chỉ để render UI.
    primary_condition_label: str | None = None
    comorbidity_labels: dict[str, str] = Field(default_factory=dict)


class PatientNotificationSchema(BaseModel):
    notification_id: str
    kind: Literal["editor_response"]
    title: str
    # The original question is part of the notification context, not a
    # client-side lookup. It lets the patient safely identify what an editor
    # response is addressing when several questions are waiting at once.
    question: str | None = None
    body: str
    created_at: datetime
    read_at: datetime | None = None

    @field_serializer("created_at", "read_at", when_used="json")
    def serialize_notification_datetime_as_utc(self, value: datetime | None) -> str | None:
        """Keep the patient inbox contract timezone-aware for old SQLite rows."""
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


class PatientNotificationList(BaseModel):
    notifications: list[PatientNotificationSchema] = Field(default_factory=list)
    unread_count: int = Field(ge=0)
