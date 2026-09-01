/**
 * Ba minh họa phẳng, dùng chung một bảng màu và một luật dựng hình.
 *
 * LUẬT DỰNG HÌNH — bốn điều, và cả bốn đều có lý do:
 *
 *   1. PHẲNG HOÀN TOÀN. Không đổ bóng, không chuyển sắc, không viền mảnh. Mọi
 *      hình là một mảng màu đặc hoặc một nét dày. Nét mảnh và bóng nhạt là thứ
 *      đầu tiên biến mất với mắt 45–70 tuổi, và ở cỡ nhỏ chúng chỉ làm hình
 *      thành một vệt bẩn.
 *
 *   2. LÀ MỘT VẬT SÁNG, ĐẶT LÊN NỀN NÀO CŨNG ĐƯỢC. Mảng "giấy" dùng bậc giấy
 *      sáng và nét vẽ dùng mực — cả hai CỐ ĐỊNH, không lật theo chế độ
 *      sáng/tối. Nếu để giấy đi theo `--color-surface` thì ở chế độ tối mảng
 *      giấy hoá mực và nét mực vẽ trên nó biến mất. Minh họa vì thế trông như
 *      một hình dán: nó tự đủ sáng, nên nó đọc được cả trên giấy nền sáng lẫn
 *      trên mực đặc mà không cần hai phiên bản.
 *
 *      Chín giá trị đó khai ở `index.css` dưới tên `--color-art-*`, không gõ
 *      thẳng vào `fill=` ở đây: mã màu của cả ứng dụng nằm trong đúng một
 *      file, kể cả những mã cố tình không lật theo chế độ.
 *
 *   3. CHỈ DÙNG BỐN GIÁ TRỊ CỦA BẢNG MỚI: xanh công vụ, tím xuất xứ, mực và
 *      giấy. Không thêm màu nào ngoài bảng — mỗi màu đã mang sẵn một nghĩa
 *      trong sản phẩm và minh họa không được phép dựng ra một nghĩa thứ năm.
 *      Vàng bút dạ và đỏ cấp cứu KHÔNG có mặt ở đây: hai màu đó chỉ được xuất
 *      hiện đúng lúc chúng đang nói một điều, mà một hình trang trí thì không
 *      nói điều gì.
 *
 *   4. `aria-hidden`. Minh họa không mang thông tin nào mà chữ bên cạnh chưa
 *      nói. Trình đọc màn hình đọc chữ, không đọc hình.
 *
 * KHÔNG ĐẶT CẠNH KHỐI CẢNH BÁO CẤP CỨU. Cùng một luật với nét sen ở `Sen.tsx`:
 * một hình minh họa dễ chịu đứng cạnh dòng "dấu hiệu này cần được khám ngay"
 * là đùa cợt với người có thể đang nguy hiểm thật.
 *
 * KHÁC NÉT SEN CHỖ NÀO: sen là dấu hiệu của luồng bệnh nhân, nó lấp một khoảng
 * trống và xuất hiện đúng ở hai chỗ đã liệt kê trong `Sen.tsx`. Ba hình dưới
 * đây là minh họa nội dung — chúng minh hoạ cho một ý đang được nói bằng chữ
 * ngay cạnh. Đừng trộn hai vai đó.
 */

/**
 * Bảng màu chung. Cố định ở cả hai chế độ — xem luật 2 ở đầu file.
 *
 * SÁU KHÓA GIỮ NGUYÊN TÊN, GIÁ TRỊ ĐỔI HẾT sang bảng màu mới. Giữ tên để phần
 * vẽ bên dưới không phải sửa từng thuộc tính `fill`; nhưng đọc tên xong đừng
 * đoán màu, đọc giá trị ở `--color-art-*` trong `index.css`:
 *
 *   navy      nay là MỰC        `--color-art-ink`
 *   mint      nay là XANH CÔNG VỤ đặc
 *   mintSoft  nay là bậc nhạt của xanh
 *   coral     nay là TÍM XUẤT XỨ (đúng như `--color-coral-deep` cũng là tím)
 *   sand      nay là tím pha về phía giấy — mảng nền tròn của mỗi hình
 *   paper     nay là bậc giấy `--color-art-paper`, không còn trắng tuyệt đối
 */
const C = {
  navy: 'var(--color-art-ink)',
  mint: 'var(--color-art-green)',
  mintSoft: 'var(--color-art-green-soft)',
  coral: 'var(--color-art-purple)',
  sand: 'var(--color-art-purple-pale)',
  paper: 'var(--color-art-paper)',
}

type IllustrationProps = {
  /** Cạnh dài của khung, đơn vị px. Hình luôn giữ đúng tỷ lệ của nó. */
  size?: number
  className?: string
}

/**
 * Một người ngồi đọc tài liệu.
 *
 * Dùng ở phần "Cách hoạt động" của trang giới thiệu, bước đọc câu trả lời.
 */
export function ReadingPerson({ size = 200, className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      role="presentation"
      className={className}
    >
      {/* Mảng nền tròn — chỗ tựa của cả hình, để nó không trôi trên trang. */}
      <circle cx="100" cy="100" r="88" fill={C.sand} />

      {/* Ghế */}
      <path d="M52 150h96v10H52z" fill={C.navy} />
      <path d="M60 118h80v34H60z" fill={C.coral} />

      {/* Thân người */}
      <path d="M74 92h52v34a10 10 0 0 1-10 10H84a10 10 0 0 1-10-10V92Z" fill={C.mint} />
      {/* Đầu */}
      <circle cx="100" cy="72" r="20" fill={C.navy} />
      {/* Tóc — một mảng phủ nửa trên, giữ hình phẳng */}
      <path d="M80 70a20 20 0 0 1 40 0Z" fill={C.navy} />

      {/* Tài liệu đang cầm: hai trang mở, giấy trắng nét navy */}
      <path d="M58 128h84v40H58z" fill={C.paper} />
      <path d="M100 128v40" stroke={C.navy} strokeWidth="4" />
      <path
        d="M68 140h22M68 150h22M110 140h22M110 150h22"
        stroke={C.navy}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Một chồng tài liệu, tờ trên cùng có con dấu.
 *
 * Dùng ở phần "Nguồn tài liệu" của trang giới thiệu và ở màn thư viện học.
 * Con dấu coral là chi tiết duy nhất mang màu nóng, nên mắt rơi vào đó trước —
 * đúng chỗ mà cả phần nội dung đang nói tới: văn bản có số hiệu.
 */
export function DocumentStack({ size = 200, className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      role="presentation"
      className={className}
    >
      <circle cx="100" cy="100" r="88" fill={C.mintSoft} />

      {/* Ba tờ xếp lệch nhau, tờ dưới cùng lệch nhiều nhất */}
      <path d="M42 138h104v22H42z" fill={C.navy} />
      <path d="M48 62h96v78H48z" fill={C.sand} />
      <path d="M56 52h96v78H56z" fill={C.paper} />

      {/* Dòng chữ trên tờ trên cùng */}
      <path
        d="M70 74h68M70 88h68M70 102h44"
        stroke={C.navy}
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* Con dấu: vòng tròn coral và một vạch bên trong */}
      <circle cx="126" cy="108" r="16" fill={C.coral} />
      <path
        d="M118 108h16"
        stroke={C.navy}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Một bàn tay cầm điện thoại, trên màn hình là một câu hỏi và một câu trả lời.
 *
 * Dùng ở phần "Cách hoạt động", bước đặt câu hỏi, và ở trạng thái rỗng lớn của
 * màn thư viện học.
 */
export function PhoneInHand({ size = 200, className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      role="presentation"
      className={className}
    >
      <circle cx="100" cy="100" r="88" fill={C.sand} />

      {/* Điện thoại */}
      <rect x="62" y="28" width="76" height="128" fill={C.navy} />
      <rect x="70" y="40" width="60" height="100" fill={C.paper} />

      {/* Bong bóng câu hỏi — mint, lệch trái */}
      <rect x="78" y="50" width="36" height="14" fill={C.mint} />
      {/* Bong bóng câu trả lời — hai dòng, lệch phải */}
      <rect x="86" y="72" width="36" height="12" fill={C.navy} />
      <rect x="86" y="90" width="28" height="12" fill={C.navy} />
      {/* Viên thuốc nguồn tài liệu — coral, dòng cuối */}
      <rect x="78" y="112" width="30" height="12" fill={C.coral} />

      {/* Bàn tay: một mảng đặc ôm nửa dưới máy, ngón cái vắt lên */}
      <path
        d="M52 132h44v40a10 10 0 0 1-10 10H62a10 10 0 0 1-10-10v-40Z"
        fill={C.coral}
      />
      <path
        d="M96 140h18a10 10 0 0 1 0 20H96v-20Z"
        fill={C.coral}
      />
    </svg>
  )
}
