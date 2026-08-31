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
 *   6. Nghe, sao chép, tải — ba thao tác gắn với CHÍNH câu trả lời này, nên
 *                            luôn nằm ngay sau phần người dùng vừa đọc xong.
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
  /**
   * Thuật ngữ y khoa được phát hiện động từ pipeline annotation bất đồng bộ.
   * `undefined` khi chưa có dữ liệu (event `annotations` chưa tới).
   * `[]` khi pipeline chạy xong nhưng không tìm được thuật ngữ nào.
   */
  annotations?: import('../lib/schemas').TermAnnotation[]
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
    // KHÔNG nằm trong thẻ nào, và không có nét kẻ dưới. Câu hỏi đặt thẳng lên
    // nền canvas là cách nói rằng nó là TÊN CỦA TRANG, không phải một khối nội
    // dung ngang hàng với câu trả lời bên dưới. Thẻ trắng bọc câu trả lời mới
    // là thứ tách hai phần ra khỏi nhau.
    <header className="max-w-answer">
      <p className="font-display text-note font-semibold text-slate">
        Câu hỏi của bạn
      </p>
      <h1 className="mt-hair text-ask font-semibold text-body">{question}</h1>
    </header>
  )
}

/**
 * Nhãn số tài liệu, dạng viên thuốc ngay dưới tiêu đề.
 *
 * Đặt TRƯỚC câu trả lời chứ không phải sau: người bệnh cần biết mình sắp đọc
 * thứ dựa trên mấy văn bản, trước khi đọc chứ không phải sau khi đã tin.
 *
 * NỀN MINT, CHỮ INK (7.95:1) — cùng cặp màu với marker `[n]` trong dòng chữ, và
 * đó là chủ ý: nhãn này với marker nói về cùng một thứ, nên chúng phải nhìn ra
 * là cùng một họ.
 *
 * Trạng thái `partial` và trạng thái không trích nguồn nào đổi sang nền
 * `canvas` chữ `slate` (4.58:1) — trung tính, KHÔNG dùng `alert` và không dùng
 * `coral`. Đây là ghi chú về mức độ chắc chắn, không phải cảnh báo nguy hiểm;
 * tô nóng chỗ này sẽ làm người đang lo lắng tưởng mình vừa đọc phải điều đáng
 * sợ. Tín hiệu "kém chắc chắn hơn" nằm ở chỗ nó MẤT màu nhấn, không ở chỗ nó
 * đổi sang một màu nhấn khác.
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
      ? 'bg-canvas text-slate'
      : 'bg-mint text-ink font-semibold'

  // `w-fit` chứ KHÔNG phải `inline-block`. Tên bậc khoảng cách `--spacing-block`
  // của dự án làm Tailwind đọc được `inline-block` theo hai nghĩa: vừa là
  // `display: inline-block`, vừa là tiện ích `inline-<bậc>` đặt `inline-size`.
  // Rule thứ hai sinh ra sau nên nó thắng, và viên thuốc bị ép còn 32px — chữ
  // rơi xuống dòng từng chữ một. Xem cảnh báo ở `--spacing-block` trong
  // `index.css`. `w-fit` cho đúng bề ngang vừa nội dung mà không đụng tên nào.
  return (
    <p
      className={`font-display mt-cozy w-fit max-w-answer rounded-pill px-snug py-hair text-question ${tone}`}
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
      return (
        <AnswerDocument
          answer={turn.answer}
          citations={turn.citations}
          annotations={turn.annotations}
        />
      )
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
  disabled = false,
}: {
  label: string
  onClick: () => void
  children?: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="motion-press font-display flex min-h-touch items-center gap-tight rounded-pill border-2 border-slate bg-surface px-cozy text-input font-semibold text-body enabled:hover:bg-canvas disabled:text-slate"
    >
      {children}
      {label}
    </button>
  )
}

/**
 * Thao tác của một câu trả lời.
 *
 * Sao chép/tải xuống là hành động trên MỘT lượt cụ thể, vì vậy chúng đặt cạnh
 * nút nghe ngay cuối lượt ở mọi bề ngang. Chúng không còn sống trên thanh tiêu
 * đề chung — nơi người dùng không biết hai biểu tượng đang áp dụng cho câu trả
 * lời nào nếu lịch sử có nhiều lượt.
 */
function TurnActions({
  turn,
  onListen,
  isListening,
}: {
  turn: Turn
  onListen?: () => void
  isListening: boolean
}) {
  const [notice, showNotice] = useTransientNotice()

  async function handleCopy(): Promise<void> {
    const copied = await copyTextToClipboard(turnToText(turn))
    showNotice(
      copied ? 'Đã sao chép câu trả lời.' : 'Trình duyệt không cho phép sao chép.',
    )
  }

  function handleSave(): void {
    downloadText(turnToText(turn))
    showNotice('Đã tải câu trả lời về máy.')
  }

  return (
    <div className="mt-snug max-w-answer">
      <div className="flex flex-wrap gap-snug">
        {onListen !== undefined && (
          <ActionButton
            label={isListening ? 'Đang đọc câu trả lời…' : 'Nghe câu trả lời'}
            onClick={onListen}
            disabled={isListening}
          />
        )}

        <ActionButton label="Sao chép" onClick={() => void handleCopy()}>
          <CopyIcon className="h-6 w-6 shrink-0" />
        </ActionButton>

        <ActionButton label="Tải xuống" onClick={handleSave}>
          <SaveIcon className="h-6 w-6 shrink-0" />
        </ActionButton>
      </div>

      <p role="status" className="font-display mt-tight text-question text-slate">
        {notice}
      </p>
    </div>
  )
}

export function AnswerTurn({
  turn,
  onListen,
  isListening = false,
}: {
  turn: Turn
  onListen?: () => void
  isListening?: boolean
}) {
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
    // KHÔNG hoạt ảnh ở lượt `red_flag`. Mọi lượt khác hiện dần từ dưới lên trong
    // 250ms, đúng một lần; riêng lượt báo dấu hiệu cấp cứu thì có mặt ngay từ
    // khung hình đầu. Người có thể đang đau ngực không cần chờ một hiệu ứng
    // chạy xong mới đọc được dòng đầu tiên, và cũng không cần xem gì nhúc nhích.
    <article className={`mb-turn ${isRedFlag ? '' : 'animate-answer-in'}`}>
      <QuestionHeading question={turn.question} />

      {showSourceBadge && (
        <SourceBadge count={turn.citations.length} status={turn.status} />
      )}

      {/* `red_flag` bám sát tiêu đề hơn các trạng thái khác: một bậc `cozy` thay
          vì `block`. Khoảng nghỉ để thở là thứ xa xỉ khi người đọc đang đau ngực.

          KHÔNG bọc thêm thẻ nào ở đây. Mỗi nhánh của `ResponseBody` tự mang nền
          của nó: `AnswerDocument` dựng thẻ trắng của riêng mình vì chính nó mới
          biết bố cục đang là hai cột hay xếp dưới — mà hai bố cục đó cần hai bề
          ngang khác nhau. Ba khối trạng thái kia cũng đã là thẻ có nền riêng
          (xem `ResponseStates.tsx`). */}
      <div className={isRedFlag ? 'mt-cozy' : 'mt-block'}>
        <ResponseBody turn={turn} />
      </div>

      {/* Không mời sao chép hay lưu ở `red_flag`. Việc cần làm bây giờ là gọi
          115, không phải sắp xếp giấy tờ. */}
      {!isRedFlag && <TurnActions turn={turn} onListen={onListen} isListening={isListening} />}

      {turn.disclaimer !== null && <Disclaimer text={turn.disclaimer} />}
    </article>
  )
}
