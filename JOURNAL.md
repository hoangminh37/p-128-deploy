# Weekly Journal — Team P-128

> Ghi lại mỗi tuần: học được gì, khó khăn gì, quyết định gì, kế hoạch tiếp.

---

## Week 1: 2026-07-24 - 2026-07-30

### Mục tiêu tuần này
- [x] Khởi tạo repository từ template chuẩn của chương trình.
- [x] Chốt chủ đề dự án Gate 1: Agent Giáo dục Sức khỏe cá nhân hóa.
- [x] Thiết lập hệ thống theo dõi AI Log.

### Đã hoàn thành
- Khởi tạo xong `src/`, `tests/`, `eval/` và các cấu hình cơ bản.
- Quyết định tập trung vào bệnh nhân đái tháo đường và tăng huyết áp.
- Tích hợp thành công Hook ghi log tự động cho mọi prompt.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Github Actions CI bị kẹt trạng thái Queued kéo dài. | Cấu hình lại `runs-on` và tìm hiểu cơ chế hoạt động của Self-hosted runner vs GitHub-hosted. | Hiểu rõ quy trình CI/CD. |

### Bài học
- Hạ tầng log (AI Log) cực kỳ quan trọng để debug prompt sau này, việc thiết lập từ tuần 1 giúp team tiết kiệm hàng chục giờ kiểm tra lỗi.

### Kế hoạch tuần sau
- [ ] Thiết kế UI Flow và viết Project Brief.

---

## Week 2: 2026-07-31 - 2026-08-06

### Mục tiêu tuần này
- [x] Hoàn thành các tài liệu đặc tả nghiệp vụ (Brief, PRD).
- [x] Vẽ Wireframe UI/UX cho người dùng (Bệnh nhân & Biên tập viên).

### Đã hoàn thành
- Xuất bản thành công 3 bản vẽ wireframes.
- Xác định 7 rủi ro y khoa và 3 giới hạn bất biến (Không chẩn đoán, không kê đơn).

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Ranh giới giữa tư vấn y khoa và giáo dục sức khỏe rất mong manh. | Thêm các trạng thái `red_flag` và `refused` vào thiết kế LangGraph (Agent State) ngay từ khâu thiết kế API Contract. | Ràng buộc chặt chẽ đầu ra của AI. |

### Bài học
- Việc làm rõ ràng PRD từ đầu giúp việc định nghĩa API Contract và các luồng xử lý ngoại lệ (Exception Handling) cực kỳ mạch lạc.

### Kế hoạch tuần sau
- [ ] Chuẩn bị bộ Test Cases và hệ thống Đánh giá (Evaluation).

---

## Week 3: 2026-08-07 - 2026-08-13

### Mục tiêu tuần này
- [x] Hoàn thiện hạ tầng đánh giá AI (Evaluation Framework).
- [x] Tái cấu trúc CI/CD Pipeline.
- [x] Sửa dứt điểm các lỗi Typing (Nợ kỹ thuật).

### Đã hoàn thành
- Viết kịch bản đánh giá Custom LLM Judge bằng `gpt-4o-mini`.
- Bổ sung các Test cases đặc thù: Người cao tuổi, Người chăm sóc (Caregiver).
- Cấu hình Branch Protection, tách riêng backend/frontend CI jobs.
- Fix toàn bộ 5 lỗi Mypy typing.

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| RAGAS chỉ chấm được thông tin (Faithfulness) chứ không kiểm tra được format riêng biệt (Disclaimer, Citations, Tone). | Tự phát triển `run_custom_eval.py` để làm LLM-as-a-Judge đánh giá sát sườn theo PRD. | Bộ Eval hoàn chỉnh, bao quát 100% nghiệp vụ. |
| Người dùng push code hỏng làm sập nhánh `main`. | Áp dụng Pull Request Workflow và bật Branch Protection Rule trên Github. | 100% code vào main phải qua kiểm duyệt của CI. |

### Bài học
- Tự động hóa đánh giá (LLM-as-a-Judge) là xu hướng tất yếu.
- Phải dùng Type Hint (Mypy) nghiêm ngặt từ đầu để tránh lỗi ngớ ngẩn khi tích hợp LangChain/LangGraph.

### Kế hoạch tuần sau
- [ ] Gộp và hoàn thiện tài liệu `ARCHITECTURE.md`.
- [ ] Chốt `api-contract.md` với Frontend.
- [ ] Bắt đầu viết node LangGraph đầu tiên.
