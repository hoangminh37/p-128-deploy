/**
 * Nhãn bệnh là dữ liệu từ registry. Nếu một bản ghi cũ chưa có nhãn, chỉ dùng
 * mã bệnh như fallback trình bày; tuyệt đối không có danh sách bệnh hardcode
 * trong frontend.
 */
export function conditionLabel(conditionId: string, resolvedLabel?: string | null): string {
  return resolvedLabel?.trim() || conditionId.replaceAll('_', ' ')
}
