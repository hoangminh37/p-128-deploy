/**
 * Màn tổng quan của biên tập viên, đường dẫn `/editor`.
 *
 * Chỉ hai con số, và cả hai đều bấm được. Đây là thứ người dùng nhìn đầu tiên
 * mỗi buổi, nên nó phải trả lời đúng một câu: hôm nay còn bao nhiêu việc.
 *
 * Hai con số cố ý KHÔNG gộp thành một "tổng việc cần làm": chúng là hai loại
 * việc khác nhau. `pending_count` là việc đang chờ người duyệt bấm nút, còn
 * `out_of_scope_count` là việc chưa ai bắt đầu soạn. Gộp lại sẽ giấu mất chuyện
 * cái nào đang tắc.
 *
 * GIỌNG CHỮ ở khu vực này khác hẳn luồng bệnh nhân: người đọc là dược sĩ hoặc
 * bác sĩ, dùng thẳng thuật ngữ được, không phải giải thích "vector store là gì".
 */
import { Link } from 'react-router-dom'

import { useEditorDashboard } from '../app/editor'
import { ErrorNotice } from '../ui/ErrorNotice'
import { LibraryIcon, SearchIcon } from '../ui/icons'

/**
 * Một khối số.
 *
 * Con số dùng bậc `ask` 26px — bậc lớn nhất của cả thang — cộng font mono. Mono
 * cho chữ số đều bề ngang, nên hai khối cạnh nhau không bị lệch nhịp khi một
 * bên là 8 còn bên kia là 12.
 */
function MetricCard({
  to,
  value,
  label,
  hint,
  icon,
}: {
  to: string
  value: number
  label: string
  hint: string
  icon: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="flex min-h-touch flex-col rounded-lg border-2 border-border p-cozy no-underline"
    >
      <span className="flex items-center gap-tight text-medical">
        {icon}
        <span className="font-mono text-ask font-bold">{value}</span>
      </span>

      <span className="font-display mt-tight text-input font-semibold text-ink">
        {label}
      </span>
      <span className="font-display mt-hair text-question text-moss">{hint}</span>
    </Link>
  )
}

export function EditorDashboardScreen() {
  const { data, isPending, isError, error, refetch } = useEditorDashboard()

  return (
    <div className="max-w-reading">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-ask font-bold">Tổng quan</h1>
        <Link
          to="/editor/upload"
          className="rounded-lg bg-medical px-4 py-2 font-medium text-white hover:bg-opacity-90 no-underline"
        >
          + Tải lên tài liệu
        </Link>
      </div>
      <p className="mt-snug max-w-answer text-notice text-ink">
        Hai hàng việc của khu vực kiểm duyệt. Nội dung chỉ vào được thư viện mà
        trợ lý trích dẫn sau khi có người ở đây duyệt.
      </p>

      {isPending && (
        <p role="status" className="font-display mt-block text-notice text-moss">
          Đang đọc số liệu…
        </p>
      )}

      {isError && (
        <div className="mt-block">
          <ErrorNotice
            error={error}
            retryLabel="Đọc lại số liệu"
            onRetry={() => void refetch()}
          />
        </div>
      )}

      {data !== undefined && (
        <div className="mt-block grid gap-cozy sm:grid-cols-2">
          <MetricCard
            to="/editor/queue"
            value={data.pending_count}
            label="Mục chờ duyệt"
            hint="Đã soạn xong, đang đợi người duyệt quyết định."
            icon={<LibraryIcon className="h-7 w-7 shrink-0" />}
          />
          <MetricCard
            to="/editor/out-of-scope"
            value={data.out_of_scope_count}
            label="Câu hỏi chưa trả lời được"
            hint="Bệnh nhân đã hỏi nhưng thư viện chưa có tài liệu, và chưa ai tạo bài."
            icon={<SearchIcon className="h-7 w-7 shrink-0" />}
          />
        </div>
      )}
    </div>
  )
}
