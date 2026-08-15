from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import jwt
from datetime import datetime, timedelta, UTC

from src.core.config import get_settings
from src.core.database import get_db
from src.models.domain import User
from src.schemas.patient import LoginRequest, LoginResponse, UserInfo

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()
settings = get_settings()

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days for development


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> UserInfo:
    """Dependency: Extract user info from JWT."""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")
        email: str = payload.get("email")
        role: str = payload.get("role")
        patient_id = payload.get("patient_id")
        
        if user_id is None or email is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token không hợp lệ")
            
        return UserInfo(user_id=user_id, email=email, role=role, patient_id=patient_id)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token đã hết hạn")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Xác thực không thành công")


async def get_editor_user(
    current_user: UserInfo = Depends(get_current_user),
) -> UserInfo:
    """Dependency: Restrict access to editors only."""
    if current_user.role != "editor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền truy cập chức năng này")
    return current_user


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.email == request.email))
    user = result.scalars().first()
    
    if not user or user.password != request.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng"
        )
    
    # Check if patient profile exists to attach patient_id
    patient_id = None
    if user.role == "patient":
        from src.models.domain import Patient
        patient_result = await db.execute(select(Patient).filter(Patient.user_id == user.id))
        patient = patient_result.scalars().first()
        if patient:
            patient_id = patient.id
            
    # Generate JWT
    token_data = {
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
        "patient_id": patient_id
    }
    access_token = create_access_token(token_data)
    
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
