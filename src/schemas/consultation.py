"""Contracts for verified doctor consultations and WebRTC signaling."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

ConsultationStatus = Literal["requested", "active", "ended"]
VideoCallStatus = Literal["ringing", "active", "ended"]
VideoSignalKind = Literal["offer", "answer", "candidate", "hangup"]
DoctorNotificationKind = Literal["request", "patient_message", "video_call"]


class DoctorSummary(BaseModel):
    doctor_id: str
    display_name: str
    specialty: str
    bio: str | None = None
    is_available: bool


class DoctorPublicProfile(DoctorSummary):
    """Professional information that a patient may inspect before choosing."""

    license_number: str
    clinic_name: str | None = None
    experience_years: int | None = None
    consultation_focus: str | None = None
    is_verified: bool
    verified_at: datetime | None = None


class DoctorList(BaseModel):
    doctors: list[DoctorPublicProfile] = Field(default_factory=list)


class AdminDoctor(DoctorPublicProfile):
    email: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AdminDoctorList(BaseModel):
    doctors: list[AdminDoctor] = Field(default_factory=list)


class DoctorOwnProfile(DoctorPublicProfile):
    """The authenticated doctor's own profile, including account state."""

    email: str
    is_active: bool


class UpdateDoctorOwnProfileRequest(BaseModel):
    """Fields a doctor may update without changing verified credentials.

    License number and specialty remain BTV-controlled verification data. The
    doctor can maintain the patient-facing introduction and availability.
    """

    display_name: str | None = Field(default=None, min_length=2, max_length=120)
    bio: str | None = Field(default=None, max_length=1_000)
    clinic_name: str | None = Field(default=None, max_length=160)
    experience_years: int | None = Field(default=None, ge=0, le=80)
    consultation_focus: str | None = Field(default=None, max_length=1_000)
    is_available: bool | None = None


class CreateDoctorRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    temporary_password: str = Field(min_length=8, max_length=256)
    display_name: str = Field(min_length=2, max_length=120)
    specialty: str = Field(min_length=2, max_length=120)
    license_number: str = Field(min_length=3, max_length=80)
    bio: str | None = Field(default=None, max_length=1_000)
    clinic_name: str | None = Field(default=None, max_length=160)
    experience_years: int | None = Field(default=None, ge=0, le=80)
    consultation_focus: str | None = Field(default=None, max_length=1_000)
    is_available: bool = True


class UpdateAdminDoctorRequest(BaseModel):
    """Fields an editorial administrator may maintain for a doctor profile.

    BTV owns the verified identity and professional credentials; the doctor
    only owns the patient-facing presentation fields exposed by
    ``UpdateDoctorOwnProfileRequest``.
    """

    email: str | None = Field(default=None, min_length=5, max_length=254)
    display_name: str | None = Field(default=None, min_length=2, max_length=120)
    specialty: str | None = Field(default=None, min_length=2, max_length=120)
    license_number: str | None = Field(default=None, min_length=3, max_length=80)
    bio: str | None = Field(default=None, max_length=1_000)
    clinic_name: str | None = Field(default=None, max_length=160)
    experience_years: int | None = Field(default=None, ge=0, le=80)
    consultation_focus: str | None = Field(default=None, max_length=1_000)
    is_active: bool | None = None
    is_available: bool | None = None


class DoctorNotificationSchema(BaseModel):
    notification_id: str
    consultation_id: str
    kind: DoctorNotificationKind
    content_preview: str | None = None
    created_at: datetime
    read_at: datetime | None = None


class DoctorNotificationList(BaseModel):
    notifications: list[DoctorNotificationSchema] = Field(default_factory=list)
    unread_count: int = Field(ge=0)


class CreateConsultationRequest(BaseModel):
    """Open a patient-to-doctor room.

    A patient may open the room first and write the opening message from that
    room.  ``initial_message`` remains accepted for API clients that already
    send it, but it must not make the "choose doctor" action a dead end.
    """

    doctor_id: str = Field(min_length=1, max_length=128)
    initial_message: str | None = Field(default=None, max_length=4_000)


class SendConsultationMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4_000)


class ConsultationMessageSchema(BaseModel):
    message_id: str
    sender_role: Literal["patient", "doctor"]
    content: str
    created_at: datetime


class PatientClinicalSummary(BaseModel):
    age: int
    conditions: list[str] = Field(default_factory=list)
    diagnosed_at: str | None = None


class VideoCallSummary(BaseModel):
    call_id: str
    status: VideoCallStatus
    initiated_by_user_id: str
    created_at: datetime


class ConsultationSummary(BaseModel):
    consultation_id: str
    status: ConsultationStatus
    doctor: DoctorSummary
    requested_at: datetime
    accepted_at: datetime | None = None
    ended_at: datetime | None = None
    last_message_at: datetime | None = None
    last_message_preview: str | None = None


class ConsultationList(BaseModel):
    consultations: list[ConsultationSummary] = Field(default_factory=list)


class DoctorDashboard(BaseModel):
    """Operational overview derived from the doctor's authorized data only."""

    pending_consultation_count: int = Field(ge=0)
    active_consultation_count: int = Field(ge=0)
    unread_system_notification_count: int = Field(ge=0)
    unread_patient_message_count: int = Field(ge=0)
    is_active: bool
    is_available: bool
    recent_consultations: list[ConsultationSummary] = Field(default_factory=list)


class ConsultationDetail(ConsultationSummary):
    patient_id: str
    patient_context: PatientClinicalSummary | None = None
    messages: list[ConsultationMessageSchema] = Field(default_factory=list)
    active_video_call: VideoCallSummary | None = None


class VideoCallStartResponse(VideoCallSummary):
    ice_servers: list[dict[str, Any]] = Field(default_factory=list)


class VideoSignalRequest(BaseModel):
    kind: VideoSignalKind
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("payload")
    @classmethod
    def _bound_payload(cls, value: dict[str, Any]) -> dict[str, Any]:
        try:
            encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError) as exc:
            raise ValueError("Dữ liệu signaling không hợp lệ") from exc
        if len(encoded.encode("utf-8")) > 50_000:
            raise ValueError("Dữ liệu signaling quá lớn")
        return value


class VideoSignal(BaseModel):
    signal_id: int
    kind: VideoSignalKind
    payload: dict[str, Any]
    created_at: datetime


class VideoSignalList(BaseModel):
    signals: list[VideoSignal] = Field(default_factory=list)
