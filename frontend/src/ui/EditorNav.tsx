/**
 * Ba mục điều hướng của khu vực biên tập, thay chỗ danh sách hội thoại.
 *
 * Hai mục có số đi kèm, lấy từ chính query dashboard mà màn tổng quan dùng —
 * cùng một khóa cache, nên mở màn tổng quan xong quay ra thanh bên sẽ không có
 * thêm request nào, và duyệt một mục là cả hai chỗ cùng đổi số.
 *
 * Số chỉ hiện khi ĐÃ có dữ liệu. Hiện `0` trong lúc đang tải là nói dối: biên
 * tập viên nhìn thấy "Hàng đợi duyệt 0" rồi bỏ đi làm việc khác, trong khi thật
 * ra đang có mười hai mục chờ.
 */
import { NavLink } from 'react-router-dom'

import { useEditorDashboard } from '../app/editor'

type NavItem = {
  to: string
  label: string
  /** `true` thì chỉ khớp đúng đường dẫn này, không khớp các nhánh con. */
  end?: boolean
  count?: number
}

export function EditorNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useEditorDashboard()

  const items: NavItem[] = [
    { to: '/editor', label: 'Tổng quan', end: true },
    { to: '/editor/conditions', label: 'Danh mục bệnh' },
    { to: '/editor/doctors', label: 'Quản lý bác sỹ' },
    { to: '/editor/documents', label: 'Tài liệu nguồn' },
    { to: '/editor/queue', label: 'Hàng đợi duyệt', count: data?.pending_count },
    { to: '/editor/patient-questions', label: 'Yêu cầu phản hồi', count: data?.patient_question_count },
    {
      to: '/editor/out-of-scope',
      label: 'Câu hỏi chưa trả lời được',
      count: data?.out_of_scope_count,
    },
  ]

  return (
    // `min-h-0` là bắt buộc: thiếu nó thì flex item không co lại được và khối
    // tài khoản ở đáy bị đẩy ra khỏi màn hình.
    <nav
      aria-label="Khu vực biên tập"
      className="min-h-0 flex-1 overflow-y-auto px-tight pt-snug"
    >
      <ul className="space-y-hair">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                // Cùng ngôn ngữ hình với danh sách hội thoại: nền trắng mờ cộng
                // chữ sáng lên. Xem ghi chú màu ở đầu `ConversationNav.tsx`.
                `font-display flex min-h-touch items-center gap-tight rounded-icon px-snug py-tight text-question no-underline ${
                  isActive
                    ? 'bg-white/10 font-semibold text-white hover:bg-white/15'
                    : 'text-mist hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="min-w-0 flex-1">{item.label}</span>

              {/* Nền mint đặc chứ không phải nền mờ: con số này là thứ biên
                  tập viên quét mắt tìm, và mint / ink đạt 7.95:1. */}
              {item.count !== undefined && (
                <span className="font-mono shrink-0 rounded-pill bg-mint px-snug text-question font-semibold text-ink">
                  {item.count}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
