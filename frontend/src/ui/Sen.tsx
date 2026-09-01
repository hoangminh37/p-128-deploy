/**
 * Sen — nét sen của bản mẫu, chép nguyên từ `class="dn-sen"`.
 *
 *     grep -n 'dn-sen' docs/design/eduhealth-ai.html
 *
 * Bốn `path` dưới đây là ĐÚNG BỐN PATH của bản mẫu, không thêm không bớt: búp
 * ở giữa, hai cánh ôm hai bên, hai nét nước cong ra ngoài, và một cuống. Một
 * nhóm `<g>` duy nhất, nét `var(--tim)` dày 1.5, hai đầu bo tròn. Không mặt
 * mũi, không màu đầy — đây là một nét vẽ, không phải một nhân vật.
 *
 * KHÔNG DÙNG CHÍNH LỚP `.dn-sen`. Lớp đó là `position:absolute` neo góc dưới
 * bên phải với `opacity:.13` — nó là dấu chìm của nửa trái màn đăng nhập, và
 * `LoginScreen.tsx` vẫn dùng nó ở đúng vai đó. Component này là cùng hình vẽ
 * ấy nhưng đứng TRONG DÒNG, nên nó chỉ nhận bề ngang và để chỗ gọi quyết định
 * độ mờ.
 *
 * DÙNG Ở ĐÂU: những chỗ màn hình không có gì để bày — trạng thái rỗng, và khối
 * gợi ý khi màn hỏi đáp chưa có lượt nào. Một khoảng trắng trơ trọi làm người
 * dùng tưởng ứng dụng hỏng.
 *
 * TUYỆT ĐỐI KHÔNG đặt cạnh `red_flag` hay `refused`. Một hình trang trí đứng
 * cạnh dòng "dấu hiệu này cần được khám ngay" là đùa cợt với người có thể đang
 * nguy hiểm thật; đứng cạnh một lời từ chối thì thành ra chế nhạo. Hai khối đó
 * dùng biểu tượng nét, không dùng hình này.
 *
 * `aria-hidden`: hình không mang thông tin nào mà chữ bên cạnh chưa nói. Trình
 * đọc màn hình đọc chữ, không đọc hình.
 */

export function Sen({
  size = 96,
  className,
}: {
  /** Cạnh của hình vuông chứa nét sen, đơn vị px. */
  size?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="presentation"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g fill="none" stroke="var(--tim)" strokeWidth="1.5" strokeLinecap="round">
        <path d="M50 20c11 9 17 20 17 30.5C67 63 59 71.5 50 71.5S33 63 33 50.5C33 40 39 29 50 20Z" />
        <path d="M28 36c-8 10-9.5 23-3.5 31.5C30 76 40 79 50 78M72 36c8 10 9.5 23 3.5 31.5C70 76 60 79 50 78" />
        <path d="M13 52c-3 11 1 22 9.5 27.5M87 52c3 11-1 22-9.5 27.5" />
        <path d="M50 78v9" />
      </g>
    </svg>
  )
}
