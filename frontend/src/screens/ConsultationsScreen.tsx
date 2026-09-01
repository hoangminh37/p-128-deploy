/**
 * Cửa vào tư vấn của bệnh nhân — `/consultations`.
 *
 * CHÉP TỪ `id="tvds"` của bản mẫu, đúng ba tầng và đúng thứ tự đó:
 *
 *   1. `.eb` "Tư vấn", tiêu đề, một đoạn nói trước LUẬT CHƠI — nhắn được ngay,
 *      nhưng bác sỹ phải nhận yêu cầu rồi mới trả lời hoặc gọi video được.
 *   2. `.eb solo` "Chọn bác sỹ để bắt đầu" và lưới `.auto` các `.phieu` bác sỹ.
 *      Bác sỹ đang chọn được viền xanh 2px và dải `.phieu-top` xanh ghi
 *      "Đang chọn"; các thẻ còn lại dùng dải trơn ghi chuyên khoa và số năm.
 *   3. `.eb solo` "Các buổi tư vấn của bạn" — MỘT `.phieu` duy nhất, mỗi buổi
 *      là một hàng ngăn nhau bằng nét kẻ, không phải mỗi buổi một thẻ.
 *
 * Danh sách bác sỹ là người thật do biên tập viên y khoa quản lý, nên chip
 * "Hồ sơ đã được biên tập viên y khoa xác minh" chỉ hiện khi `is_verified`, và
 * nút bắt đầu tắt hẳn khi bác sỹ không nhận tư vấn — bản mẫu có sẵn cả hai
 * trạng thái nút này.
 */
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import {
  useAvailableDoctors,
  useConsultationList,
  useInvalidateConsultations,
} from '../app/consultations'
import { createConsultation } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import type { ConsultationStatus, DoctorPublicProfile } from '../lib/schemas'
import { EmptyState } from '../ui/EmptyState'
import { ErrorNotice } from '../ui/ErrorNotice'

const STATUS_LABEL: Record<ConsultationStatus, string> = {
  requested: 'Đang chờ bác sỹ nhận',
  active: 'Đang tư vấn',
  ended: 'Đã kết thúc',
}

/** Chip trạng thái, đúng ba lớp bản mẫu dùng ở `#tvds`. */
const STATUS_CHIP: Record<ConsultationStatus, string> = {
  requested: 'chip cho',
  active: 'chip duyet',
  ended: 'chip',
}

/**
 * Dòng `.lab` dưới tên bác sỹ.
 *
 * Bản mẫu viết "Nội tiết · Bệnh viện Nội tiết Trung ương · 12 năm". Nơi làm
 * việc và số năm đều có thể trống trong dữ liệu thật, nên chúng chỉ góp mặt
 * khi có — không để lại dấu chấm giữa lơ lửng.
 */
function doctorMeta(doctor: DoctorPublicProfile): string {
  const parts = [doctor.specialty]
  if (doctor.clinic_name !== null) parts.push(doctor.clinic_name)
  if (doctor.experience_years !== null) parts.push(`${doctor.experience_years} năm`)
  return parts.join(' · ')
}

/** Một `.phieu` bác sỹ trong lưới `.auto` — CHÉP TỪ `id="tvds"`. */
function DoctorCard({
  doctor,
  selected,
  isStarting,
  onStart,
}: {
  doctor: DoctorPublicProfile
  selected: boolean
  isStarting: boolean
  onStart: () => void
}) {
  return (
    <div
      className="phieu"
      style={selected ? { borderColor: 'var(--xanh)', borderWidth: 2 } : undefined}
    >
      <div
        className="phieu-top"
        style={
          selected
            ? {
                background: 'var(--xanh-wash)',
                color: 'var(--xanh)',
                borderBottomColor: 'var(--xanh)',
              }
            : undefined
        }
      >
        <span>{selected ? 'Đang chọn' : doctor.specialty}</span>
        <span>
          {selected
            ? doctor.specialty
            : doctor.experience_years !== null
              ? `${String(doctor.experience_years).padStart(2, '0')} năm`
              : ''}
        </span>
      </div>

      <div style={{ padding: '18px clamp(16px,2vw,22px)' }}>
        <h2 style={{ fontSize: 'var(--t-h3)' }}>{doctor.display_name}</h2>
        <p className="lab" style={{ marginTop: 3 }}>
          {doctorMeta(doctor)}
        </p>

        {doctor.bio !== null && (
          <p
            style={{
              fontSize: 'var(--t-note)',
              color: 'var(--xam)',
              marginTop: 10,
              lineHeight: 1.65,
            }}
          >
            {doctor.bio}
          </p>
        )}

        {doctor.is_verified && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
            <span className="chip duyet">Hồ sơ đã được biên tập viên y khoa xác minh</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 16 }}>
          {/* Bản mẫu để sẵn hai trạng thái nút: `btn pri sm` khi nhận tư vấn,
              và một nút mờ `disabled` ghi "Hiện chưa nhận tư vấn" khi không. */}
          <button
            type="button"
            disabled={!doctor.is_available || isStarting}
            onClick={onStart}
            aria-pressed={selected}
            className={doctor.is_available ? 'btn pri sm' : 'btn sm'}
            style={
              doctor.is_available ? undefined : { opacity: 0.5, cursor: 'not-allowed' }
            }
          >
            {!doctor.is_available
              ? 'Hiện chưa nhận tư vấn'
              : isStarting
                ? 'Đang mở cuộc trò chuyện…'
                : 'Bắt đầu trò chuyện'}
          </button>

          <Link
            to={`/consultations/doctors/${encodeURIComponent(doctor.doctor_id)}`}
            className="btn sm gh"
          >
            Xem hồ sơ
          </Link>
        </div>
      </div>

      <div className="rangcua" />
    </div>
  )
}

export function ConsultationsScreen() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const doctorsQuery = useAvailableDoctors()
  const consultationsQuery = useConsultationList()
  const invalidate = useInvalidateConsultations()
  const selectedDoctorId = searchParams.get('doctor')

  const requestConsultation = useMutation({
    mutationFn: createConsultation,
    onSuccess: (consultation) => {
      invalidate()
      navigate(`/consultations/${encodeURIComponent(consultation.consultation_id)}`)
    },
  })

  function startConversation(doctor: DoctorPublicProfile): void {
    if (!doctor.is_available || requestConsultation.isPending) return
    requestConsultation.mutate({ doctor_id: doctor.doctor_id })
  }

  const doctors = doctorsQuery.data?.doctors ?? []
  const consultations = consultationsQuery.data?.consultations ?? []

  return (
    <div>
      <div className="eb">Tư vấn</div>

      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 12 }}>
        Tư vấn với bác sỹ
      </h1>

      <p
        style={{
          fontSize: 'var(--t-note)',
          color: 'var(--xam)',
          marginTop: 12,
          maxWidth: '60ch',
        }}
      >
        Chọn bác sỹ để mở phòng trò chuyện riêng. Bạn có thể nhắn ngay; bác sỹ nhận thông báo
        và cần nhận yêu cầu trước khi phản hồi hoặc gọi video.
      </p>

      <div className="eb solo" style={{ marginTop: 26 }}>
        Chọn bác sỹ để bắt đầu
      </div>

      {doctorsQuery.isPending && (
        <p role="status" className="lab" style={{ marginTop: 14 }}>
          Đang tìm bác sỹ nhận tư vấn…
        </p>
      )}

      {doctorsQuery.isError && (
        <div style={{ marginTop: 14 }}>
          <ErrorNotice
            error={doctorsQuery.error}
            retryLabel="Tải lại danh sách"
            onRetry={() => void doctorsQuery.refetch()}
          />
        </div>
      )}

      {!doctorsQuery.isPending && !doctorsQuery.isError && doctors.length === 0 && (
        <div className="phieu" style={{ marginTop: 14 }}>
          <EmptyState
            title="Hiện chưa có bác sỹ nhận tư vấn"
            body="BTV sẽ hiển thị bác sỹ tại đây khi đã xác minh và bật lịch nhận tư vấn."
          />
          <div className="rangcua" />
        </div>
      )}

      {doctors.length > 0 && (
        <div className="auto" style={{ marginTop: 14 }}>
          {doctors.map((doctor) => (
            <DoctorCard
              key={doctor.doctor_id}
              doctor={doctor}
              selected={doctor.doctor_id === selectedDoctorId}
              isStarting={requestConsultation.isPending}
              onStart={() => startConversation(doctor)}
            />
          ))}
        </div>
      )}

      {requestConsultation.isError && (
        <div style={{ marginTop: 14 }}>
          <ErrorNotice
            error={requestConsultation.error}
            retryLabel="Mở lại cuộc trò chuyện"
            onRetry={() => {
              if (requestConsultation.variables !== undefined) {
                requestConsultation.mutate(requestConsultation.variables)
              }
            }}
          />
        </div>
      )}

      <div className="eb solo" style={{ marginTop: 32 }}>
        Các buổi tư vấn của bạn
      </div>

      {consultationsQuery.isPending && (
        <p role="status" className="lab" style={{ marginTop: 14 }}>
          Đang đọc các phiên tư vấn…
        </p>
      )}

      {consultationsQuery.isError && (
        <div style={{ marginTop: 14 }}>
          <ErrorNotice
            error={consultationsQuery.error}
            retryLabel="Đọc lại"
            onRetry={() => void consultationsQuery.refetch()}
          />
        </div>
      )}

      {!consultationsQuery.isPending && !consultationsQuery.isError && consultations.length === 0 && (
        <p className="lab" style={{ marginTop: 14, lineHeight: 1.6 }}>
          Bạn chưa có buổi tư vấn nào.
        </p>
      )}

      {consultations.length > 0 && (
        <div className="phieu" style={{ marginTop: 14 }}>
          {consultations.map((consultation, index) => (
            <div
              key={consultation.consultation_id}
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
                padding: '16px clamp(16px,2vw,22px)',
                borderBottom:
                  index === consultations.length - 1 ? undefined : '1px solid var(--ke)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 220 }}>
                <p style={{ fontWeight: 500 }}>{consultation.doctor.display_name}</p>
                <p className="lab">
                  {consultation.doctor.specialty} · Yêu cầu lúc{' '}
                  {formatDateTime(consultation.requested_at)}
                </p>
                {consultation.last_message_preview !== null && (
                  <p
                    style={{
                      fontSize: 'var(--t-note)',
                      color: 'var(--xam)',
                      marginTop: 7,
                      maxWidth: '52ch',
                    }}
                  >
                    {consultation.last_message_preview}
                  </p>
                )}
              </div>

              <span className={STATUS_CHIP[consultation.status]}>
                {STATUS_LABEL[consultation.status]}
              </span>

              <Link
                to={`/consultations/${encodeURIComponent(consultation.consultation_id)}`}
                className={consultation.status === 'ended' ? 'btn sm gh' : 'btn sm'}
              >
                Mở buổi tư vấn
              </Link>
            </div>
          ))}
          <div className="rangcua" />
        </div>
      )}
    </div>
  )
}
