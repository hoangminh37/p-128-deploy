/**
 * Chuông thông báo của bệnh nhân, mở được từ mọi màn.
 *
 * DỰNG TỪ BẢN MẪU. Script dựng khung đặt vào `.top` của mọi màn vai bệnh nhân
 * đúng một phần tử:
 *
 *   `el('button','ico', I.chuong + '<span class="cham">3</span>')`
 *
 * tức nút `.ico` chuẩn kèm một huy hiệu `.cham` — mono 10px, nền `--do`, chữ
 * `--paper`, neo `absolute` ở góc trên phải của nút. Con số đó là số thông báo
 * CHƯA ĐỌC, và đỏ ở đây là đúng vai "có việc đang chờ bạn".
 *
 * Bản mẫu dừng ở cái nút. Bảng thả xuống và hộp thoại chi tiết bên dưới là
 * phần sản phẩm phải có thêm, và chúng dựng bằng `.phieu` / `.lab` / `.btn` —
 * cùng bộ lớp với mọi khối khác, nên chúng không sinh ra một ngôn ngữ hình thứ
 * hai.
 */
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import { usePatientNotifications } from '../app/patientNotifications'
import { markPatientNotificationRead } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import type { PatientNotification } from '../lib/schemas'
import { BellIcon, CloseIcon } from './icons'

export function PatientNotificationBell() {
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

  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unreadCount === 0 ? 'Mở thông báo' : `Mở thông báo, ${unreadCount} chưa đọc`}
        aria-expanded={isOpen}
        aria-controls="patient-notification-list"
        className="ico"
      >
        <BellIcon className="" />
        {/* `.cham` của bản mẫu. `aria-hidden` vì con số đã nằm trong
            `aria-label` của chính nút — đọc hai lần thì thành "Mở thông báo,
            3 chưa đọc, 3". */}
        {unreadCount > 0 && (
          <span aria-hidden="true" className="cham">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <section
          id="patient-notification-list"
          aria-label="Danh sách thông báo"
          className="phieu"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            zIndex: 50,
            width: 'min(24rem, calc(100vw - 2rem))',
            boxShadow: '0 12px 34px -12px rgba(0,0,0,.35)',
          }}
        >
          <div className="phieu-top">
            <span>Thông báo</span>
            {unreadCount > 0 && <span>{unreadCount} mới</span>}
          </div>

          <div style={{ padding: '14px 16px' }}>
            {query.isPending && (
              <p role="status" className="lab">
                Đang đọc thông báo…
              </p>
            )}

            {query.isError && (
              <button type="button" onClick={() => void query.refetch()} className="btn sm gh">
                Đọc lại thông báo
              </button>
            )}

            {!query.isPending && !query.isError && notifications.length === 0 && (
              <p className="lab">Bạn chưa có thông báo mới.</p>
            )}

            {notifications.length > 0 && (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  maxHeight: '20rem',
                  overflowY: 'auto',
                }}
              >
                {notifications.map((notification) => (
                  <li key={notification.notification_id} style={{ marginBottom: 7 }}>
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'none',
                        cursor: 'pointer',
                        padding: '11px 13px',
                        font: 'inherit',
                        color: 'inherit',
                        border: '1px solid var(--ke)',
                        // Nét lề trái TÍM cho mục chưa đọc: cùng ngôn ngữ với
                        // mục đang mở trong thanh bên, và nó đọc ra được cả
                        // khi người dùng không phân biệt được màu, vì mục đã
                        // đọc thì nét đó là `--ke-dam` xám.
                        borderLeft: `3px solid ${
                          notification.read_at === null ? 'var(--tim)' : 'var(--ke-dam)'
                        }`,
                      }}
                    >
                      <span style={{ fontWeight: 500, display: 'block' }}>
                        {notification.title}
                      </span>
                      <span className="lab" style={{ display: 'block', marginTop: 6 }}>
                        Trả lời cho câu hỏi
                      </span>
                      <span
                        style={{
                          display: 'block',
                          marginTop: 3,
                          fontSize: 'var(--t-note)',
                          maxHeight: '3rem',
                          overflow: 'hidden',
                          color:
                            notification.question !== null ? 'var(--ink)' : 'var(--xam)',
                        }}
                      >
                        {notification.question ?? 'Không còn tìm thấy câu hỏi gốc.'}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          marginTop: 7,
                          fontSize: 'var(--t-note)',
                          color: 'var(--xam)',
                          whiteSpace: 'pre-wrap',
                          maxHeight: '3rem',
                          overflow: 'hidden',
                        }}
                      >
                        {notification.body}
                      </span>
                      <span className="mono" style={{ display: 'block', marginTop: 7, fontSize: 'var(--t-mono-s)', color: 'var(--xam)' }}>
                        {formatDateTime(notification.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p
              className="lab"
              style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--ke)', lineHeight: 1.6 }}
            >
              Phản hồi biên tập không thay thế tư vấn khám, chẩn đoán hoặc điều trị.
            </p>
          </div>
          <div className="rangcua" />
        </section>
      )}

      {selectedNotification !== null && (
        <>
          <button
            type="button"
            aria-label="Đóng chi tiết thông báo"
            onClick={() => setSelectedNotification(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              cursor: 'default',
              border: 0,
              background: 'rgba(18,21,26,.65)',
            }}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="patient-notification-detail-title"
            className="phieu"
            style={{
              position: 'fixed',
              left: 12,
              right: 12,
              top: '50%',
              zIndex: 60,
              margin: '0 auto',
              maxWidth: '42rem',
              transform: 'translateY(-50%)',
              boxShadow: '0 12px 34px -12px rgba(0,0,0,.45)',
            }}
          >
            <div className="phieu-top">
              <span id="patient-notification-detail-title">{selectedNotification.title}</span>
              <span>{formatDateTime(selectedNotification.created_at)}</span>
            </div>

            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  aria-label="Đóng"
                  onClick={() => setSelectedNotification(null)}
                  className="ico"
                >
                  <CloseIcon className="" />
                </button>
              </div>

              <p className="lab" style={{ marginTop: 8 }}>
                Câu hỏi của bạn
              </p>
              <p
                style={{
                  marginTop: 6,
                  whiteSpace: 'pre-wrap',
                  borderLeft: '2px solid var(--ke-dam)',
                  paddingLeft: 12,
                  fontSize: 'var(--t-note)',
                  lineHeight: 1.7,
                }}
              >
                {selectedNotification.question ??
                  'Không còn tìm thấy câu hỏi gốc cho phản hồi này.'}
              </p>

              {/* Nét lề trái TÍM: khối này nói về XUẤT XỨ của phản hồi — nó
                  đến từ biên tập viên y khoa, không phải từ máy. */}
              <p className="lab" style={{ marginTop: 18 }}>
                Phản hồi từ biên tập viên y khoa
              </p>
              <p
                style={{
                  marginTop: 6,
                  whiteSpace: 'pre-wrap',
                  borderLeft: '3px solid var(--tim)',
                  paddingLeft: 12,
                  lineHeight: 1.7,
                }}
              >
                {selectedNotification.body}
              </p>

              <p className="lab" style={{ marginTop: 18, lineHeight: 1.6 }}>
                Phản hồi biên tập không thay thế tư vấn khám, chẩn đoán hoặc điều trị.
              </p>
            </div>
            <div className="rangcua" />
          </section>
        </>
      )}
    </div>
  )
}
