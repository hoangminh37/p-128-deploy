/**
 * Ba điều phải hiểu trước khi khai hồ sơ, cộng lời trấn an về giấy tờ.
 *
 * BẢN NGẮN TRƯỚC, BẢN ĐẦY ĐỦ SAU MỘT CÚ BẤM. Trước kia phần này là ba đoạn dài
 * cộng một khối về giấy tờ, chiếm gần hết màn hình đầu tiên — người dùng phải
 * cuộn qua một bức tường chữ mới tới được ô đầu tiên của form, và phần lớn sẽ
 * cuộn chứ không đọc. Nay mỗi điều còn đúng một câu; ai muốn biết đủ thì mở
 * "Xem chi tiết", và ở đó nội dung giữ nguyên từng ý, không cắt bớt.
 *
 * Cố ý viết bằng CÂU THẬT, không phải thẻ tính năng: không tiêu đề in đậm cộng
 * một dòng quảng cáo bên dưới. Ba điều này không phải điểm mạnh của sản phẩm,
 * chúng là ba giới hạn mà người dùng cần biết trước khi tin vào bất cứ thứ gì
 * ứng dụng nói ra.
 *
 * Điểm thứ ba nói thẳng chuyện trợ lý sẽ TỪ CHỐI câu hỏi về liều thuốc. Biết
 * trước thì lúc bị từ chối người dùng hiểu đó là thiết kế, không phải hỏng —
 * còn không biết trước thì họ đi hỏi chỗ khác, mà chỗ khác không có ai kiểm
 * duyệt nội dung y khoa. Vì vậy câu ngắn của điểm này vẫn phải nói được chữ
 * "không kê đơn, không chỉnh liều", chứ không rút thành "trợ lý có giới hạn".
 *
 * Cỡ `notice` 19px như nội dung chính, ở cả bản ngắn lẫn bản đầy đủ. Đây là
 * phần chữ mà người dùng thực sự phải đọc, không phải phần trang trí dẫn vào
 * form.
 *
 * AI THẤY GÌ: bản ba dòng ngắn hiện cho tất cả, kể cả người quay lại sửa hồ sơ.
 * Ba điều này là giới hạn của công cụ chứ không phải màn chào lần đầu, và người
 * sửa hồ sơ sau vài tuần cũng cần được nhắc lại. Chỉ phần "Xem chi tiết" là
 * khác nhau: mở sẵn với người khai lần đầu, thu gọn với người quay lại — xem
 * prop `defaultExpanded`.
 *
 * Dùng `details`/`summary` chứ không tự dựng nút đóng mở: trình duyệt cho sẵn
 * hành vi bàn phím, trạng thái đóng mở mà trình đọc màn hình đọc được, và cả
 * chức năng tìm trong trang mở đúng phần đang ẩn. `summary` cũng đã có sàn chạm
 * 44px từ `index.css`.
 */
import type { ComponentType } from 'react'

import { LibraryIcon, NoteIcon, PillIcon } from './icons'

type IntroPoint = {
  id: string
  Icon: ComponentType<{ className?: string }>
  /** Một câu, đọc hết trong một nhịp. Đây là thứ hiện ra ngay. */
  short: string
  /** Nguyên văn bản đầy đủ, chỉ hiện khi người dùng mở "Xem chi tiết". */
  full: string
}

const POINTS: readonly IntroPoint[] = [
  {
    id: 'diagnosed',
    Icon: NoteIcon,
    short: 'Nơi này dành cho người đã đi khám và có kết luận của bác sĩ.',
    full:
      'Nơi này dành cho người đã đi khám và có kết luận của bác sĩ. Nếu bạn đang ' +
      'thấy khó chịu trong người và muốn biết mình bị bệnh gì, chỗ này không trả ' +
      'lời được — bạn cần đi khám.',
  },
  {
    id: 'sources',
    Icon: LibraryIcon,
    short: 'Mỗi câu trả lời đều kèm tên tài liệu của Bộ Y tế.',
    full:
      'Mỗi câu trả lời đều kèm tên tài liệu của Bộ Y tế, để bạn tự kiểm tra được ' +
      'hoặc đưa cho bác sĩ xem.',
  },
  {
    id: 'no-prescription',
    Icon: PillIcon,
    short: 'Trợ lý không kê đơn và không chỉnh liều thuốc.',
    full:
      'Trợ lý không kê đơn và không chỉnh liều thuốc. Nếu bạn hỏi nên uống mấy ' +
      'viên, hay có nên tăng giảm liều, trợ lý sẽ từ chối và mời bạn hỏi bác sĩ ' +
      'điều trị. Đó là điều đã định sẵn, không phải máy hỏng.',
  },
]

/** Một dòng của danh sách, dùng chung cho cả bản ngắn lẫn bản đầy đủ. */
function IntroLine({
  Icon,
  body,
}: {
  Icon: ComponentType<{ className?: string }>
  body: string
}) {
  return (
    <li className="flex items-start gap-snug">
      <Icon className="mt-tight h-7 w-7 shrink-0 text-medical" />
      <p className="text-notice text-ink">{body}</p>
    </li>
  )
}

export function ProfileIntro({
  /**
   * Phần "Xem chi tiết" có mở sẵn hay không.
   *
   * Người khai lần đầu chưa biết gì về công cụ nên mở sẵn; người quay lại sửa
   * hồ sơ đã đọc một lần rồi nên để thu gọn. Bản ba dòng ngắn thì cả hai đều
   * thấy — đó là ba giới hạn của công cụ, không phải lời chào một lần rồi thôi.
   *
   * Truyền vào thuộc tính `open` của `details` chứ không giữ state riêng: React
   * chỉ ghi lại thuộc tính này khi GIÁ TRỊ PROP đổi, mà ở đây nó đứng yên suốt
   * vòng đời của màn hình. Nên người dùng đóng mở thoải mái, không có lần vẽ
   * lại nào kéo nó về trạng thái ban đầu.
   */
  defaultExpanded = false,
}: {
  defaultExpanded?: boolean
}) {
  return (
    <div className="max-w-answer">
      <ul className="space-y-snug">
        {POINTS.map(({ id, Icon, short }) => (
          <IntroLine key={id} Icon={Icon} body={short} />
        ))}
      </ul>

      {/* Ràng buộc PII của brief, rút còn một dòng. Người sắp phải điền thông
          tin sức khỏe cần được trấn an TRƯỚC khi điền, nhưng một câu là đủ để
          trấn an — phần liệt kê đủ bốn loại giấy tờ nằm ở bản đầy đủ. */}
      <p className="font-display mt-snug text-question text-moss">
        Ứng dụng không hỏi và không lưu tên, số điện thoại hay giấy tờ của bạn.
      </p>

      <details open={defaultExpanded} className="mt-snug">
        <summary className="font-display flex min-h-touch items-center text-input font-semibold text-medical underline underline-offset-4">
          Xem chi tiết
        </summary>

        <ul className="mt-snug space-y-cozy">
          {POINTS.map(({ id, Icon, full }) => (
            <IntroLine key={id} Icon={Icon} body={full} />
          ))}
        </ul>

        <div className="mt-block border-l-4 border-medical pl-cozy">
          <p className="font-display text-input font-semibold">
            Bạn không cần khai tên hay giấy tờ
          </p>
          <p className="font-display mt-hair text-question text-moss">
            Ứng dụng không hỏi và không lưu tên, số điện thoại, số căn cước hay số
            thẻ bảo hiểm. Chỉ những thông tin dưới đây được lưu, và chỉ để trợ lý
            tra đúng tài liệu cho bệnh của bạn.
          </p>
        </div>
      </details>
    </div>
  )
}
