import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// KHÔNG import phông ở đây nữa.
//
// Hướng "Hồ sơ / Công báo" đổi họ chữ tiêu đề từ Lora sang Newsreader, mà
// Newsreader không có trong các gói `@fontsource` đã cài — và mục "không thêm
// thư viện mới" của yêu cầu cấm cài thêm gói. Nên cả ba họ chữ nay nạp bằng
// một thẻ `<link>` Google Fonts trong `index.html`, đúng như bản mẫu thiết kế.
//
// Giữ ba gói `@fontsource` trong `package.json` thay vì gỡ: `package.json` nằm
// ngoài `frontend/src/`, tức ngoài phạm vi được phép sửa của lần đổi giao diện
// này. Chúng không còn được import nên không lọt vào bundle.

import './index.css'
import App from './App.tsx'

/**
 * Quyết định có bật MSW hay không, dựa trên biến `VITE_ENABLE_MSW`.
 *
 * Vite luôn đưa biến môi trường vào mã dưới dạng chuỗi, nên chỉ hai chuỗi
 * Chỉ `'true'` bật MSW. Không có biến này thì frontend luôn gọi backend thật,
 * kể cả ở development: màn quản trị y khoa không được âm thầm thay dữ liệu
 * thực bằng fixture chỉ vì người dùng vừa clone repo.
 *
 * Cố ý viết thành một biểu thức phẳng chứ không tách ra hàm. Lúc build
 * production, Vite thay `import.meta.env` bằng hằng số rồi rút gọn cả biểu thức
 * này về `false`, nên nhánh `import('./mocks/browser')` bị cắt khỏi đồ thị
 * module và dữ liệu y khoa giả không lọt vào `dist/`. Bọc nó trong một lời gọi
 * hàm thì bundler không rút gọn được nữa, và chunk mock ~436 kB quay lại nằm
 * trong bản phát hành dù mock vẫn tắt.
 */
const MOCKING_ENABLED = import.meta.env.VITE_ENABLE_MSW === 'true'

/**
 * Bật MSW theo đúng hướng dẫn trong `mocks/browser.ts`.
 *
 * Phải `await` xong worker rồi mới render: nếu render trước, request đầu tiên
 * của ứng dụng có thể bay ra ngoài trước khi worker kịp chặn.
 */
async function enableMocking(): Promise<void> {
  if (!MOCKING_ENABLED) return
  const { worker } = await import('./mocks/browser')
  await worker.start({ onUnhandledRequest: 'bypass' })
  // In ra để không ai nhầm dữ liệu giả của mock với dữ liệu của backend thật.
  console.info(
    '[MSW] Lớp mock đang BẬT — mọi phản hồi /api/v1/... là dữ liệu giả, không phải backend thật. Đặt VITE_ENABLE_MSW=false trong frontend/.env.local để tắt.',
  )
}

void enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
