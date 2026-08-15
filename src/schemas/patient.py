"""Domain schemas: UserInfo, LoginRequest, PatientProfile."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class UserInfo(BaseModel):
    """Thông tin tài khoản, trả kèm trong response đăng nhập."""

    user_id: str
    email: EmailStr
    role: Literal["patient", "editor"]
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
    primary_condition: Literal["type2_diabetes", "hypertension"]
    comorbidities: list[Literal["type2_diabetes", "hypertension"]] = Field(default_factory=list)
    diagnosed_at: str | None = None
    asking_as: Literal["self", "caregiver"] = "self"


class PatientProfileResponse(PatientProfile):
    """Dùng cho response 200 của POST /patients/profile và GET /patients/{patient_id}/profile."""

    updated_at: str
