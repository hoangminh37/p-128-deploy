/**
 * Gom danh sách hội thoại của mục 7 thành ba nhóm theo thời gian.
 *
 * Ranh giới đếm theo NGÀY LỊCH của máy người dùng, không đếm theo 24 giờ tính
 * ngược từ bây giờ. Người dùng nghĩ "hôm nay" là từ lúc ngủ dậy, nên một phiên
 * lúc 8 giờ sáng nay phải nằm ở "Hôm nay" kể cả khi bây giờ mới 9 giờ — chứ
 * không phải rơi xuống "7 ngày qua" vì chưa đủ 24 tiếng.
 */
import type { ConversationSummary } from './schemas'

export type ConversationGroupKey = 'today' | 'last_seven_days' | 'older'

export const GROUP_LABEL: Record<ConversationGroupKey, string> = {
  today: 'Hôm nay',
  last_seven_days: '7 ngày qua',
  older: 'Cũ hơn',
}

/** Thứ tự hiện trên thanh bên: gần nhất lên đầu. */
const GROUP_ORDER: readonly ConversationGroupKey[] = ['today', 'last_seven_days', 'older']

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export type ConversationGroup = {
  key: ConversationGroupKey
  label: string
  conversations: ConversationSummary[]
}

/** Nửa đêm đầu ngày, theo múi giờ của máy người dùng. */
function startOfDay(date: Date): number {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy.getTime()
}

/**
 * Mốc thời gian hỏng thì trả `NaN`, mọi phép so sánh bên dưới đều thành `false`
 * và phiên đó rơi vào "Cũ hơn". Thà xếp nhầm nhóm còn hơn để nó biến mất khỏi
 * danh sách — người dùng vẫn phải mở lại được hội thoại của mình.
 */
function groupKeyFor(lastMessageAt: string, now: Date): ConversationGroupKey {
  const timestamp = Date.parse(lastMessageAt)
  const today = startOfDay(now)

  if (timestamp >= today) return 'today'
  if (timestamp >= today - SEVEN_DAYS_MS) return 'last_seven_days'
  return 'older'
}

/** Chỉ trả về những nhóm THỰC SỰ có phiên — nhóm rỗng không được hiện tiêu đề. */
export function groupConversations(
  conversations: readonly ConversationSummary[],
  now: Date = new Date(),
): ConversationGroup[] {
  const buckets = new Map<ConversationGroupKey, ConversationSummary[]>()

  for (const conversation of conversations) {
    const key = groupKeyFor(conversation.last_message_at, now)
    const bucket = buckets.get(key)
    if (bucket === undefined) {
      buckets.set(key, [conversation])
    } else {
      bucket.push(conversation)
    }
  }

  return GROUP_ORDER.flatMap((key) => {
    const items = buckets.get(key)
    if (items === undefined || items.length === 0) return []

    // Sắp trong từng nhóm, mới nhất lên trước. Mảng này do chính hàm dựng nên
    // sắp tại chỗ không đụng vào dữ liệu cache của TanStack Query.
    items.sort((a, b) => Date.parse(b.last_message_at) - Date.parse(a.last_message_at))

    return [{ key, label: GROUP_LABEL[key], conversations: items }]
  })
}
