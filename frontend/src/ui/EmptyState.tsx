/**
 * Khuôn chung của MỌI trạng thái rỗng trong ứng dụng.
 *
 * Ba phần, không hơn: linh vật bản `muted` ở giữa, một dòng tiêu đề 18px, và
 * một đoạn giải thích. Gom về một component để không chỗ nào tự nghĩ ra một
 * kiểu trống riêng — danh sách hội thoại trống, hàng đợi trống và log trống
 * phải nhìn ra ngay là cùng một loại tình huống.
 *
 * CÂU CHỮ CHỈ ĐƯỢC MÔ TẢ ĐIỀU GIAO DIỆN BIẾT CHẮC. Nguyên tắc này quan trọng
 * hơn cả hình: một danh sách rỗng chỉ nói được rằng "lần đọc này không có mục
 * nào trả về", KHÔNG nói được vì sao. "Hàng đợi đã sạch" nghe như vừa duyệt
 * xong hết, trong khi cùng một danh sách rỗng cũng có thể nghĩa là chưa ai
 * tạo mục nào, hoặc là phần ghi log chưa chạy. Ba tình huống đó đòi ba hành
 * động khác nhau, mà giao diện thì không phân biệt được cái nào.
 *
 * Vì vậy chỗ gọi truyền vào `title` và `body` đã viết sẵn theo đúng luật đó;
 * component này không tự sinh câu chữ nào.
 */
import type { ReactNode } from 'react'

import { Mascot } from './Mascot'

/**
 * Hai họ nền của ứng dụng đòi hai cặp màu chữ khác nhau. Đây là chỗ duy nhất
 * trạng thái rỗng được phép rẽ nhánh — mọi thứ khác giống hệt nhau.
 *
 *   light: ink 14.22:1 và slate 4.58:1 trên canvas.
 *   dark:  white 15.39:1 và mist 6.80:1 trên ink.
 */
const TONE = {
  light: { title: 'text-ink', body: 'text-slate' },
  dark: { title: 'text-white', body: 'text-mist' },
} as const

export function EmptyState({
  title,
  body,
  action,
  tone = 'light',
  /** `true` cho những khoảng hẹp như thanh bên, nơi linh vật 96px không vừa. */
  compact = false,
}: {
  title: string
  body: string
  /** Nút hoặc liên kết đặt dưới đoạn giải thích. Phần lớn chỗ không cần. */
  action?: ReactNode
  tone?: keyof typeof TONE
  compact?: boolean
}) {
  const colors = TONE[tone]

  return (
    <div
      className={`mx-auto flex max-w-answer flex-col items-center text-center ${
        compact ? 'px-snug py-cozy' : 'px-cozy py-block'
      }`}
    >
      <Mascot variant="muted" size={compact ? 64 : 96} />

      <p
        className={`font-display font-semibold ${colors.title} ${
          compact ? 'mt-snug text-question' : 'mt-cozy text-empty'
        }`}
      >
        {title}
      </p>

      <p className={`font-display mt-tight text-question ${colors.body}`}>{body}</p>

      {action !== undefined && <div className="mt-cozy">{action}</div>}
    </div>
  )
}
