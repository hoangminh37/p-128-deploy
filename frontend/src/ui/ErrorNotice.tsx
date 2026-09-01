/**
 * Lỗi kỹ thuật, trình bày bằng đúng ngôn ngữ của ba khối trạng thái kia.
 *
 * Dùng chung `StateBlock` với giọng `fault`: nền trắng, viền và nét trái màu
 * `alert`, nhưng KHÔNG có nền đặc. Đây là chủ ý — chỉ `red_flag` mới được phép
 * là một khối đỏ kín màn hình. Một máy chủ hỏng không bao giờ được trông ngang
 * hàng với một cơn đau ngực.
 *
 * `ApiError.userMessage` đã có sẵn câu tiếng Việt, nhưng nó mô tả CHUYỆN GÌ ĐÃ
 * XẢY RA. Người 45–70 tuổi đang lo lắng cần biết BÂY GIỜ PHẢI LÀM GÌ, nên ở đây
 * mỗi loại lỗi được gắn thêm một câu hành động cụ thể, và chỉ hiện nút thử lại
 * ở những loại mà thử lại thực sự có cơ may thành công.
 *
 * Phủ đủ cả năm giá trị của `ApiErrorKind`, và tách thêm 4xx với 5xx bên trong
 * `http` vì hai nửa đó đòi hai hành động ngược nhau.
 */
import { ApiError, type ApiErrorKind } from '../lib/api'
import { AlertIcon } from './icons'
import { StateBlock } from './ResponseStates'

type Advice = {
  heading: string
  action: string
  /** Bấm lại có ích không. Sai định dạng dữ liệu thì bấm mấy lần cũng thế. */
  retryable: boolean
}

const ADVICE: Record<ApiErrorKind, Advice> = {
  network: {
    heading: 'Không kết nối được tới máy chủ',
    action:
      'Máy của bạn đang không vào được mạng, nên câu hỏi chưa gửi đi được. Bạn hãy ' +
      'kiểm tra xem còn wifi hoặc còn 4G không, rồi bấm nút thử lại bên dưới.',
    retryable: true,
  },
  timeout: {
    heading: 'Máy chủ trả lời quá lâu',
    action:
      'Câu hỏi đã gửi đi nhưng sau 30 giây vẫn chưa có trả lời. Bạn hãy bấm nút thử ' +
      'lại bên dưới. Nếu vẫn vậy, bạn chờ ít phút rồi hỏi lại.',
    retryable: true,
  },
  http: {
    heading: 'Máy chủ báo lỗi',
    action: 'Bạn hãy chờ ít phút rồi hỏi lại.',
    retryable: true,
  },
  validation: {
    heading: 'Máy chủ trả về dữ liệu không đọc được',
    action:
      'Hệ thống cố ý KHÔNG hiển thị kết quả lần này, để tránh đưa cho bạn thông tin ' +
      'y tế sai. Đây là trục trặc kỹ thuật, không phải do bạn hỏi sai. Bạn hãy thử ' +
      'lại sau, hoặc hỏi thẳng bác sĩ nếu cần gấp.',
    retryable: false,
  },
  request: {
    heading: 'Thông tin chưa gửi đi được',
    action:
      'Dữ liệu chưa đúng định dạng máy chủ yêu cầu nên ứng dụng chưa gửi đi. Bạn hãy ' +
      'kiểm tra lại những ô vừa nhập rồi gửi lại.',
    retryable: false,
  },
}

/**
 * Hai mã có câu chữ riêng sẵn ở `lib/api.ts`, không được gộp vào rọ 4xx chung.
 *
 * Bảng `HTTP_USER_MESSAGES` bên api client đã viết đúng cho từng mã: 403 nói về
 * quyền truy cập, 409 nói về mục đã xử lý. Gộp chúng vào câu 4xx mặc định —
 * "thử hỏi lại bằng câu ngắn gọn hơn" — là đưa cho biên tập viên một lời khuyên
 * của màn hỏi đáp, chẳng liên quan gì tới việc họ vừa làm.
 *
 * Chỉ hai mã này. Các mã 4xx khác vẫn dùng câu chung, vì `userMessage` của
 * chúng chỉ mô tả chuyện đã xảy ra chứ không nói được phải làm gì tiếp.
 */
const HEADING_BY_STATUS: Record<number, string> = {
  403: 'Bạn không có quyền vào phần này',
  409: 'Mục này đã được xử lý rồi',
}

/**
 * 4xx là lỗi phía người gửi — gửi lại y hệt sẽ hỏng y hệt, nên không mời thử lại.
 * 5xx là máy chủ trục trặc tạm thời nên vẫn đáng thử.
 */
function adviceFor(error: ApiError): Advice {
  const base = ADVICE[error.kind]

  if (error.kind === 'http' && typeof error.status === 'number') {
    const heading = HEADING_BY_STATUS[error.status]
    if (heading !== undefined) {
      return {
        heading,
        action: error.userMessage,
        // 409 thì tải lại là thấy trạng thái thật, nên nút thử lại có ích.
        // 403 thì bấm mấy lần cũng vẫn thiếu quyền.
        retryable: error.status === 409,
      }
    }

    if (error.status >= 400 && error.status < 500) {
      return {
        heading: 'Máy chủ không nhận câu hỏi này',
        action:
          'Bạn hãy thử hỏi lại bằng một câu ngắn gọn hơn, mỗi lần hỏi một ý thôi. ' +
          'Nếu vẫn không được, bạn hãy hỏi trực tiếp bác sĩ điều trị của mình.',
        retryable: false,
      }
    }
    return {
      heading: 'Máy chủ đang gặp sự cố',
      action:
        'Đây là trục trặc phía hệ thống, không phải do bạn. Bạn hãy bấm nút thử lại ' +
        'bên dưới, hoặc chờ ít phút rồi hỏi lại.',
      retryable: true,
    }
  }

  return base
}

export function ErrorNotice({
  error,
  onRetry,
  retryLabel = 'Thử lại',
}: {
  error: unknown
  onRetry: () => void
  /** Nhãn nút thử lại — mỗi màn gọi hành động của mình bằng đúng tên của nó. */
  retryLabel?: string
}) {
  // Lỗi lạ không phải ApiError thì vẫn phải nói được gì đó tử tế, không để trắng màn.
  const advice: Advice =
    error instanceof ApiError
      ? adviceFor(error)
      : {
          heading: 'Đã xảy ra lỗi không xác định',
          action:
            'Ứng dụng gặp một trục trặc chưa lường trước. Bạn hãy bấm nút thử lại ' +
            'bên dưới. Nếu vẫn vậy, bạn hãy hỏi thẳng bác sĩ điều trị của mình.',
          retryable: true,
        }

  return (
    <StateBlock
      tone="fault"
      role="alert"
      label="Thử lại được"
      heading={advice.heading}
      icon={<AlertIcon className="" />}
    >
      <p style={{ maxWidth: '60ch', lineHeight: 1.7 }}>{advice.action}</p>

      {advice.retryable && (
        <button type="button" onClick={onRetry} className="btn sm" style={{ marginTop: 16 }}>
          {retryLabel}
        </button>
      )}
    </StateBlock>
  )
}
