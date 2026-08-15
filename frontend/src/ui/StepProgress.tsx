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
      <p role="status" className="font-display text-question text-moss">
        Bước {current} trên {total} · {title}
      </p>

      <div aria-hidden="true" className="mt-tight flex gap-tight">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={`h-2 flex-1 rounded-full ${
              index < current ? 'bg-medical' : 'bg-rule'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
