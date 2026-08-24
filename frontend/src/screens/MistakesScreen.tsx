/**
 * Màn ôn lại chỗ chưa nắm — `/quiz/mistakes`.
 *
 * Hai nửa, và thứ tự giữa chúng là chủ ý:
 *
 *   1. ĐỌC LẠI  — từng câu đã sai, đáp án mình đã chọn, đáp án đúng, và vì sao.
 *   2. LÀM LẠI  — đề MỚI trên cùng những khái niệm đó.
 *
 * Đọc trước rồi mới làm. Cho làm lại ngay khi chưa đọc giải thích thì người học
 * chỉ đang đoán lại lần nữa. Và đề làm lại là câu MỚI chứ không phải câu cũ xáo
 * đáp án — cách đó chỉ đo được trí nhớ mặt chữ, không đo được đã hiểu chưa.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useQuizMistakes } from '../app/quiz'
import type { QuizMistake } from '../lib/schemas'
import { ErrorNotice } from '../ui/ErrorNotice'
import { QuizPanel } from '../ui/QuizPanel'

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const

export function MistakesScreen() {
  const { data, isPending, isError, error, refetch } = useQuizMistakes()
  const [dangLamLai, setDangLamLai] = useState(false)

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p role="status" className="font-display text-question text-slate">
          Đang xem lại bài làm của bạn…
        </p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-cozy">
        <ErrorNotice error={error} retryLabel="Tải lại" onRetry={() => void refetch()} />
      </div>
    )
  }

  const mistakes = data?.items ?? []

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-reading px-cozy py-block">
        <nav className="mb-block">
          <Link
            to="/quiz"
            className="font-display inline-flex min-h-touch items-center text-input font-semibold text-slate underline underline-offset-4 hover:text-body"
          >
            ← Trắc nghiệm kiến thức
          </Link>
        </nav>

        <header className="mb-block">
          <h1 className="text-ask font-semibold text-body">Chỗ bạn chưa nắm</h1>
          {mistakes.length > 0 ? (
            <p className="mt-snug max-w-answer text-notice text-body">
              {mistakes.length} chỗ, tổng {data?.total_wrong} lần trả lời sai, tính trên{' '}
              {data?.sessions_scanned} bài đã nộp. Câu sai nhiều lần xếp trước.
            </p>
          ) : (
            <p className="mt-snug max-w-answer text-notice text-body">
              Bạn chưa trả lời sai câu nào. Làm thêm vài bài trắc nghiệm rồi quay lại đây nhé.
            </p>
          )}
        </header>

        {mistakes.length === 0 ? (
          <Link
            to="/quiz"
            className="motion-press font-display inline-flex min-h-touch items-center rounded-pill bg-mint px-cozy text-input font-bold text-ink no-underline"
          >
            Làm một bài trắc nghiệm
          </Link>
        ) : (
          <>
            <ol className="mb-block flex flex-col gap-para">
              {mistakes.map((mistake, index) => (
                <MistakeCard key={`${mistake.quiz_id}-${index}`} mistake={mistake} />
              ))}
            </ol>

            {dangLamLai ? (
              <QuizPanel source="mistakes" ctaLabel="Bắt đầu làm lại" />
            ) : (
              <section className="mb-block max-w-answer rounded-card-lg bg-surface p-cozy">
                <h2 className="text-heading font-semibold text-body">
                  Thử lại những chỗ này
                </h2>
                <p className="mt-hair font-display text-question text-slate">
                  Trợ lý sẽ soạn <strong className="font-semibold text-body">câu hỏi mới</strong> về
                  đúng các khái niệm trên, diễn đạt khác đi. Nhớ mặt đáp án cũ sẽ không giúp được —
                  đó mới là cách biết bạn đã thật sự hiểu.
                </p>
                <button
                  type="button"
                  onClick={() => setDangLamLai(true)}
                  className="motion-press font-display mt-snug inline-flex min-h-touch items-center rounded-pill bg-mint px-cozy text-input font-bold text-ink"
                >
                  🎯 Làm lại bằng câu hỏi mới
                </button>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MistakeCard({ mistake }: { mistake: QuizMistake }) {
  /** Đáp án chọn gần nhất. Mảng `chosen` xếp mới nhất trước. */
  const daChon = mistake.chosen[0]

  return (
    <li className="rounded-card bg-surface p-cozy">
      <div className="mb-tight flex flex-wrap items-center gap-tight">
        <span className="font-display rounded-pill border-2 border-alert px-snug py-hair text-note font-semibold text-alert">
          Sai {mistake.times_wrong} lần
        </span>
        {mistake.topic && (
          <span className="font-display text-note text-slate">{mistake.topic}</span>
        )}
      </div>

      <p className="font-display text-question font-semibold text-body">{mistake.question}</p>

      <div className="mt-tight flex flex-col gap-hair">
        {mistake.options.map((option, index) => {
          const dung = index === mistake.correct_index
          const cuaBan = index === daChon
          const tone = dung
            ? 'bg-mint text-ink'
            : cuaBan
              ? 'border-2 border-alert bg-canvas text-body'
              : 'bg-canvas text-body'

          return (
            <p
              key={index}
              className={`font-display flex items-start gap-snug rounded-card p-snug text-question ${tone}`}
            >
              <span className="font-bold" aria-hidden="true">
                {OPTION_LABELS[index]}
              </span>
              <span className="flex-1">{option}</span>
              {dung && (
                <span className="font-display text-note font-semibold">Đáp án đúng</span>
              )}
              {cuaBan && !dung && (
                <span className="font-display text-note font-semibold text-alert">Bạn đã chọn</span>
              )}
            </p>
          )
        })}
      </div>

      <p className="mt-snug rounded-card bg-canvas p-snug font-display text-question text-body">
        <span className="font-semibold text-body">Vì sao: </span>
        {mistake.explanation}
      </p>
    </li>
  )
}
