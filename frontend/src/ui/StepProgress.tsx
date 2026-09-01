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
          — câu người dùng hỏi trước khi hỏi "bước này là gì".

          Vạch mảnh 3px, KHÔNG bo góc: ở bản mẫu tiến trình là một dãy GẠCH
          CHÂN, không phải một dãy viên thuốc. Đoạn đã qua dùng `--xanh` đặc,
          đoạn chưa tới dùng `--ke-dam`. Cả dãy `aria-hidden`, dòng chữ ngay
          dưới mới là bản chính. */}
      <div aria-hidden="true" style={{ display: 'flex', gap: 6 }}>
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            style={{
              height: 3,
              flex: 1,
              background: index < current ? 'var(--xanh)' : 'var(--ke-dam)',
            }}
          />
        ))}
      </div>

      <p role="status" className="lab" style={{ marginTop: 14 }}>
        Bước {current} trên {total}
      </p>
      <h2 style={{ fontSize: 'var(--t-h3)', marginTop: 4 }}>{title}</h2>
    </div>
  )
}
