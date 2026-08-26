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


async def ensure_patient_profile_schema() -> None:
    """Bring pre-existing profile tables up to the current additive schema."""
    async with engine.begin() as conn:
        await conn.run_sync(_add_missing_patient_profile_columns)
