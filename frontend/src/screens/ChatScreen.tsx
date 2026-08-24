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
 * Dải nhắc cho người đã bấm "bỏ qua" ở màn hồ sơ.
 */
function MissingProfileBand() {
  return (
    <div className="mb-block max-w-answer rounded-lg border-l-4 border-border p-cozy">
      <p className="font-display text-question text-ink">
        Bạn chưa khai hồ sơ, nên câu trả lời chưa đặt được vào bệnh và tuổi của
        bạn. Khai hồ sơ rồi thì trợ lý tra đúng tài liệu cho bệnh của bạn hơn.
      </p>
      <Link
        to="/profile"
        className="font-display mt-tight inline-flex min-h-touch items-center text-input font-semibold text-medical underline underline-offset-4"
      >
        Khai hồ sơ
      </Link>
    </div>
  )
}

/**
 * Banner "Bài học hôm nay" — nơi duy nhất cộng +10 HP.
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

  const chonLai = () => {
    setFeedback(null)
    setSelectedOption(null)
  }

  return (
    <div className="mb-block max-w-answer rounded-lg border-2 border-medical/50 bg-medical/5 p-cozy shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-bold text-medical">
          🎓 Bài học ngày {data.day_number}: {lesson.title}
        </h3>
      </div>

      {feedback && quizData ? (
        <DailyQuizFeedback
          feedback={feedback}
          options={quizData.options}
          question={quizData.question}
          yourAnswer={selectedOption ?? -1}
        />
      ) : !showQuiz ? (
        <p className="mb-3 text-sm leading-relaxed text-ink">{lesson.content}</p>
      ) : (
        quizData && (
          <div className="mb-3 mt-4 border-t border-medical/20 pt-3">
            <p className="font-semibold text-ink mb-2">❓ Câu hỏi: {quizData.question}</p>
            <div className="flex flex-col gap-2">
              {quizData.options.map((opt, idx) => (
                <label
                  key={idx}
                  className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-medical/10 border border-transparent has-[:checked]:border-medical has-[:checked]:bg-medical/20"
                >
                  <input
                    type="radio"
                    name="quiz"
                    className="w-4 h-4 text-medical"
                    checked={selectedOption === idx}
                    onChange={() => {
                      setSelectedOption(idx)
                      setErrorMsg(null)
                    }}
                  />
                  <span className="text-sm text-ink">{opt}</span>
                </label>
              ))}
            </div>
            {errorMsg && <p className="text-red-500 text-sm mt-2 font-medium">{errorMsg}</p>}
          </div>
        )
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {feedback ? (
          feedback.is_correct ? (
            <button
              onClick={() => setHidden(true)}
              className="rounded bg-medical px-4 py-1.5 text-sm font-medium text-white hover:bg-opacity-90"
            >
              Xong rồi
            </button>
          ) : (
            <>
              <button
                onClick={chonLai}
                className="rounded bg-medical px-4 py-1.5 text-sm font-medium text-white hover:bg-opacity-90"
              >
                Chọn lại
              </button>
              <Link
                to={`/learning/${lesson.id}`}
                className="text-sm font-medium text-medical underline underline-offset-4"
              >
                Đọc lại bài học
              </Link>
            </>
          )
        ) : (
          <button
            onClick={handleComplete}
            disabled={completeMutation.isPending}
            className="rounded bg-medical px-4 py-1.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
          >
            {completeMutation.isPending
              ? 'Đang gửi...'
              : showQuiz
                ? 'Trả lời & Nhận HP'
                : 'Làm bài Trắc nghiệm (+10 HP)'}
          </button>
        )}
      </div>
    </div>
  )
}

/** Kết quả một câu của bài học hằng ngày: đáp án đúng, lựa chọn của bạn, vì sao. */
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
    <div className="mb-3 mt-4 border-t border-medical/20 pt-3">
      <p className="font-semibold text-ink mb-2">❓ {question}</p>

      <div className="flex flex-col gap-1">
        {options.map((opt, idx) => {
          const dung = idx === correct_index
          const cuaBan = idx === yourAnswer
          const tone = dung
            ? 'border-medical bg-medical/15'
            : cuaBan
              ? 'border-alert bg-alert/10'
              : 'border-transparent'

          return (
            <p
              key={idx}
              className={`flex items-start gap-2 rounded border-2 p-2 text-sm text-ink ${tone}`}
            >
              <span className="font-bold" aria-hidden="true">
                {String.fromCharCode(65 + idx)}
              </span>
              <span className="flex-1">{opt}</span>
              {dung && <span className="text-xs font-bold text-medical">Đáp án đúng</span>}
              {cuaBan && !dung && <span className="text-xs font-bold text-alert">Bạn đã chọn</span>}
            </p>
          )
        })}
      </div>

      <p
        className={`mt-3 rounded border-l-4 p-2 text-sm text-moss ${
          is_correct ? 'border-medical bg-medical/5' : 'border-alert bg-alert/5'
        }`}
      >
        <span className={`font-semibold ${is_correct ? 'text-medical' : 'text-alert'}`}>
          {is_correct ? 'Đúng rồi. ' : 'Chưa đúng. '}
        </span>
        {explanation}
      </p>

      {is_correct && (
        <p className="mt-2 text-sm font-medium text-medical">
          {hp_earned > 0
            ? `+${hp_earned} HP đã cộng vào điểm của bạn.`
            : 'Hôm nay bạn đã nhận HP rồi, nên lần này chỉ tính là hoàn thành bài.'}
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
          <p role="status" className="font-display max-w-answer text-question text-moss">
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
            <div className="mt-snug mb-block flex items-center gap-2">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-medical/10 border border-medical/20 text-medical font-medium text-sm animate-pulse">
                <span className="text-base">{currentStep?.icon ?? '⏳'}</span>
                <span>{currentStep?.message ?? 'Đang tra cứu trong thư viện đã duyệt…'}</span>
              </span>
            </div>

            {/* Hiển thị câu trả lời streaming realtime nếu đã có token */}
            {streamedAnswer ? (
              <div className="max-w-answer text-answer whitespace-pre-wrap leading-relaxed text-ink">
                {streamedAnswer}
                <span className="inline-block w-2 h-4 ml-1 bg-medical align-middle animate-pulse" />
              </div>
            ) : (
              <p
                role="status"
                className="font-display max-w-answer text-question text-moss"
              >
                Đang xử lý và tổng hợp dữ liệu y khoa chính xác…
              </p>
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

      {/*
        SAU CẢNH BÁO KHẨN CẤP: nhắc, nhưng KHÔNG khoá ô nhập.

        Bản trước thay hẳn ô nhập bằng một dòng chữ, buộc người bệnh bấm "Câu
        hỏi mới" mới hỏi tiếp được. Ý đồ đúng — lúc nghi cấp cứu thì việc cần
        làm là gọi 115, không phải ngồi chat. Nhưng cách làm không đạt được ý đồ
        đó:

        - Chặn này VƯỢT ĐƯỢC bằng đúng một cú bấm, nên nó không thật sự ngăn ai
          ngồi lại chat thay vì gọi cấp cứu. Nó chỉ thêm ma sát.
        - Nó chặn luôn những câu chính đáng và cấp thiết: "tôi có nên uống thuốc
          huyết áp trước khi đi không?"
        - "Câu hỏi mới" mở PHIÊN MỚI, nên trợ lý quên sạch triệu chứng vừa mô tả
          — đúng lúc ngữ cảnh đó đáng giá nhất.
        - Ô nhập biến mất không báo trước, trông như ứng dụng hỏng.

        Nay giữ nguyên khối cảnh báo đỏ và nút gọi 115 ở trên, thêm một dòng
        nhắc ngay sát ô nhập, và để người bệnh tự quyết. Cảnh báo vẫn là thứ
        đập vào mắt trước tiên.
      */}
      {isAfterRedFlag && (
        <p
          role="status"
          className="font-display max-w-answer border-t border-rule pt-snug text-question text-alert"
        >
          Việc cần làm bây giờ là đi khám. Bạn vẫn hỏi thêm được, nhưng đừng để
          việc hỏi làm chậm việc đi khám.
        </p>
      )}

      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSubmit={() => void ask(draft)}
        disabled={isStreaming}
      />
    </div>
  )
}

