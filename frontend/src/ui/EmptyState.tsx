/**
 * Khuôn chung của MỌI trạng thái rỗng trong ứng dụng.
 *
 * Ba phần, không hơn: nét sen ở giữa, một dòng tiêu đề 18px, và
 * một đoạn giải thích. Gom về một component để không chỗ nào tự nghĩ ra một
 * kiểu trống riêng — danh sách hội thoại trống, hàng đợi trống và log trống
 * phải nhìn ra ngay là cùng một loại tình huống.
 *
 * CÂU CHỮ CHỈ ĐƯỢC MÔ TẢ ĐIỀU GIAO DIỆN BIẾT CHẮC. Nguyên tắc này quan trọng
 * hơn cả hình: một danh sách rỗng chỉ nói được rằng "lần đọc này không có mục
 * nào trả về", KHÔNG nói được vì sao. "Hàng đợi đã sạch" nghe như vừa duyệt
 * xong hết, trong khi cùng một danh sách rỗng cũng có thể nghĩa là chưa ai
 * tạo mục nào, hoặc là phần ghi log chưa chạy. Ba tình huống đó đòi ba hành
 * động khác nhau, mà giao diện thì không phân biệt được cái nào.
 *
 * Vì vậy chỗ gọi truyền vào `title` và `body` đã viết sẵn theo đúng luật đó;
 * component này không tự sinh câu chữ nào.
 */
import type { ReactNode } from 'react'

import { Sen } from './Sen'

/**
 * MỘT cặp màu chữ duy nhất, không còn rẽ nhánh theo họ nền.
 *
 * Bản trước có hai bản `light` / `dark` vì ứng dụng có hai họ nền — giấy sáng
 * và navy đặc. Hướng "Hồ sơ / Công báo" chỉ còn một họ nền là giấy, kể cả ở
 * thanh bên, nên nhánh thứ hai không còn chỗ nào gọi tới. Giữ tham số `tone`
 * để chỗ gọi không phải sửa, nhưng cả hai giá trị nay trỏ về cùng một cặp:
 * `body` 15.79:1 và `slate` 4.93:1 trên giấy nền.
 */
export function EmptyState({
  title,
  body,
  action,
  illustration,
  /** `true` cho những khoảng hẹp như thanh bên, nơi nét sen 96px không vừa. */
  compact = false,
}: {
  title: string
  body: string
  /** Nút hoặc liên kết đặt dưới đoạn giải thích. Phần lớn chỗ không cần. */
  action?: ReactNode
  /**
   * Hình thay cho nét sen.
   *
   * Mặc định là nét sen của bản mẫu — trạng thái rỗng là một trong hai chỗ nó
   * được phép xuất hiện (xem `Sen.tsx`). Nhưng sen là hình của LUỒNG BỆNH
   * NHÂN; ở khu vực biên tập nó lạc chỗ, vì người đọc màn đó là dược sĩ hoặc
   * bác sĩ đang làm việc chứ không phải người bệnh đang lo lắng. Những chỗ đó
   * truyền vào một minh họa từ `ui/illustrations` thay thế.
   *
   * TUYỆT ĐỐI KHÔNG truyền hình nào vào một trạng thái rỗng đứng cạnh cảnh báo
   * cấp cứu — cùng một luật với nét sen.
   */
  illustration?: ReactNode
  compact?: boolean
}) {
  return (
    /* Trạng thái rỗng của bản mẫu: nét sen mờ ở giữa, một dòng đề mục chữ có
       chân, một dòng giải thích `.lab`, rồi việc làm tiếp theo. Bản mẫu dùng
       đúng nhịp này ở `#tt` (khối "chưa đủ căn cứ") và `#hdt`. */
    <div
      style={{
        margin: '0 auto',
        maxWidth: '52ch',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: compact ? '14px 10px' : 'clamp(24px,4vw,44px) 16px',
      }}
    >
      {illustration ?? (
        <div style={{ opacity: 0.55 }}>
          <Sen size={compact ? 64 : 96} />
        </div>
      )}

      <p
        style={{
          fontFamily: 'var(--f-display)',
          fontSize: compact ? 'var(--t-note)' : 'var(--t-h3)',
          lineHeight: 1.35,
          marginTop: compact ? 12 : 16,
        }}
      >
        {title}
      </p>

      <p className="lab" style={{ marginTop: 8, lineHeight: 1.6 }}>
        {body}
      </p>

      {action !== undefined && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  )
}
