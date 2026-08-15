/**
 * Hai loại nhãn của hàng đợi duyệt: nguồn gốc và trạng thái.
 *
 * NGUỒN GỐC phải phân biệt được NGAY BẰNG MẮT, vì nó đổi cách người duyệt đọc
 * cả mục: nội dung sinh từ câu hỏi bệnh nhân là thứ có người đang chờ, còn nội
 * dung biên tập viên tự thêm thì không gấp bằng.
 *
 * Nên hai nhãn khác nhau ở CẢ HAI kênh — màu và hình — chứ không chỉ màu:
 * `medical` với `moss` là xanh lá đậm với xám xanh, hai màu mà người khó phân
 * biệt màu sẽ thấy gần như nhau. Biểu tượng gánh phần còn lại.
 *
 * Cỡ `question` 16px cho mọi nhãn: trên sàn 15px, và đây là chữ để quét mắt
 * chứ không phải để đọc kỹ.
 */
import type { ReactNode } from 'react'

import { ORIGIN_LABEL, STATUS_LABEL } from '../lib/editorLabels'
import type { EditorItemOrigin, EditorItemStatus } from '../lib/schemas'
import { NoteIcon, UserIcon } from './icons'

const BADGE_BASE =
  'font-display inline-flex items-center gap-hair rounded-full px-snug py-hair text-question'

function Badge({ tone, icon, children }: { tone: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`${BADGE_BASE} ${tone}`}>
      {icon}
      {children}
    </span>
  )
}

export function OriginBadge({ origin }: { origin: EditorItemOrigin }) {
  if (origin === 'question_log') {
    return (
      <Badge
        tone="bg-medical/10 text-medical"
        icon={<UserIcon className="h-5 w-5 shrink-0" />}
      >
        {ORIGIN_LABEL.question_log}
      </Badge>
    )
  }

  return (
    <Badge tone="bg-moss/10 text-moss" icon={<NoteIcon className="h-5 w-5 shrink-0" />}>
      {ORIGIN_LABEL.editor_upload}
    </Badge>
  )
}

/**
 * Trạng thái trong vòng đời duyệt.
 *
 * `approved` là nhãn duy nhất dùng nền đặc: nó là trạng thái cuối và không thể
 * quay lại, nên nó phải nặng hơn hẳn ba trạng thái còn lại trên cùng một màn.
 */
const STATUS_TONE: Record<EditorItemStatus, string> = {
  draft: 'bg-moss/10 text-moss',
  pending: 'bg-medical/10 text-medical',
  approved: 'bg-medical text-paper',
  rejected: 'bg-refuse/10 text-refuse',
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
          className="font-display rounded-full border border-border px-snug py-hair text-question text-moss"
        >
          {topic}
        </li>
      ))}
    </ul>
  )
}
