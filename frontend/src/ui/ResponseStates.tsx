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

/**
 * Một phần câu trả lời chưa bám nguồn đầy đủ.
 *
 * Giọng phải bình tĩnh: đây là ghi chú về mức độ chắc chắn, không phải cảnh báo
 * nguy hiểm. Cố tình KHÔNG dùng màu alert và KHÔNG dùng `role="alert"` — trình
 * đọc màn hình mà ngắt lời để báo cái này thì cũng là làm người dùng hoảng.
 */
export function PartialSupportNotice() {
  return (
    <div className="mb-block max-w-answer border-l-2 border-rule pl-snug">
      <p className="font-display text-question font-semibold">
        Một phần câu trả lời này chưa có tài liệu nói rõ
      </p>
      <p className="font-display mt-hair text-note text-moss">
        Những chỗ có số nguồn bên cạnh là lấy từ tài liệu đã duyệt. Những chỗ
        không có số nguồn thì tài liệu chưa nói rõ, bạn nên hỏi thêm bác sĩ điều
        trị của mình.
      </p>
    </div>
  )
}

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
 * Mờ nhất trên trang: cỡ `note`, màu moss, tách bằng một nét kẻ mảnh. Nó phải
 * luôn đọc được, nhưng không bao giờ được tranh chỗ với câu trả lời.
 */
export function Disclaimer({ text }: { text: string }) {
  return (
    <p className="font-display mt-block max-w-answer border-t border-rule pt-snug text-note text-moss">
      {text}
    </p>
  )
}
