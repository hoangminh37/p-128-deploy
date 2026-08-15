/**
 * Bốn khối trạng thái đặt quanh câu trả lời.
 *
 * `refused` và `referral` cố ý khác nhau cả hình lẫn lời, vì với bệnh nhân
 * chúng là hai chuyện hoàn toàn khác:
 *
 *   refused  — hệ thống BIẾT chủ đề này nhưng KHÔNG ĐƯỢC PHÉP trả lời, vì trả
 *              lời sai liều thuốc thì nguy hiểm. Có màu (refuse), có nét kẻ dọc
 *              dày bên trái, giọng dứt khoát về giới hạn thẩm quyền.
 *   referral — thư viện CHƯA CÓ tài liệu về chủ đề này. Trung tính hoàn toàn,
 *              không màu cảnh báo, giọng như thủ thư báo sách chưa về. Người
 *              hỏi không làm gì sai và không bị cấm hỏi.
 *
 * Trộn hai cái này lại sẽ khiến người bệnh tưởng mình vừa hỏi điều cấm.
 */
import type { ReactNode } from 'react'

/**
 * Dấu hiệu cấp cứu — banner đặt TRÊN câu trả lời, không phải dưới.
 *
 * Người đang đau ngực không đọc hết bài rồi mới thấy nút gọi. Nút `tel:115` là
 * thẻ `a` có `role="button"` nên nhận luôn quy tắc 44px ở `index.css`.
 */
export function RedFlagBanner() {
  return (
    <div role="alert" className="mb-block max-w-answer rounded-lg border-2 border-alert p-cozy">
      <p className="font-display text-heading font-bold text-alert">
        Dấu hiệu này cần được khám ngay
      </p>
      <p className="font-display mt-tight text-question">
        Bạn hãy gọi cấp cứu 115, hoặc nhờ người nhà đưa tới cơ sở y tế gần nhất.
        Bạn đừng tự lái xe.
      </p>
      <a
        href="tel:115"
        role="button"
        className="font-display mt-cozy inline-flex min-h-touch items-center justify-center rounded-lg bg-alert px-cozy text-input font-bold text-paper no-underline"
      >
        Gọi 115 ngay
      </a>
    </div>
  )
}

/* Trạng thái `partial` không còn khối riêng ở đây.
 *
 * Bản trước dựng một đoạn hai câu đặt TRÊN câu trả lời để báo rằng một phần
 * chưa bám nguồn. Nay việc đó do nhãn số tài liệu ngay dưới tiêu đề câu hỏi
 * đảm nhận (xem `SourceBadge` trong `AnswerTurn.tsx`): cùng một thông tin, một
 * dòng thay vì bốn, và nằm đúng chỗ mắt nhìn tới trước khi bắt đầu đọc. Giữ cả
 * hai là nói một điều hai lần ở hai cỡ chữ khác nhau. */

/** Khung chung cho hai khối refused và referral, để phần khác nhau nằm ở chỗ dễ thấy. */
function StateBlock({
  heading,
  headingClass,
  containerClass,
  children,
}: {
  heading: string
  headingClass: string
  containerClass: string
  children: ReactNode
}) {
  return (
    <section className={containerClass}>
      <h2 className={headingClass}>{heading}</h2>
      <div className="mt-snug">{children}</div>
    </section>
  )
}

/** Từ chối trả lời: có màu refuse, nét kẻ dọc dày, giọng nói rõ về giới hạn thẩm quyền. */
export function RefusedBlock({ children }: { children: ReactNode }) {
  return (
    <StateBlock
      heading="Câu hỏi này phải do bác sĩ quyết định"
      headingClass="font-display text-heading font-bold text-refuse"
      containerClass="border-l-4 border-refuse pl-cozy"
    >
      {children}
    </StateBlock>
  )
}

/** Chưa có tài liệu: trung tính hoàn toàn, không màu, không nét kẻ màu. */
export function ReferralBlock({ children }: { children: ReactNode }) {
  return (
    <StateBlock
      heading="Thư viện chưa có tài liệu về chủ đề này"
      headingClass="font-display text-heading font-bold text-ink"
      containerClass="border-l-4 border-rule pl-cozy"
    >
      {children}
    </StateBlock>
  )
}

/**
 * Câu chốt bắt buộc ở mọi phản hồi, theo mục 4 hợp đồng.
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
