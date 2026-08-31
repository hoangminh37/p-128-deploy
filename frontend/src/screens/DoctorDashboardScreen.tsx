/** Doctor home screen composed only from authenticated operational data. */
import { Link } from 'react-router-dom'

import { useDoctorDashboard } from '../app/consultations'
import { formatDateTime } from '../lib/datetime'
import type { ConsultationStatus } from '../lib/schemas'
import { EmptyState } from '../ui/EmptyState'
import { ErrorNotice } from '../ui/ErrorNotice'

const STATUS_LABEL: Record<ConsultationStatus, string> = {
  requested: 'Cần nhận phiên',
  active: 'Đang tư vấn',
  ended: 'Đã kết thúc',
}

function consultationPath(consultationId: string): string {
  return `/doctor/consultations/${encodeURIComponent(consultationId)}`
}

export function DoctorDashboardScreen() {
  const query = useDoctorDashboard()

  if (query.isPending) return <p role="status" className="font-display text-notice text-slate">Đang chuẩn bị tổng quan tư vấn…</p>
  if (query.isError) return <ErrorNotice error={query.error} retryLabel="Tải lại tổng quan" onRetry={() => void query.refetch()} />
  const dashboard = query.data
  if (dashboard === undefined) return null

  const cards = [
    {
      label: 'Cần nhận phiên',
      value: dashboard.pending_consultation_count,
      detail: 'Yêu cầu bệnh nhân đang chờ bạn xử lý.',
      to: '/doctor/consultations',
    },
    {
      label: 'Tin nhắn chưa đọc',
      value: dashboard.unread_patient_message_count,
      detail: 'Tin nhắn mới được tách riêng trong Thông báo.',
      to: '/doctor/notifications',
    },
    {
      label: 'Đang tư vấn',
      value: dashboard.active_consultation_count,
      detail: 'Các phiên chat và gọi video đang mở.',
      to: '/doctor/consultations',
    },
  ]

  return <div className="max-w-reading">
    <div className="flex flex-wrap items-start justify-between gap-snug">
      <div>
        <h1 className="text-ask font-semibold text-body">Tổng quan tư vấn</h1>
        <p className="mt-snug max-w-answer text-notice text-body">Theo dõi công việc cần xử lý và quay lại đúng phiên tư vấn một cách nhanh chóng.</p>
      </div>
      <Link to="/doctor/profile" className={`motion-press font-display inline-flex min-h-touch items-center rounded-pill px-snug text-question font-semibold no-underline ${dashboard.is_available ? 'bg-mint text-mint-deep hover:bg-mint-press' : 'bg-sand text-sand-deep hover:brightness-95'}`}>
        {dashboard.is_active ? (dashboard.is_available ? 'Đang nhận tư vấn' : 'Đang tắt nhận tư vấn') : 'Tài khoản đang tạm ngưng'}
      </Link>
    </div>

    <section className="mt-block grid gap-snug sm:grid-cols-3" aria-label="Việc cần xử lý">
      {cards.map((card) => <Link key={card.label} to={card.to} className="motion-press rounded-card-lg bg-surface p-cozy no-underline hover:bg-canvas">
        <p className="font-display text-question font-semibold text-body">{card.label}</p>
        <p className="font-mono mt-tight text-ask font-bold text-mint-deep">{card.value}</p>
        <p className="font-display mt-tight text-question text-slate">{card.detail}</p>
      </Link>)}
    </section>

    {dashboard.unread_system_notification_count > 0 && <section className="font-display mt-snug rounded-card border border-mint bg-mint/15 p-snug" aria-label="Thông báo hệ thống chưa đọc">
      <p className="text-input font-semibold text-body">Có {dashboard.unread_system_notification_count} thông báo hệ thống chưa đọc.</p>
      <Link to="/doctor/notifications" className="mt-hair inline-flex min-h-touch items-center text-question font-semibold text-mint-deep underline underline-offset-4">Mở Thông báo</Link>
    </section>}

    <section className="mt-block" aria-labelledby="recent-consultations-title">
      <div className="flex flex-wrap items-end justify-between gap-tight">
        <div>
          <h2 id="recent-consultations-title" className="text-heading font-semibold text-body">Phiên gần đây</h2>
          <p className="font-display mt-hair text-question text-slate">Không hiển thị thông tin định danh của bệnh nhân ngoài từng phiên tư vấn.</p>
        </div>
        <Link to="/doctor/consultations" className="font-display inline-flex min-h-touch items-center text-input font-semibold text-body underline underline-offset-4">Xem tất cả phiên</Link>
      </div>
      {dashboard.recent_consultations.length === 0 && <div className="mt-snug"><EmptyState title="Chưa có phiên tư vấn" body="Khi bệnh nhân chọn tư vấn với bạn, phiên mới sẽ xuất hiện ở đây." /></div>}
      {dashboard.recent_consultations.length > 0 && <ul className="mt-snug space-y-tight">{dashboard.recent_consultations.map((consultation) => <li key={consultation.consultation_id} className="rounded-card border border-line bg-surface p-snug">
        <div className="flex flex-wrap items-start justify-between gap-snug">
          <div>
            <h3 className="text-notice font-semibold text-body">Phiên tư vấn</h3>
            <p className="font-display mt-hair text-question text-slate">Cập nhật {formatDateTime(consultation.last_message_at ?? consultation.requested_at)}</p>
          </div>
          <span className="font-display rounded-pill bg-canvas px-snug py-hair text-question font-semibold text-body">{STATUS_LABEL[consultation.status]}</span>
        </div>
        <Link to={consultationPath(consultation.consultation_id)} className="motion-press font-display mt-tight inline-flex min-h-touch items-center rounded-pill border-2 border-slate px-cozy text-input font-semibold text-body no-underline hover:bg-canvas">Mở phiên</Link>
      </li>)}</ul>}
    </section>
  </div>
}
