/**
 * Danh sách hội thoại trên thanh bên, gom theo ba mốc thời gian.
 *
 * CỠ CHỮ: mọi dòng ở đây tối thiểu 15px. Danh sách bên lề rất dễ bị thu nhỏ cho
 * "gọn", nhưng người dùng 45–70 tuổi mà không đọc được tiêu đề thì cả cái danh
 * sách thành vô dụng. Tiêu đề phiên dùng cỡ `question` 16px, nhãn nhóm và các
 * dòng trạng thái dùng cỡ `note` 15px. Không có gì nhỏ hơn.
 *
 * MÀU CHỮ: tiêu đề phiên để `ink`, nhãn nhóm để `moss`. Không dùng gì nhạt hơn
 * `moss` — `rule` chỉ đạt 1.51:1 nên nó là đường kẻ, không bao giờ là chữ.
 *
 * PHIÊN ĐANG MỞ: nền `rule` cộng một nét dọc `medical` bên trái. Nền thôi là
 * chưa đủ — `rule` trên `paper` chỉ chênh 1.51:1, mắt kém sẽ không thấy. Nét dọc
 * `medical` đạt 5.76:1 nên trạng thái này luôn nhìn ra được. Chữ trên nền `rule`
 * để `ink` (8.57:1); `moss` trên nền đó chỉ còn 4.20:1, không đạt 4.5:1.
 */
import { useId, useMemo } from 'react'
import { Link } from 'react-router-dom'

import { useConversations } from '../app/conversations'
import { groupConversations } from '../lib/conversationGroups'
import { usePatient } from '../patient/context'

/**
 * Trạng thái rỗng.
 *
 * Danh sách trống mà để trắng thì người dùng không biết chỗ đó dùng để làm gì,
 * hay là ứng dụng đang hỏng. Một dòng nói rõ khi nào nó có nội dung.
 */
function EmptyNote() {
  return (
    <p className="font-display px-snug py-cozy text-note text-moss">
      Bạn chưa có hội thoại nào. Sau khi bạn hỏi câu đầu tiên, hội thoại sẽ được
      lưu lại ở đây.
    </p>
  )
}

function LoadingNote() {
  return (
    <p role="status" className="font-display px-snug py-cozy text-note text-moss">
      Đang mở danh sách hội thoại…
    </p>
  )
}

/**
 * Lỗi đọc danh sách.
 *
 * Cố ý gọn hơn `ErrorNotice`: hỏng thanh bên không chặn người dùng hỏi tiếp, nên
 * nó không được chiếm chỗ như một sự cố lớn. Vẫn phải có nút thử lại, vì danh
 * sách trắng trơn nhìn y hệt trạng thái rỗng.
 */
function ErrorNote({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-snug py-cozy">
      <p className="font-display text-note text-alert">
        Chưa đọc được danh sách hội thoại.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="font-display mt-tight min-h-touch rounded-lg border-2 border-border px-snug text-note font-semibold text-ink"
      >
        Thử lại
      </button>
    </div>
  )
}

export function ConversationNav({
  activeConversationId,
  onNavigate,
}: {
  /** Phiên đang mở, lấy từ đường dẫn. `null` khi đang ở một câu hỏi mới. */
  activeConversationId: string | null
  /** Bản hẹp truyền vào để bấm xong thì ngăn kéo tự thu lại. */
  onNavigate?: () => void
}) {
  const { patientId } = usePatient()
  const { data, isPending, isError, refetch } = useConversations()
  const headingPrefix = useId()

  const groups = useMemo(
    () => groupConversations(data?.conversations ?? []),
    [data],
  )

  function content() {
    // Chưa có patient_id thì query bị `enabled: false` nên đứng ở `pending` mãi.
    // Xét trước `isPending`, nếu không thanh bên sẽ báo "đang mở" vĩnh viễn.
    if (patientId === null) return <EmptyNote />
    if (isPending) return <LoadingNote />
    if (isError) return <ErrorNote onRetry={() => void refetch()} />
    if (groups.length === 0) return <EmptyNote />

    return groups.map((group) => {
      const headingId = `${headingPrefix}-${group.key}`

      return (
        <div key={group.key} className="pb-snug">
          {/* Dùng `p` + `aria-labelledby` chứ không dùng thẻ heading: thanh bên
              nằm ngoài dòng nội dung chính, chen h2/h3 vào đây sẽ làm rối bậc
              tiêu đề của chính màn hình đang mở. */}
          <p
            id={headingId}
            className="font-display px-snug pt-snug pb-hair text-note font-semibold text-moss"
          >
            {group.label}
          </p>

          <ul aria-labelledby={headingId} className="space-y-hair">
            {group.conversations.map((conversation) => {
              const isActive = conversation.conversation_id === activeConversationId

              return (
                <li key={conversation.conversation_id}>
                  <Link
                    to={`/chat/${encodeURIComponent(conversation.conversation_id)}`}
                    onClick={onNavigate}
                    aria-current={isActive ? 'page' : undefined}
                    // `pl-tight` cộng nét dọc 4px cho ra đúng 12px như lề của
                    // nhãn nhóm phía trên, nên chữ của cả hai thẳng một trục.
                    className={`font-display flex min-h-touch items-center rounded-lg border-l-4 py-tight pr-snug pl-tight text-question text-ink no-underline ${
                      isActive
                        ? 'border-medical bg-rule font-semibold'
                        : 'border-transparent'
                    }`}
                  >
                    {/* Cắt ở dòng thứ hai. Tiêu đề dài tới 60 ký tự theo mục 6,
                        để chạy hết thì một phiên chiếm bốn dòng và danh sách
                        không còn quét mắt được nữa. */}
                    <span className="line-clamp-2">{conversation.title}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )
    })
  }

  return (
    // `min-h-0` là bắt buộc: thiếu nó thì flex item không co lại được và phần
    // cuộn tràn ra ngoài, đẩy khối hồ sơ ở đáy rơi khỏi màn hình.
    <nav
      aria-label="Hội thoại đã lưu"
      className="min-h-0 flex-1 overflow-y-auto px-tight"
    >
      {content()}
    </nav>
  )
}
