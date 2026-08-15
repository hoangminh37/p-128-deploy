/**
 * Khu vực biên tập viên — bản tạm của Gate 2.
 *
 * Đợt này chỉ dựng đường vào và cái chốt phân vai trò. Nội dung thật làm ở đợt
 * sau. Màn này tồn tại để hai việc quan trọng hơn được kiểm chứng ngay bây giờ:
 * tài khoản `editor` đăng nhập vào có chỗ để tới, và tài khoản `patient` gõ
 * thẳng `/editor` thì bị đá về `/chat`.
 *
 * Nói rõ đang xây dở thay vì dựng giao diện giả có nút bấm không chạy. Một màn
 * trống nhưng thành thật thì người xem hiểu ngay còn thiếu gì; một màn đầy nút
 * chết thì họ tưởng ứng dụng hỏng.
 */
import { LibraryIcon } from '../ui/icons'

/** Những việc phần biên tập viên sẽ làm, lấy từ phạm vi đã chốt của dự án. */
const PLANNED: readonly string[] = [
  'Duyệt tài liệu trước khi đưa vào thư viện mà trợ lý được phép trích dẫn.',
  'Xem những câu hỏi mà trợ lý đã trả lời "thư viện chưa có tài liệu", để biết cần bổ sung nội dung nào.',
  'Kiểm tra lại các câu trả lời đã gửi cho bệnh nhân và nguồn đi kèm.',
]

export function EditorScreen() {
  return (
    <div className="max-w-answer">
      <h1 className="font-display text-ask font-bold">Khu vực biên tập viên</h1>

      <div className="mt-block rounded-lg border-l-4 border-border p-cozy">
        <div className="flex items-start gap-tight text-ink">
          <LibraryIcon className="mt-hair h-7 w-7 shrink-0" />
          <h2 className="font-display text-heading font-bold">
            Phần này đang được dựng
          </h2>
        </div>

        <p className="mt-snug text-notice text-ink">
          Bạn đã đăng nhập đúng bằng tài khoản biên tập viên. Các công cụ dành cho
          bạn sẽ có ở đợt phát hành sau.
        </p>
      </div>

      <h2 className="font-display mt-block text-input font-semibold text-ink">
        Những việc sẽ làm được ở đây
      </h2>
      <ul className="mt-snug space-y-snug">
        {PLANNED.map((item) => (
          <li key={item} className="border-l-2 border-rule pl-snug text-notice text-ink">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
