/** Query keys and cache hooks for authenticated doctor consultations. */
import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getConsultation,
  getDoctorDashboard,
  getDoctorPublicProfile,
  getOwnDoctorProfile,
  listAdminDoctors,
  listAvailableDoctors,
  listConsultations,
  listDoctorNotifications,
  type ApiError,
} from '../lib/api'
import type {
  AdminDoctorList,
  ConsultationDetail,
  ConsultationList,
  DoctorDashboard,
  DoctorList,
  DoctorNotificationList,
  DoctorOwnProfile,
  DoctorPublicProfile,
} from '../lib/schemas'

const CONSULTATION_ROOT = 'consultations'

export const consultationKeys = {
  root: [CONSULTATION_ROOT] as const,
  doctors: () => [CONSULTATION_ROOT, 'available-doctors'] as const,
  doctorProfile: (doctorId: string) => [CONSULTATION_ROOT, 'doctor-profile', doctorId] as const,
  adminDoctors: () => [CONSULTATION_ROOT, 'admin-doctors'] as const,
  notifications: () => [CONSULTATION_ROOT, 'doctor-notifications'] as const,
  dashboard: () => [CONSULTATION_ROOT, 'doctor-dashboard'] as const,
  ownDoctorProfile: () => [CONSULTATION_ROOT, 'own-doctor-profile'] as const,
  list: () => [CONSULTATION_ROOT, 'list'] as const,
  detail: (consultationId: string) => [CONSULTATION_ROOT, 'detail', consultationId] as const,
}

export function useAvailableDoctors() {
  return useQuery<DoctorList, ApiError>({
    queryKey: consultationKeys.doctors(),
    queryFn: listAvailableDoctors,
  })
}

export function useDoctorPublicProfile(doctorId: string) {
  return useQuery<DoctorPublicProfile, ApiError>({
    queryKey: consultationKeys.doctorProfile(doctorId),
    queryFn: () => getDoctorPublicProfile(doctorId),
    enabled: doctorId !== '',
  })
}

export function useAdminDoctors() {
  return useQuery<AdminDoctorList, ApiError>({
    queryKey: consultationKeys.adminDoctors(),
    queryFn: listAdminDoctors,
  })
}

export function useDoctorNotifications(enabled = true) {
  return useQuery<DoctorNotificationList, ApiError>({
    queryKey: consultationKeys.notifications(),
    queryFn: listDoctorNotifications,
    enabled,
    refetchInterval: 5_000,
  })
}

export function useOwnDoctorProfile() {
  return useQuery<DoctorOwnProfile, ApiError>({
    queryKey: consultationKeys.ownDoctorProfile(),
    queryFn: getOwnDoctorProfile,
  })
}

export function useDoctorDashboard() {
  return useQuery<DoctorDashboard, ApiError>({
    queryKey: consultationKeys.dashboard(),
    queryFn: getDoctorDashboard,
    refetchInterval: 8_000,
  })
}

export function useConsultationList() {
  return useQuery<ConsultationList, ApiError>({
    queryKey: consultationKeys.list(),
    queryFn: listConsultations,
    // A request can be accepted while the doctor keeps this screen open.
    refetchInterval: 8_000,
  })
}

export function useConsultationDetail(consultationId: string) {
  return useQuery<ConsultationDetail, ApiError>({
    queryKey: consultationKeys.detail(consultationId),
    queryFn: () => getConsultation(consultationId),
    enabled: consultationId !== '',
    // Direct chat does not use a mock websocket. This short authenticated poll
    // keeps both participants in sync and can later be replaced transparently
    // by a realtime transport.
    refetchInterval: 2_000,
  })
}

/** Invalidate every projection changed by a consultation or doctor mutation. */
export function useInvalidateConsultations(): () => void {
  const queryClient = useQueryClient()
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: consultationKeys.root })
  }, [queryClient])
}
