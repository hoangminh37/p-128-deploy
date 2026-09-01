/**
 * Thanh hỏi đáp ở đáy màn hình.
 *
 * Voice mode được tách sang một lớp hội thoại riêng. Thanh này chỉ làm một
 * việc: mở voice mode, thay vì vừa ghi âm vừa cố gắng hiển thị trạng thái STT
 * trong một nút nhỏ.
 */
import { useId, useRef, type FormEvent } from 'react'

import { MIN_QUERY_LENGTH } from '../lib/schemas'
import { MicrophoneIcon, SendIcon } from './icons'

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStartVoice,
  disabled,
}: {
  value: string
  onChange: (next: string) => void
  onSubmit: () => void
  onStartVoice?: () => void
  disabled: boolean
}) {
  const inputId = useId()
  const hintId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const trimmed = value.trim()
  const isEmpty = trimmed === ''
  const isTooShort = trimmed.length < MIN_QUERY_LENGTH
  const showHint = !isEmpty && isTooShort

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (disabled || isTooShort) return
    onSubmit()
    inputRef.current?.focus()
  }

  return (
    /* Bản mẫu đặt ô soạn ở cuối `.main` bằng
       `<div style="display:flex;gap:9px"><input class="o"><button class="btn pri">`.
       Ở đây thêm `sticky` để ô luôn với tới được trong một hội thoại dài — bản
       mẫu là trang tĩnh nên không gặp vấn đề đó. Nền `--page` đục để chữ cuộn
       qua phía dưới không lẫn vào ô nhập. */
    <form
      onSubmit={handleSubmit}
      style={{
        position: 'sticky',
        bottom: 0,
        background: 'var(--page)',
        paddingTop: 14,
        paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
        marginTop: 26,
      }}
    >
      <div style={{ borderTop: '1px solid var(--ke)', paddingTop: 14 }}>
        <label htmlFor={inputId} className="sr-only">
          Hỏi tiếp về bệnh của bạn
        </label>

        <div style={{ display: 'flex', gap: 9, alignItems: 'stretch' }}>
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
            className="o"
            style={{ flex: 1, minWidth: 0 }}
          />

          {onStartVoice !== undefined && (
            <button
              type="button"
              onClick={onStartVoice}
              disabled={disabled}
              aria-label="Hỏi bằng giọng nói"
              title="Hỏi bằng giọng nói"
              className="btn"
              style={{ flex: 'none', paddingInline: 14 }}
            >
              <MicrophoneIcon className="" />
            </button>
          )}

          <button
            type="submit"
            disabled={disabled || isTooShort}
            className="btn pri"
            style={{ flex: 'none' }}
          >
            <SendIcon className="" />
            Gửi
          </button>
        </div>

        {showHint && (
          <p id={hintId} role="status" className="lab" style={{ marginTop: 9 }}>
            Câu hỏi cần ít nhất {MIN_QUERY_LENGTH} ký tự để trợ lý biết bạn đang hỏi
            điều gì.
          </p>
        )}
      </div>
    </form>
  )
}
