import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from src.core.database import engine
from src.models.domain import Article, Base, LearningPath, MedicalChunk, Patient, User

async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def seed_medical_chunks(session: AsyncSession, reset: bool = False):
    """Seed / Migrate 1.088+ chunks y tế kèm embeddings vào PostgreSQL (pgvector)."""
    res = await session.execute(select(func.count(MedicalChunk.chunk_id)))
    count = res.scalar() or 0

    if count > 0 and not reset:
        print(f"Bảng medical_chunks đã có {count} chunks (bỏ qua seed).")
        return

    print("Bắt đầu nạp dữ liệu vector chunks vào bảng medical_chunks...")

    # Đọc từ ChromaDB có sẵn trong repo (đã tính sẵn vector 1024-dim)
    chroma_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "vectorstore"))
    if os.path.exists(chroma_dir):
        try:
            import chromadb

            client = chromadb.PersistentClient(path=chroma_dir)
            col = client.get_collection("medical_docs")
            total_chroma = col.count()
            print(f"  -> Đang đọc {total_chroma} chunks từ kho ChromaDB...")

            # Đọc theo từng batch 200 để tiết kiệm bộ nhớ
            batch_size = 200
            offset = 0
            inserted = 0

            while offset < total_chroma:
                data = col.get(
                    limit=batch_size,
                    offset=offset,
                    include=["embeddings", "documents", "metadatas"],
                )
                if not data or not data["ids"]:
                    break

                chunk_models = []
                for i in range(len(data["ids"])):
                    cid = data["ids"][i]
                    doc_text = data["documents"][i]
                    meta = data["metadatas"][i] or {}
                    emb = data["embeddings"][i] if data["embeddings"] is not None else None

                    # Trích xuất các trường cấu trúc
                    doc_id = str(meta.get("doc_id", "?"))
                    disease = str(meta.get("disease", "")) or None
                    priority = float(meta.get("priority", 0.0) or 0.0)
                    section_path = str(meta.get("section_path", "")) or None
                    page_start = int(meta.get("page_start", -1) or -1)
                    page_end = int(meta.get("page_end", -1) or -1)

                    # Parse table_structure safely
                    table_struct = meta.get("table_structure")
                    if isinstance(table_struct, str):
                        if table_struct.strip() in ("", "null", "None"):
                            table_struct = None
                        else:
                            try:
                                table_struct = json.loads(table_struct)
                            except Exception:
                                table_struct = None

                    clean_meta = dict(meta)
                    clean_meta["table_structure"] = table_struct

                    # Convert embedding to clean float list
                    embedding_list = [float(v) for v in emb] if emb is not None else None

                    chunk_models.append(
                        MedicalChunk(
                            chunk_id=cid,
                            doc_id=doc_id,
                            text=doc_text,
                            embed_text=doc_text,
                            disease=disease,
                            priority=priority,
                            section_path=section_path,
                            page_start=page_start if page_start >= 1 else None,
                            page_end=page_end if page_end >= 1 else None,
                            table_structure=table_struct,
                            metadata_json=clean_meta,
                            embedding=embedding_list,
                        )
                    )

                session.add_all(chunk_models)
                await session.flush()
                inserted += len(chunk_models)
                offset += batch_size

            print(f"  ✅ Đã nạp thành công {inserted} vector chunks vào PostgreSQL!")
            return
        except Exception as exc:
            await session.rollback()
            print(f"  ⚠️ Không đọc được từ ChromaDB ({exc}), thử nạp từ JSONL...")

    # Fallback: Đọc từ chunks.jsonl
    jsonl_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "processed", "chunks.jsonl"))
    if os.path.exists(jsonl_path):
        from src.rag.chunk import Chunk
        from src.rag.store import make_embedder

        embedder = make_embedder()
        chunks: list[Chunk] = []
        with open(jsonl_path, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    chunks.append(Chunk.from_dict(json.loads(line)))

        print(f"  -> Đang embed và nạp {len(chunks)} chunks từ {jsonl_path}...")
        vectors = embedder.embed_documents([c.embed_text for c in chunks])

        chunk_models = []
        for c, vec in zip(chunks, vectors):
            chunk_models.append(
                MedicalChunk(
                    chunk_id=c.chunk_id,
                    doc_id=c.doc_id,
                    text=c.text,
                    embed_text=c.embed_text,
                    disease=c.disease,
                    priority=float(c.priority or 0.0),
                    section_path=c.section_path,
                    page_start=c.page_start,
                    page_end=c.page_end,
                    table_structure=c.table_structure,
                    metadata_json=c.metadata,
                    embedding=vec,
                )
            )
        session.add_all(chunk_models)
        await session.flush()
        print(f"  ✅ Đã embed và nạp {len(chunk_models)} chunks vào PostgreSQL!")


async def init_db(reset: bool = False):
    print("Initializing database...")
    async with engine.begin() as conn:
        # Nếu là PostgreSQL, kích hoạt extension vector
        if engine.dialect.name == "postgresql":
            try:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
                print("Extension 'vector' enabled.")
            except Exception as e:
                print(f"Note: Could not execute CREATE EXTENSION vector: {e}")

        if reset:
            print("Dropping tables (--reset)...")
            await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

        # Cập nhật kiểu cột và tạo HNSW index trên PostgreSQL
        if engine.dialect.name == "postgresql":
            try:
                await conn.execute(text("ALTER TABLE medical_chunks ALTER COLUMN section_path TYPE TEXT;"))
                await conn.execute(text("ALTER TABLE medical_chunks ALTER COLUMN doc_id TYPE VARCHAR(120);"))
                await conn.execute(text("ALTER TABLE medical_chunks ALTER COLUMN disease TYPE VARCHAR(120);"))
            except Exception:
                pass

            try:
                await conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS idx_medical_chunks_embedding "
                        "ON medical_chunks USING hnsw (embedding vector_cosine_ops);"
                    )
                )
            except Exception:
                pass

    print("Tables verified.")

    async with async_session_maker() as session:
        res_user = await session.execute(select(User).limit(1))
        if not res_user.scalars().first() or reset:
            print("Seeding demo accounts...")
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

            editor_user = User(id="u_01HQZV", email="bientap@demo.vn", password="demo1234", role="editor")
            session.add(editor_user)
            await session.flush()

        res_art = await session.execute(select(Article).limit(1))
        if not res_art.scalars().first() or reset:
            print("Seeding articles and learning paths from processed JSON files...")
            for cat, fname in [
                ("hypertension", "data/processed/articles_htn.json"),
                ("type2_diabetes", "data/processed/articles_t2dm.json"),
            ]:
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
                            origin_source=a_data.get("origin_source", fname),
                        )
                        session.add(article)
                        await session.flush()

                        lp = LearningPath(
                            disease_category=cat,
                            day_number=day,
                            article_id=article.id,
                        )
                        session.add(lp)
                        day += 1
                    print(f"  -> Seeded {len(articles_data)} articles for {cat}")
                else:
                    print(f"Bỏ qua dữ liệu seed cho {cat} vì không tìm thấy file {fname}")

        # Seed vector chunks
        await seed_medical_chunks(session, reset=reset)

        await session.commit()

    print("Database initialization complete.")


if __name__ == "__main__":
    reset_flag = "--reset" in sys.argv
    asyncio.run(init_db(reset=reset_flag))
