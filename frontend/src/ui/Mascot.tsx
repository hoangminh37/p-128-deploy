/**
 * Sen — linh vật của ứng dụng, một búp sen chưa nở.
 *
 * VÌ SAO LÀ BÚP SEN CHỨ KHÔNG PHẢI HOA ĐÃ NỞ: búp là thứ đang lớn lên, còn
 * hoa nở là thứ đã xong. Người dùng ở đây đang sống chung với một bệnh mãn
 * tính, tức là đang trong một quá trình chưa kết thúc — hình phải nói được
 * điều đó chứ không hứa hẹn một cái kết.
 *
 * CHỈ DÙNG Ở BỐN CHỖ, và danh sách này là đóng:
 *
 *   1. Trang giới thiệu   — chỗ duy nhất linh vật được phép lớn và vui.
 *   2. Mọi trạng thái rỗng — nơi màn hình không có gì, và một khoảng trắng
 *                            trơ trọi làm người dùng tưởng ứng dụng hỏng.
 *   3. Khối trạng thái `referral` — thư viện chưa có tài liệu; người hỏi
 *                            không làm gì sai, và hình phải nói ra điều đó.
 *   4. Khối chờ câu trả lời — chỗ DUY NHẤT linh vật được phép chuyển động, và
 *                            chỉ đúng một kiểu: nhịp thở 2 giây, biên độ 4,5%
 *                            (`animate-breathe`, xem `WaitingBlock` trong
 *                            `ChatScreen.tsx`). Chuyển động ở đây có việc thật
 *                            để làm — nói rằng máy chủ chưa treo — chứ không
 *                            phải để trang trí.
 *
 * TUYỆT ĐỐI KHÔNG dùng cạnh `red_flag` hay `refused`. Một khuôn mặt cười
 * đứng cạnh dòng "dấu hiệu này cần được khám ngay" là đùa cợt với người có
 * thể đang nguy hiểm thật; đứng cạnh một lời từ chối thì thành ra chế nhạo.
 * Hai khối đó dùng biểu tượng nét, không dùng linh vật.
 *
 * HAI BẢN:
 *   `solid` — màu đầy đủ. Dùng ở trang giới thiệu, nơi linh vật là nhân vật
 *             chính của bố cục.
 *   `muted` — cùng hình, hạ bão hoà. Dùng ở trạng thái rỗng và `referral`,
 *             nơi linh vật chỉ để lấp một khoảng trống, không được tranh chỗ
 *             với dòng chữ giải thích nằm ngay cạnh.
 *
 * `aria-hidden` ở cả hai bản: linh vật không mang thông tin nào mà chữ bên
 * cạnh chưa nói. Trình đọc màn hình đọc chữ, không đọc hình.
 */

export type MascotVariant = 'solid' | 'muted'

/** Hai bảng màu, cùng bộ khóa, để phần vẽ bên dưới không phải rẽ nhánh. */
const PALETTE: Record<
  MascotVariant,
  { outer: string; inner: string; sprout: string; face: string; glint: string }
> = {
  solid: {
    outer: '#35D0B6',
    inner: '#5FE0C9',
    sprout: '#FF8A5B',
    face: '#0B2545',
    glint: '#FFFFFF',
  },
  muted: {
    outer: '#B8E8DE',
    inner: '#D2F2EB',
    sprout: '#FFC7AC',
    face: '#5A7387',
    glint: '#FFFFFF',
  },
}

export function Mascot({
  variant = 'solid',
  size = 96,
  className,
}: {
  variant?: MascotVariant
  /** Cạnh của hình vuông chứa linh vật, đơn vị px. */
  size?: number
  className?: string
}) {
  const c = PALETTE[variant]

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="presentation"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Mầm nhỏ ở đỉnh búp: một nét cong và một chiếc lá. Đây là chi tiết
          duy nhất mang màu coral, nên mắt rơi vào đỉnh trước rồi mới trôi
          xuống khuôn mặt. */}
      <path
        d="M60 26c0-6 3.5-10.5 8-13"
        fill="none"
        stroke={c.sprout}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <path
        d="M68 13c5.5.5 9 4 9.5 9.5-5.5-.5-9-4-9.5-9.5Z"
        fill={c.sprout}
      />

      {/* Lớp ngoài của búp: hai cánh ôm hai bên, chụm lại ở đỉnh. */}
      <path
        d="M60 24c17 12 26 28 26 45 0 20-11.6 33-26 33S34 89 34 69c0-17 9-33 26-45Z"
        fill={c.outer}
      />

      {/* Lớp trong, sáng hơn, thụt vào để thấy được viền của lớp ngoài. */}
      <path
        d="M60 40c10.5 9.5 16 21 16 32.5 0 14-7 23-16 23s-16-9-16-23C44 61 49.5 49.5 60 40Z"
        fill={c.inner}
      />

      {/* Hai mắt tròn, mỗi mắt một chấm sáng lệch trên bên trái — chấm sáng
          là thứ khiến hình có hồn thay vì thành hai lỗ đen. */}
      <circle cx="52" cy="70" r="4.6" fill={c.face} />
      <circle cx="68" cy="70" r="4.6" fill={c.face} />
      <circle cx="50.4" cy="68.4" r="1.5" fill={c.glint} />
      <circle cx="66.4" cy="68.4" r="1.5" fill={c.glint} />

      {/* Miệng cười: một cung nông, không hở răng. Cung sâu hơn sẽ thành nét
          cười lớn — không hợp với chỗ mà nó xuất hiện, vì hai trong ba chỗ
          đó là lúc màn hình đang trống hoặc thư viện đang thiếu tài liệu. */}
      <path
        d="M53 80c2.6 3 11.4 3 14 0"
        fill="none"
        stroke={c.face}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
    </svg>
  )
}
