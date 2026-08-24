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
 *   2. LÀ MỘT VẬT SÁNG, ĐẶT LÊN NỀN NÀO CŨNG ĐƯỢC. Mảng "giấy" dùng trắng đặc
 *      và nét vẽ dùng navy — cả hai CỐ ĐỊNH, không lật theo chế độ sáng/tối.
 *      Nếu để giấy đi theo `--color-surface` thì ở chế độ tối giấy thành navy
 *      và nét navy trên nó biến mất. Minh họa vì thế trông như một hình dán:
 *      nó tự đủ sáng, nên nó đọc được cả trên `canvas` sáng lẫn trên `ink` tối
 *      mà không cần hai phiên bản.
 *
 *   3. CHỈ DÙNG MINT, CORAL, SAND, NAVY. Không thêm màu nào ngoài bảng — ba
 *      màu nhấn đã mang sẵn nghĩa trong sản phẩm và minh họa không được phép
 *      dựng ra một nghĩa thứ tư.
 *
 *   4. `aria-hidden`. Minh họa không mang thông tin nào mà chữ bên cạnh chưa
 *      nói. Trình đọc màn hình đọc chữ, không đọc hình.
 *
 * KHÔNG ĐẶT CẠNH KHỐI CẢNH BÁO CẤP CỨU. Cùng một luật với linh vật Sen ở
 * `Mascot.tsx`: một hình minh họa dễ chịu đứng cạnh dòng "dấu hiệu này cần được
 * khám ngay" là đùa cợt với người có thể đang nguy hiểm thật.
 *
 * KHÁC LINH VẬT SEN CHỖ NÀO: Sen là nhân vật, nó có mặt và nó xuất hiện đúng ở
 * bốn chỗ đã liệt kê trong `Mascot.tsx`. Ba hình dưới đây là minh họa nội dung
 * — chúng minh hoạ cho một ý đang được nói bằng chữ ngay cạnh, và chúng không
 * có mặt mũi. Đừng trộn hai vai đó.
 */

/** Bảng màu chung. Cố định ở cả hai chế độ — xem luật 2 ở đầu file. */
const C = {
  navy: '#0B2545',
  mint: '#35D0B6',
  mintSoft: '#5FE0C9',
  coral: '#FF8A5B',
  sand: '#FFE3B8',
  paper: '#FFFFFF',
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
      <rect x="62" y="28" width="76" height="128" rx="12" fill={C.navy} />
      <rect x="70" y="40" width="60" height="100" rx="6" fill={C.paper} />

      {/* Bong bóng câu hỏi — mint, lệch trái */}
      <rect x="78" y="50" width="36" height="14" rx="7" fill={C.mint} />
      {/* Bong bóng câu trả lời — hai dòng, lệch phải */}
      <rect x="86" y="72" width="36" height="12" rx="6" fill={C.navy} />
      <rect x="86" y="90" width="28" height="12" rx="6" fill={C.navy} />
      {/* Viên thuốc nguồn tài liệu — coral, dòng cuối */}
      <rect x="78" y="112" width="30" height="12" rx="6" fill={C.coral} />

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
