/**
 * Chế độ sáng/tối: ba lựa chọn, hai giá trị thật.
 *
 * NGƯỜI DÙNG chọn một trong ba: `light`, `dark`, `system`. Mặc định là
 * `system`, tức đi theo cài đặt của hệ điều hành.
 *
 * TRANG chỉ bao giờ mang một trong hai: `data-theme="light"` hoặc
 * `data-theme="dark"` trên thẻ `<html>`. Lựa chọn `system` được GIẢI ra thành
 * một trong hai ngay lúc đọc, chứ không truyền nguyên xuống CSS.
 *
 * Vì sao giải sớm: nếu để CSS tự lo `system` thì phải viết hai khối token —
 * một cho `[data-theme='dark']`, một cho `@media (prefers-color-scheme: dark)`
 * — với cùng một danh sách hơn mười biến. Hai bản danh sách thì sớm muộn cũng
 * lệch nhau, mà lệch ở đây nghĩa là một cặp màu chữ nào đó tụt dưới ngưỡng
 * tương phản mà không ai biết. Giải sớm thì CSS chỉ có đúng một khối.
 *
 * Đổi lại, chế độ tối phụ thuộc JavaScript. Chấp nhận được: đây là ứng dụng
 * React thuần, không có JS thì không có gì để hiển thị cả.
 *
 * File này KHÔNG export component nào, để `ThemeProvider.tsx` giữ được Fast
 * Refresh của Vite — cùng lối mà `session/context.ts` đang dùng.
 */
import { STORAGE_PREFIX } from '../session/context'

/** Ba lựa chọn của người dùng. */
export type ThemePreference = 'light' | 'dark' | 'system'

/** Hai giá trị thật của trang. */
export type ResolvedTheme = 'light' | 'dark'

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'light',
  'dark',
  'system',
]

/**
 * Khóa localStorage.
 *
 * Dùng chung tiền tố `tro-ly-suc-khoe:` với phiên đăng nhập, nhưng KHÔNG bị xoá
 * khi đăng xuất — xem ghi chú ở `clearStoredSession` trong `SessionProvider`.
 * Chế độ hiển thị là thiết lập của CÁI MÁY này, không phải của tài khoản.
 *
 * CẢNH BÁO: chuỗi này còn được gõ lại một lần nữa trong đoạn script đồng bộ ở
 * `index.html` (script thường thì không import được). Đổi ở đây thì đổi cả ở đó.
 */
export const THEME_STORAGE_KEY = `${STORAGE_PREFIX}theme`

/** Media query duy nhất mà chế độ `system` hỏi tới. */
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

/**
 * Đọc lựa chọn đã lưu.
 *
 * Mọi giá trị lạ đều rơi về `system` — kể cả chuỗi do người dùng tự sửa bằng
 * devtools. Không ném lỗi, vì một thiết lập hiển thị hỏng không được phép chặn
 * cả ứng dụng.
 */
export function readStoredThemePreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    return raw === 'light' || raw === 'dark' ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function storeThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') {
      // Không lưu `system`: vắng mặt CHÍNH LÀ `system`. Nhờ vậy một máy chưa
      // từng chọn gì và một máy vừa chọn lại "theo hệ điều hành" cho ra cùng
      // một trạng thái, không có hai đường dẫn tới cùng một kết quả.
      window.localStorage.removeItem(THEME_STORAGE_KEY)
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference)
    }
  } catch {
    // Không ghi được thì lựa chọn chỉ sống trong phiên này. Vẫn hơn là ném lỗi.
  }
}

/** Hệ điều hành đang để chế độ tối hay không. */
export function prefersDark(): boolean {
  try {
    return window.matchMedia(DARK_MEDIA_QUERY).matches
  } catch {
    return false
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return prefersDark() ? 'dark' : 'light'
  return preference
}

/**
 * Gắn kết quả lên thẻ `<html>`.
 *
 * Đây là chỗ DUY NHẤT trong mã TypeScript được phép đụng vào `data-theme`.
 * Chỗ còn lại là đoạn script đồng bộ ở `index.html`, chạy trước khi React dựng.
 */
export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolved)
}

/** Nhãn tiếng Việt của ba lựa chọn, dùng cho `aria-label` và cho chữ trên nút. */
export const THEME_LABEL: Record<ThemePreference, string> = {
  light: 'Sáng',
  dark: 'Tối',
  system: 'Theo máy',
}

/** Câu đầy đủ cho trình đọc màn hình — nhãn ngắn phía trên không đủ rõ một mình. */
export const THEME_ARIA_LABEL: Record<ThemePreference, string> = {
  light: 'Dùng chế độ sáng',
  dark: 'Dùng chế độ tối',
  system: 'Dùng chế độ theo cài đặt của máy',
}
