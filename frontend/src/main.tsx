import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Be Vietnam Pro — giao diện và tiêu đề. Chỉ 3 weight thực dùng: 400 / 600 / 700.
// Mỗi file weight khai báo latin, latin-ext, vietnamese kèm unicode-range,
// nên trình duyệt chỉ tải subset khớp với ký tự có trên trang.
import '@fontsource/be-vietnam-pro/400.css'
import '@fontsource/be-vietnam-pro/600.css'
import '@fontsource/be-vietnam-pro/700.css'

// Lora Variable — nội dung câu trả lời. Một file biến thiên phủ wght 400–700.
import '@fontsource-variable/lora/wght.css'

// IBM Plex Mono — số hiệu văn bản và nhãn nguồn. Chỉ 400 / 500.
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'

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
