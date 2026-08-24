/**
 * Giữ lựa chọn sáng/tối và đồng bộ nó với thẻ `<html>`.
 *
 * KHÔNG dựng lại trạng thái từ đầu lúc gắn: đoạn script đồng bộ ở `index.html`
 * đã đặt xong `data-theme` trước khi React vẽ khung hình đầu tiên. Provider chỉ
 * đọc lại cùng một khóa localStorage để biết người dùng đang chọn gì, rồi từ đó
 * về sau nó là nơi duy nhất ghi thuộc tính ấy.
 *
 * HAI THỨ LÀM ĐỔI GIAO DIỆN, và cả hai đều đi qua đây:
 *
 *   1. Người dùng bấm nút chuyển   → `setPreference`.
 *   2. Hệ điều hành đổi chế độ     → listener `matchMedia`, và CHỈ có tác dụng
 *      khi lựa chọn đang là `system`. Người đã chọn tay `Sáng` thì máy có
 *      chuyển sang tối lúc 6 giờ chiều cũng không được đụng vào màn hình họ.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  applyTheme,
  DARK_MEDIA_QUERY,
  readStoredThemePreference,
  resolveTheme,
  storeThemePreference,
  type ThemePreference,
} from './theme'
import { ThemeContext, type ThemeContextValue } from './themeContext'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    // Hàm khởi tạo state chứ không phải giá trị: đọc localStorage là việc chỉ
    // được làm một lần, không phải mỗi lần vẽ lại.
    readStoredThemePreference,
  )

  /**
   * Kết quả đã giải ra.
   *
   * Giữ trong state chứ không tính lại mỗi lần vẽ, vì `prefersDark()` đọc
   * `matchMedia` — một thứ bên ngoài React, có thể đổi bất cứ lúc nào. Để nó
   * trong state thì mọi lần đổi đều đi qua một đường duy nhất và React biết
   * phải vẽ lại.
   */
  const [resolved, setResolved] = useState(() => resolveTheme(preference))

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    storeThemePreference(next)
    const nextResolved = resolveTheme(next)
    setResolved(nextResolved)
    applyTheme(nextResolved)
  }, [])

  useEffect(() => {
    // Chỉ chế độ `system` mới quan tâm hệ điều hành đang để gì.
    if (preference !== 'system') return

    const media = window.matchMedia(DARK_MEDIA_QUERY)

    function sync(): void {
      const next = media.matches ? 'dark' : 'light'
      setResolved(next)
      applyTheme(next)
    }

    // Chạy một lần ngay: giữa lúc script ở `index.html` chạy và lúc effect này
    // gắn, hệ điều hành có thể đã đổi chế độ (người dùng vừa bật chế độ tối
    // theo giờ, hoặc trang được khôi phục từ bfcache).
    sync()

    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [preference])

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}
