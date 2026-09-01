# EduHealth AI — Trợ lý Giáo dục Sức khỏe cho người bệnh mãn tính

Đây là một trợ lý hỏi đáp bằng tiếng Việt, giúp người đã được bác sĩ chẩn đoán
bệnh mạn tính hiểu đúng về bệnh của mình: ăn uống thế nào, vận động ra sao, các
chỉ số nghĩa là gì. Thư viện seed hiện tập trung vào đái tháo đường típ 2 và tăng
huyết áp; BTV có thể mở rộng danh mục bằng quy trình tài liệu–duyệt–index. Mọi
câu trả lời đều lấy từ tài liệu y khoa đã được duyệt và luôn kèm nguồn trích dẫn.

Hệ thống phục vụ ba nhóm người dùng:

- Người bệnh và người nhà chăm sóc, chủ yếu trong độ tuổi 45 đến 70, đọc trên điện thoại.
- Biên tập viên y khoa, người nạp tài liệu nguồn vào thư viện và duyệt trước khi tài liệu
  được dùng để trả lời; đồng thời quản lý hồ sơ bác sĩ và phản hồi các câu hỏi thư viện
  chưa trả lời được.
- Bác sĩ tư vấn, có hồ sơ công khai để người bệnh lựa chọn, rồi nhắn tin hoặc gọi video
  trong một phiên tư vấn riêng.

Trợ lý này không chẩn đoán, không kê đơn, không chỉnh liều thuốc.

## 1. Vấn đề và giải pháp

Vấn đề: người mới được chẩn đoán bệnh mãn tính cần rất nhiều kiến thức tự chăm sóc,
nhưng nguồn tin trên mạng thì lẫn lộn. Các chatbot phổ thông trả lời trôi chảy nhưng
không dẫn nguồn, không biết hồ sơ bệnh của người hỏi, và dễ trượt sang đưa lời khuyên
điều trị.

Giải pháp: một trợ lý chỉ trả lời dựa trên thư viện tài liệu chính thống đã được biên
tập viên duyệt, cá nhân hoá theo hồ sơ bệnh, và có nhiều lớp chặn an toàn.

- Truy xuất có nguồn: mỗi câu trả lời gắn với đoạn tài liệu cụ thể, người đọc bấm vào
  xem được đúng đoạn được trích trong tài liệu gốc.
- Cá nhân hoá: agent đọc hồ sơ bệnh nhân là tuổi, bệnh chính, bệnh đồng mắc để chọn
  nội dung phù hợp.
- Chặn an toàn: phát hiện dấu hiệu nguy cấp và hướng dẫn gọi cấp cứu, từ chối chẩn đoán
  và kê đơn, từ chối yêu cầu can thiệp vào prompt hệ thống.
- Tự kiểm tra: một node riêng chấm lại câu trả lời xem có bám tài liệu không; nếu không
  đủ căn cứ thì chuyển sang khuyên đi khám thay vì trả lời bừa.
- Vòng phản hồi nội dung: khi retrieval đã chạy nhưng evidence chưa đủ, câu hỏi được tạo
  thành yêu cầu phản hồi riêng cho BTV; bệnh nhân nhận thông báo khi có phản hồi. BTV vẫn
  phải nạp tài liệu đã duyệt nếu muốn mở rộng tri thức dùng chung của RAG.

## 2. Tính năng chính

Hệ thống có các màn hình được chia theo vai trò. Nguồn đối chiếu là bảng route trong
`frontend/src/App.tsx`.

### Màn hình chung

| Đường dẫn | Màn hình         | Nội dung                                                                        |
| :-------- | :--------------- | :------------------------------------------------------------------------------ |
| `/`       | Trang giới thiệu | Giới thiệu sản phẩm khi chưa đăng nhập, đã đăng nhập thì tự chuyển theo vai trò |
| `/login`  | Đăng nhập        | Đăng nhập bằng email và mật khẩu, nhận JWT                                      |

### Dành cho người bệnh

| Đường dẫn               | Màn hình          | Nội dung                                                                                                         |
| :---------------------- | :---------------- | :--------------------------------------------------------------------------------------------------------------- |
| `/profile`              | Hồ sơ bệnh nhân   | Khai tuổi, bệnh đã được chẩn đoán, thời điểm chẩn đoán, chiều cao, cân nặng                                      |
| `/chat`                 | Hỏi đáp           | Đặt câu hỏi mới, xem tiến trình xử lý của agent, trả lời có trích dẫn và chú thích thuật ngữ, hỏi bằng giọng nói |
| `/chat/:conversationId` | Hỏi đáp, phiên cũ | Mở lại một cuộc hội thoại đã lưu                                                                                 |
| `/sources/:documentId`  | Tài liệu nguồn    | Xem tài liệu gốc, đoạn được trích dẫn được đánh dấu nổi bật                                                      |
| `/learning`             | Thư viện bài học  | Lộ trình học theo chặng, bài học hôm nay, xem chặng nào đã hoàn thành                                            |
| `/learning/:articleId`  | Chi tiết bài học  | Đọc một bài và làm khối ôn tập nhanh hai câu soạn từ chính bài đó                                                |
| `/quiz`                 | Trắc nghiệm       | Sinh bộ câu hỏi từ bài học, cuộc hội thoại, hồ sơ học tập hoặc câu đã sai; nộp bài và xem điểm                   |
| `/quiz/mistakes`        | Câu đã sai        | Xem lại những câu từng trả lời sai để học lại                                                                    |
| `/consultations`        | Tư vấn với bác sĩ | Chọn bác sĩ, tạo và theo dõi các phiên tư vấn của mình                                                           |
| `/consultations/doctors/:doctorId` | Hồ sơ bác sĩ | Xem chuyên môn, trạng thái và thông tin công khai trước khi tạo phiên                                           |
| `/consultations/:id`    | Phòng tư vấn      | Nhắn tin trực tiếp; khởi tạo và tham gia cuộc gọi video trong phiên                                              |

### Dành cho biên tập viên

| Đường dẫn                       | Màn hình                  | Nội dung                                                                 |
| :------------------------------ | :------------------------ | :----------------------------------------------------------------------- |
| `/editor`                       | Bảng tổng quan            | Số liệu tổng hợp về tài liệu và hàng chờ duyệt                           |
| `/editor/upload`                | Tải tài liệu              | Nạp tài liệu mới vào hàng chờ                                            |
| `/editor/documents`             | Danh sách tài liệu nguồn  | Toàn bộ tài liệu đang có trong thư viện, kèm trạng thái                  |
| `/editor/documents/:documentId` | Xem file tài liệu         | Mở toàn văn bản gốc, dạng PDF hoặc Markdown, cho cả nguồn hệ thống lẫn nguồn tải lên |
| `/editor/queue`                 | Hàng chờ duyệt            | Lọc theo trạng thái, xem tài liệu đang chờ xử lý                         |
| `/editor/queue/:itemId`         | Chi tiết mục chờ duyệt    | Duyệt, từ chối, hoặc chạy lại bước lập chỉ mục khi lỗi                   |
| `/editor/out-of-scope`          | Câu hỏi chưa trả lời được | Danh sách câu hỏi thư viện chưa đủ tài liệu, tạo bản nháp tài liệu từ đó |
| `/editor/conditions`            | Danh mục bệnh              | Quản lý bệnh áp dụng cho tài liệu và hồ sơ                                                  |
| `/editor/doctors`               | Quản lý bác sĩ             | Tạo, duyệt trạng thái hoạt động và cập nhật hồ sơ công khai bác sĩ                           |
| `/editor/patient-questions`     | Yêu cầu phản hồi           | Trả lời riêng các câu hỏi thiếu evidence và gửi thông báo cho đúng bệnh nhân                 |

### Dành cho bác sĩ

| Đường dẫn | Màn hình | Nội dung |
| :-- | :-- | :-- |
| `/doctor` | Tổng quan | Tóm tắt các phiên tư vấn và việc cần xử lý |
| `/doctor/notifications` | Thông báo | Yêu cầu tư vấn và tin nhắn mới của bệnh nhân |
| `/doctor/consultations` | Các phiên tư vấn | Nhận, theo dõi và mở các phiên đã được gán |
| `/doctor/consultations/:id` | Phòng tư vấn | Nhắn tin và gọi video với bệnh nhân trong phiên |
| `/doctor/profile` | Hồ sơ của tôi | Cập nhật thông tin chuyên môn hiển thị cho bệnh nhân |

Nguồn nội dung của hai màn thư viện học tập: các bài học và lộ trình được nạp bằng
`scripts/init_db.py`, hoặc bằng `POST /api/v1/editor/seed-database` gọi lại chính
script đó. Khu vực biên tập chưa có màn tạo hay sửa bài học.

## 3. Kiến trúc

```mermaid
graph TD
    Browser["Trình duyệt"]
    FE["Frontend React 19 và Vite<br/>cổng 5180"]
    API["FastAPI<br/>cổng 8000, tiền tố /api/v1"]
    Agent["LangGraph agent v2<br/>11 node, có nhánh an toàn"]
    RAG["Tầng RAG src/rag<br/>parse, chunk, embed, truy xuất"]
    Vector[("VectorStore<br/>Chroma local / pgvector Postgres")]
    DB[("SQLite dev / PostgreSQL production<br/>người dùng, hồ sơ, chat, nội dung, tư vấn")]
    Groq["Groq API<br/>sinh câu trả lời, phân loại ý định"]
    Cohere["Cohere API<br/>embed-multilingual-v3.0"]
    OpenAI["OpenAI API<br/>nhận dạng giọng nói và đọc câu trả lời"]

    Browser --> FE
    FE -->|"HTTP và SSE qua proxy /api"| API
    API --> Agent
    API --> DB
    API --> OpenAI
    Agent --> RAG
    Agent --> DB
    Agent --> Groq
    RAG --> Vector
    RAG --> Cohere
```

Luồng một câu hỏi: trình duyệt gửi câu hỏi tới FastAPI, FastAPI gọi agent LangGraph.
Node đầu tiên phân loại ý định và cờ nguy cấp. Nếu là dấu hiệu nguy cấp, yêu cầu chẩn
đoán, hoặc câu ngoài phạm vi thì agent dừng ngay ở nhánh an toàn, không chạm tới truy
xuất và không tốn lượt LLM chất lượng cao. Nếu là câu hỏi kiến thức thật thì agent viết
lại truy vấn, truy xuất tài liệu từ `VectorStore` (Chroma khi chạy local, pgvector khi
chạy PostgreSQL), sinh câu trả lời, rồi để một node kiểm tra
lại mức độ bám tài liệu trước khi lưu vào lịch sử hội thoại. Không tìm được tài liệu phù
hợp thì agent chuyển sang khuyên đi khám.

Chi tiết từng node và các cạnh rẽ nhánh xem `docs/langgraph-v2.md`.

## 4. Công nghệ sử dụng

Phiên bản ghi ở đây lấy đúng từ `requirements.txt` và `frontend/package.json`.

### Backend

| Thành phần                      | Gói                                            | Phiên bản                   |
| :------------------------------ | :--------------------------------------------- | :-------------------------- |
| Ngôn ngữ                        | Python                                         | 3.11                        |
| Web framework                   | fastapi                                        | >=0.115.0                   |
| Server                          | uvicorn[standard]                              | >=0.34.0                    |
| Validate dữ liệu                | pydantic                                       | >=2.10.0                    |
| Cấu hình                        | pydantic-settings                              | >=2.7.0                     |
| Xác thực                        | PyJWT                                          | >=2.8.0                     |
| Nhận file tải lên               | python-multipart                               | >=0.0.9                     |
| Điều phối agent                 | langgraph                                      | >=0.2.0                     |
| Khung LLM                       | langchain, langchain-core, langchain-community | >=0.3.0                     |
| Kết nối LLM                     | langchain-groq, langchain-openai               | >=0.3.0                     |
| ORM                             | sqlalchemy                                     | >=2.0.0                     |
| Migration                       | alembic                                        | >=1.14.0                    |
| Driver Postgres                 | asyncpg, psycopg2-binary                       | >=0.29.0, >=2.9.0           |
| Driver SQLite                   | aiosqlite                                      | >=0.20.0                    |
| Vector store                    | chromadb, pgvector                             | >=1.5.0, >=0.3.0            |
| Embedding mặc định              | cohere                                         | >=5.13.0                    |
| Embedding thay thế và giọng nói | openai                                         | >=1.60.0                    |
| Đếm token khi cắt chunk         | tiktoken                                       | >=0.8.0                     |
| Đọc registry tài liệu           | PyYAML                                         | >=6.0                       |
| Lint và format                  | ruff                                           | >=0.8.0                     |
| Test                            | pytest, pytest-asyncio, httpx                  | >=8.0.0, >=0.24.0, >=0.28.0 |
| Đánh giá agent                  | ragas, datasets                                | >=0.1.0, >=2.16.0           |

Các gói nặng chỉ cần khi nạp tài liệu mới, ví dụ Docling và sentence-transformers, nằm
riêng ở `requirements-rag.txt`.

### Frontend

| Thành phần              | Gói                                                                              | Phiên bản        |
| :---------------------- | :------------------------------------------------------------------------------- | :--------------- |
| Thư viện giao diện      | react, react-dom                                                                 | ^19.2.8          |
| Bundler và dev server   | vite                                                                             | ^8.2.0           |
| Ngôn ngữ                | typescript                                                                       | ~6.0.2           |
| CSS                     | tailwindcss, @tailwindcss/vite                                                   | ^4.3.3           |
| Điều hướng              | react-router-dom                                                                 | ^7.18.2          |
| Gọi API và cache        | @tanstack/react-query                                                            | ^5.101.4         |
| Form                    | react-hook-form, @hookform/resolvers                                             | ^7.85.0, ^5.7.1  |
| Kiểm tra dữ liệu API    | zod                                                                              | ^4.4.3           |
| Hiển thị markdown       | react-markdown, remark-gfm                                                       | ^10.1.0, ^4.0.1  |
| Font                    | @fontsource-variable/lora, @fontsource/be-vietnam-pro, @fontsource/ibm-plex-mono | ^5.3.0           |
| Giả lập backend khi dev | msw                                                                              | ^2.15.0          |
| Lint                    | eslint, typescript-eslint                                                        | ^10.8.0, ^8.65.0 |

## 5. Cài đặt và chạy trên máy

### 5.1. Yêu cầu

- Python 3.11 trở lên. CI dùng đúng 3.11.
- Node.js `^20.19.0` hoặc `>=22.12.0`. Đây là yêu cầu của Vite 8. CI dùng Node 20.
- PostgreSQL, chạy bằng Docker hoặc cài sẵn trên máy. Khi phát triển có thể dùng SQLite.

### 5.2. Lấy mã nguồn và tạo file cấu hình

```bash
git clone https://github.com/AI20K-Build-Phase-Cohort-3/P-128.git
cd P-128
cp .env.example .env
```

Các biến bắt buộc phải điền trong `.env`:

| Biến                 | Dùng để làm gì                                                                                                                       |
| :------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| `COHERE_API_KEY`     | Embedding `embed-multilingual-v3.0`, mặc định của tầng RAG. Lấy khoá miễn phí ở dashboard Cohere                                     |
| `GROQ_API_KEY`       | Model sinh câu trả lời, khớp với `LLM_PROVIDER=groq`                                                                                 |
| `OPENAI_API_KEY`     | Nhận dạng giọng nói, đọc câu trả lời, và là phương án embedding thay thế                                                             |
| `DATABASE_URL`       | Chuỗi kết nối cơ sở dữ liệu. Với `docker compose` mặc định là `postgresql://medical_user:medical_password@localhost:5432/medical_db` |
| `CHROMA_PERSIST_DIR` | Thư mục lưu Chroma khi chạy local/SQLite, mặc định `./data/vectorstore`. Khi `DATABASE_URL` là PostgreSQL, chunks dùng pgvector. |
| `WEBRTC_ICE_SERVERS` | JSON cấu hình STUN/TURN cho cuộc gọi tư vấn. Có thể để trống khi chỉ thử cùng mạng/localhost; production nên có TURN. |
| `CORS_ORIGINS`       | Phải khớp cổng frontend, mặc định `http://localhost:5180`                                                                            |

Các biến nên đặt nhưng không bắt buộc: `MODEL_NAME` và `LLM_PROVIDER` để chọn model,
`OPENROUTER_API_KEY` nếu muốn đổi nhà cung cấp LLM, và bộ `LANGCHAIN_*` nếu muốn xem
trace trên LangSmith.

Về bảo mật: `SECRET_KEY` là biến dùng để ký JWT. Hãy tự đặt một giá trị riêng cho biến
này trong `.env` trước khi chạy ở môi trường thật.

### 5.3. Chạy backend

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-rag.txt   # chỉ cần khi muốn nạp tài liệu mới

docker compose up -d db         # hoặc dùng Postgres đã cài sẵn
python scripts/init_db.py       # tạo bảng, nạp tài khoản demo và nội dung học tập

make run
# Tương đương: uvicorn src.main:app --reload --reload-dir src --host 0.0.0.0 --port 8000
```

Makefile dùng đường dẫn `.venv/bin/`, hợp với Linux và macOS. Trên Windows hãy gọi
thẳng lệnh tương ứng, ví dụ `.venv\Scripts\uvicorn src.main:app --reload --port 8000`.

### 5.4. Chạy frontend

Mở một cửa sổ terminal khác:

```bash
cd frontend
npm install
npm run dev
```

Dev server của Vite ghim cổng 5180 bằng `strictPort`, và tự chuyển tiếp mọi request
`/api` sang backend ở cổng 8000, nên khi chạy dev không cần đặt `VITE_API_URL`.

Muốn xem một phần giao diện mà không cần backend thì đặt `VITE_ENABLE_MSW=true` trong
`frontend/.env.local`. Chế độ này chỉ phục vụ phát triển UI; các luồng cần dữ liệu thật
(RAG, index tài liệu, thông báo, tư vấn, voice và video) phải chạy cùng backend.

### 5.5. Chạy bằng Docker

```bash
docker compose up -d
```

Lệnh này dựng hai dịch vụ: `backend` ở cổng 8000 và `db` là PostgreSQL 15 ở cổng 5432.
Backend đọc biến môi trường từ file `.env` và tự chạy `scripts/init_db.py` khi khởi động.

`docker-compose.yml` phụ trách phần backend, phần giao diện chạy bằng `npm run dev`
như mục 5.4. Thư mục `frontend/` có `Dockerfile` và `Caddyfile` riêng để đóng gói khi
triển khai.

Dừng toàn bộ bằng `docker compose down`, hoặc `make docker-down`.

## 6. Cổng và đường dẫn

| Thứ                        | Giá trị                                                | Nguồn                                                                 |
| :------------------------- | :----------------------------------------------------- | :-------------------------------------------------------------------- |
| Backend                    | `http://localhost:8000`                                | `APP_PORT` trong `.env.example`, `Dockerfile`, `Makefile`             |
| Frontend khi chạy dev      | `http://localhost:5180`                                | `server.port` trong `frontend/vite.config.ts`, ghim bằng `strictPort` |
| Tiền tố API                | `/api/v1`                                              | `src/api/router.py`, `frontend/src/lib/api.ts`                        |
| Kiểm tra sức khỏe hệ thống | `GET http://localhost:8000/api/v1/health`              | `src/api/v1/health.py`                                                |
| Trạng thái agent           | `GET http://localhost:8000/api/v1/status`              | `src/api/v1/health.py`                                                |
| Tài liệu API tự sinh       | `http://localhost:8000/docs`                           | FastAPI mặc định                                                      |
| PostgreSQL                 | `localhost:5432`, user `medical_user`, db `medical_db` | `docker-compose.yml`                                                  |
| Live URL công khai         | https://c3-app-128.up.railway.app/                     | Triển khai trên Railway                                               |

Đổi cổng frontend thì phải sửa cả `frontend/vite.config.ts` và `CORS_ORIGINS` trong
`.env`, nếu không trình duyệt sẽ chặn request.

## 7. Tài khoản demo

Ba tài khoản được nạp bởi `scripts/init_db.py`. Mật khẩu đều là `demo1234`.

| Email                  | Vai trò | Ghi chú                                            |
| :--------------------- | :------ | :------------------------------------------------- |
| `benhnhan@demo.vn`     | patient | Hồ sơ bệnh nhân đái tháo đường                     |
| `nguoicaotuoi@demo.vn` | patient | Hồ sơ người cao tuổi, dùng để thử phần cá nhân hoá |
| `bientap@demo.vn`      | editor  | Vào được khu vực biên tập                          |
| `bacsi@demo.vn`        | doctor  | Tài khoản bác sĩ tư vấn mẫu                        |

Lưu ý: đây là các tài khoản demo, không dùng cho môi trường thật.

## 8. Cấu trúc thư mục

| Thư mục hoặc file                                  | Nội dung                                                             |
| :------------------------------------------------- | :------------------------------------------------------------------- |
| `src/`                                             | Backend Python: FastAPI, agent LangGraph, tầng RAG, các service      |
| `frontend/`                                        | Ứng dụng React với Vite, TypeScript và Tailwind v4                   |
| `tests/`                                           | Test backend bằng pytest, chia theo agent, api, rag, services        |
| `docs/`                                            | Tài liệu dự án và giáo trình của khoá học                            |
| `eval/`                                            | Script và kết quả đánh giá chất lượng agent                          |
| `scripts/`                                         | Script tiện ích: nạp cơ sở dữ liệu, ETL, benchmark, ghi log AI       |
| `data/`                                            | Tài liệu nguồn, chunk đã xử lý, kho vector local và registry tài liệu |
| `presentation/`                                    | Pitch deck và video demo                                             |
| `scratch/`                                         | Script thử nghiệm nhanh với LLM, nằm ngoài luồng chính               |
| `.github/`                                         | Workflow CI và hook                                                  |
| `.ai-log/`                                         | Log các phiên làm việc với công cụ AI                                |
| `Dockerfile`, `docker-compose.yml`, `railway.toml` | Đóng gói và triển khai                                               |
| `Makefile`                                         | Lệnh tắt cho chạy, test, lint và pipeline RAG                        |
| `requirements.txt`, `requirements-rag.txt`         | Phụ thuộc Python, tách phần chạy app và phần nạp tài liệu            |
| `ruff.toml`                                        | Cấu hình lint và format cho Python                                   |
| `.env.example`                                     | Mẫu biến môi trường                                                  |
| `JOURNAL.md`, `WORKLOG.md`                         | Nhật ký theo tuần và nhật ký công việc theo ngày                     |

Bên trong `src/`: `agent/` là graph và các node, `api/` là route FastAPI theo phiên bản,
`core/` là cấu hình cùng kết nối cơ sở dữ liệu, log và exception, `models/` và `schemas/`
là mô hình dữ liệu, `rag/` là toàn bộ pipeline tài liệu, `services/` là guardrail, LLM
factory, quiz, giọng nói và ETL.

## 9. Chạy test và lint

Backend, chạy từ thư mục gốc:

```bash
make test        # pytest tests/ -v
make lint        # ruff check src/ tests/
make format      # ruff format src/ tests/
make typecheck   # mypy src/
make check       # lint, format, rồi test
```

Trên Windows gọi thẳng công cụ, ví dụ `.venv\Scripts\pytest tests\ -v`.

Frontend:

```bash
cd frontend
npm run lint     # eslint
npm run build    # kiểm tra kiểu bằng tsc rồi build bằng vite
```

Đánh giá chất lượng agent:

```bash
make eval        # chạy eval/run_ragas_eval.py và eval/run_custom_eval.py
```

Backend có bộ test pytest trong `tests/`, chia theo bốn nhóm: agent, api, rag và services.

## 10. Tài liệu khác

Tài liệu của dự án:

- [docs/langgraph-v2.md](docs/langgraph-v2.md) — kiến trúc agent LangGraph v2 đang chạy thật
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — kiến trúc hiện trạng, thành phần và quyết định kỹ thuật
- [docs/architecture-diagram.md](docs/architecture-diagram.md) — sơ đồ kiến trúc, vòng đời tài liệu và tư vấn bác sĩ
- [docs/weekly-log.md](docs/weekly-log.md) — nhật ký theo tuần, có đối chiếu commit
- [docs/api-contract.md](docs/api-contract.md) — hợp đồng API giữa frontend và backend
- [docs/test-local.md](docs/test-local.md) — hướng dẫn tự đi hết sản phẩm trên máy trong một buổi
- [docs/gate1/brief.md](docs/gate1/brief.md) — Project Brief: vấn đề, người dùng, phạm vi
- [docs/gate1/prd.md](docs/gate1/prd.md) — PRD giai đoạn Gate 1
- [docs/gate1/wireframes/](docs/gate1/wireframes/) — sơ đồ luồng và wireframe Gate 1 (tài liệu lịch sử)

Tài liệu theo từng phần:

- [frontend/README.md](frontend/README.md) — hướng dẫn chi tiết phần giao diện và hệ thiết kế
- [data/README.md](data/README.md) — quy ước thư mục dữ liệu, file nào commit file nào không
- [eval/manual_eval_evidence.md](eval/manual_eval_evidence.md) — bằng chứng thử tay các guardrail

Nhật ký:

- [JOURNAL.md](JOURNAL.md) — nhật ký theo tuần
- [WORKLOG.md](WORKLOG.md) — nhật ký công việc theo ngày

Giáo trình của khoá học nằm ở `docs/guide/`, đây là tài liệu đi kèm template chứ không
phải tài liệu do đội viết.

## 11. Thành viên nhóm và phân công

Đội P-128. Danh sách thành viên lấy từ `WORKLOG.md`, phần đóng góp đối chiếu thêm với
lịch sử commit.

| Thành viên         | Phụ trách chính                                                                 |
| :----------------- | :------------------------------------------------------------------------------ |
| Khanh Nguyen       | Tầng dữ liệu và RAG trong `src/rag/`, Project Brief Gate 1, nhật ký dự án       |
| Anh Đức            | Thiết kế UI flow/wireframe, phát triển frontend                                  |
| Hoàng Minh         | CI/CD và branch protection, bộ đánh giá agent trong `eval/`, hạ tầng ghi log AI |
| Lê Trọng Việt Dũng | Kiến trúc hệ thống và phát triển backend                                        |

## 12. Giới hạn

Sản phẩm này chỉ cung cấp thông tin mang tính giáo dục dựa trên tài liệu đã được duyệt.
Nó không thay thế bác sĩ, không chẩn đoán, không kê đơn và không điều chỉnh liều thuốc.
Khi có dấu hiệu nguy cấp, hãy gọi 115 hoặc tới cơ sở y tế gần nhất.
