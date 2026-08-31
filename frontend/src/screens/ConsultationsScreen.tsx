/** Patient entrypoint for choosing a real, BTV-managed doctor. */
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
    <article className={`rounded-card border-2 p-cozy ${selected ? 'border-mint bg-mint/15' : 'border-line bg-surface'}`}>
      <p className="text-notice font-semibold text-body">{doctor.display_name}</p>
      <p className="font-display mt-hair text-input text-mint-deep">{doctor.specialty}</p>
      {doctor.is_verified && <p className="font-display mt-tight text-question font-semibold text-mint-deep">Hồ sơ đã được BTV xác minh</p>}
      {doctor.clinic_name !== null && <p className="font-display mt-tight text-question text-slate">{doctor.clinic_name}</p>}
      {doctor.experience_years !== null && <p className="font-display mt-hair text-question text-slate">{doctor.experience_years} năm kinh nghiệm</p>}
      {doctor.bio !== null && <p className="font-display mt-snug text-question text-slate">{doctor.bio}</p>}
      <div className="mt-snug flex flex-wrap gap-tight">
        <button type="button" disabled={!doctor.is_available || isStarting} onClick={onStart} aria-pressed={selected} className="motion-press font-display min-h-touch rounded-pill bg-mint px-cozy text-input font-bold text-mint-deep enabled:hover:bg-mint-press disabled:bg-canvas disabled:text-slate">{!doctor.is_available ? 'Hiện chưa nhận tư vấn' : isStarting ? 'Đang mở cuộc trò chuyện…' : 'Bắt đầu trò chuyện'}</button>
        <Link to={`/consultations/doctors/${encodeURIComponent(doctor.doctor_id)}`} className="motion-press font-display inline-flex min-h-touch items-center rounded-pill border-2 border-slate px-cozy text-input font-semibold text-body no-underline hover:bg-canvas">Xem hồ sơ</Link>
      </div>
    </article>
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
    <div className="max-w-reading">
      <h1 className="text-ask font-semibold text-body">Tư vấn với bác sỹ</h1>
      <p className="mt-snug max-w-answer text-notice text-body">
        Chọn bác sỹ để mở phòng trò chuyện riêng. Bạn có thể nhắn ngay; bác sỹ nhận thông báo và cần nhận phiên trước khi phản hồi hoặc gọi video.
      </p>

      {doctorsQuery.isPending && <p role="status" className="font-display mt-block text-notice text-slate">Đang tìm bác sỹ nhận tư vấn…</p>}
      {doctorsQuery.isError && <div className="mt-block"><ErrorNotice error={doctorsQuery.error} retryLabel="Tải lại danh sách" onRetry={() => void doctorsQuery.refetch()} /></div>}

      {!doctorsQuery.isPending && !doctorsQuery.isError && doctors.length === 0 && (
        <div className="mt-block"><EmptyState title="Hiện chưa có bác sỹ nhận tư vấn" body="BTV sẽ hiển thị bác sỹ tại đây khi đã xác minh và bật lịch nhận tư vấn." /></div>
      )}

      {doctors.length > 0 && (
        <section className="mt-block rounded-card-lg bg-canvas p-cozy" aria-labelledby="doctor-choice-title">
          <h2 id="doctor-choice-title" className="text-notice font-semibold text-body">Chọn bác sỹ để bắt đầu</h2>
          <div className="mt-snug grid gap-snug sm:grid-cols-2">
            {doctors.map((doctor) => <DoctorCard key={doctor.doctor_id} doctor={doctor} selected={doctor.doctor_id === selectedDoctorId} isStarting={requestConsultation.isPending} onStart={() => startConversation(doctor)} />)}
          </div>
          {requestConsultation.isError && <div className="mt-snug"><ErrorNotice error={requestConsultation.error} retryLabel="Mở lại cuộc trò chuyện" onRetry={() => { if (requestConsultation.variables !== undefined) requestConsultation.mutate(requestConsultation.variables) }} /></div>}
        </section>
      )}

      <section className="mt-block" aria-labelledby="consultation-history-title">
        <h2 id="consultation-history-title" className="text-heading font-semibold text-body">Các phiên tư vấn của bạn</h2>
        {consultationsQuery.isPending && <p role="status" className="font-display mt-snug text-notice text-slate">Đang đọc các phiên tư vấn…</p>}
        {consultationsQuery.isError && <div className="mt-snug"><ErrorNotice error={consultationsQuery.error} retryLabel="Đọc lại" onRetry={() => void consultationsQuery.refetch()} /></div>}
        {!consultationsQuery.isPending && !consultationsQuery.isError && consultations.length === 0 && <p className="font-display mt-snug text-notice text-slate">Bạn chưa có phiên tư vấn nào.</p>}
        {consultations.length > 0 && <ul className="mt-snug space-y-snug">
          {consultations.map((consultation) => <li key={consultation.consultation_id} className="rounded-card bg-surface p-cozy">
            <div className="flex flex-wrap items-start justify-between gap-snug">
              <div><h3 className="text-notice font-semibold text-body">{consultation.doctor.display_name}</h3><p className="font-display mt-hair text-question text-slate">{consultation.doctor.specialty}</p></div>
              <span className="font-display rounded-pill bg-canvas px-snug py-hair text-question font-semibold text-body">{STATUS_LABEL[consultation.status]}</span>
            </div>
            {consultation.last_message_preview !== null && <p className="font-display mt-snug line-clamp-2 text-input text-body">{consultation.last_message_preview}</p>}
            <p className="font-display mt-snug text-question text-slate">Yêu cầu {formatDateTime(consultation.requested_at)}</p>
            <Link to={`/consultations/${encodeURIComponent(consultation.consultation_id)}`} className="motion-press font-display mt-snug inline-flex min-h-touch items-center rounded-pill border-2 border-slate px-cozy text-input font-semibold text-body no-underline hover:bg-canvas">Mở phiên tư vấn</Link>
          </li>)}
        </ul>}
      </section>
    </div>
  )
}
