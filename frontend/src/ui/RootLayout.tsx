/**
 * Khung ngoài dùng chung cho mọi màn sau đăng nhập: thanh bên và vùng nội dung.
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
 * MỘT TỜ GIẤY DUY NHẤT. Bản trước dựng khung ngoài bằng navy đặc rồi đặt một
 * tấm `canvas` bo góc trái lên trên, để lộ một vạch navy chạy dọc. Hướng
 * "Hồ sơ / Công báo" bỏ hẳn lối đó: thanh bên và vùng nội dung nay là hai CỘT
 * của cùng một tờ giấy, ngăn nhau bằng đúng một nét kẻ 1px (nét đó do
 * `Sidebar` vẽ, xem `border-r` ở đó). Không góc bo, không vạch màu, không lớp
 * chồng lớp.
 *
 * NGOẠI LỆ DUY NHẤT: `/editor` (tổng quan) giữ nền MỰC ĐẶC suốt cả vùng nội
 * dung. Đó là màn DẪN DẮT — người dùng mở nó để nhìn hai con số rồi đi tiếp,
 * không đọc gì lâu ở đó — nên nó là một tấm măng-sét, cùng ngôn ngữ với dải
 * đầu trang giới thiệu. `ink` nay là mực đen chứ không còn là navy, nên
 * mảng này đọc ra như một khối chữ in ngược, không như một tấm nền khác họ.
 * Ba màn làm việc còn lại của biên tập viên vẫn là giấy.
 */
import { useCallback, useRef, useState } from 'react'
import { Outlet, useLocation, useMatch } from 'react-router-dom'

import { useConversations } from '../app/conversations'
import { APP_NAME } from '../lib/appName'
import { ContentHeader } from './ContentHeader'
import { Sidebar } from './Sidebar'
import { useFocusTrap, useMediaQuery, useScrollLock } from './shellHooks'

/** Bằng đúng mốc `lg` của Tailwind (64rem tính trên cỡ chữ gốc 16px của media query). */
const DESKTOP_QUERY = '(min-width: 1024px)'

/** Tên bốn màn của khu vực biên tập, suy từ đường dẫn. */
function editorTitle(pathname: string): string {
  if (pathname.startsWith('/editor/conditions')) return 'Danh mục bệnh'
  if (pathname.startsWith('/editor/queue/')) return 'Duyệt nội dung'
  if (pathname.startsWith('/editor/queue')) return 'Hàng đợi duyệt'
  if (pathname.startsWith('/editor/documents/')) return 'Xem tài liệu'
  if (pathname.startsWith('/editor/documents')) return 'Tài liệu nguồn'
  if (pathname.startsWith('/editor/out-of-scope')) return 'Câu hỏi chưa trả lời được'
  if (pathname.startsWith('/editor/patient-questions')) return 'Yêu cầu phản hồi bệnh nhân'
  if (pathname.startsWith('/editor/upload')) return 'Tải lên tài liệu'
  if (pathname.startsWith('/editor/doctors')) return 'Quản lý bác sỹ'
  return 'Tổng quan'
}

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      {/* Lớp phủ làm tối nội dung phía sau. `aria-hidden` vì đóng ngăn kéo đã
          có hai đường chính thức: nút đóng và phím Escape — thêm một nút vô
          hình nữa chỉ làm dài thêm danh sách của trình đọc màn hình. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(18,21,26,.7)' }}
      />

      {/* `.side` tự lo bề ngang, nền mờ và cách xếp bốn khối bên trong. Khối
          này chỉ neo nó vào mép trái màn hình và cho nó nền ĐỤC — một lớp mờ
          70% đặt trên một lớp phủ tối 70% thì chữ trong thanh bên chìm hẳn. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Thanh bên"
        style={{
          position: 'absolute',
          insetBlock: 0,
          left: 0,
          width: 'var(--w-side)',
          background: 'var(--paper)',
        }}
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

  const { pathname } = useLocation()
  const contentRef = useRef<HTMLElement>(null)

  // Phiên đang mở đọc thẳng từ đường dẫn, không giữ thêm một bản sao trong
  // state: hai nguồn sự thật thì sớm muộn cũng lệch, và lúc lệch thì thanh bên
  // tô đậm một phiên còn màn hình đang hiện một phiên khác.
  const chatMatch = useMatch('/chat/:conversationId')
  const activeConversationId = chatMatch?.params.conversationId ?? null
  // A consultation room is a working surface like Messenger, not a reading
  // page. It owns the complete content pane below the shared app header.
  // `/consultations/doctors/:id` deliberately does not match either route.
  const patientConsultationRoomMatch = useMatch('/consultations/:consultationId')
  const doctorConsultationRoomMatch = useMatch('/doctor/consultations/:consultationId')
  const isConsultationRoom =
    patientConsultationRoomMatch !== null || doctorConsultationRoomMatch !== null

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
    if (pathname.startsWith('/consultations')) return 'Tư vấn với bác sỹ'
    if (pathname === '/doctor') return 'Tổng quan tư vấn'
    if (pathname.startsWith('/doctor/notifications')) return 'Thông báo'
    if (pathname.startsWith('/doctor/profile')) return 'Hồ sơ bác sỹ'
    if (pathname.startsWith('/doctor/consultations')) return 'Phiên tư vấn'
    if (pathname === '/learning') return 'Thư viện học tập'
    if (pathname.startsWith('/editor')) return editorTitle(pathname)
    if (!pathname.startsWith('/chat')) return APP_NAME
    if (activeConversationId === null) return 'Câu hỏi mới'
    return activeTitle ?? 'Hội thoại đã lưu'
  }

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
    /* `.app` của bản mẫu: `grid-template-columns: var(--w-side) minmax(0,1fr)`,
       và dưới 1024px nó tự về một cột trong khi `.side` tự ẩn. KHÔNG rẽ nhánh
       theo `isDesktop` ở đây — bản mẫu để media query quyết định, và một cây
       DOM duy nhất thì tiêu điểm bàn phím không rơi mất mỗi lần đổi bề ngang.

       KHÔNG SƠN NỀN: nền của cả trang là ẢNH TỜ GIẤY trên `<body>`. `.side`
       để nền mờ cho ảnh xuyên qua, còn `.main` thì bản mẫu để trong suốt hẳn
       và mọi khối chữ đứng trên một `.phieu` đục. */
    <div
      className="app"
      style={isConsultationRoom ? { height: '100dvh', overflow: 'hidden' } : undefined}
    >
      {isDesktop && (
        <Sidebar activeConversationId={activeConversationId} />
      )}

      {/* `.cot-chinh` của bản mẫu: cột phải là một flex dọc, `.top` ghim trên
          đỉnh và `.main` nhận phần còn lại. */}
      <div className="cot-chinh">
        <ContentHeader
          title={headerTitle()}
          isDrawerOpen={isDrawerOpen}
          onOpenMenu={() => setDrawerOpen(true)}
          contentRef={contentRef}
          showTranscriptActions={!pathname.startsWith('/chat')}
        />

        <main
          ref={contentRef}
          className={isConsultationRoom ? 'main phong' : 'main'}
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
