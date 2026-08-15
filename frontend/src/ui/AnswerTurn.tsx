/**
 * Một lượt hỏi đáp, trình bày như MỘT TRANG TRA CỨU chứ không phải một tin nhắn.
 *
 * Trang này đọc từ trên xuống theo đúng thứ tự người bệnh cần:
 *
 *   1. "Câu hỏi của bạn"  — câu dẫn nhỏ, nói rõ dòng bên dưới là gì.
 *   2. Chính câu hỏi       — tiêu đề `h1`, căn trái, font body, 26px. Đây là
 *                            điều đang được tra, nên nó là tên của trang.
 *   3. Đường kẻ ngang      — hết phần đề mục, bắt đầu phần trả lời.
 *   4. Nhãn số tài liệu    — trả lời dựa trên mấy tài liệu, biết TRƯỚC KHI đọc.
 *   5. Câu trả lời         — kèm thẻ nguồn của từng đoạn.
 *   6. Sao chép và lưu     — chỉ ở bản hẹp; bản rộng đã có hai nút trên thanh
 *                            tiêu đề, bày lại lần nữa là thừa.
 *   7. Dòng miễn trừ       — chữ nhỏ nhất của trang, sau một nét kẻ mảnh.
 *
 * Không còn bong bóng lệch phải, không nền xám, không avatar. Câu hỏi của người
 * dùng KHÔNG phải là một lượt thoại đứng ngang hàng với câu trả lời — nó là đề
 * mục của cái đang đọc.
 */
import type { ReactNode } from 'react'

import type { ChatStatus, Citation } from '../lib/schemas'
import { copyTextToClipboard, downloadText } from '../lib/transcript'
import { AnswerDocument } from './AnswerDocument'
import { CopyIcon, SaveIcon } from './icons'
import {
  Disclaimer,
  RedFlagBanner,
  ReferralBlock,
  RefusedBlock,
} from './ResponseStates'
import { useTransientNotice } from './shellHooks'

/**
 * Một lượt hỏi đáp đã hoàn tất.
 *
 * Cố ý KHÔNG giữ nguyên `ChatResponse`: lượt đọc từ lịch sử (mục 6) không có
 * `metadata` lẫn `conversation_id` ở mức từng message, nên dựng một `ChatResponse`
 * giả cho chúng sẽ là bịa dữ liệu ra chỉ để thỏa kiểu.
 */
export type Turn = {
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
 * Câu dẫn và câu hỏi làm tiêu đề.
 *
 * Dùng `h1` cho mỗi lượt: mỗi lượt là một trang tra cứu độc lập nằm trong
 * `article` của nó, và tên của trang đó chính là câu hỏi. Font body (Lora) chứ
 * không phải font display, để tiêu đề nối liền mạch đọc với đoạn văn bên dưới.
 *
 * Dùng chung cho cả lượt đã xong, lượt đang chờ và lượt bị lỗi — ba trạng thái
 * đó khác nhau ở phần THÂN, còn phần đề mục thì y hệt.
 */
export function QuestionHeading({ question }: { question: string }) {
  return (
    <header className="max-w-answer border-b border-rule pb-snug">
      <p className="font-display text-note text-moss">Câu hỏi của bạn</p>
      <h1 className="font-body mt-hair text-ask text-ink">{question}</h1>
    </header>
  )
}

/**
 * Nhãn số tài liệu, dạng viên thuốc ngay dưới tiêu đề.
 *
 * Đặt TRƯỚC câu trả lời chứ không phải sau: người bệnh cần biết mình sắp đọc
 * thứ dựa trên mấy văn bản, trước khi đọc chứ không phải sau khi đã tin.
 *
 * Trạng thái `partial` đổi cả chữ lẫn màu, nhưng đổi sang `moss` (5.53:1 trên
 * nền nhạt của chính nó) — màu chữ phụ trung tính, KHÔNG dùng `alert`. Đây là
 * ghi chú về mức độ chắc chắn, không phải cảnh báo nguy hiểm; tô đỏ chỗ này sẽ
 * làm người đang lo lắng tưởng mình vừa đọc phải điều gì đáng sợ.
 */
function SourceBadge({ count, status }: { count: number; status: ChatStatus }) {
  const isPartial = status === 'partial'

  function label(): string {
    if (isPartial && count === 0) return 'Chưa có tài liệu nào nói rõ phần này'
    if (isPartial) {
      return `Dựa trên ${count} tài liệu đã duyệt · một phần chưa có tài liệu nói rõ`
    }
    if (count === 0) return 'Câu trả lời này không trích tài liệu nào'
    return `Dựa trên ${count} tài liệu đã duyệt`
  }

  const tone =
    isPartial || count === 0
      ? 'bg-moss/10 text-moss'
      : 'bg-medical/10 text-medical'

  return (
    <p
      className={`font-display mt-snug inline-block max-w-answer rounded-full px-snug py-hair text-question ${tone}`}
    >
      {label()}
    </p>
  )
}

/**
 * Bọc câu trả lời bằng đúng khối trạng thái của nó.
 *
 * `red_flag` là banner đặt TRÊN, còn `refused` và `referral` bọc quanh, vì hai
 * cái sau nói về chính bản chất câu trả lời chứ không phải cảnh báo kèm thêm.
 *
 * `partial` không còn khối riêng: nhãn số tài liệu ở trên đã nói đúng điều đó,
 * bằng một dòng, ngay chỗ mắt nhìn tới đầu tiên.
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
    case 'answered':
      return document
  }
}

/**
 * Dựng bản chữ thuần của một lượt.
 *
 * Dựng từ CHÍNH DỮ LIỆU chứ không quét chữ trong DOM: bản mang đi hỏi bác sĩ
 * phải có đủ số hiệu văn bản và đường dẫn, mà những thứ đó trên màn hình đang
 * nằm rải rác trong thẻ nguồn của từng đoạn.
 */
function turnToText(turn: Turn): string {
  const lines: string[] = [`Câu hỏi: ${turn.question}`, '', turn.answer]

  if (turn.citations.length > 0) {
    lines.push('', 'Nguồn:')
    for (const citation of turn.citations) {
      const code = citation.doc_code !== null ? ` (${citation.doc_code})` : ''
      lines.push(`[${citation.id}] ${citation.title} — ${citation.issuer}${code}`)
      lines.push(`    “${citation.snippet}”`)
      if (citation.url !== null) lines.push(`    ${citation.url}`)
    }
  }

  if (turn.disclaimer !== null) lines.push('', turn.disclaimer)

  return lines.join('\n')
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-display flex min-h-touch items-center gap-tight rounded-lg border-2 border-border px-cozy text-input font-semibold text-ink"
    >
      {children}
      {label}
    </button>
  )
}

/**
 * Sao chép và lưu, CHỈ ở bản hẹp.
 *
 * Ở bản hẹp thanh tiêu đề không đủ chỗ cho hai nút biểu tượng, mà biểu tượng
 * trơ cũng không nói được gì với người chưa quen dùng ứng dụng — nên ở đây là
 * hai nút có chữ, đặt ngay cuối câu trả lời, đúng chỗ người dùng vừa đọc xong
 * và nảy ra ý muốn giữ lại. Từ 1024px thì hai nút biểu tượng trên thanh tiêu đề
 * đã làm việc này, nên khối này biến mất.
 */
function TurnActions({ turn }: { turn: Turn }) {
  const [notice, showNotice] = useTransientNotice()

  async function handleCopy(): Promise<void> {
    const copied = await copyTextToClipboard(turnToText(turn))
    showNotice(
      copied ? 'Đã sao chép câu trả lời.' : 'Trình duyệt không cho phép sao chép.',
    )
  }

  function handleSave(): void {
    downloadText(turnToText(turn))
    showNotice('Đã lưu câu trả lời về máy.')
  }

  return (
    <div className="mt-block max-w-answer lg:hidden">
      <div className="flex flex-wrap gap-snug">
        <ActionButton label="Sao chép" onClick={() => void handleCopy()}>
          <CopyIcon className="h-6 w-6 shrink-0" />
        </ActionButton>

        <ActionButton label="Lưu về máy" onClick={handleSave}>
          <SaveIcon className="h-6 w-6 shrink-0" />
        </ActionButton>
      </div>

      <p role="status" className="font-display mt-tight text-question text-moss">
        {notice}
      </p>
    </div>
  )
}

export function AnswerTurn({ turn }: { turn: Turn }) {
  return (
    <article className="mb-turn animate-answer-in">
      <QuestionHeading question={turn.question} />
      <SourceBadge count={turn.citations.length} status={turn.status} />

      <div className="mt-block">
        <ResponseBody turn={turn} />
      </div>

      <TurnActions turn={turn} />

      {turn.disclaimer !== null && <Disclaimer text={turn.disclaimer} />}
    </article>
  )
}
