"""Embedding và vector store (ChromaDB).

Vì sao Chroma: task Gate 2 và brief đều ghi ChromaDB/FAISS, và src/config.py đã
có sẵn `chroma_persist_dir`. Lưu ý ARCHITECTURE.md đang ghi Qdrant — hai chỗ này
lệch nhau, cần thống nhất lại. Lớp VectorStore dưới đây cố tình mỏng, đổi sang
Qdrant chỉ phải viết lại file này chứ không đụng tới pipeline.

Xếp hạng kết quả: điểm cuối cùng = độ tương đồng ngữ nghĩa + trọng số recency
nhân với priority của tài liệu. Với ranking_policy = recency, tài liệu mới hơn
được cộng điểm — đúng chính sách team chốt ngày 15/08/2026.
"""

from __future__ import annotations

import json
import logging
import os
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Protocol, cast

from src.rag.chunk import Chunk
from src.rag.config import RagSettings, get_rag_settings

logger = logging.getLogger(__name__)


def _table_structure_from_metadata(value: object) -> dict[str, Any] | None:
    """Decode optional structured table metadata without trusting malformed data."""
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    if not isinstance(parsed.get("rows"), int) or not isinstance(parsed.get("columns"), int):
        return None
    if parsed["rows"] < 1 or parsed["columns"] < 1 or not isinstance(parsed.get("cells"), list):
        return None
    return parsed


# -----------------------------------------------------------------------------
# Embedding
# -----------------------------------------------------------------------------


def _openai_api_key() -> str:
    """Lấy khoá API từ môi trường, rồi mới tới .env.

    RagSettings dùng tiền tố RAG_ nên không đọc được OPENAI_API_KEY. Khoá này
    đã có sẵn trong src/config.py Settings — vốn đọc .env — nên dùng lại thay vì
    khai báo thêm một chỗ nữa cho cùng một biến.
    """
    key = os.getenv("OPENAI_API_KEY", "")
    if key:
        return key
    try:
        from src.config import get_settings

        return get_settings().openai_api_key
    except Exception:
        return ""


class Embedder(Protocol):
    """Giao diện chung cho mọi cách sinh vector.

    Tách làm hai phương thức chứ không dùng chung một, vì một số mô hình dùng
    biểu diễn KHÁC NHAU cho tài liệu và cho câu hỏi. Cohere là ví dụ: nó bắt
    khai báo `input_type` là `search_document` hay `search_query`, và đưa sai
    loại làm chất lượng truy xuất tụt rõ rệt. Gộp thành một hàm thì lỗi này
    không có chỗ nào để lộ ra.

    Mô hình đối xứng (bge-m3, OpenAI) chỉ việc cho hai phương thức làm như nhau.
    """

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class _TokenBudget:
    """Điều tiết theo cửa sổ trượt 60 giây để không đâm vào hạn mức token/phút.

    Gói trial của Cohere cho 100.000 token mỗi phút. Gửi ào ạt thì API trả 429
    và cả lần ingest hỏng giữa chừng, nên chủ động ngủ chờ vẫn hơn là để lỗi
    rồi thử lại — vừa nhanh hơn vừa không tốn lượt gọi vô ích.
    """

    def __init__(self, tokens_per_minute: int):
        self.limit = tokens_per_minute
        self._window: deque[tuple[float, int]] = deque()

    def consume(self, tokens: int, *, wait: bool = True) -> None:
        while True:
            now = time.monotonic()
            while self._window and now - self._window[0][0] >= 60:
                self._window.popleft()

            used = sum(t for _, t in self._window)
            if not self._window or used + tokens <= self.limit:
                self._window.append((now, tokens))
                return

            wait_seconds = 60 - (now - self._window[0][0]) + 0.5
            if not wait:
                raise RuntimeError(
                    "Đã chạm hạn mức embedding Cohere tạm thời; không chờ trong lúc xử lý câu hỏi người bệnh."
                )
            logger.info(
                "chờ %.0fs cho hạn mức token của Cohere (đã dùng %d/%d)",
                wait_seconds,
                used,
                self.limit,
            )
            time.sleep(wait_seconds)


class CohereEmbedder:
    """Cohere embed-multilingual-v3.0 — mặc định của dự án.

    Là mô hình BẤT ĐỐI XỨNG: tài liệu đưa vào với `search_document`, câu hỏi
    đưa vào với `search_query`. Cohere huấn luyện riêng hai loại biểu diễn này,
    dùng đúng loại là điều kiện để truy xuất chạy đúng chất lượng.
    """

    def __init__(self, settings: RagSettings | None = None):
        import cohere

        self.settings = settings or get_rag_settings()
        raw_key = self.settings.cohere_api_key or ""
        self.api_keys = [k.strip() for k in raw_key.split(",") if k.strip()]
        if not self.api_keys:
            raise RuntimeError(
                "Thiếu COHERE_API_KEY. Lấy khoá miễn phí tại https://dashboard.cohere.com/api-keys "
                "rồi thêm dòng COHERE_API_KEY=... vào .env"
            )
        self._current_key_idx = 0
        self._clients = [
            cohere.ClientV2(
                api_key=k,
                timeout=self.settings.cohere_timeout_seconds,
                max_retries=0,
            )
            for k in self.api_keys
        ]
        self._budget = _TokenBudget(self.settings.cohere_tokens_per_minute)

    @property
    def client(self):
        return self._clients[self._current_key_idx]

    def _rotate_key(self):
        if len(self._clients) > 1:
            self._current_key_idx = (self._current_key_idx + 1) % len(self._clients)
            logger.info("Chuyển sang Cohere API key dự phòng index %d", self._current_key_idx)

    def _embed_batch(
        self,
        part: list[str],
        input_type: str,
        *,
        max_attempts: int,
    ) -> list[list[float]]:
        """Gọi API một lô, có điều tiết trước và thử lại nếu vẫn dính 429.

        ``search_query`` phải trả về nhanh để agent còn có thể fail-closed;
        vì vậy chỉ gọi một lần. Ingest chạy nền thì có thể chờ và thử lại.
        """
        from cohere.errors import TooManyRequestsError

        from src.rag.chunk import count_tokens

        # Chỉ ingest nền được phép chờ cửa sổ rate-limit. Nếu truy vấn chat
        # chạm giới hạn, trả fail-closed ngay để không giữ SSE của người dùng.
        self._budget.consume(
            sum(count_tokens(t) for t in part),
            wait=input_type != "search_query",
        )

        resp = None
        for attempt in range(max_attempts):
            try:
                resp = self.client.embed(
                    model=self.settings.cohere_embedding_model,
                    input_type=input_type,
                    texts=part,
                    embedding_types=["float"],
                )
                break
            except TooManyRequestsError:
                self._rotate_key()
                if attempt == max_attempts - 1:
                    break
                wait = 1.0 * (attempt + 1) if input_type == "search_query" else 15 * (attempt + 1)
                logger.warning(
                    "Cohere trả 429, chờ %.1fs rồi thử lại (lần %d/%d)",
                    wait,
                    attempt + 1,
                    max_attempts,
                )
                time.sleep(wait)
        if resp is None:
            raise RuntimeError(
                f"Cohere liên tục trả 429 sau {max_attempts} lần thử. "
                "Hạ RAG_COHERE_TOKENS_PER_MINUTE hoặc kiểm tra hạn mức tài khoản."
            )

        vectors = resp.embeddings.float_
        if vectors is None:
            raise RuntimeError("Cohere trả về không có vector float — kiểm tra tham số embedding_types")
        return [list(v) for v in vectors]

    def _call(self, texts: list[str], input_type: str, *, max_attempts: int) -> list[list[float]]:
        out: list[list[float]] = []
        batch = self.settings.cohere_batch_size  # Cohere chặn ở 96 văn bản mỗi lần
        for i in range(0, len(texts), batch):
            out.extend(self._embed_batch(texts[i : i + batch], input_type, max_attempts=max_attempts))
            if len(texts) > batch:
                logger.info("embedded %d/%d", min(i + batch, len(texts)), len(texts))
        return out

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._call(texts, "search_document", max_attempts=5)

    def embed_query(self, text: str) -> list[float]:
        return self._call([text], "search_query", max_attempts=3)[0]


class LocalEmbedder:
    """Mô hình embedding chạy trên máy, mặc định là BAAI/bge-m3.

    Ưu điểm: miễn phí, offline, không phụ thuộc hạn mức bên thứ ba. bge-m3 là
    mô hình mở mạnh nhất cho tiếng Việt hiện nay.

    Nhược điểm — lý do nó không còn là mặc định: tải 2.2GB model, embed toàn bộ
    corpus trên CPU mất khoảng 50 phút, và server phải nạp 2.5GB RAM để embed
    câu hỏi nên không deploy được lên free tier. Vẫn giữ lại vì nó là phương án
    duy nhất chạy được hoàn toàn offline, hữu ích khi làm việc không có mạng
    hoặc khi cần tránh gửi dữ liệu ra ngoài.

    Là mô hình đối xứng: bge-m3 không cần tiền tố riêng cho câu hỏi.
    """

    def __init__(self, settings: RagSettings | None = None):
        from sentence_transformers import SentenceTransformer

        self.settings = settings or get_rag_settings()
        logger.info("nạp mô hình embedding %s (lần đầu sẽ tải model)", self.settings.local_embedding_model)
        self.model = SentenceTransformer(self.settings.local_embedding_model)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors = self.model.encode(
            texts,
            batch_size=self.settings.embedding_batch_size,
            normalize_embeddings=self.settings.local_embedding_normalize,
            show_progress_bar=len(texts) > 100,
            convert_to_numpy=True,
        )
        return [v.tolist() for v in vectors]

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]


class OpenAIEmbedder:
    """Bọc mỏng quanh OpenAI embeddings, có chia lô và thử lại.

    Là mô hình đối xứng: tài liệu và câu hỏi dùng chung một biểu diễn.
    """

    def __init__(self, settings: RagSettings | None = None):
        from openai import OpenAI

        self.settings = settings or get_rag_settings()
        api_key = _openai_api_key()
        if not api_key:
            raise RuntimeError("Thiếu OPENAI_API_KEY. Copy .env.example thành .env rồi điền khoá.")
        self.client = OpenAI(api_key=api_key, max_retries=4)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        batch = self.settings.embedding_batch_size
        for i in range(0, len(texts), batch):
            part = texts[i : i + batch]
            resp = self.client.embeddings.create(
                model=self.settings.openai_embedding_model,
                input=part,
                dimensions=self.settings.openai_embedding_dimensions,
            )
            out.extend(item.embedding for item in resp.data)
            logger.info("embedded %d/%d", min(i + batch, len(texts)), len(texts))
        return out

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]


def make_embedder(settings: RagSettings | None = None) -> Embedder:
    """Dựng embedder theo cấu hình `embedding_provider`."""
    settings = settings or get_rag_settings()
    if settings.embedding_provider == "cohere":
        return CohereEmbedder(settings)
    if settings.embedding_provider == "local":
        return LocalEmbedder(settings)
    return OpenAIEmbedder(settings)


# -----------------------------------------------------------------------------
# Kết quả truy xuất
# -----------------------------------------------------------------------------


@dataclass
class Hit:
    chunk_id: str
    text: str
    metadata: dict
    similarity: float  # độ tương đồng ngữ nghĩa thuần, chưa cộng recency
    score: float  # điểm cuối cùng dùng để xếp hạng

    @property
    def citation(self) -> dict:
        """Rút gọn thành đúng hình dạng Citation trong docs/api-contract.md."""
        m = self.metadata
        return {
            "title": m.get("title", ""),
            "issuer": m.get("issuer", ""),
            "doc_code": m.get("doc_code") or None,
            "url": m.get("url") or None,
            "snippet": self.text[:300],
        }


# -----------------------------------------------------------------------------
# Vector store (ChromaDB + PostgreSQL pgvector Dual-Mode)
# -----------------------------------------------------------------------------


def is_postgres_backend() -> bool:
    """Kiểm tra xem backend database có phải là PostgreSQL hay không."""
    try:
        from src.core.config import get_settings

        db_url = get_settings().database_url
        return "postgres" in db_url.lower()
    except Exception:
        return False


class ChromaStore:
    """Vector store cục bộ chạy bằng ChromaDB."""

    def __init__(self, settings: RagSettings | None = None, embedder: Embedder | None = None):
        import chromadb

        self.settings = settings or get_rag_settings()
        self.settings.vectorstore_dir.mkdir(parents=True, exist_ok=True)
        self.client = chromadb.PersistentClient(path=str(self.settings.vectorstore_dir))
        self.collection = self.client.get_or_create_collection(
            name=self.settings.collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        self._embedder = embedder

    @property
    def embedder(self) -> Embedder:
        if self._embedder is None:
            self._embedder = make_embedder(self.settings)
        return self._embedder

    def reset(self) -> None:
        """Xoá sạch collection. Dùng khi đổi cách chunk hoặc đổi model embedding."""
        self.client.delete_collection(self.settings.collection_name)
        self.collection = self.client.get_or_create_collection(
            name=self.settings.collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def upsert(self, chunks: list[Chunk]) -> int:
        """Nạp chunk vào store. Dùng upsert nên chạy lại nhiều lần vẫn an toàn."""
        if not chunks:
            return 0
        vectors = self.embedder.embed_documents([c.embed_text for c in chunks])
        batch = 256
        for i in range(0, len(chunks), batch):
            part = chunks[i : i + batch]
            self.collection.upsert(
                ids=[c.chunk_id for c in part],
                embeddings=cast(Any, vectors[i : i + batch]),
                documents=[c.text for c in part],
                metadatas=cast(Any, [c.metadata for c in part]),
            )
        return len(chunks)

    def search(
        self,
        query: str,
        disease: str | list[str] | None = None,
        allowed_doc_ids: list[str] | None = None,
        top_k: int | None = None,
        min_similarity: float | None = None,
    ) -> list[Hit]:
        s = self.settings
        top_k = top_k or s.top_k
        min_similarity = s.min_similarity if min_similarity is None else min_similarity

        requested_diseases = [disease] if isinstance(disease, str) else (disease or [])
        requested_diseases = list(dict.fromkeys(item for item in requested_diseases if item))
        clauses: list[dict[str, Any]] = []
        if len(requested_diseases) == 1:
            clauses.append({f"disease_{requested_diseases[0]}": True})
        elif requested_diseases:
            clauses.append({"$or": [{f"disease_{item}": True} for item in requested_diseases]})

        if allowed_doc_ids is not None:
            approved_ids = list(dict.fromkeys(doc_id for doc_id in allowed_doc_ids if doc_id))
            if not approved_ids:
                return []
            clauses.append({"doc_id": {"$in": approved_ids}})

        if not clauses:
            where: dict[str, Any] | None = None
        elif len(clauses) == 1:
            where = clauses[0]
        else:
            where = {"$and": clauses}

        vector = self.embedder.embed_query(query)
        res: Any = self.collection.query(
            query_embeddings=cast(Any, [vector]),
            n_results=min(s.top_k_fetch, max(self.count(), 1)),
            where=cast(Any, where),
            include=cast(Any, ["documents", "metadatas", "distances"]),
        )

        hits: list[Hit] = []
        ids = (res.get("ids") or [[]])[0]
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[]])[0]
        dists = (res.get("distances") or [[]])[0]

        for cid, text, meta, dist in zip(ids, docs, metas, dists, strict=False):
            similarity = 1.0 - float(dist)
            if similarity < min_similarity:
                continue
            priority = float(meta.get("priority", 0.0) or 0.0)
            score = similarity + s.recency_weight * priority
            hits.append(Hit(chunk_id=cid, text=text, metadata=dict(meta), similarity=similarity, score=score))

        hits.sort(key=lambda h: (-h.score, h.chunk_id))
        return hits[:top_k]

    def document_chunks(self, document_id: str) -> list[dict[str, Any]]:
        result: Any = self.collection.get(
            where=cast(Any, {"doc_id": document_id}),
            include=cast(Any, ["documents", "metadatas"]),
        )
        chunks: list[dict[str, Any]] = []
        for chunk_id, content, metadata in zip(
            result.get("ids") or [],
            result.get("documents") or [],
            result.get("metadatas") or [],
            strict=False,
        ):
            metadata = metadata or {}
            start = int(metadata.get("page_start", -1) or -1)
            end = int(metadata.get("page_end", -1) or -1)
            chunks.append(
                {
                    "chunk_id": str(chunk_id),
                    "content": str(content or ""),
                    "section_path": str(metadata.get("section_path") or "") or None,
                    "page_start": start if start >= 1 else None,
                    "page_end": end if end >= 1 else None,
                    "table": _table_structure_from_metadata(metadata.get("table_structure")),
                }
            )

        return sorted(chunks, key=lambda chunk: chunk["chunk_id"])

    def delete_by_doc(self, doc_id: str) -> int:
        before = self.count()
        self.collection.delete(where=cast(Any, {"doc_id": doc_id}))
        removed = before - self.count()
        logger.info("xoá %d chunk của %s", removed, doc_id)
        return removed

    def count(self) -> int:
        return self.collection.count()

    def stats(self) -> dict:
        got: Any = self.collection.get(include=cast(Any, ["metadatas"]))
        per_doc: dict[str, int] = {}
        for m in got.get("metadatas") or []:
            doc_id = str(m.get("doc_id", "?"))
            per_doc[doc_id] = per_doc.get(doc_id, 0) + 1
        return {"total": self.count(), "per_doc": dict(sorted(per_doc.items()))}


class PgVectorStore:
    """Vector store chuẩn production chạy trực tiếp trên PostgreSQL với pgvector."""

    def __init__(self, settings: RagSettings | None = None, embedder: Embedder | None = None):
        self.settings = settings or get_rag_settings()
        self._embedder = embedder
        self._sync_engine = None

    @property
    def embedder(self) -> Embedder:
        if self._embedder is None:
            self._embedder = make_embedder(self.settings)
        return self._embedder

    def _get_sync_engine(self):
        if self._sync_engine is None:
            from sqlalchemy import create_engine, event

            from src.core.config import get_settings

            db_url = get_settings().database_url
            sync_url = db_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
            if sync_url.startswith("postgres://"):
                sync_url = sync_url.replace("postgres://", "postgresql+psycopg2://", 1)
            elif sync_url.startswith("postgresql://") and not sync_url.startswith("postgresql+psycopg2://"):
                sync_url = sync_url.replace("postgresql://", "postgresql+psycopg2://", 1)

            self._sync_engine = create_engine(sync_url, pool_pre_ping=True)

            @event.listens_for(self._sync_engine, "connect")
            def on_sync_connect(dbapi_connection, connection_record):
                try:
                    import pgvector.psycopg2

                    pgvector.psycopg2.register_vector(dbapi_connection)
                except Exception:
                    pass

        return self._sync_engine

    def reset(self) -> None:
        from sqlalchemy import text

        with self._get_sync_engine().begin() as conn:
            if "postgres" in str(conn.engine.url):
                conn.execute(text("TRUNCATE TABLE medical_chunks;"))
            else:
                conn.execute(text("DELETE FROM medical_chunks;"))

    def upsert(self, chunks: list[Chunk]) -> int:
        if not chunks:
            return 0
        from sqlalchemy.dialects.postgresql import insert

        from src.models.domain import MedicalChunk

        vectors = self.embedder.embed_documents([c.embed_text for c in chunks])
        engine = self._get_sync_engine()

        batch = 100
        for i in range(0, len(chunks), batch):
            part_chunks = chunks[i : i + batch]
            part_vectors = vectors[i : i + batch]

            rows = []
            for c, vec in zip(part_chunks, part_vectors):
                rows.append(
                    {
                        "chunk_id": c.chunk_id,
                        "doc_id": c.doc_id,
                        "text": c.text,
                        "embed_text": c.embed_text,
                        "disease": c.disease,
                        "priority": float(c.priority or 0.0),
                        "section_path": c.section_path,
                        "page_start": c.page_start,
                        "page_end": c.page_end,
                        "table_structure": c.table_structure,
                        "metadata_json": c.metadata,
                        "embedding": vec,
                    }
                )

            stmt = insert(MedicalChunk).values(rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=[MedicalChunk.chunk_id],
                set_={
                    "text": stmt.excluded.text,
                    "embed_text": stmt.excluded.embed_text,
                    "disease": stmt.excluded.disease,
                    "priority": stmt.excluded.priority,
                    "section_path": stmt.excluded.section_path,
                    "page_start": stmt.excluded.page_start,
                    "page_end": stmt.excluded.page_end,
                    "table_structure": stmt.excluded.table_structure,
                    "metadata_json": stmt.excluded.metadata_json,
                    "embedding": stmt.excluded.embedding,
                },
            )
            with engine.begin() as conn:
                conn.execute(stmt)

        return len(chunks)

    def search(
        self,
        query: str,
        disease: str | list[str] | None = None,
        allowed_doc_ids: list[str] | None = None,
        top_k: int | None = None,
        min_similarity: float | None = None,
    ) -> list[Hit]:
        s = self.settings
        top_k = top_k or s.top_k
        min_similarity = s.min_similarity if min_similarity is None else min_similarity

        if allowed_doc_ids is not None:
            approved_ids = list(dict.fromkeys(doc_id for doc_id in allowed_doc_ids if doc_id))
            if not approved_ids:
                return []

        vector = self.embedder.embed_query(query)
        engine = self._get_sync_engine()

        from sqlalchemy import and_, or_, select

        from src.models.domain import MedicalChunk

        sim_col = (1.0 - MedicalChunk.embedding.cosine_distance(vector)).label("similarity")
        score_col = (sim_col + s.recency_weight * MedicalChunk.priority).label("score")

        filters = []
        requested_diseases = [disease] if isinstance(disease, str) else (disease or [])
        requested_diseases = list(dict.fromkeys(item for item in requested_diseases if item))
        if requested_diseases:
            disease_conditions = []
            for d in requested_diseases:
                disease_conditions.append(MedicalChunk.disease == d)
                disease_conditions.append(MedicalChunk.disease.like(f"%{d}%"))
                disease_conditions.append(MedicalChunk.metadata_json[f"disease_{d}"].as_boolean().is_(True))
            filters.append(or_(*disease_conditions))

        if allowed_doc_ids is not None:
            filters.append(MedicalChunk.doc_id.in_(approved_ids))

        filters.append(sim_col >= min_similarity)

        stmt = (
            select(
                MedicalChunk.chunk_id,
                MedicalChunk.text,
                MedicalChunk.metadata_json,
                sim_col,
                score_col,
            )
            .where(and_(*filters))
            .order_by(score_col.desc(), MedicalChunk.chunk_id.asc())
            .limit(s.top_k_fetch)
        )

        hits: list[Hit] = []
        with engine.connect() as conn:
            result = conn.execute(stmt)
            for row in result:
                cid, text_val, meta, sim, score = row
                hits.append(
                    Hit(
                        chunk_id=str(cid),
                        text=str(text_val),
                        metadata=dict(meta or {}),
                        similarity=float(sim),
                        score=float(score),
                    )
                )

        return hits[:top_k]

    def document_chunks(self, document_id: str) -> list[dict[str, Any]]:
        from sqlalchemy import select

        from src.models.domain import MedicalChunk

        engine = self._get_sync_engine()
        stmt = (
            select(
                MedicalChunk.chunk_id,
                MedicalChunk.text,
                MedicalChunk.section_path,
                MedicalChunk.page_start,
                MedicalChunk.page_end,
                MedicalChunk.table_structure,
            )
            .where(MedicalChunk.doc_id == document_id)
            .order_by(MedicalChunk.chunk_id.asc())
        )
        chunks: list[dict[str, Any]] = []
        with engine.connect() as conn:
            for row in conn.execute(stmt):
                start = row.page_start
                end = row.page_end
                chunks.append(
                    {
                        "chunk_id": str(row.chunk_id),
                        "content": str(row.text or ""),
                        "section_path": str(row.section_path or "") or None,
                        "page_start": int(start) if start and start >= 1 else None,
                        "page_end": int(end) if end and end >= 1 else None,
                        "table": row.table_structure,
                    }
                )
        return chunks

    def delete_by_doc(self, doc_id: str) -> int:
        from sqlalchemy import delete

        from src.models.domain import MedicalChunk

        engine = self._get_sync_engine()
        with engine.begin() as conn:
            result = conn.execute(delete(MedicalChunk).where(MedicalChunk.doc_id == doc_id))
            removed = result.rowcount
            logger.info("xoá %d chunk của %s từ pgvector", removed, doc_id)
            return removed

    def count(self) -> int:
        from sqlalchemy import func, select

        from src.models.domain import MedicalChunk

        engine = self._get_sync_engine()
        with engine.connect() as conn:
            return conn.execute(select(func.count(MedicalChunk.chunk_id))).scalar() or 0

    @property
    def collection(self):
        return self

    def stats(self) -> dict:
        from sqlalchemy import func, select

        from src.models.domain import MedicalChunk

        engine = self._get_sync_engine()
        with engine.connect() as conn:
            total = conn.execute(select(func.count(MedicalChunk.chunk_id))).scalar() or 0
            stmt = select(MedicalChunk.doc_id, func.count(MedicalChunk.chunk_id)).group_by(MedicalChunk.doc_id)
            per_doc = {str(r[0]): int(r[1]) for r in conn.execute(stmt)}
            return {"total": total, "per_doc": dict(sorted(per_doc.items()))}


class VectorStore:
    """Lớp bọc VectorStore đa tầng (Dual-Mode Router).

    Tự động chọn PgVectorStore khi kết nối PostgreSQL, hoặc ChromaStore khi chạy SQLite local.
    """

    def __new__(cls, settings: RagSettings | None = None, embedder: Embedder | None = None):
        if is_postgres_backend():
            return PgVectorStore(settings=settings, embedder=embedder)
        return ChromaStore(settings=settings, embedder=embedder)
