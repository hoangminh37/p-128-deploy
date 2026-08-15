/**
 * Provider giữ patient_id ẩn danh và hồ sơ tương ứng.
 *
 * patient_id sinh hoàn toàn ở client và không mang thông tin định danh thật:
 * chỉ là một UUID ngẫu nhiên. Hợp đồng API ở mục 4 cũng cấm gửi tên, số điện
 * thoại hay số căn cước, nên không có gì để lẫn vào đây.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'

import { ApiError, getPatientProfile } from '../lib/api'
import type { PatientProfileResponse } from '../lib/schemas'
import {
  PATIENT_ID_STORAGE_KEY,
  PatientContext,
  patientProfileQueryKey,
  type PatientContextValue,
  type ProfileState,
} from './context'

/**
 * localStorage ném lỗi khi trình duyệt ở chế độ ẩn danh hoặc chặn cookie bên
 * thứ ba. Hỏng chỗ này không được làm sập cả ứng dụng — cùng lắm là bệnh nhân
 * phải khai lại hồ sơ ở lần mở sau.
 */
function readStoredPatientId(): string | null {
  try {
    const stored = window.localStorage.getItem(PATIENT_ID_STORAGE_KEY)
    return stored !== null && stored.trim() !== '' ? stored : null
  } catch {
    return null
  }
}

function writeStoredPatientId(patientId: string): void {
  try {
    window.localStorage.setItem(PATIENT_ID_STORAGE_KEY, patientId)
  } catch {
    // Không lưu được thì phiên này vẫn chạy bình thường, chỉ là không nhớ được.
  }
}

function removeStoredPatientId(): void {
  try {
    window.localStorage.removeItem(PATIENT_ID_STORAGE_KEY)
  } catch {
    // Không xóa được cũng không có gì để làm thêm.
  }
}

/** UUID ngẫu nhiên — không suy ra được gì về người dùng từ giá trị này. */
function createPatientId(): string {
  return crypto.randomUUID()
}

export function PatientProvider({ children }: { children: ReactNode }) {
  const [patientId, setPatientId] = useState<string | null>(readStoredPatientId)

  const ensurePatientId = useCallback((): string => {
    // Đọc lại localStorage thay vì tin vào state: một tab khác có thể đã sinh id
    // trước đó, và hai tab dùng chung một hồ sơ thì đúng hơn là tách làm hai.
    const existing = readStoredPatientId()
    if (existing !== null) {
      setPatientId(existing)
      return existing
    }

    const created = createPatientId()
    writeStoredPatientId(created)
    setPatientId(created)
    return created
  }, [])

  const clearPatient = useCallback((): void => {
    removeStoredPatientId()
    setPatientId(null)
  }, [])

  const profileQuery = useQuery<PatientProfileResponse | null, ApiError>({
    queryKey: patientProfileQueryKey(patientId),
    enabled: patientId !== null,
    queryFn: async () => {
      // `enabled` đã chặn, nhánh này chỉ để thuyết phục TypeScript.
      if (patientId === null) return null
      try {
        return await getPatientProfile(patientId)
      } catch (error) {
        // 404 nghĩa là chưa khai hồ sơ, không phải sự cố. Nuốt tại đây để tầng
        // trên chỉ thấy `null` thay vì phải tự đoán ý nghĩa của mã lỗi.
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
  })

  const { data, isPending, isError, error, refetch } = profileQuery

  const profileState: ProfileState = useMemo(() => {
    if (patientId === null) return 'idle'
    if (isError) return 'error'
    if (isPending) return 'loading'
    return data === null ? 'absent' : 'ready'
  }, [patientId, isPending, isError, data])

  const reloadProfile = useCallback((): void => {
    void refetch()
  }, [refetch])

  const value = useMemo<PatientContextValue>(
    () => ({
      patientId,
      ensurePatientId,
      clearPatient,
      profile: data ?? null,
      profileState,
      profileError: isError ? error : null,
      reloadProfile,
    }),
    [
      patientId,
      ensurePatientId,
      clearPatient,
      data,
      profileState,
      isError,
      error,
      reloadProfile,
    ],
  )

  return <PatientContext value={value}>{children}</PatientContext>
}
