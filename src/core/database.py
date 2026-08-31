from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from src.core.config import get_settings

settings = get_settings()


engine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
)

async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with async_session_maker() as session:
        yield session


async def ensure_routine_memory_schema() -> None:
    """Create the additive routine-memory table for existing development DBs."""
    from src.models.domain import PatientRoutineMemory

    async with engine.begin() as conn:
        await conn.run_sync(PatientRoutineMemory.__table__.create, checkfirst=True)


def _add_missing_patient_profile_columns(connection: Connection) -> None:
    """Additive migration for development databases created before body fields.

    ``Base.metadata.create_all`` does not alter an existing ``patients`` table,
    so without this migration a successful profile update would silently lose
    the new height/weight fields in the deployed SQLite database.
    """
    inspector = inspect(connection)
    if "patients" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("patients")}
    column_types = {"height_cm": "INTEGER", "weight_kg": "FLOAT"}
    for column, column_type in column_types.items():
        if column not in existing:
            connection.execute(text(f"ALTER TABLE patients ADD COLUMN {column} {column_type}"))


def _add_missing_doctor_profile_columns(connection: Connection) -> None:
    """Keep the public doctor profile additive for databases made before it."""
    inspector = inspect(connection)
    if "doctor_profiles" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("doctor_profiles")}
    column_types = {
        "clinic_name": "VARCHAR",
        "experience_years": "INTEGER",
        "consultation_focus": "TEXT",
        "verification_status": "VARCHAR DEFAULT 'verified'",
        "verified_at": "DATETIME",
    }
    for column, column_type in column_types.items():
        if column not in existing:
            connection.execute(text(f"ALTER TABLE doctor_profiles ADD COLUMN {column} {column_type}"))

    # Earlier profiles could only be created by the editorial workflow. Preserve
    # that fact after the new public verification field is introduced instead of
    # hiding a legitimate existing doctor until somebody rewrites the profile.
    connection.execute(
        text(
            "UPDATE doctor_profiles "
            "SET verification_status = 'verified' "
            "WHERE verification_status IS NULL OR verification_status = ''"
        )
    )
    connection.execute(text("UPDATE doctor_profiles SET verified_at = created_at WHERE verified_at IS NULL"))


async def ensure_patient_profile_schema() -> None:
    """Bring pre-existing profile tables up to the current additive schema."""
    async with engine.begin() as conn:
        await conn.run_sync(_add_missing_patient_profile_columns)


async def ensure_consultation_schema() -> None:
    """Create consultation tables additively for existing local deployments."""
    from src.models.domain import (
        Consultation,
        ConsultationMessage,
        ConsultationVideoCall,
        ConsultationVideoSignal,
        DoctorNotification,
        DoctorProfile,
    )

    async with engine.begin() as conn:
        for table in (
            DoctorProfile.__table__,
            Consultation.__table__,
            ConsultationMessage.__table__,
            ConsultationVideoCall.__table__,
            ConsultationVideoSignal.__table__,
            DoctorNotification.__table__,
        ):
            await conn.run_sync(table.create, checkfirst=True)
        await conn.run_sync(_add_missing_doctor_profile_columns)


async def ensure_editorial_response_schema() -> None:
    """Create the additive patient-question and notification inbox tables."""
    from src.models.domain import PatientEditorialQuestion, PatientNotification

    async with engine.begin() as conn:
        for table in (PatientEditorialQuestion.__table__, PatientNotification.__table__):
            await conn.run_sync(table.create, checkfirst=True)
