import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.core.database import engine
from src.models.domain import Base, User, Patient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

async_session_maker = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def init_db():
    print("Creating tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    
    print("Tables created.")
    
    print("Seeding demo accounts...")
    async with async_session_maker() as session:
        # User benhnhan@demo.vn (p_01HQZX)
        patient_user = User(id="u_01HQZW", email="benhnhan@demo.vn", password="demo1234", role="patient")
        session.add(patient_user)
        
        patient_profile = Patient(
            id="p_01HQZX",
            user_id="u_01HQZW",
            age=30,
            primary_condition="diabetes type 2",
            comorbidities=[],
            diagnosed_at="2025-01",
            asking_as="self"
        )
        session.add(patient_profile)
        
        # User benhnhan2@demo.vn (p_02HQZX) - Older patient
        patient_user2 = User(id="u_02HQZW", email="nguoicaotuoi@demo.vn", password="demo1234", role="patient")
        session.add(patient_user2)
        
        patient_profile2 = Patient(
            id="p_02HQZX",
            user_id="u_02HQZW",
            age=75,
            primary_condition="diabetes type 2",
            comorbidities=["hypertension"],
            diagnosed_at="2020-01",
            asking_as="self"
        )
        session.add(patient_profile2)
        
        # User bientap@demo.vn
        editor_user = User(id="u_01HQZV", email="bientap@demo.vn", password="demo1234", role="editor")
        session.add(editor_user)
        
        await session.commit()
    
    print("Database initialization complete.")

if __name__ == "__main__":
    asyncio.run(init_db())
