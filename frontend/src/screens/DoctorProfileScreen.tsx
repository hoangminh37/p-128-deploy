/** Doctor self-service profile. Verified credentials remain BTV-controlled. */
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'

import { useInvalidateConsultations, useOwnDoctorProfile } from '../app/consultations'
import { updateOwnDoctorProfile } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import type { DoctorOwnProfile, UpdateDoctorOwnProfileRequest } from '../lib/schemas'
import { ErrorNotice } from '../ui/ErrorNotice'

const INPUT_CLASS = 'font-body mt-tight min-h-touch w-full rounded-card border-2 border-slate bg-surface p-snug text-input text-body'
const LABEL_CLASS = 'font-display block text-input font-semibold text-body'

function DoctorProfileForm({ doctor }: { doctor: DoctorOwnProfile }) {
  const invalidate = useInvalidateConsultations()
  const [displayName, setDisplayName] = useState(doctor.display_name)
  const [bio, setBio] = useState(doctor.bio ?? '')
  const [clinicName, setClinicName] = useState(doctor.clinic_name ?? '')
  const [experienceYears, setExperienceYears] = useState(doctor.experience_years?.toString() ?? '')
  const [consultationFocus, setConsultationFocus] = useState(doctor.consultation_focus ?? '')
  const [isAvailable, setAvailable] = useState(doctor.is_available)
  const [lastPayload, setLastPayload] = useState<UpdateDoctorOwnProfileRequest | null>(null)

  const update = useMutation({
    mutationFn: updateOwnDoctorProfile,
    onSuccess: invalidate,
  })

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const normalizedYears = experienceYears.trim()
    const payload: UpdateDoctorOwnProfileRequest = {
      display_name: displayName.trim(),
      bio: bio.trim() || null,
      clinic_name: clinicName.trim() || null,
      experience_years: normalizedYears === '' ? null : Number(normalizedYears),
      consultation_focus: consultationFocus.trim() || null,
      is_available: isAvailable,
    }
    setLastPayload(payload)
    update.mutate(payload)
  }

  return <div className="max-w-reading">
    <h1 className="text-ask font-semibold text-body">Hồ sơ của tôi</h1>
    <p className="mt-snug max-w-answer text-notice text-body">Cập nhật thông tin bệnh nhân nhìn thấy trước khi chọn tư vấn với bạn.</p>

    {!doctor.is_active && <p className="font-display mt-block rounded-card bg-sand p-snug text-input text-sand-deep">Tài khoản hiện đang tạm ngưng bởi BTV. Bạn vẫn có thể cập nhật hồ sơ, nhưng không thể bật nhận yêu cầu mới.</p>}

    <section className="mt-block rounded-card-lg bg-surface p-cozy" aria-labelledby="professional-title">
      <div className="flex flex-wrap items-center justify-between gap-snug">
        <h2 id="professional-title" className="text-heading font-semibold text-body">Thông tin chuyên môn đã xác minh</h2>
        <span className={`font-display rounded-pill px-snug py-hair text-question font-semibold ${doctor.is_verified ? 'bg-mint text-mint-deep' : 'bg-sand text-sand-deep'}`}>{doctor.is_verified ? 'Đã xác minh' : 'Chưa xác minh'}</span>
      </div>
      <dl className="mt-snug grid gap-snug sm:grid-cols-2">
        <div><dt className="font-display text-question text-slate">Email đăng nhập</dt><dd className="font-display mt-hair text-input text-body">{doctor.email}</dd></div>
        <div><dt className="font-display text-question text-slate">Chuyên khoa</dt><dd className="font-display mt-hair text-input text-body">{doctor.specialty}</dd></div>
        <div><dt className="font-display text-question text-slate">Số giấy phép hành nghề</dt><dd className="font-mono mt-hair text-input text-body">{doctor.license_number}</dd></div>
        {doctor.verified_at !== null && <div><dt className="font-display text-question text-slate">Thời điểm xác minh</dt><dd className="font-display mt-hair text-input text-body">{formatDateTime(doctor.verified_at)}</dd></div>}
      </dl>
      <p className="font-display mt-snug border-t border-line pt-snug text-question text-slate">Chuyên khoa, giấy phép và trạng thái xác minh do BTV quản lý. Liên hệ BTV nếu các thông tin này cần thay đổi.</p>
    </section>

    <form onSubmit={submit} className="mt-block rounded-card-lg bg-surface p-cozy" aria-labelledby="public-profile-title">
      <h2 id="public-profile-title" className="text-heading font-semibold text-body">Thông tin công khai</h2>
      <p className="font-display mt-hair text-question text-slate">Nội dung này sẽ hiển thị cho bệnh nhân khi họ xem hồ sơ của bạn.</p>

      <div className="mt-snug grid gap-snug sm:grid-cols-2">
        <div><label htmlFor="own-doctor-name" className={LABEL_CLASS}>Tên hiển thị *</label><input id="own-doctor-name" required minLength={2} maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={INPUT_CLASS} /></div>
        <div><label htmlFor="own-doctor-clinic" className={LABEL_CLASS}>Cơ sở công tác</label><input id="own-doctor-clinic" maxLength={160} value={clinicName} onChange={(event) => setClinicName(event.target.value)} className={INPUT_CLASS} /></div>
        <div><label htmlFor="own-doctor-experience" className={LABEL_CLASS}>Số năm kinh nghiệm</label><input id="own-doctor-experience" type="number" min="0" max="80" value={experienceYears} onChange={(event) => setExperienceYears(event.target.value)} className={INPUT_CLASS} /></div>
        <label className="font-display flex min-h-touch items-center gap-tight self-end text-input font-semibold text-body"><input type="checkbox" checked={isAvailable} disabled={!doctor.is_active} onChange={(event) => setAvailable(event.target.checked)} className="h-5 w-5" />Đang nhận yêu cầu tư vấn</label>
        <div className="sm:col-span-2"><label htmlFor="own-doctor-bio" className={LABEL_CLASS}>Giới thiệu ngắn</label><textarea id="own-doctor-bio" rows={4} maxLength={1000} value={bio} onChange={(event) => setBio(event.target.value)} className={INPUT_CLASS} /></div>
        <div className="sm:col-span-2"><label htmlFor="own-doctor-focus" className={LABEL_CLASS}>Phạm vi tư vấn</label><textarea id="own-doctor-focus" rows={4} maxLength={1000} value={consultationFocus} onChange={(event) => setConsultationFocus(event.target.value)} className={INPUT_CLASS} /></div>
      </div>

      {update.isSuccess && <p role="status" className="font-display mt-snug text-question font-semibold text-mint-deep">Đã lưu thay đổi hồ sơ.</p>}
      {update.isError && <div className="mt-snug"><ErrorNotice error={update.error} retryLabel="Thử lưu lại" onRetry={() => { if (lastPayload !== null) update.mutate(lastPayload) }} /></div>}
      <button type="submit" disabled={update.isPending} className="motion-press font-display mt-snug min-h-touch rounded-pill bg-mint px-cozy text-input font-bold text-mint-deep enabled:hover:bg-mint-press disabled:bg-canvas disabled:text-slate">{update.isPending ? 'Đang lưu…' : 'Lưu hồ sơ'}</button>
    </form>
  </div>
}

export function DoctorProfileScreen() {
  const query = useOwnDoctorProfile()

  if (query.isPending) return <p role="status" className="font-display text-notice text-slate">Đang mở hồ sơ bác sỹ…</p>
  if (query.isError) return <ErrorNotice error={query.error} retryLabel="Mở lại hồ sơ" onRetry={() => void query.refetch()} />
  if (query.data === undefined) return null

  return <DoctorProfileForm key={query.data.doctor_id} doctor={query.data} />
}
