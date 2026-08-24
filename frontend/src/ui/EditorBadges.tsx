/**
 * Hai loại nhãn của hàng đợi duyệt: nguồn gốc và trạng thái. Cộng khối biểu
 * tượng vuông đứng đầu mỗi dòng danh sách.
 *
 * NGUỒN GỐC phải phân biệt được NGAY BẰNG MẮT, vì nó đổi cách người duyệt đọc
 * cả mục: nội dung sinh từ câu hỏi bệnh nhân là thứ có người đang chờ, còn nội
 * dung biên tập viên tự thêm thì không gấp bằng.
 *
 * Nên hai nhãn khác nhau ở CẢ HAI kênh — màu và hình — chứ không chỉ màu:
 * `coral` với `sand` là cam với vàng nhạt, hai màu mà người khó phân biệt màu
 * sẽ thấy gần như nhau. Biểu tượng gánh phần còn lại.
 *
 * Cỡ `question` 16px cho mọi nhãn: trên sàn 14px của chữ phụ, và đây là chữ để
 * quét mắt chứ không phải để đọc kỹ.
 *
 * TƯƠNG PHẢN: coral-deep trên coral 5.04:1, sand-deep trên sand 7.79:1,
 * mint-deep trên mint 6.72:1, white trên ink 15.39:1, slate trên white 4.96:1.
 */
import type { ReactNode } from 'react'

import { ORIGIN_LABEL, STATUS_LABEL } from '../lib/editorLabels'
import type { EditorItemOrigin, EditorItemStatus } from '../lib/schemas'
import { NoteIcon, UserIcon } from './icons'

const BADGE_BASE =
  'font-display inline-flex items-center gap-hair rounded-pill px-snug py-hair text-question font-semibold'

function Badge({
  tone,
  icon,
  children,
}: {
  tone: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <span className={`${BADGE_BASE} ${tone}`}>
      {icon}
      {children}
    </span>
  )
}

/**
 * Cặp màu của một nguồn gốc, dùng ở HAI chỗ: nhãn viên thuốc trong thẻ, và khối
 * biểu tượng vuông đứng đầu dòng.
 *
 * KHÔNG export: file component chỉ được export component thì Fast Refresh của
 * Vite mới chạy đúng — cùng lý do mà nhãn tiếng Việt phải nằm ở
 * `lib/editorLabels.ts`. Chỗ nào ngoài file này cần cặp màu nguồn gốc thì dùng
 * `OriginIconBox` hoặc `OriginBadge`, đừng lôi bảng màu ra ngoài.
 *
 * Khai một chỗ để hai chỗ không bao giờ lệch nhau. Một dòng có khối vuông màu
 * coral mà nhãn lại màu sand thì người duyệt phải dừng lại để nghĩ xem tin cái
 * nào — mà đây là danh sách để quét mắt, không phải để nghĩ.
 */
const ORIGIN_SKIN: Record<EditorItemOrigin, string> = {
  question_log: 'bg-coral text-coral-deep',
  editor_upload: 'bg-sand text-sand-deep',
}

const ORIGIN_ICON: Record<EditorItemOrigin, ReactNode> = {
  question_log: <UserIcon className="h-6 w-6" />,
  editor_upload: <NoteIcon className="h-6 w-6" />,
}

/**
 * Khối biểu tượng vuông bo góc, đứng đầu mỗi dòng của hàng đợi.
 *
 * Nó mang đúng màu của nguồn gốc, nên cả danh sách quét dọc một lượt là thấy
 * ngay dòng nào sinh từ câu hỏi bệnh nhân — thứ có người đang chờ.
 */
export function OriginIconBox({ origin }: { origin: EditorItemOrigin }) {
  return (
    <span
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-icon ${ORIGIN_SKIN[origin]}`}
    >
      {ORIGIN_ICON[origin]}
    </span>
  )
}

export function OriginBadge({ origin }: { origin: EditorItemOrigin }) {
  return (
    <Badge
      tone={ORIGIN_SKIN[origin]}
      icon={
        origin === 'question_log' ? (
          <UserIcon className="h-5 w-5 shrink-0" />
        ) : (
          <NoteIcon className="h-5 w-5 shrink-0" />
        )
      }
    >
      {ORIGIN_LABEL[origin]}
    </Badge>
  )
}

/**
 * Trạng thái trong vòng đời duyệt.
 *
 * `approved` là nhãn duy nhất dùng màu nhấn chính: nó là trạng thái cuối và
 * không thể quay lại, nên nó phải nặng hơn hẳn ba trạng thái còn lại trên cùng
 * một màn. `draft` và `pending` dùng nền canvas trung tính — chúng là việc đang
 * chạy, không phải kết luận.
 */
const STATUS_TONE: Record<EditorItemStatus, string> = {
  draft: 'bg-canvas text-slate',
  pending: 'bg-ink text-white',
  approved: 'bg-mint text-mint-deep',
  rejected: 'bg-sand text-sand-deep',
}

export function StatusBadge({ status }: { status: EditorItemStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
}

/** Thẻ chủ đề. Trung tính, chỉ có viền — nó là phân loại, không phải trạng thái. */
export function TopicTags({ topics }: { topics: readonly string[] }) {
  if (topics.length === 0) return null

  return (
    <ul className="flex flex-wrap gap-tight">
      {topics.map((topic) => (
        <li
          key={topic}
          className="font-display rounded-pill border-2 border-slate px-snug py-hair text-question text-slate"
        >
          {topic}
        </li>
      ))}
    </ul>
  )
}
