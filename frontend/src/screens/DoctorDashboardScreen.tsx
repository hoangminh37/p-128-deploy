/**
 * Tổng quan của bác sỹ — `/doctor`.
 *
 * CHÉP TỪ `id="bstq"` của bản mẫu: nhãn `.eb` "Khu vực bác sỹ", tiêu đề, một
 * `.chip` trạng thái nhận tư vấn đẩy sang mép phải, ba thẻ `.phieu` trong lưới
 * `.auto` — mỗi thẻ một con số lớn chữ có chân đứng trên một nét dọc màu — rồi
 * `.eb solo` "Phiên gần đây" và một `.phieu` gom các hàng phiên.
 *
 * MỌI CON SỐ VÀ MỌI HÀNG Ở ĐÂY ĐỀU TỪ `useDoctorDashboard`. Bản mẫu ghi sẵn
 * 2 / 5 / 3 và hai hàng phiên; ở đây chúng là `pending_consultation_count`,
 * `unread_patient_message_count`, `active_consultation_count` và
 * `recent_consultations`.
 *
 * KHÔNG HIỆN THÔNG TIN ĐỊNH DANH BỆNH NHÂN ở màn này — mỗi hàng chỉ nói "Phiên
 * tư vấn" và mốc cập nhật, đúng như bản mẫu. Danh tính chỉ xuất hiện bên trong
 * từng phòng tư vấn, sau khi bác sỹ đã nhận phiên.
 */
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

/**
 * Ba trạng thái, ba lớp `.chip` của bản mẫu.
 *
 * `cho` (tím) là việc đang chờ người này làm, `duyet` (xanh) là việc đang
 * chạy, còn phiên đã đóng thì chip trơn — đúng cặp bản mẫu dùng ở `#bstq`.
 */
const STATUS_CHIP: Record<ConsultationStatus, string> = {
  requested: 'chip cho',
  active: 'chip duyet',
  ended: 'chip',
}

function consultationPath(consultationId: string): string {
  return `/doctor/consultations/${encodeURIComponent(consultationId)}`
}

export function DoctorDashboardScreen() {
  const query = useDoctorDashboard()

  if (query.isPending) {
    return (
      <p role="status" className="lab">
        Đang chuẩn bị tổng quan tư vấn…
      </p>
    )
  }
  if (query.isError) {
    return (
      <ErrorNotice
        error={query.error}
        retryLabel="Tải lại tổng quan"
        onRetry={() => void query.refetch()}
      />
    )
  }
  const dashboard = query.data
  if (dashboard === undefined) return null

  /* Ba thẻ `.phieu` của bản mẫu, giữ nguyên thứ tự và ba màu nét dọc: tím cho
     việc đang chờ mình, đỏ cho tin nhắn chưa đọc, xanh cho phiên đang chạy. */
  const cards = [
    {
      label: 'Cần nhận phiên',
      value: dashboard.pending_consultation_count,
      detail: 'Yêu cầu bệnh nhân đang chờ bạn xử lý.',
      to: '/doctor/consultations',
      accent: 'var(--tim)',
    },
    {
      label: 'Tin nhắn chưa đọc',
      value: dashboard.unread_patient_message_count,
      detail: 'Tin nhắn mới tách riêng trong Thông báo.',
      to: '/doctor/notifications',
      accent: 'var(--do)',
    },
    {
      label: 'Đang tư vấn',
      value: dashboard.active_consultation_count,
      detail: 'Các phiên chat và gọi video đang mở.',
      to: '/doctor/consultations',
      accent: 'var(--xanh)',
    },
  ]

  // Chip trạng thái nhận tư vấn: bản mẫu viết sẵn "Đang nhận tư vấn" màu xanh.
  // Tài khoản bị tạm ngưng là tình huống KHÁC hẳn việc tự tắt lịch, nên nó nói
  // bằng chip đỏ chứ không lẫn vào chip trơn.
  const availability = !dashboard.is_active
    ? { className: 'chip loi', label: 'Tài khoản đang tạm ngưng' }
    : dashboard.is_available
      ? { className: 'chip duyet', label: 'Đang nhận tư vấn' }
      : { className: 'chip', label: 'Đang tắt nhận tư vấn' }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div>
          <div className="eb">Khu vực bác sỹ</div>
          <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 10 }}>
            Tổng quan tư vấn
          </h1>
        </div>

        <Link
          to="/doctor/profile"
          className={availability.className}
          style={{ textDecoration: 'none' }}
        >
          {availability.label}
        </Link>
      </div>

      <p
        style={{
          fontSize: 'var(--t-note)',
          color: 'var(--xam)',
          marginTop: 12,
          maxWidth: '56ch',
        }}
      >
        Theo dõi công việc cần xử lý và quay lại đúng phiên tư vấn một cách nhanh chóng.
      </p>

      <div className="auto" style={{ marginTop: 26 }}>
        {cards.map((card) => (
          <Link
            key={card.label}
            to={card.to}
            className="phieu"
            style={{
              display: 'block',
              padding: '22px clamp(16px,2vw,24px)',
              borderLeft: `3px solid ${card.accent}`,
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--f-display)',
                fontSize: 'clamp(40px,4.4vw,62px)',
                lineHeight: 1,
                color: card.accent,
              }}
            >
              {card.value}
            </div>
            <p style={{ marginTop: 10, fontWeight: 500 }}>{card.label}</p>
            <p className="lab" style={{ marginTop: 3 }}>
              {card.detail}
            </p>
          </Link>
        ))}
      </div>

      {/* Thông báo hệ thống chưa đọc — cùng lối trình bày với dải "thông tin
          lâm sàng" của `id="bsphong"`: nền tím nhạt, một nét dọc tím. Đây là
          việc phải xử lý chứ không phải một con số để nhìn, nên nó KHÔNG thành
          thẻ thứ tư trong lưới trên. */}
      {dashboard.unread_system_notification_count > 0 && (
        <div
          style={{
            marginTop: 18,
            padding: '12px 14px',
            background: 'var(--tim-wash)',
            borderLeft: '2px solid var(--tim)',
          }}
        >
          <span className="lab" style={{ color: 'var(--tim)' }}>
            Thông báo hệ thống
          </span>
          <p style={{ fontSize: 'var(--t-note)', marginTop: 5 }}>
            Có {dashboard.unread_system_notification_count} thông báo hệ thống chưa đọc.
          </p>
          <Link to="/doctor/notifications" className="btn sm" style={{ marginTop: 12 }}>
            Mở Thông báo
          </Link>
        </div>
      )}

      <div className="eb solo" style={{ marginTop: 32 }}>
        Phiên gần đây
      </div>
      <p style={{ fontSize: 'var(--t-note)', color: 'var(--xam)', marginTop: 6 }}>
        Không hiển thị thông tin định danh của bệnh nhân ngoài từng phiên tư vấn.
      </p>

      {dashboard.recent_consultations.length === 0 ? (
        <div className="phieu" style={{ marginTop: 12 }}>
          <EmptyState
            title="Chưa có phiên tư vấn"
            body="Khi bệnh nhân chọn tư vấn với bạn, phiên mới sẽ xuất hiện ở đây."
          />
          <div className="rangcua" />
        </div>
      ) : (
        <div className="phieu" style={{ marginTop: 12 }}>
          {dashboard.recent_consultations.map((consultation, index) => (
            <div
              key={consultation.consultation_id}
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                padding: '15px clamp(16px,2vw,22px)',
                borderBottom:
                  index === dashboard.recent_consultations.length - 1
                    ? undefined
                    : '1px solid var(--ke)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 180 }}>
                <p style={{ fontWeight: 500 }}>Phiên tư vấn</p>
                <p className="lab">
                  Cập nhật{' '}
                  {formatDateTime(consultation.last_message_at ?? consultation.requested_at)}
                </p>
              </div>

              <span className={STATUS_CHIP[consultation.status]}>
                {STATUS_LABEL[consultation.status]}
              </span>

              <Link
                to={consultationPath(consultation.consultation_id)}
                className={consultation.status === 'requested' ? 'btn sm' : 'btn sm gh'}
              >
                Mở phiên
              </Link>
            </div>
          ))}
          <div className="rangcua" />
        </div>
      )}

      <p style={{ marginTop: 14 }}>
        <Link to="/doctor/consultations" className="btn sm gh">
          Xem tất cả phiên
        </Link>
      </p>
    </div>
  )
}
