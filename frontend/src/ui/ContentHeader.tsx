/**
 * Thanh tiêu đề của vùng nội dung. Hai bố cục khác hẳn nhau theo bề ngang.
 *
 * Từ 1024px: tên hội thoại đang mở ở trái, hai nút biểu tượng sao chép và lưu ở
 * phải. Thanh bên đã thường trực nên ở đây không cần nút menu.
 *
 * Dưới 1024px: nút menu ở trái, tên bệnh chính ở giữa, nút thêm câu hỏi ở phải.
 * Ba thứ, mỗi thứ một góc — thanh hẹp không đủ chỗ cho tên hội thoại lẫn hai nút
 * hành động, mà thứ người dùng cần biết nhất khi màn hình bé là câu trả lời đang
 * được đặt trong ngữ cảnh bệnh nào.
 *
 * SAO CHÉP và LƯU đọc thẳng chữ đang hiện trong vùng nội dung, không dựng lại
 * bản ghi từ dữ liệu API. Lý do: một hội thoại vừa mở còn chưa được lưu ở máy
 * chủ, mà người dùng vẫn phải sao chép được câu trả lời để đưa bác sĩ xem.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { Link } from 'react-router-dom'

import { CopyIcon, MenuIcon, PlusIcon, SaveIcon } from './icons'

/** Đủ lâu để đọc hết một câu, đủ ngắn để không đọng lại trên thanh tiêu đề. */
const NOTICE_MS = 4000

/**
 * Lấy chữ đang hiện trong vùng nội dung.
 *
 * Dùng `innerText` chứ không `textContent`: `innerText` theo bố cục thật nên giữ
 * được ngắt dòng giữa các đoạn, còn `textContent` sẽ dồn cả câu trả lời thành
 * một khối chữ liền không đọc nổi.
 *
 * Phần `sr-only` bị tắt tạm ngay trước khi đọc. Những chuỗi như "(nguồn 1)" hay
 * "mở tài liệu gốc" là để trình đọc màn hình phát ra thành lời, chép vào một
 * tệp văn bản thì chỉ làm rối. Tắt rồi bật lại trong cùng một lượt xử lý sự kiện
 * nên trình duyệt không kịp vẽ lại — người dùng không thấy gì nhấp nháy.
 */
function readTranscript(root: HTMLElement | null): string {
  if (root === null) return ''

  const hidden = Array.from(root.querySelectorAll<HTMLElement>('.sr-only'))
  const previous = hidden.map((element) => element.style.display)
  for (const element of hidden) {
    element.style.display = 'none'
  }

  const text = root.innerText

  hidden.forEach((element, index) => {
    element.style.display = previous[index]
  })

  // Gộp các dòng trống liên tiếp lại còn một, giữ nhịp đoạn mà không để tệp
  // đầy khoảng trắng.
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

/** Tên tệp khi lưu: ngày tháng để người dùng xếp được nhiều lần lưu theo thứ tự. */
function transcriptFileName(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `hoi-thoai-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.txt`
}

/**
 * Nút chỉ có biểu tượng.
 *
 * Viền `border` (3.29:1) chứ không phải `rule`: đây là thành phần tương tác nên
 * ranh giới của nó phải nhìn thấy được. `aria-label` là bắt buộc — hình vẽ bên
 * trong đã `aria-hidden` nên không có nhãn thì nút hoàn toàn câm.
 */
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-lg border-2 border-border bg-paper text-ink"
    >
      {children}
    </button>
  )
}

export function ContentHeader({
  isDesktop,
  title,
  conditionLabel,
  isDrawerOpen,
  onOpenMenu,
  contentRef,
}: {
  isDesktop: boolean
  /** Tên hội thoại đang mở, hiện ở bản rộng. */
  title: string
  /** Tên bệnh chính, hiện ở giữa thanh tiêu đề bản hẹp. */
  conditionLabel: string
  isDrawerOpen: boolean
  onOpenMenu: () => void
  /** Vùng nội dung mà hai nút sao chép và lưu đọc chữ từ đó. */
  contentRef: RefObject<HTMLElement | null>
}) {
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

  async function handleCopy(): Promise<void> {
    const text = readTranscript(contentRef.current)
    if (text === '') {
      showNotice('Chưa có nội dung để sao chép.')
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      showNotice('Đã sao chép nội dung.')
    } catch {
      // Trình duyệt chặn clipboard khi trang không chạy trên HTTPS, hoặc người
      // dùng đã từ chối quyền. Phải nói ra, chứ bấm mà im lặng thì người dùng
      // tưởng đã chép được rồi dán ra chỗ khác mới biết là không.
      showNotice('Trình duyệt không cho phép sao chép.')
    }
  }

  function handleSave(): void {
    const text = readTranscript(contentRef.current)
    if (text === '') {
      showNotice('Chưa có nội dung để lưu.')
      return
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = transcriptFileName()
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)

    showNotice('Đã lưu về máy.')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper">
      <div className="mx-auto flex w-full max-w-answer items-center gap-tight px-cozy py-tight lg:max-w-reading">
        {isDesktop ? (
          <>
            {/* Dùng `p` chứ không dùng `h1`: mỗi màn hình đã có `h1` của riêng
                nó, thêm một cái nữa ở khung ngoài là hai tiêu đề cấp một. */}
            <p className="font-display min-w-0 flex-1 truncate text-app font-bold">
              {title}
            </p>

            <div className="flex min-w-0 items-center gap-tight">
              {/* Luôn có mặt trong DOM để `aria-live` báo được thay đổi. */}
              <p
                role="status"
                className="font-display min-w-0 truncate text-note text-moss"
              >
                {notice}
              </p>

              <IconButton label="Sao chép nội dung" onClick={() => void handleCopy()}>
                <CopyIcon className="h-6 w-6" />
              </IconButton>

              <IconButton label="Lưu nội dung về máy" onClick={handleSave}>
                <SaveIcon className="h-6 w-6" />
              </IconButton>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Mở thanh bên"
              aria-haspopup="dialog"
              aria-expanded={isDrawerOpen}
              className="flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-lg border-2 border-border bg-paper text-ink"
            >
              <MenuIcon className="h-6 w-6" />
            </button>

            <p className="font-display min-w-0 flex-1 truncate text-center text-app font-bold">
              {conditionLabel}
            </p>

            <Link
              to="/chat"
              aria-label="Câu hỏi mới"
              title="Câu hỏi mới"
              className="flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-lg border-2 border-medical bg-medical text-paper no-underline"
            >
              <PlusIcon className="h-6 w-6" />
            </Link>
          </>
        )}
      </div>
    </header>
  )
}
