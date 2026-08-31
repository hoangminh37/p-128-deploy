/** Separate operational alerts from the consultation list to prevent missed work. */
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { useDoctorNotifications, useInvalidateConsultations } from '../app/consultations'
import { markDoctorNotificationRead } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import type { DoctorNotification } from '../lib/schemas'
import { ErrorNotice } from '../ui/ErrorNotice'

function systemNotificationLabel(kind: DoctorNotification['kind']): string {
  return kind === 'request' ? 'Yêu cầu tư vấn mới' : 'Cuộc gọi video đang chờ'
}

function chatPath(consultationId: string): string {
  return `/doctor/consultations/${encodeURIComponent(consultationId)}`
}

/** The most recent alert represents each chat; all of its unread alerts are read together. */
function latestMessagesByConsultation(notifications: DoctorNotification[]): DoctorNotification[] {
  const latest = new Map<string, DoctorNotification>()
  for (const notification of notifications) {
    const previous = latest.get(notification.consultation_id)
    if (previous === undefined || notification.created_at > previous.created_at) {
      latest.set(notification.consultation_id, notification)
    }
  }
  return [...latest.values()].sort((left, right) => right.created_at.localeCompare(left.created_at))
}

export function DoctorNotificationsScreen() {
  const query = useDoctorNotifications()
  const invalidate = useInvalidateConsultations()
  const markRead = useMutation({
    mutationFn: markDoctorNotificationRead,
    onSuccess: invalidate,
  })
  const notifications = query.data?.notifications ?? []
  const systemNotifications = notifications.filter(
    (notification) => notification.kind === 'request' || notification.kind === 'video_call',
  )
  const patientMessageNotifications = notifications.filter(
    (notification) => notification.kind === 'patient_message',
  )
  const messageThreads = latestMessagesByConsultation(patientMessageNotifications)
  const unreadSystemCount = systemNotifications.filter((notification) => notification.read_at === null).length
  const unreadMessageCount = patientMessageNotifications.filter((notification) => notification.read_at === null).length

  function markMessageThreadRead(consultationId: string): void {
    for (const notification of patientMessageNotifications) {
      if (notification.consultation_id === consultationId && notification.read_at === null) {
        markRead.mutate(notification.notification_id)
      }
    }
  }

  return <div className="max-w-reading">
    <h1 className="text-ask font-semibold text-body">Thông báo</h1>
    <p className="mt-snug max-w-answer text-notice text-body">Yêu cầu và tin nhắn mới được hiển thị riêng, để bạn biết chính xác việc nào cần xử lý.</p>

    {query.isPending && <p role="status" className="font-display mt-block text-notice text-slate">Đang kiểm tra thông báo…</p>}
    {query.isError && <div className="mt-block"><ErrorNotice error={query.error} retryLabel="Đọc lại thông báo" onRetry={() => void query.refetch()} /></div>}

    {!query.isPending && !query.isError && <>
      <section className="mt-block" aria-labelledby="system-notification-title">
        <div className="flex flex-wrap items-center justify-between gap-tight">
          <div>
            <h2 id="system-notification-title" className="text-heading font-semibold text-body">Thông báo hệ thống</h2>
            <p className="font-display mt-hair text-question text-slate">Yêu cầu tư vấn và lời mời gọi video.</p>
          </div>
          {unreadSystemCount > 0 && <span className="font-mono rounded-pill bg-mint px-snug py-hair text-question font-bold text-mint-deep">{unreadSystemCount} chưa đọc</span>}
        </div>
        {systemNotifications.length === 0 && <p className="font-display mt-snug rounded-card border border-line bg-canvas p-snug text-question text-slate">Không có thông báo hệ thống cần xử lý.</p>}
        {systemNotifications.length > 0 && <ul className="mt-snug grid gap-tight sm:grid-cols-2">{systemNotifications.map((notification) => <li key={notification.notification_id} className={`rounded-card border p-snug ${notification.read_at === null ? 'border-mint bg-mint/15' : 'border-line bg-surface'}`}>
          <div className="flex items-start justify-between gap-tight">
            <div>
              <p className="font-display text-input font-semibold text-body">{systemNotificationLabel(notification.kind)}</p>
              <p className="font-display mt-hair text-question text-slate">{formatDateTime(notification.created_at)}</p>
            </div>
            {notification.read_at === null && <span className="font-display rounded-pill bg-ink px-tight py-hair text-note font-semibold text-white">Mới</span>}
          </div>
          <Link to={chatPath(notification.consultation_id)} onClick={() => { if (notification.read_at === null) markRead.mutate(notification.notification_id) }} className="motion-press font-display mt-snug inline-flex min-h-touch items-center rounded-pill border-2 border-slate px-cozy text-input font-semibold text-body no-underline hover:bg-canvas">Mở phiên</Link>
        </li>)}</ul>}
      </section>

      <section className="mt-block" aria-labelledby="patient-message-title">
        <div className="flex flex-wrap items-center justify-between gap-tight">
          <div>
            <h2 id="patient-message-title" className="text-heading font-semibold text-body">Tin nhắn mới từ bệnh nhân</h2>
            <p className="font-display mt-hair text-question text-slate">Nội dung chat được tách khỏi thông báo hệ thống.</p>
          </div>
          {unreadMessageCount > 0 && <span className="font-mono rounded-pill bg-mint px-snug py-hair text-question font-bold text-mint-deep">{unreadMessageCount} chưa đọc</span>}
        </div>
        {messageThreads.length === 0 && <p className="font-display mt-snug rounded-card border border-line bg-canvas p-snug text-question text-slate">Chưa có tin nhắn mới.</p>}
        {messageThreads.length > 0 && <ul className="mt-snug space-y-tight">{messageThreads.map((notification) => <li key={notification.consultation_id} className={`rounded-card border p-snug ${notification.read_at === null ? 'border-mint bg-surface' : 'border-line bg-surface'}`}>
          <div className="flex items-start justify-between gap-snug">
            <div className="min-w-0 flex-1">
              <p className="font-display text-input font-semibold text-body">Cuộc trò chuyện đang tư vấn</p>
              <p className="font-display mt-hair line-clamp-2 text-input text-body">{notification.content_preview ?? 'Bệnh nhân đã gửi một tin nhắn mới.'}</p>
              <p className="font-display mt-tight text-note text-slate">{formatDateTime(notification.created_at)}</p>
            </div>
            {notification.read_at === null && <span className="font-display shrink-0 rounded-pill bg-mint px-tight py-hair text-note font-bold text-mint-deep">Mới</span>}
          </div>
          <Link to={chatPath(notification.consultation_id)} onClick={() => markMessageThreadRead(notification.consultation_id)} className="motion-press font-display mt-tight inline-flex min-h-touch items-center rounded-pill bg-mint px-cozy text-input font-bold text-mint-deep no-underline hover:bg-mint-press">Mở chat</Link>
        </li>)}</ul>}
      </section>
    </>}
  </div>
}
