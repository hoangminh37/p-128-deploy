/**
 * Danh sách phiên tư vấn của bác sỹ — `/doctor/consultations`.
 *
 * CHÉP TỪ `id="bsps"`: nhãn `.eb` "Khu vực bác sỹ", tiêu đề, một đoạn dẫn, rồi
 * mỗi phiên là một `.phieu` đóng bằng `.rangcua`. Trong mỗi thẻ là một hàng
 * "Phiên tư vấn + mốc cập nhật" đẩy `.chip` trạng thái sang mép phải, và một
 * nút mở phiên.
 *
 * ĐIỂM RIÊNG CỦA MÀN NÀY là dải tin nhắn chưa đọc mà bản mẫu vẽ trong thẻ đầu:
 * nền `--tim-wash`, một nét dọc `--tim`, đếm số tin và trích một dòng nội dung.
 * Nó chỉ hiện ở phiên thật sự còn tin chưa đọc, và khi có nó thì thẻ đổi sang
 * viền `--tim` 2px cùng nút `.btn.pri` — cả ba dấu hiệu cùng chỉ về một việc,
 * để bác sỹ không phải dò từng thẻ mới biết chỗ nào cần trả lời.
 *
 * KHÔNG HIỆN THÔNG TIN ĐỊNH DANH BỆNH NHÂN ở màn này, đúng như bản mẫu: mỗi
 * hàng chỉ nói "Phiên tư vấn" và mốc cập nhật. Danh tính chỉ có bên trong
 * phòng tư vấn.
 */
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

/**
 * Ba trạng thái, ba lớp `.chip` của bản mẫu — cùng một bảng với `id="bstq"`.
 *
 * `cho` (tím) là việc đang chờ người này làm, `duyet` (xanh) là việc đang
 * chạy, phiên đã đóng thì chip trơn.
 */
const STATUS_CHIP: Record<ConsultationStatus, string> = {
  requested: 'chip cho',
  active: 'chip duyet',
  ended: 'chip',
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

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="eb">Khu vực bác sỹ</div>

      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 10 }}>
        Các phiên tư vấn
      </h1>

      <p style={{ fontSize: 'var(--t-note)', color: 'var(--xam)', marginTop: 12, maxWidth: '58ch' }}>
        Theo dõi từng phiên tư vấn của bạn. Tin nhắn chưa đọc cũng hiện ngay trên phiên tương ứng.
      </p>

      {query.isPending && (
        <p role="status" className="lab" style={{ marginTop: 22, lineHeight: 1.6 }}>
          Đang đọc các phiên tư vấn…
        </p>
      )}

      {query.isError && (
        <div style={{ marginTop: 22 }}>
          <ErrorNotice error={query.error} retryLabel="Đọc lại" onRetry={() => void query.refetch()} />
        </div>
      )}

      {!query.isPending && !query.isError && consultations.length === 0 && (
        <div className="phieu" style={{ marginTop: 22 }}>
          <EmptyState
            title="Chưa có phiên tư vấn"
            body="Yêu cầu bệnh nhân gửi cho bạn sẽ xuất hiện tại đây."
          />
          <div className="rangcua" />
        </div>
      )}

      {consultations.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {consultations.map((consultation, index) => {
            const alert = unreadAlerts.get(consultation.consultation_id)
            const hasAlert = alert !== undefined

            return (
              <li
                key={consultation.consultation_id}
                className="phieu"
                style={{
                  marginTop: index === 0 ? 22 : 14,
                  ...(hasAlert ? { borderColor: 'var(--tim)', borderWidth: 2 } : null),
                }}
              >
                <div style={{ padding: '16px clamp(16px,2vw,22px)' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <p style={{ fontWeight: 500 }}>Phiên tư vấn</p>
                      <p className="lab">
                        Cập nhật{' '}
                        {formatDateTime(consultation.last_message_at ?? consultation.requested_at)}
                      </p>
                    </div>

                    <span className={STATUS_CHIP[consultation.status]}>
                      {STATUS_LABEL[consultation.status]}
                    </span>

                    {/* Phiên không có tin chưa đọc thì nút nằm ngay trên hàng
                        này, đúng như hai thẻ dưới của bản mẫu. Phiên CÓ tin
                        chưa đọc đẩy nút xuống dưới dải tím, để thứ tự đọc là
                        "có gì mới" trước rồi mới tới việc bấm. */}
                    {!hasAlert && (
                      <Link
                        to={chatPath(consultation.consultation_id)}
                        className={consultation.status === 'ended' ? 'btn sm gh' : 'btn sm'}
                      >
                        Mở chat
                      </Link>
                    )}
                  </div>

                  {hasAlert && (
                    <>
                      <div
                        role="status"
                        aria-live="polite"
                        style={{
                          marginTop: 12,
                          padding: '12px 14px',
                          background: 'var(--tim-wash)',
                          borderLeft: '2px solid var(--tim)',
                        }}
                      >
                        <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
                          <p style={{ fontWeight: 500, fontSize: 'var(--t-note)' }}>
                            Tin nhắn mới{alert.count > 1 ? ` · ${alert.count} tin chưa đọc` : ''}
                          </p>
                          <span className="chip cho">Mới</span>
                        </div>
                        <p
                          style={{
                            fontSize: 'var(--t-note)',
                            color: 'var(--xam)',
                            marginTop: 5,
                            maxWidth: '52ch',
                          }}
                        >
                          {alert.latest.content_preview ?? 'Bệnh nhân đã gửi một tin nhắn mới.'}
                        </p>
                      </div>

                      <Link
                        to={chatPath(consultation.consultation_id)}
                        onClick={() => markMessageThreadRead(consultation.consultation_id)}
                        className="btn pri sm"
                        style={{ marginTop: 14 }}
                      >
                        Mở tin nhắn mới
                      </Link>
                    </>
                  )}
                </div>

                <div className="rangcua" />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
