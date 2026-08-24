/**
 * Thanh tiến trình của form nhiều bước.
 *
 * Hai lớp cùng nói một điều: một dòng chữ và mấy vạch màu. Dòng chữ là bản
 * chính — người dùng trình đọc màn hình, và người không phân biệt được màu, đều
 * chỉ có nó. Mấy vạch là bản phụ, đã `aria-hidden` để không bị đọc lặp lại.
 *
 * Dòng chữ đặt trong vùng `role="status"` nên mỗi lần đổi bước là trình đọc màn
 * hình nói ra bước mới. Không có nó thì người dùng bấm "Tiếp tục" và không có
 * gì báo là đã sang bước khác — nội dung đổi mà focus vẫn nằm nguyên trên nút.
 */
export function StepProgress({
  current,
  total,
  title,
}: {
  /** Bước hiện tại, đếm từ 1 để hiện thẳng ra cho người dùng. */
  current: number
  total: number
  title: string
}) {
  return (
    <div>
      {/* Thanh tiến trình ĐỨNG TRƯỚC tiêu đề bước: nó trả lời "còn bao xa nữa"
          — câu người dùng hỏi trước khi hỏi "bước này là gì". */}
      <div aria-hidden="true" className="flex gap-tight">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            // Đoạn chưa tới dùng `line` chứ không dùng `white`: nền của màn hồ
            // sơ là `canvas`, mà trắng trên canvas gần như không thấy. `line`
            // được phép ở đây vì hai vạch này đã `aria-hidden` và dòng chữ ngay
            // dưới mới là bản chính — xem ghi chú đầu file.
            className={`h-2 flex-1 rounded-pill ${
              index < current ? 'bg-mint' : 'bg-line'
            }`}
          />
        ))}
      </div>

      <p role="status" className="font-display mt-snug text-question text-slate">
        Bước {current} trên {total}
      </p>
      <h2 className="mt-hair text-heading font-semibold text-ink">{title}</h2>
    </div>
  )
}
