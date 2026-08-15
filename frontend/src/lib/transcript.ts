/**
 * Sao chép và lưu nội dung ra ngoài ứng dụng.
 *
 * Dùng chung cho hai chỗ: hai nút biểu tượng trên thanh tiêu đề (bản rộng) và
 * hai nút chữ ở cuối mỗi câu trả lời (bản hẹp). Hai chỗ khác nhau về phạm vi —
 * một cái lấy cả trang, một cái lấy đúng một lượt — nhưng phần đưa chữ ra ngoài
 * thì y hệt nhau, nên nó nằm ở đây.
 *
 * Vì sao người bệnh cần hai nút này: câu trả lời kèm số hiệu văn bản Bộ Y tế là
 * thứ mang đi hỏi lại bác sĩ được. Chép ra giấy thì sai số hiệu, mà chụp màn
 * hình thì bác sĩ không tra được.
 */

/** Tên tệp khi lưu: có ngày để người dùng xếp được nhiều lần lưu theo thứ tự. */
export function transcriptFileName(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `hoi-thoai-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.txt`
}

/**
 * Chép vào clipboard. Trả về `false` khi trình duyệt từ chối.
 *
 * Không nuốt lỗi: clipboard bị chặn khi trang không chạy trên HTTPS hoặc người
 * dùng đã từ chối quyền. Bấm mà im lặng thì người dùng tưởng đã chép được, tới
 * lúc dán ra chỗ khác mới biết là không.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Tải chữ về máy dưới dạng tệp .txt. */
export function downloadText(text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = transcriptFileName()
  document.body.appendChild(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(url)
}
