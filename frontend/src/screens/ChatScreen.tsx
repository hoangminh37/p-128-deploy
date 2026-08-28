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
  getVoiceSpeechAudio,
  streamChatMessage,
  streamVoiceChatMessage,
  type ApiError,
  type ChatStreamCallbacks,
  type CompleteLessonResponse,
  type StreamDoneEvent,
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
import { QuizPanel } from '../ui/QuizPanel'
import { SuggestedQuestions } from '../ui/SuggestedQuestions'
import { VoiceChatWidget, type VoiceSubmitResult } from '../ui/VoiceChatWidget'

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
      annotations: message.annotations,
    })
    question = ''
  }

  return turns
}

/** Prefer the patient-facing error emitted by the API layer over a debug log. */
function voiceErrorMessage(error: unknown): string {
  if (
    error !== null &&
    typeof error === 'object' &&
    'userMessage' in error &&
    typeof error.userMessage === 'string'
  ) {
    return error.userMessage
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Không thể đọc câu trả lời thành tiếng. Bạn hãy thử lại.'
}

type AskResult =
  | { ok: true; messageId: string; canSpeak: boolean; question: string }
  | { ok: false; error: unknown }

/**
 * Lời cập nhật trong lúc chờ câu trả lời.
 *
 * Event SSE mang tên node và icon để các client khác có thể dùng, nhưng màn
 * hỏi đáp không nên phơi quy trình nội bộ cho người bệnh. Mỗi bước được đổi
 * thành một câu đời thường: đủ để họ biết hệ thống vẫn đang làm việc, không
 * biến cuộc trò chuyện thành màn hình kỹ thuật.
 */
const STREAMING_COPY: Record<string, { title: string; detail: string }> = {
  intent_router: {
    title: 'Tôi đang đọc kỹ câu hỏi của bạn.',
    detail: 'Sau đó tôi sẽ tìm thông tin phù hợp trong thư viện đã được duyệt.',
  },
  query_preprocessor: {
    title: 'Tôi đang đặt câu hỏi vào đúng ngữ cảnh.',
    detail: 'Thông tin trong hồ sơ chỉ được dùng khi thật sự liên quan.',
  },
  hybrid_retrieval: {
    title: 'Tôi đang tìm tài liệu phù hợp.',
    detail: 'Tôi sẽ chỉ dùng thông tin có nguồn để trả lời bạn.',
  },
  generate_and_verify: {
    title: 'Tôi đang đối chiếu câu trả lời với tài liệu.',
    detail: 'Việc này giúp câu trả lời bám sát nguồn hơn.',
  },
  memory_checkpoint: {
    title: 'Tôi đang hoàn thiện câu trả lời cho bạn.',
    detail: 'Bạn chờ tôi một chút nhé.',
  },
  emergency_handler: {
    title: 'Tôi đang ưu tiên kiểm tra dấu hiệu cần được xử lý ngay.',
    detail: 'An toàn của bạn được đặt lên trước câu trả lời thông thường.',
  },
  refuse_handler: {
    title: 'Tôi đang kiểm tra giới hạn an toàn của câu hỏi.',
    detail: 'Một số quyết định cần do bác sĩ điều trị trực tiếp đưa ra.',
  },
  doctor_referral: {
    title: 'Tôi đang kiểm tra mức độ thông tin có trong thư viện.',
    detail: 'Tôi sẽ nói rõ nếu tài liệu chưa đủ để trả lời chính xác.',
  },
  out_of_domain_handler: {
    title: 'Tôi đang xác định câu hỏi này có nằm trong phạm vi hỗ trợ không.',
    detail: 'Tôi sẽ hướng bạn đến cách nhận được hỗ trợ phù hợp nhất.',
  },
  profile_handler: {
    title: 'Tôi đang xem thông tin trong hồ sơ của bạn.',
    detail: 'Tôi chỉ dùng dữ liệu hồ sơ để trả lời đúng câu hỏi bạn vừa đặt.',
  },
}

function WaitingBlock({ step }: { step: StreamStepEvent | null }) {
  const copy =
    (step === null ? undefined : STREAMING_COPY[step.node]) ??
    STREAMING_COPY.intent_router

  return (
    <div
      role="status"
      aria-live="polite"
      className="max-w-answer rounded-card-lg border-2 border-line bg-surface p-cozy"
    >
      <p className="font-display text-note font-semibold text-slate">Trợ lý sức khỏe</p>
      <p className="mt-hair text-input font-semibold text-body">{copy.title}</p>
      <p className="font-display mt-tight text-question text-slate">{copy.detail}</p>
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
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [isVoiceModeOpen, setVoiceModeOpen] = useState(false)

  const endRef = useRef<HTMLDivElement>(null)
  const audioUrlsRef = useRef(new Map<string, string>())
  const activeAudioRef = useRef<HTMLAudioElement | null>(null)

  // Object URLs hold in-memory audio. They are private to this tab and are
  // released when the screen closes instead of accumulating across a session.
  useEffect(() => {
    return () => {
      activeAudioRef.current?.pause()
      for (const url of audioUrlsRef.current.values()) URL.revokeObjectURL(url)
      audioUrlsRef.current.clear()
    }
  }, [])

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

  async function playAnswer(messageId: string): Promise<void> {
    if (patientId === null) return
    setVoiceError(null)

    try {
      let audioUrl = audioUrlsRef.current.get(messageId)
      if (audioUrl === undefined) {
        const audioBlob = await getVoiceSpeechAudio({
          patient_id: patientId,
          message_id: messageId,
        })
        audioUrl = URL.createObjectURL(audioBlob)
        audioUrlsRef.current.set(messageId, audioUrl)
      }

      activeAudioRef.current?.pause()
      const player = new Audio(audioUrl)
      activeAudioRef.current = player
      setSpeakingMessageId(messageId)
      player.onended = () => {
        if (activeAudioRef.current === player) setSpeakingMessageId(null)
      }
      player.onerror = () => {
        if (activeAudioRef.current === player) {
          setSpeakingMessageId(null)
          setVoiceError('Không thể phát âm thanh. Bạn vẫn có thể đọc câu trả lời trên màn hình.')
        }
      }
      await player.play()
    } catch (error) {
      setSpeakingMessageId(null)
      setVoiceError(voiceErrorMessage(error))
    }
  }

  async function ask(question: string, voiceAudio?: Blob): Promise<AskResult> {
    const trimmed = question.trim()
    if (voiceAudio === undefined && trimmed.length < MIN_QUERY_LENGTH) {
      return {
        ok: false,
        error: new Error(`Câu hỏi cần ít nhất ${MIN_QUERY_LENGTH} ký tự để trợ lý hiểu bạn.`),
      }
    }
    if (isStreaming) {
      return {
        ok: false,
        error: new Error('Trợ lý đang xử lý câu hỏi trước. Bạn hãy chờ một chút rồi thử lại.'),
      }
    }

    const initialQuestion = voiceAudio === undefined ? trimmed : 'Đang nhận diện lời nói…'
    let resolvedQuestion = initialQuestion
    setPendingQuestion(initialQuestion)
    setDraft('')
    setIsStreaming(true)
    setStreamError(null)
    setStreamedAnswer('')
    setCurrentStep({
      node: 'intent_router',
      message: 'Đang đọc câu hỏi của bạn…',
      icon: '',
    })

    const pendingMessageIdRef = { current: '' }
    let completed: AskResult | null = null
    let streamFailure: ApiError | null = null

    try {
      let accumulatedAnswer = ''
      const callbacks: ChatStreamCallbacks = {
        onTranscript: (transcript) => {
          resolvedQuestion = transcript
          setDraft(transcript)
          setPendingQuestion(transcript)
        },
        onStep: (step: StreamStepEvent) => {
          setCurrentStep(step)
        },
        onToken: (token) => {
          accumulatedAnswer += token
          setStreamedAnswer(accumulatedAnswer)
        },
        onDone: (done: StreamDoneEvent) => {
          const finalAnswer = done.answer || accumulatedAnswer
          const messageKey = done.message_id || `m_${Date.now()}`
          pendingMessageIdRef.current = messageKey
          setTurns((previous) => [
            ...previous,
            {
              key: messageKey,
              question: resolvedQuestion,
              status: done.status,
              answer: finalAnswer,
              citations: done.citations || [],
              disclaimer: done.disclaimer || null,
              annotations: undefined,
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
          completed = {
            ok: true,
            messageId: messageKey,
            question: resolvedQuestion,
            // Red-flag guidance must remain visible and actionable.
            canSpeak: done.status !== 'red_flag',
          }
        },
        onAnnotations: (event) => {
          const targetKey = event.message_id || pendingMessageIdRef.current
          if (!targetKey) return
          setTurns((previous) =>
            previous.map((turn) =>
              turn.key === targetKey ? { ...turn, annotations: event.annotations } : turn,
            ),
          )
        },
        onError: (err) => {
          streamFailure = err
          setStreamError(err)
          setIsStreaming(false)
          setCurrentStep(null)
          setStreamedAnswer('')
        },
      }

      if (voiceAudio === undefined) {
        await streamChatMessage(
          {
            query: trimmed,
            patient_id: patientId ?? '',
            conversation_id: conversationId,
          },
          callbacks,
        )
      } else {
        await streamVoiceChatMessage(
          {
            patientId: patientId ?? '',
            conversationId: conversationId,
            audio: voiceAudio,
          },
          callbacks,
        )
      }

      if (streamFailure !== null) return { ok: false, error: streamFailure }
      if (completed !== null) return completed

      const error = new Error('Trợ lý chưa hoàn tất câu trả lời. Bạn hãy thử lại.')
      setIsStreaming(false)
      setCurrentStep(null)
      setStreamedAnswer('')
      return { ok: false, error }
    } catch (err) {
      setStreamError(err as ApiError)
      setIsStreaming(false)
      return { ok: false, error: err }
    }
  }

  async function sendVoiceAudio(audio: Blob): Promise<VoiceSubmitResult> {
    if (patientId === null) {
      throw new Error('Bạn cần mở hồ sơ trước khi hỏi bằng giọng nói.')
    }
    const result = await ask('', audio)
    if (!result.ok) throw result.error
    return { transcript: result.question, ...result }
  }

  async function loadVoiceSpeech(messageId: string): Promise<Blob> {
    if (patientId === null) {
      throw new Error('Bạn cần mở hồ sơ trước khi nghe câu trả lời.')
    }
    return getVoiceSpeechAudio({ patient_id: patientId, message_id: messageId })
  }

  function openVoiceMode(): void {
    activeAudioRef.current?.pause()
    setSpeakingMessageId(null)
    setVoiceError(null)
    setVoiceModeOpen(true)
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
    <>
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
          <AnswerTurn
            key={turn.key}
            turn={turn}
            onListen={() => void playAnswer(turn.key)}
            isListening={speakingMessageId === turn.key}
          />
        ))}

        {turns.map((turn) => (
          <AnswerTurn
            key={turn.key}
            turn={turn}
            onListen={() => void playAnswer(turn.key)}
            isListening={speakingMessageId === turn.key}
          />
        ))}

        {/* ── Khối Streaming: lời cập nhật trước, rồi câu trả lời khi có ─── */}
        {isStreaming && pendingQuestion !== null && (
          <div className="mb-turn animate-answer-in">
            <QuestionHeading question={pendingQuestion} />

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
              <div className="mt-cozy">
                <WaitingBlock step={currentStep} />
              </div>
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
      ) : !isVoiceModeOpen ? (
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSubmit={() => void ask(draft)}
          onStartVoice={patientId === null ? undefined : openVoiceMode}
          disabled={isStreaming}
        />
      ) : null}
      {voiceError !== null && (
        <p role="alert" className="font-display mt-tight max-w-answer text-question text-alert">
          {voiceError}
        </p>
      )}
      </div>

      {isVoiceModeOpen && patientId !== null && (
        <VoiceChatWidget
          onClose={() => setVoiceModeOpen(false)}
          onSubmitAudio={sendVoiceAudio}
          onLoadSpeech={loadVoiceSpeech}
        />
      )}
    </>
  )
}
