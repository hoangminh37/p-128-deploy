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
    /* CHÉP TỪ `id="cho"`: một `.phieu` với `.phieu-top` ghi việc đang làm,
       thân là các dòng `.buoc` — mỗi dòng một chấm vuông 9px và một câu — rồi
       khung xương `.xuong` quét sáng chỗ câu trả lời sắp hiện ra.

       `.buoc[data-tt="xong"]` chấm tô XANH, `[data-tt="dang"]` chấm viền TÍM
       và nhấp nháy, không có `data-tt` thì chấm xám. Ba trạng thái, ba hình —
       người không phân biệt được màu vẫn đọc ra bước nào đang chạy nhờ chữ
       đậm lên ở bước hiện tại. */
    <div className="phieu" role="status" aria-live="polite">
      <div className="phieu-top">
        <span>Đang tìm căn cứ</span>
        <span className="mono">{copy.title}</span>
      </div>

      <div style={{ padding: '18px clamp(16px,2vw,24px) 0' }}>
        <div className="buoc" data-tt="dang">
          <span className="cham" />
          <span>{copy.detail}</span>
        </div>
      </div>

      <div style={{ padding: '18px clamp(16px,2vw,24px) 20px' }}>
        <div className="xuong" style={{ width: '100%', marginBottom: 8 }} />
        <div className="xuong" style={{ width: '88%', marginBottom: 8 }} />
        <div className="xuong" style={{ width: '46%' }} />
      </div>

      <div className="rangcua" />
    </div>
  )
}

/**
 * Dải nhắc cho người đã bấm "bỏ qua" ở màn hồ sơ.
 */
function MissingProfileBand() {
  return (
    // `.phieu` viền vàng với `.phieu-top` nền vàng: cùng nhịp với khối "chưa
    // xong nhưng không hỏng" của bản mẫu. KHÔNG dùng đỏ — chưa khai hồ sơ
    // không phải lỗi, và đỏ chỉ dành cho dấu hiệu nguy cấp.
    <div className="phieu" style={{ marginBottom: 26, borderColor: 'var(--vang)' }}>
      <div
        className="phieu-top"
        style={{ background: 'var(--vang)', color: 'var(--vang-muc)', borderBottomColor: 'var(--vang-ke)' }}
      >
        <span>Hồ sơ chưa khai</span>
      </div>
      <div
        style={{
          padding: '16px clamp(16px,2vw,24px)',
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <p style={{ flex: 1, minWidth: 220, fontSize: 'var(--t-note)', lineHeight: 1.7 }}>
          Bạn chưa khai hồ sơ, nên câu trả lời chưa đặt được vào bệnh và tuổi của bạn.
          Khai hồ sơ rồi thì trợ lý tra đúng tài liệu cho bệnh của bạn hơn.
        </p>
        <Link to="/profile" className="btn sm">
          Khai hồ sơ
        </Link>
      </div>
      <div className="rangcua" />
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
    /* CHÉP TỪ `id="hdt"`: bài học hôm nay là một `.phieu` với `.phieu-top` ghi
       "Bài học ngày N" bên trái và "Chặng N" bên phải, thân là một hình vuông
       72px nét tím cạnh tên bài và đoạn dẫn, rồi hai nút ở dưới. */
    <div className="phieu" style={{ marginBottom: 26 }}>
      <div className="phieu-top">
        <span>Bài học ngày {data.day_number}</span>
        <span>Chặng {data.day_number}</span>
      </div>

      <div
        style={{
          padding: '20px clamp(16px,2vw,24px)',
          display: 'flex',
          gap: 18,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        {/* Hình tờ tài liệu có ba dòng kẻ, nét tím trên nền tím nhạt — chép
            nguyên svg của bản mẫu. `aria-hidden`: nó không nói gì mà tên bài
            bên cạnh chưa nói. */}
        <svg width="72" height="72" viewBox="0 0 100 100" style={{ flex: 'none' }} aria-hidden="true">
          <rect x="18" y="22" width="58" height="58" fill="var(--tim-wash)" stroke="var(--tim)" strokeWidth="2.5" />
          <path d="M30 40h34M30 52h34M30 64h22" stroke="var(--tim)" strokeWidth="2.5" />
        </svg>

        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: 'var(--t-h3)' }}>{lesson.title}</h2>

          {feedback !== null && quizData ? (
            <DailyQuizFeedback
              feedback={feedback}
              options={quizData.options}
              question={quizData.question}
              yourAnswer={selectedOption ?? -1}
            />
          ) : !showQuiz ? (
            <p
              style={{
                fontSize: 'var(--t-note)',
                color: 'var(--xam)',
                marginTop: 8,
                maxWidth: '52ch',
                lineHeight: 1.7,
              }}
            >
              {lesson.content}
            </p>
          ) : (
            quizData && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--ke)', paddingTop: 14 }}>
                <p style={{ fontWeight: 500 }}>{quizData.question}</p>

                {/* `.chon` của bản mẫu: khung kẻ trên giấy nền, và ô đã chọn
                    đổi sang nền tím nhạt kèm viền tím cộng một nét trong 1px.
                    Ba tín hiệu cùng lúc — nền, viền, và ô vuông `.box` bị tô
                    đặc — nên trạng thái chọn đọc ra được cả khi người dùng
                    không phân biệt được màu. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
                  {quizData.options.map((opt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="chon"
                      aria-pressed={selectedOption === idx}
                      onClick={() => {
                        setSelectedOption(idx)
                        setErrorMsg(null)
                      }}
                    >
                      <span className="box" aria-hidden="true" />
                      <span>{opt}</span>
                    </button>
                  ))}
                </div>

                {errorMsg !== null && (
                  <p role="alert" className="lab" style={{ color: 'var(--do)', marginTop: 12 }}>
                    {errorMsg}
                  </p>
                )}
              </div>
            )
          )}

          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 16, alignItems: 'center' }}>
            {feedback !== null ? (
              feedback.is_correct ? (
                <button type="button" onClick={() => setHidden(true)} className="btn pri sm">
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
                    className="btn pri sm"
                  >
                    Chọn lại
                  </button>
                  <Link to={`/learning/${lesson.id}`} className="btn sm gh">
                    Đọc lại bài học
                  </Link>
                </>
              )
            ) : (
              <button
                type="button"
                onClick={handleComplete}
                disabled={completeMutation.isPending}
                className="btn pri sm"
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
      </div>

      <div className="rangcua" />
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
    <div style={{ marginTop: 14, borderTop: '1px solid var(--ke)', paddingTop: 14 }}>
      <p style={{ fontWeight: 500 }}>{question}</p>

      {/* `.chon` + `.abcd` của bản mẫu. MÀU KHÔNG PHẢI KÊNH DUY NHẤT: ô đúng
          mang `aria-pressed` nên nó nhận nền tím nhạt và ô `.box` tô đặc, và
          CẢ HAI ô đặc biệt còn kèm chữ ("đáp án đúng" / "bạn đã chọn"). Đây là
          ứng dụng cho người 45–70 tuổi, trong đó tỉ lệ khó phân biệt màu là
          đáng kể. */}
      <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {options.map((opt, idx) => {
          const dung = idx === correct_index
          const cuaBan = idx === yourAnswer

          return (
            <li
              key={idx}
              className="chon"
              aria-current={dung ? 'true' : undefined}
              style={
                dung
                  ? { borderColor: 'var(--tim)', background: 'var(--tim-wash)' }
                  : cuaBan
                    ? { borderColor: 'var(--do)' }
                    : undefined
              }
            >
              <span className="abcd">{String.fromCharCode(65 + idx)}</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                {opt}
                {dung && <strong> — đáp án đúng</strong>}
                {cuaBan && !dung && <strong> — bạn đã chọn</strong>}
              </span>
            </li>
          )
        })}
      </ul>

      <p
        role="status"
        style={{
          marginTop: 14,
          border: '1px solid var(--ke)',
          background: 'var(--page)',
          padding: '11px 13px',
          fontSize: 'var(--t-note)',
          lineHeight: 1.7,
        }}
      >
        <strong style={{ color: is_correct ? 'var(--ink)' : 'var(--do)' }}>
          {is_correct ? 'Đúng rồi. ' : 'Chưa đúng. '}
        </strong>
        {explanation}
      </p>

      {is_correct && (
        <p style={{ marginTop: 9, fontSize: 'var(--t-note)', fontWeight: 500 }}>
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

  // Voice bar nằm trong luồng của cột chat (không còn phủ cố định toàn màn),
  // nên đưa nó vào khung nhìn ngay khi người dùng mở.
  useEffect(() => {
    if (!isVoiceModeOpen) return
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [isVoiceModeOpen])

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
    /* CHÉP TỪ BA SECTION CỦA BẢN MẪU, chọn theo trạng thái:
         `id="hdt"`  chưa có lượt nào — bài học hôm nay + gợi ý câu hỏi
         `id="cho"`  đang chờ trả lời — `.phieu` các bước + khung xương
         `id="hd"`   đã có câu trả lời — `.co` hai cột
       Cả ba dùng chung một khung `.main`, nên ở đây chỉ đổi phần thân. */
    <>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1 }}>
          {!hasQuestionHeading && <h1 className="sr-only">Hỏi đáp sức khỏe</h1>}

          {profileState === 'absent' && <MissingProfileBand />}

          {profileState !== 'absent' && turns.length === 0 && <DailyLessonBanner />}

          {isEmpty && <SuggestedQuestions profile={profile} onPick={ask} />}

          {isLoadingHistory && (
            <p role="status" className="lab">
              Đang mở lại hội thoại đã lưu…
            </p>
          )}

          {historyQuery.isError && (
            <div style={{ marginBottom: 26 }}>
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

          {/* ── Đang chờ: câu hỏi đã có đề mục, thân là các bước hoặc chữ chảy ── */}
          {isStreaming && pendingQuestion !== null && (
            <div className="hien" style={{ marginBottom: 'clamp(40px,2.6vw,62px)' }}>
              <QuestionHeading question={pendingQuestion} />

              <div style={{ marginTop: 26 }}>
                {streamedAnswer ? (
                  /* Đúng cái `.phieu` mà câu trả lời hoàn chỉnh sẽ dùng, để
                     lúc stream xong không có gì nhảy chỗ. `.caret` là con trỏ
                     nhấp nháy của bản mẫu — một vạch tím 9px. */
                  <div className="phieu">
                    <div className="phieu-top">
                      <span>Trả lời · đang soạn</span>
                    </div>
                    <div style={{ padding: '0 clamp(16px,2vw,24px)' }}>
                      <div className="doc doc-khong-le">
                        <div className="doc-body">
                          <p style={{ whiteSpace: 'pre-wrap' }}>
                            {streamedAnswer}
                            <span className="caret" aria-hidden="true" />
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="rangcua" />
                  </div>
                ) : (
                  <WaitingBlock step={currentStep} />
                )}
              </div>
            </div>
          )}

          {/* ── Lỗi và cho phép thử lại ─────────────────────────────────── */}
          {streamError !== null && (
            <div style={{ marginBottom: 'clamp(40px,2.6vw,62px)' }}>
              {pendingQuestion !== null && (
                <div style={{ marginBottom: 26 }}>
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
            <div style={{ marginBottom: 'clamp(40px,2.6vw,62px)' }}>
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
          <p
            className="lab"
            style={{ borderTop: '1px solid var(--ke)', paddingTop: 14, lineHeight: 1.6 }}
          >
            Việc cần làm bây giờ là đi khám. Khi nào bạn đã ổn và muốn hỏi tiếp, bạn hãy
            bấm “Câu hỏi mới”.
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
          <p role="alert" className="lab" style={{ color: 'var(--do)', marginTop: 9 }}>
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
