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
import type { ReactNode, RefObject } from 'react'
import { Link } from 'react-router-dom'

import { copyTextToClipboard, downloadText } from '../lib/transcript'
import { CopyIcon, MenuIcon, PlusIcon, SaveIcon } from './icons'
import { useTransientNotice } from './shellHooks'

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

/**
 * Nút chỉ có biểu tượng.
 *
 * Nền đặc chứ không phải viền mảnh: trên nền `canvas` thì khối trắng đã đủ
 * tách, trên nền `ink` thì khối trắng mờ 10% cho ra #233B58 và biểu tượng
 * trắng trên đó đạt 11.43:1. Cách nào cũng vượt xa ngưỡng 3:1 cho ranh giới
 * thành phần tương tác, mà không phải kẻ thêm nét nào.
 *
 * `aria-label` là bắt buộc — hình vẽ bên trong đã `aria-hidden` nên không có
 * nhãn thì nút hoàn toàn câm.
 */
function IconButton({
  label,
  isDark,
  onClick,
  children,
}: {
  label: string
  isDark: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`motion-press flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-icon ${
        isDark
          ? 'bg-white/10 text-white enabled:hover:bg-white/15'
          : 'bg-white text-ink enabled:hover:bg-canvas'
      }`}
    >
      {children}
    </button>
  )
}

export function ContentHeader({
  isDesktop,
  isDark,
  title,
  conditionLabel,
  isDrawerOpen,
  onOpenMenu,
  contentRef,
}: {
  isDesktop: boolean
  /** Vùng nội dung đang dùng nền navy hay nền canvas. Xem `RootLayout`. */
  isDark: boolean
  /** Tên hội thoại đang mở, hiện ở bản rộng. */
  title: string
  /** Tên bệnh chính, hiện ở giữa thanh tiêu đề bản hẹp. */
  conditionLabel: string
  isDrawerOpen: boolean
  onOpenMenu: () => void
  /** Vùng nội dung mà hai nút sao chép và lưu đọc chữ từ đó. */
  contentRef: RefObject<HTMLElement | null>
}) {
  const [notice, showNotice] = useTransientNotice()

  async function handleCopy(): Promise<void> {
    const text = readTranscript(contentRef.current)
    if (text === '') {
      showNotice('Chưa có nội dung để sao chép.')
      return
    }

    const copied = await copyTextToClipboard(text)
    showNotice(copied ? 'Đã sao chép nội dung.' : 'Trình duyệt không cho phép sao chép.')
  }

  function handleSave(): void {
    const text = readTranscript(contentRef.current)
    if (text === '') {
      showNotice('Chưa có nội dung để lưu.')
      return
    }

    downloadText(text)
    showNotice('Đã lưu về máy.')
  }

  return (
    // Nền phải trùng nền vùng nội dung, nếu không chữ cuộn qua phía dưới sẽ lộ
    // ra. Bo góc trái trên đi cùng với tấm canvas của `RootLayout` — thanh tiêu
    // đề là dòng đầu tiên của chính tấm đó, không phải một dải riêng đè lên nó.
    <header
      className={`sticky top-0 z-30 lg:rounded-tl-card-lg ${
        isDark ? 'bg-ink' : 'border-b border-line bg-canvas'
      }`}
    >
      <div
        className={`mx-auto flex w-full items-center gap-tight px-cozy py-tight ${
          isDark ? 'max-w-page' : 'max-w-answer lg:max-w-reading'
        }`}
      >
        {isDesktop ? (
          <>
            {/* Dùng `p` chứ không dùng `h1`: mỗi màn hình đã có `h1` của riêng
                nó, thêm một cái nữa ở khung ngoài là hai tiêu đề cấp một. */}
            <p
              className={`font-display min-w-0 flex-1 truncate text-app font-bold ${
                isDark ? 'text-white' : 'text-ink'
              }`}
            >
              {title}
            </p>

            <div className="flex min-w-0 items-center gap-tight">
              {/* Luôn có mặt trong DOM để `aria-live` báo được thay đổi. */}
              <p
                role="status"
                className={`font-display min-w-0 truncate text-note ${
                  isDark ? 'text-mist' : 'text-slate'
                }`}
              >
                {notice}
              </p>

              <IconButton
                label="Sao chép nội dung"
                isDark={isDark}
                onClick={() => void handleCopy()}
              >
                <CopyIcon className="h-6 w-6" />
              </IconButton>

              <IconButton
                label="Lưu nội dung về máy"
                isDark={isDark}
                onClick={handleSave}
              >
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
              className={`motion-press flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-icon ${
                isDark
                  ? 'bg-white/10 text-white enabled:hover:bg-white/15'
                  : 'bg-white text-ink enabled:hover:bg-canvas'
              }`}
            >
              <MenuIcon className="h-6 w-6" />
            </button>

            <p
              className={`font-display min-w-0 flex-1 truncate text-center text-app font-bold ${
                isDark ? 'text-white' : 'text-ink'
              }`}
            >
              {conditionLabel}
            </p>

            <Link
              to="/chat"
              aria-label="Câu hỏi mới"
              title="Câu hỏi mới"
              className="motion-press flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-pill bg-mint text-ink no-underline hover:bg-mint-press"
            >
              <PlusIcon className="h-6 w-6" />
            </Link>
          </>
        )}
      </div>
    </header>
  )
}
