#!/usr/bin/env python
"""Kiểm tra Qdrant collection đã có data chưa.

Usage:
    python scripts/check_qdrant.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from qdrant_client import QdrantClient

from src.core.config import get_settings


def main() -> None:
    settings = get_settings()
    print(f"Connecting to Qdrant: {settings.qdrant_url}")

    try:
        client = QdrantClient(url=settings.qdrant_url, timeout=5)
        collections = client.get_collections().collections
        names = [c.name for c in collections]

        print(f"Collections: {names}")

        if settings.qdrant_collection in names:
            info = client.get_collection(settings.qdrant_collection)
            count = info.points_count
            print(f"✅ '{settings.qdrant_collection}': {count} vectors")
            if count == 0:
                print("⚠️  Collection empty — run: python scripts/seed_medical_docs.py")
        else:
            print(f"❌ Collection '{settings.qdrant_collection}' not found.")
            print("   Run: python scripts/seed_medical_docs.py")
    except Exception as exc:
        print(f"❌ Cannot connect to Qdrant: {exc}")
        print("   Make sure Qdrant is running: docker compose up qdrant")
        sys.exit(1)


if __name__ == "__main__":
    main()
