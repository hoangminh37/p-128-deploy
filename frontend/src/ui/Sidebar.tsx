/**
 * Thanh bên — DỰNG TỪ BẢN MẪU.
 *
 * Bản mẫu không viết thanh bên vào từng section; nó để `<aside class="side">`
 * rỗng rồi đổ nội dung vào bằng script ở cuối `docs/design/eduhealth-ai.html`.
 * Script đó CHÍNH LÀ đặc tả, và file này chép lại nó:
 *
 *   BỆNH NHÂN   `.acts` bốn nút hành động (mục đầu mang thêm `.chinh`)
 *               -> `<nav>` danh sách hội thoại gom theo mốc thời gian
 *               -> `.hoso` khối hồ sơ, có `.avt` và huy hiệu `.hp`
 *               -> `.thoat`
 *
 *   BIÊN TẬP    `<nav>` bảy mục cố định, mục có số đếm mang `<span class="n">`
 *               -> `.hoso` (không có `.hp`) -> `.thoat`
 *
 *   BÁC SỸ      `.hoso` -> `.thoat`. Bản mẫu KHÔNG dựng `<nav>` cho vai này.
 *               Ở đây có dựng, vì sản phẩm có bốn màn bác sỹ thật phải đi lại
 *               được; dùng đúng khuôn `<nav>` của vai biên tập.
 *
 * Bề ngang, nền mờ, thanh cuộn riêng, nét lề trái của mục đang mở — tất cả do
 * `.side` trong `index.css` lo. File này không đặt một con số nào.
 *
 * `.side` của bản mẫu để nền `rgba(251,251,248,.58)` kèm `backdrop-filter`, nên
 * ảnh giấy trên `<body>` xuyên qua được. Đó là lý do khối bọc ngoài ở
 * `RootLayout` phải để trống, không sơn nền.
 */
import { Link, useLocation } from 'react-router-dom'

import { APP_NAME } from '../lib/appName'
import { conditionLabel } from '../lib/conditions'
import { usePatient } from '../patient/context'
import { useSession } from '../session/context'
import { ConversationNav } from './ConversationNav'
import { EditorNav } from './EditorNav'
import {
  AppMark,
  CloseIcon,
  ConsultationIcon,
  LibraryIcon,
  PlusIcon,
  QuizIcon,
  UserIcon,
} from './icons'
import { SignOutButton } from './SignOutButton'
import { useDailyLesson } from '../app/learning'
import { useDoctorNotifications } from '../app/consultations'

/**
 * Cụm `.acts` của bản mẫu, đúng bốn mục và đúng thứ tự trong mảng `ACT` của
 * script dựng khung: Câu hỏi mới (`.chinh`), Thư viện học tập, Test kiến thức,
 * Tư vấn với bác sỹ.
 */
const ACTIONS = [
  { to: '/chat', label: 'Câu hỏi mới', Icon: PlusIcon, primary: true, match: null },
  { to: '/learning', label: 'Thư viện học tập', Icon: LibraryIcon, primary: false, match: '/learning' },
  { to: '/quiz', label: 'Test kiến thức', Icon: QuizIcon, primary: false, match: '/quiz' },
  { to: '/consultations', label: 'Tư vấn với bác sỹ', Icon: ConsultationIcon, primary: false, match: '/consultations' },
] as const

/** Bốn màn của vai bác sỹ, dựng bằng đúng khuôn `<nav>` của vai biên tập. */
const DOCTOR_NAV = [
  { to: '/doctor', label: 'Tổng quan', exact: true },
  { to: '/doctor/notifications', label: 'Thông báo', exact: false },
  { to: '/doctor/consultations', label: 'Các phiên tư vấn', exact: false },
  { to: '/doctor/profile', label: 'Hồ sơ của tôi', exact: false },
] as const

export function Sidebar({
  activeConversationId,
  onNavigate,
  onClose,
}: {
  activeConversationId: string | null
  /** Bản hẹp truyền vào để bấm một liên kết là ngăn kéo thu lại. */
  onNavigate?: () => void
  /** Chỉ có ở bản ngăn kéo. Có thì hiện nút đóng ở góc trên. */
  onClose?: () => void
}) {
  const { profile } = usePatient()
  const { user } = useSession()
  const { pathname } = useLocation()
  const isPatient = user?.role === 'patient'

  const { data: lessonData } = useDailyLesson(isPatient)
  const notificationsQuery = useDoctorNotifications(user?.role === 'doctor')
  const unreadNotifications = notificationsQuery.data?.unread_count ?? 0

  /**
   * Dòng phụ của khối `.hoso`.
   *
   * Bản mẫu ghi "đái tháo đường típ 2 · 62 tuổi · 2 ngày liền" — ba mẩu ngăn
   * bằng dấu chấm giữa. Ở đây cả ba lấy từ dữ liệu thật; mẩu nào chưa có thì
   * biến mất chứ không để lại một dấu chấm mồ côi.
   */
  function profileSubline(): string {
    const parts: string[] = []
    if (profile !== null) {
      parts.push(conditionLabel(profile.primary_condition, profile.primary_condition_label))
      parts.push(`${profile.age} tuổi`)
    } else {
      parts.push('Chưa khai hồ sơ')
    }
    if (lessonData !== undefined) {
      parts.push(`${lessonData.stats.current_streak} ngày liền`)
    }
    return parts.join(' · ')
  }

  return (
    <aside className="side">
      {/* ---- Tên ứng dụng. Bản mẫu:
              <div style="display:flex;align-items:center;gap:9px">
                <svg …bông sen…><span …Newsreader 19px…>EduHealth AI</span>
              </div>
              Bề ngang svg và cỡ chữ do `.side>div:first-child svg` /
              `… span` trong `index.css` lo. ---- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <AppMark className="" />
        <span style={{ fontFamily: 'var(--f-display)', flex: 1, minWidth: 0 }}>
          {APP_NAME}
        </span>

        {/* Nút đóng chỉ có ở bản ngăn kéo — bản mẫu không có vì nó không có
            ngăn kéo, nhưng dưới 1024px `.side` của sản phẩm là một lớp trượt
            ra và người dùng phải đóng được nó mà không cần bấm ra ngoài. */}
        {onClose !== undefined && (
          <button type="button" onClick={onClose} aria-label="Đóng thanh bên" className="ico">
            <CloseIcon className="" />
          </button>
        )}
      </div>

      {/* ---- `.acts`: chỉ vai bệnh nhân ---- */}
      {isPatient && (
        <div className="acts">
          {ACTIONS.map(({ to, label, Icon, primary, match }) => {
            const isActive = match !== null && pathname.startsWith(match)
            return (
              <Link
                key={to}
                to={to}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={primary ? 'act chinh' : 'act'}
              >
                <Icon className="" />
                <span>{label}</span>
              </Link>
            )
          })}
        </div>
      )}

      {/* ---- `<nav>`: phần DUY NHẤT cuộn được ---- */}
      {isPatient ? (
        <ConversationNav
          activeConversationId={activeConversationId}
          onNavigate={onNavigate}
        />
      ) : user?.role === 'editor' ? (
        <EditorNav onNavigate={onNavigate} />
      ) : (
        <nav aria-label="Khu vực bác sỹ">
          {DOCTOR_NAV.map(({ to, label, exact }) => {
            const isActive = exact ? pathname === to : pathname.startsWith(to)
            const showCount = to.endsWith('/notifications') && unreadNotifications > 0
            return (
              <Link
                key={to}
                to={to}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
              >
                <span>{label}</span>
                {/* `.n` của bản mẫu: mono, cỡ `--t-mono-s`, màu `--xam`, và
                    chuyển sang tím khi mục đang mở. Số đếm là SỐ LIỆU nên nó
                    dùng mono, đúng luật chữ của bản mẫu. */}
                {showCount && <span className="n">{unreadNotifications}</span>}
              </Link>
            )
          })}
        </nav>
      )}

      {/* ---- `.hoso` ghim dưới đáy ---- */}
      {isPatient ? (
        <Link
          to="/profile"
          onClick={onNavigate}
          aria-current={pathname === '/profile' ? 'page' : undefined}
          className="hoso"
        >
          <span className="avt">
            <UserIcon className="" />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="ten">
              Hồ sơ của bạn
              {/* `.hp` — huy hiệu điểm, mono trên nền xanh nhạt viền mảnh.
                  Bản mẫu ghi cứng "45 HP"; đây là điểm thật. Chưa tải xong thì
                  huy hiệu chưa xuất hiện, chứ không hiện số 0. */}
              {lessonData !== undefined && (
                <span className="hp">{lessonData.stats.total_score} HP</span>
              )}
            </div>
            <div className="duoi">{profileSubline()}</div>
          </div>
        </Link>
      ) : (
        <div className="hoso">
          <span className="avt">
            <UserIcon className="" />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="ten">
              {user?.role === 'doctor' ? 'Bác sỹ tư vấn' : 'Biên tập viên y khoa'}
            </div>
            <div className="duoi">{user?.email ?? ''}</div>
          </div>
        </div>
      )}

      {/* ---- `.thoat` ---- */}
      <SignOutButton />
    </aside>
  )
}
