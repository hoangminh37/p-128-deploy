/**
 * Tải lên tài liệu y khoa, đường dẫn `/editor/upload`.
 *
 * CHÉP TỪ `id="btu"` của bản mẫu: nhãn `.eb` "Nhập nguồn mới", tiêu đề, đoạn
 * dẫn nói rõ tài liệu vào HÀNG CHỜ chứ chưa dùng ngay, rồi một `.phieu` chứa
 * khung thả tệp nét đứt và các ô `.o` xếp dọc — số hiệu, tên, cặp cơ quan/năm
 * trong lưới `.auto`, danh sách bệnh bằng `.chon`, ghi chú — khép lại bằng cặp
 * nút `.btn.pri` / `.btn.gh` và dải `.rangcua`.
 *
 * Bản mẫu chỉ vẽ được cái vỏ; mọi ô ở đây gắn với đúng tên trường mà
 * `uploadDocument` gửi lên: `file`, `title`, `issuer`, `published`, `diseases`,
 * `doc_code`, `url`, `notes`. Ô "Đường dẫn gốc" không có trong bản mẫu nhưng
 * backend vẫn nhận và biên tập viên vẫn cần dán liên kết công báo, nên nó giữ
 * nguyên, viết bằng cùng một nhịp `.lab` + `.o`.
 *
 * KHUNG THẢ TỆP LÀ THẬT. Bản mẫu viết "Kéo tệp vào đây" như một hình vẽ; ở đây
 * `onDrop` ghi thẳng tệp vào `input.files` qua `DataTransfer`, nên biểu mẫu vẫn
 * gửi đi bằng `new FormData(form)` như cũ. Cả khung là một `<label>` nên bấm
 * chỗ nào cũng mở hộp chọn tệp, còn `<input>` thật nằm dưới `.sr-only` để bàn
 * phím và trình đọc màn hình vẫn tới được.
 *
 * Khối lỗi dùng nền `--do-wash` viền `--do`: đây là NHÃN LỖI nhập liệu, người
 * dùng sửa được ngay tại chỗ. Nền đỏ đặc chỉ dành cho khối `red_flag` ở luồng
 * bệnh nhân — xem `ResponseStates.tsx`.
 */
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEditorConditions } from '../app/editor'
import { uploadDocument, ApiError } from '../lib/api'

/** Nhãn của một trường: `.lab` mono chữ hoa của bản mẫu, chiếm trọn một dòng. */
const LABEL_STYLE = { display: 'block' } as const

/** Dấu bắt buộc. Chữ `--do` trên nền giấy. */
function Required() {
  return (
    <span style={{ color: 'var(--do)' }} aria-hidden="true">
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
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * Thả tệp: gán vào chính `<input type="file">` chứ không giữ riêng một state.
   *
   * Giữ riêng thì biểu mẫu gửi đi bằng `new FormData(form)` sẽ đọc được một ô
   * file RỖNG trong khi màn hình đang hiện tên tệp — người dùng bấm gửi rồi mới
   * biết mình chưa đính gì.
   */
  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDragging(false)

    const dropped = event.dataTransfer.files.item(0)
    const input = fileInputRef.current
    if (dropped === null || input === null) return

    if (dropped.type !== 'application/pdf') {
      setError('Chỉ nhận tệp PDF. Bạn hãy chọn lại tệp.')
      return
    }

    const transfer = new DataTransfer()
    transfer.items.add(dropped)
    input.files = transfer.files
    setFileName(dropped.name)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const form = e.currentTarget
    const formData = new FormData(form)

    // Đảm bảo diseases (bệnh) không rỗng
    if (selectedConditions.length === 0) {
      setError('Bạn hãy chọn ít nhất một bệnh áp dụng.')
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

  const conditions = (conditionsQuery.data?.conditions ?? []).filter(
    (condition) => condition.status !== 'inactive',
  )

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="eb">Nhập nguồn mới</div>

      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 12 }}>Tải văn bản lên</h1>

      <p
        style={{
          fontSize: 'var(--t-note)',
          color: 'var(--xam)',
          marginTop: 12,
          maxWidth: '56ch',
        }}
      >
        Chỉ nhận văn bản do cơ quan nhà nước ban hành, có số hiệu. Tải lên xong, văn bản vào hàng
        chờ duyệt chứ chưa dùng ngay.
      </p>

      {error !== null && (
        <p
          role="alert"
          style={{
            marginTop: 18,
            border: '1px solid var(--do)',
            borderLeftWidth: 3,
            background: 'var(--do-wash)',
            color: 'var(--do)',
            padding: '14px 16px',
            fontSize: 'var(--t-note)',
          }}
        >
          {error}
        </p>
      )}

      <div className="phieu" style={{ marginTop: 22 }}>
        <form onSubmit={handleSubmit} style={{ padding: 'clamp(20px,3vw,30px)' }}>
          {/* Khung thả tệp của bản mẫu: nét đứt `--ke-dam`, chữ ở giữa. Viền
              đổi sang tím khi đang kéo tệp qua — phản hồi duy nhất nói rằng thả
              ra ở đây là ăn. */}
          <label
            htmlFor="file"
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            style={{
              display: 'block',
              border: `1px dashed ${isDragging ? 'var(--tim)' : 'var(--ke-dam)'}`,
              background: isDragging ? 'var(--tim-wash)' : 'none',
              padding: 'clamp(26px,4vw,40px)',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--f-display)',
                fontSize: 'var(--t-h3)',
              }}
            >
              Kéo tệp vào đây
              <Required />
            </span>
            <span className="lab" style={{ display: 'block', marginTop: 6 }}>
              Chỉ nhận PDF
            </span>
            <span className="btn sm" style={{ marginTop: 16 }} aria-hidden="true">
              Chọn tệp từ máy
            </span>
            {fileName !== null && (
              <span
                className="mono"
                style={{
                  display: 'block',
                  marginTop: 12,
                  fontSize: 'var(--t-note)',
                  color: 'var(--tim)',
                }}
              >
                {fileName}
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              id="file"
              name="file"
              accept="application/pdf"
              required
              className="sr-only"
              onChange={(event) => setFileName(event.target.files?.item(0)?.name ?? null)}
            />
          </label>

          <div style={{ marginTop: 24 }}>
            <label htmlFor="doc_code" className="lab" style={LABEL_STYLE}>
              Số hiệu văn bản
            </label>
            <input
              type="text"
              id="doc_code"
              name="doc_code"
              className="o"
              style={{ marginTop: 7 }}
              placeholder="3192/QĐ-BYT"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <label htmlFor="title" className="lab" style={LABEL_STYLE}>
              Tên văn bản
              <Required />
            </label>
            <input
              type="text"
              id="title"
              name="title"
              required
              className="o"
              style={{ marginTop: 7 }}
              placeholder="Hướng dẫn chẩn đoán và điều trị tăng huyết áp"
            />
          </div>

          <div className="auto" style={{ marginTop: 16 }}>
            <div>
              <label htmlFor="issuer" className="lab" style={LABEL_STYLE}>
                Cơ quan ban hành
                <Required />
              </label>
              <input
                type="text"
                id="issuer"
                name="issuer"
                required
                className="o"
                style={{ marginTop: 7 }}
                placeholder="Bộ Y tế"
              />
            </div>
            <div>
              <label htmlFor="published" className="lab" style={LABEL_STYLE}>
                Năm ban hành
                <Required />
              </label>
              <input
                type="text"
                id="published"
                name="published"
                required
                inputMode="numeric"
                className="o"
                style={{ marginTop: 7 }}
                placeholder="2024"
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label htmlFor="url" className="lab" style={LABEL_STYLE}>
              Đường dẫn gốc
            </label>
            <input
              type="url"
              id="url"
              name="url"
              className="o"
              style={{ marginTop: 7 }}
              placeholder="https://"
            />
          </div>

          {/* Danh mục bệnh: `.chon` của bản mẫu, một nút một bệnh, trạng thái
              nằm ở `aria-pressed` nên trình đọc màn hình đọc ra được đúng cái
              mà ô vuông tím đang nói. */}
          <div style={{ marginTop: 16 }}>
            <span className="lab" style={LABEL_STYLE}>
              Áp dụng cho bệnh
              <Required />
            </span>

            {conditionsQuery.isPending && (
              <p role="status" className="lab" style={{ marginTop: 8 }}>
                Đang đọc danh mục bệnh…
              </p>
            )}

            {conditionsQuery.isError && (
              <p role="alert" style={{ marginTop: 8, color: 'var(--do)', fontSize: 'var(--t-note)' }}>
                Không đọc được danh mục bệnh. Hãy tải lại trang trước khi tải tài liệu.
              </p>
            )}

            {conditionsQuery.data !== undefined && (
              <div
                role="group"
                aria-label="Bệnh áp dụng"
                style={{ display: 'grid', gap: 9, marginTop: 8, maxWidth: '44ch' }}
              >
                {conditions.map((condition) => {
                  const checked = selectedConditions.includes(condition.condition_id)
                  return (
                    <button
                      key={condition.condition_id}
                      type="button"
                      className="chon"
                      aria-pressed={checked}
                      onClick={() =>
                        setSelectedConditions((current) =>
                          checked
                            ? current.filter((item) => item !== condition.condition_id)
                            : [...current, condition.condition_id],
                        )
                      }
                    >
                      <span className="box" />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {condition.label_vi}
                        <span className="lab" style={{ display: 'block', marginTop: 2 }}>
                          {condition.condition_id}
                          {condition.status === 'waiting_for_sources' && ' · chờ tài liệu nguồn'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <label htmlFor="notes" className="lab" style={LABEL_STYLE}>
              Ghi chú cho người duyệt
            </label>
            <textarea
              id="notes"
              name="notes"
              className="o"
              style={{ marginTop: 7, minHeight: 110, lineHeight: 1.6 }}
              placeholder="Văn bản này thay thế bản năm 2010."
            />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
            <button
              type="submit"
              className="btn pri"
              disabled={isSubmitting || conditionsQuery.isPending || conditionsQuery.isError}
              // Bản mẫu vẽ nút không dùng được bằng `opacity:.5;cursor:not-allowed`
              // gõ thẳng vào thẻ (xem nút "Hiện chưa nhận tư vấn" ở `id="tvds"`),
              // vì `.btn` không khai bậc `[disabled]`.
              style={
                isSubmitting || conditionsQuery.isPending || conditionsQuery.isError
                  ? { opacity: 0.5, cursor: 'not-allowed' }
                  : undefined
              }
            >
              {isSubmitting ? 'Đang tải lên…' : 'Tải lên và gửi duyệt'}
            </button>

            <button
              type="button"
              className="btn gh"
              // `/editor` là bảng tổng quan của khu vực biên tập, khai trong
              // `App.tsx`. Đích cũ là `/editor/dashboard` — không khớp route
              // nào, nên một cú bấm Huỷ phải đi qua nhánh `*` về `/` rồi mới
              // được `LandingRedirect` đẩy tiếp tới đây. Nay đi thẳng, một lần
              // chuyển hướng.
              onClick={() => navigate('/editor')}
            >
              Huỷ
            </button>
          </div>
        </form>

        <div className="rangcua" />
      </div>
    </div>
  )
}
