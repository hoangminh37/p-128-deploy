/**
 * Màn tổng quan của biên tập viên, đường dẫn `/editor`.
 *
 * Chỉ hai con số, và cả hai đều bấm được. Đây là thứ người dùng nhìn đầu tiên
 * mỗi buổi, nên nó phải trả lời đúng một câu: hôm nay còn bao nhiêu việc.
 *
 * Hai con số cố ý KHÔNG gộp thành một "tổng việc cần làm": chúng là hai loại
 * việc khác nhau. `pending_count` là việc đang chờ người duyệt bấm nút, còn
 * `out_of_scope_count` là việc chưa ai bắt đầu soạn. Gộp lại sẽ giấu mất chuyện
 * cái nào đang tắc. Hai màu nhấn khác nhau — mint và coral — nói ra điều đó
 * trước cả khi người đọc kịp đọc nhãn.
 *
 * NỀN NAVY CÓ HỌA TIẾT, khác hẳn ba màn còn lại của khu vực biên tập. Đây là
 * màn DẪN DẮT: người dùng mở nó để nhìn hai con số rồi đi tiếp, không đọc gì
 * lâu ở đó. Ba màn kia — hàng đợi, duyệt chi tiết, log — là chỗ làm việc thật
 * nên chúng ở nền canvas. `RootLayout` đọc đường dẫn để chọn nền; xem ghi chú
 * `isDarkContent` ở đó.
 *
 * KHÔNG CÓ BIỂU ĐỒ BẢY NGÀY. Bản vẽ có một khối biểu đồ cột, nhưng
 * `editorDashboardSchema` (mục 8 hợp đồng) chỉ trả về đúng hai số đếm —
 * `pending_count` và `out_of_scope_count`. Không có chuỗi thời gian nào để vẽ,
 * và một biểu đồ dựng từ số bịa trên màn quản trị nội dung y khoa thì tệ hơn
 * hẳn việc không có biểu đồ. Ngày nào hợp đồng thêm trường đó thì dựng khối này
 * lại, cột bằng `div` cao theo phần trăm.
 *
 * GIỌNG CHỮ ở khu vực này khác hẳn luồng bệnh nhân: người đọc là dược sĩ hoặc
 * bác sĩ, dùng thẳng thuật ngữ được, không phải giải thích "vector store là gì".
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useEditorDashboard } from '../app/editor'
import { useSession } from '../session/context'
import { Backdrop } from '../ui/Backdrop'
import { ErrorNotice } from '../ui/ErrorNotice'
import { LibraryIcon, PlusIcon, SearchIcon } from '../ui/icons'

/**
 * Tên gọi cho lời chào, suy từ email tài khoản.
 *
 * Hợp đồng mục 3 KHÔNG có trường tên người dùng — `UserInfo` chỉ có `user_id`,
 * `email`, `role` và `patient_id`. Nên phần trước dấu `@` là tất cả những gì
 * giao diện biết chắc về cách gọi người đang đăng nhập. Không đoán thêm gì từ
 * nó: không viết hoa chữ cái đầu, không tách họ tên, không đổi dấu chấm thành
 * khoảng trắng — mọi phép đó đều có thể biến một địa chỉ hợp lệ thành một cái
 * tên sai.
 */
function accountName(email: string | undefined): string {
  if (email === undefined || email === '') return 'bạn'
  const [local] = email.split('@')
  return local === '' ? 'bạn' : local
}

/**
 * Một thẻ số liệu.
 *
 * Con số dùng bậc `metric` 44px và font Lora — cỡ lớn nhất trên màn này. Lora
 * chứ không phải mono: ở 44px con số đóng vai TIÊU ĐỀ của thẻ, không phải một
 * giá trị để đối chiếu từng chữ số, nên nó thuộc họ chữ của tiêu đề.
 *
 * `hint` là dòng ngữ cảnh bắt buộc: một con số trần không nói được nó đang là
 * tin tốt hay tin xấu, mà "12" ở hàng chờ duyệt với "12" ở log ngoài phạm vi là
 * hai tình huống đòi hai việc khác nhau.
 */
function MetricCard({
  to,
  value,
  label,
  hint,
  icon,
  tone,
}: {
  to: string
  value: number
  label: string
  hint: string
  icon: ReactNode
  /** `mint` cho hàng chờ duyệt, `coral` cho log. Mỗi màu một loại việc. */
  tone: 'mint' | 'coral'
}) {
  // Cặp nền / chữ của mỗi màu nhấn là cố định, khai ở một chỗ. Mint đi với
  // mint-deep (6.72:1), coral đi với coral-deep (5.04:1). Đừng trộn chéo.
  const skin =
    tone === 'mint'
      ? {
          card: 'bg-mint hover:bg-mint-lift',
          text: 'text-mint-deep',
          box: 'bg-mint-deep text-mint',
        }
      : {
          card: 'bg-coral hover:bg-coral-lift',
          text: 'text-coral-deep',
          box: 'bg-coral-deep text-coral',
        }

  return (
    <Link
      to={to}
      className={`motion-lift flex flex-col rounded-card-lg p-cozy no-underline ${skin.card} ${skin.text}`}
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-icon ${skin.box}`}
      >
        {icon}
      </span>

      <span className="mt-cozy text-metric font-semibold">{value}</span>
      <span className="font-display mt-hair text-input font-semibold">{label}</span>
      <span className="font-display mt-tight text-question">{hint}</span>
    </Link>
  )
}

export function EditorDashboardScreen() {
  const { data, isPending, isError, error, refetch } = useEditorDashboard()
  const { user } = useSession()

  return (
    <div className="relative isolate -mx-cozy -my-cozy overflow-hidden px-cozy py-block">
      <Backdrop />

      <div className="relative z-10">
        <div className="flex flex-wrap items-start justify-between gap-snug">
          <div className="min-w-0">
            <h1 className="text-hero font-semibold text-white">
              Chào {accountName(user?.email)}.
            </h1>
            <p className="mt-snug max-w-answer text-answer text-mist">
              Hai hàng việc của khu vực kiểm duyệt. Nội dung chỉ vào được thư
              viện mà trợ lý trích dẫn sau khi có người ở đây duyệt.
            </p>
          </div>

          <Link
            to="/editor/upload"
            className="motion-press font-display flex min-h-touch shrink-0 items-center gap-tight rounded-pill bg-mint px-cozy text-input font-bold text-ink no-underline hover:bg-mint-press"
          >
            <PlusIcon className="h-5 w-5 shrink-0" />
            Tải lên tài liệu
          </Link>
        </div>

        {isPending && (
          <p role="status" className="font-display mt-block text-notice text-mist">
            Đang đọc số liệu…
          </p>
        )}

        {isError && (
          // `ErrorNotice` là một khối nền trắng, nên nó đứng được trên nền navy
          // mà không phải có thêm một biến thể tối riêng.
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
              tone="mint"
              value={data.pending_count}
              label="Mục chờ duyệt"
              hint="Đã soạn xong, đang đợi người duyệt quyết định."
              icon={<LibraryIcon className="h-7 w-7 shrink-0" />}
            />
            <MetricCard
              to="/editor/out-of-scope"
              tone="coral"
              value={data.out_of_scope_count}
              label="Câu hỏi chưa trả lời được"
              hint="Bệnh nhân đã hỏi nhưng thư viện chưa có tài liệu, và chưa ai tạo bài."
              icon={<SearchIcon className="h-7 w-7 shrink-0" />}
            />
          </div>
        )}
      </div>
    </div>
  )
}
