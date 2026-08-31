/** BTV management of verified doctor accounts and professional profiles. */
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'

import { useAdminDoctors, useInvalidateConsultations } from '../app/consultations'
import { createDoctor, updateAdminDoctor } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import type { AdminDoctor, UpdateAdminDoctorRequest } from '../lib/schemas'
import { EmptyState } from '../ui/EmptyState'
import { ErrorNotice } from '../ui/ErrorNotice'

const INPUT_CLASS = 'font-body mt-tight min-h-touch w-full rounded-card border-2 border-slate bg-surface p-snug text-input text-body'
const LABEL_CLASS = 'font-display block text-input font-semibold text-body'

type DoctorUpdateVariables = {
  doctorId: string
  payload: UpdateAdminDoctorRequest
}

function DoctorProfileEditor({
  doctor,
  isSaving,
  onCancel,
  onSave,
}: {
  doctor: AdminDoctor
  isSaving: boolean
  onCancel: () => void
  onSave: (payload: UpdateAdminDoctorRequest) => void
}) {
  const [email, setEmail] = useState(doctor.email)
  const [displayName, setDisplayName] = useState(doctor.display_name)
  const [specialty, setSpecialty] = useState(doctor.specialty)
  const [licenseNumber, setLicenseNumber] = useState(doctor.license_number)
  const [bio, setBio] = useState(doctor.bio ?? '')
  const [clinicName, setClinicName] = useState(doctor.clinic_name ?? '')
  const [experienceYears, setExperienceYears] = useState(doctor.experience_years?.toString() ?? '')
  const [consultationFocus, setConsultationFocus] = useState(doctor.consultation_focus ?? '')
  const [isActive, setActive] = useState(doctor.is_active)
  const [isAvailable, setAvailable] = useState(doctor.is_available)

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const normalizedYears = experienceYears.trim()
    onSave({
      email: email.trim(),
      display_name: displayName.trim(),
      specialty: specialty.trim(),
      license_number: licenseNumber.trim(),
      bio: bio.trim() || null,
      clinic_name: clinicName.trim() || null,
      experience_years: normalizedYears === '' ? null : Number(normalizedYears),
      consultation_focus: consultationFocus.trim() || null,
      is_active: isActive,
      // A locked account is never left accidentally open to new requests.
      is_available: isActive && isAvailable,
    })
  }

  return <form onSubmit={submit} className="mt-snug rounded-card border border-mint bg-canvas p-cozy" aria-label={`Sửa hồ sơ ${doctor.display_name}`}>
    <h4 className="text-input font-semibold text-body">Chỉnh sửa hồ sơ đã xác minh</h4>
    <p className="font-display mt-hair text-question text-slate">Các thay đổi chuyên khoa và giấy phép được BTV chịu trách nhiệm xác minh trước khi lưu.</p>

    <div className="mt-snug grid gap-snug sm:grid-cols-2">
      <div><label htmlFor={`doctor-edit-name-${doctor.doctor_id}`} className={LABEL_CLASS}>Tên hiển thị *</label><input id={`doctor-edit-name-${doctor.doctor_id}`} required minLength={2} maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={INPUT_CLASS} /></div>
      <div><label htmlFor={`doctor-edit-specialty-${doctor.doctor_id}`} className={LABEL_CLASS}>Chuyên khoa *</label><input id={`doctor-edit-specialty-${doctor.doctor_id}`} required minLength={2} maxLength={120} value={specialty} onChange={(event) => setSpecialty(event.target.value)} className={INPUT_CLASS} /></div>
      <div><label htmlFor={`doctor-edit-license-${doctor.doctor_id}`} className={LABEL_CLASS}>Số giấy phép hành nghề *</label><input id={`doctor-edit-license-${doctor.doctor_id}`} required minLength={3} maxLength={80} value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} className={INPUT_CLASS} /></div>
      <div><label htmlFor={`doctor-edit-email-${doctor.doctor_id}`} className={LABEL_CLASS}>Email đăng nhập *</label><input id={`doctor-edit-email-${doctor.doctor_id}`} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={INPUT_CLASS} /></div>
      <div><label htmlFor={`doctor-edit-clinic-${doctor.doctor_id}`} className={LABEL_CLASS}>Cơ sở công tác</label><input id={`doctor-edit-clinic-${doctor.doctor_id}`} maxLength={160} value={clinicName} onChange={(event) => setClinicName(event.target.value)} className={INPUT_CLASS} /></div>
      <div><label htmlFor={`doctor-edit-experience-${doctor.doctor_id}`} className={LABEL_CLASS}>Số năm kinh nghiệm</label><input id={`doctor-edit-experience-${doctor.doctor_id}`} type="number" min="0" max="80" value={experienceYears} onChange={(event) => setExperienceYears(event.target.value)} className={INPUT_CLASS} /></div>
      <div className="sm:col-span-2"><label htmlFor={`doctor-edit-bio-${doctor.doctor_id}`} className={LABEL_CLASS}>Giới thiệu ngắn</label><textarea id={`doctor-edit-bio-${doctor.doctor_id}`} rows={3} maxLength={1000} value={bio} onChange={(event) => setBio(event.target.value)} className={INPUT_CLASS} /></div>
      <div className="sm:col-span-2"><label htmlFor={`doctor-edit-focus-${doctor.doctor_id}`} className={LABEL_CLASS}>Phạm vi tư vấn công khai</label><textarea id={`doctor-edit-focus-${doctor.doctor_id}`} rows={3} maxLength={1000} value={consultationFocus} onChange={(event) => setConsultationFocus(event.target.value)} className={INPUT_CLASS} /></div>
      <label className="font-display flex min-h-touch items-center gap-tight text-input font-semibold text-body"><input type="checkbox" checked={isActive} onChange={(event) => setActive(event.target.checked)} className="h-5 w-5" />Tài khoản đang hoạt động</label>
      <label className="font-display flex min-h-touch items-center gap-tight text-input font-semibold text-body"><input type="checkbox" checked={isAvailable} disabled={!isActive} onChange={(event) => setAvailable(event.target.checked)} className="h-5 w-5" />Cho phép nhận yêu cầu tư vấn mới</label>
    </div>

    <div className="mt-snug flex flex-wrap gap-tight">
      <button type="submit" disabled={isSaving} className="motion-press font-display min-h-touch rounded-pill bg-mint px-cozy text-input font-bold text-mint-deep enabled:hover:bg-mint-press disabled:bg-canvas disabled:text-slate">{isSaving ? 'Đang lưu hồ sơ…' : 'Lưu hồ sơ bác sỹ'}</button>
      <button type="button" disabled={isSaving} onClick={onCancel} className="motion-press font-display min-h-touch rounded-pill border-2 border-slate px-cozy text-input font-semibold text-body hover:bg-surface">Hủy</button>
    </div>
  </form>
}

export function EditorDoctorsScreen() {
  const doctorsQuery = useAdminDoctors()
  const invalidate = useInvalidateConsultations()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [bio, setBio] = useState('')
  const [clinicName, setClinicName] = useState('')
  const [experienceYears, setExperienceYears] = useState('')
  const [consultationFocus, setConsultationFocus] = useState('')
  const [isAvailable, setAvailable] = useState(true)
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null)
  const [savedDoctorId, setSavedDoctorId] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: createDoctor,
    onSuccess: () => {
      setEmail(''); setPassword(''); setDisplayName(''); setSpecialty(''); setLicenseNumber(''); setBio(''); setClinicName(''); setExperienceYears(''); setConsultationFocus(''); setAvailable(true)
      invalidate()
    },
  })
  const update = useMutation({
    mutationFn: ({ doctorId, payload }: DoctorUpdateVariables) => updateAdminDoctor(doctorId, payload),
    onSuccess: (_, variables) => {
      setEditingDoctorId(null)
      setSavedDoctorId(variables.doctorId)
      invalidate()
    },
  })

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    create.mutate({
      email: email.trim(),
      temporary_password: password,
      display_name: displayName.trim(),
      specialty: specialty.trim(),
      license_number: licenseNumber.trim(),
      bio: bio.trim() || null,
      clinic_name: clinicName.trim() || null,
      experience_years: experienceYears.trim() === '' ? null : Number(experienceYears),
      consultation_focus: consultationFocus.trim() || null,
      is_available: isAvailable,
    })
  }

  function beginEditing(doctorId: string): void {
    update.reset()
    setSavedDoctorId(null)
    setEditingDoctorId(doctorId)
  }

  const doctors = doctorsQuery.data?.doctors ?? []
  const mutationError = create.error ?? update.error
  return <div className="max-w-reading">
    <h1 className="text-ask font-semibold text-body">Quản lý hồ sơ bác sỹ</h1>
    <p className="mt-snug max-w-answer text-notice text-body">BTV quản lý hồ sơ chuyên môn đã xác minh, tài khoản và việc nhận tư vấn. Bác sỹ chỉ tự cập nhật phần giới thiệu công khai của mình.</p>

    <section className="mt-block" aria-labelledby="create-doctor-title">
      <h2 id="create-doctor-title" className="text-heading font-semibold text-body">Tạo hồ sơ bác sỹ</h2>
      <form onSubmit={submit} className="mt-snug grid gap-snug rounded-card-lg bg-surface p-cozy sm:grid-cols-2">
        <div><label htmlFor="doctor-name" className={LABEL_CLASS}>Tên hiển thị *</label><input id="doctor-name" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={INPUT_CLASS} /></div>
        <div><label htmlFor="doctor-specialty" className={LABEL_CLASS}>Chuyên khoa *</label><input id="doctor-specialty" required value={specialty} onChange={(event) => setSpecialty(event.target.value)} className={INPUT_CLASS} /></div>
        <div><label htmlFor="doctor-license" className={LABEL_CLASS}>Số giấy phép hành nghề *</label><input id="doctor-license" required value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} className={INPUT_CLASS} /></div>
        <div><label htmlFor="doctor-email" className={LABEL_CLASS}>Email đăng nhập *</label><input id="doctor-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={INPUT_CLASS} /></div>
        <div><label htmlFor="doctor-password" className={LABEL_CLASS}>Mật khẩu tạm thời *</label><input id="doctor-password" type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className={INPUT_CLASS} /><p className="font-display mt-hair text-question text-slate">Cấp riêng cho bác sỹ qua kênh an toàn; không hiển thị lại sau khi tạo.</p></div>
        <div><label htmlFor="doctor-bio" className={LABEL_CLASS}>Giới thiệu ngắn</label><textarea id="doctor-bio" rows={3} maxLength={1000} value={bio} onChange={(event) => setBio(event.target.value)} className={INPUT_CLASS} /></div>
        <div><label htmlFor="doctor-clinic" className={LABEL_CLASS}>Cơ sở công tác</label><input id="doctor-clinic" maxLength={160} value={clinicName} onChange={(event) => setClinicName(event.target.value)} className={INPUT_CLASS} /></div>
        <div><label htmlFor="doctor-experience" className={LABEL_CLASS}>Số năm kinh nghiệm</label><input id="doctor-experience" type="number" min="0" max="80" value={experienceYears} onChange={(event) => setExperienceYears(event.target.value)} className={INPUT_CLASS} /></div>
        <div className="sm:col-span-2"><label htmlFor="doctor-focus" className={LABEL_CLASS}>Phạm vi tư vấn công khai</label><textarea id="doctor-focus" rows={3} maxLength={1000} value={consultationFocus} onChange={(event) => setConsultationFocus(event.target.value)} className={INPUT_CLASS} /><p className="font-display mt-hair text-question text-slate">Nội dung này hiển thị cho bệnh nhân trước khi họ chọn bác sỹ.</p></div>
        <label className="font-display flex min-h-touch items-center gap-tight text-input font-semibold text-body sm:col-span-2"><input type="checkbox" checked={isAvailable} onChange={(event) => setAvailable(event.target.checked)} className="h-5 w-5" />Nhận yêu cầu tư vấn ngay sau khi tạo</label>
        <div className="sm:col-span-2"><button type="submit" disabled={create.isPending} className="motion-press font-display min-h-touch rounded-pill bg-mint px-cozy text-input font-bold text-mint-deep enabled:hover:bg-mint-press disabled:bg-canvas disabled:text-slate">{create.isPending ? 'Đang tạo tài khoản…' : 'Tạo tài khoản bác sỹ'}</button></div>
      </form>
    </section>

    {mutationError !== null && mutationError !== undefined && <div className="mt-snug"><ErrorNotice error={mutationError} retryLabel="Tải lại" onRetry={() => void doctorsQuery.refetch()} /></div>}

    <section className="mt-block" aria-labelledby="doctor-list-title">
      <div className="flex flex-wrap items-end justify-between gap-tight">
        <div>
          <h2 id="doctor-list-title" className="text-heading font-semibold text-body">Hồ sơ bác sỹ</h2>
          <p className="font-display mt-hair text-question text-slate">Mở từng hồ sơ để cập nhật thông tin được BTV xác minh.</p>
        </div>
        {doctors.length > 0 && <p className="font-mono text-question text-slate">{doctors.length} hồ sơ</p>}
      </div>
      {doctorsQuery.isPending && <p role="status" className="font-display mt-snug text-notice text-slate">Đang đọc hồ sơ bác sỹ…</p>}
      {doctorsQuery.isError && <div className="mt-snug"><ErrorNotice error={doctorsQuery.error} retryLabel="Đọc lại" onRetry={() => void doctorsQuery.refetch()} /></div>}
      {!doctorsQuery.isPending && !doctorsQuery.isError && doctors.length === 0 && <EmptyState title="Chưa có hồ sơ bác sỹ" body="Tài khoản bác sỹ được BTV tạo sau bước xác minh giấy phép hành nghề." />}
      {doctors.length > 0 && <ul className="mt-snug space-y-snug">{doctors.map((doctor) => <li key={doctor.doctor_id} className="rounded-card bg-surface p-cozy">
        <div className="flex flex-wrap items-start justify-between gap-snug">
          <div>
            <h3 className="text-notice font-semibold text-body">{doctor.display_name}</h3>
            <p className="font-display mt-hair text-input text-mint-deep">{doctor.specialty}</p>
            <p className="font-display mt-hair text-question text-slate">{doctor.email} · GPLH {doctor.license_number}</p>
          </div>
          <div className="flex flex-wrap gap-hair">
            <span className={`font-display rounded-pill px-snug py-hair text-question font-semibold ${doctor.is_active ? 'bg-mint text-mint-deep' : 'bg-sand text-sand-deep'}`}>{doctor.is_active ? 'Đang hoạt động' : 'Đã khóa'}</span>
            <span className="font-display rounded-pill bg-canvas px-snug py-hair text-question font-semibold text-body">{doctor.is_available && doctor.is_active ? 'Đang nhận tư vấn' : 'Tạm dừng nhận tư vấn'}</span>
          </div>
        </div>
        {doctor.bio !== null && <p className="font-display mt-snug text-question text-slate">{doctor.bio}</p>}
        <dl className="font-display mt-snug grid gap-tight text-question text-slate sm:grid-cols-2">
          <div><dt className="sr-only">Cơ sở công tác</dt><dd>Cơ sở công tác: {doctor.clinic_name ?? 'Chưa cập nhật'}</dd></div>
          <div><dt className="sr-only">Kinh nghiệm</dt><dd>Kinh nghiệm: {doctor.experience_years === null ? 'Chưa cập nhật' : `${doctor.experience_years} năm`}</dd></div>
          <div><dt className="sr-only">Trạng thái xác minh</dt><dd>{doctor.is_verified ? `Đã xác minh${doctor.verified_at === null ? '' : ` · ${formatDateTime(doctor.verified_at)}`}` : 'Chưa xác minh'}</dd></div>
          <div><dt className="sr-only">Cập nhật gần nhất</dt><dd>Cập nhật {formatDateTime(doctor.updated_at)}</dd></div>
        </dl>
        {doctor.consultation_focus !== null && <p className="font-display mt-tight text-question text-slate">Phạm vi tư vấn: {doctor.consultation_focus}</p>}
        {savedDoctorId === doctor.doctor_id && <p role="status" className="font-display mt-snug text-question font-semibold text-mint-deep">Đã lưu hồ sơ bác sỹ.</p>}
        <button type="button" disabled={update.isPending} onClick={() => beginEditing(doctor.doctor_id)} className="motion-press font-display mt-snug min-h-touch rounded-pill border-2 border-slate px-cozy text-input font-semibold text-body hover:bg-canvas">{editingDoctorId === doctor.doctor_id ? 'Đang chỉnh sửa' : 'Sửa hồ sơ'}</button>
        {editingDoctorId === doctor.doctor_id && <DoctorProfileEditor key={doctor.doctor_id} doctor={doctor} isSaving={update.isPending} onCancel={() => { update.reset(); setEditingDoctorId(null) }} onSave={(payload) => update.mutate({ doctorId: doctor.doctor_id, payload })} />}
      </li>)}</ul>}
    </section>
  </div>
}
