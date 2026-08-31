"""Verified patient-to-doctor consultations, direct messages and WebRTC signaling."""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.v1.auth import get_current_user, get_editor_user
from src.core.config import get_settings
from src.core.database import get_db
from src.models.domain import (
    Consultation,
    ConsultationMessage,
    ConsultationVideoCall,
    ConsultationVideoSignal,
    DoctorNotification,
    DoctorProfile,
    Patient,
    User,
)
from src.schemas.consultation import (
    AdminDoctor,
    AdminDoctorList,
    ConsultationDetail,
    ConsultationList,
    ConsultationMessageSchema,
    ConsultationSummary,
    CreateConsultationRequest,
    CreateDoctorRequest,
    DoctorDashboard,
    DoctorList,
    DoctorNotificationList,
    DoctorNotificationSchema,
    DoctorOwnProfile,
    DoctorPublicProfile,
    DoctorSummary,
    PatientClinicalSummary,
    SendConsultationMessageRequest,
    UpdateAdminDoctorRequest,
    UpdateDoctorOwnProfileRequest,
    VideoCallStartResponse,
    VideoCallSummary,
    VideoSignal,
    VideoSignalList,
    VideoSignalRequest,
)
from src.schemas.patient import UserInfo

router = APIRouter(prefix="/consultations", tags=["consultations"])


def _forbidden() -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền dùng phiên tư vấn này")


def _require_patient(current_user: UserInfo) -> str:
    if current_user.role != "patient" or current_user.patient_id is None:
        raise _forbidden()
    return current_user.patient_id


def _require_doctor(current_user: UserInfo) -> str:
    if current_user.role != "doctor":
        raise _forbidden()
    return current_user.user_id


def _doctor_summary(profile: DoctorProfile) -> DoctorSummary:
    return DoctorSummary(
        doctor_id=profile.user_id,
        display_name=profile.display_name,
        specialty=profile.specialty,
        bio=profile.bio,
        is_available=profile.is_active and profile.is_available,
    )


def _public_doctor_profile(profile: DoctorProfile) -> DoctorPublicProfile:
    return DoctorPublicProfile(
        **_doctor_summary(profile).model_dump(),
        license_number=profile.license_number,
        clinic_name=profile.clinic_name,
        experience_years=profile.experience_years,
        consultation_focus=profile.consultation_focus,
        is_verified=profile.verification_status == "verified" and profile.verified_at is not None,
        verified_at=profile.verified_at,
    )


def _admin_doctor(profile: DoctorProfile, user: User) -> AdminDoctor:
    return AdminDoctor(
        **_public_doctor_profile(profile).model_dump(),
        email=user.email,
        is_active=profile.is_active,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


def _own_doctor_profile(profile: DoctorProfile, user: User) -> DoctorOwnProfile:
    return DoctorOwnProfile(
        **_public_doctor_profile(profile).model_dump(),
        email=user.email,
        is_active=profile.is_active,
    )


def _notification_schema(notification: DoctorNotification) -> DoctorNotificationSchema:
    return DoctorNotificationSchema(
        notification_id=notification.id,
        consultation_id=notification.consultation_id,
        kind=notification.kind,
        content_preview=notification.content_preview,
        created_at=notification.created_at,
        read_at=notification.read_at,
    )


def _notify_doctor(
    db: AsyncSession,
    *,
    doctor_user_id: str,
    consultation_id: str,
    kind: str,
    content_preview: str | None = None,
) -> None:
    """Add an in-app notification within the same transaction as the event."""
    db.add(
        DoctorNotification(
            doctor_user_id=doctor_user_id,
            consultation_id=consultation_id,
            kind=kind,
            content_preview=content_preview[:160] if content_preview else None,
        )
    )


async def _doctor_profile(db: AsyncSession, doctor_id: str) -> DoctorProfile:
    result = await db.execute(select(DoctorProfile).where(DoctorProfile.user_id == doctor_id))
    profile = result.scalars().first()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ bác sỹ")
    return profile


async def _consultation_for_user(
    db: AsyncSession,
    consultation_id: str,
    current_user: UserInfo,
) -> Consultation:
    result = await db.execute(select(Consultation).where(Consultation.id == consultation_id))
    consultation = result.scalars().first()
    if consultation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên tư vấn")
    if current_user.role == "patient" and current_user.patient_id == consultation.patient_id:
        return consultation
    if current_user.role == "doctor" and current_user.user_id == consultation.doctor_user_id:
        return consultation
    raise _forbidden()


async def _messages_for_consultation(db: AsyncSession, consultation_id: str) -> list[ConsultationMessage]:
    result = await db.execute(
        select(ConsultationMessage)
        .where(ConsultationMessage.consultation_id == consultation_id)
        .order_by(ConsultationMessage.created_at.asc())
    )
    return list(result.scalars().all())


async def _open_video_call(db: AsyncSession, consultation_id: str) -> ConsultationVideoCall | None:
    result = await db.execute(
        select(ConsultationVideoCall)
        .where(
            ConsultationVideoCall.consultation_id == consultation_id,
            ConsultationVideoCall.status.in_(("ringing", "active")),
        )
        .order_by(ConsultationVideoCall.created_at.desc())
    )
    return result.scalars().first()


def _video_summary(call: ConsultationVideoCall) -> VideoCallSummary:
    return VideoCallSummary(
        call_id=call.id,
        status=call.status,
        initiated_by_user_id=call.initiated_by_user_id,
        created_at=call.created_at,
    )


async def _patient_context(db: AsyncSession, patient_id: str) -> PatientClinicalSummary:
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalars().first()
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ bệnh nhân")
    return PatientClinicalSummary(
        age=patient.age,
        conditions=[patient.primary_condition, *(patient.comorbidities or [])],
        diagnosed_at=patient.diagnosed_at,
    )


async def _consultation_summary(db: AsyncSession, consultation: Consultation) -> ConsultationSummary:
    doctor = await _doctor_profile(db, consultation.doctor_user_id)
    last_result = await db.execute(
        select(ConsultationMessage)
        .where(ConsultationMessage.consultation_id == consultation.id)
        .order_by(ConsultationMessage.created_at.desc())
        .limit(1)
    )
    last_message = last_result.scalars().first()
    return ConsultationSummary(
        consultation_id=consultation.id,
        status=consultation.status,
        doctor=_doctor_summary(doctor),
        requested_at=consultation.requested_at,
        accepted_at=consultation.accepted_at,
        ended_at=consultation.ended_at,
        last_message_at=last_message.created_at if last_message is not None else None,
        last_message_preview=last_message.content[:160] if last_message is not None else None,
    )


async def _consultation_detail(
    db: AsyncSession,
    consultation: Consultation,
    current_user: UserInfo,
) -> ConsultationDetail:
    summary = await _consultation_summary(db, consultation)
    messages = await _messages_for_consultation(db, consultation.id)
    active_call = await _open_video_call(db, consultation.id)
    return ConsultationDetail(
        **summary.model_dump(),
        patient_id=consultation.patient_id,
        patient_context=(await _patient_context(db, consultation.patient_id))
        if current_user.role == "doctor"
        else None,
        messages=[
            ConsultationMessageSchema(
                message_id=message.id,
                sender_role="doctor" if message.sender_user_id == consultation.doctor_user_id else "patient",
                content=message.content,
                created_at=message.created_at,
            )
            for message in messages
        ],
        active_video_call=_video_summary(active_call) if active_call is not None else None,
    )


def _ice_servers() -> list[dict]:
    raw = get_settings().webrtc_ice_servers.strip()
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cấu hình máy chủ video chưa hợp lệ. Hãy liên hệ quản trị viên.",
        ) from exc
    if not isinstance(parsed, list) or not all(isinstance(item, dict) for item in parsed):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cấu hình máy chủ video chưa hợp lệ. Hãy liên hệ quản trị viên.",
        )
    return parsed


@router.get("/doctors", response_model=DoctorList)
async def list_available_doctors(
    db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_current_user)
) -> DoctorList:
    _require_patient(current_user)
    result = await db.execute(
        select(DoctorProfile)
        .join(User, User.id == DoctorProfile.user_id)
        .where(User.role == "doctor", DoctorProfile.is_active.is_(True))
        .order_by(DoctorProfile.specialty.asc(), DoctorProfile.display_name.asc())
    )
    return DoctorList(doctors=[_public_doctor_profile(profile) for profile in result.scalars().all()])


@router.get("/doctors/{doctor_id}", response_model=DoctorPublicProfile)
async def get_doctor_public_profile(
    doctor_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> DoctorPublicProfile:
    """Patient-visible professional profile used before opening a consultation."""
    _require_patient(current_user)
    profile = await _doctor_profile(db, doctor_id)
    user_result = await db.execute(select(User).where(User.id == doctor_id, User.role == "doctor"))
    if user_result.scalars().first() is None or not profile.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ bác sỹ")
    return _public_doctor_profile(profile)


@router.get("/admin/doctors", response_model=AdminDoctorList)
async def list_admin_doctors(
    db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_editor_user)
) -> AdminDoctorList:
    result = await db.execute(select(DoctorProfile, User).join(User, User.id == DoctorProfile.user_id))
    doctors = [
        _admin_doctor(profile, user)
        for profile, user in result.all()
    ]
    doctors.sort(key=lambda doctor: doctor.display_name.casefold())
    return AdminDoctorList(doctors=doctors)


@router.post("/admin/doctors", response_model=AdminDoctor, status_code=status.HTTP_201_CREATED)
async def create_doctor(
    payload: CreateDoctorRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_editor_user),
) -> AdminDoctor:
    email = payload.email.strip().lower()
    license_number = payload.license_number.strip()
    existing_user = await db.execute(select(User).where(User.email == email))
    if existing_user.scalars().first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email này đã có tài khoản")
    existing_license = await db.execute(select(DoctorProfile).where(DoctorProfile.license_number == license_number))
    if existing_license.scalars().first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Số giấy phép hành nghề đã tồn tại")

    user = User(email=email, password=payload.temporary_password, role="doctor")
    db.add(user)
    await db.flush()
    profile = DoctorProfile(
        user_id=user.id,
        display_name=payload.display_name.strip(),
        specialty=payload.specialty.strip(),
        license_number=license_number,
        bio=payload.bio.strip() if payload.bio else None,
        clinic_name=payload.clinic_name.strip() if payload.clinic_name else None,
        experience_years=payload.experience_years,
        consultation_focus=payload.consultation_focus.strip() if payload.consultation_focus else None,
        verification_status="verified",
        verified_at=datetime.utcnow(),
        is_active=True,
        is_available=payload.is_available,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return _admin_doctor(profile, user)


@router.patch("/admin/doctors/{doctor_id}", response_model=AdminDoctor)
async def update_admin_doctor(
    doctor_id: str,
    payload: UpdateAdminDoctorRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_editor_user),
) -> AdminDoctor:
    if not payload.model_fields_set:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Chưa có thông tin cần cập nhật")
    profile = await _doctor_profile(db, doctor_id)
    user_result = await db.execute(select(User).where(User.id == doctor_id, User.role == "doctor"))
    user = user_result.scalars().first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản bác sỹ")

    if "email" in payload.model_fields_set:
        email = (payload.email or "").strip().lower()
        if "@" not in email or email.startswith("@") or email.endswith("@"):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Email không hợp lệ")
        existing_user = await db.execute(select(User).where(User.email == email, User.id != doctor_id))
        if existing_user.scalars().first() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email này đã có tài khoản")
        user.email = email

    if "display_name" in payload.model_fields_set:
        display_name = (payload.display_name or "").strip()
        if len(display_name) < 2:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tên hiển thị cần có ít nhất 2 ký tự")
        profile.display_name = display_name

    if "specialty" in payload.model_fields_set:
        specialty = (payload.specialty or "").strip()
        if len(specialty) < 2:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Chuyên khoa cần có ít nhất 2 ký tự")
        profile.specialty = specialty

    if "license_number" in payload.model_fields_set:
        license_number = (payload.license_number or "").strip()
        if len(license_number) < 3:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Số giấy phép hành nghề không hợp lệ")
        existing_license = await db.execute(
            select(DoctorProfile).where(
                DoctorProfile.license_number == license_number,
                DoctorProfile.user_id != doctor_id,
            )
        )
        if existing_license.scalars().first() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Số giấy phép hành nghề đã tồn tại")
        profile.license_number = license_number

    if "bio" in payload.model_fields_set:
        profile.bio = payload.bio.strip() if payload.bio and payload.bio.strip() else None
    if "clinic_name" in payload.model_fields_set:
        profile.clinic_name = payload.clinic_name.strip() if payload.clinic_name and payload.clinic_name.strip() else None
    if "experience_years" in payload.model_fields_set:
        profile.experience_years = payload.experience_years
    if "consultation_focus" in payload.model_fields_set:
        profile.consultation_focus = payload.consultation_focus.strip() if payload.consultation_focus and payload.consultation_focus.strip() else None
    if payload.is_active is not None:
        profile.is_active = payload.is_active
    if payload.is_available is not None:
        profile.is_available = payload.is_available
    await db.commit()
    await db.refresh(profile)
    return _admin_doctor(profile, user)


@router.get("/notifications", response_model=DoctorNotificationList)
async def list_doctor_notifications(
    db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_current_user)
) -> DoctorNotificationList:
    doctor_id = _require_doctor(current_user)
    result = await db.execute(
        select(DoctorNotification)
        .where(DoctorNotification.doctor_user_id == doctor_id)
        .order_by(DoctorNotification.read_at.asc(), DoctorNotification.created_at.desc())
        .limit(100)
    )
    notifications = list(result.scalars().all())
    unread_result = await db.execute(
        select(func.count())
        .select_from(DoctorNotification)
        .where(
            DoctorNotification.doctor_user_id == doctor_id,
            DoctorNotification.read_at.is_(None),
        )
    )
    return DoctorNotificationList(
        notifications=[_notification_schema(notification) for notification in notifications],
        unread_count=int(unread_result.scalar_one()),
    )


@router.get("/me/profile", response_model=DoctorOwnProfile)
async def get_own_doctor_profile(
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> DoctorOwnProfile:
    doctor_id = _require_doctor(current_user)
    profile = await _doctor_profile(db, doctor_id)
    user_result = await db.execute(select(User).where(User.id == doctor_id, User.role == "doctor"))
    user = user_result.scalars().first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản bác sỹ")
    return _own_doctor_profile(profile, user)


@router.patch("/me/profile", response_model=DoctorOwnProfile)
async def update_own_doctor_profile(
    payload: UpdateDoctorOwnProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> DoctorOwnProfile:
    doctor_id = _require_doctor(current_user)
    if not payload.model_fields_set:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Chưa có thông tin cần cập nhật")

    profile = await _doctor_profile(db, doctor_id)
    user_result = await db.execute(select(User).where(User.id == doctor_id, User.role == "doctor"))
    user = user_result.scalars().first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản bác sỹ")

    if "display_name" in payload.model_fields_set:
        display_name = (payload.display_name or "").strip()
        if len(display_name) < 2:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tên hiển thị cần có ít nhất 2 ký tự")
        profile.display_name = display_name
    if "bio" in payload.model_fields_set:
        profile.bio = payload.bio.strip() if payload.bio and payload.bio.strip() else None
    if "clinic_name" in payload.model_fields_set:
        profile.clinic_name = payload.clinic_name.strip() if payload.clinic_name and payload.clinic_name.strip() else None
    if "experience_years" in payload.model_fields_set:
        profile.experience_years = payload.experience_years
    if "consultation_focus" in payload.model_fields_set:
        profile.consultation_focus = payload.consultation_focus.strip() if payload.consultation_focus and payload.consultation_focus.strip() else None
    if "is_available" in payload.model_fields_set:
        profile.is_available = payload.is_available

    await db.commit()
    await db.refresh(profile)
    return _own_doctor_profile(profile, user)


@router.get("/dashboard", response_model=DoctorDashboard)
async def get_doctor_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> DoctorDashboard:
    """Return operational counts without exposing patient identity in the list."""
    doctor_id = _require_doctor(current_user)
    profile = await _doctor_profile(db, doctor_id)

    status_rows = await db.execute(
        select(Consultation.status, func.count())
        .where(Consultation.doctor_user_id == doctor_id)
        .group_by(Consultation.status)
    )
    consultation_counts = {status_name: int(count) for status_name, count in status_rows.all()}

    notification_rows = await db.execute(
        select(DoctorNotification.kind, func.count())
        .where(
            DoctorNotification.doctor_user_id == doctor_id,
            DoctorNotification.read_at.is_(None),
        )
        .group_by(DoctorNotification.kind)
    )
    notification_counts = {kind: int(count) for kind, count in notification_rows.all()}

    recent_result = await db.execute(
        select(Consultation)
        .where(Consultation.doctor_user_id == doctor_id)
        .order_by(Consultation.updated_at.desc())
        .limit(5)
    )
    recent_consultations = [
        await _consultation_summary(db, consultation)
        for consultation in recent_result.scalars().all()
    ]
    return DoctorDashboard(
        pending_consultation_count=consultation_counts.get("requested", 0),
        active_consultation_count=consultation_counts.get("active", 0),
        unread_system_notification_count=(
            notification_counts.get("request", 0) + notification_counts.get("video_call", 0)
        ),
        unread_patient_message_count=notification_counts.get("patient_message", 0),
        is_active=profile.is_active,
        is_available=profile.is_active and profile.is_available,
        recent_consultations=recent_consultations,
    )


@router.post("/notifications/{notification_id}/read", response_model=DoctorNotificationSchema)
async def mark_doctor_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> DoctorNotificationSchema:
    doctor_id = _require_doctor(current_user)
    result = await db.execute(
        select(DoctorNotification).where(
            DoctorNotification.id == notification_id,
            DoctorNotification.doctor_user_id == doctor_id,
        )
    )
    notification = result.scalars().first()
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thông báo")
    if notification.read_at is None:
        notification.read_at = datetime.utcnow()
        await db.commit()
        await db.refresh(notification)
    return _notification_schema(notification)


@router.post("", response_model=ConsultationDetail, status_code=status.HTTP_201_CREATED)
async def request_consultation(
    payload: CreateConsultationRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> ConsultationDetail:
    patient_id = _require_patient(current_user)
    doctor = await _doctor_profile(db, payload.doctor_id)
    if not doctor.is_active or not doctor.is_available:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bác sỹ này hiện chưa nhận tư vấn mới")
    doctor_user = await db.execute(select(User).where(User.id == doctor.user_id, User.role == "doctor"))
    if doctor_user.scalars().first() is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tài khoản bác sỹ chưa sẵn sàng")
    existing_result = await db.execute(
        select(Consultation).where(
            Consultation.patient_id == patient_id,
            Consultation.doctor_user_id == doctor.user_id,
            Consultation.status.in_(("requested", "active")),
        )
    )
    existing = existing_result.scalars().first()
    if existing is not None:
        # Selecting the same doctor again means "open our chat", not an error.
        # This makes the action retry-safe and avoids duplicate open sessions.
        response.status_code = status.HTTP_200_OK
        return await _consultation_detail(db, existing, current_user)

    message = payload.initial_message.strip() if payload.initial_message is not None else ""
    consultation = Consultation(patient_id=patient_id, doctor_user_id=doctor.user_id, status="requested")
    db.add(consultation)
    await db.flush()
    if message:
        db.add(
            ConsultationMessage(
                consultation_id=consultation.id,
                sender_user_id=current_user.user_id,
                content=message,
            )
        )
    _notify_doctor(
        db,
        doctor_user_id=doctor.user_id,
        consultation_id=consultation.id,
        kind="request",
        content_preview=message,
    )
    await db.commit()
    await db.refresh(consultation)
    return await _consultation_detail(db, consultation, current_user)


@router.get("", response_model=ConsultationList)
async def list_consultations(
    db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_current_user)
) -> ConsultationList:
    if current_user.role == "patient":
        patient_id = _require_patient(current_user)
        query = select(Consultation).where(Consultation.patient_id == patient_id)
    elif current_user.role == "doctor":
        query = select(Consultation).where(Consultation.doctor_user_id == current_user.user_id)
    else:
        raise _forbidden()
    result = await db.execute(query.order_by(Consultation.updated_at.desc()))
    return ConsultationList(consultations=[await _consultation_summary(db, item) for item in result.scalars().all()])


@router.get("/{consultation_id}", response_model=ConsultationDetail)
async def get_consultation(
    consultation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> ConsultationDetail:
    consultation = await _consultation_for_user(db, consultation_id, current_user)
    return await _consultation_detail(db, consultation, current_user)


@router.post("/{consultation_id}/accept", response_model=ConsultationDetail)
async def accept_consultation(
    consultation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> ConsultationDetail:
    doctor_id = _require_doctor(current_user)
    consultation = await _consultation_for_user(db, consultation_id, current_user)
    if consultation.doctor_user_id != doctor_id:
        raise _forbidden()
    if consultation.status != "requested":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phiên tư vấn không còn chờ nhận")
    consultation.status = "active"
    consultation.accepted_at = datetime.utcnow()
    consultation.updated_at = consultation.accepted_at
    await db.commit()
    await db.refresh(consultation)
    return await _consultation_detail(db, consultation, current_user)


@router.post("/{consultation_id}/end", response_model=ConsultationDetail)
async def end_consultation(
    consultation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> ConsultationDetail:
    consultation = await _consultation_for_user(db, consultation_id, current_user)
    if consultation.status == "ended":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phiên tư vấn đã kết thúc")
    consultation.status = "ended"
    consultation.ended_at = datetime.utcnow()
    consultation.updated_at = consultation.ended_at
    open_call = await _open_video_call(db, consultation.id)
    if open_call is not None:
        open_call.status = "ended"
        open_call.ended_at = consultation.ended_at
        db.add(
            ConsultationVideoSignal(
                call_id=open_call.id,
                sender_user_id=current_user.user_id,
                kind="hangup",
                payload="{}",
            )
        )
    await db.commit()
    await db.refresh(consultation)
    return await _consultation_detail(db, consultation, current_user)


@router.post("/{consultation_id}/messages", response_model=ConsultationMessageSchema, status_code=status.HTTP_201_CREATED)
async def send_consultation_message(
    consultation_id: str,
    payload: SendConsultationMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> ConsultationMessageSchema:
    consultation = await _consultation_for_user(db, consultation_id, current_user)
    if consultation.status == "ended":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phiên tư vấn đã kết thúc")
    if current_user.role == "doctor" and consultation.status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Hãy nhận phiên tư vấn trước khi trả lời")
    message_text = payload.content.strip()
    if not message_text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tin nhắn không được để trống")
    message = ConsultationMessage(
        consultation_id=consultation.id,
        sender_user_id=current_user.user_id,
        content=message_text,
    )
    consultation.updated_at = datetime.utcnow()
    db.add(message)
    if current_user.role == "patient":
        _notify_doctor(
            db,
            doctor_user_id=consultation.doctor_user_id,
            consultation_id=consultation.id,
            kind="patient_message",
            content_preview=message_text,
        )
    await db.commit()
    await db.refresh(message)
    return ConsultationMessageSchema(
        message_id=message.id,
        sender_role="doctor" if current_user.role == "doctor" else "patient",
        content=message.content,
        created_at=message.created_at,
    )


@router.post("/{consultation_id}/calls", response_model=VideoCallStartResponse, status_code=status.HTTP_201_CREATED)
async def start_video_call(
    consultation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> VideoCallStartResponse:
    consultation = await _consultation_for_user(db, consultation_id, current_user)
    if consultation.status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Video chỉ mở khi bác sỹ đã nhận tư vấn")
    call = await _open_video_call(db, consultation.id)
    if call is None:
        call = ConsultationVideoCall(consultation_id=consultation.id, initiated_by_user_id=current_user.user_id)
        db.add(call)
        if current_user.role == "patient":
            _notify_doctor(
                db,
                doctor_user_id=consultation.doctor_user_id,
                consultation_id=consultation.id,
                kind="video_call",
            )
        await db.commit()
        await db.refresh(call)
    return VideoCallStartResponse(**_video_summary(call).model_dump(), ice_servers=_ice_servers())


async def _call_for_participant(
    db: AsyncSession,
    consultation: Consultation,
    call_id: str,
) -> ConsultationVideoCall:
    result = await db.execute(
        select(ConsultationVideoCall).where(
            ConsultationVideoCall.id == call_id,
            ConsultationVideoCall.consultation_id == consultation.id,
        )
    )
    call = result.scalars().first()
    if call is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy cuộc gọi video")
    return call


@router.post("/{consultation_id}/calls/{call_id}/join", response_model=VideoCallStartResponse)
async def join_video_call(
    consultation_id: str,
    call_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> VideoCallStartResponse:
    consultation = await _consultation_for_user(db, consultation_id, current_user)
    call = await _call_for_participant(db, consultation, call_id)
    if call.status == "ended":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cuộc gọi đã kết thúc")
    if call.status == "ringing":
        call.status = "active"
        call.answered_at = datetime.utcnow()
        await db.commit()
        await db.refresh(call)
    return VideoCallStartResponse(**_video_summary(call).model_dump(), ice_servers=_ice_servers())


@router.post("/{consultation_id}/calls/{call_id}/signals", response_model=VideoSignal, status_code=status.HTTP_201_CREATED)
async def post_video_signal(
    consultation_id: str,
    call_id: str,
    payload: VideoSignalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> VideoSignal:
    consultation = await _consultation_for_user(db, consultation_id, current_user)
    call = await _call_for_participant(db, consultation, call_id)
    if call.status == "ended":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cuộc gọi đã kết thúc")
    signal = ConsultationVideoSignal(
        call_id=call.id,
        sender_user_id=current_user.user_id,
        kind=payload.kind,
        payload=json.dumps(payload.payload, ensure_ascii=False, separators=(",", ":")),
    )
    db.add(signal)
    await db.commit()
    await db.refresh(signal)
    return VideoSignal(signal_id=signal.id, kind=signal.kind, payload=payload.payload, created_at=signal.created_at)


@router.get("/{consultation_id}/calls/{call_id}/signals", response_model=VideoSignalList)
async def get_video_signals(
    consultation_id: str,
    call_id: str,
    after_id: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> VideoSignalList:
    consultation = await _consultation_for_user(db, consultation_id, current_user)
    await _call_for_participant(db, consultation, call_id)
    result = await db.execute(
        select(ConsultationVideoSignal)
        .where(
            ConsultationVideoSignal.call_id == call_id,
            ConsultationVideoSignal.id > after_id,
            ConsultationVideoSignal.sender_user_id != current_user.user_id,
        )
        .order_by(ConsultationVideoSignal.id.asc())
    )
    signals = []
    for signal in result.scalars().all():
        try:
            payload = json.loads(signal.payload)
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, dict):
            continue
        signals.append(
            VideoSignal(signal_id=signal.id, kind=signal.kind, payload=payload, created_at=signal.created_at)
        )
    return VideoSignalList(signals=signals)


@router.post("/{consultation_id}/calls/{call_id}/end", response_model=VideoCallSummary)
async def end_video_call(
    consultation_id: str,
    call_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> VideoCallSummary:
    consultation = await _consultation_for_user(db, consultation_id, current_user)
    call = await _call_for_participant(db, consultation, call_id)
    if call.status != "ended":
        call.status = "ended"
        call.ended_at = datetime.utcnow()
        db.add(
            ConsultationVideoSignal(
                call_id=call.id,
                sender_user_id=current_user.user_id,
                kind="hangup",
                payload="{}",
            )
        )
        await db.commit()
        await db.refresh(call)
    return _video_summary(call)
