/** A patient-visible, verified professional profile shown before selection. */
import { Link, useParams } from 'react-router-dom'

import { useDoctorPublicProfile } from '../app/consultations'
import { formatDateTime } from '../lib/datetime'
import { ErrorNotice } from '../ui/ErrorNotice'

export function DoctorPublicProfileScreen() {
  const { doctorId } = useParams()
  const query = useDoctorPublicProfile(doctorId ?? '')

  if (query.isPending) return <p role="status" className="font-display text-notice text-slate">Đang mở hồ sơ bác sỹ…</p>
  if (query.isError) return <ErrorNotice error={query.error} retryLabel="Mở lại hồ sơ" onRetry={() => void query.refetch()} />
  const doctor = query.data
  if (doctor === undefined) return null

  return <div className="max-w-reading">
    <Link to="/consultations" className="font-display inline-flex min-h-touch items-center text-input font-semibold text-body underline underline-offset-4">Quay lại danh sách bác sỹ</Link>
    <h1 className="mt-snug text-ask font-semibold text-body">{doctor.display_name}</h1>
    <p className="font-display mt-hair text-heading text-mint-deep">{doctor.specialty}</p>

    <section className="mt-block rounded-card-lg bg-surface p-cozy" aria-label="Thông tin xác minh bác sỹ">
      <div className="flex flex-wrap items-center justify-between gap-snug">
        <h2 className="text-heading font-semibold text-body">Hồ sơ chuyên môn</h2>
        <span className={`font-display rounded-pill px-snug py-hair text-question font-semibold ${doctor.is_verified ? 'bg-mint text-mint-deep' : 'bg-sand text-sand-deep'}`}>{doctor.is_verified ? 'Đã xác minh' : 'Chưa xác minh'}</span>
      </div>
      <dl className="mt-snug grid gap-snug sm:grid-cols-2">
        <div><dt className="font-display text-question text-slate">Số giấy phép hành nghề</dt><dd className="font-mono mt-hair text-input text-body">{doctor.license_number}</dd></div>
        <div><dt className="font-display text-question text-slate">Cơ sở công tác</dt><dd className="font-display mt-hair text-input text-body">{doctor.clinic_name ?? 'Chưa công bố'}</dd></div>
        <div><dt className="font-display text-question text-slate">Kinh nghiệm</dt><dd className="font-display mt-hair text-input text-body">{doctor.experience_years === null ? 'Chưa công bố' : `${doctor.experience_years} năm`}</dd></div>
        {doctor.verified_at !== null && <div><dt className="font-display text-question text-slate">Thời điểm xác minh</dt><dd className="font-display mt-hair text-input text-body">{formatDateTime(doctor.verified_at)}</dd></div>}
      </dl>
      {doctor.bio !== null && <div className="mt-snug border-t border-line pt-snug"><h3 className="font-display text-input font-semibold text-body">Giới thiệu</h3><p className="font-display mt-hair whitespace-pre-wrap text-input text-body">{doctor.bio}</p></div>}
      {doctor.consultation_focus !== null && <div className="mt-snug border-t border-line pt-snug"><h3 className="font-display text-input font-semibold text-body">Phạm vi tư vấn</h3><p className="font-display mt-hair whitespace-pre-wrap text-input text-body">{doctor.consultation_focus}</p></div>}
    </section>

    {doctor.is_available ? (
      <Link to={`/consultations?doctor=${encodeURIComponent(doctor.doctor_id)}`} className="motion-press font-display mt-block inline-flex min-h-touch items-center rounded-pill bg-mint px-cozy text-input font-bold text-mint-deep no-underline hover:bg-mint-press">Chọn bác sỹ này để tư vấn</Link>
    ) : (
      <p className="font-display mt-block rounded-card bg-sand p-snug text-input text-sand-deep">Bác sỹ hiện chưa nhận yêu cầu tư vấn mới. Bạn vẫn có thể xem hồ sơ và chọn một bác sỹ khác.</p>
    )}
  </div>
}
