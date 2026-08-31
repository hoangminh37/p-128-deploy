/** Compact patient notification inbox, intentionally available from any screen. */
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import { usePatientNotifications } from '../app/patientNotifications'
import { markPatientNotificationRead } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import type { PatientNotification } from '../lib/schemas'
import { BellIcon, CloseIcon } from './icons'

export function PatientNotificationBell({ isDark }: { isDark: boolean }) {
  const [isOpen, setOpen] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState<PatientNotification | null>(null)
  const query = usePatientNotifications()
  const markRead = useMutation({
    mutationFn: markPatientNotificationRead,
    onSuccess: () => void query.refetch(),
  })
  const notifications = query.data?.notifications ?? []
  const unreadCount = query.data?.unread_count ?? 0

  useEffect(() => {
    if (selectedNotification === null) return

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setSelectedNotification(null)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedNotification])

  function openNotification(notification: PatientNotification): void {
    setSelectedNotification(notification)
    setOpen(false)
    if (notification.read_at === null) markRead.mutate(notification.notification_id)
  }

  return <div className="relative shrink-0">
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      aria-label={unreadCount === 0 ? 'Mở thông báo' : `Mở thông báo, ${unreadCount} chưa đọc`}
      aria-expanded={isOpen}
      aria-controls="patient-notification-list"
      className={`motion-press relative flex min-h-touch min-w-touch items-center justify-center rounded-icon ${isDark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-surface text-body hover:bg-canvas'}`}
    >
      <BellIcon className="h-6 w-6" />
      {unreadCount > 0 && <span aria-hidden="true" className="font-mono absolute -right-1 -top-1 min-w-5 rounded-pill bg-mint px-hair text-note font-bold text-mint-deep">{unreadCount > 9 ? '9+' : unreadCount}</span>}
    </button>

    {isOpen && <section id="patient-notification-list" aria-label="Danh sách thông báo" className={`absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(24rem,calc(100vw-2rem))] rounded-card border p-snug shadow-card ${isDark ? 'border-white/15 bg-ink text-white' : 'border-line bg-surface text-body'}`}>
      <div className="flex items-center justify-between gap-tight">
        <h2 className="text-input font-semibold">Thông báo</h2>
        {unreadCount > 0 && <span className="font-mono rounded-pill bg-mint px-tight py-hair text-note font-bold text-mint-deep">{unreadCount} mới</span>}
      </div>
      {query.isPending && <p role="status" className={`font-display mt-snug text-question ${isDark ? 'text-mist' : 'text-slate'}`}>Đang đọc thông báo…</p>}
      {query.isError && <button type="button" onClick={() => void query.refetch()} className="font-display mt-snug min-h-touch rounded-pill border-2 border-slate px-cozy text-question font-semibold">Đọc lại thông báo</button>}
      {!query.isPending && !query.isError && notifications.length === 0 && <p className={`font-display mt-snug text-question ${isDark ? 'text-mist' : 'text-slate'}`}>Bạn chưa có thông báo mới.</p>}
      {notifications.length > 0 && <ul className="mt-snug max-h-80 space-y-tight overflow-y-auto">{notifications.map((notification) => <li key={notification.notification_id}>
        <button type="button" onClick={() => openNotification(notification)} className={`w-full rounded-card border p-snug text-left ${notification.read_at === null ? 'border-mint bg-mint/15' : isDark ? 'border-white/15 bg-white/5' : 'border-line bg-canvas'}`}>
          <p className="font-display text-question font-semibold">{notification.title}</p>
          <p className="font-display mt-tight inline-flex rounded-pill bg-mint px-tight py-px text-note font-bold text-mint-deep">Trả lời cho câu hỏi</p>
          {notification.question !== null
            ? <p className="font-display mt-hair max-h-12 overflow-hidden text-question">{notification.question}</p>
            : <p className={`font-display mt-hair text-question ${isDark ? 'text-mist' : 'text-slate'}`}>Không còn tìm thấy câu hỏi gốc.</p>}
          <p className={`font-display mt-tight max-h-12 overflow-hidden whitespace-pre-wrap text-question ${isDark ? 'text-mist' : 'text-slate'}`}>{notification.body}</p>
          <p className={`font-display mt-tight text-note ${isDark ? 'text-mist' : 'text-slate'}`}>{formatDateTime(notification.created_at)}</p>
        </button>
      </li>)}</ul>}
      <p className={`font-display mt-snug border-t pt-snug text-note ${isDark ? 'border-white/15 text-mist' : 'border-line text-slate'}`}>Phản hồi biên tập không thay thế tư vấn khám, chẩn đoán hoặc điều trị.</p>
    </section>}

    {selectedNotification !== null && <>
      <button
        type="button"
        aria-label="Đóng chi tiết thông báo"
        onClick={() => setSelectedNotification(null)}
        className="fixed inset-0 z-50 cursor-default bg-ink/65 backdrop-blur-[1px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-notification-detail-title"
        className={`fixed inset-x-snug top-1/2 z-[60] mx-auto w-auto max-w-2xl -translate-y-1/2 rounded-card-lg border p-cozy shadow-card ${isDark ? 'border-white/15 bg-ink text-white' : 'border-line bg-surface text-body'}`}
      >
        <div className="flex items-start justify-between gap-snug">
          <div>
            <p id="patient-notification-detail-title" className="font-display text-heading font-semibold">{selectedNotification.title}</p>
            <p className={`font-display mt-hair text-note ${isDark ? 'text-mist' : 'text-slate'}`}>{formatDateTime(selectedNotification.created_at)}</p>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setSelectedNotification(null)}
            className={`motion-press flex min-h-touch min-w-touch items-center justify-center rounded-icon ${isDark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-canvas text-body hover:bg-line'}`}
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className={`mt-cozy rounded-card border p-snug ${isDark ? 'border-white/15 bg-white/5' : 'border-line bg-canvas'}`}>
          <p className="font-display inline-flex rounded-pill bg-mint px-tight py-px text-note font-bold text-mint-deep">Câu hỏi của bạn</p>
          <p className="font-display mt-tight whitespace-pre-wrap text-input leading-relaxed">{selectedNotification.question ?? 'Không còn tìm thấy câu hỏi gốc cho phản hồi này.'}</p>
        </div>

        <div className={`mt-snug rounded-card border p-snug ${isDark ? 'border-mint/60 bg-mint/10' : 'border-mint bg-mint/10'}`}>
          <p className="font-display inline-flex rounded-pill bg-mint px-tight py-px text-note font-bold text-mint-deep">Phản hồi từ biên tập viên y khoa</p>
          <p className="font-display mt-tight whitespace-pre-wrap text-input leading-relaxed">{selectedNotification.body}</p>
        </div>

        <p className={`font-display mt-snug text-note ${isDark ? 'text-mist' : 'text-slate'}`}>Phản hồi biên tập không thay thế tư vấn khám, chẩn đoán hoặc điều trị.</p>
      </section>
    </>}
  </div>
}
