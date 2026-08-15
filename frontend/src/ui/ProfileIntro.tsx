/**
 * Ba điều phải hiểu trước khi khai hồ sơ.
 *
 * Cố ý viết bằng CÂU THẬT, không phải thẻ tính năng: không tiêu đề in đậm cộng
 * một dòng quảng cáo bên dưới. Ba điều này không phải điểm mạnh của sản phẩm,
 * chúng là ba giới hạn mà người dùng cần biết trước khi tin vào bất cứ thứ gì
 * ứng dụng nói ra.
 *
 * Điểm thứ ba nói thẳng chuyện trợ lý sẽ TỪ CHỐI câu hỏi về liều thuốc. Biết
 * trước thì lúc bị từ chối người dùng hiểu đó là thiết kế, không phải hỏng —
 * còn không biết trước thì họ đi hỏi chỗ khác, mà chỗ khác không có ai kiểm
 * duyệt nội dung y khoa.
 *
 * Cỡ `notice` 19px như nội dung chính. Đây là phần chữ mà người dùng thực sự
 * phải đọc, không phải phần trang trí dẫn vào form.
 */
import type { ComponentType } from 'react'

import { LibraryIcon, NoteIcon, PillIcon } from './icons'

type IntroPoint = {
  id: string
  Icon: ComponentType<{ className?: string }>
  body: string
}

const POINTS: readonly IntroPoint[] = [
  {
    id: 'diagnosed',
    Icon: NoteIcon,
    body:
      'Nơi này dành cho người đã đi khám và có kết luận của bác sĩ. Nếu bạn đang ' +
      'thấy khó chịu trong người và muốn biết mình bị bệnh gì, chỗ này không trả ' +
      'lời được — bạn cần đi khám.',
  },
  {
    id: 'sources',
    Icon: LibraryIcon,
    body:
      'Mỗi câu trả lời đều kèm tên tài liệu của Bộ Y tế, để bạn tự kiểm tra được ' +
      'hoặc đưa cho bác sĩ xem.',
  },
  {
    id: 'no-prescription',
    Icon: PillIcon,
    body:
      'Trợ lý không kê đơn và không chỉnh liều thuốc. Nếu bạn hỏi nên uống mấy ' +
      'viên, hay có nên tăng giảm liều, trợ lý sẽ từ chối và mời bạn hỏi bác sĩ ' +
      'điều trị. Đó là điều đã định sẵn, không phải máy hỏng.',
  },
]

export function ProfileIntro() {
  return (
    <ul className="max-w-answer space-y-cozy">
      {POINTS.map(({ id, Icon, body }) => (
        <li key={id} className="flex items-start gap-snug">
          <Icon className="mt-tight h-7 w-7 shrink-0 text-medical" />
          <p className="text-notice text-ink">{body}</p>
        </li>
      ))}
    </ul>
  )
}
