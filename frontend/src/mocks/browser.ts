/**
 * Worker MSW cho môi trường trình duyệt.
 *
 * Cách bật trong `main.tsx` khi cần chạy giao diện mà chưa có backend:
 *
 *   if (import.meta.env.DEV) {
 *     const { worker } = await import('./mocks/browser')
 *     await worker.start({ onUnhandledRequest: 'bypass' })
 *   }
 *
 * `onUnhandledRequest: 'bypass'` để asset của Vite đi thẳng, không bị cảnh báo.
 */
import { setupWorker } from 'msw/browser'

import { handlers } from './handlers'

export const worker = setupWorker(...handlers)
