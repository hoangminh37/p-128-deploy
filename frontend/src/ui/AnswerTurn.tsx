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
  RedFlagBlock,
  ReferralBlock,
  RefusedBlock,
} from './ResponseStates'
import { useTransientNotice } from './shellHooks'

/**
 * Một lượt hỏi đáp đã hoàn tất.
 *
 * Cố ý KHÔNG giữ nguyên `ChatResponse`: lượt đọc từ lịch sử (mục 7) không có
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
   * Mục 7 không trả `disclaimer` cho từng message, chỉ mục 5 mới có. Lượt đọc
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

  // `w-fit` chứ KHÔNG phải `inline-block`. Tên bậc khoảng cách `--spacing-block`
  // của dự án làm Tailwind đọc được `inline-block` theo hai nghĩa: vừa là
  // `display: inline-block`, vừa là tiện ích `inline-<bậc>` đặt `inline-size`.
  // Rule thứ hai sinh ra sau nên nó thắng, và viên thuốc bị ép còn 32px — chữ
  // rơi xuống dòng từng chữ một. Xem cảnh báo ở `--spacing-block` trong
  // `index.css`. `w-fit` cho đúng bề ngang vừa nội dung mà không đụng tên nào.
  return (
    <p
      className={`font-display mt-snug w-fit max-w-answer rounded-full px-snug py-hair text-question ${tone}`}
    >
      {label()}
    </p>
  )
}

/**
 * Thân của một lượt: hoặc là trang tài liệu có trích dẫn, hoặc là một khối
 * trạng thái tự chứa cả nội dung `answer`.
 *
 * Ba trạng thái `red_flag`, `refused`, `referral` không đi qua `AnswerDocument`:
 * theo mục 5 và mục 6 hợp đồng, `citations` của chúng LUÔN rỗng, nên cả bộ máy
 * marker và thẻ nguồn là chỗ chết. Chúng tự dựng đoạn văn của mình ở cỡ `notice`
 * 19px — xem `ResponseStates.tsx`.
 *
 * `partial` không có khối riêng: nhãn số tài liệu ở trên đã nói đúng điều đó,
 * bằng một dòng, ngay chỗ mắt nhìn tới đầu tiên.
 */
function ResponseBody({ turn }: { turn: Turn }) {
  switch (turn.status) {
    case 'red_flag':
      return <RedFlagBlock answer={turn.answer} />
    case 'refused':
      return <RefusedBlock answer={turn.answer} />
    case 'referral':
      return <ReferralBlock answer={turn.answer} />
    case 'partial':
    case 'answered':
      return <AnswerDocument answer={turn.answer} citations={turn.citations} />
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
  const isRedFlag = turn.status === 'red_flag'

  /**
   * Nhãn số tài liệu chỉ có nghĩa ở hai trạng thái có tra cứu thật.
   *
   * Ba trạng thái còn lại luôn có `citations` rỗng, nên nhãn sẽ luôn đọc là
   * "không trích tài liệu nào" — đúng nhưng vô ích, và ở `red_flag` thì nó còn
   * chen vào đúng chỗ mà cảnh báo cấp cứu phải chiếm. Mỗi khối trong ba khối đó
   * đã tự nói ra tình trạng nguồn của mình bằng lời rồi.
   */
  const showSourceBadge = turn.status === 'answered' || turn.status === 'partial'

  return (
    <article className="mb-turn animate-answer-in">
      <QuestionHeading question={turn.question} />

      {showSourceBadge && (
        <SourceBadge count={turn.citations.length} status={turn.status} />
      )}

      {/* `red_flag` bám sát tiêu đề hơn các trạng thái khác: một bậc `cozy` thay
          vì `block`. Khoảng nghỉ để thở là thứ xa xỉ khi người đọc đang đau ngực. */}
      <div className={isRedFlag ? 'mt-cozy' : 'mt-block'}>
        <ResponseBody turn={turn} />
      </div>

      {/* Không mời sao chép hay lưu ở `red_flag`. Việc cần làm bây giờ là gọi
          115, không phải sắp xếp giấy tờ. */}
      {!isRedFlag && <TurnActions turn={turn} />}

      {turn.disclaimer !== null && <Disclaimer text={turn.disclaimer} />}
    </article>
  )
}
