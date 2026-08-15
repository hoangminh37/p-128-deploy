/**
 * Provider giữ hồ sơ của bệnh nhân đang đăng nhập.
 *
 * `patient_id` KHÔNG còn sinh ở client nữa. Nó đến từ response `/auth/login`
 * (hợp đồng mục 3), nên định danh bệnh nhân đi theo TÀI KHOẢN chứ không đi theo
 * cái máy đang mở trang — đăng nhập ở máy khác vẫn thấy đúng hồ sơ và đúng lịch
 * sử hội thoại của mình.
 *
 * Với vai trò `editor` thì `patient_id` là `null` và query bên dưới không chạy:
 * biên tập viên không có hồ sơ bệnh nhân nào để đọc.
 *
 * Hợp đồng mục 4 cấm gửi tên, số điện thoại hay số căn cước, nên không có gì
 * định danh thật lẫn vào đây.
 */
import { useCallback, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'

import { ApiError, getPatientProfile } from '../lib/api'
import type { PatientProfileResponse } from '../lib/schemas'
import { useSession } from '../session/context'
import {
  PatientContext,
  patientProfileQueryKey,
  type PatientContextValue,
  type ProfileState,
} from './context'

export function PatientProvider({ children }: { children: ReactNode }) {
  const { user } = useSession()
  const patientId = user?.patient_id ?? null

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
      profile: data ?? null,
      profileState,
      profileError: isError ? error : null,
      reloadProfile,
    }),
    [patientId, data, profileState, isError, error, reloadProfile],
  )

  return <PatientContext value={value}>{children}</PatientContext>
}
