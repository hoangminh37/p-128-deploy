import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from src.core.database import engine
from src.models.domain import Base, Patient, User

async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


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

        from src.models.domain import Article, LearningPath

        article1 = Article(
            id="a_mock_1",
            title="Đường huyết là gì?",
            content="Đường huyết (hay glucose máu) là lượng đường có trong máu của bạn. Đây là nguồn năng lượng chính cho cơ thể hoạt động. Hãy tưởng tượng nó như xăng chạy xe máy vậy. Nếu đường huyết quá cao hoặc quá thấp đều ảnh hưởng đến sức khoẻ.",
            category="general",
            quiz_data={
                "question": "Đường huyết đóng vai trò gì trong cơ thể?",
                "options": [
                    "Giúp cơ thể giải nhiệt",
                    "Là nguồn năng lượng chính cho cơ thể hoạt động",
                    "Giúp xương chắc khỏe",
                    "Không có vai trò gì",
                ],
                "correct_index": 1,
            },
        )
        session.add(article1)

        article2 = Article(
            id="a_mock_2",
            title="Tập thể dục và Tiểu đường",
            content="Tập thể dục thường xuyên giúp cơ thể sử dụng insulin hiệu quả hơn, từ đó làm giảm lượng đường trong máu. Mỗi ngày bạn nên dành ít nhất 30 phút để đi bộ hoặc tập các bài tập nhẹ nhàng.",
            category="general",
            quiz_data={
                "question": "Bạn nên dành bao nhiêu thời gian mỗi ngày để tập thể dục?",
                "options": ["Chỉ cần 5 phút", "Ít nhất 30 phút", "Không cần tập", "Tập 3 tiếng"],
                "correct_index": 1,
            },
        )
        session.add(article2)

        lp1 = LearningPath(disease_category="type2_diabetes", day_number=1, article_id="a_mock_1")
        lp2 = LearningPath(disease_category="type2_diabetes", day_number=2, article_id="a_mock_2")
        session.add_all([lp1, lp2])

        await session.commit()

    print("Database initialization complete.")


if __name__ == "__main__":
    asyncio.run(init_db())
