# 📚 Danh Mục Tài Liệu Dự Án EduHealth AI (P-128)

Thư mục này chứa toàn bộ tài liệu kỹ thuật, đặc tả chức năng, kiến trúc, kiểm thử và lịch sử phát triển của dự án **EduHealth AI (P-128)**, được chuẩn hóa và gom theo đúng **10 Deliverables bắt buộc của Gate 2 (MVP) & Đánh giá Tốt nghiệp**.

---

## 🧭 Bảng Ánh Xạ 10 Deliverables Bắt Buộc

| STT | Deliverable Yêu Cầu | Vị trí File Trong Repository | Mô tả Nội dung |
| :---: | :--- | :--- | :--- |
| **1** | **Source code** | `src/`, `frontend/`, `tests/`, `eval/` | Toàn bộ mã nguồn hoàn chỉnh của Backend, Frontend, Test suite và AI Eval. |
| **2** | **README.md** | [`README.md`](../README.md) | Tài liệu giới thiệu tổng quan, hướng dẫn cài đặt, chạy nhanh và cấu trúc dự án. |
| **3** | **Sơ đồ kiến trúc (Architecture diagram)** | [`docs/01_architecture/architecture-diagram.md`](01_architecture/architecture-diagram.md)<br>[`docs/01_architecture/ARCHITECTURE.md`](01_architecture/ARCHITECTURE.md) | Sơ đồ kiến trúc hệ thống, luồng xử lý câu hỏi LangGraph v2, vòng đời tài liệu RAG và Telemedicine. |
| **4** | **Tài liệu đặc tả & thiết kế** | [`docs/02_specifications/functional-spec.md`](02_specifications/functional-spec.md)<br>[`docs/02_specifications/api-contract.md`](02_specifications/api-contract.md)<br>[`docs/02_specifications/design-spec.md`](02_specifications/design-spec.md)<br>[`docs/02_specifications/design/eduhealth-ai.html`](02_specifications/design/eduhealth-ai.html) | Bộ tài liệu đặc tả 3 lớp: Yêu cầu chức năng, Hợp đồng API backend-frontend, và Hệ thống thiết kế UI/UX kèm Prototype HTML. |
| **5** | **Tài liệu kiểm thử (Testing documents)** | [`docs/03_testing/TESTING.md`](03_testing/TESTING.md)<br>[`docs/03_testing/test-local.md`](03_testing/test-local.md)<br>[`eval/results/benchmark_report.md`](../eval/results/benchmark_report.md) | Đặc tả 320 unit/integration tests tự động, hướng dẫn test local, báo cáo AI Benchmark (RAGAS / Judge) và Baseline. |
| **6** | **Nhật ký tuần (Weekly logs)** | [`docs/04_weekly_logs/weekly-log.md`](04_weekly_logs/weekly-log.md)<br>[`JOURNAL.md`](../JOURNAL.md) | Nhật ký làm việc từng tuần, phân công nhiệm vụ và đối chiếu commit tương ứng. |
| **7** | **Live URL** | Ghi nhận tại [`README.md`](../README.md) | Đường dẫn truy cập ứng dụng thực tế sau khi deploy. |
| **8** | **Video Demo** | Ghi nhận tại [`README.md`](../README.md) | Đường dẫn video demo giới thiệu và vận hành các tính năng. |
| **9** | **Pitch Deck** | Ghi nhận tại [`README.md`](../README.md) | Bản slide thuyết trình giới thiệu dự án và giá trị cốt lõi. |
| **10**| **AI Log** | Hệ thống Phoenix Log | Dữ liệu log quá trình pair-programming AI được đồng bộ tự động. |

---

## 📂 Cấu Trúc Chi Tiết Thư Mục `docs/`

```text
docs/
├── README.md                           ← [Mục lục này] Chỉ mục điều hướng toàn bộ tài liệu dự án
│
├── 01_architecture/                    ← [Deliverable 3] Kiến trúc Hệ thống
│   ├── ARCHITECTURE.md                 ← Kiến trúc hiện trạng, thành phần kỹ thuật, LangGraph State Graph v2
│   └── architecture-diagram.md         ← Sơ đồ kiến trúc Mermaid (Toàn cảnh, Agent, RAG, Telemedicine)
│
├── 02_specifications/                  ← [Deliverable 4] Đặc tả & Thiết kế
│   ├── functional-spec.md              ← Đặc tả yêu cầu chức năng (Hồ sơ, RAG, Guardrails, Học tập, Bác sĩ, BTV)
│   ├── api-contract.md                 ← Hợp đồng API chuẩn giữa Frontend và Backend (Endpoints & Schemas)
│   ├── design-spec.md                  ← Đặc tả thiết kế UI/UX (Design tokens, Typography, Khung bố cục)
│   └── design/
│       └── eduhealth-ai.html           ← Bản mockup thiết kế HTML Prototype 31 màn hình
│
├── 03_testing/                         ← [Deliverable 5] Kiểm thử & Đánh giá Chất lượng
│   ├── TESTING.md                      ← Master Testing Specification (320 tests, AI Benchmark RAGAS/Judge)
│   └── test-local.md                   ← Hướng dẫn chạy kiểm thử và chạy thử toàn diện trên máy cá nhân
│
├── 04_weekly_logs/                     ← [Deliverable 6] Nhật ký Tuần
│   └── weekly-log.md                   ← Nhật ký tiến độ từng tuần có đối chiếu commit
│
├── gate1/                              ← [Lưu trữ Lịch sử] Hồ sơ Gate 1
│   ├── brief.md                        ← Project Brief: Vấn đề, đối tượng người dùng, tiêu chí thành công
│   ├── prd.md                          ← Product Requirements Document (PRD) giai đoạn Gate 1
│   └── wireframes/                     ← Sơ đồ luồng nghiệp vụ và wireframe ban đầu
│
└── guide/                              ← [Tài liệu Tham khảo] Cẩm nang/giáo trình đi kèm template
```

---

## 🔗 Liên Kết Nhanh Đến Các Báo Cáo Kỹ Thuật

- **Báo cáo AI Benchmark (RAGAS & LLM Judge)**: [`eval/results/benchmark_report.md`](../eval/results/benchmark_report.md)
- **Dataset Đánh giá**: [`eval/data/raw_test_cases.json`](../eval/data/raw_test_cases.json)
- **Log Thực nghiệm RAGAS**: [`eval/results/ragas_detailed_log.csv`](../eval/results/ragas_detailed_log.csv)
