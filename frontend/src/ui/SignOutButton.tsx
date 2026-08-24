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
 * Nút này nằm trên nền navy của thanh bên, nên nó dùng cặp màu của họ nền tối:
 * viền và chữ `mist` (6.80:1) ở trạng thái nghỉ, `white` cho câu hỏi lại.
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
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="motion-press font-display flex min-h-touch w-full items-center gap-tight rounded-pill border-2 border-mist px-snug text-input font-semibold text-mist enabled:hover:bg-white/10 enabled:hover:text-white"
      >
        <SignOutIcon className="h-6 w-6 shrink-0" />
        Đăng xuất
      </button>
    )
  }

  return (
    <div>
      <p id="signout-question" className="font-display text-question text-white">
        Đăng xuất khỏi máy này?
      </p>

      <div
        role="group"
        aria-labelledby="signout-question"
        className="mt-tight flex gap-tight"
      >
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="motion-press font-display min-h-touch flex-1 rounded-pill bg-mint px-snug text-input font-bold text-ink enabled:hover:bg-mint-press disabled:bg-white/10 disabled:font-normal disabled:text-mist"
        >
          {mutation.isPending ? 'Đang thoát…' : 'Đăng xuất'}
        </button>

        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="motion-press font-display min-h-touch rounded-pill border-2 border-mist px-snug text-input font-semibold text-white enabled:hover:bg-white/10"
        >
          Ở lại
        </button>
      </div>
    </div>
  )
}
