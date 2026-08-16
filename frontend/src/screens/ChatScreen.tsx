import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import {
  conversationDetailQueryKey,
  conversationsQueryKey,
} from '../app/conversations'
import {
  getConversationDetail,
  streamChatMessage,
  type ApiError,
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

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 pb-turn">
        {!hasQuestionHeading && <h1 className="sr-only">Hỏi đáp sức khỏe</h1>}

        {profileState === 'absent' && <MissingProfileBand />}

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

        <div ref={endRef} />
      </div>

      {isAfterRedFlag ? (
        <p className="font-display max-w-answer border-t border-rule pt-snug text-question text-moss">
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

