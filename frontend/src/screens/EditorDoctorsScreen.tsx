/**
 * Quản lý tài khoản bác sỹ, đường dẫn `/editor/doctors`.
 *
 * Dựng theo màn `#btbs` của bản mẫu: `.eb` đề mục, tiêu đề `--t-h2`, một
 * `.phieu` để TẠO, rồi một `.eb solo` đếm số hồ sơ và một `.phieu` để ĐỌC.
 *
 * Hai `.chip` trên mỗi hồ sơ trả lời hai câu hỏi khác nhau, nên không được
 * trộn: "tài khoản còn dùng được không" (Đang hoạt động / Đã khoá) và "có
 * đang nhận yêu cầu mới không" (Đang nhận tư vấn / Tạm dừng). Một bác sỹ đang
 * hoạt động vẫn có thể tạm dừng nhận tư vấn, và đó là chuyện bình thường —
 * gộp hai chip lại là bắt biên tập viên đoán.
 *
 * Form sửa hồ sơ mở NGAY DƯỚI hàng của bác sỹ đó chứ không phải một trang
 * khác: người trực đang đối chiếu giấy phép hành nghề, họ cần thấy hàng gốc và
 * ô đang sửa cùng lúc.
 */
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'

import { useAdminDoctors, useInvalidateConsultations } from '../app/consultations'
import { createDoctor, updateAdminDoctor } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import type { AdminDoctor, UpdateAdminDoctorRequest } from '../lib/schemas'
import { EmptyState } from '../ui/EmptyState'
import { ErrorNotice } from '../ui/ErrorNotice'
import { DocumentStack } from '../ui/illustrations'

type DoctorUpdateVariables = {
  doctorId: string
  payload: UpdateAdminDoctorRequest
}

/**
 * Ô đánh dấu của bản mẫu: `.chon` với `aria-pressed`, ô thật ẩn bằng
 * `.sr-only` nên bàn phím và trình đọc màn hình vẫn thấy nguyên, phần nhìn
 * thấy được là `.box`.
 */
function OChon({
  checked,
  disabled = false,
  onChange,
  children,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  children: string
}) {
  return (
    <label className="chon" aria-pressed={checked} style={{ opacity: disabled ? 0.55 : 1 }}>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="box" aria-hidden="true" />
      <span style={{ minWidth: 0, flex: 1, fontSize: 'var(--t-note)' }}>{children}</span>
    </label>
  )
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

  const id = doctor.doctor_id

  return (
    <form
      onSubmit={submit}
      className="phieu"
      style={{ marginTop: 14, borderColor: 'var(--tim)' }}
      aria-label={`Sửa hồ sơ ${doctor.display_name}`}
    >
      <div className="phieu-top">
        <span>Chỉnh sửa hồ sơ đã xác minh</span>
        <span className="mono">{id}</span>
      </div>

      <div style={{ padding: '18px clamp(16px,2vw,22px)' }}>
        <p className="lab" style={{ lineHeight: 1.6 }}>
          Thay đổi chuyên khoa và giấy phép do biên tập viên chịu trách nhiệm xác minh trước khi lưu.
        </p>

        <div className="auto" style={{ marginTop: 14 }}>
          <div>
            <label htmlFor={`doctor-edit-name-${id}`} className="lab">
              Tên hiển thị
            </label>
            <input
              id={`doctor-edit-name-${id}`}
              required
              minLength={2}
              maxLength={120}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="o"
              style={{ marginTop: 6 }}
            />
          </div>

          <div>
            <label htmlFor={`doctor-edit-specialty-${id}`} className="lab">
              Chuyên khoa
            </label>
            <input
              id={`doctor-edit-specialty-${id}`}
              required
              minLength={2}
              maxLength={120}
              value={specialty}
              onChange={(event) => setSpecialty(event.target.value)}
              className="o"
              style={{ marginTop: 6 }}
            />
          </div>

          <div>
            <label htmlFor={`doctor-edit-license-${id}`} className="lab">
              Số giấy phép hành nghề
            </label>
            <input
              id={`doctor-edit-license-${id}`}
              required
              minLength={3}
              maxLength={80}
              value={licenseNumber}
              onChange={(event) => setLicenseNumber(event.target.value)}
              className="o"
              style={{ marginTop: 6 }}
            />
          </div>

          <div>
            <label htmlFor={`doctor-edit-email-${id}`} className="lab">
              Email đăng nhập
            </label>
            <input
              id={`doctor-edit-email-${id}`}
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="o"
              style={{ marginTop: 6 }}
            />
          </div>

          <div>
            <label htmlFor={`doctor-edit-clinic-${id}`} className="lab">
              Cơ sở công tác
            </label>
            <input
              id={`doctor-edit-clinic-${id}`}
              maxLength={160}
              value={clinicName}
              onChange={(event) => setClinicName(event.target.value)}
              className="o"
              style={{ marginTop: 6 }}
            />
          </div>

          <div>
            <label htmlFor={`doctor-edit-experience-${id}`} className="lab">
              Số năm kinh nghiệm
            </label>
            <input
              id={`doctor-edit-experience-${id}`}
              type="number"
              min="0"
              max="80"
              value={experienceYears}
              onChange={(event) => setExperienceYears(event.target.value)}
              className="o"
              style={{ marginTop: 6 }}
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label htmlFor={`doctor-edit-bio-${id}`} className="lab">
            Giới thiệu ngắn
          </label>
          <textarea
            id={`doctor-edit-bio-${id}`}
            rows={3}
            maxLength={1000}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            className="o"
            style={{ marginTop: 6, minHeight: 90, lineHeight: 1.6 }}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <label htmlFor={`doctor-edit-focus-${id}`} className="lab">
            Phạm vi tư vấn công khai
          </label>
          <textarea
            id={`doctor-edit-focus-${id}`}
            rows={3}
            maxLength={1000}
            value={consultationFocus}
            onChange={(event) => setConsultationFocus(event.target.value)}
            className="o"
            style={{ marginTop: 6, minHeight: 90, lineHeight: 1.6 }}
          />
        </div>

        <div style={{ display: 'grid', gap: 10, marginTop: 14, maxWidth: '46ch' }}>
          <OChon checked={isActive} onChange={setActive}>
            Tài khoản đang hoạt động
          </OChon>
          <OChon checked={isAvailable} disabled={!isActive} onChange={setAvailable}>
            Cho phép nhận yêu cầu tư vấn mới
          </OChon>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <button type="submit" disabled={isSaving} className="btn pri">
            {isSaving ? 'Đang lưu hồ sơ…' : 'Lưu hồ sơ bác sỹ'}
          </button>
          <button type="button" disabled={isSaving} onClick={onCancel} className="btn gh">
            Hủy
          </button>
        </div>
      </div>

      <div className="rangcua" />
    </form>
  )
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

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="eb">Tài khoản</div>

      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 12 }}>Quản lý bác sỹ</h1>

      <p
        style={{
          fontSize: 'var(--t-note)',
          color: 'var(--xam)',
          marginTop: 12,
          maxWidth: '62ch',
          lineHeight: 1.7,
        }}
      >
        Tài khoản bác sỹ do biên tập viên tạo sau bước xác minh giấy phép hành nghề. Bác
        sỹ chỉ tự cập nhật phần giới thiệu công khai của mình.
      </p>

      {/* ---- Phiếu tạo hồ sơ ---- */}
      <form onSubmit={submit} className="phieu" style={{ marginTop: 22 }}>
        <div className="phieu-top">
          <span>Tạo hồ sơ bác sỹ</span>
        </div>

        <div style={{ padding: '20px clamp(16px,2vw,24px)' }}>
          <div className="auto">
            <div>
              <label htmlFor="doctor-name" className="lab">
                Tên hiển thị
              </label>
              <input
                id="doctor-name"
                required
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="BS. Nguyễn Thị Lan"
                className="o"
                style={{ marginTop: 6 }}
              />
            </div>

            <div>
              <label htmlFor="doctor-specialty" className="lab">
                Chuyên khoa
              </label>
              <input
                id="doctor-specialty"
                required
                value={specialty}
                onChange={(event) => setSpecialty(event.target.value)}
                placeholder="Nội tiết"
                className="o"
                style={{ marginTop: 6 }}
              />
            </div>

            <div>
              <label htmlFor="doctor-license" className="lab">
                Số giấy phép hành nghề
              </label>
              <input
                id="doctor-license"
                required
                value={licenseNumber}
                onChange={(event) => setLicenseNumber(event.target.value)}
                placeholder="GPHN-MAU-01"
                className="o"
                style={{ marginTop: 6 }}
              />
            </div>

            <div>
              <label htmlFor="doctor-email" className="lab">
                Email đăng nhập
              </label>
              <input
                id="doctor-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="lan.nguyen@eduhealth.vn"
                className="o"
                style={{ marginTop: 6 }}
              />
            </div>

            <div>
              <label htmlFor="doctor-password" className="lab">
                Mật khẩu tạm thời
              </label>
              <input
                id="doctor-password"
                type="password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="ít nhất 8 ký tự"
                className="o"
                style={{ marginTop: 6 }}
              />
              <p className="lab" style={{ marginTop: 5, lineHeight: 1.5 }}>
                Cấp riêng cho bác sỹ qua kênh an toàn, không hiển thị lại sau khi tạo.
              </p>
            </div>

            <div>
              <label htmlFor="doctor-clinic" className="lab">
                Cơ sở công tác
              </label>
              <input
                id="doctor-clinic"
                maxLength={160}
                value={clinicName}
                onChange={(event) => setClinicName(event.target.value)}
                placeholder="Bệnh viện Nội tiết Trung ương"
                className="o"
                style={{ marginTop: 6 }}
              />
            </div>

            <div>
              <label htmlFor="doctor-experience" className="lab">
                Số năm kinh nghiệm
              </label>
              <input
                id="doctor-experience"
                type="number"
                min="0"
                max="80"
                value={experienceYears}
                onChange={(event) => setExperienceYears(event.target.value)}
                className="o"
                style={{ marginTop: 6 }}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label htmlFor="doctor-bio" className="lab">
              Giới thiệu ngắn
            </label>
            <textarea
              id="doctor-bio"
              rows={3}
              maxLength={1000}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              className="o"
              style={{ marginTop: 6, minHeight: 90, lineHeight: 1.6 }}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <label htmlFor="doctor-focus" className="lab">
              Phạm vi tư vấn công khai
            </label>
            <textarea
              id="doctor-focus"
              rows={3}
              maxLength={1000}
              value={consultationFocus}
              onChange={(event) => setConsultationFocus(event.target.value)}
              placeholder="Giải thích chỉ số, chế độ ăn, cách theo dõi tại nhà."
              className="o"
              style={{ marginTop: 6, minHeight: 90, lineHeight: 1.6 }}
            />
            <p className="lab" style={{ marginTop: 5, lineHeight: 1.5 }}>
              Nội dung này hiển thị cho bệnh nhân trước khi họ chọn bác sỹ.
            </p>
          </div>

          <div style={{ marginTop: 14, maxWidth: '46ch' }}>
            <OChon checked={isAvailable} onChange={setAvailable}>
              Nhận yêu cầu tư vấn ngay sau khi tạo
            </OChon>
          </div>

          <button type="submit" disabled={create.isPending} className="btn pri" style={{ marginTop: 18 }}>
            {create.isPending ? 'Đang tạo tài khoản…' : 'Tạo tài khoản bác sỹ'}
          </button>
        </div>

        <div className="rangcua" />
      </form>

      {mutationError !== null && mutationError !== undefined && (
        <div style={{ marginTop: 16 }}>
          <ErrorNotice error={mutationError} retryLabel="Tải lại" onRetry={() => void doctorsQuery.refetch()} />
        </div>
      )}

      {/* ---- Danh sách hồ sơ ---- */}
      <div className="eb solo" style={{ marginTop: 30 }}>
        Hồ sơ bác sỹ{doctors.length > 0 && ` · ${doctors.length} tài khoản`}
      </div>

      {doctorsQuery.isPending && (
        <p role="status" className="lab" style={{ marginTop: 14 }}>
          Đang đọc hồ sơ bác sỹ…
        </p>
      )}

      {doctorsQuery.isError && (
        <div style={{ marginTop: 14 }}>
          <ErrorNotice error={doctorsQuery.error} retryLabel="Đọc lại" onRetry={() => void doctorsQuery.refetch()} />
        </div>
      )}

      {!doctorsQuery.isPending && !doctorsQuery.isError && doctors.length === 0 && (
        <div style={{ marginTop: 14 }}>
          <EmptyState
            title="Chưa có hồ sơ bác sỹ"
            body="Tài khoản bác sỹ được biên tập viên tạo sau bước xác minh giấy phép hành nghề."
            illustration={<DocumentStack size={128} />}
          />
        </div>
      )}

      {doctors.length > 0 && (
        <div className="phieu" style={{ marginTop: 14 }}>
          {doctors.map((doctor, index) => (
            <div
              key={doctor.doctor_id}
              style={{
                padding: '18px clamp(16px,2vw,22px)',
                borderBottom: index === doctors.length - 1 ? undefined : '1px solid var(--ke)',
              }}
            >
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <h2 style={{ fontSize: 'var(--t-h3)' }}>{doctor.display_name}</h2>
                  <p className="lab" style={{ lineHeight: 1.6 }}>
                    {doctor.specialty} · {doctor.email} · GPHN{' '}
                    <span className="mono">{doctor.license_number}</span>
                  </p>
                </div>

                <button
                  type="button"
                  disabled={update.isPending}
                  onClick={() => beginEditing(doctor.doctor_id)}
                  className="btn sm gh"
                >
                  {editingDoctorId === doctor.doctor_id ? 'Đang chỉnh sửa' : 'Sửa hồ sơ'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
                <span className={doctor.is_active ? 'chip duyet' : 'chip nhap'}>
                  {doctor.is_active ? 'Đang hoạt động' : 'Đã khoá'}
                </span>
                <span className={doctor.is_available && doctor.is_active ? 'chip duyet' : 'chip cho'}>
                  {doctor.is_available && doctor.is_active ? 'Đang nhận tư vấn' : 'Tạm dừng nhận tư vấn'}
                </span>
                <span className={doctor.is_verified ? 'chip duyet' : 'chip cho'}>
                  {doctor.is_verified
                    ? `Đã xác minh${doctor.verified_at === null ? '' : ` · ${formatDateTime(doctor.verified_at)}`}`
                    : 'Chưa xác minh'}
                </span>
              </div>

              {doctor.bio !== null && (
                <p style={{ fontSize: 'var(--t-note)', color: 'var(--xam)', marginTop: 12, lineHeight: 1.7 }}>
                  {doctor.bio}
                </p>
              )}

              <p className="lab" style={{ marginTop: 12, lineHeight: 1.6 }}>
                Cơ sở công tác: {doctor.clinic_name ?? 'Chưa cập nhật'} · Kinh nghiệm:{' '}
                {doctor.experience_years === null ? 'Chưa cập nhật' : `${doctor.experience_years} năm`} · Cập nhật{' '}
                {formatDateTime(doctor.updated_at)}
              </p>

              {doctor.consultation_focus !== null && (
                <p className="lab" style={{ marginTop: 6, lineHeight: 1.6 }}>
                  Phạm vi tư vấn: {doctor.consultation_focus}
                </p>
              )}

              {savedDoctorId === doctor.doctor_id && (
                <p role="status" className="lab" style={{ color: 'var(--xanh)', marginTop: 12 }}>
                  Đã lưu hồ sơ bác sỹ.
                </p>
              )}

              {editingDoctorId === doctor.doctor_id && (
                <DoctorProfileEditor
                  key={doctor.doctor_id}
                  doctor={doctor}
                  isSaving={update.isPending}
                  onCancel={() => {
                    update.reset()
                    setEditingDoctorId(null)
                  }}
                  onSave={(payload) => update.mutate({ doctorId: doctor.doctor_id, payload })}
                />
              )}
            </div>
          ))}

          <div className="rangcua" />
        </div>
      )}
    </div>
  )
}
