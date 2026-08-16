/**
 * Bốn khối trạng thái, dựng trên cùng một khung.
 *
 * Cả bốn đều nằm TRONG khung của một câu trả lời bình thường — có tiêu đề câu
 * hỏi ở trên, có dòng miễn trừ ở dưới (xem `AnswerTurn.tsx`). Người bệnh phải
 * thấy đây là phản hồi cho câu mình vừa hỏi, chứ không phải một hộp lỗi rơi từ
 * đâu xuống giữa trang.
 *
 * BỐN GIỌNG, phân biệt bằng ba tín hiệu cùng lúc — màu, nền, và biểu tượng —
 * chứ không chỉ bằng màu, vì khoảng 8% nam giới không phân biệt được đỏ với
 * vàng nâu, mà `alert` với `refuse` thì đúng là đỏ với vàng nâu:
 *
 *   red_flag  — NỀN ĐẶC màu alert, tam giác cảnh báo, `role="alert"`.
 *               Ồn nhất trong cả ứng dụng. Người đọc có thể đang nguy hiểm thật.
 *   refused   — NỀN ĐẶC màu refuse, tờ giấy ghi chú. Hệ thống BIẾT chủ đề này
 *               nhưng KHÔNG ĐƯỢC PHÉP trả lời. Giọng giải thích vì sao, kèm
 *               việc cụ thể để làm tiếp — không phải giọng cấm đoán.
 *   referral  — KHÔNG NỀN, chỉ nét dọc trung tính, giá sách. Thư viện CHƯA CÓ
 *               tài liệu. Người hỏi không làm gì sai. Giọng như thủ thư báo
 *               sách chưa về.
 *   lỗi       — KHÔNG NỀN, nét dọc màu alert (xem `ErrorNotice.tsx`). Đỏ để báo
 *               có trục trặc, nhưng không nền đặc — trục trặc kỹ thuật không
 *               được phép trông ngang hàng với dấu hiệu cấp cứu.
 *
 * Đặt refused cạnh referral phải nhận ra ngay là hai chuyện khác nhau: một bên
 * là khối màu kín, một bên là khối trống chỉ có nét kẻ. Trộn hai cái này lại sẽ
 * khiến người bệnh tưởng mình vừa hỏi điều cấm.
 */
import type { ReactNode } from 'react'

import { splitParagraphs } from '../lib/paragraphs'
import { AlertIcon, LibraryIcon, NoteIcon, PhoneIcon } from './icons'

/**
 * Bốn giọng của khối trạng thái.
 *
 * Tỷ lệ tương phản đo trên nền của chính khối đó, không phải trên nền `paper`:
 * chữ `alert` trên nền `alert/10` là 5.22:1, chữ `refuse` trên nền `refuse/10`
 * là 4.69:1 — cả hai vượt 4.5:1. Đổi độ mờ của nền mà không tính lại là làm
 * hỏng chỗ này.
 */
const TONE = {
  emergency: {
    container: 'border-alert bg-alert/10',
    heading: 'text-alert',
  },
  refuse: {
    container: 'border-refuse bg-refuse/10',
    heading: 'text-refuse',
  },
  neutral: {
    container: 'border-border',
    heading: 'text-ink',
  },
  fault: {
    container: 'border-alert',
    heading: 'text-alert',
  },
} as const

export type StateTone = keyof typeof TONE

/**
 * Khung chung của bốn khối.
 *
 * Nét dọc dày bên trái là tín hiệu chính, giống hệt thẻ nguồn ở bản hẹp — cùng
 * một ngôn ngữ hình cho "đây là một khối có thẩm quyền riêng, không phải chữ
 * chạy tiếp".
 */
export function StateBlock({
  tone,
  heading,
  icon,
  role,
  children,
}: {
  tone: StateTone
  heading: string
  icon: ReactNode
  /**
   * `alert` ngắt lời trình đọc màn hình để đọc ngay; `status` chờ đọc xong câu
   * đang đọc dở. Chỉ `red_flag` và khối lỗi kỹ thuật dùng `alert` — hai thứ đó
   * người dùng phải biết ngay lập tức, còn lại thì đọc tới đâu biết tới đó.
   */
  role?: 'alert' | 'status'
  children: ReactNode
}) {
  const { container, heading: headingClass } = TONE[tone]

  return (
    <section
      role={role}
      className={`max-w-answer rounded-lg border-l-4 p-cozy ${container}`}
    >
      <div className={`flex items-start gap-tight ${headingClass}`}>
        <span className="mt-hair shrink-0">{icon}</span>
        <h2 className={`font-display text-heading font-bold ${headingClass}`}>
          {heading}
        </h2>
      </div>

      <div className="mt-snug">{children}</div>
    </section>
  )
}

/**
 * Nội dung `answer` từ API, cắt thành đoạn.
 *
 * Cỡ `notice` 19px — lớn hơn câu trả lời thường một bậc. Ba trạng thái này ngắn
 * và phải đọc hết ngay lần đầu, không phải thứ để lướt rồi quay lại.
 *
 * Ba trạng thái này luôn có `citations` rỗng theo mục 5 và mục 6 hợp đồng, nên
 * `answer` không bao giờ chứa marker `[n]` — cắt đoạn thuần là đủ, không cần
 * tới bộ máy trích dẫn của `AnswerDocument`.
 */
function AnswerText({ answer }: { answer: string }) {
  const paragraphs = splitParagraphs(answer)

  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          className={`text-notice whitespace-pre-wrap ${index < paragraphs.length - 1 ? 'mb-para' : ''}`}
        >
          {paragraph}
        </p>
      ))}
    </>
  )
}

/**
 * Dấu hiệu cấp cứu.
 *
 * Đặt NGAY DƯỚI tiêu đề câu hỏi, trước mọi thứ khác — kể cả trước nhãn số tài
 * liệu, thứ mà mọi trạng thái còn lại đều có. Người đang đau ngực không đọc hết
 * trang rồi mới thấy nút gọi.
 *
 * `role="alert"` để trình đọc màn hình ngắt lời và đọc ngay khi khối này xuất
 * hiện — cùng với khối lỗi kỹ thuật, đây là một trong hai chỗ duy nhất trong
 * ứng dụng được phép ngắt lời người dùng.
 *
 * Nút gọi là thứ nổi nhất màn hình: nền `alert` đặc, chữ `paper` (6.02:1), cao
 * tối thiểu 56px chứ không phải 44px, chữ 19px, và chiếm hết bề ngang trên điện
 * thoại. Dùng `a` với `tel:` thật chứ không phải nút gọi JavaScript, để máy nào
 * gọi điện được là bấm ra ngay trình quay số.
 *
 * KHÔNG gắn `role="button"` cho thẻ `a` này: trình đọc màn hình sẽ đọc là "nút",
 * mà người dùng bàn phím bấm phím Space lên một cái "nút" là `a` thì không có gì
 * xảy ra. Nó là một liên kết, cứ để nó là liên kết. Chiều cao 56px đã đặt tường
 * minh bằng `min-h-call` nên cũng không cần mượn quy tắc 44px ở `index.css`.
 */
export function RedFlagBlock({ answer }: { answer: string }) {
  return (
    <StateBlock
      tone="emergency"
      role="alert"
      heading="Dấu hiệu này cần được khám ngay"
      icon={<AlertIcon className="h-7 w-7" />}
    >
      <AnswerText answer={answer} />

      <a
        href="tel:115"
        className="font-display mt-block flex min-h-call w-full items-center justify-center gap-tight rounded-lg bg-alert px-cozy text-center text-notice font-bold text-paper no-underline lg:w-auto"
      >
        <PhoneIcon className="h-7 w-7 shrink-0" />
        Gọi cấp cứu 115
      </a>
    </StateBlock>
  )
}

/** Những chủ đề trợ lý trả lời được, để người dùng biết hỏi lại thế nào. */
const ANSWERABLE_TOPICS: readonly string[] = [
  'Chế độ ăn: nên ăn gì, kiêng gì, ăn bao nhiêu là vừa.',
  'Dấu hiệu cần chú ý: khi nào là bình thường, khi nào phải đi khám.',
  'Cách sinh hoạt: vận động, ngủ nghỉ, đo chỉ số tại nhà.',
]

/**
 * Từ chối trả lời.
 *
 * Giọng là GIẢI THÍCH, không phải cấm đoán. Người vừa bị từ chối mà không được
 * nói cho biết vì sao, và không được chỉ cho làm gì tiếp, thì sẽ đi hỏi chỗ
 * khác — mà chỗ khác thì không có ai kiểm duyệt nội dung y khoa.
 *
 * Nên khối này có hai thứ mà `answer` của API không có: một việc cụ thể để làm
 * ngay, và một danh sách nói rõ hỏi lại thế nào thì trợ lý trả lời được.
 */
export function RefusedBlock({ answer }: { answer: string }) {
  return (
    <StateBlock
      tone="refuse"
      heading="Câu hỏi này phải do bác sĩ quyết định"
      icon={<NoteIcon className="h-7 w-7" />}
    >
      <AnswerText answer={answer} />

      <p className="font-display mt-block text-question font-semibold text-ink">
        Việc bạn có thể làm ngay
      </p>
      <p className="font-display mt-hair text-question text-ink">
        Bạn hãy ghi câu hỏi này ra giấy, kèm ngày hôm nay, rồi mang theo trong
        lần tái khám tới. Bác sĩ đang điều trị cho bạn là người trả lời được, vì
        họ nắm kết quả xét nghiệm và những thuốc bạn đang uống.
      </p>

      <div className="mt-block border-t border-rule pt-snug">
        <p className="font-display text-question font-semibold text-ink">
          Những điều tôi trả lời được
        </p>
        <ul className="mt-tight space-y-tight">
          {ANSWERABLE_TOPICS.map((topic) => (
            <li key={topic} className="font-display text-question text-ink">
              {topic}
            </li>
          ))}
        </ul>
      </div>
    </StateBlock>
  )
}

/**
 * Chưa có tài liệu về chủ đề này.
 *
 * Trung tính hoàn toàn: không nền màu, không màu cảnh báo, không màu từ chối.
 * Chỉ một nét dọc `border` và giá sách. Người hỏi KHÔNG làm gì sai, và hình
 * khối phải nói ra điều đó trước cả khi họ kịp đọc chữ.
 *
 * Câu "đã được ghi nhận" là lời hứa của hệ thống chứ không phải của mô hình, nên
 * nó do giao diện nói, không lấy từ `answer`. Đặt sau một nét kẻ, cỡ nhỏ hơn —
 * nó là ghi chú về quy trình, không phải phần trả lời.
 */
export function ReferralBlock({ answer }: { answer: string }) {
  return (
    <StateBlock
      tone="neutral"
      heading="Thư viện chưa có tài liệu về chủ đề này"
      icon={<LibraryIcon className="h-7 w-7" />}
    >
      <p className="font-display mb-para text-question text-moss">
        Bạn không hỏi sai. Chủ đề này chỉ là chưa có trong thư viện tài liệu mà
        hệ thống được phép trích dẫn.
      </p>

      <AnswerText answer={answer} />

      <p className="font-display mt-block border-t border-rule pt-snug text-question text-moss">
        Câu hỏi của bạn đã được ghi nhận. Đội ngũ biên tập y khoa sẽ xem xét bổ
        sung tài liệu cho chủ đề này.
      </p>
    </StateBlock>
  )
}

/**
 * Câu chốt bắt buộc ở mọi phản hồi, theo mục 5 hợp đồng.
 *
 * Mờ nhất trên trang: màu moss, tách bằng một nét kẻ mảnh. Nó phải luôn đọc
 * được, nhưng không bao giờ được tranh chỗ với câu trả lời.
 *
 * Cỡ 16px chứ không phải bậc `note` 15px: đây là câu nói ra giới hạn pháp lý
 * và y khoa của cả ứng dụng. Mờ nhất KHÔNG có nghĩa là nhỏ tới mức người ta bỏ
 * qua — nó lùi lại bằng màu và bằng vị trí, không bằng cỡ chữ.
 */
export function Disclaimer({ text }: { text: string }) {
  return (
    <p className="font-display mt-block max-w-answer border-t border-rule pt-snug text-question text-moss">
      {text}
    </p>
  )
}
