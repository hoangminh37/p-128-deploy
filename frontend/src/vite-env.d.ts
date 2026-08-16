/// <reference types="vite/client" />

/**
 * Khai báo kiểu cho các biến môi trường riêng của dự án.
 *
 * Vite đọc mọi biến có tiền tố `VITE_` từ file `.env*` và đưa vào mã trình duyệt
 * dưới dạng **chuỗi**. Không có biến nào là boolean hay number, kể cả khi trong
 * file `.env` bạn viết `true`. Vì thế mọi trường dưới đây đều là `string`, và
 * biến có thể không được đặt nên đánh dấu `?`.
 */
interface ImportMetaEnv {
  /** Gốc URL của backend. Để trống thì mọi request đi bằng đường dẫn tương đối. */
  readonly VITE_API_URL?: string
  /**
   * Bật/tắt lớp mock MSW. Chỉ `'true'` và `'false'` có ý nghĩa; giá trị khác
   * hoặc bỏ trống thì mặc định theo chế độ chạy (bật ở dev, tắt ở production).
   */
  readonly VITE_ENABLE_MSW?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
