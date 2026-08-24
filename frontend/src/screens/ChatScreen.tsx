import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import {
  conversationDetailQueryKey,
  conversationsQueryKey,
} from '../app/conversations'
import { useDailyLesson, useCompleteLesson } from '../app/learning'
import {
  getConversationDetail,
  streamChatMessage,
  type ApiError,
  type CompleteLessonResponse,
  type StreamStepEvent,
} from '../lib/api'
import {
  MIN_QUERY_LENGTH,
  type ConversationDetail,
  type ConversationMessage,
} from '../lib/schemas'
import { usePatient } from '../patient/context'
import { AnswerTurn, QuestionHeading, type Turn } from '../ui/AnswerTurn'
import { ChatComposer } from '../ui/ChatComposer'
import { ErrorNotice } from '../ui/ErrorNotice'
import { LibraryIcon } from '../ui/icons'
import { Mascot } from '../ui/Mascot'
import { QuizPanel } from '../ui/QuizPanel'
import { SuggestedQuestions } from '../ui/SuggestedQuestions'

/**
 * Ghép lịch sử của mục 7 thành các lượt.
 */
function historyToTurns(messages: ConversationMessage[]): Turn[] {
  const turns: Turn[] = []
  let question = ''

  for (const message of messages) {
    if (message.role === 'user') {
      question = message.content
      continue
    }

    turns.push({
      key: message.message_id,
      question,
      status: message.status,
      answer: message.content,
      citations: message.citations,
      disclaimer: null,
    })
    question = ''
  }

  return turns
}

/**
 * Khối chờ, hiện từ lúc gửi câu hỏi tới lúc token đầu tiên về.
 *
 * Thay cho một dòng chữ tĩnh của bản trước. Một dòng chữ đứng im không phân biệt
 * được với một ứng dụng vừa treo, mà khoảng chờ ở đây có thể kéo tới vài chục
 * giây — người 45–70 tuổi sẽ bấm lại hoặc tải lại trang trong lúc máy chủ vẫn
 * đang chạy.
 *
 * Linh vật thở: chu kỳ 2 giây, biên độ 4,5%. Nhỏ tới mức không thành thứ phải
 * nhìn, nhưng đủ để mắt bắt được rằng có gì đó vẫn đang sống. Đây là chỗ thứ tư
 * và cuối cùng linh vật được phép xuất hiện — xem danh sách ở `Mascot.tsx`.
 *
 * DÒNG CHỮ GIỮ NGUYÊN, và giữ nguyên cả `role="status"`. Hoạt ảnh là lớp phụ:
 * người dùng trình đọc màn hình, và người đã tắt hiệu ứng ở hệ điều hành, vẫn
 * phải nhận đúng thông tin đó bằng lời. Hoạt ảnh tự tắt ở
 * `prefers-reduced-motion: reduce` (xem `index.css`) và lúc đó khối này rút về
 * đúng bằng bản chữ cũ, chỉ thêm một hình đứng im.
 */
function WaitingBlock() {
  return (
    <div className="flex max-w-answer items-center gap-cozy rounded-card-lg bg-surface p-cozy">
      <span className="shrink-0 motion-safe:animate-breathe">
        <Mascot variant="muted" size={64} />
      </span>

      <p role="status" className="font-display min-w-0 text-question text-slate">
        Đang xử lý và tổng hợp dữ liệu y khoa chính xác…
      </p>
    </div>
  )
}

/**
 * Dải nhắc cho người đã bấm "bỏ qua" ở màn hồ sơ.
 */
function MissingProfileBand() {
  return (
    <div className="mb-block flex max-w-answer flex-wrap items-center gap-snug rounded-card bg-sand p-cozy">
      <p className="font-display min-w-0 flex-1 text-question text-sand-deep">
        Bạn chưa khai hồ sơ, nên câu trả lời chưa đặt được vào bệnh và tuổi của
        bạn. Khai hồ sơ rồi thì trợ lý tra đúng tài liệu cho bệnh của bạn hơn.
      </p>
      <Link
        to="/profile"
        className="font-display flex min-h-touch shrink-0 items-center rounded-pill bg-sand-deep px-cozy text-input font-bold text-sand no-underline"
      >
        Khai hồ sơ
      </Link>
    </div>
  )
}

/**
 * Banner "Bài học hôm nay" — nơi duy nhất cộng 10 điểm.
 *
 * TRẢ LỜI SAI KHÔNG CÒN LÀ NGÕ CỤT (sửa 24/08/2026).
 *
 * Trước đây chọn sai thì backend ném 400 và banner hiện đúng một dòng đỏ "Sai
 * đáp án, không được cộng điểm!". Người học không biết đáp án đúng là gì, cũng
 * không biết mình nhầm ở đâu — đúng lúc họ sẵn sàng học nhất thì hệ thống chỉ
 * nói "sai" rồi im. Nay mọi lượt trả lời đều nhận lại: đáp án đúng, đáp án mình
 * đã chọn, và một câu giải thích ngắn. Sai thì chọn lại được ngay.
 */
function DailyLessonBanner() {
  const { data, isPending } = useDailyLesson()
  const completeMutation = useCompleteLesson()
  const [hidden, setHidden] = useState(false)
  const [showQuiz, setShowQuiz] = useState(false)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<CompleteLessonResponse | null>(null)

  if (isPending || hidden || !data || !data.lesson) return null

  const lesson = data.lesson
  const quizData = lesson.quiz_data

  const handleComplete = () => {
    if (quizData && !showQuiz) {
      setShowQuiz(true)
      return
    }

    if (quizData && selectedOption === null) {
      setErrorMsg('Bạn chọn một đáp án đã nhé.')
      return
    }

    completeMutation.mutate(
      { articleId: lesson.id, payload: { answer_index: selectedOption ?? 0 } },
      {
        onSuccess: (result) => {
          setErrorMsg(null)
          // Bài không có câu hỏi thì đóng luôn, không có gì để giải thích.
          if (!quizData) setHidden(true)
          else setFeedback(result)
        },
        onError: (err) => setErrorMsg(err.message || 'Gửi không được, bạn thử lại nhé.'),
      },
    )
  }

  return (
    <div className="mb-block max-w-answer rounded-card-lg bg-surface p-cozy">
      <div className="flex items-center gap-snug">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-icon bg-mint text-mint-deep">
          <LibraryIcon className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-note font-semibold text-slate">
            Bài học ngày {data.day_number}
          </p>
          <h2 className="text-empty font-semibold text-body">{lesson.title}</h2>
        </div>
      </div>

      {feedback !== null && quizData ? (
        <DailyQuizFeedback
          feedback={feedback}
          options={quizData.options}
          question={quizData.question}
          yourAnswer={selectedOption ?? -1}
        />
      ) : !showQuiz ? (
        <p className="mt-cozy text-answer text-body">{lesson.content}</p>
      ) : (
        quizData && (
          <div className="mt-cozy border-t border-line pt-snug">
            <p className="font-display text-input font-semibold text-body">
              {quizData.question}
            </p>

            {/* Ô chọn là `bg-canvas`, ô đã chọn đổi sang `bg-mint`. Chữ giữ
                nguyên `ink` ở cả hai: 14.22:1 trên canvas và 7.95:1 trên mint,
                nên trạng thái chọn đọc được mà không phải đổi màu chữ. */}
            <div className="mt-snug flex flex-col gap-tight">
              {quizData.options.map((opt, idx) => (
                <label
                  key={idx}
                  // Màu chữ đặt ở ĐÂY chứ không ở thẻ con: nền ô đổi từ
                  // `canvas` sang `mint` khi được chọn, mà ở chế độ tối
                  // `canvas` là navy đậm còn `mint` vẫn sáng — hai nền đó cần
                  // hai màu chữ ngược nhau. Chỉ thẻ <label> mới biết ô đang
                  // được chọn hay không (`has-[:checked]`), nên luật màu phải
                  // sống ở đây rồi để thẻ con thừa kế.
                  className="flex min-h-touch cursor-pointer items-center gap-snug rounded-card bg-canvas p-snug text-body has-[:checked]:bg-mint has-[:checked]:text-ink"
                >
                  <input
                    type="radio"
                    name="quiz"
                    className="h-5 w-5 shrink-0 accent-ink"
                    checked={selectedOption === idx}
                    onChange={() => {
                      setSelectedOption(idx)
                      setErrorMsg(null)
                    }}
                  />
                  <span className="font-display text-question">{opt}</span>
                </label>
              ))}
            </div>

            {errorMsg !== null && (
              <p
                role="alert"
                className="font-display mt-snug text-question font-semibold text-alert"
              >
                {errorMsg}
              </p>
            )}
          </div>
        )
      )}

      <div className="mt-cozy flex flex-wrap items-center gap-snug">
        {feedback !== null ? (
          feedback.is_correct ? (
            <button
              type="button"
              onClick={() => setHidden(true)}
              className="motion-press font-display min-h-touch rounded-pill bg-mint px-cozy text-input font-bold text-ink"
            >
              Xong rồi
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setFeedback(null)
                  setSelectedOption(null)
                }}
                className="motion-press font-display min-h-touch rounded-pill bg-mint px-cozy text-input font-bold text-ink"
              >
                Chọn lại
              </button>
              <Link
                to={`/learning/${lesson.id}`}
                className="font-display flex min-h-touch items-center text-input font-semibold text-body underline"
              >
                Đọc lại bài học
              </Link>
            </>
          )
        ) : (
          <button
            type="button"
            onClick={handleComplete}
            disabled={completeMutation.isPending}
            className="motion-press font-display min-h-touch rounded-pill bg-mint px-cozy text-input font-bold text-ink disabled:bg-canvas disabled:font-normal disabled:text-slate"
          >
            {completeMutation.isPending
              ? 'Đang gửi…'
              : showQuiz
                ? 'Trả lời và nhận điểm'
                : 'Làm bài trắc nghiệm (+10 điểm)'}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Kết quả một câu của bài học hằng ngày: đáp án đúng, lựa chọn của bạn, vì sao.
 *
 * MÀU KHÔNG PHẢI KÊNH DUY NHẤT. Ô đúng tô mint, ô mình chọn sai viền alert,
 * nhưng cả hai đều kèm chữ ("đáp án đúng" / "bạn đã chọn") vì đây là ứng dụng
 * cho người 45–70 tuổi, trong đó tỉ lệ khó phân biệt màu là đáng kể.
 *
 * Nhãn "Đúng rồi" dùng `text-body` chứ không phải một màu xanh: mint đủ tương
 * phản khi làm NỀN, không đủ khi làm CHỮ trên canvas sáng. Vế "chưa đúng" thì
 * `alert` có sẵn hai giá trị cho hai chế độ nên dùng thẳng được.
 */
function DailyQuizFeedback({
  feedback,
  options,
  question,
  yourAnswer,
}: {
  feedback: CompleteLessonResponse
  options: string[]
  question: string
  yourAnswer: number
}) {
  const { is_correct, correct_index, explanation, hp_earned } = feedback

  return (
    <div className="mt-cozy border-t border-line pt-snug">
      <p className="font-display text-input font-semibold text-body">{question}</p>

      <ul className="mt-snug flex flex-col gap-tight">
        {options.map((opt, idx) => {
          const dung = idx === correct_index
          const cuaBan = idx === yourAnswer
          const tone = dung
            ? 'bg-mint text-ink'
            : cuaBan
              ? 'border-2 border-alert bg-canvas text-body'
              : 'bg-canvas text-body'

          return (
            <li key={idx} className={`flex items-start gap-snug rounded-card p-snug ${tone}`}>
              <span
                className={`font-mono flex h-8 w-8 shrink-0 items-center justify-center rounded-icon text-question font-semibold ${
                  dung ? 'bg-ink text-mint' : 'bg-surface text-slate'
                }`}
              >
                {String.fromCharCode(65 + idx)}
              </span>
              <span className="font-display min-w-0 flex-1 text-question">
                {opt}
                {dung && <span className="font-semibold"> — đáp án đúng</span>}
                {cuaBan && !dung && <span className="font-semibold"> — bạn đã chọn</span>}
              </span>
            </li>
          )
        })}
      </ul>

      <p
        role="status"
        className="font-display mt-snug rounded-card bg-canvas p-snug text-question text-body"
      >
        <span className={`font-semibold ${is_correct ? 'text-body' : 'text-alert'}`}>
          {is_correct ? 'Đúng rồi. ' : 'Chưa đúng. '}
        </span>
        {explanation}
      </p>

      {is_correct && (
        <p className="font-display mt-tight text-question font-semibold text-body">
          {hp_earned > 0
            ? `+${hp_earned} điểm đã cộng cho bạn.`
            : 'Hôm nay bạn đã nhận điểm rồi, nên lần này chỉ tính là hoàn thành bài.'}
        </p>
      )}
    </div>
  )
}

export function ChatScreen({
  openedConversationId,
}: {
  /** Phiên đã lưu cần mở lại, `null` khi bắt đầu một phiên mới. */
  openedConversationId: string | null
}) {
  const { patientId, profile, profileState } = usePatient()
  const queryClient = useQueryClient()

  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(
    openedConversationId,
  )
  /** Giữ lại câu vừa gửi để hiển thị tiêu đề và gửi lại nếu có lỗi. */
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)

  // ── Streaming State ────────────────────────────────────────────────────────
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentStep, setCurrentStep] = useState<StreamStepEvent | null>(null)
  const [streamedAnswer, setStreamedAnswer] = useState('')
  const [streamError, setStreamError] = useState<ApiError | null>(null)

  const endRef = useRef<HTMLDivElement>(null)

  const historyQuery = useQuery<ConversationDetail | null, ApiError>({
    queryKey: conversationDetailQueryKey(patientId, openedConversationId),
    enabled: patientId !== null && openedConversationId !== null,
    queryFn: async () => {
      if (patientId === null || openedConversationId === null) return null
      return getConversationDetail(patientId, openedConversationId)
    },
  })

  const historyTurns = useMemo(
    () =>
      historyQuery.data === null || historyQuery.data === undefined
        ? []
        : historyToTurns(historyQuery.data.messages),
    [historyQuery.data],
  )

  const isLoadingHistory = openedConversationId !== null && historyQuery.isPending

  // Cuộn xuống phần mới nhất sau mỗi lượt hoặc khi token streaming về
  useEffect(() => {
    if (turns.length === 0 && !isStreaming) return
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns.length, isStreaming, streamedAnswer])

  async function ask(question: string) {
    const trimmed = question.trim()
    if (trimmed.length < MIN_QUERY_LENGTH || isStreaming) return

    setPendingQuestion(trimmed)
    setDraft('')
    setIsStreaming(true)
    setStreamError(null)
    setStreamedAnswer('')
    setCurrentStep({
      node: 'intent_router',
      message: '🔍 Đang phân tích câu hỏi...',
      icon: '🔍',
    })

    try {
      let accumulatedAnswer = ''

      await streamChatMessage(
        {
          query: trimmed,
          patient_id: patientId ?? '',
          conversation_id: conversationId,
        },
        {
          onStep: (step) => {
            setCurrentStep(step)
          },
          onToken: (token) => {
            accumulatedAnswer += token
            setStreamedAnswer(accumulatedAnswer)
          },
          onDone: (done) => {
            const finalAnswer = done.answer || accumulatedAnswer
            setTurns((previous) => [
              ...previous,
              {
                key: done.message_id || `m_${Date.now()}`,
                question: trimmed,
                status: done.status,
                answer: finalAnswer,
                citations: done.citations || [],
                disclaimer: done.disclaimer || null,
              },
            ])
            setConversationId(done.conversation_id)
            setPendingQuestion(null)
            setIsStreaming(false)
            setCurrentStep(null)
            setStreamedAnswer('')

            void queryClient.invalidateQueries({
              queryKey: conversationsQueryKey(patientId),
            })
          },
          onError: (err) => {
            setStreamError(err)
            setIsStreaming(false)
          },
        },
      )
    } catch (err) {
      setStreamError(err as ApiError)
      setIsStreaming(false)
    }
  }

  const isEmpty =
    openedConversationId === null &&
    turns.length === 0 &&
    !isStreaming &&
    streamError === null

  const hasQuestionHeading =
    historyTurns.length > 0 || turns.length > 0 || pendingQuestion !== null

  const lastTurn = turns.at(-1) ?? historyTurns.at(-1)
  const isAfterRedFlag =
    lastTurn?.status === 'red_flag' && !isStreaming && streamError === null

  /**
   * Chỉ mời làm trắc nghiệm sau một lượt trả lời có NỘI DUNG GIÁO DỤC.
   *
   * Ba trạng thái còn lại đều không có gì để kiểm tra, và mời sai lúc thì phản
   * cảm: `red_flag` là lúc người bệnh cần đi cấp cứu chứ không phải làm bài,
   * `refused` và `referral` thì trợ lý vừa nói thẳng là không trả lời được.
   */
  const canOfferQuiz =
    conversationId !== null &&
    !isStreaming &&
    streamError === null &&
    (lastTurn?.status === 'answered' || lastTurn?.status === 'partial')

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 pb-turn">
        {!hasQuestionHeading && <h1 className="sr-only">Hỏi đáp sức khỏe</h1>}

        {profileState === 'absent' && <MissingProfileBand />}
        
        {/* Banner bài học hàng ngày */}
        {profileState !== 'absent' && turns.length === 0 && <DailyLessonBanner />}

        {isEmpty && <SuggestedQuestions profile={profile} onPick={ask} />}

        {isLoadingHistory && (
          <p role="status" className="font-display max-w-answer text-question text-slate">
            Đang mở lại hội thoại đã lưu…
          </p>
        )}

        {historyQuery.isError && (
          <div className="mb-turn">
            <ErrorNotice
              error={historyQuery.error}
              retryLabel="Mở lại hội thoại"
              onRetry={() => void historyQuery.refetch()}
            />
          </div>
        )}

        {historyTurns.map((turn) => (
          <AnswerTurn key={turn.key} turn={turn} />
        ))}

        {turns.map((turn) => (
          <AnswerTurn key={turn.key} turn={turn} />
        ))}

        {/* ── Khối Streaming Tiến trình & Token Realtime ────────────────── */}
        {isStreaming && pendingQuestion !== null && (
          <div className="mb-turn animate-answer-in">
            <QuestionHeading question={pendingQuestion} />

            {/* Badge hiển thị Node LangGraph đang thực thi */}
            <div className="mt-cozy mb-block flex">
              <span className="font-display flex w-fit items-center gap-tight rounded-pill bg-mint px-snug py-hair text-question font-semibold text-ink">
                <span aria-hidden="true">{currentStep?.icon ?? '⏳'}</span>
                <span>
                  {currentStep?.message ?? 'Đang tra cứu trong thư viện đã duyệt…'}
                </span>
              </span>
            </div>

            {/* Hiển thị câu trả lời streaming realtime nếu đã có token */}
            {streamedAnswer ? (
              // Đúng thẻ trắng bo 18px mà câu trả lời hoàn chỉnh sẽ dùng, để
              // lúc stream xong không có gì nhảy chỗ.
              <div className="max-w-answer rounded-card-lg bg-surface p-cozy">
                <p className="text-answer whitespace-pre-wrap text-body">
                  {streamedAnswer}
                  {/* Con trỏ nhấp nháy. `inline` cộng `border-l-4`, KHÔNG dùng
                      `inline-block`: tên bậc khoảng cách `--spacing-block` làm
                      Tailwind đọc class đó thành `inline-size: 32px`. Xem cảnh
                      báo ở `--spacing-block` trong `index.css`. */}
                  <span className="ml-hair inline border-l-4 border-mint align-middle" />
                </p>
              </div>
            ) : (
              <WaitingBlock />
            )}
          </div>
        )}

        {/* ── Khối hiển thị lỗi và cho phép thử lại ──────────────────── */}
        {streamError !== null && (
          <div className="mb-turn">
            {pendingQuestion !== null && (
              <div className="mb-block">
                <QuestionHeading question={pendingQuestion} />
              </div>
            )}
            <ErrorNotice
              error={streamError}
              retryLabel="Gửi lại câu hỏi"
              onRetry={() => {
                if (pendingQuestion !== null) void ask(pendingQuestion)
              }}
            />
          </div>
        )}

        {canOfferQuiz && conversationId !== null && (
          <div className="mb-turn">
            <QuizPanel
              source="conversation"
              conversationId={conversationId}
              ctaLabel="Kiểm tra kiến thức vừa trao đổi"
            />
          </div>
        )}

        <div ref={endRef} />
      </div>

      {isAfterRedFlag ? (
        <p className="font-display max-w-answer border-t border-line pt-snug text-question text-slate">
          Việc cần làm bây giờ là đi khám. Khi nào bạn đã ổn và muốn hỏi tiếp,
          bạn hãy bấm “Câu hỏi mới”.
        </p>
      ) : (
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSubmit={() => void ask(draft)}
          disabled={isStreaming}
        />
      )}
    </div>
  )
}

