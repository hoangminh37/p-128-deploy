/**
 * Ba văn bản nguồn của hệ thống.
 *
 * Bản mẫu ghi cứng ba số hiệu này ở nửa trái màn `id="dn"`. Chúng là dữ liệu
 * THẬT — ba văn bản mà toàn bộ câu trả lời của trợ lý dựa vào — chứ không phải
 * chữ mẫu, nên chúng ở lại. Khai một chỗ vì hai màn cùng bày chúng ra: trang
 * giới thiệu và màn đăng nhập.
 */
export const VAN_BAN_NGUON: readonly { code: string; label: string }[] = [
  { code: '3192/QĐ-BYT', label: 'Tăng huyết áp' },
  { code: '5481/QĐ-BYT', label: 'Đái tháo đường típ 2' },
  { code: '1353/QĐ-BYT', label: 'Sửa đổi 5481, dùng kèm' },
]
