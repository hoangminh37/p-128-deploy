/**
 * Bốn khối trạng thái, dựng trên cùng một khung.
 *
 * Cả bốn đều nằm TRONG khung của một câu trả lời bình thường — có tiêu đề câu
 * hỏi ở trên, có dòng miễn trừ ở dưới (xem `AnswerTurn.tsx`). Người bệnh phải
 * thấy đây là phản hồi cho câu mình vừa hỏi, chứ không phải một hộp lỗi rơi từ
 * đâu xuống giữa trang.
 *
 * BỐN GIỌNG, phân biệt bằng BA tín hiệu cùng lúc — nền, khối biểu tượng, và
 * hình vẽ — chứ không chỉ bằng màu. Khoảng 8% nam giới không phân biệt được đỏ
 * với vàng nâu, mà `alert` với `sand` thì đúng là đỏ với vàng nâu:
 *
 *   red_flag  — NỀN ALERT ĐẶC, chữ trắng, khối biểu tượng nền trắng, nút gọi
 *               115 nền trắng chữ alert cao 56px. Ồn nhất trong cả ứng dụng.
 *               Người đọc có thể đang nguy hiểm thật. KHÔNG có linh vật.
 *   refused   — NỀN SAND, chữ sand-deep, khối biểu tượng nền sand-deep. Hệ
 *               thống BIẾT chủ đề này nhưng KHÔNG ĐƯỢC PHÉP trả lời. Giọng
 *               giải thích vì sao, kèm việc cụ thể để làm tiếp — không phải
 *               giọng cấm đoán. KHÔNG có linh vật.
 *   referral  — NỀN TRẮNG CÓ VIỀN, kèm LINH VẬT bản `muted` bên trái. Thư viện
 *               CHƯA CÓ tài liệu. Người hỏi không làm gì sai, và hình khối phải
 *               nói ra điều đó trước cả khi họ kịp đọc chữ.
 *   lỗi       — NỀN TRẮNG, nét trái màu alert (xem `ErrorNotice.tsx`). Đỏ để
 *               báo có trục trặc, nhưng không nền đặc — trục trặc kỹ thuật
 *               không được phép trông ngang hàng với dấu hiệu cấp cứu.
 *
 * VÌ SAO LINH VẬT CHỈ Ở `referral`: một khuôn mặt cười đứng cạnh dòng "dấu hiệu
 * này cần được khám ngay" là đùa cợt với người có thể đang nguy hiểm; đứng cạnh
 * một lời từ chối thì thành ra chế nhạo. Xem thêm ghi chú ở `Mascot.tsx`.
 *
 * TƯƠNG PHẢN, đo trên nền của CHÍNH khối đó:
 *   white trên alert       6.54:1
 *   alert trên white       6.54:1  (chữ trên nút gọi 115)
 *   sand-deep trên sand    7.79:1
 *   sand trên sand-deep    7.79:1  (chữ trên nút của khối refused)
 *   ink trên white        15.39:1
 *   slate trên white       4.96:1
 * ĐỪNG đặt `slate` lên `sand`: cặp đó chỉ đạt 4.00:1.
 */
import type { ReactNode } from 'react'

import { splitParagraphs } from '../lib/paragraphs'
import { AlertIcon, NoteIcon, PhoneIcon } from './icons'
import { Mascot } from './Mascot'

/**
 * Bốn giọng của khối trạng thái.
 *
 * `iconBox` luôn NGƯỢC nền của khối: nền đặc thì khối biểu tượng sáng, nền
 * sáng thì khối biểu tượng đặc. Nhờ vậy biểu tượng là thứ đầu tiên mắt bắt
 * được, kể cả khi người đọc chưa kịp phân biệt màu nền.
 */
const TONE = {
  emergency: {
    container: 'bg-alert-solid',
    heading: 'text-white',
    body: 'text-white',
    // Nền TRẮNG THẬT, không phải `surface`: ở chế độ tối `surface` là navy, mà
    // một ô navy trên khối đỏ thì chìm. Ô này phải sáng ở cả hai chế độ.
    iconBox: 'bg-white text-alert-solid',
  },
  refuse: {
    container: 'bg-sand',
    heading: 'text-sand-deep',
    body: 'text-sand-deep',
    iconBox: 'bg-sand-deep text-sand',
  },
  neutral: {
    container: 'border-2 border-line bg-surface',
    heading: 'text-body',
    body: 'text-body',
    iconBox: 'bg-canvas text-body',
  },
  fault: {
    container: 'border-2 border-l-8 border-alert bg-surface',
    heading: 'text-alert',
    body: 'text-body',
    iconBox: 'bg-alert-solid text-white',
  },
} as const

export type StateTone = keyof typeof TONE

/**
 * Khung chung của bốn khối.
 *
 * Khối biểu tượng là một ô vuông bo góc `icon` (12px) chứ không phải một hình
 * vẽ trơ giữa chữ. Ô vuông có nền riêng nên nó giữ được tương phản của mình bất
 * kể nền khối là gì, và nó cho cả bốn khối một điểm neo chung ở góc trên trái.
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
  const style = TONE[tone]

  return (
    <section
      role={role}
      className={`max-w-answer rounded-card-lg p-cozy ${style.container} ${style.body}`}
    >
      <div className="flex items-start gap-snug">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-icon ${style.iconBox}`}
        >
          {icon}
        </span>

        <h2 className={`mt-tight text-heading font-semibold ${style.heading}`}>
          {heading}
        </h2>
      </div>

      <div className="mt-cozy">{children}</div>
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
 * Nút gọi là thứ nổi nhất màn hình: NỀN TRẮNG trên nền alert đặc (6.54:1), cao
 * tối thiểu 56px chứ không phải 44px, chữ 19px, và chiếm hết bề ngang trên điện
 * thoại. Nền trắng chứ không phải nền đậm hơn: trong một khối đã đỏ kín, thứ
 * duy nhất còn nổi lên được là một mảng sáng.
 *
 * Dùng `a` với `tel:` thật chứ không phải nút gọi JavaScript, để máy nào gọi
 * điện được là bấm ra ngay trình quay số.
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
        // Nền TRẮNG THẬT và chữ `alert-solid`, cố định ở cả hai chế độ. Đây là
        // nút duy nhất trong ứng dụng không đổi một pixel nào khi chuyển chế
        // độ — người đang đau ngực phải thấy đúng một thứ, bất kể máy họ đang
        // để chế độ nào. Trắng trên đỏ đặc: 6.54:1.
        className="font-display mt-block flex min-h-call w-full items-center justify-center gap-tight rounded-pill bg-white px-cozy text-center text-notice font-bold text-alert-solid no-underline lg:w-auto lg:px-block"
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
 *
 * Mọi chữ trong khối đều là `sand-deep` (7.79:1). KHÔNG hạ dòng phụ xuống
 * `slate` cho "nhẹ đi": slate trên sand chỉ đạt 4.00:1.
 */
export function RefusedBlock({ answer }: { answer: string }) {
  return (
    <StateBlock
      tone="refuse"
      heading="Câu hỏi này phải do bác sĩ quyết định"
      icon={<NoteIcon className="h-7 w-7" />}
    >
      <AnswerText answer={answer} />

      <p className="font-display mt-block text-question font-semibold">
        Việc bạn có thể làm ngay
      </p>
      <p className="font-display mt-hair text-question">
        Bạn hãy ghi câu hỏi này ra giấy, kèm ngày hôm nay, rồi mang theo trong
        lần tái khám tới. Bác sĩ đang điều trị cho bạn là người trả lời được, vì
        họ nắm kết quả xét nghiệm và những thuốc bạn đang uống.
      </p>

      <div className="mt-block border-t border-sand-deep/30 pt-snug">
        <p className="font-display text-question font-semibold">
          Những điều tôi trả lời được
        </p>
        <ul className="mt-tight space-y-tight">
          {ANSWERABLE_TOPICS.map((topic) => (
            <li key={topic} className="font-display text-question">
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
 * KHỐI DUY NHẤT có linh vật. Trung tính hoàn toàn: nền trắng, viền mảnh, chữ
 * `ink` và `slate` — không màu cảnh báo, không màu từ chối. Người hỏi KHÔNG làm
 * gì sai, và bố cục phải nói ra điều đó trước khi họ kịp đọc chữ.
 *
 * Đặt cạnh khối `refused` phải nhận ra ngay là hai chuyện khác nhau: một bên là
 * mảng màu kín với biểu tượng tờ giấy, một bên là khối trắng với một búp sen.
 * Trộn hai cái này lại sẽ khiến người bệnh tưởng mình vừa hỏi điều cấm.
 *
 * Câu "đã được ghi nhận" là lời hứa của hệ thống chứ không phải của mô hình, nên
 * nó do giao diện nói, không lấy từ `answer`. Đặt sau một nét kẻ, cỡ nhỏ hơn —
 * nó là ghi chú về quy trình, không phải phần trả lời.
 */
export function ReferralBlock({ answer }: { answer: string }) {
  return (
    <section className="max-w-answer rounded-card-lg border-2 border-line bg-surface p-cozy">
      <div className="flex items-start gap-snug">
        {/* Linh vật thay hẳn khối biểu tượng của ba khối kia. 64px chứ không
            lớn hơn: trên máy 360px, thẻ này chỉ còn ~296px bề ngang, và mỗi
            pixel linh vật lấy đi là một pixel tiêu đề phải xuống dòng. */}
        <span className="shrink-0">
          <Mascot variant="muted" size={64} />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-heading font-semibold text-body">
            Thư viện chưa có tài liệu về chủ đề này
          </h2>
          <p className="font-display mt-tight text-question text-slate">
            Bạn không hỏi sai. Chủ đề này chỉ là chưa có trong thư viện tài liệu
            mà hệ thống được phép trích dẫn.
          </p>
        </div>
      </div>

      <div className="mt-cozy text-body">
        <AnswerText answer={answer} />
      </div>

      <p className="font-display mt-block border-t border-line pt-snug text-question text-slate">
        Câu hỏi của bạn đã được ghi nhận. Đội ngũ biên tập y khoa sẽ xem xét bổ
        sung tài liệu cho chủ đề này.
      </p>
    </section>
  )
}

/**
 * Câu chốt bắt buộc ở mọi phản hồi, theo mục 5 hợp đồng.
 *
 * Mờ nhất trên trang: màu `slate`, tách bằng một nét kẻ mảnh. Nó phải luôn đọc
 * được, nhưng không bao giờ được tranh chỗ với câu trả lời.
 *
 * Cỡ 16px chứ không phải bậc `note` 15px: đây là câu nói ra giới hạn pháp lý
 * và y khoa của cả ứng dụng. Mờ nhất KHÔNG có nghĩa là nhỏ tới mức người ta bỏ
 * qua — nó lùi lại bằng màu và bằng vị trí, không bằng cỡ chữ.
 */
export function Disclaimer({ text }: { text: string }) {
  return (
    <p className="font-display mt-block max-w-answer border-t border-line pt-snug text-question text-slate">
      {text}
    </p>
  )
}
