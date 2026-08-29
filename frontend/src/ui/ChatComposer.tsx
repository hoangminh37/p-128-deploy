/**
 * Thanh hỏi đáp ở đáy màn hình.
 *
 * Voice mode được tách sang một lớp hội thoại riêng. Thanh này chỉ làm một
 * việc: mở voice mode, thay vì vừa ghi âm vừa cố gắng hiển thị trạng thái STT
 * trong một nút nhỏ.
 */
import { useId, useRef, type FormEvent } from 'react'

import { MIN_QUERY_LENGTH } from '../lib/schemas'
import { MicrophoneIcon, SearchIcon, SendIcon } from './icons'

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
    <form
      onSubmit={handleSubmit}
      className="sticky bottom-0 bg-canvas pt-snug pb-[calc(var(--spacing-snug)+env(safe-area-inset-bottom))]"
    >
      <div className="border-t border-line pt-snug">
        <label htmlFor={inputId} className="sr-only">
          Hỏi tiếp về bệnh của bạn
        </label>

        <div className="flex items-center gap-tight rounded-pill bg-surface pr-tight pl-cozy focus-within:outline-3 focus-within:outline-mint focus-within:outline-offset-2">
          <SearchIcon className="h-6 w-6 shrink-0 text-slate" />

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
            className="font-body min-h-touch w-full min-w-0 flex-1 bg-transparent text-input text-body placeholder:text-slate focus:outline-none disabled:text-slate"
          />

          {onStartVoice !== undefined && (
            <button
              type="button"
              onClick={onStartVoice}
              disabled={disabled}
              aria-label="Hỏi bằng giọng nói"
              title="Hỏi bằng giọng nói"
              className="motion-press flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full border-2 border-slate text-body enabled:hover:bg-canvas disabled:text-slate"
            >
              <MicrophoneIcon className="h-6 w-6" />
            </button>
          )}

          {!isEmpty && (
            <button
              type="submit"
              disabled={disabled || isTooShort}
              aria-label="Gửi câu hỏi"
              title="Gửi câu hỏi"
              className="motion-press flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full bg-mint text-ink enabled:hover:bg-mint-press disabled:bg-canvas disabled:text-slate"
            >
              <SendIcon className="h-6 w-6" />
            </button>
          )}
        </div>

        {showHint && (
          <p id={hintId} role="status" className="font-display mt-tight text-question text-slate">
            Câu hỏi cần ít nhất {MIN_QUERY_LENGTH} ký tự để trợ lý biết bạn đang
            hỏi điều gì.
          </p>
        )}
      </div>
    </form>
  )
}
