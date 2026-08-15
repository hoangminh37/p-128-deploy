/**
 * Màn hỏi đáp.
 *
 * Cố ý KHÔNG dùng thẩm mỹ chatbot: không avatar, không hiệu ứng gõ chữ, không
 * bong bóng hai bên.
 *
 * PHÂN CẤP THỊ GIÁC, từ nổi nhất xuống mờ nhất:
 *
 *   1. Câu trả lời   — cỡ `answer` 19px, màu ink, giãn dòng 1.75, chiếm cột chính.
 *   2. Câu hỏi       — cỡ `question` 16px, màu moss, lệch phải. Là ghi chú dẫn
 *                      vào câu trả lời, không phải nội dung chính.
 *   3. Ô nhập        — cỡ `input` 17px, viền border, nút Gửi có nền đặc. Hiện
 *                      diện vừa đủ để tìm thấy ngay, không tranh chỗ khi đang đọc.
 *   4. Dòng miễn trừ — cỡ `note` 15px, màu moss, sau một nét kẻ mảnh. Mờ nhất.
 *
 * Màn này phục vụ hai lối vào: mở phiên mới từ `/chat`, và mở lại một phiên đã
 * lưu từ `/chat/:conversationId` khi người dùng bấm trên thanh bên. Lượt đọc từ
 * lịch sử và lượt vừa hỏi hiện y hệt nhau — với người bệnh thì một câu trả lời
 * là một câu trả lời, đọc lại hôm sau cũng thế.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  conversationDetailQueryKey,
  conversationsQueryKey,
} from '../app/conversations'
import { getConversationDetail, sendChatMessage, type ApiError } from '../lib/api'
import type {
  ChatStatus,
  Citation,
  ConversationDetail,
  ConversationMessage,
} from '../lib/schemas'
import { usePatient } from '../patient/context'
import { AnswerDocument } from '../ui/AnswerDocument'
import { ChatComposer } from '../ui/ChatComposer'
import { ErrorNotice } from '../ui/ErrorNotice'
import { SuggestedQuestions } from '../ui/SuggestedQuestions'
import {
  Disclaimer,
  PartialSupportNotice,
  RedFlagBanner,
  ReferralBlock,
  RefusedBlock,
} from '../ui/ResponseStates'

/**
 * Một lượt hỏi đáp đã hoàn tất.
 *
 * Cố ý KHÔNG giữ nguyên `ChatResponse`: lượt đọc từ lịch sử (mục 6) không có
 * `metadata` lẫn `conversation_id` ở mức từng message, nên dựng một `ChatResponse`
 * giả cho chúng sẽ là bịa dữ liệu ra chỉ để thỏa kiểu.
 */
type Turn = {
  /** Khóa render. Dùng `message_id`, ổn định qua mọi lần vẽ lại. */
  key: string
  question: string
  status: ChatStatus
  answer: string
  citations: Citation[]
  /**
   * Mục 6 không trả `disclaimer` cho từng message, chỉ mục 4 mới có. Lượt đọc
   * từ lịch sử vì thế để `null` và không hiện dòng nào — thà thiếu còn hơn tự
   * viết ra một câu miễn trừ trách nhiệm mà máy chủ chưa từng gửi.
   */
  disclaimer: string | null
}

/**
 * Ghép lịch sử của mục 6 thành các lượt.
 *
 * Message của user đứng trước message của assistant trong cùng một lượt. Câu hỏi
 * nào không có câu trả lời đi kèm (phiên bị cắt giữa chừng) thì bị bỏ qua, vì
 * một câu hỏi treo lơ lửng không nói được gì cho người đọc lại.
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

/** Câu hỏi của người dùng: lệch phải, cỡ nhỏ, màu moss — rõ là ghi chú, không phải nội dung chính. */
function QuestionLine({ question }: { question: string }) {
  return (
    <p className="font-display mb-para ml-auto max-w-answer text-right text-question text-moss">
      {question}
    </p>
  )
}

/**
 * Bọc câu trả lời bằng đúng khối trạng thái của nó.
 *
 * `red_flag` là banner đặt TRÊN, còn `refused` và `referral` bọc quanh, vì hai
 * cái sau nói về chính bản chất câu trả lời chứ không phải cảnh báo kèm thêm.
 */
function ResponseBody({ turn }: { turn: Turn }) {
  const document = <AnswerDocument answer={turn.answer} citations={turn.citations} />

  switch (turn.status) {
    case 'red_flag':
      return (
        <>
          <RedFlagBanner />
          {document}
        </>
      )
    case 'refused':
      return <RefusedBlock>{document}</RefusedBlock>
    case 'referral':
      return <ReferralBlock>{document}</ReferralBlock>
    case 'partial':
      return (
        <>
          <PartialSupportNotice />
          {document}
        </>
      )
    case 'answered':
      return document
  }
}

/** Một lượt hoàn chỉnh: câu hỏi, câu trả lời, và dòng miễn trừ nếu có. */
function TurnArticle({ turn }: { turn: Turn }) {
  return (
    <article className="mb-turn animate-answer-in">
      <QuestionLine question={turn.question} />
      <ResponseBody turn={turn} />
      {turn.disclaimer !== null && <Disclaimer text={turn.disclaimer} />}
    </article>
  )
}

export function ChatScreen({
  openedConversationId,
}: {
  /** Phiên đã lưu cần mở lại, `null` khi bắt đầu một phiên mới. */
  openedConversationId: string | null
}) {
  const { patientId, profile } = usePatient()
  const queryClient = useQueryClient()

  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  // Mở lại phiên cũ thì câu hỏi tiếp theo phải nối vào chính phiên đó, chứ
  // không mở thêm một phiên mới bên cạnh.
  const [conversationId, setConversationId] = useState<string | null>(
    openedConversationId,
  )
  /** Giữ lại câu vừa gửi để nút "Gửi lại câu hỏi" ở khối lỗi có cái mà gửi lại. */
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)

  const endRef = useRef<HTMLDivElement>(null)

  const historyQuery = useQuery<ConversationDetail | null, ApiError>({
    queryKey: conversationDetailQueryKey(patientId, openedConversationId),
    enabled: patientId !== null && openedConversationId !== null,
    queryFn: async () => {
      // `enabled` đã chặn, nhánh này chỉ để thỏa kiểu.
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

  const mutation = useMutation({
    mutationFn: (question: string) =>
      sendChatMessage({
        query: question,
        // Guard `RequirePatient` đã chặn, nhánh rỗng chỉ để thỏa kiểu.
        patient_id: patientId ?? '',
        conversation_id: conversationId,
      }),
    onSuccess: (response, question) => {
      setTurns((previous) => [
        ...previous,
        {
          key: response.message_id,
          question,
          status: response.status,
          answer: response.answer,
          citations: response.citations,
          disclaimer: response.disclaimer,
        },
      ])
      // Lượt sau nối tiếp cùng một phiên, theo mục 4 hợp đồng.
      setConversationId(response.conversation_id)
      setPendingQuestion(null)
      // Phiên vừa được tạo hoặc vừa có thêm lượt, danh sách trên thanh bên đã cũ.
      void queryClient.invalidateQueries({
        queryKey: conversationsQueryKey(patientId),
      })
    },
  })

  const isLoadingHistory = openedConversationId !== null && historyQuery.isPending

  // Cuộn xuống phần mới nhất sau mỗi lượt. Không phải hiệu ứng trang trí —
  // không cuộn thì câu trả lời mới nằm ngoài khung nhìn.
  useEffect(() => {
    if (turns.length === 0 && !mutation.isPending) return
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns.length, mutation.isPending])

  function ask(question: string) {
    const trimmed = question.trim()
    if (trimmed === '' || mutation.isPending) return
    setPendingQuestion(trimmed)
    setDraft('')
    mutation.mutate(trimmed)
  }

  const isEmpty =
    openedConversationId === null &&
    turns.length === 0 &&
    !mutation.isPending &&
    !mutation.isError

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="sr-only">Hỏi đáp sức khỏe</h1>

      {/* `pb-turn` giữ cho dòng cuối không bao giờ trôi sát vào ô nhập bên dưới. */}
      <div className="flex-1 pb-turn">
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
          <TurnArticle key={turn.key} turn={turn} />
        ))}

        {turns.map((turn) => (
          <TurnArticle key={turn.key} turn={turn} />
        ))}

        {mutation.isPending && pendingQuestion !== null && (
          <div className="mb-turn">
            <QuestionLine question={pendingQuestion} />
            {/* Một dòng trạng thái trung tính duy nhất. Không dựng chuỗi bước
                giả kiểu "đang suy nghĩ → đang tìm → đang viết". */}
            <p role="status" className="font-display max-w-answer text-question text-moss">
              Đang tra cứu trong thư viện đã duyệt…
            </p>
          </div>
        )}

        {mutation.isError && (
          <div className="mb-turn">
            {pendingQuestion !== null && <QuestionLine question={pendingQuestion} />}
            <ErrorNotice
              error={mutation.error}
              retryLabel="Gửi lại câu hỏi"
              onRetry={() => {
                if (pendingQuestion !== null) mutation.mutate(pendingQuestion)
              }}
            />
          </div>
        )}

        <div ref={endRef} />
      </div>

      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSubmit={() => ask(draft)}
        disabled={mutation.isPending}
      />
    </div>
  )
}
