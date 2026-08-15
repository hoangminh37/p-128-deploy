from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.core.database import get_db
from src.models.domain import User
from src.schemas.patient import LoginRequest, LoginResponse, UserInfo
import time

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.email == request.email))
    user = result.scalars().first()
    
    if not user or user.password != request.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng"
        )
    
    access_token = f"mock.{user.id}.{int(time.time())}"
    
    # Check if patient profile exists to attach patient_id
    patient_id = None
    if user.role == "patient":
        # We know it exists from the relationship, but let's safely fetch
        from src.models.domain import Patient
        patient_result = await db.execute(select(Patient).filter(Patient.user_id == user.id))
        patient = patient_result.scalars().first()
        if patient:
            patient_id = patient.id
    
    user_info = UserInfo(
        user_id=user.id,
        email=user.email,
        role=user.role,
        patient_id=patient_id
    )
    
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_info
    )

@router.post("/logout", status_code=204)
async def logout():
    return None
