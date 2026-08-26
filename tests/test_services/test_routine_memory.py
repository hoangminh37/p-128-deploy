"""Routine memory only persists explicit, verifiable patient statements."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from src.models.domain import Base, Patient
from src.services.routine_memory import load_routine_memory, record_routine_updates, validate_routine_updates


def test_validate_chi_nhan_chung_cu_nam_trong_cau_hoi():
    source = "Tôi đi bộ 30 phút mỗi sáng và đo huyết áp trước khi ăn sáng."
    updates = [
        {"category": "activity", "evidence": "Tôi đi bộ 30 phút mỗi sáng"},
        {"category": "medication_routine", "evidence": "Tôi uống amlodipine mỗi tối"},
    ]

    valid = validate_routine_updates(updates, source_text=source)

    assert valid == [{"category": "activity", "fact": "Tôi đi bộ 30 phút mỗi sáng"}]


@pytest.mark.asyncio
async def test_record_giu_memory_ben_vung_va_khu_trung_lap(tmp_path):
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'routine.db'}"
    engine = create_async_engine(database_url)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    source = "Tôi đi bộ 30 phút mỗi sáng."
    raw_updates = [{"category": "activity", "evidence": "Tôi đi bộ 30 phút mỗi sáng"}]
    async with session_factory() as session:
        session.add(
            Patient(
                id="p_routine",
                age=45,
                primary_condition="hypertension",
                comorbidities=[],
                asking_as="self",
            )
        )
        await session.flush()
        assert await record_routine_updates(
            session,
            patient_id="p_routine",
            raw_updates=raw_updates,
            source_text=source,
        ) == 1
        await session.commit()

        assert await record_routine_updates(
            session,
            patient_id="p_routine",
            raw_updates=raw_updates,
            source_text=source,
        ) == 0
        await session.commit()
        entries = await load_routine_memory(session, "p_routine")

    await engine.dispose()

    assert len(entries) == 1
    assert entries[0]["category"] == "activity"
    assert entries[0]["fact"] == "Tôi đi bộ 30 phút mỗi sáng"
