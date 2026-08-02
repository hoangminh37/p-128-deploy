# Project Brief — Gate 1

**Agent Giáo dục Sức khỏe Cá nhân hóa cho Bệnh nhân Mãn tính**


## 1. Tóm tắt điều hành

Dự án xây dựng một AI Agent đóng vai trò **người hướng dẫn giáo dục sức khỏe** cho bệnh nhân đã được bác sĩ chẩn đoán mắc bệnh mãn tính. Agent trả lời câu hỏi của bệnh nhân **hoàn toàn dựa trên thư viện tài liệu y khoa đã được kiểm duyệt** (nguồn Bộ Y tế và tài liệu chuyên môn đã thẩm định), **có trích dẫn nguồn cho mọi câu trả lời**, và **cá nhân hóa nội dung theo hồ sơ bệnh nhân** (tuổi, bệnh chính, các bệnh nền đi kèm).

Sản phẩm giải quyết khoảng trống giữa thời điểm bệnh nhân nhận chẩn đoán và thời điểm họ thực sự hiểu bệnh của mình: bác sĩ không đủ thời gian giải thích, tài liệu bệnh viện mang tính chung chung và tĩnh, còn Internet thì chứa thông tin không được kiểm duyệt. Agent lấp khoảng trống này với ba cam kết bất biến: **có nguồn — cá nhân hóa — không chẩn đoán, không kê đơn**.

Phạm vi triển khai giai đoạn đầu tập trung vào 2–3 bệnh mãn tính phổ biến tại Việt Nam (đái tháo đường type 2, tăng huyết áp, và một bệnh thứ ba xác định theo mức độ sẵn có của dữ liệu đã kiểm duyệt), ưu tiên nhóm bệnh nhân trong **6 tháng đầu sau chẩn đoán** — giai đoạn nhu cầu học tập cao nhất.

---

## 2. Bối cảnh và tuyên bố vấn đề

### 2.1 Bối cảnh

Tại Việt Nam, bệnh nhân mãn tính thường nhận được chẩn đoán và phác đồ điều trị, nhưng gần như không nhận được phần **giáo dục sức khỏe** đi kèm do tình trạng quá tải của hệ thống y tế: thời gian mỗi lượt khám ngắn, bác sĩ ưu tiên xử lý lâm sàng hơn là giải thích cơ chế bệnh. Hệ quả là bệnh nhân rời phòng khám với một đơn thuốc và một danh sách các việc phải làm, nhưng không hiểu **tại sao** phải làm.

Khoảng trống nhận thức này được bệnh nhân tự lấp đầy bằng cách tìm kiếm trên Google, Facebook và các nền tảng mạng xã hội — nơi thông tin y tế không qua kiểm duyệt chuyên môn, thường mâu thuẫn nhau, và không gắn với hoàn cảnh cá nhân của từng người. Tài liệu giáo dục hiện có của bệnh viện tồn tại dưới dạng tờ rơi hoặc trang tĩnh, viết cho "bệnh nhân trung bình" chứ không cho một bệnh nhân cụ thể có nhiều bệnh nền đồng thời.


### 2.2 Phân tích các điểm đau (pain points)

| # | Điểm đau của người dùng | Hệ quả | Hướng giải quyết của sản phẩm |
|---|---|---|---|
| P1 | Nhận chẩn đoán và phác đồ nhưng không hiểu kiến thức nền tảng về bệnh | Không thể tự quản lý bệnh; phụ thuộc hoàn toàn vào mỗi lần tái khám | **Lộ trình học theo bệnh**, bắt đầu từ kiến thức nền tảng nhất, chia theo từng bước có theo dõi tiến độ |
| P2 | Thông tin trên Google/Facebook không qua kiểm duyệt của cơ quan y tế | Tiếp nhận thông tin sai lệch, có nguy cơ gây hại | **RAG bắt buộc grounding**: mọi câu trả lời chỉ sinh từ thư viện đã duyệt và luôn kèm trích dẫn nguồn |
| P3 | Thông tin chung chung, không khớp hoàn cảnh cá nhân | Bệnh nhân không biết lời khuyên nào áp dụng cho mình, đặc biệt khi có nhiều bệnh nền | **Cá nhân hóa theo hồ sơ đa bệnh nền**: nội dung được lọc và điều chỉnh theo tuổi, bệnh chính, bệnh kèm |
| P4 | Về nhà xuất hiện triệu chứng bất thường, không phân biệt được đâu là bình thường, đâu là cần cấp cứu | Chậm trễ xử trí tình huống nguy hiểm, hoặc nhập viện không cần thiết | **Bộ phát hiện dấu hiệu nguy hiểm (red-flag detector)** theo từng bệnh, kèm khuyến cáo mức độ khẩn |
| P5 | Quên và không tuân thủ điều trị vì không hiểu lý do | Hiệu quả điều trị giảm, bệnh tiến triển | **Nội dung giáo dục nhấn vào cơ chế và hậu quả**, giải thích "tại sao" thay vì chỉ liệt kê "phải làm gì" |
| P6 | Câu hỏi phát sinh vào đêm muộn, không liên lạc được bác sĩ | Lo lắng kéo dài, hoặc tự tra cứu nguồn không tin cậy | **Agent trực 24/7**, giải đáp tức thời trong phạm vi giáo dục sức khỏe |
| P7 | Ngại hỏi bác sĩ và không biết nên hỏi gì | Buổi tái khám kém hiệu quả, bỏ lỡ cơ hội làm rõ thắc mắc | **Gợi ý danh sách câu hỏi** để bệnh nhân mang theo khi tái khám |

---

## 3. Đối tượng mục tiêu

### 3.1 Người dùng chính — Bệnh nhân mãn tính đã được chẩn đoán

- Đã có chẩn đoán chính thức từ bác sĩ (sản phẩm **không** phục vụ mục đích tự chẩn đoán).
- Ưu tiên các bệnh: **đái tháo đường type 2**, **tăng huyết áp**, và một bệnh thứ ba lựa chọn theo mức độ sẵn có của tài liệu đã kiểm duyệt.
- Giai đoạn trọng tâm: **0–6 tháng sau chẩn đoán**, khi nhu cầu học tập và mức độ hoang mang đều ở đỉnh điểm.
- Đặc điểm: mức độ hiểu biết y khoa (health literacy) thấp đến trung bình; nhiều trường hợp mắc đồng thời nhiều bệnh.

### 3.2 Người dùng phụ — Người chăm sóc

Thân nhân trực tiếp chăm sóc bệnh nhân, thường là người thực thi các thay đổi về chế độ ăn, nhắc thuốc và nhận diện dấu hiệu bất thường. Nhóm này cần cùng một nội dung nhưng ở góc nhìn "người hỗ trợ".

### 3.3 Vai trò vận hành — Biên tập viên y khoa

Người có chuyên môn y tế, chịu trách nhiệm thẩm định và phê duyệt tài liệu trước khi đưa vào thư viện, đồng thời xem xét các câu hỏi ngoài phạm vi để quyết định mở rộng thư viện. Đây là mắt xích bảo đảm chất lượng của toàn hệ thống.

---

## 4. Mục tiêu sản phẩm và tiêu chí thành công

### 4.1 Mục tiêu

Trở thành **nguồn thông tin đầu tiên bệnh nhân tìm đến** thay cho Google và các nguồn không chính thức, dựa trên ba cam kết:

1. **Có nguồn** — mọi câu trả lời đều trích xuất từ thư viện y khoa đã được kiểm duyệt và hiển thị nguồn cho người dùng.
2. **Cá nhân hóa** — nội dung được điều chỉnh theo hồ sơ bệnh nhân, đặc biệt trong trường hợp đa bệnh nền.
3. **Không vượt ranh giới** — tuyệt đối không chẩn đoán, không kê đơn, không điều chỉnh liều thuốc.

### 4.2 Tiêu chí thành công

| Nhóm | Chỉ số | Mục tiêu (giai đoạn Build) | Cách đo |
|---|---|---|---|
| An toàn | Tỷ lệ câu trả lời có grounding và trích dẫn hợp lệ | 100% | Kiểm tra tự động trên bộ test + rà soát thủ công |
| An toàn | Tỷ lệ phát hiện đúng dấu hiệu nguy hiểm (recall) | ≥ 95% trên bộ kịch bản red-flag | Bộ test tình huống do biên tập viên y khoa xây dựng |
| An toàn | Tỷ lệ từ chối đúng với yêu cầu chẩn đoán/kê đơn/chỉnh liều | 100% | Bộ test adversarial |
| Chất lượng | Độ chính xác của trích dẫn (câu trả lời khớp nội dung nguồn) | ≥ 95% | Đánh giá thủ công mẫu ngẫu nhiên + RAGAS (faithfulness) |
| Chất lượng | Tỷ lệ trả lời được trong phạm vi thư viện (coverage) | ≥ 80% câu hỏi thực tế | Log câu hỏi ngoài phạm vi |
| Trải nghiệm | Độ trễ phản hồi P95 | ≤ 5 giây | Đo tại tầng API |
| Trải nghiệm | Tỷ lệ hoàn thành lộ trình học "mới chẩn đoán" | ≥ 50% người dùng thử nghiệm | Theo dõi tiến độ trong hệ thống |
| Trải nghiệm | Mức hài lòng của người dùng thử nghiệm | ≥ 4/5 | Khảo sát sau phiên sử dụng |

---

## 5. Giải pháp đề xuất

Sản phẩm là một trợ lý hội thoại kết hợp lộ trình học, vận hành trên nền tảng RAG có kiểm soát chặt.

**Luồng sử dụng chính của bệnh nhân:**

1. Bệnh nhân tạo hồ sơ: tuổi, bệnh được chẩn đoán, các bệnh nền đi kèm, thời điểm chẩn đoán.
2. Hệ thống đề xuất **lộ trình học** tương ứng với bệnh, bắt đầu từ kiến thức nền tảng (bệnh là gì → cơ chế → vì sao phải điều trị → chế độ ăn/vận động → theo dõi tại nhà → dấu hiệu cảnh báo).
3. Bệnh nhân đặt câu hỏi bất kỳ lúc nào. Agent truy xuất tài liệu liên quan từ thư viện đã duyệt, sinh câu trả lời **chỉ dựa trên tài liệu truy xuất được**, kèm trích dẫn và tuyên bố miễn trừ trách nhiệm.
4. Nếu nội dung câu hỏi chứa dấu hiệu nguy hiểm, bộ phát hiện red-flag kích hoạt và hiển thị khuyến cáo đi khám hoặc cấp cứu **trước** phần nội dung giáo dục.
5. Nếu câu hỏi nằm ngoài phạm vi thư viện, Agent từ chối một cách minh bạch, gợi ý mang câu hỏi đó đến bác sĩ, và ghi log để biên tập viên xem xét bổ sung tài liệu.

**Luồng của biên tập viên y khoa:** đăng tải và phê duyệt tài liệu mới, xem danh sách câu hỏi ngoài phạm vi được ưu tiên theo tần suất, và duyệt nội dung giáo dục do hệ thống đề xuất (human-in-the-loop) trước khi phát hành.

Vòng lặp giữa bước 5 và luồng biên tập viên là cơ chế cải tiến trung tâm của sản phẩm: chính câu hỏi thực tế của bệnh nhân chỉ ra thư viện đang thiếu gì.

---

## 6. Phạm vi

### 6.1 Phạm vi cơ bản (MVP — bắt buộc hoàn thành)

- **Q&A có grounding và trích dẫn** trên thư viện đã duyệt: pipeline RAG gồm truy xuất, reranker, và guardrail buộc câu trả lời phải bám tài liệu.
- **Cá nhân hóa theo hồ sơ**: tuổi, bệnh chính, bệnh nền, tình trạng đa bệnh.
- **Từ chối câu hỏi ngoài phạm vi** kèm tuyên bố miễn trừ trách nhiệm nhất quán.
- **Hai vai trò người dùng**: bệnh nhân và biên tập viên y khoa.

### 6.2 Phạm vi nâng cao (triển khai theo thứ tự ưu tiên nếu còn nguồn lực)

| Ưu tiên | Tính năng | Lý do ưu tiên |
|---|---|---|
| Cao | Phát hiện dấu hiệu nguy hiểm → khuyến cáo gặp bác sĩ/cấp cứu | Ảnh hưởng trực tiếp đến an toàn người dùng (P4) |
| Cao | Lộ trình học "mới chẩn đoán" theo từng bệnh + theo dõi tiến độ | Là giá trị khác biệt cốt lõi so với chatbot thông thường (P1) |
| Cao | Log câu hỏi ngoài phạm vi để mở rộng thư viện | Vòng lặp cải tiến, chi phí triển khai thấp, giá trị cao |
| Trung bình | HITL cho biên tập viên duyệt nội dung mới | Bảo đảm chất lượng khi thư viện mở rộng |
| Trung bình | Memory lịch sử hội thoại và sở thích người dùng | Nâng chất lượng cá nhân hóa qua thời gian |
| Trung bình | Gợi ý danh sách câu hỏi cho buổi tái khám | Giải quyết P7 với chi phí triển khai thấp |
| Thấp | Quiz kiểm tra hiểu biết | Củng cố kiến thức, phục vụ đo lường hiệu quả học |
| Thấp | Đa ngôn ngữ | Mở rộng tiếp cận, chưa cần cho nhóm người dùng mục tiêu ban đầu |

### 6.3 Ngoài phạm vi (Non-goals)

Các hạng mục sau **được xác định rõ là không thuộc phạm vi dự án**, nhằm tránh mở rộng phạm vi ngoài kiểm soát và tránh vượt ranh giới an toàn:

- Chẩn đoán bệnh, gợi ý chẩn đoán phân biệt, hoặc phản bác chẩn đoán của bác sĩ.
- Kê đơn, đề xuất thuốc, hoặc điều chỉnh liều lượng.
- Tư vấn cấp cứu thời gian thực thay thế cho hệ thống cấp cứu y tế.
- Lưu trữ hoặc xử lý hồ sơ bệnh án điện tử chính thức; tích hợp với hệ thống HIS/EMR của bệnh viện.
- Kết nối trực tiếp bệnh nhân với bác sĩ (telemedicine).
- Theo dõi chỉ số sinh tồn qua thiết bị đeo.
- Hỗ trợ toàn bộ các bệnh mãn tính — giai đoạn này chỉ giới hạn 2–3 bệnh.

---

## 7. Ràng buộc an toàn và tuân thủ (không thương lượng)

Các ràng buộc dưới đây là điều kiện tiên quyết; mọi tính năng vi phạm sẽ bị loại bỏ bất kể giá trị mang lại.

1. **Chỉ trả lời từ thư viện đã duyệt.** Nếu không truy xuất được tài liệu phù hợp, hệ thống phải từ chối thay vì sinh nội dung từ kiến thức nội tại của mô hình.
2. **Từ chối tuyệt đối** các yêu cầu chẩn đoán, kê đơn, hoặc chỉnh liều thuốc — kể cả khi người dùng nài nỉ hoặc diễn đạt vòng vo.
3. **Phát hiện dấu hiệu nguy hiểm theo từng bệnh**, hiển thị khuyến cáo ưu tiên trước mọi nội dung khác.
4. **Bảo mật thông tin cá nhân (PII)**: hồ sơ bệnh nhân được lưu tối thiểu cần thiết, không ghi log dữ liệu định danh vào hệ thống log vận hành, không chia sẻ với bên thứ ba.
5. **Tuyên bố miễn trừ trách nhiệm nhất quán**: "Thông tin mang tính giáo dục, không thay thế tư vấn của bác sĩ" hiển thị ở mọi câu trả lời.
6. **Truy vết nguồn**: mỗi khẳng định y khoa phải quy chiếu được về một tài liệu cụ thể trong thư viện.

---

## 8. Định hướng kỹ thuật sơ bộ

Kiến trúc chi tiết sẽ được trình bày trong `ARCHITECTURE.md` và `docs/architecture_diagram.md`. Định hướng ở Gate 1:

| Thành phần | Lựa chọn dự kiến | Ghi chú |
|---|---|---|
| Điều phối Agent | LangGraph | Cần luồng có nhánh điều kiện: kiểm tra red-flag → truy xuất → kiểm tra grounding → sinh câu trả lời |
| Backend | FastAPI | Bất đồng bộ, tự sinh tài liệu API, kiểm tra kiểu dữ liệu qua Pydantic |
| Truy xuất | Vector store (ChromaDB/FAISS) + reranker | Tìm kiếm lai (hybrid) giữa từ khóa và ngữ nghĩa để tăng độ chính xác thuật ngữ y khoa |
| Guardrail | Node kiểm tra grounding trước khi trả về | Câu trả lời không bám nguồn sẽ bị chặn và chuyển sang luồng từ chối |
| Cơ sở dữ liệu | SQLite (dev) / PostgreSQL (prod) | Lưu hồ sơ, tiến độ học, log câu hỏi ngoài phạm vi |
| Giao diện | Next.js hoặc Streamlit | Ưu tiên khả năng đọc trên di động; hỗ trợ responsive và dark mode |
| Đánh giá | pytest + RAGAS | Đo faithfulness, context precision/recall; bộ test an toàn riêng |
| Vận hành | Docker + GitHub Actions | Đã có sẵn trong template |

---

## 9. Giả định, rủi ro và biện pháp giảm thiểu

| # | Rủi ro / Giả định | Mức độ | Biện pháp giảm thiểu |
|---|---|---|---|
| R1 | Không thu thập đủ tài liệu y khoa đã kiểm duyệt cho cả 3 bệnh | Cao | Thu hẹp còn 2 bệnh nếu cần; ưu tiên nguồn công khai của Bộ Y tế và hướng dẫn điều trị chính thức |
| R2 | Mô hình sinh nội dung không có trong nguồn (hallucination) | Cao | Guardrail bắt buộc grounding + node kiểm tra sau sinh + bộ test faithfulness bắt buộc trong CI |
| R3 | Bỏ sót dấu hiệu nguy hiểm (false negative của red-flag detector) | Cao | Thiết kế thiên về cảnh báo dư (ưu tiên recall hơn precision); danh sách red-flag do biên tập viên y khoa xác nhận |
| R4 | Người dùng cố tình lách để hỏi chẩn đoán/kê đơn | Trung bình | Bộ test adversarial; guardrail phân loại ý định trước khi truy xuất |
| R5 | Không tiếp cận được biên tập viên y khoa thật để thẩm định | Trung bình | Giai đoạn Build sử dụng vai trò biên tập viên do thành viên đội đảm nhận, dựa trên tài liệu chính thống; ghi rõ giới hạn này trong báo cáo đánh giá |
| R6 | Cá nhân hóa đa bệnh nền tạo ra khuyến nghị mâu thuẫn giữa các bệnh | Trung bình | Ưu tiên hiển thị phần giao thoa và khuyến cáo hỏi bác sĩ khi phát hiện xung đột giữa các hướng dẫn |
| R7 | Chi phí gọi LLM vượt ngân sách | Thấp | Dùng mô hình chi phí thấp cho các bước phụ trợ, cache câu hỏi thường gặp, đặt hạn mức theo `docs/guide/cost-management.md` |

---

## 10. Lộ trình và mốc bàn giao

| Giai đoạn | Nội dung chính | Kết quả bàn giao |
|---|---|---|
| Gate 1 | Xác định vấn đề, đối tượng, phạm vi, ràng buộc an toàn | Bản brief này |
| Giai đoạn 1 | Xây dựng thư viện tài liệu đã duyệt cho bệnh đầu tiên; dựng pipeline RAG cơ bản | Thư viện v1 + API hỏi đáp có trích dẫn |
| Giai đoạn 2 | Guardrail grounding, luồng từ chối, hồ sơ và cá nhân hóa, hai vai trò người dùng | MVP hoàn chỉnh theo mục 6.1 |
| Giai đoạn 3 | Red-flag detector, lộ trình học, log câu hỏi ngoài phạm vi | Các tính năng nâng cao ưu tiên cao |
| Giai đoạn 4 | Đánh giá (RAGAS + bộ test an toàn), triển khai, hoàn thiện tài liệu | Bằng chứng đánh giá + Live URL |
| Demo Day | Hoàn thiện 10 deliverables | Video demo, pitch deck, báo cáo |

---

## 11. Ánh xạ tới deliverables của chương trình

| # | Deliverable | Vị trí | Trạng thái |
|---|---|---|---|
| 1 | Source Code | `src/` | Chưa bắt đầu |
| 2 | README.md | `README.md` | Chưa bắt đầu |
| 3 | Architecture Diagram | `docs/architecture_diagram.md` | Chưa bắt đầu |
| 4 | AI Logs | `.ai-log/` + LangSmith | Đã cấu hình sẵn |
| 5 | Live URL | Render / Vercel | Chưa bắt đầu |
| 6 | Video Demo | `presentation/` | Chưa bắt đầu |
| 7 | Pitch Deck | `presentation/` | Chưa bắt đầu |
| 8 | Development Journal | `JOURNAL.md` | Đang cập nhật |
| 9 | Worklog | `WORKLOG.md` | Đang cập nhật |
| 10 | Evaluation Evidence | `eval/results/report.md` | Chưa bắt đầu |

---


## Phụ lục — Thuật ngữ

| Thuật ngữ | Giải thích |
|---|---|
| RAG (Retrieval-Augmented Generation) | Kỹ thuật cho mô hình ngôn ngữ truy xuất tài liệu liên quan trước khi sinh câu trả lời, nhằm bám sát nguồn |
| Grounding | Ràng buộc câu trả lời phải dựa trên tài liệu truy xuất được, không sinh từ kiến thức nội tại của mô hình |
| Guardrail | Cơ chế kiểm soát chặn hoặc điều hướng đầu ra vi phạm quy tắc an toàn |
| Reranker | Mô hình sắp xếp lại kết quả truy xuất theo mức độ liên quan, nâng độ chính xác trước khi đưa vào ngữ cảnh |
| Red flag | Dấu hiệu/triệu chứng cảnh báo cần can thiệp y tế khẩn cấp |
| HITL (Human-in-the-loop) | Quy trình có con người phê duyệt trước khi hệ thống phát hành nội dung |
| PII | Thông tin định danh cá nhân |
