/**
 * Khung ngoài dùng chung cho cả ba màn.
 *
 * Giới hạn chiều rộng nội dung để dòng chữ không quá dài trên máy tính bảng,
 * nhưng vẫn tràn viền có đệm trên điện thoại — nơi gần như toàn bộ bệnh nhân
 * sẽ mở ứng dụng này.
 */
import { Outlet } from 'react-router-dom'

const APP_NAME = 'Trợ lý sức khỏe'

export function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="border-b border-rule">
        {/* Cùng khuôn chiều rộng với phần nội dung để tiêu đề thẳng hàng với chữ bên dưới. */}
        <div className="mx-auto w-full max-w-2xl px-5 py-4">
          <p className="font-display text-xl font-bold">{APP_NAME}</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">
        <Outlet />
      </main>
    </div>
  )
}
