/**
 * Khung ngoài dùng chung cho cả ba màn: thanh bên và vùng nội dung.
 *
 * HAI CÁCH HIỂN THỊ, ranh giới ở 1024px — đúng mốc `lg` mà `AnswerDocument`
 * dùng để nhả dải nguồn ra lề phải:
 *
 *   Từ 1024px  — thanh bên thường trực, rộng cố định `rail` (252px), dính theo
 *                khung nhìn. Vùng nội dung chiếm phần còn lại.
 *   Dưới 1024px — thanh bên ẩn, mở bằng nút menu trên thanh tiêu đề. Lúc mở nó
 *                trượt ra đè lên nội dung, nền sau bị làm tối.
 *
 * Chọn theo `matchMedia` chứ không chỉ bằng class `lg:` của Tailwind: ngăn kéo
 * còn kéo theo khóa cuộn trang, bẫy focus và `role="dialog"` — những thứ CSS
 * không tắt được. Ẩn bằng `display:none` mà vẫn khóa cuộn trang thì ở bản rộng
 * người dùng sẽ không cuộn được trang mà chẳng hiểu vì sao.
 *
 * Vùng nội dung giữ nguyên bề ngang cũ: bằng cột câu trả lời, từ 1024px nới ra
 * đúng bằng cột chữ cộng dải nguồn.
 */
import { useCallback, useRef, useState } from 'react'
import { Outlet, useLocation, useMatch } from 'react-router-dom'

import { useConversations } from '../app/conversations'
import { APP_NAME } from '../lib/appName'
import { CONDITION_LABEL } from '../lib/conditions'
import { usePatient } from '../patient/context'
import { ContentHeader } from './ContentHeader'
import { Sidebar } from './Sidebar'
import { useFocusTrap, useMediaQuery, useScrollLock } from './shellHooks'

/** Bằng đúng mốc `lg` của Tailwind (64rem tính trên cỡ chữ gốc 16px của media query). */
const DESKTOP_QUERY = '(min-width: 1024px)'

/**
 * Thanh bên dạng ngăn kéo, chỉ dựng khi đang mở.
 *
 * Dựng có điều kiện chứ không ẩn bằng CSS: nhờ vậy khóa cuộn và bẫy focus gắn
 * vào vòng đời của chính component, không cần một mớ cờ để bật tắt.
 */
function SidebarDrawer({
  activeConversationId,
  onClose,
}: {
  activeConversationId: string | null
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useScrollLock(true)
  useFocusTrap(true, panelRef, onClose)

  return (
    <div className="fixed inset-0 z-50">
      {/* Lớp phủ làm tối nội dung phía sau. `aria-hidden` vì đóng ngăn kéo đã có
          hai đường chính thức: nút đóng và phím Escape — thêm một nút vô hình
          nữa chỉ làm dài thêm danh sách của trình đọc màn hình. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-ink/50"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Thanh bên"
        className="absolute inset-y-0 left-0 w-rail border-r border-rule bg-paper"
      >
        <Sidebar
          activeConversationId={activeConversationId}
          onNavigate={onClose}
          onClose={onClose}
        />
      </div>
    </div>
  )
}

export function RootLayout() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [isDrawerOpen, setDrawerOpen] = useState(false)

  const { profile } = usePatient()
  const { pathname } = useLocation()
  const contentRef = useRef<HTMLElement>(null)

  // Phiên đang mở đọc thẳng từ đường dẫn, không giữ thêm một bản sao trong
  // state: hai nguồn sự thật thì sớm muộn cũng lệch, và lúc lệch thì thanh bên
  // tô đậm một phiên còn màn hình đang hiện một phiên khác.
  const chatMatch = useMatch('/chat/:conversationId')
  const activeConversationId = chatMatch?.params.conversationId ?? null

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const { data } = useConversations()
  const activeTitle = data?.conversations.find(
    (conversation) => conversation.conversation_id === activeConversationId,
  )?.title

  /**
   * Tên hiện ở thanh tiêu đề bản rộng.
   *
   * Trên `/chat` là tên hội thoại. Danh sách chưa về, hoặc phiên vừa mở chưa kịp
   * được lưu, thì nói bằng lời thay vì để trống. Hai màn còn lại tự xưng tên,
   * chứ không mượn tên của một hội thoại chẳng liên quan.
   */
  function headerTitle(): string {
    if (pathname === '/profile') return 'Hồ sơ của bạn'
    if (!pathname.startsWith('/chat')) return APP_NAME
    if (activeConversationId === null) return 'Câu hỏi mới'
    return activeTitle ?? 'Hội thoại đã lưu'
  }

  const conditionLabel =
    profile !== null ? CONDITION_LABEL[profile.primary_condition] : APP_NAME

  // Kéo cửa sổ rộng ra thì thanh bên đã thường trực, ngăn kéo phải tự thu lại —
  // nếu không thì lần thu hẹp sau nó sẽ tự bật ra dù người dùng chưa bấm gì.
  //
  // Sửa state ngay trong lúc vẽ chứ không qua `useEffect`: đây đúng là lối React
  // khuyến nghị khi cần chỉnh state theo một giá trị bên ngoài. React bỏ luôn
  // kết quả của lượt vẽ này rồi vẽ lại ngay, nên không có khung hình nào lọt ra
  // màn hình với ngăn kéo đè lên thanh bên thường trực.
  if (isDesktop && isDrawerOpen) {
    setDrawerOpen(false)
  }

  return (
    <div className="flex min-h-dvh bg-paper text-ink">
      {isDesktop && (
        // `h-dvh` + `sticky` cho thanh bên đứng yên trong lúc nội dung cuộn.
        // Có chiều cao tường minh nên nó không bị flex kéo giãn theo nội dung,
        // và phần danh sách bên trong mới cuộn riêng được.
        <aside className="sticky top-0 h-dvh w-rail shrink-0 border-r border-rule">
          <Sidebar activeConversationId={activeConversationId} />
        </aside>
      )}

      {/* `min-w-0` để chữ dài trong vùng nội dung co lại được thay vì đẩy rộng
          cả khung và sinh ra thanh cuộn ngang. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ContentHeader
          isDesktop={isDesktop}
          title={headerTitle()}
          conditionLabel={conditionLabel}
          isDrawerOpen={isDrawerOpen}
          onOpenMenu={() => setDrawerOpen(true)}
          contentRef={contentRef}
        />

        <main
          ref={contentRef}
          className="mx-auto flex w-full max-w-answer flex-1 flex-col px-cozy py-cozy lg:max-w-reading"
        >
          <Outlet />
        </main>
      </div>

      {!isDesktop && isDrawerOpen && (
        <SidebarDrawer
          activeConversationId={activeConversationId}
          onClose={closeDrawer}
        />
      )}
    </div>
  )
}
