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
        <p role="status" className="font-display text-question text-moss">
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
            className="font-display inline-flex min-h-touch items-center text-input text-moss underline underline-offset-4 hover:text-ink"
          >
            ← Trắc nghiệm kiến thức
          </Link>
        </nav>

        <header className="mb-block">
          <h1 className="font-display text-ask font-bold text-ink">Chỗ bạn chưa nắm</h1>
          {mistakes.length > 0 ? (
            <p className="mt-tight font-display text-question text-moss">
              {mistakes.length} chỗ, tổng {data?.total_wrong} lần trả lời sai, tính trên{' '}
              {data?.sessions_scanned} bài đã nộp. Câu sai nhiều lần xếp trước.
            </p>
          ) : (
            <p className="mt-tight font-display text-question text-moss">
              Bạn chưa trả lời sai câu nào. Làm thêm vài bài trắc nghiệm rồi quay lại đây nhé.
            </p>
          )}
        </header>

        {mistakes.length === 0 ? (
          <Link
            to="/quiz"
            className="font-display inline-flex min-h-touch items-center rounded-lg bg-medical px-cozy text-input font-semibold text-paper no-underline hover:opacity-90"
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
              <section className="mb-block max-w-answer rounded-lg border-2 border-medical/40 bg-medical/5 p-cozy">
                <h2 className="font-display text-heading font-bold text-ink">
                  Thử lại những chỗ này
                </h2>
                <p className="mt-hair font-display text-question text-moss">
                  Trợ lý sẽ soạn <strong className="font-semibold text-ink">câu hỏi mới</strong> về
                  đúng các khái niệm trên, diễn đạt khác đi. Nhớ mặt đáp án cũ sẽ không giúp được —
                  đó mới là cách biết bạn đã thật sự hiểu.
                </p>
                <button
                  type="button"
                  onClick={() => setDangLamLai(true)}
                  className="font-display mt-snug inline-flex min-h-touch items-center rounded-lg bg-medical px-cozy text-input font-semibold text-paper hover:opacity-90"
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
    <li className="rounded-lg border border-rule bg-paper p-cozy">
      <div className="mb-tight flex flex-wrap items-center gap-tight">
        <span className="font-display rounded-lg bg-alert/10 px-2 py-1 text-note font-bold text-alert">
          Sai {mistake.times_wrong} lần
        </span>
        {mistake.topic && (
          <span className="font-display text-note text-moss">{mistake.topic}</span>
        )}
      </div>

      <p className="font-display text-question font-semibold text-ink">{mistake.question}</p>

      <div className="mt-tight flex flex-col gap-hair">
        {mistake.options.map((option, index) => {
          const dung = index === mistake.correct_index
          const cuaBan = index === daChon
          const tone = dung
            ? 'border-medical bg-medical/15 text-ink'
            : cuaBan
              ? 'border-alert bg-alert/10 text-ink'
              : 'border-transparent text-moss'

          return (
            <p
              key={index}
              className={`font-display flex items-start gap-tight rounded-lg border-2 p-tight text-input ${tone}`}
            >
              <span className="font-bold" aria-hidden="true">
                {OPTION_LABELS[index]}
              </span>
              <span className="flex-1">{option}</span>
              {dung && (
                <span className="font-display text-note font-bold text-medical">Đáp án đúng</span>
              )}
              {cuaBan && !dung && (
                <span className="font-display text-note font-bold text-alert">Bạn đã chọn</span>
              )}
            </p>
          )
        })}
      </div>

      <p className="mt-tight rounded-lg bg-medical/5 p-tight font-display text-note text-moss">
        <span className="font-semibold text-ink">Vì sao: </span>
        {mistake.explanation}
      </p>
    </li>
  )
}
