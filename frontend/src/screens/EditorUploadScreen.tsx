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

import { useEditorConditions } from '../app/editor'
import { uploadDocument, ApiError } from '../lib/api'

/** Nhãn của một trường. Tối thiểu 17px theo sàn cỡ chữ nội dung. */
const LABEL_CLASS = 'font-display block text-input font-semibold text-body'
const INPUT_CLASS =
  'font-body mt-tight min-h-touch w-full rounded-card border-2 border-slate bg-surface p-snug text-input text-body'

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
  const conditionsQuery = useEditorConditions()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedConditions, setSelectedConditions] = useState<string[]>([])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const form = e.currentTarget
    const formData = new FormData(form)

    // Đảm bảo diseases (bệnh) không rỗng
    if (selectedConditions.length === 0) {
      setError(
        'Bạn hãy chọn ít nhất một bệnh áp dụng.',
      )
      setIsSubmitting(false)
      return
    }
    formData.set('diseases', selectedConditions.join(','))

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
      <h1 className="text-ask font-semibold text-body">Tải lên tài liệu y khoa</h1>
      <p className="mt-snug max-w-answer text-notice text-body">
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

      {/* Lưới hai cột từ 640px cho những ô NGẮN, một cột cho ô dài.
          `sm:col-span-2` là cách nói "ô này cần cả hàng" — tiêu đề, chỉ định
          bệnh, đường dẫn và ghi chú đều dài, ép chúng vào nửa hàng thì chữ
          trong ô bị cắt ngay khi vừa gõ. */}
      <form
        onSubmit={handleSubmit}
        className="mt-block grid gap-cozy rounded-card-lg bg-surface p-cozy sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
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
            className="font-display mt-tight block w-full text-question text-body file:mr-cozy file:rounded-pill file:border-0 file:bg-mint file:px-cozy file:py-tight file:text-question file:font-semibold file:text-ink"
          />
        </div>

        <div className="sm:col-span-2">
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

        <>
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
        </>

        <div className="sm:col-span-2">
          <p className={LABEL_CLASS}>
            Bệnh áp dụng
            <Required />
          </p>
          {conditionsQuery.isPending && <p role="status" className="font-display mt-tight text-question text-slate">Đang đọc danh mục bệnh…</p>}
          {conditionsQuery.isError && <p role="alert" className="font-display mt-tight text-question text-alert">Không đọc được danh mục bệnh. Hãy tải lại trang trước khi tải tài liệu.</p>}
          {conditionsQuery.data !== undefined && (
            <div className="mt-tight space-y-tight" role="group" aria-label="Bệnh áp dụng">
              {conditionsQuery.data.conditions.filter((condition) => condition.status !== 'inactive').map((condition) => {
                const checked = selectedConditions.includes(condition.condition_id)
                return (
                  <label key={condition.condition_id} className="flex min-h-touch items-center gap-snug rounded-card border-2 border-line bg-canvas px-snug py-tight text-input text-body">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => setSelectedConditions((current) => event.target.checked
                        ? [...current, condition.condition_id]
                        : current.filter((item) => item !== condition.condition_id))}
                    />
                    <span>{condition.label_vi}</span>
                    <span className="font-mono text-question text-slate">{condition.condition_id}</span>
                    {condition.status === 'waiting_for_sources' && <span className="font-display ml-auto text-question text-sand-deep">Chờ tài liệu nguồn</span>}
                  </label>
                )
              })}
            </div>
          )}
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

        <div className="sm:col-span-2">
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

        <div className="sm:col-span-2">
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

        <div className="flex flex-wrap gap-snug border-t border-line pt-cozy sm:col-span-2">
          <button
            type="submit"
            disabled={isSubmitting || conditionsQuery.isPending || conditionsQuery.isError}
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
            className="motion-press font-display min-h-call rounded-pill border-2 border-slate bg-surface px-cozy text-input font-semibold text-body enabled:hover:bg-canvas"
          >
            Huỷ
          </button>
        </div>
      </form>
    </div>
  )
}
