# Architecture Diagram — Medical AI Agent (P-128)

> Tài liệu này là bản tóm tắt sơ đồ trực quan cho `ARCHITECTURE.md`.
> Nguồn chân lý là `ARCHITECTURE.md` — khi có mâu thuẫn, `ARCHITECTURE.md` được ưu tiên.

---

## 1. Kiến trúc 3 Tầng (System Overview)

```mermaid
graph TB
    subgraph T1 ["Tier 1 · Client"]
        WEB["🌐 Web Browser"]
        MOBILE["📱 Mobile App"]
    end

    subgraph T2 ["Tier 2 · FastAPI Backend"]
        GW["API Gateway\nJWT · Rate Limit"]
        CACHE["Semantic Cache\nComposite Key · Redis"]
        CHAT["Chat Handler\nAgent Observation Stream"]
        GW --> CACHE
        GW --> CHAT
    end

    subgraph T3 ["Tier 3 · Intelligence"]
        subgraph AGENT ["LangGraph Agent"]
            IR["Intent Router"]
            SAFETY["Safety Layer\nEmergency · Refuse"]
            RAG["RAG Pipeline\nRetrieve → CRAG → Generate → Verify"]
            MEM["Memory Checkpoint\nRedis · PostgreSQL"]

            IR --> SAFETY
            IR --> RAG
            RAG --> MEM
        end

        subgraph DATA ["Data Layer"]
            VDB[("Qdrant\nVector DB")]
            PG[("PostgreSQL\nHistory")]
            RD[("Redis\nSession · Cache")]
        end

        RAG <--> VDB
        MEM <--> PG
        MEM <--> RD
    end

    subgraph EXT ["External Services"]
        LLM["Groq / OpenAI\nLLM API"]
        PUBMED["PubMed API\nFallback"]
    end

    WEB & MOBILE -->|"HTTPS"| GW
    CACHE <-->|"R/W · Composite Key"| RD
    CHAT -->|"invoke"| IR
    MEM -->|"Observation Events\n(step · token · done)"| CHAT
    IR <-->|"LLM Inference"| LLM
    SAFETY -->|"Fallback Search"| PUBMED
```

| Tầng | Trách nhiệm | Thành phần |
| :--- | :--- | :--- |
| **Tier 1** · Client | UI, nhận Agent Observation Stream | Web Browser · Mobile App |
| **Tier 2** · Backend | Auth, cache có ngữ cảnh, điều phối | API Gateway · Semantic Cache · Chat Handler |
| **Tier 3** · Intelligence | Xử lý AI + lưu trữ dữ liệu | LangGraph Agent · Qdrant · PostgreSQL · Redis |

---

## 2. LangGraph Agent Flow (Chi tiết)

```mermaid
flowchart TD
    START([START]) --> IR[Intent Router\nLLM nhỏ / rule-based]

    IR -->|"red_flag"| EH["🚨 Emergency Handler\nCảnh báo · không lưu PII"]
    IR -->|"diagnosis / prescription"| RH["🚫 Refuse Handler\nTừ chối 100%"]
    IR -->|"education / general"| CR[Coref Resolution\nGiải quyết đại từ]

    EH --> E1([END · Direct alert])
    RH --> E2([END · Blocked])

    CR --> QR["Query Rewrite\nGhép hồ sơ bệnh nhân"]
    QR --> HR["Hybrid Retrieval\nBM25 + Dense · Qdrant"]
    HR --> RR["Reranker\nCross-encoder · top-k"]
    RR --> CE{"CRAG Evaluator\nĐánh giá từng strip"}

    CE -->|"strips > 0"| CRC["CRAG Recompose\nChống Lost-in-the-Middle"]
    CE -->|"strips = 0"| DR["Doctor Referral\nThiếu tài liệu"]
    DR --> E3([END · Referral response])

    CRC --> LG["LLM Generate\nCoT + JSON {answer, claims}"]
    LG --> SV{"Self-RAG Verifier\nfully / partially / no_support"}

    SV -->|"fully"| MC["Memory Checkpoint\nLưu Q&A · Redis + PostgreSQL"]
    SV -->|"partially"| PW["Partial Rewrite\nĐánh dấu câu thiếu nguồn"]
    SV -->|"no_support"| SD["Safety Disclaimer\nGắn cảnh báo y tế FR#4"]

    PW -->|"retry < 2"| HR
    PW -->|"retry ≥ 2"| MC
    SD --> MC
    MC --> E4([END · Verified response])
```

---

## 3. Semantic Cache — Cơ chế Composite Key

```mermaid
flowchart LR
    Q["Query + patient_id"] --> EMB["Embedding Model\nVector E_q"]
    EMB --> TYPE{"Query type?"}

    TYPE -->|"personalized\n(liều thuốc, bệnh nền cụ thể)"| BYPASS["Bypass Cache\n→ LangGraph Agent"]
    TYPE -->|"general_education\n(kiến thức y tế đại chúng)"| SEARCH

    SEARCH["Redis Vector Search\nKey = Vector(query) + hash(patient_profile)"] --> SIM{"Cosine Similarity\n≥ 0.90?"}
    SIM -->|"HIT"| HIT["Cache HIT\n< 100ms · Trả về ngay"]
    SIM -->|"MISS"| AGENT["LangGraph Agent\nRAG Pipeline"]
    AGENT --> SAVE["Lưu Cache\n(Vector, Response) + TTL"]
    SAVE --> RESP([Response])
    HIT --> RESP
    BYPASS --> RESP
```

> **Quy tắc an toàn y tế:** Query `personalized` (liên quan liều dùng, chỉ số cá nhân, tương tác thuốc) **luôn bypass cache** — tránh trả về kết quả của bệnh nhân khác với hồ sơ khác nhau.

---

## 4. Agent Observation Stream — Luồng SSE

```mermaid
sequenceDiagram
    participant FE as Frontend (React)
    participant BE as Chat Handler (FastAPI)
    participant AG as LangGraph Agent

    FE->>BE: POST /api/v1/chat {query, patient_id}
    BE->>AG: invoke(AgentState)

    AG-->>BE: node "intent_router" done
    BE-->>FE: event: step {"message": "Đang phân tích câu hỏi..."}

    AG-->>BE: node "hybrid_retrieval" done (8 docs)
    BE-->>FE: event: step {"message": "Tìm thấy 8 tài liệu liên quan"}

    AG-->>BE: node "llm_generate" done
    BE-->>FE: event: step {"message": "Đang tổng hợp câu trả lời..."}

    AG-->>BE: node "selfrag_verifier" done (fully)
    BE-->>FE: event: step {"message": "Kiểm tra độ tin cậy: ✅ fully supported"}

    AG-->>BE: memory_checkpoint done · verified response ready
    BE-->>FE: event: token {"text": "Người bệnh "}
    BE-->>FE: event: token {"text": "tăng huyết áp "}
    BE-->>FE: event: token {"text": "nên..."}
    BE-->>FE: event: done {citations, disclaimer, support_level}
```

> **Lưu ý thiết kế:** `token` events chỉ được phát **sau khi `selfrag_verifier` hoàn thành**. Không có token nào của câu trả lời chưa kiểm chứng xuất hiện trên FE.

---

## 5. Deployment Stack

```mermaid
graph TB
    subgraph CLOUD ["Production / Cloud"]
        CICD["GitHub Actions CI/CD"]
        RENDER["Render / VPS"]
    end

    subgraph DOCKER ["Docker Compose"]
        APP["App Container\nFastAPI + LangGraph\nPort 8000"]
        FE_BUILD["Frontend Build\nVite static · Port 5180 (dev)"]
        QDRANT[("Qdrant\nVector DB · Port 6333")]
        REDIS[("Redis\nCache · Port 6379")]
        PG[("PostgreSQL\nDB · Port 5432")]
    end

    subgraph EXT ["External APIs"]
        LLM["Groq / OpenAI"]
        PUBMED["PubMed API"]
    end

    CICD -->|"Deploy"| RENDER
    RENDER --> APP
    APP --> QDRANT
    APP --> REDIS
    APP --> PG
    APP -->|"LLM Inference"| LLM
    APP -->|"Fallback"| PUBMED
```

| Container | Image | Port | Vai trò |
| :--- | :--- | :--- | :--- |
| `app` | `python:3.11` | `8000` | FastAPI + LangGraph Agent |
| `qdrant` | `qdrant/qdrant` | `6333` | Vector Database |
| `redis` | `redis:alpine` | `6379` | Session · Semantic Cache |
| `postgres` | `postgres:15` | `5432` | Chat History · User Data |

---

## 6. Tech Stack Summary

| Layer | Technology | Ghi chú |
| :--- | :--- | :--- |
| **Frontend** | Vite 8 + React 19 + TypeScript | SPA · Port 5180 dev |
| **Routing** | react-router-dom v7 | Client-side routing |
| **Server State** | @tanstack/react-query v5 | Fetch + cache + SSE |
| **Form** | react-hook-form + Zod | Type-safe validation |
| **Styling** | Tailwind CSS v4 | Utility-first |
| **API Mock** | msw | FE độc lập với backend |
| **Backend** | FastAPI + Uvicorn | Async · SSE native |
| **Agent** | LangGraph | State machine · 15 nodes |
| **LLM** | Groq (tốc độ) / OpenAI (chất lượng) | Hoán đổi linh hoạt |
| **Vector DB** | Qdrant | Hybrid BM25 + Dense |
| **Cache** | Redis · Semantic Cache | Composite key |
| **DB** | PostgreSQL 15 | Chat history |
| **DevOps** | Docker Compose + GitHub Actions | CI/CD sẵn |
| **Eval** | RAGAS + pytest | Faithfulness · Safety |
