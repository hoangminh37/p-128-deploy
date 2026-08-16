from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.v1.auth import get_current_user
from src.core.database import get_db
from src.models.domain import Patient
from src.schemas.patient import PatientProfile, PatientProfileResponse, UserInfo

router = APIRouter(prefix="/patients", tags=["patients"])


@router.post("/profile", response_model=PatientProfileResponse)
async def update_profile(
    profile_data: PatientProfile, db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_current_user)
):
    result = await db.execute(select(Patient).filter(Patient.id == profile_data.patient_id))
    patient = result.scalars().first()

    if not patient:
        # Create new? Actually the DB seeding creates it. If not found, we can create.
        patient = Patient(
            id=profile_data.patient_id,
            age=profile_data.age,
            primary_condition=profile_data.primary_condition,
            comorbidities=profile_data.comorbidities,
            diagnosed_at=profile_data.diagnosed_at,
            asking_as=profile_data.asking_as,
        )
        db.add(patient)
    else:
        patient.age = profile_data.age
        patient.primary_condition = profile_data.primary_condition
        patient.comorbidities = profile_data.comorbidities
        patient.diagnosed_at = profile_data.diagnosed_at
        patient.asking_as = profile_data.asking_as

    await db.commit()
    await db.refresh(patient)

    return PatientProfileResponse(
        patient_id=patient.id,
        age=patient.age,
        primary_condition=patient.primary_condition,
        comorbidities=patient.comorbidities,
        diagnosed_at=patient.diagnosed_at,
        asking_as=patient.asking_as,
        updated_at=patient.updated_at.isoformat() + "Z" if patient.updated_at else "",
    )


@router.get("/{patient_id}/profile", response_model=PatientProfileResponse)
async def get_profile(patient_id: str, db: AsyncSession = Depends(get_db)):
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
        asking_as=patient.asking_as,
        updated_at=patient.updated_at.isoformat() + "Z" if patient.updated_at else "",
    )
