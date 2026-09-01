/**
 * Hồ sơ bác sỹ tự sửa — `/doctor/profile`.
 *
 * CHÉP TỪ `id="bshs"`: nhãn `.eb` "Khu vực bác sỹ", tiêu đề, một đoạn dẫn, rồi
 * HAI `.phieu` xếp dọc, mỗi cái đóng bằng `.rangcua`.
 *
 *   TRÊN  `.phieu-top` tô `--tim-wash` — phần chỉ đọc. Bên trong là lưới
 *         `.auto` bốn mục `.lab` + giá trị; số giấy phép dùng `.mono` vì nó là
 *         mã, đọc theo từng ký tự.
 *   DƯỚI  `.phieu-top` trơn — phần bác sỹ tự sửa, đúng các ô `.o`, một nút
 *         `.chon` bật/tắt nhận tư vấn, hai `<textarea class="o">` và `.btn.pri`.
 *
 * HAI KHỐI TÁCH NHAU LÀ RANH GIỚI QUYỀN, không phải cách chia cho đẹp: chuyên
 * khoa, giấy phép và trạng thái xác minh do biên tập viên quản lý, nên chúng
 * nằm trong khối chỉ đọc và câu `.lab` cuối khối nói thẳng ai sửa được.
 *
 * Bản mẫu viết sẵn tên, cơ sở, số năm và hai đoạn giới thiệu; ở đây tất cả đến
 * từ `useOwnDoctorProfile` và đi ngược lại qua `updateOwnDoctorProfile`.
 */
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'

import { useInvalidateConsultations, useOwnDoctorProfile } from '../app/consultations'
import { updateOwnDoctorProfile } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import type { DoctorOwnProfile, UpdateDoctorOwnProfileRequest } from '../lib/schemas'
import { ErrorNotice } from '../ui/ErrorNotice'

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

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="eb">Khu vực bác sỹ</div>

      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 10 }}>Hồ sơ của tôi</h1>

      <p style={{ fontSize: 'var(--t-note)', color: 'var(--xam)', marginTop: 12, maxWidth: '58ch' }}>
        Cập nhật thông tin bệnh nhân nhìn thấy trước khi chọn tư vấn với bạn.
      </p>

      {/* Tài khoản bị tạm ngưng là tình huống đứng NGOÀI hai khối dưới, vì nó
          nói về quyền chứ không về nội dung hồ sơ. Dùng đúng lối dải cảnh báo
          của bản mẫu: nền nhạt và một nét dọc cùng màu. */}
      {!doctor.is_active && (
        <div
          style={{
            marginTop: 18,
            padding: '12px 14px',
            background: 'var(--do-wash)',
            borderLeft: '2px solid var(--do)',
          }}
        >
          <span className="lab" style={{ color: 'var(--do)' }}>
            Tài khoản đang tạm ngưng
          </span>
          <p style={{ fontSize: 'var(--t-note)', marginTop: 5, maxWidth: '56ch', lineHeight: 1.7 }}>
            Tài khoản hiện đang tạm ngưng bởi biên tập viên. Bạn vẫn có thể cập nhật hồ sơ, nhưng
            không thể bật nhận yêu cầu mới.
          </p>
        </div>
      )}

      {/* ---- Khối chỉ đọc ---- */}
      <section className="phieu" style={{ marginTop: 22 }} aria-labelledby="professional-title">
        <div
          className="phieu-top"
          style={{
            background: 'var(--tim-wash)',
            color: 'var(--tim)',
            borderBottomColor: 'var(--tim)',
          }}
        >
          <span id="professional-title">
            {doctor.is_verified
              ? 'Thông tin chuyên môn đã xác minh'
              : 'Thông tin chuyên môn chưa xác minh'}
          </span>
          <span>Chỉ đọc</span>
        </div>

        <div style={{ padding: '20px clamp(16px,2vw,24px)' }}>
          <dl className="auto" style={{ margin: 0 }}>
            <div>
              <dt className="lab">Email đăng nhập</dt>
              <dd style={{ fontSize: 'var(--t-note)', marginTop: 2, marginLeft: 0 }}>
                {doctor.email}
              </dd>
            </div>
            <div>
              <dt className="lab">Chuyên khoa</dt>
              <dd style={{ fontSize: 'var(--t-note)', marginTop: 2, marginLeft: 0 }}>
                {doctor.specialty}
              </dd>
            </div>
            <div>
              <dt className="lab">Số giấy phép hành nghề</dt>
              <dd className="mono" style={{ fontSize: 'var(--t-note)', marginTop: 2, marginLeft: 0 }}>
                {doctor.license_number}
              </dd>
            </div>
            {doctor.verified_at !== null && (
              <div>
                <dt className="lab">Thời điểm xác minh</dt>
                <dd style={{ fontSize: 'var(--t-note)', marginTop: 2, marginLeft: 0 }}>
                  {formatDateTime(doctor.verified_at)}
                </dd>
              </div>
            )}
          </dl>

          <p
            className="lab"
            style={{
              marginTop: 16,
              paddingTop: 12,
              borderTop: '1px solid var(--ke)',
              lineHeight: 1.6,
            }}
          >
            Chuyên khoa, giấy phép và trạng thái xác minh do biên tập viên quản lý. Liên hệ biên tập
            viên nếu các thông tin này cần thay đổi.
          </p>
        </div>

        <div className="rangcua" />
      </section>

      {/* ---- Khối bác sỹ tự sửa ---- */}
      <form onSubmit={submit} className="phieu" style={{ marginTop: 16, display: 'block' }}>
        <div className="phieu-top">
          <span>Thông tin công khai</span>
        </div>

        <div style={{ padding: '20px clamp(16px,2vw,24px)' }}>
          <p className="lab" style={{ lineHeight: 1.6 }}>
            Nội dung này sẽ hiển thị cho bệnh nhân khi họ xem hồ sơ của bạn.
          </p>

          <div className="auto" style={{ marginTop: 14 }}>
            <div>
              <label htmlFor="own-doctor-name" className="lab">
                Tên hiển thị
              </label>
              <input
                id="own-doctor-name"
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
              <label htmlFor="own-doctor-clinic" className="lab">
                Cơ sở công tác
              </label>
              <input
                id="own-doctor-clinic"
                maxLength={160}
                value={clinicName}
                onChange={(event) => setClinicName(event.target.value)}
                className="o"
                style={{ marginTop: 6 }}
              />
            </div>

            <div>
              <label htmlFor="own-doctor-experience" className="lab">
                Số năm kinh nghiệm
              </label>
              <input
                id="own-doctor-experience"
                type="number"
                inputMode="numeric"
                min="0"
                max="80"
                value={experienceYears}
                onChange={(event) => setExperienceYears(event.target.value)}
                className="o"
                style={{ marginTop: 6 }}
              />
            </div>
          </div>

          {/* Bản mẫu để cái này là `<button class="chon" aria-pressed>` chứ
              không phải ô tích — giữ nguyên, vì `.chon[aria-pressed]` mới là
              thứ vẽ ra ô vuông tím `.box`. Tài khoản bị tạm ngưng thì nút khoá,
              đúng như luật của khối cảnh báo phía trên. */}
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="chon"
              aria-pressed={isAvailable}
              disabled={!doctor.is_active}
              onClick={() => setAvailable((current) => !current)}
              style={{ maxWidth: '44ch', opacity: doctor.is_active ? undefined : 0.55 }}
            >
              <span className="box" aria-hidden="true" />
              <span>Đang nhận yêu cầu tư vấn</span>
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            <label htmlFor="own-doctor-bio" className="lab">
              Giới thiệu ngắn
            </label>
            <textarea
              id="own-doctor-bio"
              maxLength={1000}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              className="o"
              style={{ marginTop: 6, minHeight: 90, lineHeight: 1.65 }}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <label htmlFor="own-doctor-focus" className="lab">
              Phạm vi tư vấn
            </label>
            <textarea
              id="own-doctor-focus"
              maxLength={1000}
              value={consultationFocus}
              onChange={(event) => setConsultationFocus(event.target.value)}
              className="o"
              style={{ marginTop: 6, minHeight: 90, lineHeight: 1.65 }}
            />
          </div>

          {update.isError && (
            <div style={{ marginTop: 14 }}>
              <ErrorNotice
                error={update.error}
                retryLabel="Thử lưu lại"
                onRetry={() => {
                  if (lastPayload !== null) update.mutate(lastPayload)
                }}
              />
            </div>
          )}

          <button type="submit" disabled={update.isPending} className="btn pri" style={{ marginTop: 18 }}>
            {update.isPending ? 'Đang lưu…' : 'Lưu hồ sơ'}
          </button>

          {update.isSuccess && (
            <p role="status" className="lab" style={{ marginTop: 9 }}>
              Đã lưu thay đổi hồ sơ.
            </p>
          )}
        </div>

        <div className="rangcua" />
      </form>
    </div>
  )
}

export function DoctorProfileScreen() {
  const query = useOwnDoctorProfile()

  if (query.isPending) {
    return (
      <p role="status" className="lab">
        Đang mở hồ sơ bác sỹ…
      </p>
    )
  }
  if (query.isError) {
    return <ErrorNotice error={query.error} retryLabel="Mở lại hồ sơ" onRetry={() => void query.refetch()} />
  }
  if (query.data === undefined) return null

  return <DoctorProfileForm key={query.data.doctor_id} doctor={query.data} />
}
