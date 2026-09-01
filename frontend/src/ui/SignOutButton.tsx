/**
 * Nút đăng xuất ở đáy thanh bên, có bước hỏi lại.
 *
 * VÌ SAO HỎI LẠI: nút này nằm ngay dưới khối hồ sơ, tức ngay cạnh thứ người
 * dùng bấm thường xuyên, và bấm nhầm thì mất cả phiên lẫn câu hỏi đang gõ dở.
 * Với người 45–70 tuổi thao tác trên màn hình nhỏ thì bấm trượt một ô là chuyện
 * bình thường.
 *
 * Hỏi lại ngay tại chỗ chứ không dùng `window.confirm`: hộp thoại của trình
 * duyệt không theo được thang cỡ chữ của ứng dụng, và trên điện thoại nó hiện ở
 * giữa màn hình, xa hẳn chỗ ngón tay vừa chạm.
 *
 * DỰNG TỪ BẢN MẪU: lớp `.thoat` — viền `--ke`, chữ `--xam`, và chuyển sang đỏ
 * khi rê chuột (`.thoat:hover{border-color:var(--do);color:var(--do)}`). Đó là
 * chỗ DUY NHẤT trong thanh bên bản mẫu dùng đỏ, và nó dùng đúng: đăng xuất là
 * hành động phá huỷ phiên làm việc.
 *
 * Bước hỏi lại thì bản mẫu không có — nó là trang tĩnh nên không có gì để mất.
 * Giữ lại từ code cũ, dựng bằng `.btn` của bản mẫu.
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { logout } from '../lib/api'
import { useSession } from '../session/context'
import { SignOutIcon } from './icons'

export function SignOutButton() {
  const { signOut } = useSession()
  const queryClient = useQueryClient()
  const [isConfirming, setConfirming] = useState(false)

  const mutation = useMutation({
    mutationFn: logout,
    /**
     * `onSettled` chứ không `onSuccess`: hỏng mạng thì vẫn phải đăng xuất khỏi
     * máy này. Một token nằm lại trên máy dùng chung nguy hiểm hơn hẳn một phiên
     * chưa kịp huỷ ở máy chủ.
     *
     * `queryClient.clear()` trước khi `signOut()`: cache đang giữ hồ sơ bệnh
     * nhân, danh sách hội thoại và nội dung từng phiên. Không dọn thì người đăng
     * nhập tiếp theo trên cùng cái máy này sẽ thấy dữ liệu y tế của người trước
     * nhấp nháy một nhịp trước khi query mới về.
     */
    onSettled: () => {
      queryClient.clear()
      // Không cần điều hướng: `RequireAuth` thấy phiên biến mất là tự đưa về
      // `/login`. Một nguồn quyết định duy nhất cho việc "chưa đăng nhập thì đi
      // đâu", thay vì hai chỗ cùng ra lệnh chuyển trang.
      signOut()
    },
  })

  if (!isConfirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="thoat">
        <SignOutIcon className="" />
        <span>Đăng xuất</span>
      </button>
    )
  }

  return (
    <div style={{ paddingTop: 9 }}>
      <p id="signout-question" className="lab" style={{ color: 'var(--ink)' }}>
        Đăng xuất khỏi máy này?
      </p>

      <div
        role="group"
        aria-labelledby="signout-question"
        style={{ display: 'flex', gap: 7, marginTop: 8 }}
      >
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="btn sm pri"
          style={{ flex: 1 }}
        >
          {mutation.isPending ? 'Đang thoát…' : 'Đăng xuất'}
        </button>

        <button type="button" onClick={() => setConfirming(false)} className="btn sm gh">
          Ở lại
        </button>
      </div>
    </div>
  )
}
