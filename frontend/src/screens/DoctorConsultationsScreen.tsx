/** A doctor's consultation list, including unread-message alerts in each session. */
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import {
  useConsultationList,
  useDoctorNotifications,
  useInvalidateConsultations,
} from '../app/consultations'
import { markDoctorNotificationRead } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import type { ConsultationStatus, DoctorNotification } from '../lib/schemas'
import { EmptyState } from '../ui/EmptyState'
import { ErrorNotice } from '../ui/ErrorNotice'

const STATUS_LABEL: Record<ConsultationStatus, string> = {
  requested: 'Cần nhận phiên',
  active: 'Đang tư vấn',
  ended: 'Đã kết thúc',
}

function chatPath(consultationId: string): string {
  return `/doctor/consultations/${encodeURIComponent(consultationId)}`
}

type UnreadMessageAlert = {
  count: number
  latest: DoctorNotification
}

/** Group unread patient-message notifications by their actual consultation. */
function unreadMessagesByConsultation(notifications: DoctorNotification[]): Map<string, UnreadMessageAlert> {
  const alerts = new Map<string, UnreadMessageAlert>()

  for (const notification of notifications) {
    if (notification.kind !== 'patient_message' || notification.read_at !== null) continue

    const current = alerts.get(notification.consultation_id)
    if (current === undefined) {
      alerts.set(notification.consultation_id, { count: 1, latest: notification })
      continue
    }

    alerts.set(notification.consultation_id, {
      count: current.count + 1,
      latest: notification.created_at > current.latest.created_at ? notification : current.latest,
    })
  }

  return alerts
}

export function DoctorConsultationsScreen() {
  const query = useConsultationList()
  const notificationsQuery = useDoctorNotifications()
  const invalidate = useInvalidateConsultations()
  const markRead = useMutation({
    mutationFn: markDoctorNotificationRead,
    onSuccess: invalidate,
  })
  const consultations = query.data?.consultations ?? []
  const notifications = notificationsQuery.data?.notifications ?? []
  const unreadAlerts = unreadMessagesByConsultation(notifications)

  function markMessageThreadRead(consultationId: string): void {
    for (const notification of notifications) {
      if (
        notification.consultation_id === consultationId
        && notification.kind === 'patient_message'
        && notification.read_at === null
      ) {
        markRead.mutate(notification.notification_id)
      }
    }
  }

  return <div className="max-w-reading">
    <h1 className="text-ask font-semibold text-body">Các phiên tư vấn</h1>
    <p className="mt-snug max-w-answer text-notice text-body">Theo dõi từng phiên tư vấn của bạn. Tin nhắn chưa đọc cũng hiện ngay trên phiên tương ứng.</p>

    {query.isPending && <p role="status" className="font-display mt-block text-notice text-slate">Đang đọc các phiên tư vấn…</p>}
    {query.isError && <div className="mt-block"><ErrorNotice error={query.error} retryLabel="Đọc lại" onRetry={() => void query.refetch()} /></div>}
    {!query.isPending && !query.isError && consultations.length === 0 && <div className="mt-block"><EmptyState title="Chưa có phiên tư vấn" body="Yêu cầu bệnh nhân gửi cho bạn sẽ xuất hiện tại đây." /></div>}

    {consultations.length > 0 && <ul className="mt-block space-y-tight">
      {consultations.map((consultation) => {
        const alert = unreadAlerts.get(consultation.consultation_id)

        return <li key={consultation.consultation_id} className={`rounded-card border bg-surface p-snug ${alert === undefined ? 'border-line' : 'border-mint'}`}>
          <div className="flex flex-wrap items-start justify-between gap-snug">
            <div>
              <h2 className="text-notice font-semibold text-body">Phiên tư vấn</h2>
              <p className="font-display mt-hair text-question text-slate">Cập nhật {formatDateTime(consultation.last_message_at ?? consultation.requested_at)}</p>
            </div>
            <span className="font-display rounded-pill bg-canvas px-snug py-hair text-question font-semibold text-body">{STATUS_LABEL[consultation.status]}</span>
          </div>

          {alert !== undefined && <aside role="status" aria-live="polite" className="font-display mt-snug rounded-card border border-mint bg-mint/15 p-snug">
            <div className="flex items-start justify-between gap-tight">
              <p className="text-input font-semibold text-body">Tin nhắn mới{alert.count > 1 ? ` · ${alert.count} tin chưa đọc` : ''}</p>
              <span className="shrink-0 rounded-pill bg-mint px-tight py-hair text-note font-bold text-mint-deep">Mới</span>
            </div>
            <p className="mt-hair line-clamp-2 text-input text-body">{alert.latest.content_preview ?? 'Bệnh nhân đã gửi một tin nhắn mới.'}</p>
          </aside>}

          <Link
            to={chatPath(consultation.consultation_id)}
            onClick={() => { if (alert !== undefined) markMessageThreadRead(consultation.consultation_id) }}
            className={`motion-press font-display mt-tight inline-flex min-h-touch items-center rounded-pill px-cozy text-input font-semibold no-underline ${alert === undefined ? 'border-2 border-slate text-body hover:bg-canvas' : 'bg-mint text-mint-deep hover:bg-mint-press'}`}
          >
            {alert === undefined ? 'Mở chat' : 'Mở tin nhắn mới'}
          </Link>
        </li>
      })}
    </ul>}
  </div>
}
