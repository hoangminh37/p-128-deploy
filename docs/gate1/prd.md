# Product Requirement Document (PRD)

**Tên dự án:** Agent Giáo dục Sức khỏe Cá nhân hóa cho Bệnh nhân Mãn tính
**Giai đoạn:** Gate 1
**Ngày lập:** 02/08/2026

---

## 1. Tổng quan Dự án (Project Overview)

### 1.1. Tóm tắt
Dự án nhằm phát triển một AI Agent đóng vai trò **người hướng dẫn giáo dục sức khỏe** dành cho bệnh nhân mắc bệnh mãn tính (đái tháo đường type 2, tăng huyết áp). Sản phẩm giải quyết bài toán thiếu hụt thông tin y tế chính xác và dễ hiểu sau khi bệnh nhân nhận chẩn đoán từ bác sĩ.

### 1.2. Giá trị cốt lõi (Core Value Proposition)
Agent cung cấp thông tin dựa trên 3 cam kết bất biến:
1. **Có nguồn gốc rõ ràng:** 100% câu trả lời dựa trên thư viện tài liệu y khoa đã được thẩm định.
2. **Cá nhân hóa:** Tùy chỉnh nội dung theo tuổi tác, loại bệnh và các bệnh nền đi kèm.
3. **Tuyệt đối an toàn:** Không chẩn đoán, không kê đơn, không điều chỉnh liều lượng thuốc.

---

## 2. Mục tiêu & Chỉ số Thành công (Goals & Metrics)

### 2.1. Mục tiêu
- Trở thành nguồn tra cứu thông tin y tế ưu tiên của bệnh nhân thay cho các công cụ tìm kiếm hoặc mạng xã hội không kiểm duyệt.
- Hỗ trợ bệnh nhân trong **6 tháng đầu sau chẩn đoán** vượt qua sự hoang mang, hiểu rõ bệnh lý và tuân thủ phác đồ điều trị.

### 2.2. Chỉ số thành công (KPIs)
| Hạng mục | Chỉ số đo lường (Metric) | Mục tiêu (Target) |
| :--- | :--- | :--- |
| **An toàn** | Tỷ lệ câu trả lời có grounding & trích dẫn | 100% |
| **An toàn** | Tỷ lệ phát hiện dấu hiệu nguy hiểm (Red-flag recall) | ≥ 95% |
| **An toàn** | Tỷ lệ từ chối đúng yêu cầu chẩn đoán/kê đơn | 100% |
| **Chất lượng** | Độ chính xác của trích dẫn (Faithfulness) | ≥ 95% |
| **Chất lượng** | Tỷ lệ trả lời được trong phạm vi thư viện (Coverage) | ≥ 80% câu hỏi thực tế |
| **Trải nghiệm** | Tỷ lệ hoàn thành lộ trình học "mới chẩn đoán" | ≥ 50% người dùng thử |
| **Trải nghiệm** | Độ trễ phản hồi hệ thống (P95 latency) | ≤ 5 giây / request |

---

## 3. Chân dung Người dùng (User Personas)

### 3.1. Primary User: Bệnh nhân Mãn tính
- **Đặc điểm:** Vừa nhận chẩn đoán (0-6 tháng), đang hoang mang và cần kiến thức nền tảng. Có thể mắc nhiều bệnh nền cùng lúc.
- **Pain points:** Bác sĩ giải thích ngắn; thông tin mạng khó hiểu, không tin cậy và không đúng hoàn cảnh cá nhân; không biết phân biệt triệu chứng nguy hiểm.
- **Nhu cầu:** Cần người giải đáp thắc mắc 24/7, kiến thức phân bổ theo lộ trình dễ tiêu hóa, lời khuyên sát với tình trạng đa bệnh lý.

### 3.2. Secondary User: Người chăm sóc (Caregiver)
- **Đặc điểm:** Thân nhân trực tiếp chăm sóc bệnh nhân (mua thuốc, nấu ăn, nhắc nhở).
- **Nhu cầu:** Cần nắm rõ quy tắc sinh hoạt, chế độ dinh dưỡng và cách nhận diện dấu hiệu bất thường của bệnh nhân.

### 3.3. Admin/Operator: Biên tập viên Y khoa
- **Đặc điểm:** Có chuyên môn y tế (Dược sĩ, Bác sĩ, Sinh viên y khoa).
- **Nhu cầu:** Quản lý thư viện tài liệu, xem log các câu hỏi bị AI từ chối do thiếu dữ liệu để bổ sung nguồn mới, kiểm duyệt nội dung trước khi cập nhật.

---

## 4. Yêu cầu Chức năng (Functional Requirements)

### 4.1. Module 1: Hồ sơ Người dùng & Cá nhân hóa
- **FR1.1 - Khởi tạo hồ sơ:** Người dùng (bệnh nhân/người chăm sóc) khai báo thông tin cơ bản gồm: Tuổi, bệnh chính được chẩn đoán, các bệnh nền, thời gian nhận chẩn đoán.
- **FR1.2 - Lưu trữ sở thích/lịch sử:** Hệ thống lưu lại ngữ cảnh hội thoại để cá nhân hóa lời khuyên và nội dung bài học.

### 4.2. Module 2: Lộ trình Giáo dục Sức khỏe (Learning Path)
- **FR2.1 - Sinh lộ trình học:** Dựa trên hồ sơ bệnh án, hệ thống tự động sinh một lộ trình kiến thức (Ví dụ: Bệnh là gì → Cơ chế → Chế độ ăn → Dấu hiệu nguy hiểm).
- **FR2.2 - Theo dõi tiến độ:** Đánh dấu các bài đã đọc, khuyến khích bệnh nhân hoàn thành lộ trình trong 6 tháng đầu.

### 4.3. Module 3: AI Q&A Agent (Cốt lõi)
- **FR3.1 - Hỏi đáp dựa trên RAG:** Bệnh nhân nhập câu hỏi tự do. Agent tìm kiếm trong thư viện nội bộ và sinh câu trả lời.
- **FR3.2 - Bắt buộc Trích dẫn (Grounding):** Mọi câu trả lời phải kèm theo link hoặc số tham chiếu chỉ đến tài liệu nguồn gốc (Bộ Y tế, hướng dẫn lâm sàng).
- **FR3.3 - Red-flag Detector:** Hệ thống tự động phân tích câu hỏi để tìm "dấu hiệu nguy hiểm". Nếu có, hiển thị luồng Cảnh báo Khẩn cấp (khuyên đi cấp cứu/khám ngay) trước khi trả lời kiến thức.
- **FR3.4 - Cơ chế Từ chối An toàn:** Nếu câu hỏi yêu cầu chẩn đoán, kê đơn, điều chỉnh liều thuốc hoặc nằm ngoài phạm vi thư viện, Agent tự động kích hoạt mẫu câu từ chối chuẩn và gợi ý bệnh nhân ghi lại để hỏi bác sĩ.
- **FR3.5 - Gợi ý câu hỏi:** Đề xuất các câu hỏi tiếp theo dựa trên ngữ cảnh để dẫn dắt bệnh nhân học hỏi.

### 4.4. Module 4: Quản trị Nội dung (Dành cho Biên tập viên)
- **FR4.1 - Quản lý Thư viện gốc:** Tải lên, chỉnh sửa, xóa các tài liệu y khoa (PDF, MD).
- **FR4.2 - Bảng điều khiển Log (Out-of-scope Logs):** Ghi nhận và thống kê các câu hỏi bệnh nhân hỏi nhưng thư viện chưa có.
- **FR4.3 - Luồng kiểm duyệt (Human-in-the-loop):** Biên tập viên phê duyệt nội dung/tài liệu mới trước khi đưa vào thư viện RAG chính thức.

---

## 5. Yêu cầu Phi chức năng (Non-Functional Requirements)

- **NFR1 - Hiệu suất:** Thời gian phản hồi cho mỗi truy vấn hỏi đáp dưới 5 giây (P95).
- **NFR2 - Đa nền tảng:** Giao diện Web Responsive, ưu tiên hiển thị tốt trên thiết bị di động (Mobile-first). Có hỗ trợ Dark Mode.
- **NFR3 - Khả dụng:** Hệ thống hoạt động 24/7.
- **NFR4 - Khả năng mở rộng:** Kiến trúc tách biệt rõ Frontend, Backend API, và LangGraph Agent để dễ dàng scale số lượng bệnh lý sau này.

---

## 6. Ràng buộc An toàn & Tuân thủ (Safety Constraints)

Yêu cầu **không được phép thương lượng (Non-negotiable)**:
1. **Zero Hallucination Tolerance:** Trả lời hoàn toàn dựa trên dữ liệu RAG. Chặn mọi luồng sinh text từ kiến thức zero-shot của LLM.
2. **Không Vượt Quyền Y Khoa:** Từ chối tuyệt đối việc chẩn đoán, kê đơn, chỉnh liều.
3. **Bảo mật PII (Dữ liệu định danh):** Không lưu trữ tên thật, số điện thoại, số CCCD vào log hệ thống LLM.
4. **Miễn trừ trách nhiệm:** Luôn đính kèm dòng chữ: *"Thông tin mang tính giáo dục, không thay thế tư vấn của bác sĩ chuyên khoa"* ở cuối mỗi phản hồi.

---

## 7. Giả định & Biện pháp giảm thiểu Rủi ro

| Rủi ro (Risk) | Mức độ | Biện pháp giảm thiểu (Mitigation) |
| :--- | :--- | :--- |
| Thiếu tài liệu chuẩn cho bệnh | Cao | Tập trung vào 2 bệnh phổ biến nhất (Đái tháo đường, Tăng huyết áp) với nguồn Bộ Y tế. |
| AI bịa thông tin (Hallucination) | Cao | Áp dụng Guardrail bắt buộc grounding, Test CI với RAGAS faithfulness. |
| Bỏ sót dấu hiệu nguy hiểm (False negative) | Cao | Biên tập viên cấu hình sẵn bộ Red-flags, thiên về cảnh báo dư thừa thay vì bỏ sót. |
| Người dùng cố tình lừa AI để lấy đơn thuốc | Trung bình | Test bộ kịch bản Adversarial, dùng Guardrail chặn ý định ngay ở bước đầu. |
| Chi phí API LLM cao | Thấp | Caching câu hỏi thường gặp, tối ưu hóa kích thước context window. |

---

## 8. Lộ trình Triển khai (Roadmap)

### 8.1. Gate 1 - Giai đoạn 1 (MVP)
- Thiết lập thư viện kiến thức cho **1 bệnh đầu tiên**.
- Xây dựng pipeline RAG cơ bản (Retriever + Reranker + Generator).
- Hoàn thiện UI/UX Web cơ bản cho luồng chat Q&A.

### 8.2. Giai đoạn 2 (Hoàn thiện MVP)
- Cấu hình Guardrail Grounding & Luồng từ chối an toàn.
- Tính năng tạo hồ sơ và cá nhân hóa.
- Quản lý 2 vai trò người dùng (Bệnh nhân & Biên tập viên).

### 8.3. Giai đoạn 3 (Tính năng Nâng cao)
- Tích hợp Red-flag detector.
- Xây dựng hệ thống Lộ trình học (Learning Path).
- Xây dựng Dashboard log câu hỏi để biên tập viên mở rộng dữ liệu.

### 8.4. Giai đoạn 4 & Demo Day
- RAGAS Evaluation, Testing an toàn.
- Deploy hệ thống (Live URL).
- Hoàn tất 10 Deliverables (Pitch deck, Video demo, Báo cáo kỹ thuật).
