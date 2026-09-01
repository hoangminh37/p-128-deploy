/**
 * Hồ sơ công khai của một bác sỹ, người bệnh đọc TRƯỚC khi chọn gửi yêu cầu.
 *
 * Dựng theo `id="tvbs"` của bản mẫu: nút quay lại `.btn.sm.gh`, nhãn chặng
 * `.eb`, tên bác sỹ ở cỡ `--t-h2`, chuyên khoa ở `.lab`, rồi một thẻ `.phieu`
 * duy nhất chứa toàn bộ phần đã xác minh, và cuối cùng là nút chính.
 *
 * MŨ THẺ TÔ TÍM là chủ ý của bản mẫu chứ không phải trang trí: `--tim` trong hệ
 * này là màu của NGUỒN — số hiệu văn bản, trích dẫn, mọi thứ có thể truy về một
 * bản gốc. Hồ sơ hành nghề của bác sỹ cũng là một thứ như thế, nên nó dùng
 * chung màu với trích dẫn chứ không dùng màu hành động `--xanh`.
 *
 * BỐN Ô THÔNG TIN xếp bằng `.auto`, tức lưới tự gãy theo bề ngang thật chứ
 * không theo điểm ngắt. Ô "thời điểm xác minh" chỉ hiện khi có mốc thời gian
 * thật; ba ô còn lại luôn hiện, và ô nào backend trả `null` thì nói thẳng "chưa
 * công bố" thay vì để trống hay bịa một giá trị trông như thật.
 *
 * Hai đoạn tự do — giới thiệu và phạm vi tư vấn — chỉ dựng khi bác sỹ đã viết.
 * Một tiêu đề `.lab` treo trên khoảng trắng là một lời hứa không có gì đằng sau.
 */
import { Link, useParams } from 'react-router-dom'

import { useDoctorPublicProfile } from '../app/consultations'
import { formatDateTime } from '../lib/datetime'
import { ErrorNotice } from '../ui/ErrorNotice'

/** Một ô nhãn mono trên, giá trị dưới — đúng cặp `.lab` + `p` của bản mẫu. */
function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="lab">{label}</span>
      <p
        className={mono ? 'mono' : undefined}
        style={{ fontSize: 'var(--t-note)', marginTop: 2 }}
      >
        {value}
      </p>
    </div>
  )
}

/** Một đoạn tự do trong thẻ: tiêu đề `.lab` cộng một khối chữ do bác sỹ viết. */
function Prose({ label, body, first = false }: { label: string; body: string; first?: boolean }) {
  return (
    <>
      <span className="lab" style={{ display: 'block', marginTop: first ? 0 : 16 }}>
        {label}
      </span>
      {/* `whiteSpace: pre-wrap` giữ nguyên chỗ xuống dòng bác sỹ đã gõ. Đây là
          chữ của một người, không phải một trường dữ liệu để ứng dụng ép lại. */}
      <p
        style={{
          fontSize: 'var(--t-note)',
          marginTop: 5,
          maxWidth: '56ch',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
        }}
      >
        {body}
      </p>
    </>
  )
}

export function DoctorPublicProfileScreen() {
  const { doctorId } = useParams()
  const query = useDoctorPublicProfile(doctorId ?? '')

  if (query.isPending) {
    return (
      <p role="status" className="lab">
        Đang mở hồ sơ bác sỹ…
      </p>
    )
  }

  if (query.isError) {
    return (
      <ErrorNotice
        error={query.error}
        retryLabel="Mở lại hồ sơ"
        onRetry={() => void query.refetch()}
      />
    )
  }

  const doctor = query.data
  if (doctor === undefined) return null

  return (
    /* Bản mẫu đặt `max-width:820px` ngay trên `.main` của màn này: một cột chữ
       đọc từ trên xuống, không có cột phụ nào để nhường chỗ. */
    <div style={{ maxWidth: 820 }}>
      <Link to="/consultations" className="btn sm gh">
        Quay lại danh sách bác sỹ
      </Link>

      <div className="eb" style={{ marginTop: 18 }}>
        Hồ sơ bác sỹ
      </div>
      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 12 }}>
        {doctor.display_name}
      </h1>
      <p className="lab" style={{ marginTop: 6 }}>
        {doctor.specialty}
      </p>

      <div className="phieu" style={{ marginTop: 22 }}>
        {/* Vế phải của mũ thẻ nói trạng thái xác minh. Chưa xác minh thì nói
            thẳng là chưa, chứ không giấu vế đó đi — người bệnh đang quyết định
            có gửi câu hỏi sức khoẻ cho người này hay không. */}
        <div
          className="phieu-top"
          style={{
            background: 'var(--tim-wash)',
            color: 'var(--tim)',
            borderBottomColor: 'var(--tim)',
          }}
        >
          <span>Hồ sơ chuyên môn</span>
          <span style={doctor.is_verified ? undefined : { color: 'var(--do)' }}>
            {doctor.is_verified ? 'Đã xác minh' : 'Chưa xác minh'}
          </span>
        </div>

        <div style={{ padding: '20px clamp(16px,2vw,24px)' }}>
          <div className="auto">
            <Field label="Số giấy phép hành nghề" value={doctor.license_number} mono />
            <Field label="Cơ sở công tác" value={doctor.clinic_name ?? 'Chưa công bố'} />
            <Field
              label="Kinh nghiệm"
              value={
                doctor.experience_years === null
                  ? 'Chưa công bố'
                  : `${doctor.experience_years} năm`
              }
            />
            {doctor.verified_at !== null && (
              <Field label="Thời điểm xác minh" value={formatDateTime(doctor.verified_at)} />
            )}
          </div>

          {(doctor.bio !== null || doctor.consultation_focus !== null) && (
            <div style={{ height: 1, background: 'var(--ke)', margin: '18px 0' }} />
          )}

          {doctor.bio !== null && <Prose label="Giới thiệu" body={doctor.bio} first />}
          {doctor.consultation_focus !== null && (
            <Prose
              label="Phạm vi tư vấn"
              body={doctor.consultation_focus}
              first={doctor.bio === null}
            />
          )}
        </div>

        <div className="rangcua" />
      </div>

      {/* Bác sỹ đang tắt nhận yêu cầu thì KHÔNG dựng nút mờ: một nút chính bị
          khoá bắt người dùng tự đoán vì sao. Thay bằng một dòng nói rõ hiện
          trạng và lối đi tiếp. */}
      {doctor.is_available ? (
        <p style={{ marginTop: 20 }}>
          <Link
            to={`/consultations?doctor=${encodeURIComponent(doctor.doctor_id)}`}
            className="btn pri"
          >
            Chọn bác sỹ này để tư vấn
          </Link>
        </p>
      ) : (
        <p
          style={{
            marginTop: 20,
            borderLeft: '3px solid var(--vang)',
            background: 'var(--paper)',
            padding: '14px 16px',
            fontSize: 'var(--t-note)',
            lineHeight: 1.66,
            maxWidth: '56ch',
          }}
        >
          Bác sỹ hiện chưa nhận yêu cầu tư vấn mới. Bạn vẫn xem được hồ sơ này, và
          chọn một bác sỹ khác ở danh sách.
        </p>
      )}
    </div>
  )
}
