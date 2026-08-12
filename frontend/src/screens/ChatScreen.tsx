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
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import { sendChatMessage } from '../lib/api'
import type { ChatResponse } from '../lib/schemas'
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

/** Một lượt hỏi đáp đã hoàn tất. Câu hỏi giữ lại để hiện kèm câu trả lời. */
type Turn = {
  question: string
  response: ChatResponse
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
function ResponseBody({ response }: { response: ChatResponse }) {
  const document = (
    <AnswerDocument answer={response.answer} citations={response.citations} />
  )

  switch (response.status) {
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

export function ChatScreen() {
  const { patientId, profile } = usePatient()

  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  /** Giữ lại câu vừa gửi để nút "Gửi lại câu hỏi" ở khối lỗi có cái mà gửi lại. */
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)

  const endRef = useRef<HTMLDivElement>(null)

  const mutation = useMutation({
    mutationFn: (question: string) =>
      sendChatMessage({
        query: question,
        // Guard `RequirePatient` đã chặn, nhánh rỗng chỉ để thỏa kiểu.
        patient_id: patientId ?? '',
        conversation_id: conversationId,
      }),
    onSuccess: (response, question) => {
      setTurns((previous) => [...previous, { question, response }])
      // Lượt sau nối tiếp cùng một phiên, theo mục 4 hợp đồng.
      setConversationId(response.conversation_id)
      setPendingQuestion(null)
    },
  })

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

  const isEmpty = turns.length === 0 && !mutation.isPending && !mutation.isError

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="sr-only">Hỏi đáp sức khỏe</h1>

      {/* `pb-turn` giữ cho dòng cuối không bao giờ trôi sát vào ô nhập bên dưới. */}
      <div className="flex-1 pb-turn">
        {isEmpty && <SuggestedQuestions profile={profile} onPick={ask} />}

        {turns.map((turn) => (
          <article key={turn.response.message_id} className="mb-turn animate-answer-in">
            <QuestionLine question={turn.question} />
            <ResponseBody response={turn.response} />
            <Disclaimer text={turn.response.disclaimer} />
          </article>
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
