# Tài liệu Kỹ thuật: Medical AI Agent

> **Nhánh:** `gate2/Dung/code` | **Stack:** FastAPI + LangGraph + Qdrant + Groq/OpenAI

---

## 1. Tổng quan hệ thống

Medical AI Agent là backend thông minh phục vụ hỏi đáp y tế. Hệ thống tiếp nhận câu hỏi từ người dùng, chạy qua pipeline an toàn gồm **13 nodes LangGraph**, trả về câu trả lời có trích dẫn nguồn và streaming realtime qua SSE.

```
Người dùng → FastAPI → LangGraph Agent → Qdrant (Vector DB) → LLM → Câu trả lời
```

---

## 2. Cấu trúc thư mục

```
src/
├── main.py                      # FastAPI app factory
├── config.py                    # Shim → core/config.py
│
├── core/                        # Cross-cutting concerns
│   ├── config.py                # Toàn bộ Settings (Pydantic BaseSettings)
│   ├── exceptions.py            # Custom exception hierarchy
│   └── logging.py               # Logger factory
│
├── schemas/                     # Data contracts (Pydantic)
│   ├── chat.py                  # ChatRequest, ChatResponse, SSE events
│   └── patient.py               # PatientProfile, Message, Citation
│
├── services/                    # Infrastructure adapters
│   ├── llm/factory.py           # get_llm() → ChatGroq | ChatOpenAI
│   ├── vector_store/
│   │   ├── client.py            # Qdrant client singleton
│   │   └── retriever.py         # search_similar(query, top_k)
│   └── guardrail/
│       ├── keywords.py          # Danh sách từ khóa nguy hiểm
│       └── checker.py           # classify_guardrail(query)
│
├── agent/                       # LangGraph domain
│   ├── state.py                 # AgentState TypedDict (20+ fields)
│   ├── graph.py                 # build_graph() — 13 nodes + edges
│   ├── prompts/                 # intent · rewrite · generate · verify
│   └── nodes/
│       ├── safety/              # intent_router · emergency · refuse
│       ├── preprocessing/       # coref_resolution · query_rewrite
│       ├── retrieval/           # hybrid_retrieval · crag · doctor_referral
│       └── generation/          # llm_generate · selfrag · partial · disclaimer · checkpoint
│
└── api/v1/
    ├── chat.py                  # POST /chat, POST /chat/stream (SSE)
    └── health.py                # GET /health, GET /status
```

---

## 3. Cấu hình (`src/core/config.py`)

| Biến môi trường | Mặc định | Ý nghĩa |
|----------------|----------|---------|
| `GROQ_API_KEY` | `""` | API key Groq LLM |
| `OPENAI_API_KEY` | `""` | API key OpenAI (embeddings + fallback) |
| `LLM_PROVIDER` | `"groq"` | Provider chính: `groq` hoặc `openai` |
| `MODEL_NAME` | `"llama-3.3-70b-versatile"` | Tên model LLM |
| `QDRANT_URL` | `"http://localhost:6333"` | Địa chỉ Qdrant |
| `QDRANT_COLLECTION` | `"medical_docs"` | Collection lưu docs y tế |
| `EMBEDDING_MODEL` | `"text-embedding-3-small"` | Model embedding |
| `CORS_ORIGINS` | `"http://localhost:5180"` | Frontend origin |

---

## 4. Schemas (`src/schemas/`)

### `patient.py` — Domain models

```python
PatientProfile:
    age: int | None
    gender: str | None            # "male" | "female" | "other"
    conditions: list[str]         # bệnh nền: ["tiểu đường", "cao huyết áp"]
    medications: list[str]
    allergies: list[str]

Citation:
    doc_id: str
    title: str
    source: str
    snippet: str
```

### `chat.py` — HTTP contracts

```python
ChatRequest:
    message: str                  # câu hỏi (1–4096 ký tự)
    patient_id: str = "anonymous"
    patient_profile: PatientProfile
    history: list[Message]
    → to_agent_state()            # convert sang dict cho LangGraph

ChatResponse:
    response: str
    intent: str                   # "education" | "red_flag" | "diagnosis"
    support_level: str            # "fully" | "partially" | "no_support"
    citations: list[Citation]
```

**SSE Events:**

| Event | Thời điểm | Payload |
|-------|-----------|---------|
| `step` | Mỗi node bắt đầu | `{node, message, icon}` |
| `token` | Sau khi Self-RAG verified | `{text}` — từng từ |
| `done` | Kết thúc pipeline | `{citations, support_level, disclaimer}` |

---

## 5. Services (`src/services/`)

### LLM Factory (`services/llm/factory.py`)

```python
get_llm(provider=None)  → BaseChatModel
get_fast_llm()          → ChatGroq    # dùng cho intent, guardrail
get_quality_llm()       → ChatOpenAI  # dùng cho generate, verify (fallback Groq)
```

Tất cả nodes dùng factory — **không import ChatGroq/ChatOpenAI trực tiếp**.

### Vector Store (`services/vector_store/`)

```python
# client.py
get_qdrant_client() → QdrantClient   # singleton @lru_cache

# retriever.py
search_similar(query: str, top_k: int = 8) → list[Document]
# Raise RetrievalFailed nếu Qdrant không phản hồi
```

### Guardrail (`services/guardrail/`)

```python
# checker.py — rule-based, không tốn LLM token
classify_guardrail(query) → "red_flag" | "diagnosis" | None
check_emergency(query)    → bool   # 24 từ khóa khẩn cấp
check_diagnosis_request(query) → bool  # 14 từ khóa kê toa/chẩn đoán
```

---

## 6. Agent State (`src/agent/state.py`)

```python
class AgentState(TypedDict, total=False):
    # Input
    query: str                    # câu hỏi gốc của người dùng
    patient_id: str
    patient_profile: dict
    messages: list[dict]          # lịch sử hội thoại

    # Routing
    intent: "education"|"red_flag"|"diagnosis"
    is_red_flag: bool

    # Preprocessing
    resolved_query: str           # sau coref_resolution
    rewritten_query: str          # sau query_rewrite

    # Retrieval
    retrieved_docs: list[dict]    # raw từ Qdrant
    relevant_strips: list[dict]   # sau CRAG filter

    # Generation
    analysis: str                 # CoT reasoning (nội bộ, không gửi FE)
    response: str                 # câu trả lời cuối
    citations: list[dict]

    # Verification
    support_level: "fully"|"partially"|"no_support"
    unsupported_sentences: list[str]

    # Control flow
    retry_count: int              # đếm retry, max 2

    # Meta
    error: str | None
    metadata: dict
```

---

## 7. LangGraph Pipeline — 13 Nodes

### Luồng xử lý

```
START
  └─► intent_router
         ├── red_flag   → emergency_handler → END
         ├── diagnosis  → refuse_handler    → END
         └── education  → coref_resolution
                              └─► query_rewrite
                                      └─► hybrid_retrieval ◄──── (retry loop)
                                               └─► crag_evaluator
                                                      ├── strips=0 → doctor_referral → END
                                                      └── strips>0 → llm_generate
                                                                         └─► selfrag_verifier
                                                                                ├── fully    → memory_checkpoint → END
                                                                                ├── partially → partial_rewrite ──► (loop lại hybrid_retrieval, max 2 lần)
                                                                                └── no_support → safety_disclaimer → memory_checkpoint → END
```

### Stage 1: Safety

| Node | LLM? | Logic |
|------|------|-------|
| `intent_router` | ✅ Groq | Rule-based trước → LLM classify fallback |
| `emergency_handler` | ❌ | Template cảnh báo + số 115, **không log PII** |
| `refuse_handler` | ❌ | Từ chối 100% chẩn đoán/kê toa |

### Stage 2: Preprocessing

| Node | LLM? | Logic |
|------|------|-------|
| `coref_resolution` | ✅ Groq | Giải đại từ: "thuốc đó" → "Metformin" |
| `query_rewrite` | ✅ Groq | Ghép patient profile: thêm tuổi, bệnh nền vào query |

### Stage 3: Retrieval

| Node | LLM? | Logic |
|------|------|-------|
| `hybrid_retrieval` | ❌ | Dense search Qdrant, top_k tăng khi retry |
| `crag_evaluator` | ✅ Groq | Score từng doc: `relevant` / `irrelevant` |
| `doctor_referral` | ❌ | Template fallback khi không có doc liên quan |

### Stage 4: Generation

| Node | LLM? | Logic |
|------|------|-------|
| `llm_generate` | ✅ Quality | CoT + JSON `{answer, claims[cited_doc_id]}` |
| `selfrag_verifier` | ✅ Quality | Per-sentence ISUF → fully/partially/no_support |
| `partial_rewrite` | ❌ | Tăng `retry_count`, enrich query từ `unsupported_sentences` |
| `safety_disclaimer` | ❌ | Gắn cảnh báo y tế FR#4 vào response |
| `memory_checkpoint` | ❌ | Finalize state, log metadata (MVP: không lưu DB) |

---

## 8. Conditional Edges (`src/agent/graph.py`)

```python
def route_intent(state) → str:
    is_red_flag=True   → "emergency_handler"
    intent="diagnosis" → "refuse_handler"
    else               → "coref_resolution"

def route_crag(state) → str:
    relevant_strips=[] → "doctor_referral"
    else               → "llm_generate"

def route_selfrag(state) → str:
    "fully"      → "memory_checkpoint"
    "partially"  → "partial_rewrite"
    "no_support" → "safety_disclaimer"

def route_partial(state) → str:
    retry_count <= 2 → "hybrid_retrieval"  # loop
    retry_count > 2  → "memory_checkpoint" # give up
```

---

## 9. API Endpoints

### `POST /api/v1/chat` — Sync

```bash
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Bệnh tiểu đường type 2 là gì?",
    "patient_profile": {"age": 55, "conditions": ["cao huyết áp"]}
  }'
```

### `POST /api/v1/chat/stream` — SSE

```
event: step
data: {"node": "intent_router", "message": "🔍 Đang phân tích câu hỏi...", "icon": "🔍"}

event: step
data: {"node": "hybrid_retrieval", "message": "📚 Đang tìm kiếm tài liệu...", "icon": "📚"}

event: token
data: {"text": "Bệnh "}

event: token
data: {"text": "tiểu đường "}

event: done
data: {"citations": [...], "support_level": "fully", "intent": "education"}
```

---

## 10. Hướng dẫn chạy

```bash
# 1. Cài dependencies
pip install -r requirements.txt

# 2. Cấu hình .env
cp .env.example .env   # điền GROQ_API_KEY, OPENAI_API_KEY

# 3. Khởi động Qdrant
make docker-up

# 4. Seed dữ liệu y tế (3 tài liệu mẫu)
make seed

# 5. Chạy server
make run   # → http://localhost:8000/docs

# Kiểm tra
make check-qdrant
```

---

## 11. Test Cases

| Case | Input | Expected |
|------|-------|----------|
| Emergency | "Tôi đang khó thở, đau ngực" | `red_flag` → cảnh báo 115 |
| Refuse | "Kê toa thuốc cho tôi" | `diagnosis` → từ chối |
| Normal RAG | "Bệnh tiểu đường là gì?" | retrieve → crag → generate → citations |
| No docs | Query bệnh cực hiếm | `strips=[]` → doctor_referral |
| Partial | Response thiếu nguồn | retry ≤ 2 → lại retrieval, sau đó disclaimer |

---

## 12. Safety Rules

| Rule | Cơ chế |
|------|--------|
| **FR3.2** Emergency | Rule-based → `emergency_handler`, không log PII |
| **FR3.4** Refuse | Rule-based + LLM → `refuse_handler`, 100% từ chối |
| **FR#4** Disclaimer | `safety_disclaimer` gắn cảnh báo khi `no_support` |
| **Self-RAG** | `selfrag_verifier` kiểm tra toàn bộ trước khi phát `token` events |
