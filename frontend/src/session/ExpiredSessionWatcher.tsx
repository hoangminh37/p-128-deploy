/**
 * Nối 401 của lớp API với ba việc mà lớp API không tự làm được.
 *
 * `lib/api.ts` là lớp HTTP thuần, không biết React Router lẫn TanStack Query.
 * Nó chỉ mở một chỗ cắm (`setUnauthorizedHandler`), còn component này cắm vào
 * đó ba việc phải làm khi phiên hết hạn:
 *
 *   1. Xoá phiên khỏi localStorage và gỡ token khỏi lớp api — `signOut`.
 *   2. Dọn sạch cache của TanStack Query. Bỏ bước này thì hồ sơ, danh sách hội
 *      thoại và câu trả lời của người vừa bị đăng xuất còn nằm nguyên trong
 *      cache, và người đăng nhập tiếp theo trên cùng máy sẽ thấy chúng nhấp
 *      nháy một nhịp trước khi query mới về.
 *   3. Đưa về `/login` kèm lý do, để màn đăng nhập nói được vì sao người dùng
 *      đột nhiên ở đây.
 *
 * KHÔNG render gì. Đặt trong `App.tsx` bên trong `BrowserRouter` vì nó cần
 * `useNavigate`, và bên trong hai provider kia vì nó cần `signOut` và
 * `queryClient`.
 *
 * Endpoint đăng nhập KHÔNG đi qua đây — xem cờ `skipUnauthorizedHandler` ở
 * `lib/api.ts`. 401 lúc đăng nhập là "sai mật khẩu", phải hiện trên form.
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { setUnauthorizedHandler } from '../lib/api'
import { useSession } from './context'

/** Lý do gắn vào `location.state` để `LoginScreen` biết mà hiện thông báo. */
export const EXPIRED_SESSION_REASON = 'session-expired'

export function ExpiredSessionWatcher() {
  const { signOut } = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  useEffect(() => {
    setUnauthorizedHandler(() => {
      signOut()
      queryClient.clear()
      void navigate('/login', {
        replace: true,
        state: { reason: EXPIRED_SESSION_REASON },
      })
    })

    // Gỡ khi component rời cây, để lớp api không giữ tham chiếu tới một
    // `navigate` đã chết.
    return () => setUnauthorizedHandler(null)
  }, [signOut, queryClient, navigate])

  return null
}
