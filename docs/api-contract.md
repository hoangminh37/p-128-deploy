# API Contract - Luồng bệnh nhân

Phiên bản: v1 (Gate 2)
Người soạn: Đức (Frontend)
Trạng thái: đề xuất, chờ backend xác nhận khi review PR

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

Gate 2 có luồng đăng nhập ở frontend, nhưng backend chưa kiểm tra token.
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

---

## 2. Endpoint

| Method | Path | Mục đích |
| :-- | :-- | :-- |
| POST | `/api/v1/auth/login` | Đăng nhập, trả về token và vai trò của tài khoản |
| POST | `/api/v1/auth/logout` | Đăng xuất, huỷ token phía máy chủ |
| POST | `/api/v1/patients/profile` | Tạo hoặc cập nhật hồ sơ bệnh nhân |
| GET | `/api/v1/patients/{patient_id}/profile` | Đọc hồ sơ |
| POST | `/api/v1/chat` | Gửi câu hỏi, nhận câu trả lời |
| POST | `/api/v1/chat/stream` | Cùng câu hỏi, nhận dần bằng SSE. Xem mục 10 |
| GET | `/api/v1/conversations/{patient_id}` | Danh sách phiên hội thoại |
| GET | `/api/v1/conversations/{patient_id}/{conversation_id}` | Chi tiết một phiên |
| GET | `/api/v1/editor/dashboard` | Số liệu tổng quan của biên tập viên |
| GET | `/api/v1/editor/queue` | Danh sách mục chờ duyệt |
| GET | `/api/v1/editor/queue/{item_id}` | Chi tiết một mục chờ duyệt |
| POST | `/api/v1/editor/queue/upload` | Tải tài liệu lên, đưa vào hàng chờ duyệt. **Form data**, không phải JSON |
| POST | `/api/v1/editor/queue/{item_id}/approve` | Duyệt, đưa vào thư viện chính thức |
| POST | `/api/v1/editor/queue/{item_id}/reject` | Từ chối, bắt buộc kèm lý do |
| GET | `/api/v1/editor/out-of-scope` | Câu hỏi thư viện chưa trả lời được |
| POST | `/api/v1/editor/out-of-scope/{log_id}/draft` | Tạo mục nháp từ một câu hỏi |
| GET | `/api/v1/status` | Kiểm tra trạng thái agent, đã có sẵn |

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
| `primary_condition` | enum | có | `type2_diabetes` hoặc `hypertension` |
| `comorbidities` | enum[] | không | Cùng tập giá trị với `primary_condition`, mặc định rỗng |
| `diagnosed_at` | string | không | Định dạng `YYYY-MM` |
| `asking_as` | enum | không | `self` hoặc `caregiver`, mặc định `self`. Người hỏi là chính bệnh nhân hay người chăm sóc. Chỉ ảnh hưởng cách xưng hô trong câu trả lời, không đổi nội dung y khoa |
| `height_cm` | int | không | 100 đến 250. Dùng để agent chọn đúng tài liệu phù hợp thể trạng |
| `weight_kg` | number | không | 25 đến 300. Nên nhập tới một chữ số thập phân — đây là khuyến nghị, không phải ràng buộc validate. Dùng để agent chọn đúng tài liệu phù hợp thể trạng |
| `updated_at` | string | chỉ có trong response | Định dạng ISO 8601 có offset múi giờ |

Hai trường `height_cm` và `weight_kg` chỉ dùng để chọn tài liệu phù hợp thể trạng. Agent KHÔNG
được đưa ra chỉ tiêu cân nặng, mục tiêu giảm cân, hay số calo cụ thể dựa trên hai trường này,
vì đó là tư vấn dinh dưỡng cá nhân hoá — nằm ngoài phạm vi giáo dục của sản phẩm.

Không nhận tên, số điện thoại, số căn cước. Ràng buộc PII trong brief mục 7.4.

Response 200: trả về đúng object vừa lưu, thêm `updated_at` dạng ISO 8601 có offset múi giờ.

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
      "snippet": "Hạn chế lượng natri đưa vào cơ thể, dưới 5 gam muối mỗi ngày."
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

`snippet` là đoạn trích từ tài liệu y khoa đã duyệt trong thư viện, không phải trích từ hồ sơ
hay dữ liệu của bệnh nhân, và backend không được đưa bất kỳ nội dung nào từ hồ sơ bệnh nhân
vào trường này.

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
| | `approved` | Đã duyệt, nội dung nằm trong thư viện chính thức |
| | `rejected` | Bị từ chối, không vào thư viện |
| `origin` | `question_log` | Sinh ra từ một câu hỏi ngoài phạm vi mà bệnh nhân đã hỏi |
| | `editor_upload` | Biên tập viên tự thêm tài liệu, theo FR4.1 |

`origin` là thứ bản vẽ hiển thị ngay dưới tiêu đề mỗi mục ("Từ log câu hỏi" và "Tự thêm"),
nên nó phải là dữ liệu có sẵn ở danh sách, không phải thứ chỉ tra được khi mở chi tiết.

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
| `status` | enum | `draft`, `pending`, `approved`, `rejected` |

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

Ba trường `source_url`, `issuer`, `doc_code` chính là ba trường `url`, `issuer`, `doc_code` của
`Citation` ở mục 5. Duyệt xong thì nội dung này trở thành nguồn mà bệnh nhân nhìn thấy cạnh
câu trả lời, nên thiếu `issuer` là bệnh nhân không biết ai nói câu đó. Bản vẽ Gate 1 lấy ví dụ
một nguồn nước ngoài (`medlineplus.gov`); nếu thư viện thật sự nhận nguồn ngoài nước thì phải
chốt quy ước phân biệt trước, xem mục 12 điểm 3.

`conditions` có thể rỗng ở mục `draft` — lúc mới tạo từ log thì chưa ai gán bệnh. Nhưng phải
có ít nhất một giá trị trước khi chuyển sang `pending`, vì trợ lý chỉ tra tài liệu theo bệnh
trong hồ sơ; nội dung không gắn bệnh nào sẽ không bao giờ được lấy ra.

404 nếu `item_id` không tồn tại.

### POST /api/v1/editor/queue/upload

Biên tập viên tự thêm tài liệu, tức FR4.1. Tài liệu tải lên KHÔNG tự vào thư viện: nó nằm ở
hàng đợi chờ duyệt, và chỉ vào thư viện sau khi có người bấm duyệt ở endpoint bên dưới.

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

Giá trị hợp lệ của `diseases` là id bệnh trong `data/registry.yaml`, hiện đúng bằng tập giá trị
của `primary_condition` ở mục 4: `type2_diabetes` và `hypertension`. Gửi id lạ thì trả 400 kèm
danh sách id đang hỗ trợ — **không** phải tên tiếng Việt như "Tiểu đường".

Response 201, trả về đúng object của `GET /editor/queue/{item_id}`, với `status` bằng `pending`,
`content` rỗng, còn `source_url`, `issuer`, `doc_code`, `conditions` lấy từ chính form vừa gửi.

| Mã | Khi nào |
| :-- | :-- |
| 400 | File rỗng, định dạng không hỗ trợ, `diseases` rỗng, hoặc id bệnh không có trong phạm vi |
| 401 | Chưa đăng nhập |
| 403 | Tài khoản không phải `editor` |
| 422 | Thiếu một trong năm trường bắt buộc |

Tài liệu ở bước này mới chỉ được lưu lại và ghi vào hàng chờ — **chưa parse, chưa cắt chunk,
chưa embed**. Toàn bộ phần nặng đó chạy khi duyệt, xem điểm 7 của mục 12.

### POST /api/v1/editor/queue/{item_id}/approve

Duyệt và đưa vào thư viện chính thức. Cả hai trường trong body đều không bắt buộc.

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

Response 200 trả về đúng object của `GET /editor/queue/{item_id}` sau khi cập nhật: `status`
thành `approved`, `reviewed_at` và `reviewed_by` được điền.

Duyệt một mục đã `approved` hoặc `rejected` trả **409**. Duyệt là hành động một chiều, và một
nút bấm hai lần vì mạng chậm không được phép ghi vào thư viện hai lần.

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

Hai mục sau có trong `ARCHITECTURE.md` nhưng không thuộc hợp đồng v1, và tới nay vẫn chưa có
dòng mã nào ở cả hai phía:

- Lộ trình học và theo dõi tiến độ
- Quiz

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

### Bốn loại event

| event | data | Khi nào |
| :-- | :-- | :-- |
| `step` | `{ "node": "hybrid_retrieval", "message": "📚 Đang tìm kiếm tài liệu y tế...", "icon": "📚" }` | Mỗi lần một node của LangGraph bắt đầu chạy |
| `token` | `{ "text": "Người " }` | Một từ của câu trả lời, đã kèm dấu cách ở cuối |
| `done` | `{ "citations": [...], "support_level": "fully", "intent": "education", "disclaimer": "" }` | Đúng một lần, sau chuỗi `token` |
| `error` | `{ "error": "Không tìm thấy hồ sơ bệnh nhân" }` | Hồ sơ không tồn tại, hoặc bất kỳ exception nào |

Không có `id:`, không có `retry:`, không có event kết thúc kiểu `[DONE]` — stream đóng ngay sau
`done`.

### Node phát ra ở event `step`

Đủ cả 14 node của graph, tên khớp `src/agent/graph.py`:

`intent_router`, `emergency_handler`, `refuse_handler`, `out_of_domain_handler`,
`coref_resolution`, `query_rewrite`, `hybrid_retrieval`, `crag_evaluator`, `doctor_referral`,
`llm_generate`, `selfrag_verifier`, `partial_rewrite`, `safety_disclaimer`, `memory_checkpoint`.

Luôn mở đầu bằng `intent_router` rồi rẽ nhánh. `partial_rewrite` có vòng lặp quay lại
`hybrid_retrieval` tối đa 2 lần, nên **cùng một node phát `step` nhiều lần là chuyện bình thường**
— giao diện không được giả định mỗi node xuất hiện đúng một lần.

Event `step` chỉ được phát khi phản ánh node thật đang chạy. Không dựng chuỗi trạng thái giả để
làm đẹp giao diện. Backend hiện tuân thủ đúng điều này: `step` bắt từ `on_chain_start` thật của
LangGraph.

### Ba điểm CHƯA KHỚP HỢP ĐỒNG

Ba điểm dưới đây là việc backend cần sửa, không phải mô tả trạng thái mong muốn.

**1. Event `done` thiếu bốn trường.** Hiện chỉ có `citations`, `support_level`, `intent`,
`disclaimer`.

CẦN ĐẠT: `done` mang **nguyên vẹn body của `POST /chat`** như mục 5 định nghĩa, tức thêm
`conversation_id`, `message_id`, `status`, `answer`. Backend đã có sẵn toàn bộ đoạn dựng
`ChatResponse` ở nhánh đồng bộ, dùng lại là đủ.

Vì sao bắt buộc, không phải cho gọn:

- Thiếu `status` thì frontend **không phân biệt được năm trạng thái ở mục 6**. Nó buộc phải tự
  dựng lại phép map từ `intent` và `support_level`, tức nhân bản logic nghiệp vụ sang client.
- Tệ hơn, phép map đó vẫn không đủ: nhánh `red_flag` được quyết bởi cờ `is_red_flag` chứ không
  phải `intent`, mà cờ đó **không có trong `done`**. Nghĩa là nhánh nguy hiểm nhất — cái duy nhất
  cần banner đỏ và nút gọi 115 — không phát hiện được từ stream.
- Thiếu `conversation_id` thì client không biết vừa nói chuyện trong phiên nào: không nối được
  lượt sau, không mở lại được từ lịch sử ở mục 7. Backend có sinh id và có lưu vào DB, chỉ là
  không gửi ra.

Hai điểm phụ cùng nhóm: `citations` trong `done` là dữ liệu thô của agent, **chưa qua chuẩn hoá**
như nhánh đồng bộ (đánh số `id` từ 1, cắt `snippet` còn 300 ký tự, đổi marker `[doc_x]` thành
`[n]`), nên chưa khớp cấu trúc `Citation` ở mục 5. Và `support_level` mặc định về `"fully"` khi
agent không đặt, khiến ba nhánh không chạy qua Self-RAG bị báo sai — mục 5 quy định `null`. Kéo
theo `disclaimer` thành chuỗi rỗng ở đúng những nhánh từ chối, trong khi mục 5 ghi disclaimer
"luôn có, kể cả khi từ chối" theo ràng buộc brief mục 7.5.

**2. Event `token` không phải stream thật.** Backend chờ agent chạy xong hoàn toàn, rồi mới lấy
câu trả lời cuối cùng, cắt theo dấu cách và phát từng từ cách nhau 25ms. Người dùng vẫn chờ đủ
thời gian của agent, sau đó còn chờ thêm phần phát lại — một câu trả lời 300 từ tốn thêm khoảng
7,5 giây sau khi nội dung đã sẵn sàng.

CẦN ĐẠT: `token` phát ra trong lúc LLM đang sinh chữ, tức nối vào `on_chat_model_stream` của
LangGraph. Chỗ nối đã có sẵn trong mã nhưng đang bỏ trống. Nếu chưa làm được thì thà bỏ hẳn
`token` và để client hiện câu trả lời một lần ở `done`, còn hơn thêm độ trễ giả rồi gọi nó là
streaming.

**3. Event `error` dùng sai tên trường.** Backend gửi `{ "error": "..." }`.

CẦN ĐẠT: `{ "detail": "..." }`, khớp định dạng lỗi chung ở mục 1 và khớp mặc định của FastAPI.
Một tên trường cho mọi lỗi thì client mới có một đường xử lý lỗi duy nhất.

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

1. Tên trường request là `query` hay giữ `message`. Hợp đồng này chọn `query` theo `AgentState`
2. `patient_id` do client sinh hay backend cấp khi tạo hồ sơ
3. Nguồn trích dẫn có bao gồm PubMed không. `ARCHITECTURE.md` mục Design Decisions chọn
   Doctor Referral thay cho web search, nhưng ba sơ đồ vẫn vẽ PubMed API. Nếu có nguồn
   nước ngoài thì `Citation.issuer` cần thêm quy ước phân biệt nguồn trong nước và ngoài nước
4. Có giữ `analysis` trong response không. Hợp đồng này bỏ vì đó là dữ liệu nội bộ,
   không hiển thị cho bệnh nhân
5. Trường `asking_as` mới thêm ở mục 4. Backend cần dùng nó để đổi cách xưng hô trong câu
   trả lời: `self` thì xưng với chính người bệnh, `caregiver` thì xưng với người chăm sóc.
   Cần backend xác nhận việc này có ảnh hưởng gì tới prompt của agent không
6. Cơ chế xác thực ở mục 3 dùng JWT hay session phía máy chủ. Nếu JWT thì token sống bao lâu,
   và có refresh token không. Ba câu này quyết định frontend phải làm gì khi token hết hạn:
   im lặng xin token mới, hay đá người dùng về màn đăng nhập giữa lúc đang đọc câu trả lời
7. Duyệt một mục ở mục 8 thì ghi vào vector store bằng cách nào. Cụ thể: chunking và embedding
   chạy ngay trong request `approve` rồi mới trả 200, hay đẩy vào hàng đợi nền và trả 200 trước.
   Và có cần một bước reindex riêng nữa không, hay ghi thêm là dùng được luôn.

   Câu trả lời quyết định frontend hiện gì sau khi bấm Duyệt. Nếu ghi đồng bộ thì báo "đã vào
   thư viện" là đúng. Nếu chạy nền thì phải báo "đang xử lý, vài phút nữa trợ lý mới dùng
   được" — nói sai chỗ này thì biên tập viên tưởng nội dung đã sống, đi kiểm tra bằng cách hỏi
   trợ lý, thấy vẫn trả `referral`, và kết luận là hệ thống hỏng
8. Hai trường `height_cm` và `weight_kg` mới thêm ở mục 4. Backend dùng chúng thế nào — chỉ để
   lọc tài liệu theo thể trạng, hay có đưa thẳng vào prompt của agent. Và cần xác nhận rằng
   chúng không dẫn tới việc sinh chỉ tiêu cân nặng, mục tiêu giảm cân hay số calo cụ thể trong
   câu trả lời, vì đó là tư vấn dinh dưỡng cá nhân hoá nằm ngoài phạm vi giáo dục của sản phẩm

Ba điểm dưới đây phát hiện khi ghép frontend với backend thật, không phải câu hỏi thiết kế mà là
lệch đã đo được.

9. **`height_cm` và `weight_kg` chưa được implement.** Hai trường này có trong mục 4 và trong
   khối Pydantic ở mục 11, nhưng backend chưa nhận, chưa lưu, chưa trả: model `PatientProfile`
   không khai chúng và bảng `patients` không có cột tương ứng. Pydantic bỏ qua field lạ nên POST
   vẫn trả 200 — hai số bị nuốt lặng lẽ, người dùng khai xong mở lại thấy ô trống. Frontend vẫn
   gửi đúng hợp đồng và để hai trường ở dạng không bắt buộc, nên khi backend bổ sung thì không
   phải sửa gì phía client. Cần backend xác nhận có làm ở Gate này không, hay bỏ hai trường khỏi
   hợp đồng

10. **Marker `[n]` sót lại khi `citations` rỗng.** Với `status` là `red_flag`, `refused` hoặc
    `referral`, backend xoá sạch `citations` nhưng không gỡ marker `[1]`, `[2]` đã chèn vào
    `answer` trước đó. Điều này vi phạm quy tắc hai chiều ở cuối mục 5, và frontend chặn ngay tại
    tầng parse: người dùng thấy khối lỗi thay vì câu trả lời. Ba trạng thái đó lại là ba nhánh dễ
    gặp nhất khi thử tay. Frontend đang có một biện pháp tạm gỡ marker trước khi validate, ghi rõ
    trong `lib/api.ts`; nó sẽ được xoá ngay khi backend sửa. CẦN ĐẠT: gỡ marker khỏi `answer`
    cùng lúc với việc xoá `citations`, để hai trường luôn nhất quán với nhau

11. **Endpoint nào bắt buộc xác thực.** Mục 1 nói 401 khi chưa đăng nhập, mục 3 nói mọi kiểm tra
    quyền nằm ở backend, nhưng hiện `GET /patients/{patient_id}/profile` không kiểm token — ai
    cũng đọc được hồ sơ bất kỳ nếu biết `patient_id`. Các endpoint còn lại đều có kiểm. Ngoài ra
    những endpoint có kiểm token vẫn **không kiểm quyền sở hữu**: `patient_id` lấy thẳng từ path
    hoặc body mà không đối chiếu với tài khoản đang đăng nhập, nên tài khoản A đọc và ghi đè được
    hồ sơ lẫn lịch sử hội thoại của tài khoản B. Cần backend chốt danh sách endpoint bắt buộc xác
    thực, và chốt luôn rằng `patient_id` trong request phải khớp tài khoản trong token
