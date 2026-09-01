/**
 * Biểu tượng nội tuyến của khung ứng dụng.
 *
 * Vẽ thẳng bằng SVG chứ không nạp thư viện icon: cả khung chỉ cần bảy hình, mà
 * một gói icon kéo theo hàng trăm hình không dùng tới.
 *
 * Mọi biểu tượng đều `aria-hidden`. Chúng luôn đi kèm nhãn chữ, hoặc nằm trong
 * một nút đã có `aria-label` — trình đọc màn hình đọc nhãn đó, không đọc hình.
 *
 * Nét vẽ dày 2 trên khung 24 để mắt lão thị bắt được hình ở cỡ 24px. Nét mảnh
 * kiểu 1px là thứ đầu tiên biến mất với người 45–70 tuổi.
 */
import type { ReactNode } from 'react'

type IconProps = {
  /** Cỡ đặt bằng class ở chỗ dùng, ví dụ `h-6 w-6`. */
  className?: string
}

/** Khung chung cho các hình vẽ bằng nét. Màu lấy theo `currentColor` của chữ. */
function StrokeIcon({
  className,
  children,
  strokeWidth = 2,
}: IconProps & { children: ReactNode; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

/**
 * Dấu hiệu của ứng dụng: chữ thập y tế trong một ô bo góc.
 *
 * Ô lấy màu chữ của chỗ đặt nó (`currentColor`, thường là `mint`), còn chữ
 * thập luôn là `ink`. Cặp mint / ink đạt 7.95:1, nên dấu hiệu đọc được cả
 * khi nó nằm trên nền navy lẫn trên nền sáng — chỉ cần đổi một class màu ở
 * chỗ gọi thay vì phải có hai bản hình.
 */
/**
 * Dấu hiệu của ứng dụng: BÔNG SEN TRONG VÒNG TRÒN.
 *
 * Chép nguyên hình trong `<aside class="side">` của bản mẫu — cùng viewBox
 * 0 0 100 100, cùng bán kính 46, cùng nét 5, cùng đường cánh sen. Bản trước là
 * một chữ thập y tế trong ô bo góc 7px; hướng "hồ sơ / công báo" không có góc
 * bo, và chữ thập là dấu hiệu của bệnh viện chứ không của một nơi học.
 *
 * Màu lấy `currentColor` để chỗ dùng quyết định — bản mẫu gọi nó với
 * `var(--tim)`.
 */
export function AppMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className}>
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth={5} />
      <path
        d="M50 26c10 8 15.5 18 15.5 27.5C65.5 65.5 59 73 50 73s-15.5-7.5-15.5-19.5C34.5 44 40 34 50 26Z"
        fill="currentColor"
      />
    </svg>
  )
}

/** Mũi tên chỉ sang trái: quay lại màn trước. */
export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M15 5l-7 7 7 7" />
    </StrokeIcon>
  )
}

/** Mũi tên chỉ sang phải: mở một mục trong danh sách. */
export function ChevronRightIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M9 5l7 7-7 7" />
    </StrokeIcon>
  )
}

/** Ba gạch ngang: mở ngăn kéo thanh bên. Chép nguyên path của bản mẫu. */
export function MenuIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={1.8}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </StrokeIcon>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </StrokeIcon>
  )
}

/** Dấu cộng: mở một câu hỏi mới. Chép nguyên path của bản mẫu. */
export function PlusIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </StrokeIcon>
  )
}

/** Sao chép: hai tờ giấy chồng lên nhau. */
/** Hai tờ chồng nhau: sao chép. Chép nguyên path của bản mẫu. */
export function CopyIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={1.7}>
      <rect x="9" y="9" width="11" height="11" /><path d="M5 15V4h11" />
    </StrokeIcon>
  )
}

/** Lưu về máy: mũi tên đi xuống một cái khay. */
/** Mũi tên xuống một vạch: tải xuống. Chép nguyên path của bản mẫu. */
export function SaveIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={1.7}>
      <path d="M12 4v11M8 11l4 4 4-4M4 19h16" />
    </StrokeIcon>
  )
}

/** Chuông thông báo: phản hồi đang chờ người bệnh mở đọc. */
/** Chuông: thông báo chưa đọc. Chép nguyên path của bản mẫu. */
export function BellIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={1.7}>
      <path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7M10.5 20a1.8 1.8 0 0 0 3 0" />
    </StrokeIcon>
  )
}

/** Dấu hiệu cấp cứu: tam giác cảnh báo. */
export function AlertIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M12 3.5 2.5 20.5h19L12 3.5Z" />
      <path d="M12 10v4.2" />
      <path d="M12 17.4h.01" />
    </StrokeIcon>
  )
}

/** Gọi cấp cứu: ống nghe điện thoại. */
export function PhoneIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M6.6 3.5h2.9l1.5 3.9-2 1.5a12.2 12.2 0 0 0 6.1 6.1l1.5-2 3.9 1.5v2.9a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" />
    </StrokeIcon>
  )
}

/** Tư vấn y khoa: cuộc hội thoại có dấu thập chăm sóc sức khỏe. */
/** Ống nghe: tư vấn với bác sỹ. Chép nguyên path của bản mẫu. */
export function ConsultationIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={1.7}>
      <path d="M20 12a8 8 0 1 1-3.2-6.4" /><path d="M4 20l1.6-4" />
    </StrokeIcon>
  )
}

/** Câu hỏi để dành cho bác sĩ: tờ giấy ghi chú. */
export function NoteIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
      <path d="M8.5 9h7M8.5 13h7M8.5 17h4" />
    </StrokeIcon>
  )
}

/** Thư viện tài liệu: mấy quyển sách đứng trên giá. */
/** Hai gáy sách: thư viện bài học. Chép nguyên path của bản mẫu. */
export function LibraryIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={1.7}>
      <rect x="4" y="4" width="6" height="16" /><rect x="14" y="4" width="6" height="16" />
    </StrokeIcon>
  )
}

/** Trắc nghiệm kiến thức: phiếu câu hỏi với đáp án đã chọn. */
/** Tờ đề có hai dòng: bài trắc nghiệm. Chép nguyên path của bản mẫu. */
export function QuizIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={1.7}>
      <rect x="4" y="4" width="16" height="16" /><path d="M9 12h6M9 16h4" />
    </StrokeIcon>
  )
}

/** Thuốc: một viên nhộng nằm chéo. Dùng cho lời nhắc không kê đơn, không chỉnh liều. */
export function PillIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <rect
        x="2.5"
        y="8.5"
        width="19"
        height="7"
        rx="3.5"
        transform="rotate(-45 12 12)"
      />
      <path d="M9.5 9.5 14.5 14.5" />
    </StrokeIcon>
  )
}

/** Kính lúp ở đầu thanh nhập — dấu hiệu quen thuộc của một ô để tra cứu. */
export function SearchIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5 20 20" />
    </StrokeIcon>
  )
}

/** Gửi câu hỏi: mũi tên đi lên. */
export function SendIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </StrokeIcon>
  )
}

/** Micro: mở chế độ hỏi bằng giọng nói từ thanh soạn câu hỏi. */
export function MicrophoneIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <rect x="8.5" y="3.5" width="7" height="11" rx="3.5" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5M8.5 20.5h7" />
    </StrokeIcon>
  )
}

/** Camera video: dùng cho các thao tác trong phòng tư vấn trực tuyến. */
export function CameraIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <rect x="3.5" y="6.5" width="12.5" height="11" rx="2" />
      <path d="m16 10 4.5-2.7v9.4L16 14" />
    </StrokeIcon>
  )
}

/** Đổi giữa camera trước/sau hoặc các camera đang có trên thiết bị. */
export function CameraSwitchIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <rect x="4" y="7" width="12" height="10" rx="2" />
      <path d="m16 10 4-2.5v9L16 14" />
      <path d="M7.5 4.5A7.5 7.5 0 0 1 18 7.2M16.5 4.5v3.3h-3.3M16.5 19.5A7.5 7.5 0 0 1 6 16.8M7.5 19.5v-3.3h3.3" />
    </StrokeIcon>
  )
}

/** Đăng xuất: mũi tên đi ra khỏi một khung mở. */
/** Mũi tên ra khỏi cửa: đăng xuất. Chép nguyên path của bản mẫu. */
export function SignOutIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={1.7}>
      <path d="M15 17l5-5-5-5M20 12H9M11 4H5v16h6" />
    </StrokeIcon>
  )
}

/** Hồ sơ: hình người, đầu và vai. */
/** Một người: khối hồ sơ. Chép nguyên path của bản mẫu. */
export function UserIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={1.8}>
      <circle cx="12" cy="8" r="3.6" /><path d="M5 20c1.4-3.6 4-5.4 7-5.4s5.6 1.8 7 5.4" />
    </StrokeIcon>
  )
}

/** Chế độ sáng: mặt trời. */
/** Mặt trời: chế độ sáng. Chép nguyên path của bản mẫu. */
export function SunIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={1.8}>
      <circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </StrokeIcon>
  )
}

/** Chế độ tối: mặt trăng khuyết. */
/** Trăng khuyết: chế độ tối. Chép nguyên path của bản mẫu. */
export function MoonIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={1.8}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
    </StrokeIcon>
  )
}

/** Theo cài đặt của máy: màn hình có chân đế. */
/** Màn hình máy tính: theo cài đặt của máy. Chép nguyên path của bản mẫu. */
export function SystemIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className} strokeWidth={1.8}>
      <rect x="3" y="5" width="18" height="12" /><path d="M9 20h6" />
    </StrokeIcon>
  )
}

/** Đã hoàn thành: Dấu tick */
export function CheckIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M5 12l5 5L20 7" />
    </StrokeIcon>
  )
}
