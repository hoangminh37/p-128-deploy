/**
 * Nội dung thanh bên. Dùng chung cho cả hai cách hiển thị: cột thường trực từ
 * 1024px, và ngăn kéo trượt ra ở bản hẹp.
 *
 * THỨ TỰ TỪ TRÊN XUỐNG có ý nghĩa:
 *
 *   1. Dấu hiệu và tên ứng dụng — biết mình đang ở đâu.
 *   2. Câu hỏi mới             — việc chính, nền đặc, không phải tìm.
 *   3. Danh sách hội thoại      — phần cuộn được, chiếm hết chỗ còn lại.
 *   4. Hồ sơ                   — ghim ở đáy.
 *
 * Đường vào hồ sơ nằm ở đáy thanh bên chứ không nằm trên thanh tiêu đề: nó là
 * việc làm một lần rồi thôi, để cạnh tên hội thoại thì tranh chỗ với thứ người
 * dùng thực sự đang đọc.
 *
 * Mọi chữ ở đây tối thiểu 15px, dòng phụ cũng vậy. Xem thêm ghi chú cỡ chữ ở
 * `ConversationNav.tsx`.
 */
import { Link, useLocation } from 'react-router-dom'

import { APP_NAME } from '../lib/appName'
import { CONDITION_LABEL } from '../lib/conditions'
import { usePatient } from '../patient/context'
import { useSession } from '../session/context'
import { ConversationNav } from './ConversationNav'
import { EditorNav } from './EditorNav'
import { AppMark, CloseIcon, PlusIcon, UserIcon } from './icons'
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
  const isLearningOpen = pathname === '/learning'
  const isPatient = user?.role === 'patient'

  const profileSubline =
    profile !== null
      ? `${CONDITION_LABEL[profile.primary_condition]} · ${profile.age} tuổi`
      : 'Chưa khai hồ sơ'

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      {/* ---- Dấu hiệu và tên ứng dụng ---- */}
      <div className="flex items-center gap-tight px-snug pt-snug">
        <AppMark className="h-8 w-8 shrink-0 text-medical" />
        <p className="font-display min-w-0 flex-1 text-app font-bold">{APP_NAME}</p>

        {onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng thanh bên"
            className="flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-lg text-ink"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* ---- Câu hỏi mới ---- */}
      {isPatient && (
        <div className="px-snug pt-snug pb-tight flex flex-col gap-tight">
          <Link
            to="/chat"
            onClick={onNavigate}
            className="font-display flex min-h-touch items-center justify-center gap-tight rounded-lg border-2 border-medical bg-medical px-cozy text-input font-bold text-paper no-underline"
          >
            <PlusIcon className="h-5 w-5 shrink-0" />
            Câu hỏi mới
          </Link>
          
          <Link
            to="/learning"
            onClick={onNavigate}
            className={`font-display flex min-h-touch items-center justify-center gap-tight rounded-lg border-2 px-cozy text-input font-bold no-underline ${
              isLearningOpen 
                ? 'border-medical bg-medical text-paper' 
                : 'border-border bg-paper text-ink hover:bg-rule'
            }`}
          >
            📚 Thư viện học tập
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
      <div className="shrink-0 border-t border-rule">
        {isPatient ? (
          <Link
            to="/profile"
            onClick={onNavigate}
            aria-current={isProfileOpen ? 'page' : undefined}
            className={`font-display flex min-h-touch items-center gap-snug px-snug py-tight no-underline ${
              isProfileOpen ? 'bg-rule' : ''
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border text-ink">
              <UserIcon className="h-6 w-6" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-question font-semibold text-ink flex items-center justify-between">
                <span>Hồ sơ của bạn</span>
                {lessonData && (
                  <span className="text-note text-medical bg-medical/10 px-1.5 py-0.5 rounded">
                    {lessonData.stats.total_score} HP 🔥 {lessonData.stats.current_streak}
                  </span>
                )}
              </span>
              <span
                className={`mt-hair block line-clamp-2 text-note ${
                  isProfileOpen ? 'text-ink' : 'text-moss'
                }`}
              >
                {profileSubline}
              </span>
            </span>
          </Link>
        ) : (
          <div className="font-display flex min-h-touch items-center gap-snug px-snug py-tight">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border text-ink">
              <UserIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-question font-semibold text-ink">
                Biên tập viên y khoa
              </span>
              <span className="mt-hair block line-clamp-2 text-note text-moss">
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
