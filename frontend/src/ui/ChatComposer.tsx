/**
 * Thanh tra cứu, ghim ở đáy màn hình.
 *
 * Cố ý mang hình dáng một Ô TÌM KIẾM chứ không phải ô soạn tin nhắn: bo tròn
 * hoàn toàn, kính lúp ở đầu, một dòng. Đây là trang tra cứu tài liệu, và hình
 * dáng của ô nhập phải nói ra điều đó trước khi người dùng kịp gõ chữ đầu tiên.
 *
 * Dùng `input` một dòng chứ không dùng `textarea`: Enter là phím gửi, nên một ô
 * nhiều dòng chỉ tạo ra một khoảng trống không bao giờ dùng tới.
 *
 * Nút gửi CHỈ HIỆN khi đã có chữ. Ô rỗng thì không có gì để gửi, mà một nút trơ
 * nằm sẵn ở đó chỉ mời người dùng bấm rồi không thấy gì xảy ra.
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

import { MIN_QUERY_LENGTH } from '../lib/schemas'
import { SearchIcon, SendIcon } from './icons'

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
  const hintId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmed = value.trim()
  const isEmpty = trimmed === ''
  /** Đã gõ gì đó nhưng chưa đủ để thành một câu hỏi. Xem `MIN_QUERY_LENGTH`. */
  const isTooShort = trimmed.length < MIN_QUERY_LENGTH
  const showHint = !isEmpty && isTooShort

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    // Chặn ở đây nữa chứ không chỉ dựa vào nút bị vô hiệu hóa: phím Enter cũng
    // gửi được form, mà Enter thì không đi qua nút.
    if (disabled || isTooShort) return
    onSubmit()
    // Trả focus về ô nhập để người dùng bàn phím hỏi tiếp không phải Tab lại.
    inputRef.current?.focus()
  }

  return (
    <form
      onSubmit={handleSubmit}
      // Đệm dưới cộng thêm vùng an toàn của máy có thanh gạt dưới màn hình.
      className="sticky bottom-0 bg-paper pt-snug pb-[calc(var(--spacing-snug)+env(safe-area-inset-bottom))]"
    >
      {/* Nét kẻ tách khỏi phần nội dung cuộn phía trên. */}
      <div className="border-t border-rule pt-snug">
        {/* Nhãn ẩn: kính lúp và chữ gợi ý đã nói rõ ô này để làm gì, nhưng trình
            đọc màn hình không thấy hình, và `placeholder` biến mất ngay khi gõ
            chữ đầu tiên nên không thay được nhãn. */}
        <label htmlFor={inputId} className="sr-only">
          Hỏi tiếp về bệnh của bạn
        </label>

        {/* Viền focus vẽ trên cả thanh chứ không riêng ô `input`: một khung chữ
            nhật nằm lọt trong một thanh bo tròn trông như lỗi hiển thị. */}
        <div className="flex items-center gap-tight rounded-full border-2 border-border bg-paper pr-tight pl-cozy focus-within:outline-3 focus-within:outline-medical focus-within:outline-offset-2">
          <SearchIcon className="h-6 w-6 shrink-0 text-moss" />

          <input
            id={inputId}
            ref={inputRef}
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            maxLength={5000}
            disabled={disabled}
            autoComplete="off"
            placeholder="Hỏi tiếp về bệnh của bạn"
            aria-describedby={showHint ? hintId : undefined}
            className="font-body min-h-touch w-full min-w-0 flex-1 bg-transparent text-input text-ink placeholder:text-moss focus:outline-none disabled:text-moss"
          />

          {!isEmpty && (
            <button
              type="submit"
              disabled={disabled || isTooShort}
              aria-label="Gửi câu hỏi"
              title="Gửi câu hỏi"
              className="flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full bg-medical text-paper disabled:bg-transparent disabled:text-moss"
            >
              <SendIcon className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Lời nhắc chỉ hiện khi đã gõ nhưng chưa đủ. Ô còn trống thì chữ gợi ý
            trong ô đã nói việc cần làm rồi, thêm một dòng nữa là thừa. */}
        {showHint && (
          <p
            id={hintId}
            role="status"
            className="font-display mt-tight text-question text-moss"
          >
            Câu hỏi cần ít nhất {MIN_QUERY_LENGTH} ký tự để trợ lý biết bạn đang
            hỏi điều gì.
          </p>
        )}
      </div>
    </form>
  )
}
