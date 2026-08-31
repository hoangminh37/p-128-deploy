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
function StrokeIcon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
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
export function AppMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <rect x="1" y="1" width="22" height="22" rx="7" fill="currentColor" />
      <path
        d="M12 6.5v11M6.5 12h11"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth={2.5}
        strokeLinecap="round"
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

export function MenuIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
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

export function PlusIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M12 5v14M5 12h14" />
    </StrokeIcon>
  )
}

/** Sao chép: hai tờ giấy chồng lên nhau. */
export function CopyIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a1 1 0 0 1 1-1h9" />
    </StrokeIcon>
  )
}

/** Lưu về máy: mũi tên đi xuống một cái khay. */
export function SaveIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M12 4v11M8 11l4 4 4-4M5 19h14" />
    </StrokeIcon>
  )
}

/** Chuông thông báo: phản hồi đang chờ người bệnh mở đọc. */
export function BellIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
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
export function ConsultationIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M5.5 5.5h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7L7 20v-3.5h-1.5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
      <path d="M12 8.5v5M9.5 11h5" />
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
export function LibraryIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M5 4.5h3.5v14H5zM11 4.5h3.5v14H11zM17 8h3.5v10.5H17z" />
      <path d="M3 21h18" />
    </StrokeIcon>
  )
}

/** Trắc nghiệm kiến thức: phiếu câu hỏi với đáp án đã chọn. */
export function QuizIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
      <path d="M8.5 8.5h7M8.5 12.5h3" />
      <path d="m8.5 16 1.7 1.7 3.1-3.4" />
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

/** Đăng xuất: mũi tên đi ra khỏi một khung mở. */
export function SignOutIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14" />
      <path d="M17 8.5 20.5 12 17 15.5M20.5 12H10" />
    </StrokeIcon>
  )
}

/** Hồ sơ: hình người, đầu và vai. */
export function UserIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5a7 7 0 0 1 14 0" />
    </StrokeIcon>
  )
}

/** Chế độ sáng: mặt trời. */
export function SunIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </StrokeIcon>
  )
}

/** Chế độ tối: mặt trăng khuyết. */
export function MoonIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z" />
    </StrokeIcon>
  )
}

/** Theo cài đặt của máy: màn hình có chân đế. */
export function SystemIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20.5h6M12 16.5v4" />
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
