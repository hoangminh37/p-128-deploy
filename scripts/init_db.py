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
        from src.models.domain import Article, EditorQueueItem, LearningPath, OutOfScopeLog

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

        res_eq = await session.execute(select(EditorQueueItem).limit(1))
        if not res_eq.scalars().first() or reset:
            print("Seeding editor queue items and out-of-scope logs...")
            eq1 = EditorQueueItem(
                id="e_01HQZ1",
                title="Hướng dẫn dinh dưỡng cho người đái tháo đường kèm tăng huyết áp (2026)",
                origin="editor_upload",
                topics=["Dinh dưỡng", "Đái tháo đường", "Tăng huyết áp"],
                status="pending",
                content="Chế độ ăn cho bệnh nhân đái tháo đường kết hợp tăng huyết áp cần hạn chế muối dưới 5g/ngày và kiểm soát chỉ số đường huyết thực phẩm (GI). Ưu tiên các loại rau xanh, ngũ cốc nguyên hạt và cá béo giàu omega-3.",
                source_url="https://moh.gov.vn/huong-dan-dieu-tri-t2dm",
                issuer="Bộ Y tế",
                doc_code="QĐ 5481/QĐ-BYT",
                conditions=["type2_diabetes", "hypertension"],
                review_note="Tài liệu cập nhật phác đồ mới nhất từ Vụ Điều trị.",
            )
            eq2 = EditorQueueItem(
                id="e_01HQZ2",
                title="Khuyến cáo hoạt động thể lực cho người cao tuổi có bệnh tim mạch",
                origin="editor_upload",
                topics=["Vận động", "Tim mạch"],
                status="pending",
                content="Bệnh nhân cao tuổi tăng huyết áp nên duy trì đi bộ nhẹ nhàng 30 phút mỗi ngày, tránh các bài tập gắng sức đột ngột.",
                source_url="https://vnha.org.vn",
                issuer="Hội Tim mạch học Việt Nam",
                doc_code="VNHA-2025-04",
                conditions=["hypertension"],
                review_note="Cần bác sĩ chuyên khoa tim mạch thẩm định trước khi duyệt.",
            )
            eq3 = EditorQueueItem(
                id="e_01HQZ3",
                title="Lưu ý khi sử dụng Metformin lúc đói",
                origin="question_log",
                topics=["Thuốc", "Đái tháo đường"],
                status="draft",
                content="Tài liệu dự thảo từ các câu hỏi người dùng thường gặp về tác dụng phụ tiêu hóa của Metformin.",
                issuer="Bệnh viện Bạch Mai",
                conditions=["type2_diabetes"],
            )
            session.add_all([eq1, eq2, eq3])

            oos1 = OutOfScopeLog(
                id="o_01HQZ1",
                question="Bị đau mắt đỏ thì nhỏ thuốc gì nhanh khỏi nhất?",
                ask_count=5,
                drafted=False,
            )
            oos2 = OutOfScopeLog(
                id="o_01HQZ2",
                question="Trẻ em 3 tuổi bị sốt phát ban cần kiêng những gì?",
                ask_count=3,
                drafted=False,
            )
            oos3 = OutOfScopeLog(
                id="o_01HQZ3",
                question="Có nên nhổ răng khôn mọc lệch khi đang cho con bú không?",
                ask_count=2,
                drafted=False,
            )
            session.add_all([oos1, oos2, oos3])
            print("  -> Seeded 3 editor queue items and 3 out-of-scope logs.")

        await session.commit()

    print("Database initialization complete.")


if __name__ == "__main__":
    reset_flag = "--reset" in sys.argv
    asyncio.run(init_db(reset=reset_flag))
