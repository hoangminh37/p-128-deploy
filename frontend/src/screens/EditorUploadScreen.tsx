/**
 * Tải lên tài liệu y khoa, đường dẫn `/editor/upload`.
 *
 * Nền canvas — màn LÀM VIỆC. Form nằm trong một thẻ trắng bo 18px, mọi ô nhập
 * viền `slate` (4.96:1 trên trắng, vượt ngưỡng 3:1 của WCAG 1.4.11).
 *
 * Khối lỗi dùng nền `sand` chứ không phải nền `alert` đặc: đây là lỗi nhập
 * liệu, người dùng sửa được ngay tại chỗ. Nền alert đặc chỉ dành cho khối
 * `red_flag` ở luồng bệnh nhân — xem `ResponseStates.tsx`.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { uploadDocument, ApiError } from '../lib/api'

/** Nhãn của một trường. Tối thiểu 17px theo sàn cỡ chữ nội dung. */
const LABEL_CLASS = 'font-display block text-input font-semibold text-ink'
const INPUT_CLASS =
  'font-body mt-tight min-h-touch w-full rounded-card border-2 border-slate bg-white p-snug text-input text-ink'

/** Dấu bắt buộc. Chữ `alert` trên nền trắng đạt 6.54:1. */
function Required() {
  return (
    <span className="text-alert" aria-hidden="true">
      {' *'}
    </span>
  )
}

export function EditorUploadScreen() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const form = e.currentTarget
    const formData = new FormData(form)

    // Đảm bảo diseases (bệnh) không rỗng
    const diseases = formData.get('diseases')
    if (!diseases) {
      setError(
        'Bạn hãy nhập ít nhất một loại bệnh, ví dụ hypertension hoặc type2_diabetes.',
      )
      setIsSubmitting(false)
      return
    }

    try {
      await uploadDocument(formData)
      // Chuyển hướng về trang queue sau khi upload thành công
      navigate('/editor/queue')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.userMessage)
      } else {
        setError('Đã xảy ra lỗi không xác định.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-reading">
      <h1 className="text-ask font-semibold text-ink">Tải lên tài liệu y khoa</h1>
      <p className="mt-snug max-w-answer text-notice text-ink">
        Tài liệu tải lên sẽ vào hàng đợi duyệt, không vào thẳng thư viện trích
        dẫn. Người duyệt vẫn phải mở từng mục và gắn bệnh áp dụng.
      </p>

      {error !== null && (
        <p
          role="alert"
          className="font-display mt-block rounded-card bg-sand p-cozy text-notice text-sand-deep"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-block space-y-cozy rounded-card-lg bg-white p-cozy"
      >
        <div>
          <label htmlFor="file" className={LABEL_CLASS}>
            Tài liệu PDF
            <Required />
          </label>
          <input
            type="file"
            id="file"
            name="file"
            accept="application/pdf"
            required
            className="font-display mt-tight block w-full text-question text-ink file:mr-cozy file:rounded-pill file:border-0 file:bg-mint file:px-cozy file:py-tight file:text-question file:font-semibold file:text-ink"
          />
        </div>

        <div>
          <label htmlFor="title" className={LABEL_CLASS}>
            Tiêu đề
            <Required />
          </label>
          <input
            type="text"
            id="title"
            name="title"
            required
            className={INPUT_CLASS}
            placeholder="Ví dụ: Hướng dẫn chẩn đoán và điều trị tăng huyết áp"
          />
        </div>

        <div className="grid gap-cozy sm:grid-cols-2">
          <div>
            <label htmlFor="issuer" className={LABEL_CLASS}>
              Nơi ban hành
              <Required />
            </label>
            <input
              type="text"
              id="issuer"
              name="issuer"
              required
              className={INPUT_CLASS}
              placeholder="Ví dụ: Bộ Y tế"
            />
          </div>
          <div>
            <label htmlFor="published" className={LABEL_CLASS}>
              Năm hoặc ngày ban hành
              <Required />
            </label>
            <input
              type="text"
              id="published"
              name="published"
              required
              className={INPUT_CLASS}
              placeholder="Ví dụ: 2024"
            />
          </div>
        </div>

        <div>
          <label htmlFor="diseases" className={LABEL_CLASS}>
            Chỉ định bệnh, cách nhau bằng dấu phẩy
            <Required />
          </label>
          <input
            type="text"
            id="diseases"
            name="diseases"
            required
            className={INPUT_CLASS}
            placeholder="hypertension, type2_diabetes"
          />
        </div>

        <div>
          <label htmlFor="doc_code" className={LABEL_CLASS}>
            Mã tài liệu (không bắt buộc)
          </label>
          <input
            type="text"
            id="doc_code"
            name="doc_code"
            className={INPUT_CLASS}
            placeholder="Ví dụ: 3192/QĐ-BYT"
          />
        </div>

        <div>
          <label htmlFor="url" className={LABEL_CLASS}>
            Đường dẫn gốc (không bắt buộc)
          </label>
          <input
            type="url"
            id="url"
            name="url"
            className={INPUT_CLASS}
            placeholder="https://"
          />
        </div>

        <div>
          <label htmlFor="notes" className={LABEL_CLASS}>
            Ghi chú (không bắt buộc)
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className={INPUT_CLASS}
            placeholder="Ghi chú thêm cho người duyệt…"
          />
        </div>

        <div className="flex flex-wrap gap-snug border-t border-line pt-cozy">
          <button
            type="submit"
            disabled={isSubmitting}
            className="motion-press font-display min-h-call flex-1 rounded-pill bg-mint px-cozy text-input font-bold text-mint-deep enabled:hover:bg-mint-press disabled:bg-canvas disabled:font-normal disabled:text-slate"
          >
            {isSubmitting ? 'Đang tải lên…' : 'Tải lên tài liệu'}
          </button>

          <button
            type="button"
            // Giữ nguyên đích của bản trước, kể cả khi nó không khớp route nào:
            // `/editor/dashboard` rơi vào nhánh `*` rồi được đưa về `/`, và
            // `LandingRedirect` mới đẩy tiếp sang `/editor`. Đợt này chỉ đổi lớp
            // trình bày nên không sửa đường dẫn — nhưng đây là một lỗi thật, đi
            // vòng hai lần chuyển hướng cho một cú bấm Huỷ.
            onClick={() => navigate('/editor/dashboard')}
            className="motion-press font-display min-h-call rounded-pill border-2 border-slate bg-white px-cozy text-input font-semibold text-ink enabled:hover:bg-canvas"
          >
            Huỷ
          </button>
        </div>
      </form>
    </div>
  )
}
