#!/usr/bin/env python
"""Seed medical documents vào Qdrant vector store.

Usage:
    python scripts/seed_medical_docs.py

Yêu cầu:
    - Qdrant đang chạy (docker compose up qdrant)
    - OPENAI_API_KEY trong .env
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from src.core.config import get_settings

DATA_DIR = Path(__file__).parent.parent / "data" / "medical"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50


def load_medical_docs() -> list[Document]:
    """Load tất cả .txt files từ data/medical/."""
    docs = []
    for txt_file in DATA_DIR.glob("*.txt"):
        content = txt_file.read_text(encoding="utf-8")
        docs.append(Document(
            page_content=content,
            metadata={
                "title": txt_file.stem.replace("_", " ").title(),
                "source": txt_file.name,
                "disease_type": txt_file.stem,
            },
        ))
        print(f"  Loaded: {txt_file.name} ({len(content)} chars)")
    return docs


def chunk_docs(docs: list[Document]) -> list[Document]:
    """Chunk documents thành các đoạn nhỏ hơn."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ".", " "],
    )
    chunks = splitter.split_documents(docs)
    print(f"  Chunked: {len(docs)} docs → {len(chunks)} chunks")
    return chunks


def ensure_collection(client: QdrantClient, collection_name: str, dim: int) -> None:
    """Tạo collection nếu chưa tồn tại."""
    existing = [c.name for c in client.get_collections().collections]
    if collection_name not in existing:
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
        )
        print(f"  Created collection: {collection_name}")
    else:
        print(f"  Collection already exists: {collection_name}")


def main() -> None:
    settings = get_settings()
    print("=" * 50)
    print("Seeding Medical Documents to Qdrant")
    print("=" * 50)
    print(f"Qdrant URL: {settings.qdrant_url}")
    print(f"Collection: {settings.qdrant_collection}")
    print(f"Embedding:  {settings.embedding_model}")
    print()

    # Load và chunk
    print("[1/4] Loading documents...")
    docs = load_medical_docs()
    if not docs:
        print("  ERROR: No .txt files found in data/medical/")
        sys.exit(1)

    print("[2/4] Chunking documents...")
    chunks = chunk_docs(docs)

    # Setup Qdrant
    print("[3/4] Connecting to Qdrant...")
    client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)
    ensure_collection(client, settings.qdrant_collection, settings.embedding_dim)

    # Embed và upsert
    print("[4/4] Embedding and uploading to Qdrant...")
    embeddings = OpenAIEmbeddings(
        model=settings.embedding_model,
        api_key=settings.openai_api_key,
    )
    QdrantVectorStore.from_documents(
        documents=chunks,
        embedding=embeddings,
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key or None,
        collection_name=settings.qdrant_collection,
    )

    print()
    print(f"✅ Done! Uploaded {len(chunks)} chunks to '{settings.qdrant_collection}'")
    print("Run 'python scripts/check_qdrant.py' to verify.")


if __name__ == "__main__":
    main()
