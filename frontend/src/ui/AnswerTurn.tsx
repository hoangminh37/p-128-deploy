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
 * `article` của nó, và tên của trang đó chính là câu hỏi. Newsreader weight
 * 400 — chữ có chân ở cỡ 23–31px đã đủ nặng để dẫn mắt, và nó nối liền mạch
 * đọc với đoạn văn bên dưới thay vì đứng tách ra như một nhãn giao diện.
 *
 * Dùng chung cho cả lượt đã xong, lượt đang chờ và lượt bị lỗi — ba trạng thái
 * đó khác nhau ở phần THÂN, còn phần đề mục thì y hệt.
 */
export function QuestionHeading({ question }: { question: string }) {
  return (
    // Bản mẫu mở mọi màn bằng `<div class="eb">` rồi tới `<h1>`; ở màn `hd` là
    // "Câu hỏi hôm nay · Tăng huyết áp" và câu hỏi. `.eb` là nhãn mono giãn
    // chữ màu TÍM kèm một nét kẻ chạy hết chỗ trống bên phải.
    //
    // Câu hỏi đặt thẳng lên nền trang, KHÔNG nằm trong thẻ nào: nó là TÊN CỦA
    // TRANG, không phải một khối nội dung ngang hàng với câu trả lời. `.phieu`
    // bọc câu trả lời mới là thứ tách hai phần ra khỏi nhau.
    <header>
      <div className="eb">Câu hỏi của bạn</div>
      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 14, maxWidth: '24ch' }}>
        {question}
      </h1>
    </header>
  )
}

/**
 * Ghi chú mức độ chắc chắn, CHỈ cho trạng thái `partial`.
 *
 * Bản mẫu để số trích dẫn ở mẩu phải của `.phieu-top` ("2 trích dẫn"), nên
 * nhãn "Dựa trên N tài liệu" của bản trước đã có chỗ và không dựng lại. Còn
 * lại đúng một điều `.phieu-top` không nói được: một PHẦN của câu trả lời
 * không có tài liệu nào nói rõ.
 *
 * Nét lề trái `--ke-dam` và chữ `--xam` — trung tính, KHÔNG dùng đỏ. Đây là ghi
 * chú về mức độ chắc chắn, không phải cảnh báo nguy hiểm; tô nóng chỗ này sẽ
 * làm người đang lo lắng tưởng mình vừa đọc phải điều đáng sợ. Bản mẫu dùng
 * đúng kiểu này cho dòng "Con số này là mức chung…" ở cuối `.doc-body`.
 */
function PartialNote({ count }: { count: number }) {
  return (
    <p
      style={{
        fontSize: 'var(--t-note)',
        color: 'var(--xam)',
        borderLeft: '2px solid var(--ke-dam)',
        paddingLeft: 12,
        marginTop: 14,
        maxWidth: '60ch',
        lineHeight: 1.7,
      }}
    >
      {count === 0
        ? 'Chưa có tài liệu nào trong thư viện nói rõ phần này.'
        : 'Một phần câu trả lời chưa có tài liệu nào nói rõ. Bạn nên hỏi lại bác sĩ điều trị về phần đó.'}
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
function ResponseBody({ turn, actions }: { turn: Turn; actions: ReactNode }) {
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
          actions={actions}
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
    <button type="button" onClick={onClick} disabled={disabled} className="btn sm gh">
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
    <>
      {onListen !== undefined && (
        <ActionButton
          label={isListening ? 'Đang đọc câu trả lời…' : 'Nghe câu trả lời'}
          onClick={onListen}
          disabled={isListening}
        />
      )}

      <ActionButton label="Sao chép" onClick={() => void handleCopy()}>
        <CopyIcon className="" />
      </ActionButton>

      <ActionButton label="Tải xuống" onClick={handleSave}>
        <SaveIcon className="" />
      </ActionButton>

      {/* Luôn có mặt trong DOM để `aria-live` báo được thay đổi. Rỗng thì nó
          không chiếm chỗ nào trong hàng nút. */}
      <p role="status" className="lab" style={{ flexBasis: '100%', margin: 0 }}>
        {notice}
      </p>
    </>
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
  const isPartial = turn.status === 'partial'

  /**
   * Ba trạng thái `red_flag` / `refused` / `referral` là một `.phieu` tự chứa
   * (xem `ResponseStates.tsx`), nên chúng KHÔNG nhận cụm nút: chân phiếu của
   * chúng đã có việc làm tiếp theo của riêng mình, và ở `red_flag` thì việc
   * cần làm bây giờ là gọi 115, không phải sắp xếp giấy tờ.
   */
  const wantsActions = turn.status === 'answered' || turn.status === 'partial'

  return (
    // KHÔNG hoạt ảnh ở lượt `red_flag`. Mọi lượt khác hiện dần từ dưới lên
    // trong 340ms bằng `.hien` của bản mẫu, đúng một lần; riêng lượt báo dấu
    // hiệu cấp cứu thì có mặt ngay từ khung hình đầu. Người có thể đang đau
    // ngực không cần chờ một hiệu ứng chạy xong mới đọc được dòng đầu tiên.
    <article style={{ marginBottom: 'clamp(40px,2.6vw,62px)' }} className={isRedFlag ? undefined : 'hien'}>
      <QuestionHeading question={turn.question} />

      <div style={{ marginTop: 26 }}>
        <ResponseBody
          turn={turn}
          actions={
            wantsActions ? (
              <TurnActions turn={turn} onListen={onListen} isListening={isListening} />
            ) : undefined
          }
        />
      </div>

      {isPartial && <PartialNote count={turn.citations.length} />}

      {turn.disclaimer !== null && <Disclaimer text={turn.disclaimer} />}
    </article>
  )
}
