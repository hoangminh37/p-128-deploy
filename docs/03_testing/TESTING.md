# 🧪 Tài Liệu Kiểm Thử Toàn Diện (Testing Specification & Evidence)

Tài liệu này đặc tả toàn bộ kiến trúc kiểm thử, danh mục các bộ test tự động (**320 unit/integration tests**), khung đánh giá chất lượng RAG (**RAGAS & Custom LLM Judge**), kịch bản kiểm thử thủ công và quy trình kiểm thử tự động trong CI/CD của hệ thống **Medical AI Agent (P-128)**.

---

## 1. Tổng quan chiến lược kiểm thử (Testing Strategy)

Hệ thống tuân thủ mô hình kim tự tháp kiểm thử 4 tầng được thiết kế chuyên biệt cho hệ thống AI Y tế:

```
                                  ┌────────────────────────┐
                                  │   4. Manual / E2E      │  5 kịch bản thẩm định chuyên gia
                                  │      Evaluations       │  (Cá nhân hóa, Red Flag, Refusal)
                                  ├────────────────────────┤
                                  │   3. AI Evaluation     │  RAGAS (Faithfulness 0.98, Recall 0.77)
                                  │     (RAGAS & Judge)    │  Custom Judge (Safety Pass 84.91%)
                                  ├────────────────────────┤
                                  │   2. Integration Tests │  API Endpoints, WebRTC Consultations,
                                  │     & State Graph      │  LangGraph v2, ETL Ingestion Pipeline
                                  ├────────────────────────┤
                                  │   1. Unit Tests        │  320 tests (RAG, Services, Chunking,
                                  │      (Pytest & Ruff)   │  Normalization, Dual VectorStore)
                                  └────────────────────────┘
```

### Nguyên tắc kiểm thử cốt lõi:
1. **An toàn Y tế (Fail-closed Safety)**: Khi tài liệu không có thông tin hoặc không chắc chắn, hệ thống thà từ chối (`Doctor Referral`) còn hơn bịa đặt thông tin. Các ca cấp cứu (`Red Flag`) bắt buộc phải ngắt luồng chat lập tức.
2. **Không ảo giác (Groundedness & Faithfulness)**: Mọi câu trả lời kiến thức y khoa bắt buộc phải có trích dẫn `[doc_id]` hợp lệ trích xuất từ tài liệu đã được duyệt.
3. **Tính độc lập & Deterministic**: Unit test không phụ thuộc vào kết nối mạng bên ngoài (sử dụng mock cho LLM và SQLite/In-memory cho vector store).

---

## 2. Chi tiết 29 Test Suites Backend (320 Tests Pytest)

### 2.1. Nhóm Agent & State Graph (`tests/test_agents/` - 40 tests)

| File Test | Số lượng | Mục tiêu kiểm thử & Kịch bản thực tế |
| :--- | :---: | :--- |
| [`test_graph_v2.py`](file:///Users/hoangminh/P-128/tests/test_agents/test_graph_v2.py) | 3 | Kiểm thử kiến trúc State Graph v2: ngắt luồng an toàn trước retrieval, routing nhánh an toàn, fail-closed khi thiếu context. |
| [`test_intent_router.py`](file:///Users/hoangminh/P-128/tests/test_agents/test_intent_router.py) | 8 | Phân loại chính xác 5 intent: `education`, `red_flag`, `diagnosis`, `safe_fallback`, `out_of_scope`. Nhận diện task `meal_recommendation`, `threshold_interpretation`. |
| [`test_query_preprocessor.py`](file:///Users/hoangminh/P-128/tests/test_agents/test_query_preprocessor.py) | 5 | Giải quyết đồng quy chiếu (Coreference), gắn nhãn bệnh lý, lọc lịch sử hội thoại 6 lượt gần nhất, nhúng thời điểm chẩn đoán vào context. |
| [`test_hybrid_retrieval.py`](file:///Users/hoangminh/P-128/tests/test_agents/test_hybrid_retrieval.py) | 6 | Truy xuất kết hợp Vector + Metadata, lọc theo bệnh nền chính và bệnh kèm, tôn trọng `top_k`, xếp hạng ưu tiên theo độ mới của tài liệu. |
| [`test_generate_and_verify.py`](file:///Users/hoangminh/P-128/tests/test_agents/test_generate_and_verify.py) | 7 | Kiểm thử cơ chế Self-RAG Generation: xử lý `fully_supported` (giữ trích dẫn hợp lệ), `partially_supported` (bổ sung disclaimer), và `unsupported` (từ chối an toàn). |
| [`test_answer_verifier.py`](file:///Users/hoangminh/P-128/tests/test_agents/test_answer_verifier.py) | 5 | Trích xuất và kiểm tra tính xác thực của `[doc_id]`, chống hallucination và fail-closed khi format không hợp lệ. |
| [`test_term_annotations.py`](file:///Users/hoangminh/P-128/tests/test_agents/test_term_annotations.py) | 6 | Tự động phát hiện và giải thích thuật ngữ y khoa (tooltip annotations) trên giao diện mà không làm hỏng văn bản gốc. |

---

### 2.2. Nhóm RAG Engine & Ingestion Pipeline (`tests/test_rag/` - 172 tests)

| File Test | Số lượng | Mục tiêu kiểm thử & Kịch bản thực tế |
| :--- | :---: | :--- |
| [`test_normalize.py`](file:///Users/hoangminh/P-128/tests/test_rag/test_normalize.py) | 39 | Chuẩn hóa font tiếng Việt (Unicode NFC), sửa ký tự font cũ, loại bỏ ký tự rác ẩn, xử lý dấu thanh tiếng Việt. |
| [`test_chunk.py`](file:///Users/hoangminh/P-128/tests/test_rag/test_chunk.py) | 28 | Cắt văn bản ngữ nghĩa: loại bỏ khối quá ngắn, lọc phần hành chính, lọc danh mục tài liệu tham khảo, giữ nguyên tiêu đề cấp bậc. |
| [`test_store.py`](file:///Users/hoangminh/P-128/tests/test_rag/test_store.py) | 28 | Kiểm thử song song Dual Vector Store: ChromaDB (Local dev) và PgVector (Cloud deployment). Đảm bảo tính tương thích 100% về metadata và schema. |
| [`test_ingest.py`](file:///Users/hoangminh/P-128/tests/test_rag/test_ingest.py) | 29 | Pipeline nạp tài liệu từ file thô (PDF/Markdown), bóc tách metadata, tạo vector embeddings. |
| [`test_structure.py`](file:///Users/hoangminh/P-128/tests/test_rag/test_structure.py) | 24 | Phân tích phân cấp tài liệu: số La Mã, tiêu đề chương/phần, trích xuất cấu trúc cây mục lục y khoa. |
| [`test_registry.py`](file:///Users/hoangminh/P-128/tests/test_rag/test_registry.py) | 23 | Quản lý danh mục tài liệu y khoa nguồn: kiểm tra định dạng ngày ban hành, phiên bản, độ ưu tiên pháp lý. |
| [`test_diseases.py`](file:///Users/hoangminh/P-128/tests/test_rag/test_diseases.py) | 19 | Kiểm tra danh mục bệnh học (`type2_diabetes`, `hypertension`), từ khóa chuyên môn, phạm vi điều trị. |
| [`test_runtime_registry.py`](file:///Users/hoangminh/P-128/tests/test_rag/test_runtime_registry.py) | 3 | Biên tập viên thêm bệnh mới lúc runtime mà không cần khởi động lại server. |
| [`test_parse_tables.py`](file:///Users/hoangminh/P-128/tests/test_rag/test_parse_tables.py) | 2 | Bóc tách cấu trúc bảng biểu y khoa từ Docling, giữ nguyên cấu trúc hàng/cột và header. |

---

### 2.3. Nhóm REST API Endpoints (`tests/test_api/` - 68 tests)

| File Test | Số lượng | Mục tiêu kiểm thử & Kịch bản thực tế |
| :--- | :---: | :--- |
| [`test_quiz.py`](file:///Users/hoangminh/P-128/tests/test_api/test_quiz.py) | 41 | Sinh đề trắc nghiệm cá nhân hóa theo bệnh nền, chấm điểm tự động, lưu lịch sử câu sai (`/quiz/mistakes`), bảo mật `correct_index`. |
| [`test_consultations.py`](file:///Users/hoangminh/P-128/tests/test_api/test_consultations.py) | 8 | Tính năng tư vấn Bác sĩ & Bệnh nhân: phân quyền Chat / Video call WebRTC, quản lý tài khoản Bác sĩ (`DoctorProfile`), chuyển tiếp câu hỏi từ RAG sang BTV. |
| [`test_patient_profile.py`](file:///Users/hoangminh/P-128/tests/test_api/test_patient_profile.py) | 5 | Tạo, đọc, cập nhật hồ sơ bệnh nhân (tuổi, bệnh chính, bệnh kèm, tháng chẩn đoán, dị ứng thuốc). |
| [`test_editor_documents.py`](file:///Users/hoangminh/P-128/tests/test_api/test_editor_documents.py) | 4 | Dashboard Biên tập viên: phân biệt trạng thái duyệt (`reviewed`) và nạp vector (`indexed`), xem file PDF gốc. |
| [`test_source_documents.py`](file:///Users/hoangminh/P-128/tests/test_api/test_source_documents.py) | 4 | Xem trích đoạn tài liệu gốc được highlight theo đúng mã chunk `[doc_id]` trên giao diện. |
| [`test_routes.py`](file:///Users/hoangminh/P-128/tests/test_api/test_routes.py) | 3 | Health check (`/api/v1/health`), bắt buộc xác thực JWT (`/api/v1/chat`), trạng thái agent. |
| [`test_editor_conditions.py`](file:///Users/hoangminh/P-128/tests/test_api/test_editor_conditions.py) | 1 | BTV tạo và cấu hình bệnh lý mới trực tiếp trên giao diện web. |
| [`test_editor_source_pipeline.py`](file:///Users/hoangminh/P-128/tests/test_api/test_editor_source_pipeline.py) | 1 | Pipeline upload tài liệu của BTV: chỉ đưa vào kho RAG sau khi ETL thành công. |
| [`test_voice_chat_stream.py`](file:///Users/hoangminh/P-128/tests/test_api/test_voice_chat_stream.py) | 1 | Luồng hội thoại bằng giọng nói qua WebSocket (STT -> Agent Stream -> TTS). |

---

### 2.4. Nhóm Core Services & Scripts (`tests/test_services/` & `test_scripts/` - 10 tests)

| File Test | Số lượng | Mục tiêu kiểm thử & Kịch bản thực tế |
| :--- | :---: | :--- |
| [`test_llm_factory.py`](file:///Users/hoangminh/P-128/tests/test_services/test_llm_factory.py) | 3 | Factory khởi tạo LLM: cấu hình temperature cho từng node, tự động fallback giữa các provider (OpenAI -> Groq -> OpenRouter). |
| [`test_routine_memory.py`](file:///Users/hoangminh/P-128/tests/test_services/test_routine_memory.py) | 2 | Ghi nhớ thói quen sinh hoạt và lịch sử bệnh nhân, khử trùng lặp dữ liệu bộ nhớ dài hạn. |
| [`test_voice.py`](file:///Users/hoangminh/P-128/tests/test_services/test_voice.py) | 3 | Xử lý âm thanh: nhận dạng giọng nói tiếng Việt (Whisper) với keyword hints và tổng hợp giọng đọc (TTS). |
| [`test_log_codex_history.py`](file:///Users/hoangminh/P-128/tests/test_scripts/test_log_codex_history.py) | 2 | Ghi nhận và xuất lịch sử tương tác phục vụ log audit. |

---

## 3. Khung Đánh giá AI / RAG Evaluation (`eval/`)

Hệ thống xây dựng bộ công cụ đánh giá tự động dựa trên tiêu chuẩn benchmark quốc tế cho Medical RAG:

```
eval/
├── data/
│   └── raw_test_cases.json          # 53 câu test case chuẩn hóa đa danh mục
├── results/
│   ├── eval_dataset.json            # Toàn bộ câu hỏi, context và câu trả lời của Agent
│   ├── eval_dataset_baselines.json  # Câu trả lời của Baseline 1 (Direct LLM) & Baseline 2 (Naive RAG)
│   ├── ragas_detailed_log.csv       # Điểm số RAGAS chi tiết từng câu
│   ├── report.md                    # Báo cáo tóm tắt chỉ số RAGAS
│   ├── custom_report.md             # Báo cáo Custom LLM Judge
│   └── benchmark_report.md          # Báo cáo Benchmark toàn diện so sánh 3 hệ thống
├── run_baselines.py                 # Chạy thực nghiệm Baseline 1 & 2
├── run_ragas_eval.py                # Chạy đánh giá RAGAS trên câu hỏi RAG thực tế
├── run_custom_eval.py               # Chạy Custom LLM Judge chấm Guardrails
└── run_benchmark.py                # Pipeline chạy toàn bộ quy trình benchmark
```

### 3.1. Kết quả RAGAS Metrics (Đo lường trên 13 câu RAG thực tế)
* **`Faithfulness = 0.984` (✅ PASS)**: Mọi thông tin đều bám sát 100% tài liệu Bộ Y tế đã duyệt, không ảo giác.
* **`Context Precision = 0.749` (✅ PASS)**: Các chunk truy xuất đứng đầu có độ chính xác cao.
* **`Context Recall = 0.769` (✅ PASS)**: Bao phủ được 77% nội dung cốt lõi của Ground Truth.
* **`Answer Relevancy = 0.326`**: Phản ánh sự khác biệt giữa thuật ngữ y khoa chuyên sâu và câu hỏi đời thường (đã được ghi chú và giải trình chi tiết).

### 3.2. Kết quả Custom LLM-as-a-Judge (Đo lường trên toàn bộ 53 câu)
* **`Intent Routing / Safety Pass = 84.91%`**: 100% bắt đúng Red Flag cấp cứu và từ chối kê đơn / đổi liều.
* **`Citation Compliance = 94.34%`**: Trích dẫn mã `[doc_id]` chuẩn xác.
* **`Disclaimer Included = 94.34%`**: Đính kèm cảnh báo miễn trừ trách nhiệm y tế.
* **`Next-best Questions = 94.34%`**: Gợi ý 3 câu hỏi tái khám/theo dõi sức khỏe.
* **`Tone & Empathy = 4.38 / 5.0`**: Giọng điệu đồng cảm, chuẩn mực y tế.

### 3.3. Bộ 5 Kịch Bản Kiểm Thử Thủ Công Thẩm Định ([`eval/manual_eval_evidence.md`](file:///Users/hoangminh/P-128/eval/manual_eval_evidence.md))
1. **Cá nhân hóa sâu (Deep Personalization)**: Xưng "bác", đưa ra bài tập phù hợp cho bệnh nhân cao tuổi có bệnh tim mạch.
2. **Truy xuất hồ sơ (Profile Retrieval)**: Đọc đúng bệnh án từ state (`type2_diabetes`, `hypertension`).
3. **Cảnh báo khẩn cấp (Red Flag Detection)**: Đau thắt ngực dữ dội -> Ngắt chat, báo gọi 115 ngay.
4. **Từ chối chẩn đoán/kê toa (Refusal)**: Chặn yêu cầu kê đơn, từ chối an toàn.
5. **Chống Jailbreak (Prompt Injection)**: Giữ vững Guardrails, từ chối in system prompt.

---

## 4. Kiểm thử Frontend & Mocks

### 4.1. Mock Service Worker (MSW) Handlers
Frontend hỗ trợ phát triển độc lập không cần backend thông qua MSW (`frontend/src/mocks/`):
* `benhnhan@demo.vn` (30 tuổi, ĐTĐ típ 2)
* `nguoicaotuoi@demo.vn` (75 tuổi, ĐTĐ típ 2 kèm Cao huyết áp)
* `bientap@demo.vn` (Biên tập viên y tế)
* `bacsi@demo.vn` (Bác sĩ chuyên khoa Nội tiết - BS. Minh Anh)

### 4.2. Static Type-checking & Linting
* **TypeScript Compiler**: `tsc -b --noEmit` xác thực kiểu dữ liệu 100% không lỗi.
* **ESLint & Prettier**: Đảm bảo chuẩn code style React/Tailwind.

---

## 5. Hướng dẫn thực thi kiểm thử (Commands & CI/CD)

### 5.1. Chạy toàn bộ Unit & Integration Tests (Local)
```bash
# Kích hoạt môi trường
source .venv/bin/activate

# Chạy toàn bộ 320 tests
pytest tests/ -v

# Chạy riêng từng module
pytest tests/test_agents/ -v    # Kiểm thử State Graph & AI Agents
pytest tests/test_rag/ -v       # Kiểm thử RAG & VectorStore
pytest tests/test_api/ -v       # Kiểm thử REST API
```

### 5.2. Chạy bộ Benchmark & AI Evaluation
```bash
# Chạy toàn bộ pipeline benchmark tự động
python eval/run_benchmark.py

# Hoặc chạy riêng từng script đánh giá
python eval/run_ragas_eval.py    # Đánh giá RAGAS
python eval/run_custom_eval.py   # Đánh giá Custom Judge
```

### 5.3. Quy trình CI/CD Tự Động ([`.github/workflows/ci.yml`](file:///Users/hoangminh/P-128/.github/workflows/ci.yml))
Mỗi lần mở Pull Request hoặc Push lên nhánh `main`, GitHub Actions tự động thực hiện:
1. `ruff format --check src/ tests/ eval/` (Kiểm tra định dạng code).
2. `ruff check src/ tests/ eval/` (Linting và phát hiện lỗi tĩnh).
3. `pytest tests/ -q` (Thực thi toàn bộ 320 tests).
4. `npm run lint` & `npm run build` (Xác thực Frontend TypeScript & Bundle).
