/**
 * Nội dung thanh bên. Dùng chung cho cả hai cách hiển thị: cột thường trực từ
 * 1024px, và ngăn kéo trượt ra ở bản hẹp.
 *
 * NỀN NAVY TOÀN PHẦN. Thanh bên là phần DẪN DẮT — nó nói bạn đang ở đâu và đi
 * đâu được, chứ không phải chỗ để đọc. Vùng nội dung bên phải là tấm canvas
 * sáng đặt chồng lên nền này, nên ranh giới giữa hai bên là một vạch navy chứ
 * không phải một đường kẻ.
 *
 * THỨ TỰ TỪ TRÊN XUỐNG có ý nghĩa:
 *
 *   1. Dấu hiệu và tên ứng dụng — biết mình đang ở đâu.
 *   2. Câu hỏi mới              — việc chính, nền mint đặc, không phải tìm.
 *   3. Danh sách hội thoại       — phần cuộn được, chiếm hết chỗ còn lại.
 *   4. Hồ sơ                    — ghim ở đáy, có avatar tròn nền coral.
 *
 * Đường vào hồ sơ nằm ở đáy thanh bên chứ không nằm trên thanh tiêu đề: nó là
 * việc làm một lần rồi thôi, để cạnh tên hội thoại thì tranh chỗ với thứ người
 * dùng thực sự đang đọc.
 *
 * MÀU CHỮ TRÊN NỀN NAVY, và chỉ hai màu này:
 *   `white` 15.39:1 — mục đang mở, tên ứng dụng, dòng nổi của khối hồ sơ.
 *   `mist`   6.80:1 — mục chưa chọn và mọi dòng phụ.
 * Không có bậc thứ ba nào nhạt hơn `mist`.
 */
import { Link, useLocation } from 'react-router-dom'

import { APP_NAME } from '../lib/appName'
import { CONDITION_LABEL } from '../lib/conditions'
import { usePatient } from '../patient/context'
import { useSession } from '../session/context'
import { ConversationNav } from './ConversationNav'
import { EditorNav } from './EditorNav'
import { AppMark, CloseIcon, LibraryIcon, PlusIcon, UserIcon } from './icons'
import { SignOutButton } from './SignOutButton'
import { useDailyLesson } from '../app/learning'

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

  // Lấy dữ liệu điểm số từ hook
  const { data: lessonData } = useDailyLesson()

  const isProfileOpen = pathname === '/profile'
  const isLearningOpen = pathname.startsWith('/learning')
  // startsWith chứ không phải ===, để /quiz/mistakes cũng sáng mục Trắc nghiệm.
  const isQuizOpen = pathname.startsWith('/quiz')
  const isPatient = user?.role === 'patient'

  const profileSubline =
    profile !== null
      ? `${CONDITION_LABEL[profile.primary_condition]} · ${profile.age} tuổi`
      : 'Chưa khai hồ sơ'

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink">
      {/* ---- Dấu hiệu và tên ứng dụng ---- */}
      <div className="flex items-center gap-tight px-snug pt-snug">
        <AppMark className="h-8 w-8 shrink-0 text-mint" />
        <p className="font-display min-w-0 flex-1 text-app font-bold text-white">
          {APP_NAME}
        </p>

        {onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng thanh bên"
            className="motion-press flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-icon text-white hover:bg-white/10"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* ---- Câu hỏi mới ----
          Nút duy nhất trong thanh bên có nền đặc, và nó là màu nhấn chính.
          Mint / ink đạt 7.95:1. */}
      {isPatient && (
        <div className="flex flex-col gap-tight px-snug pt-snug pb-tight">
          <Link
            to="/chat"
            onClick={onNavigate}
            className="motion-press font-display flex min-h-touch items-center justify-center gap-tight rounded-pill bg-mint px-cozy text-input font-bold text-ink no-underline hover:bg-mint-press"
          >
            <PlusIcon className="h-5 w-5 shrink-0" />
            Câu hỏi mới
          </Link>

          <Link
            to="/learning"
            onClick={onNavigate}
            aria-current={isLearningOpen ? 'page' : undefined}
            className={`font-display flex min-h-touch items-center justify-center gap-tight rounded-pill px-cozy text-input font-semibold no-underline ${
              isLearningOpen
                ? 'bg-white/10 text-white hover:bg-white/15'
                : 'border-2 border-mist text-mist hover:bg-white/10 hover:text-white'
            }`}
          >
            <LibraryIcon className="h-5 w-5 shrink-0" />
            Thư viện học tập
          </Link>

          {/* Cùng ngôn ngữ hình với "Thư viện học tập" ngay trên: hai mục này
              là hai chặng của cùng một vòng học, tách kiểu là tách nhầm. */}
          <Link
            to="/quiz"
            onClick={onNavigate}
            aria-current={isQuizOpen ? 'page' : undefined}
            className={`font-display flex min-h-touch items-center justify-center gap-tight rounded-pill px-cozy text-input font-semibold no-underline ${
              isQuizOpen
                ? 'bg-white/10 text-white hover:bg-white/15'
                : 'border-2 border-mist text-mist hover:bg-white/10 hover:text-white'
            }`}
          >
            <span aria-hidden="true">🎯</span>
            Trắc nghiệm kiến thức
          </Link>
        </div>
      )}

      {/* ---- Danh sách hội thoại ---- */}
      {isPatient ? (
        <ConversationNav
          activeConversationId={activeConversationId}
          onNavigate={onNavigate}
        />
      ) : (
        <EditorNav onNavigate={onNavigate} />
      )}

      {/* ---- Khối hồ sơ và đăng xuất, ghim ở đáy ---- */}
      <div className="shrink-0 border-t border-white/15">
        {isPatient ? (
          <Link
            to="/profile"
            onClick={onNavigate}
            aria-current={isProfileOpen ? 'page' : undefined}
            className={`font-display flex min-h-touch items-center gap-snug px-snug py-tight no-underline hover:bg-white/10 ${
              isProfileOpen ? 'bg-white/10' : ''
            }`}
          >
            {/* Avatar tròn nền coral. Đây là chỗ DUY NHẤT màu coral xuất hiện
                trong thanh bên, nên khối hồ sơ luôn tìm thấy được bằng mắt dù
                nó nằm ở tận đáy một danh sách dài. Ink trên coral: 6.62:1. */}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral text-ink">
              <UserIcon className="h-6 w-6" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-tight text-question font-semibold text-white">
                <span>Hồ sơ của bạn</span>
                {lessonData && (
                  <span className="shrink-0 rounded-pill bg-mint px-tight py-hair text-note font-bold text-ink">
                    {lessonData.stats.total_score} HP
                  </span>
                )}
              </span>
              <span className="mt-hair block line-clamp-2 text-note text-mist">
                {profileSubline}
                {lessonData && ` · ${lessonData.stats.current_streak} ngày liền`}
              </span>
            </span>
          </Link>
        ) : (
          <div className="font-display flex min-h-touch items-center gap-snug px-snug py-tight">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral text-ink">
              <UserIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-question font-semibold text-white">
                Biên tập viên y khoa
              </span>
              <span className="mt-hair block line-clamp-2 text-note text-mist">
                {user?.email ?? ''}
              </span>
            </span>
          </div>
        )}

        <div className="px-snug pb-snug">
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
