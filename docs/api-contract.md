# API Contract - Luồng bệnh nhân

Phiên bản: v1 (Gate 2)
Người soạn: Đức (Frontend)
Trạng thái: đã đối chiếu với code thật ngày 30/08/2026. Những chỗ còn phải chốt được
đánh dấu bằng cụm "CẦN CHỐT" ngay tại chỗ.

Tài liệu này định nghĩa hợp đồng giữa Frontend và Backend cho luồng bệnh nhân.
Frontend dựng mock theo đúng hợp đồng này, nên mọi thay đổi cần thống nhất trước khi sửa.

Các trường dưới đây ánh xạ trực tiếp sang `AgentState` trong `ARCHITECTURE.md`:
`citations`, `intent`, `is_red_flag`, `support_level`, `response`.

---

## 1. Quy ước chung

- Base URL dev: `http://localhost:8000`
- Prefix: `/api/v1`
- Content-Type: `application/json`
- Encoding: UTF-8, giữ nguyên dấu tiếng Việt, không escape unicode

### Xác thực

Backend kiểm tra JWT ở gần như mọi endpoint. `get_current_user` khai trong
`src/api/v1/auth.py` là dependency của `patients.py`, `chat.py`, `conversations.py`,
`source_documents.py`, `voice.py`, `learning.py` và `quiz.py`. Nhóm `/editor` qua thêm
`get_editor_user`, trả 403 khi vai trò không phải `editor`. Bốn endpoint không cần
token: `GET /api/v1/health`, `GET /api/v1/status`, `POST /api/v1/auth/login` và
`POST /api/v1/auth/logout`.

Token là JWT ký bằng HS256, sống 7 ngày, theo `ACCESS_TOKEN_EXPIRE_MINUTES` trong
`src/api/v1/auth.py`. Không có refresh token và không có endpoint làm mới token, nên
khi gặp 401 frontend xoá phiên và đưa người dùng về màn đăng nhập.

Frontend gửi header dưới đây với token nhận được từ endpoint đăng nhập ở mục 3:

```
Authorization: Bearer <access_token>
```

### Lỗi

Dùng định dạng lỗi mặc định của FastAPI:

```json
{ "detail": "Mô tả lỗi" }
```

| Mã | Khi nào |
| :-- | :-- |
| 400 | Payload sai định dạng |
| 401 | Chưa đăng nhập, hoặc token không hợp lệ |
| 403 | Tài khoản không đủ quyền cho endpoint này, xem mục 8 |
| 404 | Không tìm thấy `patient_id` hoặc `conversation_id` |
| 422 | Validation của Pydantic không qua |
| 500 | Lỗi phía agent hoặc LLM |
| 503 | LLM provider không phản hồi |

Định dạng trên áp dụng cho lỗi HTTP thường. Event `error` của luồng SSE hiện dùng tên
trường khác, xem mục 10.

---

## 2. Endpoint

| Method | Path | Mục đích |
| :-- | :-- | :-- |
| POST | `/api/v1/auth/login` | Đăng nhập, trả về token và vai trò của tài khoản |
| POST | `/api/v1/auth/logout` | Trả 204, không có body. Backend hiện không làm gì với token. CẦN CHỐT, xem mục 12 điểm 12 |
| POST | `/api/v1/patients/profile` | Tạo hoặc cập nhật hồ sơ bệnh nhân |
| GET | `/api/v1/patients/{patient_id}/profile` | Đọc hồ sơ |
| GET | `/api/v1/sources/documents/{document_id}?chunk_id={chunk_id}` | Mở tài liệu đã duyệt và đánh dấu đúng đoạn agent đã trích dẫn |
| POST | `/api/v1/voice/transcriptions` | Chuyển một bản ghi ngắn thành chữ. Form data: `patient_id`, `audio`; âm thanh không được lưu |
| POST | `/api/v1/voice/chat/stream` | Một lượt chat bằng giọng nói hoàn chỉnh. Form data: `patient_id`, `conversation_id` (tuỳ chọn), `audio`; server tự STT rồi chạy chính luồng Agent/RAG SSE. Event đầu là `transcript`, sau đó là `step`/`token`/`done`/`annotations` như `/chat/stream` |
| POST | `/api/v1/voice/speech` | Đọc một câu trả lời agent đã lưu thành MP3. JSON: `patient_id`, `message_id` |
| POST | `/api/v1/chat` | Gửi câu hỏi, nhận câu trả lời. Endpoint đồng bộ, giữ làm phương án dự phòng; giao diện hiện dùng `/chat/stream` |
| POST | `/api/v1/chat/stream` | Cùng câu hỏi, nhận dần bằng SSE. Xem mục 10 |
| GET | `/api/v1/conversations/{patient_id}` | Danh sách phiên hội thoại |
| GET | `/api/v1/conversations/{patient_id}/{conversation_id}` | Chi tiết một phiên |
| GET | `/api/v1/editor/dashboard` | Số liệu tổng quan của biên tập viên |
| GET | `/api/v1/editor/documents` | Danh sách tài liệu nguồn kèm trạng thái duyệt và trạng thái index. Xem mục 8 |
| GET | `/api/v1/editor/documents/{document_id}/file` | Tải bản gốc của một tài liệu nguồn. Xem mục 8 |
| GET | `/api/v1/editor/queue` | Danh sách mục chờ duyệt |
| GET | `/api/v1/editor/queue/{item_id}` | Chi tiết một mục chờ duyệt |
| PATCH | `/api/v1/editor/queue/{item_id}/draft` | Lưu chỉnh sửa của bản nháp tạo từ câu hỏi chưa có tài liệu |
| POST | `/api/v1/editor/queue/upload` | Tải tài liệu lên, đưa vào hàng chờ duyệt. **Form data**, không phải JSON |
| POST | `/api/v1/editor/queue/{item_id}/approve` | Duyệt nguồn và bắt đầu job index nền |
| POST | `/api/v1/editor/queue/{item_id}/retry-index` | Chạy lại một job index nguồn đã thất bại |
| POST | `/api/v1/editor/queue/{item_id}/reject` | Từ chối, bắt buộc kèm lý do |
| GET | `/api/v1/editor/out-of-scope` | Câu hỏi thư viện chưa trả lời được |
| POST | `/api/v1/editor/out-of-scope/{log_id}/draft` | Tạo mục nháp từ một câu hỏi |
| POST | `/api/v1/editor/seed-database` | Nạp lại dữ liệu mẫu bằng cách gọi `scripts/init_db.py`. Yêu cầu vai trò `editor`. Trả `{status, message}` |
| GET | `/api/v1/learning/daily-lesson` | Bài học của hôm nay kèm số liệu học tập. Xem mục 14 |
| GET | `/api/v1/learning/library` | Toàn bộ lộ trình học và danh sách bài đã hoàn thành. Xem mục 14 |
| POST | `/api/v1/learning/complete-lesson/{article_id}` | Chấm câu hỏi của bài học và cộng điểm. Xem mục 14 |
| POST | `/api/v1/quiz` | Sinh đề trắc nghiệm. Xem mục 13 |
| POST | `/api/v1/quiz/{quiz_id}/submit` | Nộp bài trắc nghiệm. Xem mục 13 |
| GET | `/api/v1/quiz/history` | Lịch sử làm bài. Xem mục 13 |
| GET | `/api/v1/quiz/mistakes` | Những câu đã trả lời sai. Xem mục 13 |
| GET | `/api/v1/health` | Kiểm tra sức khoẻ hệ thống. Trả `{status, env, app, model, rag}`. Không cần token |
| GET | `/api/v1/status` | Kiểm tra trạng thái agent. Trả `{status, agent, nodes, node_count}`. Không cần token |

---

## 3. Xác thực

### POST /api/v1/auth/login

Request:

```json
{
  "email": "benhnhan@example.com",
  "password": "mat-khau-cua-toi"
}
```

| Trường | Kiểu | Bắt buộc | Ghi chú |
| :-- | :-- | :-- | :-- |
| `email` | string | có | Định dạng email |
| `password` | string | có | Không rỗng. Không log, không trả lại trong bất kỳ response nào |

Response 200:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "user_id": "u_01HQZW",
    "email": "benhnhan@example.com",
    "role": "patient",
    "patient_id": "p_01HQZX"
  }
}
```

| Trường | Kiểu | Ghi chú |
| :-- | :-- | :-- |
| `access_token` | string | Frontend gắn vào header `Authorization: Bearer <access_token>` |
| `token_type` | string | Luôn là `bearer` |
| `user` | UserInfo | Xem bảng dưới |

### UserInfo

| Trường | Kiểu | Ghi chú |
| :-- | :-- | :-- |
| `user_id` | string | Định danh tài khoản |
| `email` | string | Email đăng nhập |
| `role` | enum | `patient` hoặc `editor` |
| `patient_id` | string hoặc null | Chỉ có giá trị khi `role` là `patient`. Với `editor` thì luôn là `null` |

`patient_id` ở đây chính là `patient_id` mà mục 4, 5 và 7 dùng. Tài khoản bệnh nhân không
cần tự sinh `patient_id` nữa, lấy thẳng từ response đăng nhập.

Response 401 khi email hoặc mật khẩu sai:

```json
{ "detail": "Email hoặc mật khẩu không đúng" }
```

Không nói rõ sai email hay sai mật khẩu. Phân biệt hai cái này cho phép người ngoài dò xem
một email có tài khoản trong hệ thống hay không, mà đây là hệ thống y tế nên riêng việc
"người này có bệnh mãn tính" đã là thông tin không được để lộ.

### Vai trò do backend quyết định

`role` đến từ tài khoản trong cơ sở dữ liệu. Frontend KHÔNG được tự chọn vai trò, KHÔNG được
đổi vai trò, và không có màn nào cho người dùng tự khai mình là ai. Frontend chỉ đọc `role`
từ response này để biết đưa người dùng vào luồng nào sau khi đăng nhập.

Mọi kiểm tra quyền thật nằm ở backend. Việc frontend ẩn đi một màn hình chỉ là chuyện giao
diện, không phải là biện pháp bảo vệ — backend vẫn phải từ chối request của tài khoản không
đủ quyền, kể cả khi request đó không thể phát sinh từ giao diện.

### POST /api/v1/auth/logout

Không có body. Gửi kèm header `Authorization` của token đang dùng.

Response 204, không có body.

Frontend xoá token khỏi máy ngay khi gọi, không chờ response — mất mạng giữa chừng thì token
vẫn phải biến mất khỏi máy người dùng.

---

## 4. Hồ sơ bệnh nhân

### POST /api/v1/patients/profile

Request:

```json
{
  "patient_id": "p_01HQZX",
  "age": 58,
  "primary_condition": "hypertension",
  "comorbidities": ["type2_diabetes"],
  "diagnosed_at": "2026-03",
  "asking_as": "self",
  "height_cm": 165,
  "weight_kg": 68.5
}
```

| Trường | Kiểu | Bắt buộc | Ghi chú |
| :-- | :-- | :-- | :-- |
| `patient_id` | string | có | Client sinh nếu chưa có. Không chứa thông tin định danh thật |
| `age` | int | có | 18 đến 120 |
| `primary_condition` | string | có | Mã bệnh từ `GET /api/v1/conditions`; chỉ nhận bệnh đang hoạt động và đã có nguồn RAG duyệt |
| `comorbidities` | string[] | không | Cùng danh mục với `primary_condition`, mặc định rỗng, không được trùng bệnh chính |
| `diagnosed_at` | string | không | Định dạng `YYYY-MM`, không ở tương lai |
| `asking_as` | enum | không | `self` hoặc `caregiver`, mặc định `self`. Người hỏi là chính bệnh nhân hay người chăm sóc. Chỉ ảnh hưởng cách xưng hô trong câu trả lời, không đổi nội dung y khoa |
| `height_cm` | int | không | 100 đến 250. Dùng để agent chọn đúng tài liệu phù hợp thể trạng |
| `weight_kg` | number | không | 25 đến 300. Nên nhập tới một chữ số thập phân — đây là khuyến nghị, không phải ràng buộc validate. Dùng để agent chọn đúng tài liệu phù hợp thể trạng |
| `updated_at` | string | chỉ có trong response | Định dạng ISO 8601 có offset múi giờ |
| `primary_condition_label` | string | chỉ có trong response | Nhãn tiếng Việt lấy từ registry runtime, để client không hardcode danh mục bệnh |
| `comorbidity_labels` | object | chỉ có trong response | Map từ id bệnh kèm sang nhãn tiếng Việt, lấy từ cùng registry |

Hai trường `height_cm` và `weight_kg` chỉ dùng để chọn tài liệu phù hợp thể trạng. Agent KHÔNG
được đưa ra chỉ tiêu cân nặng, mục tiêu giảm cân, hay số calo cụ thể dựa trên hai trường này,
vì đó là tư vấn dinh dưỡng cá nhân hoá — nằm ngoài phạm vi giáo dục của sản phẩm.

Không nhận tên, số điện thoại, số căn cước. Ràng buộc PII trong brief mục 7.4.

Response 200: trả về đúng object vừa lưu, thêm `updated_at` dạng ISO 8601 có offset múi giờ.

### GET /api/v1/conditions

Danh mục bệnh dành cho form hồ sơ bệnh nhân. Endpoint không yêu cầu vai trò BTV,
nhưng chỉ trả bệnh **đang hoạt động** và có ít nhất một tài liệu nguồn đã duyệt;
vì vậy giao diện không thể lưu hồ sơ cho một bệnh mà agent chưa có căn cứ để trả
lời.

```json
{
  "conditions": [
    {
      "condition_id": "type2_diabetes",
      "label_vi": "Đái tháo đường típ 2",
      "label_en": "Type 2 diabetes"
    }
  ]
}
```

### GET /api/v1/patients/{patient_id}/profile

Response 200: cùng cấu trúc trên. Response 404 nếu chưa có hồ sơ.

---

## 5. Hỏi đáp

### POST /api/v1/chat

Request:

```json
{
  "query": "Tôi bị tăng huyết áp thì nên ăn uống thế nào",
  "patient_id": "p_01HQZX",
  "conversation_id": null
}
```

| Trường | Kiểu | Bắt buộc | Ghi chú |
| :-- | :-- | :-- | :-- |
| `query` | string | có | 1 đến 5000 ký tự |
| `patient_id` | string | có | Backend tự nạp hồ sơ từ DB, client không gửi kèm hồ sơ |
| `conversation_id` | string hoặc null | có | `null` nghĩa là mở phiên mới, backend sinh id và trả về |

Ràng buộc `min_length: 1` ở trên là ràng buộc của backend. Frontend đặt thêm một sàn
riêng là 2 ký tự sau khi cắt khoảng trắng, khai ở `MIN_QUERY_LENGTH` trong
`frontend/src/lib/schemas.ts`, và chặn ngay tại máy khách trước khi gửi request. Hai con
số khác nhau là có chủ ý, không phải mâu thuẫn: backend nhận rộng hơn để không phụ thuộc
vào một client cụ thể.

Response 200:

```json
{
  "conversation_id": "c_01HQZY",
  "message_id": "m_01HQZZ",
  "status": "answered",
  "answer": "Người bệnh tăng huyết áp nên giảm lượng muối xuống dưới 5 gam mỗi ngày [1]. Nên tăng rau xanh và hạn chế mỡ động vật [2].",
  "citations": [
    {
      "id": 1,
      "title": "Hướng dẫn chẩn đoán và điều trị tăng huyết áp",
      "issuer": "Bộ Y tế",
      "doc_code": "5481/QĐ-BYT",
      "url": "https://kcb.vn/...",
      "snippet": "Hạn chế lượng natri đưa vào cơ thể, dưới 5 gam muối mỗi ngày.",
      "document_id": "vn-moh-3192-2010-htn",
      "chunk_id": "vn-moh-3192-2010-htn::0004::a1b2c3d4"
    }
  ],
  "support_level": "fully",
  "disclaimer": "Thông tin mang tính giáo dục, không thay thế tư vấn của bác sĩ.",
  "metadata": { "latency_ms": 3120, "cached": false }
}
```

### Trường của response

| Trường | Kiểu | Ghi chú |
| :-- | :-- | :-- |
| `conversation_id` | string | Luôn có. Client lưu lại cho lượt sau |
| `message_id` | string | Định danh cặp hỏi đáp |
| `status` | enum | Xem mục 6. Quyết định cách hiển thị |
| `answer` | string | Nội dung hiển thị cho mọi `status`. Marker `[n]` khớp với `citations[].id` |
| `citations` | Citation[] | Mảng rỗng khi `status` không phải `answered` hoặc `partial` |
| `support_level` | enum hoặc null | `fully`, `partially`, `no_support`. `null` khi không chạy qua Self-RAG |
| `disclaimer` | string | Luôn có, kể cả khi từ chối. Ràng buộc brief mục 7.5 |
| `metadata` | object | `latency_ms` int, `cached` bool |

### Citation

| Trường | Kiểu | Bắt buộc | Ghi chú |
| :-- | :-- | :-- | :-- |
| `id` | int | có | Bắt đầu từ 1, khớp marker trong `answer` |
| `title` | string | có | Tên tài liệu |
| `issuer` | string | có | Cơ quan ban hành, ví dụ Bộ Y tế |
| `doc_code` | string hoặc null | có | Số hiệu văn bản, ví dụ `5481/QĐ-BYT` |
| `url` | string hoặc null | có | Link tài liệu gốc |
| `snippet` | string | có | Đoạn trích được dùng, tối đa 300 ký tự |
| `document_id` | string hoặc null | có | Định danh tài liệu trong thư viện. `null` với lịch sử chat cũ, khi đó không có màn xem đoạn |
| `chunk_id` | string hoặc null | có | Định danh chính xác chunk đã truy xuất. Dùng cùng `document_id` để mở màn nguồn |

`snippet` là đoạn trích từ tài liệu y khoa đã duyệt trong thư viện, không phải trích từ hồ sơ
hay dữ liệu của bệnh nhân, và backend không được đưa bất kỳ nội dung nào từ hồ sơ bệnh nhân
vào trường này.

### GET /api/v1/sources/documents/{document_id}

Mở từ nút **Xem đoạn đã trích** của một `Citation`. Query `chunk_id` là bắt buộc;
backend chỉ trả về tài liệu có `status: approved`, và chỉ khi chunk đó thực sự thuộc tài liệu.
Nhờ vậy URL không thể được dùng để đọc bản nháp, tài liệu chờ duyệt hay một đoạn không có trong
citation.

Ví dụ: `/api/v1/sources/documents/vn-moh-3192-2010-htn?chunk_id=vn-moh-3192-2010-htn%3A%3A0004%3A%3Aa1b2c3d4`

Response 200:

```json
{
  "document_id": "vn-moh-3192-2010-htn",
  "title": "Hướng dẫn chẩn đoán và điều trị tăng huyết áp",
  "issuer": "Bộ Y tế",
  "doc_code": "3192/QĐ-BYT",
  "url": "https://kcb.vn/...",
  "published": "2010",
  "highlighted_chunk_id": "vn-moh-3192-2010-htn::0004::a1b2c3d4",
  "total_chunks": 42,
  "chunks": [
    {
      "chunk_id": "vn-moh-3192-2010-htn::0004::a1b2c3d4",
      "content": "Hạn chế lượng natri đưa vào cơ thể...",
      "section_path": "Điều trị không dùng thuốc",
      "page_start": 12,
      "page_end": 12,
      "table": null
    }
  ]
}
```

Frontend tô nền chunk có `chunk_id` trùng `highlighted_chunk_id`, rồi cuộn trang đến chunk đó.
`chunks` chỉ gồm đoạn được trích và tối đa hai đoạn lân cận mỗi bên; `total_chunks` cho biết tổng
số đoạn của tài liệu. Cách này giữ trang nguồn mở nhanh và làm mỗi citation có một trang đối
chiếu riêng, thay vì dựng hàng trăm đoạn giống nhau.
Response 404 khi tài liệu không tồn tại/chưa được duyệt, chưa được index, hoặc `chunk_id` không
thuộc tài liệu. Endpoint yêu cầu đăng nhập như các endpoint luồng bệnh nhân khác.

Với chunk là bảng, `table` là `null` hoặc một lưới do parser trả về:

```json
{
  "rows": 2,
  "columns": 2,
  "cells": [
    { "text": "Tiêu chí", "row": 0, "column": 0, "row_span": 1, "column_span": 1, "is_column_header": true, "is_row_header": false }
  ]
}
```

Frontend ưu tiên lưới này để dựng bảng. Nó không tách tiêu đề cột bằng quy tắc theo câu chữ;
nếu dữ liệu cũ chỉ còn Markdown phẳng đã mất ranh giới cột, UI hiển thị phần còn xác minh được
thay vì bịa cấu trúc.

Quy tắc: mọi `id` xuất hiện trong `answer` phải có phần tử tương ứng trong `citations`,
và ngược lại. Frontend validate bằng Zod, lệch thì báo lỗi hiển thị thay vì render sai.

---

## 6. Năm trạng thái

`status` là trường quyết định giao diện. Frontend render năm dạng khác nhau.

| status | Node sinh ra | citations | Ý nghĩa |
| :-- | :-- | :-- | :-- |
| `answered` | `selfrag_verifier` fully | có | Trả lời đầy đủ, bám nguồn |
| `partial` | `partial_rewrite` hoặc `safety_disclaimer` | có | Trả lời nhưng một phần chưa bám nguồn |
| `red_flag` | `emergency_handler` | rỗng | Có dấu hiệu nguy hiểm, cần đi khám ngay |
| `refused` | `refuse_handler` | rỗng | Câu hỏi đòi chẩn đoán, kê đơn, chỉnh liều |
| `referral` | `doctor_referral` | rỗng | Thư viện chưa có tài liệu phù hợp |

`refused` và `referral` là hai việc khác nhau và không được gộp.
`refused` là hệ thống không được phép trả lời. `referral` là thư viện chưa đủ dữ liệu.
Giọng điệu và giao diện của hai cái này khác nhau.

### Ví dụ red_flag

```json
{
  "conversation_id": "c_01HQZY",
  "message_id": "m_01HR00",
  "status": "red_flag",
  "answer": "Triệu chứng bạn mô tả có thể là dấu hiệu cần cấp cứu. Vui lòng gọi 115 hoặc đến cơ sở y tế gần nhất ngay. Tôi không thể chẩn đoán qua tin nhắn.",
  "citations": [],
  "support_level": null,
  "disclaimer": "Thông tin mang tính giáo dục, không thay thế tư vấn của bác sĩ.",
  "metadata": { "latency_ms": 640, "cached": false }
}
```

### Ví dụ refused

```json
{
  "conversation_id": "c_01HQZY",
  "message_id": "m_01HR01",
  "status": "refused",
  "answer": "Tôi không thể tư vấn liều thuốc hoặc kê đơn. Bạn hãy ghi lại câu hỏi này và hỏi bác sĩ điều trị trong lần tái khám gần nhất.",
  "citations": [],
  "support_level": null,
  "disclaimer": "Thông tin mang tính giáo dục, không thay thế tư vấn của bác sĩ.",
  "metadata": { "latency_ms": 580, "cached": false }
}
```

### Ví dụ referral

```json
{
  "conversation_id": "c_01HQZY",
  "message_id": "m_01HR02",
  "status": "referral",
  "answer": "Thư viện tài liệu đã duyệt hiện chưa có nội dung cho câu hỏi này. Bạn nên hỏi trực tiếp bác sĩ điều trị. Câu hỏi đã được ghi nhận để bổ sung tài liệu.",
  "citations": [],
  "support_level": null,
  "disclaimer": "Thông tin mang tính giáo dục, không thay thế tư vấn của bác sĩ.",
  "metadata": { "latency_ms": 2400, "cached": false }
}
```

### Ví dụ partial

Giống `answered`, khác ở hai trường:

```json
{
  "status": "partial",
  "support_level": "partially"
}
```

---

## 7. Lịch sử hội thoại

### GET /api/v1/conversations/{patient_id}

```json
{
  "conversations": [
    {
      "conversation_id": "c_01HQZY",
      "title": "Chế độ ăn cho người tăng huyết áp",
      "last_message_at": "2026-08-12T09:14:00Z",
      "message_count": 4
    }
  ]
}
```

`title` do backend sinh từ câu hỏi đầu tiên, cắt tối đa 60 ký tự.

### GET /api/v1/conversations/{patient_id}/{conversation_id}

```json
{
  "conversation_id": "c_01HQZY",
  "messages": [
    { "role": "user", "content": "...", "created_at": "2026-08-12T09:12:00Z" },
    { "role": "assistant", "message_id": "m_01HQZZ", "status": "answered", "content": "...", "citations": [], "support_level": "fully", "created_at": "2026-08-12T09:12:04Z" }
  ]
}
```

Message của assistant dùng lại đúng các trường của `/api/v1/chat`, riêng `answer` được đổi tên
thành `content` để thống nhất với message của user.

---

## 8. Quản trị nội dung

Phần dành cho vai trò `editor`, bám theo `docs/gate1/prd.md` mục FR4.1 tới FR4.3 và bản vẽ
`docs/gate1/wireframes/wireframe_bientapvien.pdf`.

### Quyền truy cập

MỌI endpoint trong mục này chỉ mở cho tài khoản có `role` bằng `editor` (xem mục 3). Gọi
bằng vai trò khác trả **403**:

```json
{ "detail": "Tài khoản này không có quyền truy cập khu vực biên tập" }
```

Kiểm quyền phải làm ở backend, không được dựa vào việc frontend ẩn đường dẫn. Frontend đã
chặn ở tầng điều hướng, nhưng đó chỉ là để giao diện không dẫn người dùng vào chỗ không phải
của họ — nó không ngăn được ai gọi thẳng vào API.

### Ràng buộc PII của log câu hỏi

Đây là ràng buộc NẶNG NHẤT của cả mục này, vì nó là chỗ duy nhất trong hệ thống mà nội dung
do bệnh nhân gõ ra được đưa cho một người khác đọc.

1. Trường `question` trong log ngoài phạm vi chỉ chứa nội dung câu hỏi. Backend phải loại bỏ
   tên, số điện thoại, số căn cước, số thẻ bảo hiểm và địa chỉ TRƯỚC khi ghi vào log. Câu nào
   không làm sạch được thì không ghi — thà mất một dòng thống kê còn hơn lộ danh tính.
2. Log KHÔNG kèm `patient_id`, và không có bất kỳ trường nào lần ngược được về một tài khoản.
   Biên tập viên đọc log để biết thư viện còn thiếu chủ đề gì, không phải để biết ai đang hỏi.
3. `ask_count` là số đếm đã gộp. Không có endpoint nào trả về danh sách từng lượt hỏi riêng lẻ,
   vì gộp lại rồi tách ra được thì việc gộp không còn ý nghĩa bảo vệ nào.

Ràng buộc này bắt nguồn từ brief mục 7.4, và chặt hơn ở chỗ: hồ sơ bệnh nhân vốn đã không
chứa PII, còn câu hỏi thì là chữ tự do nên phải làm sạch chủ động.

### Enum dùng chung

| Enum | Giá trị | Ý nghĩa |
| :-- | :-- | :-- |
| `status` | `draft` | Mới tạo từ log câu hỏi, biên tập viên chưa soạn xong |
| | `pending` | Đã soạn xong, đang chờ duyệt |
| | `indexing` | Nguồn đã được duyệt biên tập, đang parse/chunk/embed/index; agent chưa dùng được |
| | `failed` | Job index nguồn thất bại; giữ file và lỗi để chạy lại |
| | `approved` | Với nguồn upload: index đã thành công và agent dùng được. Với `question_log`: chỉ là quyết định duyệt nội dung, không tự tạo nguồn RAG |
| | `rejected` | Bị từ chối, không vào thư viện |
| `origin` | `question_log` | Sinh ra từ một câu hỏi ngoài phạm vi mà bệnh nhân đã hỏi |
| | `editor_upload` | Biên tập viên tự thêm tài liệu, theo FR4.1 |

`origin` là thứ bản vẽ hiển thị ngay dưới tiêu đề mỗi mục ("Từ log câu hỏi" và "Tự thêm"),
nên nó phải là dữ liệu có sẵn ở danh sách, không phải thứ chỉ tra được khi mở chi tiết.

### GET /api/v1/editor/conditions

Trả danh mục đã merge giữa bệnh nền và bệnh BTV tạo lúc vận hành. Mỗi phần tử có
`condition_id`, `label_vi`, `label_en`, `aliases`, `origin` (`system` hoặc
`editor_runtime`), `status` (`waiting_for_sources`, `active`, `inactive`),
`source_document_count` và `approved_source_count`. Chỉ tài khoản `editor` được
gọi.

### POST /api/v1/editor/conditions

Tạo bệnh runtime, không ghi `registry.yaml`.

```json
{
  "condition_id": "asthma",
  "label_vi": "Hen phế quản",
  "label_en": "Asthma",
  "aliases": ["hen", "hen suyễn"]
}
```

`condition_id` phải bắt đầu bằng chữ thường và chỉ gồm chữ thường, số, dấu gạch
dưới. Response 201 là phần tử vừa tạo, với `status: "waiting_for_sources"`.
Response 409 nếu mã trùng bệnh nền hoặc một bệnh runtime đã có.

### POST /api/v1/editor/conditions/{condition_id}/status

Body `{ "status": "inactive" }` tạm ngừng bệnh và loại các tài liệu của bệnh
đó khỏi retrieval, nhưng giữ nguyên vector để bật lại. Body `{ "status":
"active" }` chỉ hợp lệ khi có ít nhất một tài liệu nguồn đã duyệt; nếu không
trả 409. Không thể đổi trạng thái bệnh nền qua endpoint này.

### GET /api/v1/editor/dashboard

Hai con số ở màn Tổng quan của bản vẽ.

```json
{
  "pending_count": 12,
  "out_of_scope_count": 27
}
```

| Trường | Kiểu | Ghi chú |
| :-- | :-- | :-- |
| `pending_count` | int | Số mục có `status` bằng `pending`. Không tính `draft` |
| `out_of_scope_count` | int | Số câu hỏi ngoài phạm vi CHƯA được tạo bài, tức `drafted` bằng `false` |

Hai con số này cố ý đếm hai thứ khác nhau: `pending_count` là việc đang chờ người duyệt,
`out_of_scope_count` là việc chưa ai bắt đầu. Gộp lại thành một con số "việc cần làm" sẽ giấu
mất chuyện cái nào đang tắc.

### GET /api/v1/editor/queue

Query param `status`, không bắt buộc, mặc định `pending` — đúng như bản vẽ, màn hàng đợi mở
ra là thấy ngay danh sách chờ duyệt. Truyền giá trị khác để xem các nhóm còn lại.

```json
{
  "items": [
    {
      "item_id": "e_01HR10",
      "title": "Dinh dưỡng cho người tiểu đường",
      "origin": "question_log",
      "topics": ["Tiểu đường", "Dinh dưỡng"],
      "created_at": "2026-08-12T09:14:00+07:00",
      "status": "pending"
    },
    {
      "item_id": "e_01HR11",
      "title": "Chăm sóc sau phẫu thuật nhỏ",
      "origin": "editor_upload",
      "topics": ["Chăm sóc tại nhà"],
      "created_at": "2026-08-11T16:02:00+07:00",
      "status": "pending"
    }
  ]
}
```

| Trường | Kiểu | Ghi chú |
| :-- | :-- | :-- |
| `item_id` | string | Định danh mục |
| `title` | string | Tiêu đề, tối đa 120 ký tự |
| `origin` | enum | `question_log` hoặc `editor_upload` |
| `topics` | string[] | Thẻ chủ đề, có thể rỗng |
| `created_at` | string | ISO 8601 có offset múi giờ |
| `status` | enum | `draft`, `pending`, `indexing`, `failed`, `approved`, `rejected` |

Sắp theo `created_at` giảm dần, mới nhất lên đầu.

### GET /api/v1/editor/queue/{item_id}

Toàn bộ những gì màn duyệt chi tiết cần, trong một lần gọi.

```json
{
  "item_id": "e_01HR10",
  "title": "Dinh dưỡng cho người tiểu đường",
  "origin": "question_log",
  "topics": ["Tiểu đường", "Dinh dưỡng"],
  "created_at": "2026-08-12T09:14:00+07:00",
  "status": "pending",
  "content": "Người bệnh đái tháo đường típ 2 nên phân bố đều lượng chất bột đường trong các bữa ăn trong ngày. Tăng rau xanh và chất xơ. Hạn chế đường hấp thu nhanh và đồ uống có đường.",
  "source_url": "https://kcb.vn/van-ban/huong-dan-chan-doan-va-dieu-tri-dai-thao-duong-tip-2",
  "issuer": "Bộ Y tế",
  "doc_code": "5481/QĐ-BYT",
  "conditions": ["type2_diabetes"],
  "review_note": null,
  "reject_reason": null,
  "reviewed_at": null,
  "reviewed_by": null
}
```

| Trường | Kiểu | Ghi chú |
| :-- | :-- | :-- |
| `content` | string | Toàn bộ nội dung sẽ đưa vào thư viện |
| `source_url` | string hoặc null | Đường dẫn tài liệu nguồn |
| `issuer` | string hoặc null | Cơ quan ban hành |
| `doc_code` | string hoặc null | Số hiệu văn bản, ví dụ `5481/QĐ-BYT` |
| `conditions` | enum[] | Bệnh mà nội dung này áp dụng. Cùng tập giá trị với `primary_condition` ở mục 4 |
| `review_note` | string hoặc null | Ghi chú của người duyệt, chỉ có khi `status` là `approved` |
| `reject_reason` | string hoặc null | Lý do từ chối, chỉ có khi `status` là `rejected` |
| `reviewed_at` | string hoặc null | Thời điểm duyệt hoặc từ chối |
| `reviewed_by` | string hoặc null | `user_id` của biên tập viên đã xử lý |
| `source_approval_status` | enum hoặc null | Lifecycle thật trong `uploads.json`: `pending_review`, `indexing`, `index_failed`, `approved`; `null` với `question_log` |
| `source_index_error` | string hoặc null | Lỗi gần nhất có thể hành động, chỉ có khi index nguồn thất bại |
| `indexed_chunk_count` | int hoặc null | Số chunk đã ghi thành công; chỉ có khi nguồn đã index |
| `index_attempts` | int hoặc null | Số lần chạy index của nguồn |

Ba trường `source_url`, `issuer`, `doc_code` chính là ba trường `url`, `issuer`, `doc_code` của
`Citation` ở mục 5. Duyệt xong thì nội dung này trở thành nguồn mà bệnh nhân nhìn thấy cạnh
câu trả lời, nên thiếu `issuer` là bệnh nhân không biết ai nói câu đó. Bản vẽ Gate 1 lấy ví dụ
một nguồn nước ngoài (`medlineplus.gov`); nếu thư viện thật sự nhận nguồn ngoài nước thì phải
chốt quy ước phân biệt trước, xem mục 12 điểm 3.

`conditions` có thể rỗng ở mục `draft` — lúc mới tạo từ log thì chưa ai gán bệnh. Nhưng phải
có ít nhất một giá trị trước khi chuyển sang `pending`, vì trợ lý chỉ tra tài liệu theo bệnh
trong hồ sơ; nội dung không gắn bệnh nào sẽ không bao giờ được lấy ra.

404 nếu `item_id` không tồn tại.

### GET /api/v1/editor/documents

Danh sách thư viện nguồn thực tế của RAG, dành cho vai trò `editor`. Đây không
phải `editor_queue`: mỗi dòng là một tài liệu đã đăng ký trong `registry.yaml`,
`uploads.json`, hoặc lịch sử quarantine. Hai trạng thái phải được đọc độc lập:

| Trường | Ý nghĩa |
| :-- | :-- |
| `approval_status` | Lifecycle nguồn: `pending_review`, `indexing`, `index_failed`, `approved` hoặc `quarantined` |
| `index_status` | `indexing`, `failed`, `indexed`, `not_indexed`, `not_applicable` hoặc `unavailable` |
| `index_attempts`, `index_error` | Lần chạy và lỗi gần nhất, để BTV quyết định chạy lại hoặc từ chối |
| `viewer_type` | `pdf`, `markdown`, hoặc `unsupported`, suy từ file gốc thực tế |
| `source_file_available` | File gốc hiện có trên server này hay không |

Một tài liệu vẫn có thể `approval_status = approved` và `index_status = indexed`
nhưng `source_file_available = false`: vector store chỉ cần các chunk đã xử lý,
còn PDF/Markdown gốc không được commit vào Git. Frontend phải hiển thị rõ trạng
thái này, không tạo preview hoặc URL giả.

### GET /api/v1/editor/documents/{document_id}/file

Trả file gốc PDF hoặc Markdown cho biên tập viên đã đăng nhập để màn xem toàn
văn tải theo yêu cầu. Endpoint kiểm tra `document_id` qua registry, giới hạn
đường dẫn trong `data/raw`, và không trả bất kỳ tệp nào bên ngoài kho tài liệu.

| Mã | Khi nào |
| :-- | :-- |
| 200 | File PDF (`application/pdf`) hoặc Markdown (`text/markdown`) có trong kho |
| 404 | Không có tài liệu hoặc file gốc không nằm trên server hiện tại |
| 415 | File gốc có định dạng khác PDF/Markdown, chưa có màn xem trực tiếp |
| 401 / 403 | Chưa đăng nhập / không phải biên tập viên |

Frontend tải PDF thành `Blob` có Authorization rồi nhúng Object URL cục bộ; không
đặt endpoint thẳng trong iframe vì iframe không mang Bearer token. Markdown được
render bằng GFM và không cho phép HTML thô từ file upload.

### POST /api/v1/editor/queue/upload

Biên tập viên tự thêm tài liệu, tức FR4.1. Tài liệu tải lên KHÔNG tự vào thư viện: nó nằm ở
hàng đợi chờ duyệt. Không có ETL bài học, mock hay QueueItem phụ nào được sinh ngầm từ upload
này; mỗi upload tương ứng đúng một `SourceDoc` và một job index.

**Endpoint DUY NHẤT của hợp đồng này không dùng JSON.** Body là `multipart/form-data`, vì có
file đính kèm. Đừng đặt `Content-Type` bằng tay — để trình duyệt tự sinh kèm `boundary`.

| Trường | Kiểu | Bắt buộc | Ghi chú |
| :-- | :-- | :-- | :-- |
| `file` | file | có | Tài liệu gốc. Xem danh sách định dạng bên dưới |
| `title` | string | có | Tên tài liệu, sẽ thành `title` của mục trong hàng đợi |
| `issuer` | string | có | Cơ quan ban hành. Thành `issuer` của `Citation` sau khi duyệt |
| `published` | string | có | Năm hoặc ngày ban hành, ví dụ `2026` hoặc `2025-09-16` |
| `diseases` | string | có | Danh sách id bệnh, **ngăn nhau bằng dấu phẩy**, ví dụ `type2_diabetes,hypertension`. Không được rỗng |
| `doc_code` | string | không | Số hiệu văn bản, ví dụ `5481/QĐ-BYT` |
| `url` | string | không | Link tài liệu gốc |
| `notes` | string | không | Ghi chú của người tải lên, không hiển thị cho bệnh nhân |

Định dạng file được chấp nhận, lấy từ `SUPPORTED_SUFFIXES` trong `src/rag/ingest.py`:
`.pdf`, `.pptx`, `.docx`, `.md`, `.html`, `.htm`, `.xlsx`. Đây là những định dạng Docling đọc
được và đã kiểm chứng trên corpus của dự án.

Giá trị hợp lệ của `diseases` là id bệnh trong danh mục đã merge giữa
`data/registry.yaml` và `data/registry_runtime.yaml`. BTV tạo bệnh mới qua
`POST /editor/conditions` rồi có thể chọn id đó ngay trong form upload. Gửi id
lạ thì trả 400 kèm danh sách id đang hỗ trợ — **không** phải tên tiếng Việt như
"Tiểu đường". Một bệnh runtime chỉ được agent và hồ sơ bệnh nhân dùng sau khi
có ít nhất một tài liệu index thành công.

Response 201, trả về đúng object của `GET /editor/queue/{item_id}`, với `status` bằng `pending`,
`content` rỗng, còn `source_url`, `issuer`, `doc_code`, `conditions` lấy từ chính form vừa gửi.

| Mã | Khi nào |
| :-- | :-- |
| 400 | File rỗng, định dạng không hỗ trợ, `diseases` rỗng, hoặc id bệnh không có trong phạm vi |
| 401 | Chưa đăng nhập |
| 403 | Tài khoản không phải `editor` |
| 422 | Thiếu một trong năm trường bắt buộc |

Tài liệu ở bước này mới chỉ được lưu lại và ghi vào hàng chờ — **chưa parse, chưa cắt chunk,
chưa embed**. `Registry.approved()` không trả nguồn này nên agent không thể truy xuất nó.

### POST /api/v1/editor/queue/{item_id}/approve

Duyệt một nguồn upload và bắt đầu job nền parse → sửa cấu trúc → chunk → embedding → index.
Cả hai trường trong body đều không bắt buộc.

```json
{
  "content": "Người bệnh đái tháo đường típ 2 nên chia đều chất bột đường ra các bữa trong ngày. Nên ăn nhiều rau. Nên tránh nước ngọt và bánh kẹo.",
  "note": "Viết lại bằng câu ngắn cho dễ đọc. Giữ nguyên ý của văn bản gốc."
}
```

| Trường | Kiểu | Bắt buộc | Ghi chú |
| :-- | :-- | :-- | :-- |
| `content` | string | không | Nội dung đã chỉnh sửa. Bỏ trống thì giữ nguyên `content` đang có |
| `note` | string | không | Ghi chú của người duyệt, lưu vào `review_note` |

Với `editor_upload`, response 200 trả `status: indexing` và
`source_approval_status: indexing`; đó **không** có nghĩa agent đã dùng được. Chỉ worker hoàn
tất toàn bộ bước và ghi chunk thành công mới chuyển cả hai về `approved`. Nếu lỗi, chúng là
`failed` / `index_failed` kèm `source_index_error`; không chunk nào của nguồn được phép dùng
để trả lời. Với `question_log`, endpoint chỉ chốt nội dung trong hàng đợi và không gọi RAG.

Duyệt một mục đã `approved` hoặc `rejected` trả **409**. Duyệt là hành động một chiều, và một
nút bấm hai lần vì mạng chậm không được phép ghi vào thư viện hai lần.

### POST /api/v1/editor/queue/{item_id}/retry-index

Không có body. Chỉ áp dụng cho `editor_upload` có lifecycle nguồn bằng `index_failed`.
Endpoint tăng `index_attempts`, xoá lỗi cũ, chuyển về `indexing` và đẩy job nền mới. Trả 409
nếu mục không phải nguồn upload hoặc job chưa ở trạng thái thất bại. Nếu server restart giữa
lúc chạy, startup chuyển job dở dang về `index_failed` thay vì giả vờ vẫn đang chạy.

### POST /api/v1/editor/queue/{item_id}/reject

```json
{
  "reason": "Nội dung nói về liều thuốc, nằm ngoài phạm vi trợ lý được phép trả lời."
}
```

| Trường | Kiểu | Bắt buộc | Ghi chú |
| :-- | :-- | :-- | :-- |
| `reason` | string | **có** | Không được rỗng. Trả 422 nếu thiếu hoặc chỉ có khoảng trắng |

Lý do là bắt buộc chứ không phải tuỳ chọn: mục bị từ chối mà không ghi vì sao thì người sau
lại soạn đúng nội dung ấy lần nữa, và cả vòng duyệt lặp lại từ đầu.

Response 200 trả về object đã cập nhật, `status` thành `rejected` và `reject_reason` được điền.
Từ chối một mục đã xử lý cũng trả **409**, cùng lý do như `approve`.

### GET /api/v1/editor/out-of-scope

Những câu hỏi mà trợ lý đã trả `status` bằng `referral` ở mục 6 — tức thư viện chưa có tài
liệu. Đây là đầu vào của FR4.2.

```json
{
  "logs": [
    {
      "log_id": "o_01HR20",
      "question": "Chăm sóc vết mổ tại nhà thế nào cho đúng?",
      "ask_count": 8,
      "last_asked_at": "2026-08-12T08:40:00+07:00",
      "drafted": false,
      "drafted_item_id": null
    },
    {
      "log_id": "o_01HR21",
      "question": "Chế độ ăn cho người suy thận nên như thế nào?",
      "ask_count": 5,
      "last_asked_at": "2026-08-11T19:12:00+07:00",
      "drafted": true,
      "drafted_item_id": "e_01HR12"
    }
  ]
}
```

| Trường | Kiểu | Ghi chú |
| :-- | :-- | :-- |
| `log_id` | string | Định danh nhóm câu hỏi đã gộp |
| `question` | string | Nội dung câu hỏi, đã làm sạch PII. Xem ràng buộc ở đầu mục này |
| `ask_count` | int | Số lượt đã được hỏi, từ 1 trở lên |
| `last_asked_at` | string | Lần hỏi gần nhất, ISO 8601 có offset múi giờ |
| `drafted` | bool | Đã tạo mục nháp trong hàng đợi hay chưa |
| `drafted_item_id` | string hoặc null | `item_id` của mục nháp, `null` khi `drafted` là `false` |

Sắp theo `ask_count` giảm dần — bản vẽ xếp 8, 5, 4 lượt từ trên xuống. Thứ tự này chính là
thứ tự ưu tiên bổ sung tài liệu, nên nó thuộc về hợp đồng chứ không phải lựa chọn của frontend.

Không có trường nào chứa `patient_id`. Đó là chủ ý, không phải thiếu sót.

### POST /api/v1/editor/out-of-scope/{log_id}/draft

Nút "+ Thêm bài" ở bản vẽ. Tạo một mục nháp trong hàng đợi từ một câu hỏi ngoài phạm vi.

Không có body.

Response 201 khi tạo mới, trả về object của `GET /editor/queue/{item_id}`:

```json
{
  "item_id": "e_01HR13",
  "title": "Chăm sóc vết mổ tại nhà thế nào cho đúng?",
  "origin": "question_log",
  "topics": [],
  "created_at": "2026-08-13T10:05:00+07:00",
  "status": "draft",
  "content": "",
  "source_url": null,
  "issuer": null,
  "doc_code": null,
  "conditions": [],
  "review_note": null,
  "reject_reason": null,
  "reviewed_at": null,
  "reviewed_by": null
}
```

Mục mới luôn có `origin` bằng `question_log` và `status` bằng `draft`. `title` lấy từ
`question`, cắt còn tối đa 120 ký tự. Mọi trường nội dung để trống — đây mới là cái vỏ, biên
tập viên còn phải soạn.

Log đã có nháp rồi thì trả **200** kèm chính mục nháp đang có, KHÔNG tạo thêm cái thứ hai và
cũng không báo lỗi. Bấm nhầm hai lần là chuyện thường, mà hai bản nháp trùng nhau trong hàng
đợi thì người duyệt phải tự đoán nên xoá cái nào.

404 nếu `log_id` không tồn tại.

---

## 9. Ngoài phạm vi Gate 2

Mục này từng liệt kê hai thứ nằm ngoài hợp đồng v1. **Cả hai nay đã có ở cả hai phía**, giữ
lại dòng gạch để ai đọc bản cũ không hiểu nhầm:

- ~~Lộ trình học và theo dõi tiến độ~~ → đã implement: `GET /learning/daily-lesson`,
  `GET /learning/library`, `POST /learning/complete-lesson/{article_id}`. Đặc tả đầy đủ ở mục 14
- ~~Quiz~~ → đã implement dưới dạng **sinh động bằng LangChain**, đặc tả ở mục 13

### Ba mục từng nằm ngoài phạm vi, nay đã có

Giữ lại danh sách này thay vì xoá đi, để ai đọc bản cũ của tài liệu không hiểu nhầm rằng chúng
vẫn còn nằm ngoài.

- **SSE streaming.** Backend đã implement `POST /api/v1/chat/stream`, xem mục 10. Luồng chính
  của Gate 2 vẫn dùng response một lần qua `POST /chat`
- **Xác thực và phân quyền.** Đã hoạt động thật, không còn chạy trên mock. Backend có
  `POST /auth/login` trả JWT ký HS256 hạn 7 ngày, `POST /auth/logout` trả 204, và kiểm header
  `Authorization` ở gần như mọi endpoint; riêng khu vực biên tập còn chặn thêm theo vai trò
  `editor` đúng như mục 8 quy định. **Nhưng chưa xong hẳn:** vẫn còn endpoint không kiểm token,
  và những endpoint có kiểm token thì không kiểm quyền sở hữu `patient_id` — tài khoản này đọc
  và ghi đè được dữ liệu của tài khoản kia. Hai lỗ hổng đó nêu chi tiết ở điểm 11 mục 12, cần
  backend chốt trước khi coi phần này là hoàn tất
- **Luồng biên tập viên.** Đã đặc tả đầy đủ ở mục 8 của chính tài liệu này, backend đã implement
  đủ tám endpoint của mục đó, frontend đã có bốn màn hình tương ứng

---

## 10. SSE streaming — POST /api/v1/chat/stream

Backend đã implement. Mục này mô tả **những gì endpoint đang thật sự phát ra**, không phải
thiết kế dự kiến. Ba chỗ còn lệch được đánh dấu rõ ở cuối mục.

Thiết kế ban đầu định giữ nguyên `/api/v1/chat` và thêm query param `stream=true`. Backend chọn
một endpoint riêng. Giữ nguyên như vậy, nhưng frontend phải viết một hàm client riêng chứ không
chỉ đổi một tham số.

### Giao thức và request

`Content-Type` của response là `text/event-stream`, khung theo đúng chuẩn SSE:
`event: <tên>\ndata: <json>\n\n`. Payload dùng `ensure_ascii=False` nên tiếng Việt giữ nguyên dấu.

Request nhận **đúng `ChatRequest` của mục 5**: `query`, `patient_id`, `conversation_id`. Không có
query param nào.

**Không dùng được `EventSource` của trình duyệt.** Đây là POST, có body JSON và cần header
`Authorization`, mà `EventSource` chỉ làm được GET và không gắn được header. Client phải đọc bằng
`fetch` cộng `response.body.getReader()` rồi tự tách khung SSE.

Endpoint có kiểm token: thiếu hoặc sai `Authorization` thì trả **401 bình thường**, trước khi
stream mở. Kiểm `response.status` trước khi bắt đầu đọc body.

### Năm loại event

`/api/v1/chat/stream` phát năm loại event. `/api/v1/voice/chat/stream` phát thêm
`transcript` làm event đầu tiên, sau đó giống hệt năm loại dưới đây.

| event | data | Khi nào |
| :-- | :-- | :-- |
| `step` | `{ "node": "hybrid_retrieval", "message": "📚 Đang tìm kiếm tài liệu y tế...", "icon": "📚" }` | Mỗi lần một node của LangGraph bắt đầu chạy |
| `token` | `{ "text": "..." }` | Một khối 80 ký tự của câu trả lời. Xem ghi chú bên dưới |
| `done` | Xem bảng trường ngay dưới đây | Đúng một lần, sau chuỗi `token` |
| `annotations` | `{ "message_id": "m_...", "annotations": [...] }` | Sau `done`, chỉ với câu trả lời có nội dung giáo dục thực sự |
| `error` | `{ "error": "Không tìm thấy hồ sơ bệnh nhân" }` | Hồ sơ không tồn tại, hoặc bất kỳ exception nào |

Trường của event `done`, đủ mười trường:

| Trường | Kiểu | Ghi chú |
| :-- | :-- | :-- |
| `conversation_id` | string | Phiên hội thoại, mở phiên mới thì đây là id vừa sinh |
| `message_id` | string | Id của message trả lời |
| `status` | enum | Một trong năm giá trị ở mục 6 |
| `answer` | string | Toàn văn câu trả lời |
| `citations` | array | Như mục 5. Rỗng với `red_flag`, `refused`, `referral` |
| `support_level` | enum hoặc null | Chỉ khác null khi `status` là `answered` hoặc `partial` |
| `intent` | string | Ý định do `intent_router` xác định |
| `disclaimer` | string | Câu miễn trừ bắt buộc |
| `latency_ms` | int | Tổng thời gian xử lý một lượt |
| `node_timings_ms` | object | Thời gian của từng node, khoá là tên node |

Phần tử của `annotations` có sáu trường: `term`, `start_offset`, `end_offset`,
`short_explanation`, `source_chunk_id`, `source_document_id`. Ba trường vị trí và nội
dung dùng để chèn chú thích thuật ngữ vào đúng chỗ trong `answer`.

Ghi chú về `token`: đây không phải stream token thật của LLM. Toàn bộ graph chạy xong
rồi backend mới cắt câu trả lời thành khối 80 ký tự và phát lần lượt. Cách này giữ cho
người dùng không nhìn thấy bản nháp chưa qua bước kiểm chứng.

Không có `id:`, không có `retry:`, không có event kết thúc kiểu `[DONE]` — stream đóng
sau `annotations` nếu có, còn không thì đóng ngay sau `done`.

CẦN CHỐT — tên trường của event `error`. Hai phương án:

- Giữ `{"error": "..."}` như hiện nay, và ghi nhận đây là ngoại lệ có chủ ý so với
  định dạng `{"detail": "..."}` ở mục 1
- Đổi sang `{"detail": "..."}` cho thống nhất với mọi lỗi HTTP khác, và sửa cả phía
  frontend đang đọc trường `error`

Chưa chọn phương án nào. Hai bên frontend và backend cần thống nhất trước khi sửa, vì
đổi một phía sẽ làm hỏng phía kia.

### Node phát ra ở event `step`

Đủ cả 11 node của graph, tên khớp `src/agent/graph.py`:

`intent_router`, `emergency_handler`, `refuse_handler`, `out_of_domain_handler`,
`profile_handler`, `query_preprocessor`, `hybrid_retrieval`, `generate_and_verify`,
`answer_verifier`, `doctor_referral`, `memory_checkpoint`.

Luôn mở đầu bằng `intent_router` rồi rẽ nhánh. Graph không có vòng lặp quay lui: mọi cạnh
đều đi một chiều tới `END`, nên một node phát `step` nhiều nhất một lần trong một lượt.
Chi tiết các cạnh rẽ nhánh xem `docs/langgraph-v2.md`.

Event `step` chỉ được phát khi phản ánh node thật đang chạy. Không dựng chuỗi trạng thái giả để
làm đẹp giao diện. Backend hiện tuân thủ đúng điều này: `step` bắt từ `on_chain_start` thật của
LangGraph.

### Trạng thái ba điểm từng lệch

**1. Event `done` đủ trường. Đã xong.** Backend gửi đủ mười trường liệt kê ở bảng phía
trên, gồm cả `conversation_id`, `message_id`, `status` và `answer`. Frontend đọc thẳng
`status` để chọn một trong năm khối trạng thái ở mục 6, không phải tự dựng lại phép map
từ `intent`.

Ba điểm phụ cùng nhóm cũng đã xong: `citations` trong `done` được đánh số `id` từ 1 và
marker `[doc_x]` trong `answer` được đổi thành `[n]` tương ứng; `support_level` trả
`null` khi `status` không phải `answered` hoặc `partial`; `disclaimer` luôn có nội dung,
kể cả ở các nhánh từ chối.

**2. Event `token` không phải stream thật. Còn nguyên.** Backend chờ toàn bộ graph chạy
xong rồi mới cắt câu trả lời thành khối 80 ký tự và phát lần lượt, không có độ trễ chèn
giữa các khối.

Đây là lựa chọn có chủ ý theo cam kết an toàn ở `docs/langgraph-v2.md`: chữ chỉ được
phát sau khi qua bước kiểm chứng, để người dùng không nhìn thấy bản nháp chưa qua
routing. Nếu sau này muốn stream thật thì phải giải quyết được yêu cầu đó trước.

**3. Event `error` dùng tên trường `error`. Chưa chốt.** Xem mục CẦN CHỐT ở phần bảng
event phía trên.

Kèm theo: mã HTTP của stream **luôn là 200**, kể cả khi không tìm thấy hồ sơ bệnh nhân — SSE đã mở
thì không đổi status được nữa, nên lỗi đó tới dưới dạng một event. Và nhánh bắt exception chung
đang đưa nguyên văn `str(exc)` của Python ra client; cần thay bằng câu tiếng Việt như mọi endpoint
khác.

---

## 11. Pydantic cho backend

Đoạn dưới dán được thẳng vào `src/models/schemas.py`.

`EmailStr` cần gói `pydantic[email]`. Không muốn thêm phụ thuộc thì đổi thành `str` và tự
kiểm định dạng, nhưng phải kiểm ở đâu đó — đừng bỏ hẳn.

```python
from typing import Literal, Optional
from pydantic import BaseModel, EmailStr, Field


class UserInfo(BaseModel):
    """Thông tin tài khoản, trả kèm trong response đăng nhập."""
    user_id: str
    email: EmailStr
    role: Literal["patient", "editor"]
    # Chỉ có giá trị khi role là "patient". Với editor thì luôn None.
    patient_id: Optional[str] = None


class LoginRequest(BaseModel):
    """Dùng cho request POST /auth/login."""
    email: EmailStr
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    """Dùng cho response 200 của POST /auth/login."""
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserInfo


class PatientProfile(BaseModel):
    """Dùng cho request POST /patients/profile."""

    patient_id: str
    age: int = Field(..., ge=18, le=120)
    primary_condition: Literal["type2_diabetes", "hypertension"]
    comorbidities: list[Literal["type2_diabetes", "hypertension"]] = Field(default_factory=list)
    diagnosed_at: Optional[str] = None
    asking_as: Literal["self", "caregiver"] = "self"
    # Chỉ dùng để chọn tài liệu phù hợp thể trạng. Không được dùng để sinh chỉ
    # tiêu cân nặng, mục tiêu giảm cân hay số calo cụ thể — xem mục 4.
    height_cm: Optional[int] = Field(None, ge=100, le=250)
    weight_kg: Optional[float] = Field(None, ge=25, le=300)


class PatientProfileResponse(PatientProfile):
    """Dùng cho response 200 của POST /patients/profile và GET /patients/{patient_id}/profile."""

    updated_at: str


class Citation(BaseModel):
    id: int = Field(..., ge=1)
    title: str
    issuer: str
    doc_code: Optional[str] = None
    url: Optional[str] = None
    snippet: str = Field(..., max_length=300)


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=5000)
    patient_id: str
    conversation_id: Optional[str] = None


class ResponseMetadata(BaseModel):
    latency_ms: int
    cached: bool


class ChatResponse(BaseModel):
    conversation_id: str
    message_id: str
    status: Literal["answered", "partial", "red_flag", "refused", "referral"]
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    support_level: Optional[Literal["fully", "partially", "no_support"]] = None
    disclaimer: str
    metadata: ResponseMetadata
```

```python
# ---------------------------------------------------------------------------
# Mục 8: Quản trị nội dung. Chỉ vai trò editor được gọi.
# ---------------------------------------------------------------------------

EditorItemStatus = Literal["draft", "pending", "approved", "rejected"]
EditorItemOrigin = Literal["question_log", "editor_upload"]
PatientCondition = Literal["type2_diabetes", "hypertension"]


class EditorDashboard(BaseModel):
    """Response GET /editor/dashboard."""
    pending_count: int = Field(..., ge=0)
    out_of_scope_count: int = Field(..., ge=0)


class EditorQueueItem(BaseModel):
    """Một dòng trong GET /editor/queue."""
    item_id: str
    title: str = Field(..., max_length=120)
    origin: EditorItemOrigin
    topics: list[str] = Field(default_factory=list)
    created_at: str
    status: EditorItemStatus


class EditorQueueList(BaseModel):
    items: list[EditorQueueItem] = Field(default_factory=list)


class EditorQueueItemDetail(EditorQueueItem):
    """Response GET /editor/queue/{item_id}, và của cả approve lẫn reject."""
    content: str = ""
    # Ba trường này thành url / issuer / doc_code của Citation sau khi duyệt.
    source_url: Optional[str] = None
    issuer: Optional[str] = None
    doc_code: Optional[str] = None
    # Rỗng được khi status là "draft", nhưng phải có ít nhất một giá trị
    # trước khi chuyển sang "pending".
    conditions: list[PatientCondition] = Field(default_factory=list)
    review_note: Optional[str] = None
    reject_reason: Optional[str] = None
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None


class EditorApproveRequest(BaseModel):
    """Body POST /editor/queue/{item_id}/approve. Cả hai trường đều tuỳ chọn."""
    content: Optional[str] = None
    note: Optional[str] = None


class EditorRejectRequest(BaseModel):
    """Body POST /editor/queue/{item_id}/reject."""
    reason: str = Field(..., min_length=1)


class OutOfScopeLog(BaseModel):
    """Một dòng trong GET /editor/out-of-scope.

    KHÔNG có patient_id, và cố ý không có. Xem ràng buộc PII ở mục 8: biên tập
    viên đọc log để biết thư viện thiếu chủ đề gì, không phải để biết ai hỏi.
    Thêm bất kỳ trường nào lần ngược được về tài khoản là phá ràng buộc đó.
    """
    log_id: str
    question: str
    ask_count: int = Field(..., ge=1)
    last_asked_at: str
    drafted: bool = False
    drafted_item_id: Optional[str] = None


class OutOfScopeList(BaseModel):
    logs: list[OutOfScopeLog] = Field(default_factory=list)
```

Lưu ý: `ChatRequest` hiện tại trong repo chỉ có `message`. Cần đổi tên trường thành `query`
cho khớp `AgentState.query` trong `ARCHITECTURE.md`.

---

## 12. Điểm cần backend xác nhận

1. **Đã xong.** Tên trường request là `query`. `src/schemas/chat.py` khai
   `query: str = Field(..., min_length=1, max_length=5000)`; không còn trường `message` nào
   trong repo
2. `patient_id` do client sinh hay backend cấp khi tạo hồ sơ
3. Nguồn trích dẫn có bao gồm PubMed không. `ARCHITECTURE.md` mục Design Decisions chọn
   Doctor Referral thay cho web search, nhưng ba sơ đồ vẫn vẽ PubMed API. Nếu có nguồn
   nước ngoài thì `Citation.issuer` cần thêm quy ước phân biệt nguồn trong nước và ngoài nước
4. Có giữ `analysis` trong response không. Hợp đồng này bỏ vì đó là dữ liệu nội bộ,
   không hiển thị cho bệnh nhân
5. **Đã xong ở backend, nhưng giao diện chưa gửi giá trị thứ hai.** Backend dùng `asking_as`
   thật: `src/services/quiz/context.py` và `src/agent/prompts/quiz.py` đổi góc nhìn khi giá
   trị là `caregiver`. Màn hồ sơ hiện luôn gửi `self` bằng một hằng số trong
   `ProfileScreen.tsx`, vì lựa chọn hỏi giúp người nhà đã bỏ khỏi form. Trường vẫn giữ
   nguyên trong hợp đồng để ngày nào giao diện mở lại lựa chọn kia thì không phải đổi gì
6. **Đã xong.** Cơ chế là JWT ký HS256, không dùng session phía máy chủ. Token sống 7 ngày,
   theo `ACCESS_TOKEN_EXPIRE_MINUTES` trong `src/api/v1/auth.py`. Không có refresh token và
   không có endpoint làm mới token, nên khi gặp 401 frontend xoá phiên và đưa người dùng về
   màn đăng nhập kèm thông báo phiên đã hết hạn
7. **Đã implement:** duyệt một `editor_upload` tạo job nền. Trạng thái thật nằm ở `SourceDoc`
   trong `uploads.json`: `pending_review → indexing → approved` hoặc `index_failed`. Chỉ
   `approved` được `Registry.approved()` trả cho RAG. Người duyệt xem tiến độ/lỗi ở hàng đợi
   và dùng `retry-index` khi cần; không có bước reindex riêng hay trạng thái "đã duyệt" giả.
8. Hai trường `height_cm` và `weight_kg` mới thêm ở mục 4. Backend dùng chúng thế nào — chỉ để
   lọc tài liệu theo thể trạng, hay có đưa thẳng vào prompt của agent. Và cần xác nhận rằng
   chúng không dẫn tới việc sinh chỉ tiêu cân nặng, mục tiêu giảm cân hay số calo cụ thể trong
   câu trả lời, vì đó là tư vấn dinh dưỡng cá nhân hoá nằm ngoài phạm vi giáo dục của sản phẩm

Ba điểm dưới đây phát hiện khi ghép frontend với backend thật, không phải câu hỏi thiết kế mà là
lệch đã đo được.

9. **`height_cm` và `weight_kg` đã được implement.** Backend validate, lưu và trả lại hai trường
   này; migration cộng thêm cột cho cơ sở dữ liệu đã tồn tại. Agent chỉ nhận chúng như ngữ cảnh
   thể trạng, không suy ra BMI, calo hay mục tiêu cân nặng.

10. **Marker `[n]` sót lại khi `citations` rỗng.** Với `status` là `red_flag`, `refused` hoặc
    `referral`, backend xoá sạch `citations` nhưng không gỡ marker `[1]`, `[2]` đã chèn vào
    `answer` trước đó. Điều này vi phạm quy tắc hai chiều ở cuối mục 5, và frontend chặn ngay tại
    tầng parse: người dùng thấy khối lỗi thay vì câu trả lời. Ba trạng thái đó lại là ba nhánh dễ
    gặp nhất khi thử tay. Frontend đang có một biện pháp tạm gỡ marker trước khi validate, ghi rõ
    trong `lib/api.ts`; nó sẽ được xoá ngay khi backend sửa. CẦN ĐẠT: gỡ marker khỏi `answer`
    cùng lúc với việc xoá `citations`, để hai trường luôn nhất quán với nhau

11. **Endpoint nào bắt buộc xác thực. Đã xong.** `GET /patients/{patient_id}/profile` có kiểm
    token: `src/api/v1/patients.py` khai `_require_profile_access` và gọi nó ở cả nhánh GET lẫn
    nhánh POST. Danh sách endpoint không cần token gồm đúng bốn cái, ghi ở mục 1.

    Kiểm quyền sở hữu cũng đã có. Tài khoản vai trò `patient` mà `patient_id` trong request khác
    `patient_id` trong token thì nhận 403: `patients.py` chặn ở hồ sơ, `chat.py` chặn ở hai
    endpoint hỏi đáp và lọc thêm theo `Conversation.patient_id` khi nạp lịch sử,
    `voice.py` chặn bằng `_require_patient_access`.

12. **CẦN CHỐT — hành vi của `POST /auth/logout`.** Backend hiện trả 204 và không làm gì với
    token; không có danh sách token bị thu hồi ở đâu trong `src/`. Hai phương án:

    - Giữ nguyên: JWT không trạng thái, đăng xuất chỉ là việc của client, token cũ còn hiệu lực
      tới khi hết hạn. Khi đó sửa mô tả endpoint cho đúng và bỏ chữ "huỷ token phía máy chủ"
    - Thu hồi thật: thêm danh sách token bị chặn ở phía máy chủ, và mọi endpoint phải tra danh
      sách đó trước khi chấp nhận token

    Chưa chọn phương án nào. Đây là quyết định thiết kế, không suy ra được từ code hiện có.

13. **CẦN CHỐT — trường `language` trong response phiên âm giọng nói.** Backend khai
    `language: str = "vi"` trong `src/schemas/voice.py`, tức chấp nhận mọi chuỗi. Frontend khai
    `language: z.literal('vi')` trong `frontend/src/lib/schemas.ts`, tức chỉ chấp nhận đúng
    chuỗi `vi` và sẽ báo lỗi parse với mọi giá trị khác. Hai phương án:

    - Chốt sản phẩm chỉ hỗ trợ tiếng Việt: siết backend thành `Literal["vi"]` cho khớp frontend
    - Để ngỏ khả năng thêm ngôn ngữ: nới frontend thành chuỗi tự do, và bổ sung danh sách giá
      trị hợp lệ vào hợp đồng

    Chưa chọn phương án nào. Cần biết sản phẩm có định hỗ trợ ngôn ngữ khác hay không.


---

## 13. Trắc nghiệm kiến thức — Mini-Quiz Generation

Chặng cuối của vòng lặp Giáo dục: **Học** (Thư viện) → **Hỏi** (Chatbot) → **Đánh giá** (mục này).

Khác hẳn `quiz_data` gắn sẵn trong bảng `articles`. Cái đó là **một** câu tĩnh, sinh một lần lúc
ETL và lộ đáp án ngay trong response. Mục này sinh **động** mỗi lần gọi, bằng LangChain, và giữ
đáp án lại ở server.

### Quy tắc chung của mục này

- Mọi endpoint đều cần `Authorization: Bearer <token>`, vai trò `patient`.
- `patient_id` **không** nằm trong request. Backend lấy từ token, và mọi truy vấn đều lọc theo
  nó — khác với các mục trước, nơi `patient_id` đi trong path và chưa đối chiếu với token
  (xem điểm 11 mục 12).
- **Đáp án đúng không bao giờ đi kèm response của bước sinh đề.** Nó ở lại bảng `quiz_sessions`
  và chỉ xuất hiện trong response của bước nộp bài. Frontend vì thế không thể tự chấm, và đó là
  chủ ý: điểm HP của trắc nghiệm cộng vào cùng sổ với bài học hằng ngày.

### POST /api/v1/quiz

Sinh một bộ trắc nghiệm A/B/C/D. Đây là lời gọi chậm nhất của hệ thống (~3-6s vì có LLM ở giữa).

Request — `source` quyết định lấy ngữ cảnh ở đâu:

```jsonc
{ "source": "article",      "article_id": "a_1A2B3C", "num_questions": 5 }
{ "source": "conversation", "conversation_id": "c_9F8E7D", "num_questions": 5 }
{ "source": "profile",      "num_questions": 5 }
```

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| `source` | có | `article` \| `conversation` \| `profile` \| `mistakes` |
| `article_id` | khi `source = article` | thiếu thì 422 |
| `conversation_id` | khi `source = conversation` | thiếu thì 422 |
| `num_questions` | không | 3-10, mặc định 5 |

Ba nguồn xử lý khác nhau vì mức tin cậy của nội dung khác nhau:

- `article` — dùng thẳng `articles.full_content`. Nội dung này đã qua ETL rồi qua vòng duyệt
  của biên tập viên, nên **không** truy xuất lại ChromaDB: làm vậy chỉ mang về những đoạn khác
  với thứ người bệnh vừa đọc, và đề sẽ hỏi ra ngoài bài học.
- `conversation` — lấy tối đa 8 lượt gần nhất làm chủ đề, rồi truy xuất lại tài liệu gốc từ
  ChromaDB (`top_k = 6`) để ra đề. Lời trợ lý đã qua Self-RAG nhưng vẫn là văn bản do LLM sinh.
- `profile` — **ôn tập tổng hợp trên hành trình học của chính người đó**, không phải ra đề
  chung theo tên bệnh. Ngữ cảnh ghép từ hai nguồn dấu vết hệ thống đã có:

  | Khối trong ngữ cảnh | Lấy từ | Vai trò |
  |---|---|---|
  | `[ĐÃ HỌC n — tiêu đề]` | 4 bài gần nhất trong `patient_progress.completed_articles` | **Nguồn kiến thức duy nhất** để lấy nội dung câu hỏi và đáp án |
  | `[ĐÃ HỎI TRỢ LÝ]` | 10 câu `role="user"` gần nhất trong các `conversations` của họ | **Chỉ dấu** người học chưa chắc ở đâu — dùng để chọn chủ đề, KHÔNG được lấy làm nội dung đáp án |

  Tách vai trò hai khối là chủ ý: câu người bệnh hỏi có thể chứa chính hiểu lầm của họ
  ("uống nước dừa chữa được tiểu đường phải không?"). Lấy nó làm nguồn ra đề là dạy lại
  cái sai mà họ đang mắc.

  Người chưa học và chưa hỏi gì thì lùi về truy vấn theo tên bệnh như trước, và `topic`
  trả về là "Kiến thức nhập môn về ...". `metadata.grounded` là `false` khi người học mới
  chỉ hỏi mà chưa hoàn thành bài nào — lúc đó không có tài liệu đã duyệt nào để đối chiếu.

Response 200:

```json
{
  "quiz_id": "q_A1B2C3",
  "source": "article",
  "topic": "Chế độ ăn cho người tiểu đường típ 2",
  "questions": [
    {
      "index": 0,
      "question": "Vì sao nên chia nhỏ bữa ăn trong ngày?",
      "options": [
        "Giúp đường huyết ổn định hơn",
        "Giúp ăn được nhiều hơn",
        "Giúp giảm tiền chợ",
        "Giúp ngủ ngon hơn"
      ],
      "difficulty": "easy"
    }
  ],
  "disclaimer": "Bài trắc nghiệm mang tính giáo dục, dựa trên tài liệu hướng dẫn của Bộ Y tế. Không thay thế chẩn đoán hay chỉ định của bác sĩ.",
  "citations": [
    {
      "id": 1,
      "title": "Hướng dẫn chẩn đoán và điều trị đái tháo đường típ 2",
      "issuer": "Bộ Y tế Việt Nam",
      "doc_code": "5481/QĐ-BYT",
      "url": null,
      "snippet": "..."
    }
  ],
  "metadata": { "latency_ms": 3210, "cached": false, "grounded": true }
}
```

`metadata.grounded` là `false` khi kho tài liệu không trả về trích đoạn nào và đề chỉ dựa vào
nội dung phiên chat. Frontend phải nói rõ điều đó với người học chứ không im lặng bỏ qua.

`options` **luôn đúng 4 phần tử**, và `index` luôn liền mạch từ 0. Đề do LLM sinh đi qua một
lớp kiểm định thuần luật trước khi ra khỏi backend — nó loại các câu thiếu đáp án, có đáp án
trùng, có `correct_index` trỏ ra ngoài mảng, có đáp án kiểu "Tất cả các đáp án trên", hoặc có
câu hỏi mang tính chẩn đoán/kê đơn. Câu hỏng bị loại chứ không kéo cả bộ đề xuống; chỉ khi số
câu còn lại tụt dưới 3 thì backend mới gọi lại LLM (tối đa 3 lượt).

Mã lỗi:

| Mã | Khi nào |
|---|---|
| 401 | thiếu hoặc sai token |
| 404 | không tìm thấy `article_id`/`conversation_id`, hoặc `source = profile` mà chưa khai hồ sơ |
| 422 | thiếu `article_id`/`conversation_id` theo `source`, hoặc `num_questions` ngoài 3-10 |
| 503 | hết 3 lượt thử mà LLM vẫn không cho ra bộ đề dùng được |

### POST /api/v1/quiz/{quiz_id}/submit

```json
{ "answers": [0, 2, 1, 3, 0] }
```

`answers[i]` là lựa chọn cho câu `index = i`. Dùng `-1` cho câu bỏ trống. Độ dài mảng phải khớp
số câu của đề, lệch thì 422.

Response 200:

```json
{
  "quiz_id": "q_A1B2C3",
  "score": 4,
  "total": 5,
  "passed": true,
  "results": [
    {
      "index": 0,
      "question": "Vì sao nên chia nhỏ bữa ăn trong ngày?",
      "options": ["...", "...", "...", "..."],
      "your_answer": 0,
      "correct_index": 0,
      "is_correct": true,
      "explanation": "Chia nhỏ bữa giúp tránh đường huyết tăng vọt sau ăn."
    }
  ],
  "hp_earned": 20,
  "stats": { "total_score": 130, "current_streak": 3, "completed_articles": ["a_1A2B3C"] }
}
```

**Sai bài vẫn trả 200.** Sai một câu trắc nghiệm ôn tập không phải lỗi giao thức, và người học
cần đọc được `explanation` để học lại — đó mới là điểm của vòng "Đánh giá". Chỗ này cố ý khác
`POST /learning/complete-lesson/{article_id}`, vốn ném 400 khi trả lời sai.

Quy tắc điểm:

- `passed` khi đúng **từ 60% trở lên**.
- `hp_earned` = số câu đúng x **5 HP**, và **chỉ cộng khi `passed`**. Không đạt thì bằng 0.
- HP cộng vào `patient_progress.total_score` — cùng sổ với Thư viện học tập.
- **Không** đụng tới `current_streak` và `last_completed_at`. Chuỗi ngày là phần thưởng cho việc
  học bài hằng ngày, do `complete-lesson` quản. Cho trắc nghiệm cộng streak nữa thì người học
  làm liên tiếp 5 bài trong một buổi cũng lên chuỗi, và con số đó mất hết ý nghĩa.

| Mã | Khi nào |
|---|---|
| 401 | thiếu hoặc sai token |
| 404 | `quiz_id` không tồn tại, hoặc thuộc bệnh nhân khác |
| 409 | đề này đã nộp rồi — mỗi đề chỉ nộp một lần |
| 422 | số đáp án không khớp số câu |

### GET /api/v1/quiz/history

Query param `limit` (1-100, mặc định 20). Trả các lượt làm bài của tài khoản đang đăng nhập,
mới nhất trước.

```json
{
  "items": [
    {
      "quiz_id": "q_A1B2C3",
      "source": "article",
      "topic": "Chế độ ăn cho người tiểu đường típ 2",
      "score": 4,
      "total": 5,
      "created_at": "2026-08-23T14:20:00Z",
      "submitted_at": "2026-08-23T14:23:41Z"
    }
  ]
}
```

`score` và `submitted_at` là `null` với đề đã sinh nhưng người học bỏ dở chưa nộp.

### Bảng `quiz_sessions`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | String | `q_` + 6 ký tự hex hoa |
| `patient_id` | FK -> `patients.id` | có index |
| `source` | String | `article` \| `conversation` \| `profile` |
| `source_ref` | String, nullable | `article_id` hoặc `conversation_id` |
| `topic` | String | |
| `questions` | JSONB | **có** `correct_index` và `explanation` — không rời server trước lúc nộp |
| `citations` | JSONB | |
| `answers` | JSONB, nullable | `null` khi chưa nộp |
| `score` | Integer, nullable | `null` khi chưa nộp |
| `total` | Integer | |
| `hp_earned` | Integer | |
| `created_at` | DateTime | |
| `submitted_at` | DateTime, nullable | |

Không đánh unique lên `source_ref`: cùng một bài học có thể làm lại nhiều lần với bộ câu khác nhau.


### POST /api/v1/quiz với `source: "mistakes"` — ôn lại chỗ chưa nắm

Không cần `article_id` hay `conversation_id`. Backend tự tìm những câu người
đang đăng nhập đã trả lời sai, rồi sinh **đề MỚI** trên cùng các khái niệm đó.

**Cố ý KHÔNG hiện lại nguyên câu cũ.** Cho làm lại đúng câu cũ thì người học nhớ
mặt đáp án chứ chưa chắc đã hiểu bài; ra câu mới mới phân biệt được hai thứ đó.

Nguồn kiến thức lấy lại từ `source_ref` của lượt đã sinh ra câu sai: là
`article_id` thì đọc lại chính bài đó — sai ở đâu ôn lại đúng chỗ ấy. Không có
thì truy xuất ChromaDB theo nội dung các câu đã sai.

404 kèm *"Bạn chưa có câu nào trả lời sai"* khi người học chưa nộp bài nào sai.

### GET /api/v1/quiz/mistakes

Những chỗ người đang đăng nhập chưa nắm, gom nhóm theo nội dung câu hỏi (chuẩn
hoá bỏ dấu và hoa thường trước khi gom). Câu sai nhiều lần đứng trước.

```json
{
  "items": [
    {
      "question": "Bác nên đo đường huyết lúc nào là quan trọng nhất?",
      "options": ["Trước khi ăn sáng", "Sau ăn trưa 2 giờ", "Trước khi ngủ", "Sau tập thể dục"],
      "correct_index": 0,
      "explanation": "Đo lúc đói buổi sáng phản ánh khả năng kiểm soát đường huyết qua đêm.",
      "chosen": [1, 2],
      "times_wrong": 2,
      "topic": "Theo dõi đường huyết tại nhà",
      "quiz_id": "q_A1B2C3"
    }
  ],
  "total_wrong": 5,
  "sessions_scanned": 4
}
```

| Trường | Ý nghĩa |
|---|---|
| `chosen` | Các đáp án người học đã chọn, **mới nhất trước**. Sai cùng một câu theo hai kiểu khác nhau nói lên nhiều hơn là chỉ biết "đã sai" |
| `times_wrong` | Số lần sai câu này, tính cả các lượt khác nhau |
| `total_wrong` | Tổng lượt sai kể cả lặp — khác `len(items)` vốn đã gom nhóm |
| `sessions_scanned` | Số lượt đã nộp mà thống kê dựa vào (quét tối đa 20 lượt gần nhất) |

**Endpoint này CÓ trả `correct_index` và `explanation`** — ngược với `POST /quiz`
vốn giấu đáp án. Không mâu thuẫn: ở đây người học đã nộp bài rồi, và mục đích của
màn ôn lại chính là cho họ thấy đáp án đúng cùng lý do.

Tối đa 15 nhóm mỗi lần gọi. Không có bảng mới — dữ liệu rút thẳng từ
`quiz_sessions.questions` ghép với `quiz_sessions.answers` theo chỉ số.

### Ba tín hiệu, mạnh dần

Ngữ cảnh của `source: "profile"` nay gộp cả ba, và prompt được dặn ưu tiên theo
đúng thứ tự này:

| Tín hiệu | Nghĩa |
|---|---|
| **đã học** | Đã đọc qua |
| **đã hỏi** | Chưa chắc, nên mới hỏi |
| **đã trả lời sai** | Đã kiểm tra và trượt — bằng chứng mạnh nhất |

---

## 14. Lộ trình học tập

Ba endpoint của thư viện bài học. Kiểu dữ liệu dưới đây lấy từ
`src/api/v1/learning.py`, `src/schemas/learning.py` và `frontend/src/lib/schemas.ts`.

### Quy tắc chung của mục này

- Cả ba endpoint đều cần `Authorization: Bearer <token>`
- Không có tham số `patient_id` nào trong path hay body. Backend lấy `patient_id` từ
  token, nên một tài khoản chỉ đọc và ghi được tiến độ của chính mình
- Bản ghi tiến độ được tạo tự động ở lần gọi đầu tiên nếu tài khoản chưa có

### Kiểu dùng chung

`GamificationStats` — số liệu học tập của một tài khoản:

| Trường | Kiểu | Ghi chú |
| :-- | :-- | :-- |
| `total_score` | int | Tổng điểm đã tích |
| `current_streak` | int | Số ngày học liên tiếp |
| `completed_articles` | string[] | Id các bài đã hoàn thành |

`QuizData` — câu hỏi gắn sẵn của một bài học:

| Trường | Kiểu | Bắt buộc | Ghi chú |
| :-- | :-- | :-- | :-- |
| `question` | string | có | |
| `options` | string[] | có | |
| `correct_index` | int | có | Chỉ số của phương án đúng |
| `explanation` | string hoặc null | không | |

`MicroArticle` — một bài học:

| Trường | Kiểu | Bắt buộc | Ghi chú |
| :-- | :-- | :-- | :-- |
| `id` | string | có | |
| `title` | string | có | |
| `content` | string | có | Bản rút gọn, dùng cho thẻ và banner |
| `full_content` | string hoặc null | không | Bản đầy đủ, dạng markdown |
| `category` | string | có | |
| `quiz_data` | QuizData hoặc null | không | |
| `origin_source` | string hoặc null | không | Tên file tài liệu gốc đã biên soạn ra bài này |

### GET /api/v1/learning/daily-lesson

Bài học của hôm nay, chọn theo tiến độ của tài khoản.

Không có tham số.

Response 200:

| Trường | Kiểu | Ghi chú |
| :-- | :-- | :-- |
| `lesson` | MicroArticle hoặc null | `null` khi không còn bài nào để giao |
| `day_number` | int | Số thứ tự chặng của bài học này |
| `stats` | GamificationStats | |

```json
{
  "lesson": {
    "id": "art_htn_01",
    "title": "Tăng huyết áp là gì",
    "content": "Huyết áp là áp lực của máu lên thành động mạch...",
    "full_content": "## Tăng huyết áp là gì\n\nHuyết áp là...",
    "category": "hypertension",
    "quiz_data": {
      "question": "Huyết áp bao nhiêu thì gọi là cao?",
      "options": ["Từ 120/80 trở lên", "Từ 140/90 trở lên", "Từ 160/100 trở lên", "Từ 180/110 trở lên"],
      "correct_index": 1,
      "explanation": "Ngưỡng chẩn đoán tăng huyết áp là 140/90 mmHg."
    },
    "origin_source": "vn-moh-3192-2010-htn.pdf"
  },
  "day_number": 3,
  "stats": { "total_score": 40, "current_streak": 2, "completed_articles": ["art_htn_01"] }
}
```

### GET /api/v1/learning/library

Toàn bộ lộ trình học và danh sách bài đã hoàn thành.

Không có tham số.

Response 200:

| Trường | Kiểu | Ghi chú |
| :-- | :-- | :-- |
| `learning_paths` | LearningPathItem[] | Toàn bộ chặng của lộ trình |
| `completed_articles` | string[] | Id các bài đã hoàn thành |

`LearningPathItem`:

| Trường | Kiểu | Ghi chú |
| :-- | :-- | :-- |
| `day_number` | int | Số thứ tự chặng |
| `disease_category` | string | Bệnh mà chặng này thuộc về |
| `article` | MicroArticle | |

```json
{
  "learning_paths": [
    {
      "day_number": 1,
      "disease_category": "hypertension",
      "article": { "id": "art_htn_01", "title": "Tăng huyết áp là gì", "content": "...", "category": "hypertension" }
    }
  ],
  "completed_articles": ["art_htn_01"]
}
```

Đây cũng là nguồn dữ liệu của màn chi tiết bài học: giao diện đọc danh sách này rồi tìm
bài theo id, không có endpoint riêng cho một bài.

### POST /api/v1/learning/complete-lesson/{article_id}

Chấm câu hỏi gắn sẵn của một bài học, và đánh dấu hoàn thành nếu trả lời đúng.

Request:

| Trường | Kiểu | Bắt buộc | Ghi chú |
| :-- | :-- | :-- | :-- |
| `answer_index` | int | có | Chỉ số phương án người học chọn |

```json
{ "answer_index": 1 }
```

Response 200:

| Trường | Kiểu | Ghi chú |
| :-- | :-- | :-- |
| `is_correct` | bool | |
| `correct_index` | int | Chỉ số phương án đúng |
| `explanation` | string | Lời giải thích, trả về cho cả câu đúng lẫn câu sai |
| `hp_earned` | int | Điểm cộng cho lượt này, bằng 0 khi sai hoặc khi hôm nay đã nhận điểm |
| `stats` | GamificationStats | Số liệu sau khi cập nhật |

```json
{
  "is_correct": false,
  "correct_index": 1,
  "explanation": "Ngưỡng chẩn đoán tăng huyết áp là 140/90 mmHg.",
  "hp_earned": 0,
  "stats": { "total_score": 40, "current_streak": 2, "completed_articles": ["art_htn_01"] }
}
```

Quy tắc mã trả về: trả lời sai vẫn là **200**, không phải 400. Sai thì không đánh dấu
hoàn thành và không cộng điểm, nhưng người học vẫn nhận được đáp án đúng kèm lời giải
thích và làm lại được ngay.

Bài không có `quiz_data` thì đọc xong tính là hoàn thành, mọi `answer_index` đều được
coi là đúng.

Lỗi: 404 khi `article_id` không tồn tại.

### Nguồn dữ liệu của ba endpoint này

Bảng `articles` và `learning_paths` được nạp bằng `scripts/init_db.py`, hoặc bằng
`POST /api/v1/editor/seed-database` gọi lại chính script đó. Khu vực biên tập không có
endpoint nào tạo hay sửa bài học.
