/**
 * Provider giữ phiên đăng nhập và đồng bộ token sang lớp api.
 *
 * localStorage ném lỗi khi trình duyệt ở chế độ ẩn danh hoặc chặn cookie bên
 * thứ ba. Hỏng chỗ này không được làm sập cả ứng dụng — cùng lắm là người dùng
 * phải đăng nhập lại ở lần mở sau. Cùng lối phòng thủ mà `PatientProvider` đang
 * dùng.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { setAuthToken } from '../lib/api'
import { userInfoSchema, type LoginResponse, type UserInfo } from '../lib/schemas'
import {
  ACCESS_TOKEN_STORAGE_KEY,
  SessionContext,
  STORAGE_PREFIX,
  USER_STORAGE_KEY,
  type SessionContextValue,
} from './context'
import { THEME_STORAGE_KEY } from '../ui/theme'

type StoredSession = {
  accessToken: string
  user: UserInfo
}

/**
 * Đọc lại phiên từ localStorage khi tải trang.
 *
 * Phần `user` được parse qua đúng schema hợp đồng chứ không `JSON.parse` rồi
 * tin luôn. localStorage là thứ người dùng sửa được bằng devtools, và một
 * `role` bịa ra ở đó mà lọt vào ứng dụng thì mọi guard điều hướng thành vô
 * nghĩa. Kể cả khi backend thật đã kiểm quyền, giao diện cũng không được để
 * người ta tự mở màn hình của vai trò khác.
 *
 * (Dữ liệu cũ từ phiên bản trước có hình dạng khác cũng bị loại ở đây, thay vì
 * làm hỏng ứng dụng ở một chỗ nào đó xa tít bên trong.)
 */
function readStoredSession(): StoredSession | null {
  try {
    const accessToken = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
    const rawUser = window.localStorage.getItem(USER_STORAGE_KEY)
    if (accessToken === null || accessToken.trim() === '' || rawUser === null) {
      return null
    }

    const parsed = userInfoSchema.safeParse(JSON.parse(rawUser))
    if (!parsed.success) return null

    return { accessToken, user: parsed.data }
  } catch {
    return null
  }
}

function writeStoredSession(session: StoredSession): void {
  try {
    window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, session.accessToken)
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(session.user))
  } catch {
    // Không lưu được thì phiên này vẫn chạy bình thường, chỉ là không nhớ được.
  }
}

/**
 * Xoá MỌI khóa của ứng dụng, không chỉ hai khóa phiên.
 *
 * Quét theo tiền tố chứ không liệt kê tay: đợt trước còn để lại khóa
 * `patient_id` từ thời client tự sinh id, và bất kỳ khóa nào thêm sau này cũng
 * phải biến mất khi đăng xuất. Liệt kê tay thì sớm muộn cũng sót một cái, mà
 * cái sót lại chính là dữ liệu của người dùng trước trên một máy dùng chung.
 */
function clearStoredSession(): void {
  try {
    const keys: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key === null || !key.startsWith(STORAGE_PREFIX)) continue
      // MỘT NGOẠI LỆ: chế độ sáng/tối. Nó dùng chung tiền tố vì nó thuộc cùng
      // ứng dụng, nhưng nó KHÔNG phải dữ liệu của phiên — nó là thiết lập hiển
      // thị của cái máy này. Xoá nó khi đăng xuất nghĩa là người dùng phải chọn
      // lại chế độ tối sau mỗi lần thoát, mà việc đó chẳng bảo vệ được gì: biết
      // một cái máy đang để chế độ tối không nói lên điều gì về người vừa dùng.
      if (key === THEME_STORAGE_KEY) continue
      keys.push(key)
    }
    for (const key of keys) window.localStorage.removeItem(key)
  } catch {
    // Không xoá được cũng không có gì để làm thêm.
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => {
    const stored = readStoredSession()
    // Gắn token vào lớp api NGAY TRONG hàm khởi tạo state, không đợi `useEffect`.
    // Effect chạy sau khi cả cây con đã render, mà `PatientProvider` bên dưới có
    // thể đã bắn request đọc hồ sơ trước đó — request ấy sẽ đi thiếu header và
    // ăn 401 ngay lần tải trang đầu tiên.
    setAuthToken(stored?.accessToken ?? null)
    return stored
  })

  const signIn = useCallback((response: LoginResponse): void => {
    const next: StoredSession = {
      accessToken: response.access_token,
      user: response.user,
    }
    writeStoredSession(next)
    setAuthToken(next.accessToken)
    setSession(next)
  }, [])

  const signOut = useCallback((): void => {
    clearStoredSession()
    setAuthToken(null)
    setSession(null)
  }, [])

  const value = useMemo<SessionContextValue>(
    () => ({
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      isAuthenticated: session !== null,
      signIn,
      signOut,
    }),
    [session, signIn, signOut],
  )

  return <SessionContext value={value}>{children}</SessionContext>
}
