/**
 * Context của phiên đăng nhập: token và tài khoản đang dùng máy này.
 *
 * Tách hẳn khỏi `PatientProvider`. Hai thứ khác nhau về vòng đời và về phạm vi:
 * phiên đăng nhập có ở mọi vai trò, còn hồ sơ bệnh nhân chỉ tồn tại với vai trò
 * `patient`. Gộp lại thì biên tập viên cũng phải mang theo một khối state về
 * bệnh mãn tính mà họ không có.
 *
 * Chiều phụ thuộc chỉ đi một hướng: `PatientProvider` đọc `patient_id` từ đây,
 * còn ở đây không biết gì về hồ sơ.
 *
 * Tách context và hook ra khỏi file provider để provider chỉ export component,
 * giữ Fast Refresh của Vite hoạt động đúng.
 */
import { createContext, useContext } from 'react'

import type { LoginResponse, UserInfo } from '../lib/schemas'

/**
 * Tiền tố chung của mọi khóa localStorage thuộc ứng dụng này.
 *
 * Đăng xuất xoá theo TIỀN TỐ chứ không xoá từng khóa một — xem `SessionProvider`.
 */
export const STORAGE_PREFIX = 'tro-ly-suc-khoe:'

export const ACCESS_TOKEN_STORAGE_KEY = `${STORAGE_PREFIX}access_token`
export const USER_STORAGE_KEY = `${STORAGE_PREFIX}user`

export type SessionContextValue = {
  /** `null` khi chưa đăng nhập. */
  user: UserInfo | null
  accessToken: string | null
  isAuthenticated: boolean
  /** Lưu phiên vừa nhận từ `POST /auth/login` và gắn token vào lớp api. */
  signIn: (response: LoginResponse) => void
  /**
   * Xoá phiên khỏi máy này. KHÔNG gọi API — người gọi tự quyết định có báo cho
   * máy chủ hay không, và phải xoá phiên kể cả khi lời gọi đó hỏng.
   */
  signOut: () => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (value === null) {
    throw new Error('useSession phải được gọi bên trong <SessionProvider>.')
  }
  return value
}

/**
 * Đường dẫn dùng cho MỌI lần "đưa người dùng về đúng chỗ của họ".
 *
 * Sau khi đăng nhập, khi người đã đăng nhập mở lại `/login`, và khi một vai trò
 * cố vào đường dẫn của vai trò kia — cả ba đều đi qua đây, rồi `LandingRedirect`
 * ở `app/guards.tsx` mới quyết định đi tiếp đâu.
 *
 * Cố ý KHÔNG tự suy ra đích ngay tại chỗ gọi. Đích của một bệnh nhân còn phụ
 * thuộc vào việc đã khai hồ sơ hay chưa, mà ngay sau khi đăng nhập thì chưa ai
 * biết điều đó — query đọc hồ sơ còn chưa chạy. Nếu mỗi chỗ tự đoán thì sẽ có
 * chỗ đoán sai, và người chưa khai hồ sơ bị ném thẳng vào màn hỏi đáp.
 */
export const HOME_PATH = '/'
