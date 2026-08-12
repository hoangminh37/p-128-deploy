/**
 * Ô nhập câu hỏi, ghim ở đáy màn hình.
 *
 * Dùng `sticky` chứ không `fixed`. Hai lý do:
 *
 * 1. Sticky vẫn chiếm chỗ trong luồng, nên dòng cuối của câu trả lời không bao
 *    giờ chui xuống dưới ô nhập — khỏi phải bù padding bằng tay.
 * 2. Trên điện thoại, bàn phím ảo thu nhỏ khung nhìn. Khung ngoài đo bằng
 *    `min-h-dvh` (dynamic viewport) nên co theo, và sticky bám đáy khung đã co
 *    — ô nhập nổi lên trên bàn phím thay vì bị che.
 *
 * Nền `bg-paper` là bắt buộc: thiếu nó thì chữ cuộn qua phía dưới sẽ lộ ra.
 */
import { useId, useRef, type FormEvent } from 'react'

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string
  onChange: (next: string) => void
  onSubmit: () => void
  disabled: boolean
}) {
  const inputId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isEmpty = value.trim() === ''

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (disabled || isEmpty) return
    onSubmit()
    // Trả focus về ô nhập để người dùng bàn phím hỏi tiếp không phải Tab lại.
    textareaRef.current?.focus()
  }

  return (
    <form
      onSubmit={handleSubmit}
      // Đệm dưới cộng thêm vùng an toàn của máy có thanh gạt dưới màn hình.
      className="sticky bottom-0 bg-paper pt-snug pb-[calc(var(--spacing-snug)+env(safe-area-inset-bottom))]"
    >
      {/* Nét kẻ tách khỏi phần nội dung cuộn phía trên. */}
      <div className="border-t border-rule pt-snug">
        <label htmlFor={inputId} className="font-display block text-note text-moss">
          Câu hỏi của bạn
        </label>

        <div className="mt-tight flex items-end gap-tight">
          <textarea
            id={inputId}
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={2}
            maxLength={5000}
            disabled={disabled}
            placeholder="Ví dụ: Tôi bị tăng huyết áp thì nên ăn uống thế nào?"
            className="font-body min-h-touch w-full flex-1 resize-none rounded-lg border-2 border-border bg-paper p-snug text-input text-ink placeholder:text-moss disabled:border-rule disabled:text-moss"
          />

          {/* Nhãn chữ, không phải chỉ mũi tên: biểu tượng trơ không nói được gì
              với người chưa quen dùng ứng dụng nhắn tin.

              Dùng được  — nền medical đặc, chữ paper. Tương phản 5.76:1.
              Vô hiệu hóa — bỏ hẳn nền, chỉ còn viền rule mảnh và chữ moss. Khác
              hẳn về hình chứ không chỉ mờ đi, để không ai bấm nhầm rồi tưởng hỏng. */}
          <button
            type="submit"
            disabled={disabled || isEmpty}
            className="font-display min-h-touch shrink-0 rounded-lg border-2 border-medical bg-medical px-cozy text-input font-bold text-paper disabled:border-rule disabled:bg-transparent disabled:font-normal disabled:text-moss"
          >
            Gửi
          </button>
        </div>
      </div>
    </form>
  )
}
