# Frontend — Trợ lý sức khỏe

## 1. Giới thiệu

Đây là phần giao diện của AI Agent giáo dục sức khỏe, dành cho bệnh nhân đã được
bác sĩ chẩn đoán mắc đái tháo đường típ 2 hoặc tăng huyết áp. Người dùng mục tiêu
là người 45 đến 70 tuổi, đọc trên điện thoại, ít quen thuật ngữ y khoa. Toàn bộ
quyết định về cỡ chữ, khoảng cách và màu sắc đều xuất phát từ nhóm người dùng này.

Ứng dụng không chẩn đoán, không kê đơn, không chỉnh liều thuốc. Nó chỉ giải thích
lại nội dung trong các tài liệu đã được duyệt, và luôn hiện nguồn kèm câu trả lời.

Công nghệ chính:

| Thư viện | Phiên bản | Vai trò |
| --- | --- | --- |
| Vite | 8 | Dev server và bundler |
| React | 19 | Thư viện giao diện |
| TypeScript | 6 | Kiểu tĩnh |
| Tailwind CSS | 4 | CSS, khai báo token bằng cú pháp `@theme` |
| TanStack Query | 5 | Gọi API, cache, thử lại |
| MSW | 2 | Giả lập backend ở tầng mạng |

Ngoài ra còn dùng React Router 7 (điều hướng), React Hook Form cùng Zod resolver
(form hồ sơ), và Zod 4 (kiểm tra dữ liệu API).

## 2. Yêu cầu

Node.js phiên bản `^20.19.0` hoặc `>=22.12.0`. Đây là yêu cầu của Vite 8.2.1, đọc
từ trường `engines` trong `node_modules/vite/package.json`, không phải con số ước
chừng. Node cũ hơn sẽ không chạy được dev server.

npm đi kèm Node là đủ, dự án không cần pnpm hay yarn.

Dự án chưa khai `engines` trong `package.json` nên npm sẽ không cảnh báo nếu bạn
dùng Node quá cũ. Nếu gặp lỗi lạ lúc khởi động, hãy kiểm tra `node -v` trước tiên.

## 3. Cài đặt và chạy

Mọi lệnh dưới đây chạy từ thư mục `frontend/`.

```
npm install
npm run dev
```

Mở http://localhost:5180

Các lệnh khác:

```
npm run build     # kiểm tra kiểu rồi build vào dist/
npm run preview   # chạy thử bản đã build
npm run lint      # ESLint
```

### Vì sao ghim cổng 5180

`vite.config.ts` đặt `server.port: 5180` kèm `server.strictPort: true`.

Mặc định khi cổng bận, Vite sẽ tự nhảy sang cổng trống kế tiếp và in ra địa chỉ
mới. Điều đó tiện cho dự án cá nhân nhưng gây rắc rối ở đây, vì cổng của frontend
là một phần của giao kèo giữa hai bên: backend cấu hình CORS theo đúng origin
`http://localhost:5180`, và tài liệu hướng dẫn của nhóm cũng ghi đúng địa chỉ này.
Nếu Vite âm thầm nhảy sang 5181, dev server vẫn chạy, proxy vẫn hoạt động, nhưng
người mở đúng địa chỉ trong tài liệu lại thấy trang trắng, và lỗi CORS chỉ lộ ra
sau khi đã mất thời gian dò.

`strictPort: true` biến trường hợp đó thành lỗi ngay lập tức:

```
error when starting dev server:
Error: Port 5180 is already in use
```

Khi gặp lỗi này, hãy tìm và tắt tiến trình đang giữ cổng 5180 chứ không đổi cổng
trong `vite.config.ts`.

## 4. Biến môi trường

Frontend dùng hai biến.

| Biến | Mặc định | Dùng ở đâu | Ý nghĩa |
| --- | --- | --- | --- |
| `VITE_API_URL` | chuỗi rỗng | `src/lib/api.ts`, `src/mocks/handlers.ts` | Gốc URL của backend. Để trống thì mọi request đi bằng đường dẫn tương đối. |
| `VITE_ENABLE_MSW` | không đặt → bật ở dev, tắt ở production | `src/main.tsx` | Bật/tắt lớp mock MSW. Xem mục 5. |

Vite chỉ đưa vào mã trình duyệt những biến có tiền tố `VITE_`. Biến không có tiền
tố này sẽ không tồn tại trong ứng dụng. Kiểu của cả hai biến khai trong
`src/vite-env.d.ts`; giá trị luôn là **chuỗi**, kể cả khi bạn viết `true`.

Vite đọc file `.env*` từ thư mục gốc của chính nó, tức `frontend/`, **không** đọc
`.env` ở gốc repo. Thư mục `frontend/` hiện **không có** file `.env` nào. Muốn đặt
biến, hãy tạo `frontend/.env.local` (file này đã nằm trong `.gitignore` qua mẫu
`*.local`):

```
VITE_API_URL=https://api.example.com
VITE_ENABLE_MSW=false
```

### Proxy /api hoạt động thế nào khi phát triển

`vite.config.ts` khai báo:

```ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
    },
  },
}
```

Luồng đi của một request khi chạy `npm run dev` và để `VITE_API_URL` trống:

1. `src/lib/api.ts` ghép URL thành `` `${BASE_URL}${API_PREFIX}${path}` ``. Với
   `BASE_URL` rỗng, kết quả là đường dẫn tương đối, ví dụ `/api/v1/chat`.
2. Trình duyệt hiểu đường dẫn tương đối là cùng origin, nên gửi tới
   `http://localhost:5180/api/v1/chat`.
3. Dev server của Vite thấy đường dẫn khớp tiền tố `/api`, liền chuyển tiếp
   request sang `http://localhost:8000/api/v1/chat`.
4. `changeOrigin: true` khiến header `Host` được viết lại thành host của backend,
   để backend không từ chối vì thấy Host lạ.

Ích lợi chính là trình duyệt luôn coi mọi request là cùng origin, nên không có
request preflight và không dính CORS trong lúc phát triển.

Hai điểm cần nhớ:

- Proxy chỉ tồn tại trong dev server. Bản build tĩnh trong `dist/` không có proxy.
  Khi triển khai thật, bạn phải đặt `VITE_API_URL` trỏ tới backend, hoặc cấu hình
  web server đứng trước để chuyển tiếp `/api`.
- Nếu bạn đặt `VITE_API_URL`, đường dẫn thành tuyệt đối và proxy bị bỏ qua hoàn
  toàn, kể cả khi đang chạy dev.

## 5. Lớp mock

Đây là phần quan trọng nhất của tài liệu này. Hãy đọc kỹ trước khi sửa bất cứ thứ
gì liên quan tới gọi API.

### Vì sao có mock

Backend chưa sẵn sàng, nhưng giao diện vẫn phải dựng được và phải kiểm được đủ
năm nhánh trạng thái phản hồi. Có những nhánh gần như không thể tạo ra bằng
backend thật một cách chủ động, ví dụ nhánh dấu hiệu cấp cứu: không ai muốn phải
chờ hệ thống thật nhận diện một ca nguy hiểm mới biết banner đỏ hiển thị ra sao.

MSW chặn request ở **tầng mạng**, bằng một Service Worker, chứ không thay thế
module hay ghi đè `fetch` trong mã nguồn. Hệ quả quan trọng: `src/lib/api.ts` và
toàn bộ component không hề biết chúng đang nói chuyện với mock hay với backend
thật. Chúng chỉ gọi `fetch` như bình thường.

### Bật và tắt

Điều khiển bằng biến môi trường `VITE_ENABLE_MSW`, **không** phải bằng cách sửa
mã. Đặt biến trong `frontend/.env.local` (Vite đọc file `.env*` từ thư mục
`frontend/`, không đọc `.env` ở gốc repo):

```
VITE_ENABLE_MSW=false
```

`src/main.tsx` đọc biến này trước khi render:

```ts
const MOCKING_ENABLED =
  import.meta.env.VITE_ENABLE_MSW === 'true' ||
  (import.meta.env.VITE_ENABLE_MSW !== 'false' && import.meta.env.DEV)

async function enableMocking(): Promise<void> {
  if (!MOCKING_ENABLED) return
  const { worker } = await import('./mocks/browser')
  await worker.start({ onUnhandledRequest: 'bypass' })
  console.info('[MSW] Lớp mock đang BẬT — ...')
}
```

| `VITE_ENABLE_MSW` | `npm run dev` | `npm run build` + `npm run preview` |
| --- | --- | --- |
| `true` | Bật | Bật |
| `false` | Tắt | Tắt |
| không đặt (mặc định) | **Bật** | **Tắt** |

Chỉ đúng hai chuỗi `true` và `false` được coi là lựa chọn tường minh, vì Vite
luôn đưa biến môi trường vào mã dưới dạng chuỗi. Giá trị khác, ví dụ `1` hay
`yes`, bị bỏ qua và rơi về mặc định. Mặc định chọn như vậy để người mới clone
repo chạy `npm run dev` là thấy giao diện có dữ liệu ngay, không cần dựng backend
trước; còn bản production thì mặc định không bao giờ dùng dữ liệu giả.

Khi mock đang bật, `main.tsx` in một dòng `[MSW] Lớp mock đang BẬT` ra console.
Nếu bạn thấy dòng đó, mọi số liệu trên màn hình là dữ liệu giả, không phải dữ
liệu từ backend thật.

`onUnhandledRequest: 'bypass'` để các request không khớp handler nào, ví dụ tài
nguyên của Vite, đi thẳng qua mà không bị cảnh báo.

### Khi backend sẵn sàng

Điểm mấu chốt: **không phải sửa component nào, cũng không phải sửa
`src/lib/api.ts`.** Việc chuyển đổi diễn ra ở tầng mạng, phía dưới toàn bộ mã ứng
dụng. Không có `if (mock)` nào nằm rải rác trong component.

Cách chuyển sang backend thật:

1. Đặt `VITE_ENABLE_MSW=false` trong `frontend/.env.local`, rồi chạy lại
   `npm run dev`. Không phải sửa dòng mã nào.
2. Nếu backend nằm ở nơi khác `http://localhost:8000`, đặt thêm `VITE_API_URL`
   trong cùng file đó.
3. Với bản phát hành, `npm run build` là đủ: không đặt biến thì production mặc
   định đã tắt mock.

Dữ liệu y khoa giả vẫn không lọt ra bản phát hành. Điều kiện bật mock nằm ở hằng
`MOCKING_ENABLED` trong `src/main.tsx`, viết dưới dạng một biểu thức phẳng chứ
không gọi hàm, nên khi build production Vite thay `import.meta.env` bằng hằng số
rồi rút gọn cả biểu thức về `false`, và nhánh `import('./mocks/browser')` bị cắt
khỏi đồ thị module. Đã kiểm chứng lại sau khi đổi sang biến môi trường: build
không đặt biến và build với `VITE_ENABLE_MSW=false` cho ra cùng một bundle, không
còn chunk `browser-*.js`, và grep các chuỗi `setupWorker`, `chatFixtures`,
`KEYWORD_RULES`, `c_mock_answered` trong `dist/` đều ra **0 lần**.

Hệ quả cần biết: viết điều kiện đó thành lời gọi hàm, ví dụ
`if (!shouldEnableMocking()) return`, thì bundler không rút gọn được nữa. Khi đó
mock vẫn tắt đúng, nhưng chunk mock nặng khoảng 436 kB quay lại nằm trong `dist/`
kèm toàn bộ nội dung y khoa giả. Đây là lý do chỗ đó cố ý không tách thành hàm.

Nếu build với `VITE_ENABLE_MSW=true` thì ngược lại: mock đi theo cả bản
production, dùng để demo khi chưa có backend. Đừng đặt giá trị này cho bản phát
hành thật.

Riêng file tĩnh `public/mockServiceWorker.js` vẫn được sao chép sang `dist/` theo
cơ chế của thư mục `public` trong mọi trường hợp, nhưng khi mock tắt thì không có
mã nào đăng ký nó nên nó nằm im.

### Năm kịch bản phản hồi

Handler `POST /api/v1/chat` chọn kịch bản bằng cách dò từ khóa trong câu hỏi. Thứ
tự xét có ý nghĩa: dấu hiệu cấp cứu được xét trước tiên, vì một câu vừa hỏi liều
thuốc vừa kể triệu chứng nguy hiểm thì bắt buộc phải ra `red_flag`. Không khớp từ
khóa nào thì trả `answered`.

| Thứ tự xét | Trạng thái | Một số từ khóa kích hoạt | Câu hỏi mẫu |
| --- | --- | --- | --- |
| 1 | `red_flag` | đau ngực, tức ngực, khó thở, méo miệng, yếu tay, tê nửa người, nói khó, ngất, cấp cứu | Tôi bị tăng huyết áp, sáng nay thấy đau tức ngực và khó thở, tôi nên uống thuốc gì? |
| 2 | `refused` | liều, mấy viên, tăng thuốc, giảm thuốc, đổi thuốc, bỏ thuốc, kê đơn, đơn thuốc, uống thêm | Đường huyết sáng nay của tôi là 9.5, tôi tự tăng thuốc tiểu đường lên 2 viên một lần được không? |
| 3 | `referral` | tế bào gốc, ghép tụy, thuốc nam, đông y, chữa khỏi hẳn, thực phẩm chức năng | Bệnh tiểu đường type 2 có chữa khỏi hẳn bằng ghép tế bào gốc không? |
| 4 | `partial` | tập thể dục, tập luyện, vận động, đi bộ, thể thao | Tôi bị tiểu đường type 2, tôi nên tập thể dục thế nào cho đúng? |
| 5 | mặc định | không khớp từ khóa nào | Tôi vừa bị tăng huyết áp vừa bị tiểu đường thì nên ăn uống thế nào? |

Ý nghĩa từng trạng thái ở giao diện:

- `answered` — câu trả lời đầy đủ kèm dải nguồn.
- `partial` — như trên, thêm một ghi chú bình tĩnh rằng vài phần chưa có tài liệu
  nói rõ.
- `red_flag` — banner màu cảnh báo đặt phía trên câu trả lời, kèm nút gọi 115.
- `refused` — khối màu `refuse`, giải thích vì sao không được trả lời chuyện liều
  thuốc.
- `referral` — khối trung tính, nói rõ thư viện chưa có tài liệu về chủ đề này.
  Cố tình khác hẳn `refused` cả về hình lẫn lời.

Ba trạng thái `red_flag`, `refused`, `referral` luôn có `citations` rỗng. Đây là
ràng buộc do schema Zod bắt buộc, không phải quy ước lỏng lẻo.

### Các endpoint mock khác

| Endpoint | Hành vi của mock |
| --- | --- |
| `POST /api/v1/patients/profile` | Kiểm dữ liệu bằng Zod. Sai thì trả 422 kèm `detail`, giống lỗi của Pydantic. Đúng thì trả lại chính object vừa lưu, thêm `updated_at`. |
| `GET /api/v1/patients/{id}/profile` | Luôn trả 200 cho **mọi** id, lấy hồ sơ mẫu rồi thay `patient_id` bằng id trong đường dẫn. Không bao giờ trả 404. |
| `GET /api/v1/conversations/{id}` | Luôn trả 200 với danh sách phiên cố định, bỏ qua id. |
| `GET /api/v1/conversations/{id}/{conversationId}` | Trả 404 nếu `conversationId` khác `c_mock_answered`, để kiểm được nhánh lỗi. |

Độ trễ giả lập: 1500 ms cho `POST /chat` (để thấy được trạng thái đang chờ), 300
ms cho các endpoint còn lại.

Lưu ý khi thử màn hồ sơ: vì `GET profile` luôn trả hồ sơ mẫu, màn sửa hồ sơ sẽ
luôn hiện dữ liệu mẫu (58 tuổi, tăng huyết áp) chứ không phải thứ bạn vừa lưu.
Đó là giới hạn của mock, không phải lỗi của form.

### Tự kiểm khi nạp module

`src/mocks/fixtures.ts` tự kiểm mọi fixture với schema Zod ngay lúc nạp module.
Nếu ai sửa fixture lệch hợp đồng API, ứng dụng sẽ ném lỗi ngay khi khởi động, kèm
mô tả chỗ sai, thay vì hiển thị sai lặng lẽ.

## 6. Cấu trúc thư mục

| Thư mục | Vai trò |
| --- | --- |
| `src/app/` | Cấu hình cấp ứng dụng: `queryClient.ts` (mặc định của TanStack Query), `guards.tsx` (hai guard điều hướng). |
| `src/lib/` | Tầng dữ liệu thuần, không dính React. `schemas.ts` là nguồn sự thật duy nhất về kiểu dữ liệu API, `api.ts` là lớp gọi HTTP. |
| `src/mocks/` | Lớp giả lập backend: `browser.ts` (worker), `handlers.ts` (định tuyến), `fixtures.ts` (dữ liệu mẫu). |
| `src/patient/` | Context giữ `patient_id` ẩn danh và hồ sơ bệnh nhân. |
| `src/screens/` | Ba màn hình: chọn vai trò, khai hồ sơ, hỏi đáp. |
| `src/ui/` | Component dùng lại được: khung ngoài, dải nguồn, ô nhập, khối trạng thái, khối lỗi. |
| `src/assets/` | Ảnh và icon nhập trực tiếp vào mã. |
| `public/` | File tĩnh sao chép nguyên trạng sang `dist/`, gồm `mockServiceWorker.js` do MSW sinh ra. |

Hai file gốc: `src/main.tsx` là điểm vào (nạp font, bật mock, render), `src/App.tsx`
dựng provider và bảng định tuyến.

## 7. Hệ thiết kế

Toàn bộ token khai trong `src/index.css` bằng cú pháp `@theme` của Tailwind v4.
Không có file cấu hình `tailwind.config.js`.

### Màu

Mọi tỷ lệ tương phản đo trên nền `paper` (#F4F6F5) theo công thức WCAG 2.x.

| Token | Giá trị | Tương phản | Dùng cho |
| --- | --- | --- | --- |
| `--color-ink` | #13322B | 12.74:1 | Chữ chính |
| `--color-paper` | #F4F6F5 | nền tham chiếu | Nền trang |
| `--color-moss` | #4E5F58 | 6.24:1 | Chữ phụ, chú thích |
| `--color-alert` | #B3261E | 6.02:1 | Cảnh báo, dấu hiệu cấp cứu |
| `--color-medical` | #0B6E4F | 5.76:1 | Nhấn mạnh y khoa, nút chính |
| `--color-refuse` | #7E631C | 5.25:1 | Khối từ chối trả lời |
| `--color-border` | #788C83 | 3.29:1 | Viền thành phần tương tác |
| `--color-rule` | #C3CCC8 | 1.51:1 | Đường kẻ trang trí. Xem cảnh báo bên dưới. |

Ngưỡng cần đạt: chữ 4.5:1 theo WCAG 1.4.3, viền và ranh giới thành phần giao diện
3:1 theo WCAG 1.4.11.

**Cảnh báo về `rule`.** Token `--color-rule` chỉ đạt 1.51:1, tức không đạt cả
ngưỡng 3:1 dành cho thành phần phi văn bản. Nó **chỉ** được dùng cho đường kẻ
trang trí và đường phân cách thuần thẩm mỹ, tức những nét mà người dùng không cần
nhìn thấy vẫn thao tác được.

Tuyệt đối không dùng `rule` làm viền ô nhập liệu, nút bấm, ô chọn hay bất kỳ thành
phần tương tác nào. Việc đó dùng `--color-border`. Bệnh nhân 45 đến 70 tuổi đọc
trên điện thoại sẽ không nhìn thấy viền vẽ bằng `rule`.

`--color-border` đạt ngưỡng viền nhưng **không** đạt ngưỡng chữ, nên đừng dùng nó
làm màu chữ.

### Chữ

| Token | Họ chữ | Vai trò |
| --- | --- | --- |
| `--font-display` | Be Vietnam Pro | Giao diện và tiêu đề: nhãn, nút, tên màn, chú thích. |
| `--font-body` | Lora Variable | Nội dung câu trả lời. Chữ có chân, đọc dài dễ hơn. |
| `--font-mono` | IBM Plex Mono | Số hiệu văn bản và nhãn nguồn, ví dụ `5481/QĐ-BYT`. Đây là điểm nhận diện của phần trích dẫn. |

Font nạp qua Fontsource trong `src/main.tsx`, chỉ nạp các weight thực dùng. Mỗi
file weight khai báo đủ subset latin và vietnamese kèm `unicode-range`, nên trình
duyệt chỉ tải phần khớp với ký tự có trên trang.

Cỡ chữ gốc là 18px. Thang khoảng cách dựa trên bội số 4px và thang cỡ chữ đặt tên
theo vai trò, không theo con số. Chi tiết và ghi chú vai trò từng bậc nằm ngay
trong `src/index.css`. Khi viết giao diện mới, hãy lấy khoảng cách và cỡ chữ từ hai
thang đó thay vì gõ số tùy ý.

Vùng chạm tối thiểu 44px được áp ở lớp base của `src/index.css` cho mọi nút, liên
kết dạng nút, ô chọn và ô nhập.

## 8. Lệnh kiểm tra

### Kiểm tra kiểu

```
npx tsc -b
```

**Đừng dùng `npx tsc --noEmit`.** `tsconfig.json` của dự án là file solution kiểu
`"files": []` cộng `"references"`, mà chế độ không-build của `tsc` không đi theo
project references. Kết quả là lệnh đó kiểm tra **0 file** và luôn trả về mã 0, kể
cả khi mã nguồn có lỗi kiểu. Có thể tự kiểm chứng:

```
npx tsc --noEmit --listFiles | wc -l
```

Lệnh trên in ra 0. Hai lệnh dưới đây mới thực sự kiểm tra:

```
npx tsc -b                          # theo project references
npx tsc -p tsconfig.app.json --noEmit   # chỉ định thẳng project
```

### Lint

```
npm run lint
```

Hiện trạng: 0 lỗi, 3 cảnh báo. Các cảnh báo đến từ React Compiler và quy tắc
`react-hooks/exhaustive-deps` khi gặp `watch()` của React Hook Form, cộng một
directive thừa trong file `public/mockServiceWorker.js` do MSW sinh ra.

### Build

```
npm run build
```

Script này chạy `tsc -b && vite build`, tức đã bao gồm bước kiểm tra kiểu đúng
cách. Kết quả nằm trong `dist/`. Xem thử bằng `npm run preview`.

## 9. Giới hạn hiện tại

Ghi trung thực để người mới không mất thời gian tìm thứ chưa tồn tại.

- **Chưa ghép API thật.** Toàn bộ dữ liệu khi chạy dev đến từ MSW. Chưa có lần nào
  chạy đối chiếu với backend thật, nên những chỗ hợp đồng API mô tả chưa rõ vẫn
  có thể lệch.
- **Chưa có xác thực.** `src/lib/api.ts` đã có sẵn chỗ gắn header `Authorization`
  nhưng `AUTH_TOKEN` đang để `null`. Chưa có đăng nhập, chưa có phiên người dùng.
- **Chưa có luồng biên tập viên y khoa.** Màn chọn vai trò có hiện lựa chọn này
  nhưng để ở trạng thái chưa mở, kèm ghi chú. Chưa có màn hình nào phía sau nó.
- **Nội dung y khoa trong mock là dữ liệu giả.** Các đoạn văn trong
  `src/mocks/fixtures.ts` do người viết diễn đạt lại cho dễ hiểu, không phải trích
  nguyên văn tài liệu gốc. **Không được dùng làm nguồn tham khảo lâm sàng** và
  không được đem đi trình bày như nội dung thật.
- **`patient_id` sinh ở client và lưu trong localStorage.** Xóa dữ liệu trình
  duyệt là mất hồ sơ. Chưa có cách khôi phục hay chuyển hồ sơ sang máy khác.
- **Chưa có test tự động.** Chưa cài test runner. Việc kiểm tra hiện dựa vào
  `tsc -b`, ESLint, và thử tay trên dev server.
- **Lịch sử hội thoại chưa dùng tới.** `src/lib/api.ts` đã có sẵn hai hàm
  `listConversations` và `getConversationDetail`, mock cũng đã có handler, nhưng
  chưa màn hình nào gọi tới.
