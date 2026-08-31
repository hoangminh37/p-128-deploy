from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.v1.auth import get_current_user
from src.core.database import get_db
from src.models.domain import Patient, PatientEditorialQuestion, PatientNotification
from src.rag.registry import load_registry
from src.schemas.patient import (
    PatientNotificationList,
    PatientNotificationSchema,
    PatientProfile,
    PatientProfileResponse,
    UserInfo,
)

router = APIRouter(prefix="/patients", tags=["patients"])


def _require_profile_access(patient_id: str, current_user: UserInfo) -> None:
    """A patient may only read or change the profile linked to their token."""
    if current_user.role == "patient" and current_user.patient_id != patient_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền dùng hồ sơ bệnh nhân này")


def _require_patient(current_user: UserInfo) -> str:
    """Notification inboxes are private to the authenticated patient."""
    if current_user.role != "patient" or current_user.patient_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền dùng thông báo bệnh nhân")
    return current_user.patient_id


def _notification_schema(
    notification: PatientNotification,
    question: str | None = None,
) -> PatientNotificationSchema:
    return PatientNotificationSchema(
        notification_id=notification.id,
        kind=notification.kind,  # type: ignore[arg-type]
        title=notification.title,
        question=question,
        body=notification.body,
        created_at=notification.created_at,
        read_at=notification.read_at,
    )


def _validate_active_conditions(primary_condition: str, comorbidities: list[str]) -> None:
    """Profiles may only use conditions that currently have approved sources."""
    condition_ids = [primary_condition, *comorbidities]
    if len(condition_ids) != len(set(condition_ids)):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Không được chọn trùng bệnh")
    registry = load_registry()
    active = set(registry.active_disease_ids)
    supported = {condition_id for document in registry.approved() for condition_id in document.diseases}
    invalid = sorted(set(condition_ids) - active.intersection(supported))
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Bệnh chưa có tài liệu đã duyệt để trợ lý hỗ trợ: " + ", ".join(invalid),
        )


def _profile_response(patient: Patient) -> PatientProfileResponse:
    """Attach runtime-registry labels without duplicating catalog data in DB."""
    registry = load_registry()

    def label_for(condition_id: str) -> str:
        config = registry.diseases.get(condition_id, {})
        return str(config.get("label_vi") or condition_id.replace("_", " "))

    return PatientProfileResponse(
        patient_id=patient.id,
        age=patient.age,
        primary_condition=patient.primary_condition,
        comorbidities=patient.comorbidities,
        diagnosed_at=patient.diagnosed_at,
        height_cm=patient.height_cm,
        weight_kg=patient.weight_kg,
        asking_as=patient.asking_as,
        updated_at=patient.updated_at.isoformat() + "Z" if patient.updated_at else "",
        primary_condition_label=label_for(patient.primary_condition),
        comorbidity_labels={condition_id: label_for(condition_id) for condition_id in patient.comorbidities},
    )


@router.post("/profile", response_model=PatientProfileResponse)
async def update_profile(
    profile_data: PatientProfile, db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_current_user)
):
    _require_profile_access(profile_data.patient_id, current_user)
    _validate_active_conditions(profile_data.primary_condition, profile_data.comorbidities)
    result = await db.execute(select(Patient).filter(Patient.id == profile_data.patient_id))
    patient = result.scalars().first()

    if not patient:
        # Create new? Actually the DB seeding creates it. If not found, we can create.
        patient = Patient(
            id=profile_data.patient_id,
            user_id=current_user.user_id if current_user.role == "patient" else None,
            age=profile_data.age,
            primary_condition=profile_data.primary_condition,
            comorbidities=profile_data.comorbidities,
            diagnosed_at=profile_data.diagnosed_at,
            height_cm=profile_data.height_cm,
            weight_kg=profile_data.weight_kg,
            asking_as=profile_data.asking_as,
        )
        db.add(patient)
    else:
        patient.age = profile_data.age
        patient.primary_condition = profile_data.primary_condition
        patient.comorbidities = profile_data.comorbidities
        patient.diagnosed_at = profile_data.diagnosed_at
        patient.height_cm = profile_data.height_cm
        patient.weight_kg = profile_data.weight_kg
        patient.asking_as = profile_data.asking_as

    await db.commit()
    await db.refresh(patient)

    return _profile_response(patient)


@router.get("/{patient_id}/profile", response_model=PatientProfileResponse)
async def get_profile(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    _require_profile_access(patient_id, current_user)
    result = await db.execute(select(Patient).filter(Patient.id == patient_id))
    patient = result.scalars().first()

    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Chưa có hồ sơ cho bệnh nhân {patient_id}")

    return _profile_response(patient)


@router.get("/notifications", response_model=PatientNotificationList)
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> PatientNotificationList:
    """Return the authenticated patient's notification inbox only."""
    patient_id = _require_patient(current_user)
    result = await db.execute(
        select(PatientNotification, PatientEditorialQuestion.question)
        .outerjoin(
            PatientEditorialQuestion,
            PatientNotification.editorial_question_id == PatientEditorialQuestion.id,
        )
        .filter(PatientNotification.patient_id == patient_id)
        .order_by(PatientNotification.read_at.asc(), PatientNotification.created_at.desc())
    )
    notification_rows = result.all()
    return PatientNotificationList(
        notifications=[
            _notification_schema(notification, question)
            for notification, question in notification_rows
        ],
        unread_count=sum(notification.read_at is None for notification, _question in notification_rows),
    )


@router.post("/notifications/{notification_id}/read", response_model=PatientNotificationSchema)
async def mark_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
) -> PatientNotificationSchema:
    """Mark one owned inbox item as read without exposing another patient item."""
    patient_id = _require_patient(current_user)
    result = await db.execute(
        select(PatientNotification, PatientEditorialQuestion.question)
        .outerjoin(
            PatientEditorialQuestion,
            PatientNotification.editorial_question_id == PatientEditorialQuestion.id,
        )
        .where(
            PatientNotification.id == notification_id,
            PatientNotification.patient_id == patient_id,
        )
    )
    notification_row = result.first()
    if notification_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thông báo")
    notification, question = notification_row
    if notification.read_at is None:
        from datetime import datetime

        notification.read_at = datetime.utcnow()
        await db.commit()
        await db.refresh(notification)
    return _notification_schema(notification, question)
