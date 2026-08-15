/**
 * Tên hai bệnh trong phạm vi dự án, viết ngắn.
 *
 * `ProfileScreen` cố tình giữ bảng nhãn riêng, dài hơn và có kèm tên dân gian
 * ("tiểu đường", "cao huyết áp"). Ở màn khai hồ sơ người dùng cần NHẬN RA mình
 * thuộc nhóm nào nên phải nói cả hai cách gọi; còn ở khung ứng dụng thì chữ chỉ
 * nhắc lại ngữ cảnh đang mở và phải lọt vào một thanh bên 252px, nên bản ngắn
 * mới vừa. Hai chỗ khác mục đích nên để hai bảng, không gộp.
 */
import type { PrimaryCondition } from './schemas'

export const CONDITION_LABEL: Record<PrimaryCondition, string> = {
  hypertension: 'Tăng huyết áp',
  type2_diabetes: 'Đái tháo đường típ 2',
}
