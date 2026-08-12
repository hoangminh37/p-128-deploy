/**
 * Khung ngoài dùng chung cho cả ba màn.
 *
 * Chiều rộng khớp với cột câu trả lời, để thanh trên cùng, nội dung và ô nhập
 * cùng nằm trên một trục dọc. Từ 1024px nới ra đúng bằng cột chữ cộng dải nguồn.
 */
import { Link, useLocation } from 'react-router-dom'
import { Outlet } from 'react-router-dom'

import type { PrimaryCondition } from '../lib/schemas'
import { usePatient } from '../patient/context'

const APP_NAME = 'Trợ lý sức khỏe'

/** Tên bệnh viết theo lối người bệnh tự gọi, không dùng mã hay thuật ngữ tra cứu. */
const CONDITION_LABEL: Record<PrimaryCondition, string> = {
  hypertension: 'Tăng huyết áp',
  type2_diabetes: 'Đái tháo đường típ 2',
}

export function RootLayout() {
  const { profile } = usePatient()
  const { pathname } = useLocation()

  // Đang đứng ngay trong màn hồ sơ thì không mời quay lại chính nó.
  const showProfileLink = pathname !== '/profile'

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="border-b border-rule">
        <div className="mx-auto flex w-full max-w-answer items-center justify-between gap-cozy px-cozy py-snug lg:max-w-reading">
          <div className="min-w-0">
            <p className="font-display text-app font-bold">{APP_NAME}</p>
            {/* Bệnh chính trong hồ sơ: nhắc người dùng câu trả lời đang được
                đặt trong ngữ cảnh nào, mà không cần mở lại màn hồ sơ. */}
            {profile !== null && (
              <p className="font-display truncate text-note text-moss">
                Hồ sơ: {CONDITION_LABEL[profile.primary_condition]}
              </p>
            )}
          </div>

          {showProfileLink && (
            <Link
              to="/profile"
              className="font-display flex min-h-touch shrink-0 items-center px-tight text-note text-moss underline underline-offset-4"
            >
              Sửa hồ sơ
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-answer flex-1 flex-col px-cozy py-cozy lg:max-w-reading">
        <Outlet />
      </main>
    </div>
  )
}
