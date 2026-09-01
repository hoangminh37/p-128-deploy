/**
 * Thông báo của bác sỹ — `/doctor/notifications`.
 *
 * CHÉP TỪ `id="bstb"`. Bản mẫu tách màn này làm HAI nhóm rời hẳn nhau, mỗi
 * nhóm mở đầu bằng một nhãn `.eb.solo` nằm cùng hàng với `.chip.cho` đếm số
 * mới:
 *
 *   TRÊN   thông báo hệ thống — yêu cầu tư vấn và lời mời gọi video — dựng
 *          bằng `.auto`, mỗi cái một thẻ `.phieu` riêng.
 *   DƯỚI   tin nhắn bệnh nhân, gộp trong MỘT `.phieu` nhiều hàng ngăn bằng
 *          nét `--ke`, đóng lại bằng `.rangcua`.
 *
 * Tách hai nhóm là chủ ý: một yêu cầu chưa nhận và một tin nhắn chưa đọc đòi
 * hai hành động khác nhau, gộp chung thì cái nọ che cái kia.
 *
 * Bản mẫu vẽ mọi thẻ ở trạng thái mới — viền `--tim` 2px kèm chip "Mới". Ở
 * đây hai thứ đó chỉ hiện khi `read_at === null`.
 */
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

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="eb">Khu vực bác sỹ</div>

      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 10 }}>Thông báo</h1>

      {query.isPending && (
        <p role="status" className="lab" style={{ marginTop: 22, lineHeight: 1.6 }}>
          Đang kiểm tra thông báo…
        </p>
      )}

      {query.isError && (
        <div style={{ marginTop: 22 }}>
          <ErrorNotice
            error={query.error}
            retryLabel="Đọc lại thông báo"
            onRetry={() => void query.refetch()}
          />
        </div>
      )}

      {!query.isPending && !query.isError && (
        <>
          {/* ---- Nhóm trên: thông báo hệ thống ---- */}
          <section aria-labelledby="system-notification-title">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 12,
                marginTop: 28,
              }}
            >
              <div id="system-notification-title" className="eb solo" style={{ margin: 0 }}>
                Thông báo hệ thống
              </div>
              {unreadSystemCount > 0 && <span className="chip cho">{unreadSystemCount} mới</span>}
            </div>

            <p style={{ fontSize: 'var(--t-note)', color: 'var(--xam)', marginTop: 6 }}>
              Yêu cầu tư vấn và lời mời gọi video.
            </p>

            {systemNotifications.length === 0 ? (
              <p className="lab" style={{ marginTop: 12, lineHeight: 1.6 }}>
                Không có thông báo hệ thống cần xử lý.
              </p>
            ) : (
              <ul className="auto" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
                {systemNotifications.map((notification) => {
                  const isUnread = notification.read_at === null
                  return (
                    <li
                      key={notification.notification_id}
                      className="phieu"
                      style={isUnread ? { borderColor: 'var(--tim)', borderWidth: 2 } : undefined}
                    >
                      <div style={{ padding: '16px clamp(14px,1.8vw,20px)' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <p style={{ fontWeight: 500, flex: 1, minWidth: 150 }}>
                            {systemNotificationLabel(notification.kind)}
                          </p>
                          {isUnread && <span className="chip cho">Mới</span>}
                        </div>

                        <p className="lab" style={{ marginTop: 4 }}>
                          {formatDateTime(notification.created_at)}
                        </p>

                        <Link
                          to={chatPath(notification.consultation_id)}
                          onClick={() => {
                            if (isUnread) markRead.mutate(notification.notification_id)
                          }}
                          className="btn sm"
                          style={{ marginTop: 12 }}
                        >
                          Mở phiên
                        </Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* ---- Nhóm dưới: tin nhắn bệnh nhân ---- */}
          <section aria-labelledby="patient-message-title">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 12,
                marginTop: 32,
              }}
            >
              <div id="patient-message-title" className="eb solo" style={{ margin: 0 }}>
                Tin nhắn mới từ bệnh nhân
              </div>
              {unreadMessageCount > 0 && <span className="chip cho">{unreadMessageCount} mới</span>}
            </div>

            <p style={{ fontSize: 'var(--t-note)', color: 'var(--xam)', marginTop: 6 }}>
              Nội dung chat được tách khỏi thông báo hệ thống.
            </p>

            {messageThreads.length === 0 ? (
              <p className="lab" style={{ marginTop: 12, lineHeight: 1.6 }}>
                Chưa có tin nhắn mới.
              </p>
            ) : (
              <div className="phieu" style={{ marginTop: 12 }}>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {messageThreads.map((notification, index) => {
                    const isUnread = notification.read_at === null
                    const isLast = index === messageThreads.length - 1
                    return (
                      <li
                        key={notification.consultation_id}
                        style={{
                          display: 'flex',
                          gap: 14,
                          alignItems: 'flex-start',
                          padding: '16px clamp(16px,2vw,22px)',
                          borderBottom: isLast ? undefined : '1px solid var(--ke)',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <p style={{ fontWeight: 500 }}>Cuộc trò chuyện đang tư vấn</p>
                          <p
                            style={{
                              fontSize: 'var(--t-note)',
                              color: 'var(--xam)',
                              marginTop: 5,
                              maxWidth: '52ch',
                            }}
                          >
                            {notification.content_preview ?? 'Bệnh nhân đã gửi một tin nhắn mới.'}
                          </p>
                          <p className="lab" style={{ marginTop: 4 }}>
                            {formatDateTime(notification.created_at)}
                          </p>
                        </div>

                        {isUnread && <span className="chip cho">Mới</span>}

                        <Link
                          to={chatPath(notification.consultation_id)}
                          onClick={() => markMessageThreadRead(notification.consultation_id)}
                          className={isUnread ? 'btn sm' : 'btn sm gh'}
                        >
                          Mở chat
                        </Link>
                      </li>
                    )
                  })}
                </ul>
                <div className="rangcua" />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
