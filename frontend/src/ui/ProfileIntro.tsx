/**
 * Ba điều phải hiểu trước khi khai hồ sơ, cộng lời trấn an về giấy tờ.
 *
 * MỘT BẢN DUY NHẤT, không có bản ngắn kèm bản đầy đủ. Bản trước hiện ba dòng
 * ngắn rồi thêm một khối "Xem chi tiết" chứa lại đúng ba điều đó ở dạng dài:
 * cùng một nội dung nằm hai chỗ, cộng lại còn dài hơn cả bản gốc, và người dùng
 * đọc xong ba dòng ngắn vẫn phải đoán xem bên trong có gì khác không. Nay mỗi
 * điều là một tới hai câu, đủ ý và hết.
 *
 * Cố ý viết bằng CÂU THẬT, không phải thẻ tính năng: không tiêu đề in đậm cộng
 * một dòng quảng cáo bên dưới. Ba điều này không phải điểm mạnh của sản phẩm,
 * chúng là ba giới hạn mà người dùng cần biết trước khi tin vào bất cứ thứ gì
 * ứng dụng nói ra.
 *
 * Điểm thứ ba nói thẳng chuyện trợ lý sẽ TỪ CHỐI câu hỏi về liều thuốc. Biết
 * trước thì lúc bị từ chối người dùng hiểu đó là thiết kế, không phải hỏng —
 * còn không biết trước thì họ đi hỏi chỗ khác, mà chỗ khác không có ai kiểm
 * duyệt nội dung y khoa. Vì vậy rút gọn đến đâu thì câu này vẫn phải giữ được
 * chữ "không kê đơn, không chỉnh liều", chứ không thành "trợ lý có giới hạn".
 *
 * CỠ CHỮ: `question` 16px cho ba đoạn, `note` 15px cho dòng về giấy tờ. Cả hai
 * đều NHỎ HƠN nội dung câu trả lời (`answer` 18px), và đó là chủ ý chứ không
 * phải quên áp thang.
 *
 * Lý do được phép nhỏ hơn: đây là lời dặn đọc MỘT LẦN trước khi khai hồ sơ, không
 * phải nội dung y khoa để đọc kỹ và quay lại tra. Người dùng đọc nó đúng một lượt
 * rồi đi tiếp vào form, và nó không mang khẳng định y khoa nào để ai phải dò lại
 * từng câu. Cái phải giữ cỡ lớn là thứ người bệnh thực sự đọc để hành động: câu
 * trả lời `answer` 18px, và các khối trạng thái `notice` 19px — bậc đó vẫn dành
 * riêng cho chữ không được phép đọc lướt, đừng kéo phần này lên đó nữa.
 *
 * Đổi lại, phần này đứng ngay đầu màn hồ sơ và đẩy ô nhập đầu tiên xuống dưới
 * màn hình đầu trên điện thoại. Ở 16px thì cả lời dặn lẫn bước đầu của form cùng
 * nhìn thấy được.
 *
 * `note` 15px là SÀN cỡ chữ của dự án. Không hạ thêm bậc nào nữa ở cả hai chỗ.
 *
 * AI THẤY GÌ: tất cả, kể cả người quay lại sửa hồ sơ. Ba điều này là giới hạn
 * của công cụ chứ không phải màn chào lần đầu, nên không có prop nào để bật tắt
 * hay thu gọn chúng.
 */
import type { ComponentType } from 'react'

import { LibraryIcon, NoteIcon, PillIcon } from './icons'

type IntroPoint = {
  id: string
  Icon: ComponentType<{ className?: string }>
  /** Một tới hai câu. Đọc hết trong một nhịp, và không có bản dài nào khác. */
  body: string
}

const POINTS: readonly IntroPoint[] = [
  {
    id: 'diagnosed',
    Icon: NoteIcon,
    body:
      'Nơi này dành cho người đã đi khám và có kết luận của bác sĩ. Nếu bạn đang ' +
      'thấy khó chịu trong người và muốn biết mình bị bệnh gì, bạn cần đi khám.',
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
      'Trợ lý không kê đơn và không chỉnh liều thuốc. Bạn hỏi nên uống mấy viên ' +
      'hay có nên tăng giảm liều thì trợ lý sẽ mời bạn hỏi bác sĩ điều trị — đó ' +
      'là điều đã định sẵn, không phải máy hỏng.',
  },
]

export function ProfileIntro() {
  return (
    <div className="max-w-answer rounded-card-lg bg-surface p-cozy">
      <ul className="space-y-cozy">
        {POINTS.map(({ id, Icon, body }) => (
          <li key={id} className="flex items-start gap-snug">
            {/* Khối biểu tượng nền `sand`, chữ `sand-deep` (7.79:1). Sand chứ
                không phải mint: mint là màu của HÀNH ĐỘNG trong ứng dụng này
                (nút, marker, nhãn nguồn), còn ba điều ở đây là lời dặn — chúng
                không được trông như thứ bấm được. */}
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-icon bg-sand text-sand-deep">
              <Icon className="h-6 w-6" />
            </span>
            <p className="text-question text-body">{body}</p>
          </li>
        ))}
      </ul>

      {/* Ràng buộc PII của brief, gói trong một câu. Người sắp phải điền thông
          tin sức khỏe cần được trấn an TRƯỚC khi điền, và một câu là đủ. */}
      <p className="font-display mt-cozy border-t border-line pt-snug text-note text-slate">
        Ứng dụng không hỏi và không lưu tên, số điện thoại hay giấy tờ của bạn.
      </p>
    </div>
  )
}
