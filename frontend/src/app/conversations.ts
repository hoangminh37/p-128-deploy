/**
 * Cache lịch sử hội thoại (mục 6 hợp đồng API).
 *
 * Khóa cache để ở đây chứ không gõ tay tại từng chỗ dùng: thanh bên, thanh tiêu
 * đề và màn hỏi đáp đều đọc cùng một danh sách, mà ba nơi gõ ba mảng giống nhau
 * thì sớm muộn cũng lệch — lúc lệch thì thanh bên hiện một đằng, tiêu đề hiện
 * một nẻo, và không ai hiểu vì sao. Cùng lối mà `patient/context.ts` đang dùng
 * cho khóa hồ sơ.
 */
import { useQuery } from '@tanstack/react-query'

import { listConversations, type ApiError } from '../lib/api'
import type { ConversationList } from '../lib/schemas'
import { usePatient } from '../patient/context'

export function conversationsQueryKey(patientId: string | null) {
  return ['conversations', patientId] as const
}

export function conversationDetailQueryKey(
  patientId: string | null,
  conversationId: string | null,
) {
  return ['conversation-detail', patientId, conversationId] as const
}

/**
 * Danh sách phiên của bệnh nhân đang dùng máy này.
 *
 * Chưa có `patient_id` thì không gọi API — người dùng chưa khai hồ sơ thì cũng
 * chưa có phiên nào để mà đọc. Lúc đó query đứng ở trạng thái `pending` mãi,
 * nên chỗ hiển thị phải tự xét `patientId` trước khi xét `isPending`.
 */
export function useConversations() {
  const { patientId } = usePatient()

  return useQuery<ConversationList, ApiError>({
    queryKey: conversationsQueryKey(patientId),
    enabled: patientId !== null,
    queryFn: async () => {
      // `enabled` đã chặn, nhánh này chỉ để thỏa kiểu.
      if (patientId === null) return { conversations: [] }
      return listConversations(patientId)
    },
  })
}
