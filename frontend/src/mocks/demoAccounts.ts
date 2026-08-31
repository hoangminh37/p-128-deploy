/**
 * Các tài khoản mẫu của bản demo.
 *
 * File này CỐ Ý không import gì từ `msw` hay từ `fixtures.ts`: màn đăng nhập
 * cũng đọc nó để hiện khối gợi ý khi chạy dev, mà màn đăng nhập thì nằm trong
 * bản build thật. Nếu ở đây kéo theo MSW thì cả thư viện mock sẽ chui vào bundle
 * production.
 *
 * Khối gợi ý ở màn đăng nhập bọc trong `import.meta.env.DEV`, mà Vite thay hằng
 * đó bằng `false` khi build, nên phần này bị loại hẳn khỏi bản phát hành.
 *
 * Mật khẩu để nguyên văn ở đây là có chủ ý: chúng mở được đúng một backend giả
 * chạy trong trình duyệt người xem, không tồn tại ở đâu khác.
 */
export type DemoAccount = {
  /** Nhãn tiếng Việt của vai trò, hiện cho người xem demo. */
  label: string
  email: string
  password: string
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { label: 'Bệnh nhân', email: 'benhnhan@demo.vn', password: 'demo1234' },
  { label: 'Biên tập viên', email: 'bientap@demo.vn', password: 'demo1234' },
  { label: 'Bác sỹ', email: 'bacsi@demo.vn', password: 'demo1234' },
]
