---
title: "Writing Tests"
description: "Cấu trúc kiểm thử và cách viết tests cho Agent, RAG và API"
weight: 1
---

## 1. Cấu trúc thư mục kiểm thử (Test Structure)

Toàn bộ hệ thống hiện có **29 test suites** với **320 automated tests** được phân loại rõ ràng:

```
tests/
├── conftest.py                   ← Fixtures dùng chung (AsyncClient, Mock LLM)
├── test_agents/                  ← Kiểm thử LangGraph v2, Intent Router, Verifier (40 tests)
│   ├── test_graph_v2.py
│   ├── test_intent_router.py
│   ├── test_query_preprocessor.py
│   ├── test_hybrid_retrieval.py
│   ├── test_generate_and_verify.py
│   ├── test_answer_verifier.py
│   └── test_term_annotations.py
├── test_api/                     ← Kiểm thử REST API, WebRTC, Auth, Editor (68 tests)
│   ├── test_routes.py
│   ├── test_quiz.py
│   ├── test_consultations.py
│   ├── test_patient_profile.py
│   ├── test_editor_documents.py
│   ├── test_editor_conditions.py
│   ├── test_editor_source_pipeline.py
│   ├── test_source_documents.py
│   └── test_voice_chat_stream.py
├── test_rag/                     ← Kiểm thử ETL Ingestion, VectorStore, Normalization (172 tests)
│   ├── test_normalize.py
│   ├── test_chunk.py
│   ├── test_store.py             ← Dual VectorStore (ChromaDB + PgVector Parity)
│   ├── test_ingest.py
│   ├── test_structure.py
│   ├── test_registry.py
│   ├── test_diseases.py
│   ├── test_runtime_registry.py
│   └── test_parse_tables.py
├── test_services/                ← Kiểm thử Core Services (10 tests)
│   ├── test_llm_factory.py
│   ├── test_routine_memory.py
│   └── test_voice.py
└── test_scripts/                 ← Kiểm thử Scripts & Utilities (2 tests)
    └── test_log_codex_history.py
```

---

## 2. Các mẫu viết Test chuẩn (Best Practices)

### 2.1. API Endpoints Test (với Auth & Roles)
```python
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_chat_requires_auth(client: AsyncClient):
    response = await client.post("/api/v1/chat", json={"message": "Xin chào"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("ok", "degraded")
```

### 2.2. LangGraph Agent Test (với Mock LLM)
```python
import pytest
from src.agent.graph import agent


@pytest.mark.asyncio
async def test_agent_red_flag_routing():
    state = {
        "query": "Tôi đang đau thắt ngực dữ dội và khó thở quá",
        "patient_id": "test_patient",
        "messages": [{"role": "user", "content": "Tôi đang đau thắt ngực dữ dội"}],
    }
    result = await agent.ainvoke(state)
    assert result.get("is_red_flag") is True
    assert "115" in result.get("response", "")
```

### 2.3. RAG Vector Store Test (ChromaDB & PgVector Parity)
```python
def test_dual_vectorstore_parity(store):
    assert store.count() >= 0
    stats = store.stats()
    assert "total" in stats
```

---

## 3. Thực thi Tests & CI/CD

```bash
# Chạy toàn bộ 320 tests
pytest tests/ -v

# Chạy theo từng module
pytest tests/test_agents/ -v
pytest tests/test_rag/ -v
pytest tests/test_api/ -v

# Kiểm tra code coverage
pytest tests/ --cov=src --cov-report=term-missing
```

> 📖 **Xem thêm tài liệu chi tiết**:
> - [`docs/TESTING.md`](../../TESTING.md): Đặc tả toàn bộ 320 tests, AI Benchmark (RAGAS / Judge) và kịch bản Manual Test.
> - [`eval/results/benchmark_report.md`](../../../eval/results/benchmark_report.md): Báo cáo thực nghiệm so sánh với Baseline.

