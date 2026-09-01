/**
 * Bảy mục điều hướng của khu vực biên tập, thay chỗ danh sách hội thoại.
 *
 * Ba mục có số đi kèm, lấy từ chính query dashboard mà màn tổng quan dùng —
 * cùng một khóa cache, nên mở màn tổng quan xong quay ra thanh bên sẽ không có
 * thêm request nào, và duyệt một mục là cả hai chỗ cùng đổi số.
 *
 * Số chỉ hiện khi ĐÃ có dữ liệu. Hiện `0` trong lúc đang tải là nói dối: biên
 * tập viên nhìn thấy "Hàng đợi duyệt 0" rồi bỏ đi làm việc khác, trong khi thật
 * ra đang có mười hai mục chờ.
 *
 * DỰNG TỪ BẢN MẪU. Script dựng khung ở cuối `docs/design/eduhealth-ai.html`
 * khai đúng bảy mục này, đúng thứ tự này, và đặt số đếm trong
 * `<span class="n">` — ví dụ `['bth','Hàng đợi duyệt','07',…]`. Nhãn chữ lấy
 * nguyên văn của bản mẫu; con số thì lấy từ dữ liệu thật.
 *
 * Bản mẫu đệm số về hai chữ số (`07`, `04`, `23`). Giữ nguyên cách đệm đó: nó
 * làm cột số bên phải thẳng hàng khi quét dọc, và `tabular-nums` khai toàn cục
 * lo phần bề ngang chữ số. Từ 100 trở lên thì số tự dài ra, không cắt.
 *
 * Mục đang mở đánh dấu bằng `aria-current="page"`; nét tím ở lề trái do
 * `.side nav a[aria-current="page"]` trong `index.css` lo.
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
    <nav aria-label="Khu vực biên tập">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate}>
          <span>{item.label}</span>
          {/* `.n` của bản mẫu: mono, cỡ `--t-mono-s`, `--xam`, chuyển tím khi
              mục đang mở. Số chỉ hiện khi ĐÃ có dữ liệu — hiện `0` trong lúc
              đang tải là nói dối: biên tập viên nhìn thấy "Hàng đợi duyệt 0"
              rồi bỏ đi làm việc khác, trong khi thật ra đang có mười hai mục. */}
          {item.count !== undefined && (
            <span className="n">{String(item.count).padStart(2, '0')}</span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
