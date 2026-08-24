/**
 * Khối trắc nghiệm kiến thức — dùng chung cho cả ba nguồn ra đề.
 *
 * Đặt ở `ui/` chứ không nằm trong một màn cụ thể vì cùng một khối này xuất hiện
 * ở ba chỗ: cuối bài học trong Thư viện, cuối một phiên chat, và ở màn `/quiz`
 * riêng. Ba chỗ chỉ khác nhau ở `source`.
 *
 * NĂM TRẠNG THÁI, và vì sao mỗi trạng thái tồn tại:
 *
 *   idle       — chưa bấm gì. Không tự sinh đề lúc mount: mỗi lần sinh tốn một
 *                lượt LLM và ~4 giây, người chỉ lướt qua bài không phải trả giá đó.
 *   generating — đang chờ LLM. Bắt buộc phải có trạng thái riêng, vì 4 giây im
 *                lặng là quá đủ để người bệnh tưởng nút hỏng và bấm lại.
 *   taking     — đang làm bài.
 *   submitting — đang chấm.
 *   result     — đã có điểm và giải thích từng câu.
 */
import { useState } from 'react'

import { useGenerateQuiz, useSubmitQuiz } from '../app/quiz'
import type { QuizResponse, QuizSubmitResponse } from '../lib/api'
import type { QuizSource } from '../lib/schemas'
import { ErrorNotice } from './ErrorNotice'

/** A, B, C, D — nhãn hiển thị cho vị trí đáp án. */
const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const

/** Chưa chọn đáp án. Backend hiểu -1 là bỏ trống, xem hợp đồng mục 13. */
const UNANSWERED = -1

const SOURCE_HINTS: Record<QuizSource, string> = {
  article: 'Câu hỏi được soạn từ chính bài bạn vừa đọc.',
  conversation: 'Câu hỏi được soạn từ chủ đề bạn vừa trao đổi với trợ lý.',
  profile:
    'Câu hỏi được soạn từ những bài bạn đã học và những điều bạn đã hỏi trợ lý.',
  mistakes:
    'Câu hỏi MỚI về đúng những khái niệm bạn từng trả lời sai — không phải câu cũ.',
}

export type QuizPanelProps = {
  source: QuizSource
  articleId?: string
  conversationId?: string
  numQuestions?: number
  /** Chữ trên nút mở bài. Mặc định hợp với chỗ đặt cuối một bài học. */
  ctaLabel?: string
  /** Tiêu đề khối. Đổi được vì cùng component đóng hai vai: "Ôn tập nhanh"
   *  hai câu ở cuối bài, và "Kiểm tra kiến thức" năm câu ở màn /quiz. */
  title?: string
  /** Câu mô tả thay cho `SOURCE_HINTS[source]` mặc định. */
  hint?: string
}

export function QuizPanel({
  source,
  articleId,
  conversationId,
  numQuestions = 5,
  ctaLabel = 'Kiểm tra kiến thức',
  title = 'Kiểm tra kiến thức',
  hint,
}: QuizPanelProps) {
  const generate = useGenerateQuiz()
  const submit = useSubmitQuiz()

  const [quiz, setQuiz] = useState<QuizResponse | null>(null)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<QuizSubmitResponse | null>(null)
  const [showUnanswered, setShowUnanswered] = useState(false)

  const startQuiz = () => {
    setResult(null)
    setShowUnanswered(false)
    generate.mutate(
      { source, articleId, conversationId, numQuestions },
      {
        onSuccess: (data) => {
          setQuiz(data)
          setAnswers(Array.from({ length: data.questions.length }, () => UNANSWERED))
        },
      },
    )
  }

  const chooseOption = (questionIndex: number, optionIndex: number) => {
    setAnswers((previous) => {
      const next = [...previous]
      next[questionIndex] = optionIndex
      return next
    })
  }

  const handleSubmit = () => {
    if (!quiz) return

    // Chặn ở client trước khi gọi: nộp bài còn câu trống thì backend vẫn nhận và
    // chấm câu đó là sai, mà người học lại không hề biết mình đã bỏ sót.
    if (answers.some((answer) => answer === UNANSWERED)) {
      setShowUnanswered(true)
      return
    }

    submit.mutate(
      { quizId: quiz.quiz_id, payload: { answers } },
      { onSuccess: (data) => setResult(data) },
    )
  }

  const answeredCount = answers.filter((answer) => answer !== UNANSWERED).length

  // ── Đã có kết quả ────────────────────────────────────────────────────────
  if (result && quiz) {
    return (
      <QuizResultView
        result={result}
        topic={quiz.topic}
        title={title}
        onRetry={startQuiz}
        isRetrying={generate.isPending}
      />
    )
  }

  // ── Đang làm bài ─────────────────────────────────────────────────────────
  if (quiz) {
    return (
      <section className="mb-block max-w-answer rounded-card-lg bg-surface p-cozy">
        <header className="mb-snug border-b border-line pb-snug">
          <p className="font-display text-note font-semibold uppercase tracking-widest text-slate">
            {title}
          </p>
          <h3 className="text-heading font-semibold text-body">{quiz.topic}</h3>
          <p className="mt-hair font-display text-note text-slate">
            {hint ?? SOURCE_HINTS[quiz.source]}
            {!quiz.metadata.grounded && ' (chưa đối chiếu được với tài liệu gốc)'}
          </p>
          <p className="mt-tight font-display text-note text-slate" aria-live="polite">
            Đã trả lời {answeredCount}/{quiz.questions.length} câu
          </p>
        </header>

        <ol className="flex flex-col gap-para">
          {quiz.questions.map((question) => (
            <li key={question.index}>
              <fieldset>
                <legend className="font-display text-question font-semibold text-body">
                  Câu {question.index + 1}. {question.question}
                </legend>
                <div className="mt-tight flex flex-col gap-tight">
                  {question.options.map((option, optionIndex) => {
                    const checked = answers[question.index] === optionIndex
                    return (
                      <label
                        key={optionIndex}
                        className={`flex min-h-touch cursor-pointer items-center gap-snug rounded-card p-snug transition-colors ${
                          checked ? 'bg-mint text-ink' : 'bg-canvas text-body hover:bg-canvas/70'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`${quiz.quiz_id}-q${question.index}`}
                          className="sr-only"
                          checked={checked}
                          onChange={() => {
                            chooseOption(question.index, optionIndex)
                            setShowUnanswered(false)
                          }}
                        />
                        <span
                          className={`font-mono flex h-8 w-8 shrink-0 items-center justify-center rounded-icon text-question font-semibold ${
                            checked ? 'bg-ink text-mint' : 'bg-surface text-slate'
                          }`}
                          aria-hidden="true"
                        >
                          {OPTION_LABELS[optionIndex]}
                        </span>
                        <span className="font-display text-question">{option}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            </li>
          ))}
        </ol>

        {showUnanswered && (
          <p role="alert" className="mt-snug font-display text-note font-semibold text-alert">
            Bạn còn {quiz.questions.length - answeredCount} câu chưa chọn đáp án.
          </p>
        )}

        {submit.isError && (
          <div className="mt-snug">
            <ErrorNotice error={submit.error} retryLabel="Nộp lại" onRetry={handleSubmit} />
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submit.isPending}
          className="motion-press font-display mt-cozy min-h-touch w-full rounded-pill bg-mint px-cozy text-input font-bold text-ink disabled:bg-canvas disabled:font-normal disabled:text-slate"
        >
          {submit.isPending ? 'Đang chấm bài…' : 'Nộp bài'}
        </button>

        <p className="mt-tight font-display text-note text-slate">{quiz.disclaimer}</p>
      </section>
    )
  }

  // ── Chưa bắt đầu ─────────────────────────────────────────────────────────
  return (
    <section className="mb-block max-w-answer rounded-card-lg bg-surface p-cozy">
      <h3 className="text-heading font-semibold text-body">{title}</h3>
      <p className="mt-hair font-display text-question text-slate">
        {hint ?? SOURCE_HINTS[source]} Trả lời đúng từ 60% trở lên để nhận điểm HP.
      </p>

      {generate.isError && (
        <div className="mt-snug">
          <ErrorNotice error={generate.error} retryLabel="Thử lại" onRetry={startQuiz} />
        </div>
      )}

      <button
        type="button"
        onClick={startQuiz}
        disabled={generate.isPending}
        className="motion-press font-display mt-snug inline-flex min-h-touch items-center gap-tight rounded-pill bg-mint px-cozy text-input font-bold text-ink disabled:bg-canvas disabled:font-normal disabled:text-slate"
      >
        {generate.isPending ? (
          <>
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink"
              aria-hidden="true"
            />
            Đang soạn đề cho bạn…
          </>
        ) : (
          <>🎯 {ctaLabel}</>
        )}
      </button>

      {generate.isPending && (
        <p className="mt-tight font-display text-note text-slate" aria-live="polite">
          Trợ lý đang đọc lại tài liệu và soạn {numQuestions} câu hỏi. Mất khoảng vài giây.
        </p>
      )}
    </section>
  )
}

// ── Màn kết quả ────────────────────────────────────────────────────────────

function QuizResultView({
  result,
  topic,
  title,
  onRetry,
  isRetrying,
}: {
  result: QuizSubmitResponse
  topic: string
  title: string
  onRetry: () => void
  isRetrying: boolean
}) {
  return (
    <section className="mb-block max-w-answer rounded-card-lg bg-surface p-cozy">
      <header className="mb-snug border-b border-line pb-snug">
        <p className="font-display text-note font-semibold uppercase tracking-widest text-slate">
          {title} — kết quả
        </p>
        <h3 className="text-heading font-semibold text-body">{topic}</h3>
        <p className="mt-tight text-ask font-semibold text-body">
          {result.score}/{result.total} câu đúng
        </p>
        <p className="mt-hair font-display text-question text-slate">
          {result.passed
            ? `Bạn nắm bài tốt. Được cộng ${result.hp_earned} HP, tổng điểm hiện tại ${result.stats.total_score}.`
            : 'Chưa đạt 60% nên lần này chưa cộng HP. Đọc lại phần giải thích rồi thử lại nhé.'}
        </p>
      </header>

      <ol className="flex flex-col gap-para">
        {result.results.map((item) => (
          <li key={item.index}>
            <p className="font-display text-question font-semibold text-body">
              <span
                className={`mr-tight font-bold ${item.is_correct ? 'text-body' : 'text-alert'}`}
                aria-hidden="true"
              >
                {item.is_correct ? '✓' : '✗'}
              </span>
              Câu {item.index + 1}. {item.question}
            </p>

            <div className="mt-tight flex flex-col gap-hair">
              {item.options.map((option, optionIndex) => {
                const isCorrect = optionIndex === item.correct_index
                const isYours = optionIndex === item.your_answer
                const tone = isCorrect
                  ? 'bg-mint text-ink'
                  : isYours
                    ? 'border-2 border-alert bg-canvas text-body'
                    : 'bg-canvas text-body'

                return (
                  <p
                    key={optionIndex}
                    className={`font-display flex items-start gap-snug rounded-card p-snug text-question ${tone}`}
                  >
                    <span className="font-bold" aria-hidden="true">
                      {OPTION_LABELS[optionIndex]}
                    </span>
                    <span className="flex-1">{option}</span>
                    {isCorrect && (
                      <span className="font-display text-note font-semibold">Đáp án đúng</span>
                    )}
                    {isYours && !isCorrect && (
                      <span className="font-display text-note font-semibold text-alert">Bạn đã chọn</span>
                    )}
                  </p>
                )
              })}
            </div>

            {/* Giải thích hiện cho CẢ hai trường hợp, không chỉ khi sai.
                Người đoán mò mà trúng cũng chưa hiểu gì hơn người sai — giấu
                phần này của họ là để họ mang cái không-hiểu đó đi tiếp. */}
            <p
              className={`mt-snug rounded-card p-snug font-display text-question text-body ${
                item.is_correct ? 'bg-canvas' : 'border-2 border-alert bg-canvas'
              }`}
            >
              <span
                className={`font-semibold ${item.is_correct ? 'text-body' : 'text-alert'}`}
              >
                {item.is_correct ? 'Đúng rồi. ' : 'Chưa đúng. '}
              </span>
              {item.explanation}
            </p>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={onRetry}
        disabled={isRetrying}
        className="motion-press font-display mt-cozy min-h-touch w-full rounded-pill border-2 border-slate px-cozy text-input font-semibold text-body enabled:hover:bg-canvas disabled:opacity-50"
      >
        {isRetrying ? 'Đang soạn đề mới…' : 'Làm bộ câu hỏi khác'}
      </button>
    </section>
  )
}
