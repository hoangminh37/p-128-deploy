/**
 * Điều hướng theo trạng thái hồ sơ.
 *
 * Ứng dụng KHÔNG còn màn chọn vai trò. Vai trò phải đến từ tài khoản, không phải
 * từ việc người dùng tự khai — hỏi "bạn là ai" rồi tin luôn câu trả lời thì bất
 * kỳ ai cũng tự nhận là biên tập viên y khoa được. Phần đăng nhập và phân vai
 * trò làm ở đợt sau; từ giờ tới lúc đó, đường dẫn gốc chỉ còn một việc là rẽ
 * đúng chỗ.
 */
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { usePatient } from '../patient/context'

/**
 * `/chat` cần patient_id — không có thì mọi câu hỏi đều thiếu ngữ cảnh bệnh lý,
 * và câu trả lời y khoa chung chung còn nguy hiểm hơn là không trả lời.
 *
 * Chỉ cần patient_id, KHÔNG cần hồ sơ: người bấm "bỏ qua" ở màn hồ sơ có
 * patient_id tạm và vẫn phải hỏi được. Màn hỏi đáp tự hiện dải nhắc chưa có hồ
 * sơ cho trường hợp đó.
 */
export function RequirePatient({ children }: { children: ReactNode }) {
  const { patientId } = usePatient()

  if (patientId === null) {
    return <Navigate to="/profile" replace />
  }
  return children
}

/**
 * Đường dẫn gốc: có hồ sơ thì vào thẳng chỗ hỏi đáp, chưa có thì đi khai hồ sơ.
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
  const { profileState } = usePatient()

  if (profileState === 'loading') {
    return (
      <p role="status" className="font-display max-w-answer text-notice text-moss">
        Đang mở hồ sơ của bạn…
      </p>
    )
  }

  return <Navigate to={profileState === 'ready' ? '/chat' : '/profile'} replace />
}
