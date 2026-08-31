/** Cache hooks for the authenticated patient's private notification inbox. */
import { useQuery } from '@tanstack/react-query'

import { listPatientNotifications, type ApiError } from '../lib/api'
import type { PatientNotificationList } from '../lib/schemas'

export const patientNotificationKey = ['patient-notifications'] as const

export function usePatientNotifications(enabled = true) {
  return useQuery<PatientNotificationList, ApiError>({
    queryKey: patientNotificationKey,
    queryFn: listPatientNotifications,
    enabled,
    // The bell is intentionally lightweight; an inbox refresh never blocks chat.
    refetchInterval: 10_000,
  })
}
