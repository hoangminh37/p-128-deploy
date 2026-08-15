/**
 * Màn câu trả lời.
 *
 * Đây là TRANG TRA CỨU TÀI LIỆU, không phải một cuộc trò chuyện. Không avatar,
 * không hiệu ứng gõ chữ, không bong bóng lệch hai bên, không nền xám cho lời
 * người dùng. Mỗi lượt hỏi đáp là một trang có tiêu đề là chính câu hỏi — xem
 * `ui/AnswerTurn.tsx` để biết một trang gồm những gì và vì sao xếp theo thứ tự
 * đó.
 *
 * File này chỉ còn lo phần điều phối: gọi API, giữ các lượt, và ghép lịch sử đã
 * lưu với những lượt vừa hỏi trong phiên này.
 *
 * Màn này phục vụ hai lối vào: mở phiên mới từ `/chat`, và mở lại một phiên đã
 * lưu từ `/chat/:conversationId` khi người dùng bấm trên thanh bên. Lượt đọc từ
 * lịch sử và lượt vừa hỏi hiện y hệt nhau — với người bệnh thì một câu trả lời
 * là một câu trả lời, đọc lại hôm sau cũng thế.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import {
  conversationDetailQueryKey,
  conversationsQueryKey,
} from '../app/conversations'
import { getConversationDetail, sendChatMessage, type ApiError } from '../lib/api'
import type { ConversationDetail, ConversationMessage } from '../lib/schemas'
import { usePatient } from '../patient/context'
import { AnswerTurn, QuestionHeading, type Turn } from '../ui/AnswerTurn'
import { ChatComposer } from '../ui/ChatComposer'
import { ErrorNotice } from '../ui/ErrorNotice'
import { SuggestedQuestions } from '../ui/SuggestedQuestions'

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

/**
 * Dải nhắc cho người đã bấm "bỏ qua" ở màn hồ sơ.
 *
 * Người này có `patient_id` nhưng chưa có hồ sơ, nên trợ lý không biết họ mắc
 * bệnh gì và bao nhiêu tuổi — câu trả lời sẽ chung chung hơn hẳn. Phải nói ra:
 * để im thì họ tưởng đây đã là chất lượng cao nhất mà công cụ làm được.
 *
 * Trung tính, không màu cảnh báo. Họ chưa làm gì sai, và đây là đường đi mà
 * chính ứng dụng đã mời họ đi.
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

  /**
   * Tiêu đề của trang là chính câu hỏi, nên `h1` nằm trong từng lượt. Lúc chưa
   * có lượt nào — màn gợi ý, đang mở lịch sử, hoặc lỗi khi mở — trang sẽ không
   * còn `h1` nào cả, và một trang mở đầu bằng `h2` là trang mà trình đọc màn
   * hình không nói được nó là trang gì. Chỗ đó cần một tiêu đề dự phòng.
   */
  const hasQuestionHeading =
    historyTurns.length > 0 || turns.length > 0 || pendingQuestion !== null

  /**
   * Lượt cuối cùng là dấu hiệu cấp cứu thì CẤT thanh tra cứu đi.
   *
   * Người vừa được bảo là hãy gọi 115 mà bên dưới vẫn có một ô mời "Hỏi tiếp về
   * bệnh của bạn" thì lời khuyên kia mất hết trọng lượng — giao diện đang nói
   * ngược lại chính nó. Đây là chỗ duy nhất trong ứng dụng mà ô nhập biến mất.
   *
   * Không phải ngõ cụt: nút "Câu hỏi mới" trên thanh bên (và nút thêm ở thanh
   * tiêu đề bản hẹp) vẫn luôn ở đó, nên ai thực sự cần hỏi tiếp vẫn hỏi được —
   * chỉ là phải chủ động bước ra khỏi cảnh báo, chứ không bị mời.
   */
  const lastTurn = turns.at(-1) ?? historyTurns.at(-1)
  const isAfterRedFlag =
    lastTurn?.status === 'red_flag' && !mutation.isPending && !mutation.isError

  return (
    <div className="flex flex-1 flex-col">
      {/* `pb-turn` giữ cho dòng cuối không bao giờ trôi sát vào ô nhập bên dưới. */}
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

        {/* Câu đang chờ dựng sẵn phần đề mục y hệt một lượt đã xong, chỉ thay
            phần thân bằng một dòng trạng thái — nên lúc câu trả lời về, tiêu đề
            không nhảy chỗ. */}
        {mutation.isPending && pendingQuestion !== null && (
          <div className="mb-turn">
            <QuestionHeading question={pendingQuestion} />
            {/* Một dòng trạng thái trung tính duy nhất. Không dựng chuỗi bước
                giả kiểu "đang suy nghĩ → đang tìm → đang viết". */}
            <p
              role="status"
              className="font-display mt-block max-w-answer text-question text-moss"
            >
              Đang tra cứu trong thư viện đã duyệt…
            </p>
          </div>
        )}

        {mutation.isError && (
          <div className="mb-turn">
            {pendingQuestion !== null && (
              <div className="mb-block">
                <QuestionHeading question={pendingQuestion} />
              </div>
            )}
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

      {isAfterRedFlag ? (
        <p className="font-display max-w-answer border-t border-rule pt-snug text-question text-moss">
          Việc cần làm bây giờ là đi khám. Khi nào bạn đã ổn và muốn hỏi tiếp,
          bạn hãy bấm “Câu hỏi mới”.
        </p>
      ) : (
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSubmit={() => ask(draft)}
          disabled={mutation.isPending}
        />
      )}
    </div>
  )
}
