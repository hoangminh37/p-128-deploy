/**
 * Danh sách hội thoại trên thanh bên, gom theo ba mốc thời gian.
 *
 * CỠ CHỮ: mọi dòng ở đây tối thiểu 15px. Danh sách bên lề rất dễ bị thu nhỏ cho
 * "gọn", nhưng người dùng 45–70 tuổi mà không đọc được tiêu đề thì cả cái danh
 * sách thành vô dụng. Tiêu đề phiên dùng cỡ `question` 16px, nhãn nhóm và các
 * dòng trạng thái dùng cỡ `note` 15px. Không có gì nhỏ hơn.
 *
 * MÀU CHỮ TRÊN NỀN NAVY, đúng hai bậc: `mist` 6.80:1 cho mục chưa chọn và cho
 * nhãn nhóm, `white` cho mục đang mở. Không có bậc thứ ba nào nhạt hơn `mist`.
 *
 * PHIÊN ĐANG MỞ: nền trắng mờ 10% (ra #233B58) và chữ đổi sang `white` —
 * 11.43:1 trên chính nền đó. Hai tín hiệu cùng lúc chứ không chỉ một: nền mờ
 * trên navy chênh rất ít, mắt kém có thể bỏ qua, nên độ sáng của chữ phải tự nó
 * cũng nói ra được mục nào đang mở.
 */
import { useId, useMemo } from 'react'
import { Link } from 'react-router-dom'

import { useConversations } from '../app/conversations'
import { groupConversations } from '../lib/conversationGroups'
import { usePatient } from '../patient/context'
import { EmptyState } from './EmptyState'

/**
 * Trạng thái rỗng.
 *
 * Danh sách trống mà để trắng thì người dùng không biết chỗ đó dùng để làm gì,
 * hay là ứng dụng đang hỏng. Một dòng nói rõ khi nào nó có nội dung.
 */
function EmptyNote() {
  return (
    <EmptyState
      tone="dark"
      compact
      title="Chưa có hội thoại nào"
      body="Sau khi bạn hỏi câu đầu tiên, hội thoại sẽ được lưu lại ở đây."
    />
  )
}

function LoadingNote() {
  return (
    <p role="status" className="font-display px-snug py-cozy text-note text-mist">
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
      {/* `alert` là màu của nền sáng, trên navy nó chỉ đạt 1.55:1 và biến mất.
          Ở đây dùng `coral` (6.62:1 trên ink) — cùng vai "có gì đó không ổn",
          nhưng đọc được. */}
      <p className="font-display text-note font-semibold text-coral">
        Chưa đọc được danh sách hội thoại.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="motion-press font-display mt-tight min-h-touch rounded-pill border-2 border-mist px-snug text-note font-semibold text-white enabled:hover:bg-white/10"
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
            className="font-display px-snug pt-snug pb-hair text-note font-semibold text-mist"
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
                    className={`font-display flex min-h-touch items-center rounded-icon px-snug py-tight text-question no-underline ${
                      isActive
                        ? 'bg-white/10 font-semibold text-white hover:bg-white/15'
                        : 'text-mist hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {/* Cắt ở dòng thứ hai. Tiêu đề dài tới 60 ký tự theo mục 7,
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
