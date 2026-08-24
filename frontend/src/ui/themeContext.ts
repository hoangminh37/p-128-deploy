/**
 * Context của chế độ sáng/tối.
 *
 * Tách khỏi `ThemeProvider.tsx` để file provider chỉ export component, giữ Fast
 * Refresh của Vite chạy đúng — cùng lối mà `session/context.ts` đang dùng.
 */
import { createContext, useContext } from 'react'

import type { ResolvedTheme, ThemePreference } from './theme'

export type ThemeContextValue = {
  /** Lựa chọn của người dùng: `light`, `dark`, hoặc `system`. */
  preference: ThemePreference
  /** Kết quả đã giải ra — cũng chính là `data-theme` đang gắn trên `<html>`. */
  resolved: ResolvedTheme
  setPreference: (next: ThemePreference) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (value === null) {
    throw new Error('useTheme phải được gọi bên trong <ThemeProvider>.')
  }
  return value
}
