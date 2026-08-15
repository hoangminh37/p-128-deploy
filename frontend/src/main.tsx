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
 * Bật MSW khi chạy dev, theo đúng hướng dẫn trong `mocks/browser.ts`.
 *
 * Phải `await` xong worker rồi mới render: nếu render trước, request đầu tiên
 * của ứng dụng có thể bay ra ngoài trước khi worker kịp chặn.
 */
async function enableMocking(): Promise<void> {
  // if (!import.meta.env.DEV) return
  // const { worker } = await import('./mocks/browser')
  // await worker.start({ onUnhandledRequest: 'bypass' })
  return
}

void enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
