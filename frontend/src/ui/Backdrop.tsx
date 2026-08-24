/**
 * Họa tiết nền, hai bản theo họ nền của chỗ đặt nó.
 *
 *   `ink`    — vòng tròn `ink-soft`, một dải cong, và lưới chấm 3×2. Dùng ở
 *              trang giới thiệu, nửa trái màn đăng nhập, tổng quan biên tập.
 *   `canvas` — vài hình khối rất nhạt trên nền vùng làm việc.
 *
 * NẰM DƯỚI NỘI DUNG VÀ KHÔNG CẢN THAO TÁC. Ba điều bảo đảm việc đó, cả ba
 * đều bắt buộc, gỡ cái nào cũng hỏng:
 *
 *   `absolute inset-0`   — nhấc hẳn khỏi luồng, không chiếm chỗ của gì cả.
 *   `-z-0` cộng `isolate` ở chỗ gọi, và `relative z-10` ở phần nội dung.
 *   `pointer-events-none` — chuột và ngón tay đi xuyên qua. Thiếu dòng này
 *                           thì vòng tròn phủ lên nút và cú bấm rơi vào một
 *                           hình trang trí.
 *
 * `aria-hidden` vì đây thuần là hình nền. Trình đọc màn hình không có gì để
 * nói về nó, và nói ra thì chỉ chen vào giữa nội dung thật.
 *
 * TƯƠNG PHẢN — luật bất di bất dịch của file này: hình khối KHÔNG ĐƯỢC làm
 * giảm tỷ lệ của bất kỳ cặp chữ nào đi qua nó.
 *
 *   Trên nền canvas, mọi hình đều SÁNG HƠN nền. Bắt buộc phải thế: `slate`
 *   trên canvas chỉ đạt 4.58:1, sát ngưỡng, nên một mảng tối hơn dù chỉ một
 *   phần trăm cũng đánh tụt chữ phụ ở đúng chỗ nó đi qua. Đi lên phía trắng
 *   thì mọi cặp chỉ có thể tốt lên — xem bảng ở `--color-veil` trong
 *   `index.css`.
 *
 *   Trên nền ink, hình khối dùng `ink-soft` (#123258) và một bậc trung gian
 *   #16395F. Chữ `mist` — bậc nhạt nhất được phép trên nền tối — đạt 5.72:1
 *   và 5.20:1 trên hai màu đó. Lưới chấm `dot` (#1B4470) thì KHÔNG an toàn ở
 *   độ đặc hoàn toàn: `mist` trên nó chỉ còn 4.40:1, dưới ngưỡng 4.5:1. Vì
 *   vậy lưới chấm chạy ở `opacity 0.75`, composite ra #173C65, và `mist` trở
 *   lại 4.96:1. Đừng đẩy độ đặc đó lên nữa.
 */

export type BackdropTone = 'ink' | 'canvas'

/** Lưới chấm 3×2 ở góc. Xem ghi chú độ đặc ở đầu file trước khi đổi. */
function DotGrid() {
  return (
    <g fill="var(--color-dot)" opacity={0.75}>
      {[0, 1, 2].map((column) =>
        [0, 1].map((row) => (
          <circle
            key={`${column}-${row}`}
            cx={48 + column * 30}
            cy={48 + row * 30}
            r={5}
          />
        )),
      )}
    </g>
  )
}

function InkShapes() {
  return (
    <>
      {/* Hai vòng tròn `ink-soft`. Chênh với nền `ink` rất ít — cố ý: đây
          là họa tiết, không phải nội dung, nên nó chỉ được lộ ra khi mắt
          đã đọc xong chữ. */}
      <circle cx="690" cy="80" r="230" fill="var(--color-ink-soft)" />
      <circle cx="120" cy="540" r="180" fill="var(--color-ink-soft)" />

      {/* Hai hình thêm vào để khoảng giữa bớt trống. Cả hai đều là NÉT, không
          phải mảng đặc: một vòng tròn rỗng và một dải cong. Nét mảnh thì chữ
          đi qua chỉ chạm vào 2–3px chứ không nằm hẳn trên một mảng khác màu,
          và mắt đọc được chúng như đường kẻ chứ không như vệt bẩn. */}
      <circle
        cx="560"
        cy="430"
        r="150"
        fill="none"
        stroke="#16395F"
        strokeWidth={3}
      />
      <path
        d="M-40 300 C 180 210, 320 400, 560 320 S 900 150, 1000 240"
        fill="none"
        stroke="var(--color-ink-soft)"
        strokeWidth={2.5}
      />

      <DotGrid />
    </>
  )
}

function CanvasShapes() {
  return (
    <>
      {/* Ba mảng lớn, đều sáng hơn nền canvas. Neo về hai mép và góc dưới —
          cột chữ nằm giữa trang từ 1024px trở lên, nên phần lớn diện tích hình
          rơi vào lề trống hai bên. */}
      <circle cx="60" cy="120" r="260" fill="var(--color-veil)" />
      <circle cx="770" cy="470" r="300" fill="var(--color-veil-soft)" />
      <path
        d="M0 600 C 160 470, 340 560, 520 470 S 760 330, 800 380 L 800 600 Z"
        fill="var(--color-veil)"
      />

      {/* Một dải cong mảnh cho phần giữa đỡ phẳng. Cùng màu `veil`, nên nó
          cũng sáng hơn nền và không đụng gì tới tương phản chữ. */}
      <path
        d="M-40 210 C 200 120, 380 300, 620 200 S 900 90, 1000 170"
        fill="none"
        stroke="var(--color-veil)"
        strokeWidth={26}
        strokeLinecap="round"
      />
    </>
  )
}

export function Backdrop({
  tone = 'ink',
  className,
}: {
  tone?: BackdropTone
  className?: string
}) {
  /**
   * `preserveAspectRatio="none"` KHÔNG dùng ở đây: kéo giãn không đều sẽ biến
   * vòng tròn thành hình bầu dục méo. Thay vào đó svg phủ toàn khung theo lối
   * `slice` — giữ đúng tỷ lệ, thừa đâu cắt đó. Chính chỗ bị cắt tạo cảm giác
   * họa tiết lớn hơn khung, thay vì mấy hình nhỏ lọt thỏm giữa nền.
   */
  const svg = (
    <svg
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
    >
      {tone === 'ink' ? <InkShapes /> : <CanvasShapes />}
    </svg>
  )

  /**
   * Bản `ink` dùng ở những khối có chiều cao hữu hạn — phần dẫn của trang giới
   * thiệu, nửa màn đăng nhập, đầu màn tổng quan — nên nó phủ đúng khối đó.
   *
   * Bản `canvas` thì nằm sau MỘT VÙNG NỘI DUNG CUỘN ĐƯỢC, có thể dài hàng chục
   * màn hình. Phủ cả chiều dài đó thì `slice` phóng hình lên theo chiều cao và
   * người dùng chỉ còn thấy một mảng màu trơn. Nên lớp trong dùng `sticky` cộng
   * `h-dvh`: hình giữ đúng một khung nhìn và đứng yên trong lúc chữ trôi qua —
   * đúng nghĩa "đặt cố định phía sau nội dung".
   *
   * `sticky` chứ KHÔNG phải `fixed`: `fixed` thoát khỏi mọi `overflow-hidden`
   * của tổ tiên, nên hình sẽ tràn ra ngoài vùng nội dung và phủ luôn lên thanh
   * bên navy.
   *
   * `rounded-[inherit]` để phần bị cắt ôm đúng góc bo trái của vùng nội dung.
   */
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-0 overflow-hidden rounded-[inherit] ${className ?? ''}`}
    >
      {tone === 'canvas' ? (
        <div className="sticky top-0 h-dvh w-full">{svg}</div>
      ) : (
        svg
      )}
    </div>
  )
}
