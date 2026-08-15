/**
 * Nhãn tiếng Việt cho enum của mục 8.
 *
 * Để riêng khỏi `ui/EditorBadges.tsx` vì hai chỗ cùng cần: nhãn hiển thị trên
 * badge, và câu "Mục này đã …" ở màn duyệt chi tiết. Ngoài ra file component
 * chỉ được export component thì Fast Refresh của Vite mới chạy đúng.
 *
 * Giọng chữ ở đây là giọng chuyên môn: người đọc là dược sĩ hoặc bác sĩ, không
 * cần diễn giải như với bệnh nhân.
 */
import type { EditorItemOrigin, EditorItemStatus } from './schemas'

export const STATUS_LABEL: Record<EditorItemStatus, string> = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Đã từ chối',
}

export const ORIGIN_LABEL: Record<EditorItemOrigin, string> = {
  question_log: 'Từ câu hỏi bệnh nhân',
  editor_upload: 'Biên tập viên thêm',
}
