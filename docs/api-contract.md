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

Gate 2 chưa bật xác thực. Backend không kiểm tra token.
Frontend vẫn gửi sẵn header sau để khi bật JWT không phải sửa lại client:

```
Authorization: Bearer <token>
```

### Lỗi

Dùng định dạng lỗi mặc định của FastAPI:

```json
{ "detail": "Mô tả lỗi" }
```

| Mã | Khi nào |
| :-- | :-- |
| 400 | Payload sai định dạng |
| 404 | Không tìm thấy `patient_id` hoặc `conversation_id` |
| 422 | Validation của Pydantic không qua |
| 500 | Lỗi phía agent hoặc LLM |
| 503 | LLM provider không phản hồi |

---

## 2. Endpoint

| Method | Path | Mục đích |
| :-- | :-- | :-- |
| POST | `/api/v1/patients/profile` | Tạo hoặc cập nhật hồ sơ bệnh nhân |
| GET | `/api/v1/patients/{patient_id}/profile` | Đọc hồ sơ |
| POST | `/api/v1/chat` | Gửi câu hỏi, nhận câu trả lời |
| GET | `/api/v1/conversations/{patient_id}` | Danh sách phiên hội thoại |
| GET | `/api/v1/conversations/{patient_id}/{conversation_id}` | Chi tiết một phiên |
| GET | `/api/v1/status` | Kiểm tra trạng thái agent, đã có sẵn |

---

## 3. Hồ sơ bệnh nhân

### POST /api/v1/patients/profile

Request:

```json
{
  "patient_id": "p_01HQZX",
  "age": 58,
  "primary_condition": "hypertension",
  "comorbidities": ["type2_diabetes"],
  "diagnosed_at": "2026-03",
  "asking_as": "self"
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
| `updated_at` | string | chỉ có trong response | Định dạng ISO 8601 có offset múi giờ |

Không nhận tên, số điện thoại, số căn cước. Ràng buộc PII trong brief mục 7.4.

Response 200: trả về đúng object vừa lưu, thêm `updated_at` dạng ISO 8601 có offset múi giờ.

### GET /api/v1/patients/{patient_id}/profile

Response 200: cùng cấu trúc trên. Response 404 nếu chưa có hồ sơ.

---

## 4. Hỏi đáp

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
| `status` | enum | Xem mục 5. Quyết định cách hiển thị |
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

## 5. Năm trạng thái

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

## 6. Lịch sử hội thoại

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

## 7. Ngoài phạm vi Gate 2

Các mục sau có trong `ARCHITECTURE.md` nhưng không thuộc hợp đồng v1:

- SSE streaming. Gate 2 dùng response một lần. Xem mục 8 để biết hướng mở rộng
- JWT authentication. Header đã đặt sẵn nhưng backend chưa kiểm tra
- Toàn bộ luồng biên tập viên
- Lộ trình học và theo dõi tiến độ
- Quiz

---

## 8. Hướng mở rộng SSE

Khi backend làm SSE, giữ nguyên endpoint `/api/v1/chat` và thêm query param `stream=true`.
Frontend đã tách riêng lớp api client nên chỉ cần đổi ở một chỗ.

Event dự kiến:

| event | data | Ý nghĩa |
| :-- | :-- | :-- |
| `status` | `{ "node": "hybrid_retrieval" }` | Tên node LangGraph đang chạy |
| `token` | `{ "text": "..." }` | Một mẩu câu trả lời |
| `citation` | Citation | Một nguồn được thêm vào |
| `done` | ChatResponse đầy đủ | Kết thúc, gửi lại toàn bộ để client đối chiếu |
| `error` | `{ "detail": "..." }` | Lỗi giữa chừng |

Event `status` chỉ được phát khi phản ánh node thật đang chạy.
Không dựng chuỗi trạng thái giả để làm đẹp giao diện.

---

## 9. Pydantic cho backend

Đoạn dưới dán được thẳng vào `src/models/schemas.py`.

```python
from typing import Literal, Optional
from pydantic import BaseModel, Field


class PatientProfile(BaseModel):
    """Dùng cho request POST /patients/profile."""

    patient_id: str
    age: int = Field(..., ge=18, le=120)
    primary_condition: Literal["type2_diabetes", "hypertension"]
    comorbidities: list[Literal["type2_diabetes", "hypertension"]] = Field(default_factory=list)
    diagnosed_at: Optional[str] = None
    asking_as: Literal["self", "caregiver"] = "self"


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

Lưu ý: `ChatRequest` hiện tại trong repo chỉ có `message`. Cần đổi tên trường thành `query`
cho khớp `AgentState.query` trong `ARCHITECTURE.md`.

---

## 10. Điểm cần backend xác nhận

1. Tên trường request là `query` hay giữ `message`. Hợp đồng này chọn `query` theo `AgentState`
2. `patient_id` do client sinh hay backend cấp khi tạo hồ sơ
3. Nguồn trích dẫn có bao gồm PubMed không. `ARCHITECTURE.md` mục Design Decisions chọn
   Doctor Referral thay cho web search, nhưng ba sơ đồ vẫn vẽ PubMed API. Nếu có nguồn
   nước ngoài thì `Citation.issuer` cần thêm quy ước phân biệt nguồn trong nước và ngoài nước
4. Có giữ `analysis` trong response không. Hợp đồng này bỏ vì đó là dữ liệu nội bộ,
   không hiển thị cho bệnh nhân
5. Trường `asking_as` mới thêm ở mục 3. Backend cần dùng nó để đổi cách xưng hô trong câu
   trả lời: `self` thì xưng với chính người bệnh, `caregiver` thì xưng với người chăm sóc.
   Cần backend xác nhận việc này có ảnh hưởng gì tới prompt của agent không
