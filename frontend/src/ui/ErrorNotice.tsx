/**
 * Hiển thị lỗi cho bệnh nhân.
 *
 * `ApiError.userMessage` đã có sẵn câu tiếng Việt, nhưng nó mô tả CHUYỆN GÌ ĐÃ
 * XẢY RA. Người 45–70 tuổi đang lo lắng cần biết BÂY GIỜ PHẢI LÀM GÌ, nên ở đây
 * mỗi loại lỗi được gắn thêm một câu hành động cụ thể, và chỉ hiện nút thử lại
 * ở những loại mà thử lại thực sự có cơ may thành công.
 *
 * Phủ đủ cả năm giá trị của `ApiErrorKind`.
 */
import { ApiError, type ApiErrorKind } from '../lib/api'

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
      'Bạn hãy kiểm tra xem điện thoại còn wifi hoặc còn mạng 4G không, rồi bấm "Gửi lại câu hỏi".',
    retryable: true,
  },
  timeout: {
    heading: 'Máy chủ trả lời quá lâu',
    action:
      'Câu hỏi đã gửi đi nhưng chưa có trả lời sau 30 giây. Bạn hãy bấm "Gửi lại câu hỏi". Nếu vẫn vậy, bạn thử lại sau ít phút.',
    retryable: true,
  },
  http: {
    heading: 'Máy chủ báo lỗi',
    action: 'Bạn hãy thử lại sau ít phút.',
    retryable: true,
  },
  validation: {
    heading: 'Máy chủ trả về dữ liệu không đúng định dạng',
    action:
      'Hệ thống không hiển thị kết quả này để tránh đưa thông tin y tế sai. Đây là lỗi kỹ thuật, không phải do bạn hỏi sai. Bạn hãy thử lại sau, hoặc hỏi trực tiếp bác sĩ nếu cần gấp.',
    retryable: false,
  },
  request: {
    heading: 'Câu hỏi chưa gửi đi được',
    action:
      'Câu hỏi cần dài ít nhất 1 ký tự và không quá 5000 ký tự. Bạn hãy sửa lại rồi gửi.',
    retryable: false,
  },
}

/**
 * 4xx là lỗi phía người gửi — gửi lại y hệt sẽ hỏng y hệt, nên không mời thử lại.
 * 5xx là máy chủ trục trặc tạm thời nên vẫn đáng thử.
 */
function adviceFor(error: ApiError): Advice {
  const base = ADVICE[error.kind]

  if (error.kind === 'http' && typeof error.status === 'number') {
    if (error.status >= 400 && error.status < 500) {
      return {
        heading: 'Máy chủ không nhận câu hỏi này',
        action:
          'Bạn hãy thử hỏi lại bằng câu khác ngắn gọn hơn. Nếu vẫn không được, bạn hãy hỏi trực tiếp bác sĩ.',
        retryable: false,
      }
    }
    return {
      heading: 'Máy chủ đang gặp sự cố',
      action:
        'Đây là lỗi phía hệ thống, không phải do bạn. Bạn hãy bấm "Gửi lại câu hỏi", hoặc chờ ít phút rồi hỏi lại.',
      retryable: true,
    }
  }

  return base
}

export function ErrorNotice({
  error,
  onRetry,
}: {
  error: unknown
  onRetry: () => void
}) {
  // Lỗi lạ không phải ApiError thì vẫn phải nói được gì đó tử tế, không để trắng màn.
  const advice: Advice =
    error instanceof ApiError
      ? adviceFor(error)
      : {
          heading: 'Đã xảy ra lỗi không xác định',
          action: 'Bạn hãy thử gửi lại câu hỏi. Nếu vẫn vậy, bạn hãy hỏi bác sĩ.',
          retryable: true,
        }

  return (
    <div role="alert" className="max-w-answer border-l-4 border-alert pl-cozy">
      <p className="font-display text-question font-bold text-alert">
        {advice.heading}
      </p>
      <p className="font-display mt-tight text-question">{advice.action}</p>

      {advice.retryable && (
        <button
          type="button"
          onClick={onRetry}
          className="font-display mt-cozy min-h-touch rounded-lg border-2 border-border px-cozy text-input font-semibold text-ink"
        >
          Gửi lại câu hỏi
        </button>
      )}
    </div>
  )
}
