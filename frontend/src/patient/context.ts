/**
 * Context lưu danh tính ẩn danh và hồ sơ của bệnh nhân đang dùng máy này.
 *
 * Tách context và hook ra khỏi file provider để provider chỉ export component,
 * giữ Fast Refresh của Vite hoạt động đúng.
 */
import { createContext, useContext } from 'react'

import type { ApiError } from '../lib/api'
import type { PatientProfileResponse } from '../lib/schemas'

/** Khóa localStorage. Đặt tiền tố theo app để không đụng khóa của thư viện khác. */
export const PATIENT_ID_STORAGE_KEY = 'tro-ly-suc-khoe:patient_id'

/**
 * Trạng thái đọc hồ sơ.
 *
 * `absent` tách riêng khỏi `error` vì 404 không phải sự cố: bệnh nhân mới chỉ
 * đơn giản là chưa khai hồ sơ, và màn `/profile` cần phân biệt hai ca này để
 * không dọa người dùng bằng thông báo lỗi.
 */
export type ProfileState = 'idle' | 'loading' | 'ready' | 'absent' | 'error'

export type PatientContextValue = {
  /** `null` khi máy này chưa từng bắt đầu một phiên nào. */
  patientId: string | null
  /**
   * Trả về patient_id hiện có, hoặc sinh mới rồi lưu vào localStorage.
   *
   * Gọi khi người dùng thực sự bắt đầu (chọn vai trò, gửi hồ sơ), KHÔNG gọi lúc
   * app khởi động — sinh sẵn sẽ khiến guard của `/chat` không bao giờ chạy.
   */
  ensurePatientId: () => string
  /** Xóa danh tính khỏi máy này, dùng cho nút "bắt đầu lại" ở bước sau. */
  clearPatient: () => void
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
