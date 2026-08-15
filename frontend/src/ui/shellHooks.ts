/**
 * Hook dùng chung của lớp giao diện: thanh bên dạng ngăn kéo ở bản hẹp, và dòng
 * phản hồi thoáng qua sau khi bấm sao chép hoặc lưu.
 *
 * Tách khỏi file component để giữ Fast Refresh của Vite hoạt động đúng, cùng lối
 * mà `patient/context.ts` đang làm.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'

/**
 * Những thứ nhận được focus bên trong ngăn kéo.
 *
 * Không có `[tabindex="-1"]`: phần tử đặt tabindex âm là để code gọi focus,
 * không phải để người dùng Tab tới.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Theo dõi một media query.
 *
 * Dùng `useSyncExternalStore` chứ không dùng cặp `useState` + `useEffect`: bề
 * ngang cửa sổ là trạng thái nằm NGOÀI React, và hook này đọc thẳng giá trị
 * hiện tại ngay ở lần vẽ đầu tiên. Lối kia phải khởi tạo bằng một giá trị đoán
 * rồi sửa lại trong effect, nên trên máy tính bàn thanh bên sẽ chớp qua bản hẹp
 * trước khi về đúng chỗ.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onStoreChange)
      return () => list.removeEventListener('change', onStoreChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])

  return useSyncExternalStore(subscribe, getSnapshot)
}

/** Đủ lâu để đọc hết một câu, đủ ngắn để không đọng lại trên màn hình. */
const NOTICE_MS = 4000

/**
 * Một dòng phản hồi tự tắt sau vài giây, ví dụ "Đã sao chép nội dung".
 *
 * Trả về chuỗi rỗng chứ không phải `null` để chỗ dùng luôn dựng được phần tử
 * `role="status"`: vùng `aria-live` phải có mặt trong DOM TRƯỚC khi nội dung
 * đổi, nếu dựng ra cùng lúc với nội dung thì trình đọc màn hình không báo gì.
 */
export function useTransientNotice(): [string, (message: string) => void] {
  const [notice, setNotice] = useState('')
  const timerRef = useRef<number | null>(null)

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setNotice(''), NOTICE_MS)
  }, [])

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  return [notice, showNotice]
}

/**
 * Khóa cuộn trang nền khi ngăn kéo đang mở.
 *
 * Không đặt `overflow: hidden` vĩnh viễn mà nhớ lại giá trị cũ rồi trả về: nếu
 * chỗ khác cũng đang khóa cuộn, ghi đè bằng chuỗi rỗng sẽ mở khóa nhầm.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return

    const { body } = document
    const previous = body.style.overflow
    body.style.overflow = 'hidden'

    return () => {
      body.style.overflow = previous
    }
  }, [active])
}

/**
 * Bẫy focus trong ngăn kéo, thoát bằng phím Escape.
 *
 * Ngăn kéo đè lên nội dung nên nội dung phía sau coi như không tồn tại: Tab đi
 * hết phần tử cuối phải quay về phần tử đầu, chứ không được chui xuống dưới lớp
 * phủ — người dùng bàn phím mà lạc ra ngoài thì không còn đường quay lại.
 *
 * `onEscape` phải là hàm ổn định (bọc `useCallback`), nếu không effect sẽ gỡ và
 * gắn lại listener sau mỗi lần vẽ, kéo theo việc focus bị đưa về đầu ngăn kéo.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onEscape: () => void,
): void {
  useEffect(() => {
    if (!active) return

    const container = containerRef.current
    if (container === null) return

    // Nhớ chỗ đang đứng để lúc đóng trả focus về đúng nút vừa mở ngăn kéo.
    const previouslyFocused = document.activeElement

    // Hàm mũi tên chứ không phải khai báo `function`: khai báo bị nâng lên đầu
    // khối nên TypeScript coi nó được tạo TRƯỚC lúc `container` được thu hẹp
    // kiểu, và lại bắt phải kiểm `null` thêm một lần nữa bên trong.
    const focusableItems = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))

    focusableItems()[0]?.focus()

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscape()
        return
      }

      if (event.key !== 'Tab') return

      const items = focusableItems()
      if (items.length === 0) {
        event.preventDefault()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      const isInside = current !== null && container.contains(current)

      if (event.shiftKey) {
        if (!isInside || current === first) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (!isInside || current === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus()
      }
    }
  }, [active, containerRef, onEscape])
}
