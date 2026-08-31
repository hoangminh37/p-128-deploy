/**
 * Điều hướng theo phiên đăng nhập và theo vai trò.
 *
 * CHẶN Ở TẦNG ĐIỀU HƯỚNG, không phải chỉ ẩn nút. Một bệnh nhân gõ thẳng
 * `/editor` vào thanh địa chỉ phải bị đá về `/chat`, chứ không phải chỉ là
 * không nhìn thấy đường dẫn đó trên thanh bên.
 *
 * Và ngay cả thế này vẫn CHƯA PHẢI là bảo mật. Guard ở đây chỉ giữ cho giao
 * diện không dẫn người dùng vào chỗ không phải của họ. Chặn thật nằm ở backend:
 * máy chủ phải từ chối request của tài khoản không đủ quyền, kể cả khi request
 * đó không thể phát sinh từ giao diện này (hợp đồng mục 3).
 */
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import type { UserRole } from '../lib/schemas'
import { usePatient } from '../patient/context'
import { HOME_PATH, useSession } from '../session/context'

/** Chưa đăng nhập thì mọi đường dẫn đều dẫn về màn đăng nhập. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useSession()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return children
}

/**
 * Đường dẫn chỉ dành cho một vai trò.
 *
 * Sai vai trò thì đưa về "nhà" của chính vai trò đang đăng nhập, không đưa về
 * `/login`: người dùng không làm gì sai và cũng không cần đăng nhập lại, họ chỉ
 * gõ nhầm một đường dẫn không thuộc về mình.
 */
export function RequireRole({
  role,
  children,
}: {
  role: UserRole
  children: ReactNode
}) {
  const { user } = useSession()

  if (user === null) {
    return <Navigate to="/login" replace />
  }
  if (user.role !== role) {
    return <Navigate to={HOME_PATH} replace />
  }
  return children
}

/** Đã đăng nhập rồi thì khỏi bắt đăng nhập lại, vào thẳng nhà của vai trò. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useSession()

  if (isAuthenticated) {
    return <Navigate to={HOME_PATH} replace />
  }
  return children
}

/**
 * Đường dẫn gốc: rẽ theo vai trò, và với bệnh nhân thì rẽ tiếp theo hồ sơ.
 *
 * Phải chờ đọc xong hồ sơ mới rẽ được. Rẽ sớm sang `/profile` rồi lát nữa hồ sơ
 * về lại đá ngược sang `/chat` sẽ cho người dùng thấy một màn nhấp nháy qua hai
 * trang — với người 45–70 tuổi thì đó là "ứng dụng bị lỗi", không phải "đang
 * tải".
 *
 * Đọc hồ sơ hỏng thì đưa về `/profile`: ở đó có khối lỗi kèm nút thử lại, còn
 * `/chat` thì không nói được gì về chuyện vừa xảy ra.
 */
export function LandingRedirect() {
  const { user } = useSession()
  const { profileState } = usePatient()

  if (user === null) {
    return <Navigate to="/login" replace />
  }
  if (user.role === 'editor') {
    return <Navigate to="/editor" replace />
  }
  if (user.role === 'doctor') {
    return <Navigate to="/doctor" replace />
  }

  if (profileState === 'loading') {
    // Màn này đứng NGOÀI khung ứng dụng (xem `RootRoute` ở `App.tsx`), nên nó
    // phải tự lo lấy nền của mình. Nền navy giống hệt màn đăng nhập vừa rời
    // khỏi, để nhịp chờ này không loé lên một màn trắng ở giữa.
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink px-cozy">
        <p role="status" className="font-display max-w-answer text-notice text-mist">
          Đang mở hồ sơ của bạn…
        </p>
      </div>
    )
  }

  return <Navigate to={profileState === 'ready' ? '/chat' : '/profile'} replace />
}
