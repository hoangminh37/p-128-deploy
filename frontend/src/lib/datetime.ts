/**
 * Hiển thị mốc thời gian ISO 8601 cho người đọc.
 *
 * Khu vực biên tập cần ngày giờ CHÍNH XÁC, không phải "3 ngày trước". Người
 * duyệt nội dung phải đối chiếu được với văn bản gốc và với lịch làm việc của
 * mình, mà "3 ngày trước" thì không đối chiếu được với gì cả.
 *
 * Khác hẳn thanh bên của bệnh nhân: ở đó hội thoại gom theo "Hôm nay / 7 ngày
 * qua / Cũ hơn" là đủ, vì người bệnh chỉ cần tìm lại đúng cuộc mình vừa hỏi.
 */

/** Mốc hỏng thì trả nguyên chuỗi gốc, để lỗi dữ liệu nhìn thấy được chứ không biến mất. */
function parse(iso: string): Date | null {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Ví dụ: `13/08/2026`. */
export function formatDate(iso: string): string {
  const date = parse(iso)
  if (date === null) return iso

  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Ví dụ: `13/08/2026 08:30`. */
export function formatDateTime(iso: string): string {
  const date = parse(iso)
  if (date === null) return iso

  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
