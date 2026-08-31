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
 * HAI HỌ NỀN GẶP NHAU Ở ĐÂY. Khung ngoài là navy đặc; vùng nội dung là một tấm
 * `canvas` đặt chồng lên, bo hai góc TRÁI để lộ một vạch navy chạy dọc giữa
 * thanh bên và nội dung. Vạch đó thay hẳn đường kẻ 1px của bản trước: nó là
 * ranh giới nhìn thấy được ở mọi cỡ chữ, và nó nói ra rằng thanh bên với vùng
 * nội dung là hai lớp khác nhau chứ không phải hai ô của cùng một bảng.
 *
 * NGOẠI LỆ DUY NHẤT: `/editor` (tổng quan) giữ nền navy suốt cả vùng nội dung.
 * Đó là màn DẪN DẮT — người dùng mở nó để nhìn hai con số rồi đi tiếp, không
 * đọc gì lâu ở đó — nên nó thuộc họ nền tối, cùng nhóm với trang giới thiệu và
 * màn đăng nhập. Ba màn làm việc còn lại của biên tập viên vẫn là canvas.
 */
import { useCallback, useRef, useState } from 'react'
import { Outlet, useLocation, useMatch } from 'react-router-dom'

import { useConversations } from '../app/conversations'
import { APP_NAME } from '../lib/appName'
import { conditionLabel } from '../lib/conditions'
import { usePatient } from '../patient/context'
import { useSession } from '../session/context'
import { Backdrop } from './Backdrop'
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
 * Màn nào thuộc họ nền tối.
 *
 * Chỉ tổng quan biên tập viên, và phải so khớp CHÍNH XÁC: `startsWith` sẽ kéo
 * theo cả `/editor/queue` lẫn `/editor/out-of-scope`, hai màn làm việc thuộc
 * họ nền sáng.
 */
function isDarkContent(pathname: string): boolean {
  return pathname === '/editor'
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
    <div className="fixed inset-0 z-50">
      {/* Lớp phủ làm tối nội dung phía sau. `aria-hidden` vì đóng ngăn kéo đã có
          hai đường chính thức: nút đóng và phím Escape — thêm một nút vô hình
          nữa chỉ làm dài thêm danh sách của trình đọc màn hình. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-ink/70"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Thanh bên"
        className="absolute inset-y-0 left-0 w-rail bg-ink"
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
  const { user } = useSession()
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

  /**
   * Tên màn ở khu vực biên tập.
   *
   * Bản hẹp không có thanh bên nên thanh tiêu đề là chỗ DUY NHẤT nói được đang
   * đứng ở màn nào — với luồng bệnh nhân thì đó là tên bệnh chính, còn ở đây
   * phải là tên màn.
   */
  const headerConditionLabel = pathname.startsWith('/editor')
    ? editorTitle(pathname)
    : user?.role === 'doctor'
      ? 'Khu vực bác sỹ'
    : profile !== null
      ? conditionLabel(profile.primary_condition, profile.primary_condition_label)
      : APP_NAME

  const isDark = isDarkContent(pathname)

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
    <div className={`flex bg-ink ${isConsultationRoom ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`}>
      {isDesktop && (
        // `h-dvh` + `sticky` cho thanh bên đứng yên trong lúc nội dung cuộn.
        // Có chiều cao tường minh nên nó không bị flex kéo giãn theo nội dung,
        // và phần danh sách bên trong mới cuộn riêng được.
        <aside className="sticky top-0 h-dvh w-rail shrink-0 bg-ink">
          <Sidebar activeConversationId={activeConversationId} />
        </aside>
      )}

      {/* `min-w-0` để chữ dài trong vùng nội dung co lại được thay vì đẩy rộng
          cả khung và sinh ra thanh cuộn ngang.
          Bo góc CHỈ ở bản rộng: dưới 1024px thanh bên không thường trực nên
          không có nền navy nào ở bên trái để lộ ra, và một góc bo lơ lửng
          giữa mép màn hình trông như lỗi hiển thị. */}
      <div
        // `relative isolate` là mốc neo và là hộp xếp lớp cho họa tiết nền:
        // `Backdrop` nằm ở `-z-0` bên trong, còn thanh tiêu đề (`z-30`) và vùng
        // nội dung (`z-10`) nổi lên trên. Thiếu `isolate` thì `-z-0` có thể chui
        // xuống dưới cả nền của khối cha ở một số trình duyệt.
        className={`relative isolate flex min-w-0 flex-1 flex-col lg:rounded-l-card-lg ${
          isDark ? 'bg-ink' : 'bg-canvas'
        }`}
      >
        {/* Chỉ ở họ nền sáng. Màn tổng quan biên tập là nền navy và nó tự dựng
            họa tiết `ink` của riêng mình — xem `EditorDashboardScreen`. */}
        {!isDark && <Backdrop tone="canvas" />}

        <ContentHeader
          isDesktop={isDesktop}
          isDark={isDark}
          title={headerTitle()}
          conditionLabel={headerConditionLabel}
          isDrawerOpen={isDrawerOpen}
          onOpenMenu={() => setDrawerOpen(true)}
          contentRef={contentRef}
          showTranscriptActions={!pathname.startsWith('/chat')}
        />

        <main
          ref={contentRef}
          className={`relative z-10 mx-auto flex w-full flex-1 flex-col ${
            isConsultationRoom
              ? 'min-h-0 max-w-none overflow-hidden p-0'
              : `px-cozy py-cozy ${
                  // Màn tổng quan biên tập là một bố cục thẻ, không phải một cột chữ,
                  // nên nó cần cả bề ngang. Mọi màn còn lại giữ nguyên cột đọc cũ.
                  isDark ? 'max-w-page' : 'max-w-answer lg:max-w-reading'
                }`
          }`}
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
