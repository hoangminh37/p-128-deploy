/**
 * Context lưu danh tính ẩn danh và hồ sơ của bệnh nhân đang dùng máy này.
 *
 * Tách context và hook ra khỏi file provider để provider chỉ export component,
 * giữ Fast Refresh của Vite hoạt động đúng.
 */
import { createContext, useContext } from 'react'

import type { ApiError } from '../lib/api'
import type { PatientProfileResponse } from '../lib/schemas'

/**
 * Khóa cache TanStack Query cho hồ sơ.
 *
 * Để ở đây chứ không viết thẳng trong provider, vì màn khai hồ sơ cần nạp lại
 * kết quả vừa lưu vào đúng khóa này. Hai nơi gõ tay hai mảng giống nhau thì
 * sớm muộn cũng lệch, và lúc lệch thì header vẫn hiện hồ sơ cũ mà không ai hiểu vì sao.
 */
export function patientProfileQueryKey(patientId: string | null) {
  return ['patient-profile', patientId] as const
}

/**
 * Trạng thái đọc hồ sơ.
 *
 * `absent` tách riêng khỏi `error` vì 404 không phải sự cố: bệnh nhân mới chỉ
 * đơn giản là chưa khai hồ sơ, và màn `/profile` cần phân biệt hai ca này để
 * không dọa người dùng bằng thông báo lỗi.
 */
export type ProfileState = 'idle' | 'loading' | 'ready' | 'absent' | 'error'

export type PatientContextValue = {
  /**
   * `patient_id` của tài khoản đang đăng nhập, lấy từ response `/auth/login`.
   *
   * `null` khi chưa đăng nhập, hoặc khi vai trò là `editor` — biên tập viên
   * không có hồ sơ bệnh nhân nào cả. Client KHÔNG còn tự sinh id nữa: định danh
   * bệnh nhân là thứ thuộc về tài khoản, không thuộc về cái máy đang mở trang.
   */
  patientId: string | null
  /** Hồ sơ đã khai, `null` khi chưa có hoặc chưa đọc xong. */
  profile: PatientProfileResponse | null
  profileState: ProfileState
  /** Chỉ khác `null` khi `profileState` là `error`. */
  profileError: ApiError | null
  /** Đọc lại hồ sơ, dùng cho nút thử lại. */
  reloadProfile: () => void
}

export const PatientContext = createContext<PatientContextValue | null>(null)

export function usePatient(): PatientContextValue {
  const value = useContext(PatientContext)
  if (value === null) {
    throw new Error('usePatient phải được gọi bên trong <PatientProvider>.')
  }
  return value
}
