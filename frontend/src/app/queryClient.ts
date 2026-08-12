/**
 * QueryClient dùng chung cho toàn ứng dụng.
 *
 * Lớp `lib/api.ts` đã chuẩn hóa mọi lỗi thành `ApiError` với trường `kind`, nên
 * ở đây chỉ cần đọc `kind` là quyết định được có thử lại hay không.
 */
import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '../lib/api'

/**
 * Chỉ lỗi mạng mới đáng thử lại — request chưa từng tới được máy chủ nên gửi lại
 * là an toàn và thường thành công.
 *
 * Cố tình KHÔNG thử lại:
 * - `validation` và `request`: dữ liệu sai hợp đồng, gửi lại vẫn sai y hệt.
 * - HTTP 4xx: lỗi do phía client, gửi lại vô nghĩa. Riêng 404 của hồ sơ là
 *   "chưa có hồ sơ", thử lại chỉ làm bệnh nhân chờ thêm.
 * - `timeout`: đã chờ hết 30 giây của `lib/api.ts`. Thử lại đẩy thời gian chờ
 *   lên 60 giây, quá lâu với người đang lo lắng — thà báo lỗi để họ tự bấm lại.
 * - HTTP 5xx: máy chủ đã nhận request và tự nó hỏng. Không nằm trong phạm vi
 *   "lỗi mạng" nên để nguyên, tránh nhân đôi tải lên một backend đang trục trặc.
 */
function retryOnlyNetworkErrors(failureCount: number, error: unknown): boolean {
  // `failureCount` là số lần đã hỏng TRƯỚC lần này, nên `< 1` cho đúng 1 lần thử lại.
  if (failureCount >= 1) return false
  if (!(error instanceof ApiError)) return false
  return error.kind === 'network'
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Bệnh nhân hay chuyển qua lại giữa các tab. Tự gọi lại API mỗi lần quay
        // về vừa tốn tiền LLM vừa làm câu trả lời đang đọc dở nhảy mất.
        refetchOnWindowFocus: false,
        retry: retryOnlyNetworkErrors,
      },
      mutations: {
        retry: retryOnlyNetworkErrors,
      },
    },
  })
}
