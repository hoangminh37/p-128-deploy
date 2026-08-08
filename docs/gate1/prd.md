# Product Requirement Document (PRD)

**Tên dự án:** Agent Giáo dục Sức khỏe Cá nhân hóa cho Bệnh nhân Mãn tính
**Giai đoạn:** Gate 1
**Ngày lập:** 02/08/2026

---

## 1. Tổng quan Dự án (Project Overview)

### 1.1. Tóm tắt
Dự án nhằm phát triển một AI Agent đóng vai trò **người hướng dẫn giáo dục sức khỏe** dành cho bệnh nhân mắc bệnh mãn tính (đái tháo đường type 2, tăng huyết áp). Sản phẩm giải quyết bài toán thiếu hụt thông tin y tế chính xác và dễ hiểu sau khi bệnh nhân nhận chẩn đoán từ bác sĩ.

### 1.2. Bối cảnh & Tuyên bố vấn đề (Context & Problem)
Hệ thống y tế quá tải khiến bác sĩ không đủ thời gian giải thích cặn kẽ về bệnh và phác đồ điều trị. Bệnh nhân thường tự tra cứu thông tin trên mạng (chưa kiểm duyệt, chung chung, mâu thuẫn) dẫn đến hiểu sai hoặc lo âu. Sản phẩm ra đời để lấp đầy "khoảng trống nhận thức" này trong giai đoạn nhạy cảm nhất (0-6 tháng sau chẩn đoán), biến đổi các tài liệu chuyên môn khô khan thành nội dung giáo dục dễ hiểu, cá nhân hóa.

### 1.3. Giá trị cốt lõi (Core Value Proposition)
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
- **Đặc điểm:** Vừa nhận chẩn đoán (0-6 tháng), đang hoang mang và cần kiến thức nền tảng. Mức độ hiểu biết y khoa (health literacy) từ thấp đến trung bình. Có thể mắc nhiều bệnh nền cùng lúc.
- **Pain points:** 
  - Bác sĩ giải thích ngắn, không rõ "tại sao" phải điều trị.
  - Thông tin mạng khó hiểu, không tin cậy và không đúng hoàn cảnh cá nhân.
  - Không biết phân biệt đâu là triệu chứng bình thường, đâu là dấu hiệu nguy hiểm cần cấp cứu.
  - Hay quên thắc mắc, không biết nên hỏi gì khi tái khám.
- **Nhu cầu:** Cần người giải đáp thắc mắc 24/7, kiến thức phân bổ theo lộ trình dễ tiêu hóa, lời khuyên sát với tình trạng đa bệnh lý.

### 3.2. Secondary User: Người chăm sóc (Caregiver)
- **Đặc điểm:** Thân nhân trực tiếp chăm sóc bệnh nhân (mua thuốc, nấu ăn, nhắc nhở).
- **Nhu cầu:** Cần nắm rõ quy tắc sinh hoạt, chế độ dinh dưỡng và cách nhận diện dấu hiệu bất thường của bệnh nhân.

### 3.3. Admin/Operator: Biên tập viên Y khoa
- **Đặc điểm:** Có chuyên môn y tế (Dược sĩ, Bác sĩ, Sinh viên y khoa).
- **Nhu cầu:** Quản lý thư viện tài liệu, xem log các câu hỏi bị AI từ chối do thiếu dữ liệu để bổ sung nguồn mới, kiểm duyệt nội dung trước khi cập nhật.

---

## 4. Yêu cầu Chức năng (Functional Requirements)

### 4.1. Luồng Người Dùng Chính (Key User Flows)
1. **Luồng Onboarding & Học tập:** Bệnh nhân tạo hồ sơ (tuổi, bệnh nền) $\rightarrow$ Hệ thống đề xuất Lộ trình học cá nhân hóa $\rightarrow$ Bệnh nhân đọc bài học theo tiến độ.
2. **Luồng Hỏi đáp (Q&A):** Bệnh nhân đặt câu hỏi $\rightarrow$ Agent kiểm tra dấu hiệu nguy hiểm (Red-flag) $\rightarrow$ Nếu có, phát cảnh báo khẩn cấp $\rightarrow$ Nếu an toàn, truy xuất RAG $\rightarrow$ Trả lời kèm trích dẫn nguồn.
3. **Luồng Cập nhật Kiến thức (Biên tập viên):** Bệnh nhân hỏi câu ngoài phạm vi $\rightarrow$ Agent từ chối an toàn & ghi log $\rightarrow$ Biên tập viên xem log $\rightarrow$ Bổ sung tài liệu $\rightarrow$ Duyệt (HITL) $\rightarrow$ Kiến thức được cập nhật.

### 4.2. Module 1: Hồ sơ Người dùng & Cá nhân hóa
**Mục đích:** Thu thập dữ liệu tối thiểu để cá nhân hóa lời khuyên mà không vi phạm quyền riêng tư (không lưu PII).

**User Stories (US):**
- **US1.1:** Là một Bệnh nhân mới, tôi muốn khai báo tình trạng bệnh lý (bệnh chính, bệnh nền) để AI đưa ra lời khuyên chính xác với hoàn cảnh của tôi thay vì lời khuyên chung chung.
- **US1.2:** Là một Bệnh nhân, tôi muốn hệ thống tự động ghi nhớ ngữ cảnh đang nói chuyện để tôi không phải nhắc lại bệnh nền của mình mỗi lần đặt câu hỏi.

**Chi tiết tính năng (Acceptance Criteria):**
- **FR1.1 - Khởi tạo hồ sơ ẩn danh:** 
  - *Input bắt buộc:* Tuổi, Bệnh chính (chọn từ danh sách sẵn có).
  - *Input tùy chọn:* Các bệnh nền đi kèm, Thời gian nhận chẩn đoán.
  - *Ràng buộc:* KHÔNG yêu cầu nhập Tên thật, SĐT, CCCD để tuân thủ bảo mật y tế.
- **FR1.2 - Quản lý Session & Memory:**
  - Hệ thống duy trì Context Window chứa tóm tắt hồ sơ và lịch sử câu hỏi gần nhất để truyền vào LLM trong mỗi lượt hội thoại.

### 4.3. Module 2: Lộ trình Giáo dục Sức khỏe (Learning Path)
**Mục đích:** Dẫn dắt bệnh nhân học kiến thức nền tảng theo từng bước thay vì để họ tự bơi trong biển thông tin.

**User Stories (US):**
- **US2.1:** Là một Bệnh nhân vừa nhận chẩn đoán, tôi muốn có một lộ trình bài học rõ ràng từ cơ bản đến nâng cao để biết mình cần bắt đầu từ đâu.
- **US2.2:** Là một Bệnh nhân, tôi muốn theo dõi mình đã học đến đâu để có động lực hoàn thành khóa học.

**Chi tiết tính năng (Acceptance Criteria):**
- **FR2.1 - Tự động sinh lộ trình học (Onboarding Path):**
  - Ngay sau khi tạo hồ sơ, hệ thống sinh ra một Checklist các chủ đề cần đọc (VD: 1. Bệnh là gì? $\rightarrow$ 2. Nhận biết biến chứng $\rightarrow$ 3. Chế độ ăn).
  - Nội dung bài học được trích xuất sẵn từ thư viện RAG.
- **FR2.2 - Theo dõi tiến độ (Progress Tracking):**
  - Hiển thị thanh tiến độ (Progress bar). Người dùng đánh dấu "Đã hiểu" (Mark as read) ở mỗi bài học.

### 4.4. Module 3: AI Q&A Agent (Cốt lõi)
**Mục đích:** Trả lời thắc mắc tức thời, an toàn tuyệt đối và luôn có trích dẫn.

**User Stories (US):**
- **US3.1:** Là một Bệnh nhân, tôi muốn đặt câu hỏi bằng ngôn ngữ tự nhiên và nhận được câu trả lời dễ hiểu.
- **US3.2:** Là một Bệnh nhân, tôi muốn biết nguồn gốc của câu trả lời (từ Bộ Y tế hay tài liệu nào) để tôi có thể tin tưởng áp dụng.
- **US3.3:** Là Người chăm sóc, tôi muốn được cảnh báo ngay lập tức nếu triệu chứng tôi vừa nhập là dấu hiệu cấp cứu nguy hiểm.

**Chi tiết tính năng (Acceptance Criteria):**
- **FR3.1 - Hỏi đáp RAG (Retrieval-Augmented Generation):**
  - Hệ thống xử lý ngôn ngữ tự nhiên, tra cứu thư viện Vector và trả lời bằng giọng văn thấu cảm, dễ hiểu đối với người không có chuyên môn.
- **FR3.2 - Bắt buộc Trích dẫn (Grounding & Citation):**
  - *Ràng buộc:* Nếu câu trả lời chứa thông tin y khoa, **bắt buộc** đính kèm chú thích (footnote) hoặc link trỏ về tài liệu gốc (Ví dụ: *Theo Hướng dẫn chẩn đoán ĐTĐ - Bộ Y Tế 2020*).
- **FR3.3 - Hệ thống phát hiện cảnh báo đỏ (Red-flag Detector):**
  - *Logic:* Luồng kiểm tra ưu tiên cao nhất. Quét input người dùng để tìm keywords nguy hiểm (VD: "đau ngực dữ dội", "ngất xỉu").
  - *Output:* Nếu phát hiện, NGỪNG sinh câu trả lời thông thường, hiển thị banner đỏ: **"CẢNH BÁO: Đây là dấu hiệu nguy hiểm, vui lòng gọi cấp cứu hoặc đến cơ sở y tế gần nhất."**
- **FR3.4 - Cơ chế Từ chối An toàn (Safe Fallback):**
  - *Logic:* Phân loại ý định (Intent classification). Nếu phát hiện yêu cầu: Xin đơn thuốc, chẩn đoán, hoặc câu hỏi ngoài thư viện.
  - *Output:* Trả lời theo mẫu: *"Rất tiếc, với vai trò trợ lý giáo dục, tôi không được phép [chẩn đoán/kê đơn]. Bạn vui lòng tham khảo ý kiến Bác sĩ điều trị."*
- **FR3.5 - Gợi ý câu hỏi tái khám (Next-best questions):**
  - Đề xuất 3 câu hỏi liên quan ở cuối mỗi lượt chat. Cung cấp tính năng "Lưu vào sổ tay tái khám" để bệnh nhân mang danh sách này đi gặp bác sĩ.

### 4.5. Module 4: Quản trị Nội dung (Dành cho Biên tập viên)
**Mục đích:** Đảm bảo chất lượng tài liệu và liên tục học hỏi từ câu hỏi của người dùng.

**User Stories (US):**
- **US4.1:** Là Biên tập viên y khoa, tôi muốn upload tài liệu PDF/MD mới để hệ thống tự động học và mở rộng kiến thức.
- **US4.2:** Là Biên tập viên y khoa, tôi muốn xem những câu hỏi nào AI đã từ chối trả lời để biết bệnh nhân đang quan tâm điều gì mà thư viện còn thiếu.

**Chi tiết tính năng (Acceptance Criteria):**
- **FR4.1 - Quản lý Thư viện gốc (Knowledge Base Management):**
  - Giao diện Admin cho phép upload tài liệu, hệ thống tự động chunking và embedding vào Vector Store.
- **FR4.2 - Bảng điều khiển Out-of-scope Logs:**
  - Thống kê các câu hỏi bị từ chối do thiếu dữ liệu. Gom nhóm theo tần suất để định hướng bổ sung tài liệu.
- **FR4.3 - Luồng kiểm duyệt (Human-in-the-loop - HITL):**
  - Khi bổ sung tài liệu mới có tính chất nhạy cảm, Biên tập viên phải xác nhận phê duyệt trước khi AI được quyền sử dụng.

---

## 5. Giới hạn Phạm vi (Out of Scope / Non-goals)

Để đảm bảo an toàn y tế và tránh trượt ranh giới sản phẩm, các tính năng sau **nằm ngoài phạm vi dự án**:
- Không chẩn đoán bệnh, không gợi ý chẩn đoán phân biệt, không phản bác chẩn đoán của bác sĩ.
- Không kê đơn thuốc, không đề xuất hoặc điều chỉnh liều lượng thuốc.
- Không thay thế dịch vụ cấp cứu hoặc tư vấn y tế thời gian thực (Telemedicine).
- Không tích hợp với hệ thống Hồ sơ bệnh án điện tử (HIS/EMR) của bệnh viện.
- Không theo dõi chỉ số sinh tồn qua thiết bị đeo (wearables) trong giai đoạn này.

---

## 6. Yêu cầu Phi chức năng (Non-Functional Requirements)

- **NFR1 - Hiệu suất:** Thời gian phản hồi cho mỗi truy vấn hỏi đáp dưới 5 giây (P95).
- **NFR2 - Đa nền tảng & Giao diện:** Giao diện Web Responsive (Mobile-first). Thiết kế bám sát các bản vẽ tại thư mục `docs/gate1/wireframes/`. Hỗ trợ Dark Mode giúp giảm mỏi mắt.
- **NFR3 - Khả dụng:** Hệ thống hoạt động 24/7.
- **NFR4 - Khả năng mở rộng:** Kiến trúc tách biệt rõ Frontend, Backend API, và LangGraph Agent để dễ dàng scale số lượng bệnh lý sau này.
- **NFR5 - Định hướng Công nghệ (Tech Stack):** Sử dụng kiến trúc LangGraph cho luồng Agent (cho phép rẽ nhánh kiểm tra red-flag/grounding), FastAPI (Backend), Vector Store (ChromaDB/FAISS kết hợp Reranker), và Next.js/Streamlit cho giao diện.

---

## 7. Ràng buộc An toàn & Tuân thủ (Safety Constraints)

Yêu cầu **không được phép thương lượng (Non-negotiable)**:
1. **Zero Hallucination Tolerance:** Trả lời hoàn toàn dựa trên dữ liệu RAG. Chặn mọi luồng sinh text từ kiến thức zero-shot của LLM.
2. **Không Vượt Quyền Y Khoa:** Từ chối tuyệt đối việc chẩn đoán, kê đơn, chỉnh liều.
3. **Bảo mật PII (Dữ liệu định danh):** Không lưu trữ tên thật, số điện thoại, số CCCD vào log hệ thống LLM.
4. **Miễn trừ trách nhiệm:** Luôn đính kèm dòng chữ: *"Thông tin mang tính giáo dục, không thay thế tư vấn của bác sĩ chuyên khoa"* ở cuối mỗi phản hồi.

---

## 8. Giả định & Biện pháp giảm thiểu Rủi ro

| Rủi ro (Risk) | Mức độ | Biện pháp giảm thiểu (Mitigation) |
| :--- | :--- | :--- |
| Thiếu tài liệu chuẩn cho bệnh | Cao | Tập trung vào 2 bệnh phổ biến nhất (Đái tháo đường, Tăng huyết áp) với nguồn Bộ Y tế. |
| AI bịa thông tin (Hallucination) | Cao | Áp dụng Guardrail bắt buộc grounding, Test CI với RAGAS faithfulness. |
| Bỏ sót dấu hiệu nguy hiểm (False negative) | Cao | Biên tập viên cấu hình sẵn bộ Red-flags, thiên về cảnh báo dư thừa thay vì bỏ sót. |
| Người dùng cố tình lừa AI để lấy đơn thuốc | Trung bình | Test bộ kịch bản Adversarial, dùng Guardrail chặn ý định ngay ở bước đầu. |
| Chi phí API LLM cao | Thấp | Caching câu hỏi thường gặp, tối ưu hóa kích thước context window. |

---

## 9. Lộ trình Triển khai (Roadmap)

### 9.1. Gate 1 - Giai đoạn 1 (MVP)
- Thiết lập thư viện kiến thức cho **1 bệnh đầu tiên**.
- Xây dựng pipeline RAG cơ bản (Retriever + Reranker + Generator).
- Hoàn thiện UI/UX Web cơ bản cho luồng chat Q&A.

### 9.2. Giai đoạn 2 (Hoàn thiện MVP)
- Cấu hình Guardrail Grounding & Luồng từ chối an toàn.
- Tính năng tạo hồ sơ và cá nhân hóa.
- Quản lý 2 vai trò người dùng (Bệnh nhân & Biên tập viên).

### 9.3. Giai đoạn 3 (Tính năng Nâng cao)
- Tích hợp Red-flag detector.
- Xây dựng hệ thống Lộ trình học (Learning Path).
- Xây dựng Dashboard log câu hỏi để biên tập viên mở rộng dữ liệu.

### 9.4. Giai đoạn 4 & Demo Day
- RAGAS Evaluation, Testing an toàn.
- Deploy hệ thống (Live URL).
- Hoàn tất 10 Deliverables (Pitch deck, Video demo, Báo cáo kỹ thuật).
