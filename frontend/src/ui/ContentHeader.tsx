/**
 * Thanh đầu trang — LỚP `.top` CỦA BẢN MẪU.
 *
 * Bản mẫu dựng thanh này ở vòng lặp thứ hai trong script cuối trang, và thứ tự
 * các phần tử ở đó là đặc tả:
 *
 *   `.ico.menu`        nút mở ngăn kéo. `.menu{display:none}` cho tới 1024px,
 *                      dưới mốc đó `.side` biến mất và nút hiện ra. MỘT quy
 *                      tắc CSS quyết định, không phải hai nhánh JSX.
 *   `.ten-man`         tên màn, Newsreader nghiêng, `--xam`, cắt ba chấm.
 *   `.che`             ba ô chế độ hiển thị.
 *   `.ico` + `.cham`   chuông thông báo, CHỈ vai bệnh nhân.
 *   `.ico.cop` `.ico.luu`  sao chép và tải xuống, ẩn dưới 1024px bằng
 *                      `.top .cop,.top .luu{display:none}`.
 *
 * BỎ HẲN HAI NHÁNH `isDesktop` CỦA BẢN TRƯỚC. Bản mẫu dựng ĐÚNG MỘT cây DOM và
 * để media query quyết định cái gì hiện ra. Nhánh theo JavaScript thì lúc đổi
 * bề ngang cửa sổ React phải tháo cả cây và dựng lại, mà giữa hai cây đó tiêu
 * điểm bàn phím rơi mất.
 *
 * Ở màn hỏi đáp, sao chép/tải xuống nằm dưới từng câu trả lời để người dùng
 * biết chính xác thao tác áp dụng cho lượt nào — bản mẫu cũng bỏ hai nút này ở
 * `hd`, `tvpg`, `bsphong`. Các màn khác giữ thao tác toàn trang ở đây.
 */
import type { RefObject } from 'react'
import { Link } from 'react-router-dom'

import { copyTextToClipboard, downloadText } from '../lib/transcript'
import { useSession } from '../session/context'
import { CopyIcon, MenuIcon, PlusIcon, SaveIcon } from './icons'
import { PatientNotificationBell } from './PatientNotificationBell'
import { ThemeToggle } from './ThemeToggle'
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

export function ContentHeader({
  title,
  isDrawerOpen,
  onOpenMenu,
  contentRef,
  showTranscriptActions = true,
}: {
  /** Tên màn đang mở. Bản mẫu gọi nó là `.ten-man`. */
  title: string
  isDrawerOpen: boolean
  onOpenMenu: () => void
  /** Vùng nội dung mà hai nút sao chép và lưu đọc chữ từ đó. */
  contentRef: RefObject<HTMLElement | null>
  /** Màn chat tự đặt thao tác vào dưới từng câu trả lời. */
  showTranscriptActions?: boolean
}) {
  const [notice, showNotice] = useTransientNotice()
  const { user } = useSession()
  const isPatient = user?.role === 'patient'

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
    <div className="top">
      {/* `.menu` ẩn từ 1024px trở lên bằng CSS của bản mẫu — không rẽ nhánh ở
          đây. `aria-expanded` phải bám ngăn kéo thật, nếu không trình đọc màn
          hình báo sai trạng thái mỗi lần mở. */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Mở thanh bên"
        aria-haspopup="dialog"
        aria-expanded={isDrawerOpen}
        className="ico menu"
      >
        <MenuIcon className="" />
      </button>

      {/* Dùng `p` chứ không dùng `h1`: mỗi màn đã có `h1` của riêng nó, thêm
          một cái nữa ở khung ngoài là hai tiêu đề cấp một. Bản mẫu cũng dùng
          `<p class="ten-man">`. */}
      <p className="ten-man">{title}</p>

      {/* Luôn có mặt trong DOM để `aria-live` báo được thay đổi; rỗng thì nó
          không chiếm chỗ nào. */}
      <p role="status" className="lab" style={{ minWidth: 0, flex: '0 1 auto' }}>
        {notice}
      </p>

      <ThemeToggle />

      {isPatient && <PatientNotificationBell />}

      {showTranscriptActions && (
        <>
          <button
            type="button"
            onClick={() => void handleCopy()}
            aria-label="Sao chép nội dung"
            title="Sao chép nội dung"
            className="ico cop"
          >
            <CopyIcon className="" />
          </button>

          <button
            type="button"
            onClick={handleSave}
            aria-label="Lưu nội dung về máy"
            title="Lưu nội dung về máy"
            className="ico luu"
          >
            <SaveIcon className="" />
          </button>
        </>
      )}

      {/* Nút "Câu hỏi mới" chỉ có ở bản hẹp: từ 1024px cụm `.acts` trong thanh
          bên đã có mục đó rồi, và bản mẫu không đặt nó lên `.top`. `.menu` là
          lớp có sẵn của bản mẫu cho đúng cách ẩn/hiện này. */}
      {isPatient && (
        <Link to="/chat" aria-label="Câu hỏi mới" title="Câu hỏi mới" className="ico menu">
          <PlusIcon className="" />
        </Link>
      )}
    </div>
  )
}
