/**
 * Danh sách hội thoại trên thanh bên.
 *
 * DỰNG TỪ BẢN MẪU. Script dựng khung ở cuối `docs/design/eduhealth-ai.html`
 * đổ vào `<nav>` của thanh bên đúng hai loại nút:
 *
 *   `<div class="nav-nhom">Hôm nay</div>`   nhãn mốc thời gian
 *   `<a class="hoi">…</a>`                  một dòng hội thoại
 *
 * `.hoi` trong bản mẫu là `display:block; height:28px; line-height:28px;
 * white-space:nowrap; overflow:hidden; text-overflow:ellipsis` — một dòng, cao
 * cố định, cắt bằng dấu ba chấm. Mọi con số đó nay nằm ở `index.css`, nên ở
 * đây chỉ còn tên lớp.
 *
 * 28px THẤP HƠN NGƯỠNG CHẠM 44px, và bản mẫu cố ý như vậy: mục lục dài mười
 * lăm dòng mà mỗi dòng 44px thì chỉ còn cách cuộn liên tục, và cuộn thì mất
 * hẳn cái nhìn tổng thể mà mục lục sinh ra để cho. Bù lại, mọi ĐÍCH CHẠM CHÍNH
 * của luồng bệnh nhân — cụm `.acts` ngay phía trên, khối `.hoso` ở đáy — vẫn
 * giữ đủ 44px.
 *
 * Mục đang mở đánh dấu bằng `aria-current="page"`; màu và trọng lượng chữ do
 * `.side nav a[aria-current="page"]` của bản mẫu lo.
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
    <p className="lab" style={{ padding: '14px 10px', lineHeight: 1.6 }}>
      Chưa có hội thoại nào. Sau khi bạn hỏi câu đầu tiên, hội thoại sẽ được lưu
      lại ở đây.
    </p>
  )
}

function LoadingNote() {
  return (
    <p role="status" className="lab" style={{ padding: '14px 10px' }}>
      Đang mở danh sách hội thoại…
    </p>
  )
}

/**
 * Lỗi đọc danh sách.
 *
 * Cố ý gọn hơn `ErrorNotice`: hỏng thanh bên không chặn người dùng hỏi tiếp,
 * nên nó không được chiếm chỗ như một sự cố lớn. Vẫn phải có nút thử lại, vì
 * danh sách trắng trơn nhìn y hệt trạng thái rỗng.
 */
function ErrorNote({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ padding: '14px 10px' }}>
      {/* Vàng chứ không phải đỏ: đỏ trong bản mẫu CHỈ dành cho dấu hiệu nguy
          cấp và nhãn lỗi thật. Một danh sách chưa đọc được là việc chưa xong. */}
      <p className="lab" style={{ color: 'var(--ink)' }}>
        Chưa đọc được danh sách hội thoại.
      </p>
      <button type="button" onClick={onRetry} className="btn sm gh" style={{ marginTop: 8 }}>
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
    // Chưa có patient_id thì query bị `enabled: false` nên đứng ở `pending`
    // mãi. Xét trước `isPending`, nếu không thanh bên sẽ báo "đang mở" vĩnh viễn.
    if (patientId === null) return <EmptyNote />
    if (isPending) return <LoadingNote />
    if (isError) return <ErrorNote onRetry={() => void refetch()} />
    if (groups.length === 0) return <EmptyNote />

    return groups.map((group) => {
      const headingId = `${headingPrefix}-${group.key}`

      return (
        <div key={group.key}>
          {/* `.nav-nhom` của bản mẫu: Newsreader nghiêng, 12px, màu `--xam`.
              Dùng `p` + `aria-labelledby` chứ không dùng thẻ heading — thanh
              bên nằm ngoài dòng nội dung chính, chen h2/h3 vào đây sẽ làm rối
              bậc tiêu đề của chính màn hình đang mở. */}
          <p id={headingId} className="nav-nhom">
            {group.label}
          </p>

          <ul aria-labelledby={headingId} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {group.conversations.map((conversation) => (
              <li key={conversation.conversation_id}>
                <Link
                  to={`/chat/${encodeURIComponent(conversation.conversation_id)}`}
                  onClick={onNavigate}
                  aria-current={
                    conversation.conversation_id === activeConversationId ? 'page' : undefined
                  }
                  title={conversation.title}
                  className="hoi"
                >
                  {conversation.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )
    })
  }

  return <nav aria-label="Hội thoại đã lưu">{content()}</nav>
}
