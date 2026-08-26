from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.v1.auth import get_current_user
from src.core.database import get_db
from src.models.domain import Patient
from src.schemas.patient import PatientProfile, PatientProfileResponse, UserInfo

router = APIRouter(prefix="/patients", tags=["patients"])


def _require_profile_access(patient_id: str, current_user: UserInfo) -> None:
    """A patient may only read or change the profile linked to their token."""
    if current_user.role == "patient" and current_user.patient_id != patient_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền dùng hồ sơ bệnh nhân này")


@router.post("/profile", response_model=PatientProfileResponse)
async def update_profile(
    profile_data: PatientProfile, db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_current_user)
):
    _require_profile_access(profile_data.patient_id, current_user)
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
    )


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
    )
