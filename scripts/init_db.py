import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from src.core.database import engine
from src.models.domain import Base, Patient, User

async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db(reset: bool = False):
    print("Initializing database...")
    async with engine.begin() as conn:
        if reset:
            print("Dropping tables (--reset)...")
            await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    print("Tables verified.")

    async with async_session_maker() as session:
        import json
        from sqlalchemy import select
        from src.models.domain import Article, LearningPath

        res_user = await session.execute(select(User).limit(1))
        if not res_user.scalars().first() or reset:
            print("Seeding demo accounts...")
            # User benhnhan@demo.vn (p_01HQZX)
            patient_user = User(id="u_01HQZW", email="benhnhan@demo.vn", password="demo1234", role="patient")
            session.add(patient_user)

            patient_profile = Patient(
                id="p_01HQZX",
                user_id="u_01HQZW",
                age=30,
                primary_condition="type2_diabetes",
                comorbidities=[],
                diagnosed_at="2025-01",
                asking_as="self",
            )
            session.add(patient_profile)

            # User benhnhan2@demo.vn (p_02HQZX) - Older patient
            patient_user2 = User(id="u_02HQZW", email="nguoicaotuoi@demo.vn", password="demo1234", role="patient")
            session.add(patient_user2)

            patient_profile2 = Patient(
                id="p_02HQZX",
                user_id="u_02HQZW",
                age=75,
                primary_condition="type2_diabetes",
                comorbidities=["hypertension"],
                diagnosed_at="2020-01",
                asking_as="self",
            )
            session.add(patient_profile2)

            # User bientap@demo.vn
            editor_user = User(id="u_01HQZV", email="bientap@demo.vn", password="demo1234", role="editor")
            session.add(editor_user)
            await session.flush()

        res_art = await session.execute(select(Article).limit(1))
        if not res_art.scalars().first() or reset:
            print("Seeding articles and learning paths from processed JSON files...")
            for cat, fname in [("hypertension", "data/processed/articles_htn.json"),
                               ("type2_diabetes", "data/processed/articles_t2dm.json")]:
                if os.path.exists(fname):
                    with open(fname, encoding="utf-8") as f:
                        articles_data = json.load(f)

                    day = 1
                    for a_data in articles_data:
                        article = Article(
                            title=a_data["title"],
                            content=a_data["content"],
                            full_content=a_data.get("full_content", ""),
                            category=cat,
                            quiz_data=a_data.get("quiz_data"),
                            origin_source=a_data.get("origin_source", fname)
                        )
                        session.add(article)
                        await session.flush()  # Sinh ra ID

                        lp = LearningPath(
                            disease_category=cat,
                            day_number=day,
                            article_id=article.id
                        )
                        session.add(lp)
                        day += 1
                    print(f"  -> Seeded {len(articles_data)} articles for {cat}")
                else:
                    print(f"Bỏ qua dữ liệu seed cho {cat} vì không tìm thấy file {fname}")

        await session.commit()

    print("Database initialization complete.")


if __name__ == "__main__":
    reset_flag = "--reset" in sys.argv
    asyncio.run(init_db(reset=reset_flag))
