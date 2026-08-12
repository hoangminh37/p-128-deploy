# Architecture Document

## System Overview

Hệ thống là một Medical AI Agent được xây dựng trên kiến trúc 3 tầng (Client → FastAPI Backend → AI Agent + Data Layer), sử dụng LangGraph làm AI Orchestration Engine với pipeline RAG nâng cao tích hợp CRAG, Self-RAG và Safety Guardrails chuyên biệt cho lĩnh vực Y tế. Agent được phân loại theo pattern Router Agent + RAG Agent, phù hợp với bài toán hỏi đáp y tế có nhiều loại intent khác nhau (giáo dục, khẩn cấp, chẩn đoán).

## Architecture Diagram

### System Overview Diagram

```mermaid
graph TD
    subgraph CLIENT ["Client"]
        WEB["Web Browser"]
        MOBILE["Mobile App"]
    end

    subgraph BACKEND ["FastAPI Backend"]
        GW["API Gateway"]
        GW --> AUTH["Auth Module"]
        GW --> SESSION["Semantic Cache"]
        GW --> CHAT["Chat Handler"]
    end

    subgraph AGENT ["AI Agent (LangGraph)"]
        ORC["Agent Orchestrator"]
        ORC --> MEM["Memory Manager"]
        ORC --> IR["Intent Router"]
        IR --> RAG["RAG Pipeline\nRetrieval · CRAG · Self-RAG"]
        IR --> SAFETY["Safety Handler\nEmergency · Refuse"]
        IR --> DR["Doctor Referral\nFallback"]
    end

    subgraph DATA ["Data Layer"]
        PG[("PostgreSQL\nChat History")]
        VDB[("Vector DB\nMedical Docs")]
        RD[("Redis\nSession · Cache")]
    end

    subgraph EXT ["External Services"]
        LLM["LLM API\n(Groq / OpenAI)"]
        PUBMED["PubMed API\nFallback Search"]
    end

    %% Connections
    WEB & MOBILE --> GW
    CHAT --> ORC
    MEM --> PG
    MEM --> RD
    SESSION --> RD
    RAG --> VDB
    ORC --> LLM
    DR --> PUBMED
```

### Kiến trúc 3 Tầng

```mermaid
graph TB
    subgraph T1 ["Tier 1 · Presentation (Client)"]
        direction LR
        WEB["Web Browser"]
        MOBILE["Mobile App"]
    end

    subgraph T2 ["Tier 2 · Application (FastAPI Backend)"]
        direction LR
        GW["API Gateway"]
        AUTH["Auth Module\nJWT · Rate Limit"]
        CACHE["Semantic Cache\nRedis"]
        CHAT["Chat Handler\nAgent Observation Stream"]

        GW --> AUTH
        GW --> CACHE
        GW --> CHAT
    end

    subgraph T3 ["Tier 3 · Intelligence (AI Agent + Data)"]
        direction TB

        subgraph AGENT ["AI Agent · LangGraph"]
            direction TB
            ORC["Agent Orchestrator"]

            ORC --> SAFETY["Safety Layer\nEmergency · Refuse"]
            ORC --> RAG["RAG Pipeline\nCoref → Rewrite → Retrieve → CRAG"]
            ORC --> MEM["Memory Manager\nCheckpoint · History"]

            RAG --> GEN["Generation Layer\nLLM Generate → Self-RAG Verify"]
            GEN --> MEM
        end

        subgraph DATA ["Data Layer"]
            direction LR
            VDB[("Vector DB\nQdrant")]
            PG[("PostgreSQL\nHistory")]
            RD[("Redis\nSession · Cache")]
        end

        RAG <--> VDB
        MEM <--> PG
        MEM <--> RD
    end

    subgraph EXT ["External Services"]
        direction LR
        LLM["LLM Provider\nGroq / OpenAI"]
        PUBMED["PubMed API\nFallback"]
    end

    %% Tier connections
    WEB & MOBILE -->|"HTTPS"| GW
    CHAT -->|"invoke"| ORC
    CACHE <-->|"R/W"| RD
    ORC <-->|"Inference"| LLM
    SAFETY -->|"Fallback"| PUBMED
    MEM -->|"Observation Events\n(step · token · done)"| CHAT
```

| Tầng                      | Trách nhiệm                           | Thành phần                                         |
| :------------------------ | :------------------------------------ | :------------------------------------------------- |
| **Tier 1** · Client       | Giao diện người dùng, nhận Observation Stream | Web Browser · Mobile App                           |
| **Tier 2** · Backend      | Auth, caching, điều phối request      | API Gateway · Auth · Semantic Cache · Chat Handler |
| **Tier 3** · Intelligence | Xử lý AI + lưu trữ toàn bộ dữ liệu    | LangGraph Agent · Qdrant · PostgreSQL · Redis      |

## Components

### 1. Frontend (React/Next.js)

- **Purpose:** Giao diện người dùng tương tác với Medical AI Agent — hiển thị tiến trình xử lý từng bước của Agent, câu trả lời được xác thực và lịch sử hội thoại.
- **Key Features:**
  - Chat Interface với Agent Observation Stream — hiển thị step events (trạng thái xử lý) và token events (text kết quả) theo thời gian thực
  - Dashboard: lịch sử hội thoại, số lượng token, thời gian phản hồi từng bước
  - Hỗ trợ đa nền tảng: Web Browser và Mobile App
- **State Management:** React Context / Zustand cho chat state cục bộ

### 2. Backend (FastAPI)

- **Purpose:** Tầng trung gian điều phối toàn bộ request từ Client đến AI Agent — xử lý bảo mật, cache có ngữ cảnh và Agent Observation Stream.
- **API Design:** RESTful + SSE (Server-Sent Events) với Agent Observation Stream
- **Authentication:** JWT Token · Rate Limiting per user
- **Key Modules:**
  - `API Gateway`: Tiếp nhận và validate request đầu vào
  - `Auth Module`: Xác thực JWT, phân quyền, rate limit
  - `Semantic Cache`: Kiểm tra cache với **composite key = `Vector(query)` + `hash(patient_profile)`**. Chỉ cache query dạng `general_education` (không phụ thuộc hồ sơ cá nhân). Query dạng `personalized` (liên quan liều thuốc, bệnh nền cụ thể) **bắt buộc bypass cache** và đi qua RAG Agent để tránh trả về kết quả sai cho bệnh nhân khác nhau.
  - `Chat Handler`: Điều phối request tới LangGraph Agent, phát **Agent Observation Stream** (3 loại event: `step`, `token`, `done`) về FE theo thời gian thực

### 3. AI Agent (LangGraph)

- **Agent Type:** Router Agent + RAG Agent
- **State:** `AgentState` TypedDict — lưu toàn bộ context qua các node

```python
class AgentState(TypedDict, total=False):
    # Input
    query: str
    patient_id: str
    patient_profile: PatientProfile
    messages: List[Message]
    # Routing
    intent: Literal["education", "red_flag", "diagnosis"]
    is_red_flag: bool
    # Preprocessing
    resolved_query: str
    rewritten_query: str
    # Retrieval
    retrieved_docs: List[Document]
    relevant_strips: List[Strip]
    # Generation
    analysis: str
    response: str
    citations: List[Citation]
    # Verification
    support_level: Literal["fully", "partially", "no_support"]
    unsupported_sentences: List[str]
    # Meta
    error: Optional[str]
    metadata: dict
```

- **Nodes:**

| Node                | Vai trò                                            |
| :------------------ | :------------------------------------------------- |
| `intent_router`     | Phân loại intent bằng LLM nhỏ / rule-based         |
| `emergency_handler` | Cảnh báo khẩn cấp — FR3.2, không lưu PII           |
| `refuse_handler`    | Từ chối 100% câu hỏi chẩn đoán / kê toa — FR3.4    |
| `coref_resolution`  | Giải quyết đại từ tham chiếu → thực thể cụ thể     |
| `query_rewrite`     | Ghép hồ sơ bệnh nhân + lịch sử hội thoại           |
| `hybrid_retrieval`  | BM25 + Dense Vector Search + metadata filter       |
| `reranker`          | Cross-encoder scoring, MedRAG top-k scaling        |
| `crag_evaluator`    | Đánh giá từng strip: relevant / irrelevant         |
| `crag_recompose`    | Sắp xếp strips — chống Lost-in-the-Middle          |
| `doctor_referral`   | Fallback khi strips = 0                            |
| `llm_generate`      | CoT + JSON schema `{answer, claims[cited_doc_id]}` |
| `selfrag_verifier`  | ISUF per-sentence: fully / partially / no_support  |
| `partial_rewrite`   | Đánh dấu câu thiếu nguồn, retry tối đa 2 lần       |
| `safety_disclaimer` | Gắn cảnh báo y tế FR#4 khi no_support              |
| `memory_checkpoint` | Lưu Q&A vào Redis + PostgreSQL                     |

- **Flow:**

```mermaid
stateDiagram-v2
    direction TB

    [*] --> intent_router

    %% ── SAFETY LAYER ──
    intent_router --> emergency_handler  : red_flag
    intent_router --> refuse_handler     : diagnosis / prescription
    intent_router --> coref_resolution   : education / general

    emergency_handler --> [*]            : Direct response
    refuse_handler    --> [*]            : Blocked

    %% ── PREPROCESSING ──
    coref_resolution --> query_rewrite
    query_rewrite    --> hybrid_retrieval

    %% ── RETRIEVAL ──
    hybrid_retrieval --> reranker

    %% ── CRAG ──
    reranker        --> crag_evaluator
    crag_evaluator  --> crag_recompose      : strips > 0
    crag_evaluator  --> doctor_referral     : strips = 0

    state doctor_referral {
        [*] --> suggest : "Không đủ thông tin"
        suggest --> [*] : "Vui lòng liên hệ bác sĩ tư vấn"
    }

    doctor_referral --> [*]              : Referral response

    %% ── GENERATION ──
    crag_recompose  --> llm_generate

    %% ── VERIFICATION ──
    llm_generate    --> selfrag_verifier

    selfrag_verifier --> memory_checkpoint : fully supported
    selfrag_verifier --> partial_rewrite   : partially supported
    selfrag_verifier --> safety_disclaimer : no support

    partial_rewrite   --> memory_checkpoint
    safety_disclaimer --> memory_checkpoint

    %% ── OUTPUT ──
    memory_checkpoint --> [*]            : Response to FE
```

**Agent Flow Diagram (chi tiết nodes, edges, conditions, loops):**

```mermaid
flowchart TD
    START([START]) --> IR[Intent Router]

    IR -->|red_flag| EH[Emergency Handler]
    IR -->|diagnosis| RH[Refuse Handler]
    IR -->|education| CR[Coref Resolution]

    EH --> E1([END])
    RH --> E2([END])

    CR --> QR[Query Rewrite]
    QR --> HR[Hybrid Retrieval]
    HR --> RR[Reranker]
    RR --> CE{CRAG Evaluator}

    CE -->|strips > 0| CRC[CRAG Recompose]
    CE -->|strips = 0| DR[Doctor Referral]
    DR --> E3([END])

    CRC --> LG[LLM Generate]
    LG --> SV{Self-RAG Verifier}

    SV -->|fully| MC[Memory Checkpoint]
    SV -->|partially| PW[Partial Rewrite]
    SV -->|no support| SD[Safety Disclaimer]

    PW -->|retry < 2| HR
    PW -->|retry >= 2| MC
    SD --> MC
    MC --> E4([END])
```

### 4. Database

- **Type:** PostgreSQL 15
- **Purpose:** Lưu trữ bền vững lịch sử hội thoại, thông tin người dùng và hồ sơ bệnh nhân
- **Tables:**
  - `users` — thông tin tài khoản, JWT metadata
  - `patient_profiles` — hồ sơ bệnh nhân (tuổi, bệnh nền, thuốc đang dùng)
  - `conversations` — danh sách phiên hội thoại theo `patient_id`
  - `messages` — từng cặp Q&A với citations, support_level, timestamp
- **Migrations:** Alembic

### 5. Vector Store

- **Type:** Qdrant
- **Embeddings:** `text-embedding-3-small` (OpenAI) hoặc `bge-m3` (local)
- **Purpose:** Lưu trữ và tìm kiếm ngữ nghĩa tài liệu y tế (RAG)
- **Collections:**
  - `medical_docs` — tài liệu y tế đã chunk, gắn metadata `{disease_type, source, date}`
- **Retrieval Strategy:** Hybrid BM25 + Dense, filter theo `disease_type`, rerank bằng cross-encoder

## Data Flow

### DFD Level 0 — Context Diagram

```mermaid
flowchart LR
    PATIENT["Patient\n(User)"]
    DOCTOR["Doctor\n(Referral)"]
    LLM_EXT["LLM Provider\n(Groq / OpenAI)"]
    PUBMED_EXT["PubMed\n(Medical Source)"]

    SYSTEM(("Medical AI\nAgent System"))

    PATIENT -->|"Medical query\n+ patient profile"| SYSTEM
    SYSTEM -->|"Medical response\n+ citations"| PATIENT
    SYSTEM -->|"Referral notice"| DOCTOR
    SYSTEM -->|"Prompt + context"| LLM_EXT
    LLM_EXT -->|"Generated answer"| SYSTEM
    SYSTEM -->|"Fallback search query"| PUBMED_EXT
    PUBMED_EXT -->|"Research articles"| SYSTEM
```

### DFD Level 1 — Main Processes

```mermaid
flowchart TD
    PATIENT["Patient"]
    LLM_EXT["LLM Provider"]
    PUBMED_EXT["PubMed API"]
    DOCTOR["Doctor"]

    D1[/"D1: Patient Records\n(PostgreSQL)"/]
    D2[/"D2: Medical Knowledge Base\n(Vector DB — Qdrant)"/]
    D3[/"D3: Session Cache\n(Redis)"/]

    P1(("1.0\nAuthenticate\n& Cache Check"))
    P2(("2.0\nClassify Intent\n& Preprocess"))
    P3(("3.0\nRetrieve\nKnowledge"))
    P4(("4.0\nGenerate\nResponse"))
    P5(("5.0\nVerify &\nStore"))

    PATIENT -->|"Medical query\n+ patient_id"| P1

    P1 -->|"Cache hit: cached response"| PATIENT
    P1 <-->|"Read / Write session"| D3
    P1 <-->|"Load chat history"| D1
    P1 -->|"Validated query\n+ AgentState"| P2

    P2 -->|"Classify prompt"| LLM_EXT
    LLM_EXT -->|"Intent label"| P2
    P2 -->|"Safety alert"| DOCTOR
    P2 -->|"Resolved + rewritten query"| P3

    P3 <-->|"Vector + BM25 search"| D2
    P3 -->|"Fallback search query"| PUBMED_EXT
    PUBMED_EXT -->|"Research results"| P3
    P3 -->|"Relevant strips\n+ context"| P4

    P4 -->|"CoT prompt + context"| LLM_EXT
    LLM_EXT -->|"Draft answer + claims"| P4
    P4 -->|"Draft answer\n+ citations"| P5

    P5 -->|"Store Q&A + citations"| D1
    P5 -->|"Update session"| D3
    P5 -->|"Verified response\n+ citations"| PATIENT
```

**Tóm tắt luồng dữ liệu theo bước:**

1. Patient gửi `{query, patient_id}` → API Gateway validate JWT
2. Semantic Cache kiểm tra Redis với key = `Vector(query) + hash(patient_profile)`. Chỉ HIT nếu query là `general_education` và profile khớp — trả về ngay (`< 100ms`). Query `personalized` luôn bypass.
3. Agent load `chat_history` từ PostgreSQL + session từ Redis vào `AgentState`
4. Intent Router phân loại intent bằng LLM → định tuyến vào đúng pipeline *(FE nhận `step` event: "Đang phân tích câu hỏi...")*
5. Preprocessing: Coref Resolution → Query Rewrite ghép hồ sơ bệnh nhân *(FE nhận `step` event: "Đang chuẩn bị ngữ cảnh...")*
6. Hybrid Retrieval: BM25 + Dense trên Qdrant → Reranker → CRAG Evaluate *(FE nhận `step` event: "Đang tìm kiếm tài liệu liên quan...")*
7. Nếu `strips = 0` → Doctor Referral response, kết thúc
8. LLM Generate CoT + JSON `{answer, claims[cited_doc_id]}` *(FE nhận `step` event: "Đang tổng hợp câu trả lời...")*
9. Self-RAG Verifier kiểm tra toàn bộ response — retry tối đa 2 lần nếu `partially` *(FE nhận `step` event: "Đang kiểm tra độ tin cậy...")*
10. Memory Checkpoint lưu vào PostgreSQL + Redis. Chat Handler phát **`token` events** (text đã verified từng từ) + **`done` event** (citations, disclaimer) về FE

### Agent Observation Stream — Đặc tả SSE Event

Chat Handler phát 3 loại event trong cùng một SSE connection:

| Event type | Thời điểm phát | Payload | Hiển thị trên FE |
| :--------- | :------------- | :------ | :---------------- |
| `step` | Sau mỗi LangGraph node hoàn thành | `{node, message, metadata}` | Dòng trạng thái xử lý (spinner + text) |
| `token` | Sau khi `selfrag_verifier` pass — text đã verified | `{text}` | Từng từ hiện dần trong chat bubble |
| `done` | Kết thúc pipeline | `{citations, support_level, disclaimer}` | Citations + disclaimer y tế |

**Ví dụ luồng event thực tế:**
```
event: step
data: {"node": "intent_router", "message": "Đang phân tích câu hỏi...", "icon": "🔍"}

event: step
data: {"node": "hybrid_retrieval", "message": "Tìm thấy 8 tài liệu liên quan", "count": 8, "icon": "📚"}

event: step
data: {"node": "selfrag_verifier", "message": "Kiểm tra độ tin cậy: fully supported", "icon": "✅"}

event: token
data: {"text": "Bệnh "}

event: token
data: {"text": "tiểu đường "}

event: done
data: {"citations": [{"title": "Hướng dẫn ĐTĐ - Bộ Y tế 2020", "url": "..."}], "disclaimer": "Thông tin mang tính giáo dục..."}
```

> **Lưu ý thiết kế:** `token` events chỉ được phát sau khi `selfrag_verifier` hoàn thành và response đã được xác thực toàn bộ. Không có token nào của câu trả lời chưa kiểm chứng xuất hiện trên FE. `step` events phát realtime trong suốt pipeline để người dùng thấy Agent đang hoạt động thay vì màn hình trắng.

## Deployment Architecture

```mermaid
graph TB
    subgraph EXT ["External"]
        CICD["GitHub Actions CI/CD"]
        LLM["Groq / OpenAI API"]
        PUBMED["PubMed API"]
    end

    INTERNET(["Internet"])

    subgraph DOCKER ["Docker Compose"]

        subgraph APP ["App Container"]
            AGENT["LangGraph Agent"]
            API["FastAPI Server"]
            AGENT --> API
        end

        subgraph VECTOR ["Vector Container"]
            QDRANT[("Qdrant")]
        end

        subgraph CACHE ["Cache Container"]
            REDIS[("Redis")]
        end

        subgraph DB ["DB Container"]
            PG[("PostgreSQL")]
        end

    end

    %% External connections
    CICD -->|"Deploy"| APP
    AGENT -->|"LLM Inference"| LLM
    AGENT -->|"Fallback Search"| PUBMED

    %% Internet → App
    INTERNET --> API

    %% App → internal containers
    API --> QDRANT
    API --> REDIS
    API --> PG
```

| Container  | Image           | Port   | Vai trò                   |
| :--------- | :-------------- | :----- | :------------------------ |
| `app`      | `python:3.11`   | `8000` | FastAPI + LangGraph Agent |
| `qdrant`   | `qdrant/qdrant` | `6333` | Vector Database           |
| `redis`    | `redis:alpine`  | `6379` | Session · Semantic Cache  |
| `postgres` | `postgres:15`   | `5432` | Chat History · User Data  |

## Security

- API keys stored in `.env` (never commit to git)
- Input validation via Pydantic schemas trên mọi endpoint
- Rate limiting per `patient_id` trên API Gateway
- CORS configured cho frontend domain
- JWT Token authentication — mọi request phải có valid token
- **FR3.2** — Emergency Detection: phát hiện dấu hiệu nguy hiểm, cảnh báo tức thời, không lưu PII vào log
- **FR3.4** — Diagnosis Refusal: từ chối 100% yêu cầu chẩn đoán hoặc kê toa thuốc
- **FR#4** — Safety Disclaimer: gắn cảnh báo y tế khi Self-RAG phát hiện `no_support`
- PII Protection: thông tin nhận dạng cá nhân không được lưu trong bất kỳ log hệ thống nào

## Design Decisions

| Decision      | Choice                            | Reason                                                            |
| :------------ | :-------------------------------- | :---------------------------------------------------------------- |
| Framework     | FastAPI                           | Async, auto-docs, type-safe, hỗ trợ SSE native                    |
| Agent         | LangGraph                         | State machine linh hoạt, dễ thêm node mới, built-in checkpointing |
| Agent Pattern | Router + RAG                      | Phù hợp bài toán hỏi đáp y tế nhiều intent                        |
| Retrieval     | Hybrid BM25 + Dense               | Tăng Recall cho cả tên thuốc và ngữ nghĩa                         |
| Reranker      | Cross-encoder                     | Độ chính xác cao hơn bi-encoder trong domain y tế                 |
| RAG nâng cao  | CRAG + Self-RAG                   | Kiểm soát hallucination — bắt buộc trong lĩnh vực y tế            |
| Fallback      | Doctor Referral                   | An toàn hơn Web Search — không tự tổng hợp nguồn ngoài            |
| Cache         | Semantic Cache · Composite Key    | Cache key = `Vector(query) + hash(patient_profile)`. Chỉ cache query `general_education`. Query `personalized` luôn bypass để tránh trả sai kết quả cho bệnh nhân khác nhau |
| Memory        | Redis (short) + PostgreSQL (long) | Redis cho session nhanh, Postgres cho lịch sử bền vững            |
| Vector DB     | Qdrant                            | Hỗ trợ metadata filtering tốt (lọc theo `disease_type`)           |
| LLM           | Groq / OpenAI (hoán đổi)          | Groq cho tốc độ, OpenAI cho chất lượng — linh hoạt thay thế       |
| Streaming     | Agent Observation Stream (SSE)    | Phát `step` events realtime qua mọi node + `token` events chỉ sau verify + `done` event với citations — người dùng thấy Agent đang làm gì thay vì màn hình trắng |
