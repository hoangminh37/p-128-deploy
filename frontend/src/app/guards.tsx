/**
 * Hai guard điều hướng, cùng đọc một sự thật: đã có patient_id trong
 * localStorage hay chưa (qua `usePatient`, vốn khởi tạo state từ localStorage).
 */
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { usePatient } from '../patient/context'

/**
 * `/chat` cần patient_id — không có thì mọi câu hỏi đều thiếu ngữ cảnh bệnh lý,
 * và câu trả lời y khoa chung chung còn nguy hiểm hơn là không trả lời.
 */
export function RequirePatient({ children }: { children: ReactNode }) {
  const { patientId } = usePatient()

  if (patientId === null) {
    return <Navigate to="/profile" replace />
  }
  return children
}

/** Đã có phiên rồi thì khỏi bắt chọn lại vai trò, vào thẳng chỗ hỏi đáp. */
export function RedirectIfPatientExists({ children }: { children: ReactNode }) {
  const { patientId } = usePatient()

  if (patientId !== null) {
    return <Navigate to="/chat" replace />
  }
  return children
}
