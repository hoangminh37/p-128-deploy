"""Regression tests for patient-profile persistence and authorization."""

from collections.abc import AsyncIterator
from datetime import date

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from src.api.v1.auth import get_current_user
from src.core.database import _add_missing_patient_profile_columns, get_db
from src.main import app
from src.models.domain import Base, Patient, User
from src.schemas.patient import UserInfo


@pytest_asyncio.fixture
async def profile_client(tmp_path) -> AsyncIterator[AsyncClient]:
    """App client backed by an isolated database and a single patient token."""
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'profile.db'}")
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        session.add(User(id="u_profile", email="profile@example.com", password="secret", role="patient"))
        session.add(
            Patient(
                id="p_profile",
                user_id="u_profile",
                age=52,
                primary_condition="hypertension",
                comorbidities=[],
                diagnosed_at="2025-01",
                asking_as="self",
            )
        )
        await session.commit()

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    async def override_current_user() -> UserInfo:
        return UserInfo(
            user_id="u_profile",
            email="profile@example.com",
            role="patient",
            patient_id="p_profile",
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_current_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        await engine.dispose()


@pytest.mark.asyncio
async def test_doi_thang_chan_doan_duoc_luu_va_doc_lai(profile_client):
    payload = {
        "patient_id": "p_profile",
        "age": 52,
        "primary_condition": "hypertension",
        "comorbidities": [],
        "diagnosed_at": "2026-08",
        "height_cm": 163,
        "weight_kg": 61.5,
        "asking_as": "self",
    }

    saved = await profile_client.post("/api/v1/patients/profile", json=payload)
    loaded = await profile_client.get("/api/v1/patients/p_profile/profile")

    assert saved.status_code == 200
    assert saved.json()["diagnosed_at"] == "2026-08"
    assert saved.json()["height_cm"] == 163
    assert saved.json()["weight_kg"] == 61.5
    assert loaded.status_code == 200
    assert loaded.json()["diagnosed_at"] == "2026-08"
    assert loaded.json()["height_cm"] == 163
    assert loaded.json()["weight_kg"] == 61.5


@pytest.mark.asyncio
async def test_chan_doan_phai_dung_dinh_dang_thang_nam(profile_client):
    response = await profile_client.post(
        "/api/v1/patients/profile",
        json={
            "patient_id": "p_profile",
            "age": 52,
            "primary_condition": "hypertension",
            "comorbidities": [],
            "diagnosed_at": "08/2026",
            "asking_as": "self",
        },
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_chan_doan_khong_the_o_thang_tuong_lai(profile_client):
    future_month = f"{date.today().year + 1}-01"
    response = await profile_client.post(
        "/api/v1/patients/profile",
        json={
            "patient_id": "p_profile",
            "age": 52,
            "primary_condition": "hypertension",
            "comorbidities": [],
            "diagnosed_at": future_month,
            "asking_as": "self",
        },
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_khong_duoc_sua_ho_so_nguoi_khac(profile_client):
    response = await profile_client.post(
        "/api/v1/patients/profile",
        json={
            "patient_id": "p_other",
            "age": 52,
            "primary_condition": "hypertension",
            "comorbidities": [],
            "diagnosed_at": "2026-08",
            "asking_as": "self",
        },
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_migration_bo_sung_cot_the_trang_cho_database_cu(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'legacy-profile.db'}")
    try:
        async with engine.begin() as connection:
            await connection.execute(text("CREATE TABLE patients (id VARCHAR PRIMARY KEY)"))
            await connection.run_sync(_add_missing_patient_profile_columns)
            columns = await connection.run_sync(
                lambda sync_connection: {
                    column["name"] for column in sync_connection.dialect.get_columns(sync_connection, "patients")
                }
            )
    finally:
        await engine.dispose()

    assert {"height_cm", "weight_kg"} <= columns
