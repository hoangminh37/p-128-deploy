/**
 * Ba lựa chọn sáng / tối / theo máy, dạng ba nút liền nhau trong một viên thuốc.
 *
 * BA NÚT BÀY SẴN chứ không phải một nút xoay vòng. Nút xoay vòng gọn hơn,
 * nhưng người dùng phải bấm rồi mới biết mình vừa vào trạng thái nào, và với ba
 * trạng thái thì có khi phải bấm ba lần mới quay lại chỗ cũ. Người đọc ở đây
 * 45–70 tuổi; bày cả ba ra thì họ thấy ngay đang ở đâu và bấm thẳng vào cái
 * mình muốn.
 *
 * MỖI NÚT CÓ CẢ HÌNH LẪN CHỮ. Hình một mình thì mặt trăng với màn hình máy tính
 * không tự nói ra nghĩa của chúng — nhất là lựa chọn "theo máy". Chữ ẩn đi ở
 * bản hẹp để ba nút vẫn lọt thanh tiêu đề, nhưng `aria-label` thì luôn đầy đủ
 * bằng một câu hoàn chỉnh, không phải một từ.
 *
 * `aria-pressed` chứ không phải `role="radio"`: nhóm radio đòi điều hướng bằng
 * phím mũi tên, mà cả ứng dụng này không có chỗ nào khác dùng lối đó. Ba nút
 * `aria-pressed` đi bằng phím Tab như mọi nút khác, và đó cũng đúng lối mà bộ
 * lọc ở màn hàng đợi đang dùng.
 *
 * MÀU. Nút đang chọn dùng nền `mint` chữ `ink` (7.95:1) ở CẢ HAI chế độ, chứ
 * không dùng nền `ink` như bộ lọc hàng đợi: ở chế độ tối, `ink` trên `surface`
 * chỉ chênh 1.21:1 nên trạng thái chọn gần như biến mất. `mint` thì nổi ở cả
 * hai — 1.94:1 trên nền trắng và 6.56:1 trên nền tối — và nó còn đảo hẳn màu
 * chữ, nên trạng thái đọc ra được kể cả khi không phân biệt được màu.
 */
import {
  THEME_ARIA_LABEL,
  THEME_LABEL,
  THEME_PREFERENCES,
  type ThemePreference,
} from './theme'
import { useTheme } from './themeContext'
import { MoonIcon, SunIcon, SystemIcon } from './icons'

const ICON: Record<ThemePreference, typeof SunIcon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: SystemIcon,
}

/**
 * Hai bộ màu, chọn theo nền mà nút đang đứng lên.
 *
 *   `surface` — thanh tiêu đề của khung ứng dụng ở họ nền làm việc.
 *   `shell`   — thanh điều hướng trang giới thiệu, và thanh tiêu đề của màn
 *               tổng quan biên tập. Cả hai đều là nền navy đặc.
 */
const TONE = {
  surface: {
    frame: 'bg-surface',
    idle: 'text-slate',
    active: 'bg-mint text-ink',
  },
  shell: {
    frame: 'bg-white/10',
    idle: 'text-mist',
    active: 'bg-mint text-ink',
  },
} as const

export function ThemeToggle({ tone = 'surface' }: { tone?: keyof typeof TONE }) {
  const { preference, setPreference } = useTheme()
  const skin = TONE[tone]

  return (
    <div
      role="group"
      aria-label="Chế độ hiển thị"
      className={`flex shrink-0 items-center gap-hair rounded-pill p-hair ${skin.frame}`}
    >
      {THEME_PREFERENCES.map((option) => {
        const Icon = ICON[option]
        const isActive = option === preference

        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            aria-label={THEME_ARIA_LABEL[option]}
            title={THEME_ARIA_LABEL[option]}
            onClick={() => setPreference(option)}
            className={`motion-press flex min-h-touch items-center gap-hair rounded-pill px-snug text-note font-semibold ${
              isActive ? skin.active : skin.idle
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {/* Chữ ẩn ở bản hẹp, nhưng `aria-label` trên nút thì không đổi —
                trình đọc màn hình luôn nghe được câu đầy đủ. */}
            <span className="hidden sm:inline">{THEME_LABEL[option]}</span>
          </button>
        )
      })}
    </div>
  )
}
