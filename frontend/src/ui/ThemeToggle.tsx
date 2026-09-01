/**
 * Ba lựa chọn sáng / tối / theo máy — LỚP `.che` CỦA BẢN MẪU.
 *
 * Bản mẫu dựng dải này trong hàm `thanhChe()` của script cuối trang: một
 * `<div class="che">` bọc ba `<button>` chỉ có biểu tượng, mỗi nút mang
 * `data-che` và một `aria-label` dạng "Dùng chế độ …". Mọi con số — ô 28px,
 * nét ngăn giữa hai ô, phép đảo nền của ô đang chọn — nằm ở `.che` trong
 * `index.css`, chép nguyên từ bản mẫu.
 *
 * BA NÚT BÀY SẴN chứ không phải một nút xoay vòng. Nút xoay vòng gọn hơn,
 * nhưng người dùng phải bấm rồi mới biết mình vừa vào trạng thái nào, và với
 * ba trạng thái thì có khi phải bấm ba lần mới quay lại chỗ cũ.
 *
 * 28px THẤP HƠN NGƯỠNG CHẠM 44px — bản mẫu cố ý như vậy, và `.che button` khai
 * `width:28px;height:28px` sau lớp `min-height:44px` toàn cục nên nó thắng. Ba
 * nút dính liền nhau thành vùng chạm gộp 84px, nằm ở góc trên bên phải, xa mọi
 * đích chạm khác — bấm trượt sang nút bên cạnh chỉ đổi chế độ hiển thị chứ
 * không gây hậu quả nào.
 *
 * `aria-pressed` chứ không phải `role="radio"`: bản mẫu dùng `aria-pressed`
 * (`b.setAttribute('aria-pressed', …)`), và nhóm radio còn đòi điều hướng bằng
 * phím mũi tên mà cả ứng dụng không có chỗ nào khác dùng lối đó.
 *
 * Nhãn chữ nằm trong `<span>` và bị `.che button span` đẩy ra khỏi luồng bằng
 * `clip-path:inset(50%)` — tức nó vẫn còn nguyên cho trình đọc màn hình, chỉ
 * không chiếm chỗ. Đây là cơ chế `sr-only` của chính bản mẫu.
 */
import {
  THEME_ARIA_LABEL,
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

/** Nhãn ngắn trong `<span>` ẩn, đúng ba chữ của bản mẫu. */
const SHORT: Record<ThemePreference, string> = {
  light: 'Sáng',
  dark: 'Tối',
  system: 'Theo máy',
}

export function ThemeToggle() {
  const { preference, setPreference } = useTheme()

  return (
    <div role="group" aria-label="Chế độ hiển thị" className="che">
      {THEME_PREFERENCES.map((option) => {
        const Icon = ICON[option]

        return (
          <button
            key={option}
            type="button"
            aria-pressed={option === preference}
            aria-label={THEME_ARIA_LABEL[option]}
            title={THEME_ARIA_LABEL[option]}
            onClick={() => setPreference(option)}
          >
            <Icon className="" />
            <span>{SHORT[option]}</span>
          </button>
        )
      })}
    </div>
  )
}
