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
      /* CHÉP TỪ `id="ot"`: nhãn `.eb` đếm câu, dòng `.lab` tiến độ, một dãy
         vạch 2px làm thanh tiến trình, rồi `.phieu` chứa câu hỏi và bốn ô
         `.chon` có `.box` + `.abcd`. */
      <section style={{ marginBottom: 26 }}>
        <div className="eb">{title}</div>
        <p className="lab" style={{ marginTop: 6 }}>
          Đã trả lời {answeredCount}/{quiz.questions.length} câu ·{' '}
          {hint ?? SOURCE_HINTS[quiz.source]}
          {!quiz.metadata.grounded && ' (chưa đối chiếu được với tài liệu gốc)'}
        </p>

        {/* Thanh tiến trình: một vạch cho mỗi câu, tô TÍM khi đã trả lời.
            `aria-hidden` vì dòng `.lab` ngay trên đã nói đúng con số đó bằng
            chữ, và `aria-live` ở đây sẽ đọc lặp mỗi lần chọn. */}
        <div aria-hidden="true" style={{ display: 'flex', gap: 5, marginTop: 14, maxWidth: 260 }}>
          {quiz.questions.map((question) => (
            <span
              key={question.index}
              style={{
                flex: 1,
                height: 2,
                background:
                  answers[question.index] === UNANSWERED ? 'var(--ke-dam)' : 'var(--tim)',
              }}
            />
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          Đã trả lời {answeredCount} trên {quiz.questions.length} câu
        </p>

        <div className="phieu" style={{ marginTop: 22 }}>
          <div style={{ padding: 'clamp(20px,3vw,30px)' }}>
            <h3 style={{ fontSize: 'var(--t-h3)', lineHeight: 1.24, maxWidth: '26ch' }}>
              {quiz.topic}
            </h3>

            <ol style={{ listStyle: 'none', margin: '24px 0 0', padding: 0, display: 'grid', gap: 26 }}>
              {quiz.questions.map((question) => (
                <li key={question.index}>
                  <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
                    <legend style={{ fontWeight: 500, padding: 0 }}>
                      Câu {question.index + 1}. {question.question}
                    </legend>

                    <div style={{ display: 'grid', gap: 10, marginTop: 12, maxWidth: '46ch' }}>
                      {question.options.map((option, optionIndex) => {
                        const checked = answers[question.index] === optionIndex
                        return (
                          <label key={optionIndex} className="chon" aria-pressed={checked}>
                            {/* Ô radio thật, ẩn khỏi mắt nhưng còn nguyên cho
                                bàn phím và trình đọc màn hình. `.box` và
                                `.abcd` là phần nhìn thấy được. */}
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
                            <span className="box" aria-hidden="true" />
                            <span className="abcd" aria-hidden="true">
                              {OPTION_LABELS[optionIndex]}
                            </span>
                            <span style={{ minWidth: 0, flex: 1 }}>{option}</span>
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                </li>
              ))}
            </ol>

            {showUnanswered && (
              <p role="alert" className="lab" style={{ color: 'var(--do)', marginTop: 14 }}>
                Bạn còn {quiz.questions.length - answeredCount} câu chưa chọn đáp án.
              </p>
            )}

            {submit.isError && (
              <div style={{ marginTop: 14 }}>
                <ErrorNotice error={submit.error} retryLabel="Nộp lại" onRetry={handleSubmit} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submit.isPending}
                className="btn pri"
              >
                {submit.isPending ? 'Đang chấm bài…' : 'Nộp bài'}
              </button>
            </div>

            <p className="lab" style={{ marginTop: 14, lineHeight: 1.6 }}>
              {quiz.disclaimer}
            </p>
          </div>
          <div className="rangcua" />
        </div>
      </section>
    )
  }

  // ── Chưa bắt đầu ─────────────────────────────────────────────────────────
  return (
    <section className="phieu" style={{ marginBottom: 26 }}>
      <div className="phieu-top">
        <span>{title}</span>
        <span>{numQuestions} câu</span>
      </div>

      <div style={{ padding: '20px clamp(16px,2vw,24px)' }}>
        <p style={{ fontSize: 'var(--t-note)', color: 'var(--xam)', maxWidth: '56ch', lineHeight: 1.7 }}>
          {hint ?? SOURCE_HINTS[source]} Trả lời đúng từ 60% trở lên để nhận điểm HP.
        </p>

        {generate.isError && (
          <div style={{ marginTop: 14 }}>
            <ErrorNotice error={generate.error} retryLabel="Thử lại" onRetry={startQuiz} />
          </div>
        )}

        <button
          type="button"
          onClick={startQuiz}
          disabled={generate.isPending}
          className="btn pri"
          style={{ marginTop: 18 }}
        >
          {generate.isPending ? 'Đang soạn đề cho bạn…' : ctaLabel}
        </button>

        {generate.isPending && (
          <p className="lab" style={{ marginTop: 9, lineHeight: 1.6 }} aria-live="polite">
            Trợ lý đang đọc lại tài liệu và soạn {numQuestions} câu hỏi. Mất khoảng vài
            giây.
          </p>
        )}
      </div>

      <div className="rangcua" />
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
    /* CHÉP TỪ khối phản hồi cuối `id="ot"`: một `.phieu` viền XANH với
       `.phieu-top` nền xanh nhạt ghi kết quả, rồi từng câu với bốn ô `.chon`
       đánh dấu đáp án đúng và ô mình đã chọn, và số hiệu văn bản mono tím ở
       cuối mỗi phần giải thích. */
    <section
      className="phieu"
      style={{ marginBottom: 26, borderColor: result.passed ? 'var(--xanh)' : 'var(--ke)' }}
    >
      <div
        className="phieu-top"
        style={
          result.passed
            ? {
                background: 'var(--xanh-wash)',
                color: 'var(--xanh)',
                borderBottomColor: 'var(--xanh)',
              }
            : undefined
        }
      >
        <span>{title} — kết quả</span>
        <span>
          {result.score}/{result.total} câu đúng
        </span>
      </div>

      <div style={{ padding: '20px clamp(16px,2vw,24px)' }}>
        <h3 style={{ fontSize: 'var(--t-h3)' }}>{topic}</h3>
        <p style={{ marginTop: 8, fontSize: 'var(--t-note)', color: 'var(--xam)', lineHeight: 1.7, maxWidth: '56ch' }}>
          {result.passed
            ? `Bạn nắm bài tốt. Được cộng ${result.hp_earned} HP, tổng điểm hiện tại ${result.stats.total_score}.`
            : 'Chưa đạt 60% nên lần này chưa cộng HP. Đọc lại phần giải thích rồi thử lại nhé.'}
        </p>

        <ol style={{ listStyle: 'none', margin: '26px 0 0', padding: 0, display: 'grid', gap: 26 }}>
          {result.results.map((item) => (
            <li key={item.index}>
              <p style={{ fontWeight: 500 }}>
                Câu {item.index + 1}. {item.question}
              </p>

              <div style={{ display: 'grid', gap: 7, marginTop: 12, maxWidth: '46ch' }}>
                {item.options.map((option, optionIndex) => {
                  const isCorrect = optionIndex === item.correct_index
                  const isYours = optionIndex === item.your_answer

                  return (
                    <p
                      key={optionIndex}
                      className="chon"
                      style={
                        isCorrect
                          ? { borderColor: 'var(--tim)', background: 'var(--tim-wash)' }
                          : isYours
                            ? { borderColor: 'var(--do)' }
                            : undefined
                      }
                    >
                      <span className="abcd" aria-hidden="true">
                        {OPTION_LABELS[optionIndex]}
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        {option}
                        {/* MÀU KHÔNG PHẢI KÊNH DUY NHẤT: cả hai ô đặc biệt đều
                            kèm chữ, vì trong nhóm người đọc 45–70 tuổi tỉ lệ
                            khó phân biệt màu là đáng kể. */}
                        {isCorrect && <strong> — đáp án đúng</strong>}
                        {isYours && !isCorrect && <strong> — bạn đã chọn</strong>}
                      </span>
                    </p>
                  )
                })}
              </div>

              {/* Giải thích hiện cho CẢ hai trường hợp, không chỉ khi sai.
                  Người đoán mò mà trúng cũng chưa hiểu gì hơn người sai —
                  giấu phần này của họ là để họ mang cái không-hiểu đi tiếp. */}
              <p
                style={{
                  marginTop: 12,
                  border: `1px solid ${item.is_correct ? 'var(--ke)' : 'var(--do)'}`,
                  background: 'var(--page)',
                  padding: '11px 13px',
                  fontSize: 'var(--t-note)',
                  lineHeight: 1.7,
                }}
              >
                <strong style={{ color: item.is_correct ? 'var(--ink)' : 'var(--do)' }}>
                  {item.is_correct ? 'Đúng rồi. ' : 'Chưa đúng. '}
                </strong>
                {item.explanation}
              </p>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="btn"
          style={{ marginTop: 26 }}
        >
          {isRetrying ? 'Đang soạn đề mới…' : 'Làm bộ câu hỏi khác'}
        </button>
      </div>

      <div className="rangcua" />
    </section>
  )
}
