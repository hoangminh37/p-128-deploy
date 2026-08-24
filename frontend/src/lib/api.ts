/**
 * Lớp gọi HTTP thuần cho hợp đồng API luồng bệnh nhân.
 *
 * File này chỉ lo fetch, timeout, lỗi và parse response bằng Zod. Không dùng
 * TanStack Query ở đây — cache và retry để tầng trên xử lý.
 *
 * Bám theo `docs/api-contract.md`, mục 1 (quy ước chung) và mục 2 (endpoint).
 */
import { z } from 'zod'

import {
  chatRequestSchema,
  chatResponseSchema,
  conversationDetailSchema,
  conversationListSchema,
  editorApproveRequestSchema,
  editorDashboardSchema,
  editorQueueItemDetailSchema,
  editorQueueListSchema,
  editorRejectRequestSchema,
  loginRequestSchema,
  loginResponseSchema,
  outOfScopeListSchema,
  patientProfileResponseSchema,
  patientProfileSchema,
  dailyLessonResponseSchema,
  completeLessonResponseSchema,
  type ChatRequest,
  type ChatResponse,
  type ConversationDetail,
  type ConversationList,
  type EditorApproveRequest,
  type EditorDashboard,
  type EditorItemStatus,
  type EditorQueueItemDetail,
  type EditorQueueList,
  type EditorRejectRequest,
  type LoginRequest,
  type LoginResponse,
  type OutOfScopeList,
  type PatientProfileResponse,
  type DailyLessonResponse,
  type LearningLibraryResponse,
  type CompleteLessonRequest,
  type CompleteLessonResponse,
  learningLibraryResponseSchema,
  quizResponseSchema,
  quizSubmitResponseSchema,
  quizHistoryResponseSchema,
  quizMistakesResponseSchema,
  type QuizMistakesResponse,
  type QuizRequest as QuizRequestPayload,
  type QuizResponse,
  type QuizSubmitRequest,
  type QuizSubmitResponse,
  type QuizHistoryResponse,
} from './schemas'

// ---------------------------------------------------------------------------
// Cấu hình
// ---------------------------------------------------------------------------

/**
 * Mục 1 — base URL. Để trống thì request đi đường dẫn tương đối và rơi vào
 * proxy `/api` của Vite (xem `vite.config.ts`), khỏi lo CORS khi dev.
 */
const BASE_URL: string = import.meta.env.VITE_API_URL ?? ''

/** Mục 1 — toàn bộ endpoint nằm dưới prefix này. */
const API_PREFIX = '/api/v1'

/** Thời gian chờ tối đa cho một request (trước đây 30s, tăng lên 90s cho RAG) */
const TIMEOUT_MS = 90_000

/**
 * Mục 1 — token gắn vào header `Authorization` của mọi request sau khi đăng nhập.
 *
 * Biến module chứ không phải hằng: `SessionProvider` gọi `setAuthToken` ngay khi
 * có token, và gọi lại với `null` khi đăng xuất.
 *
 * Cố ý KHÔNG đọc thẳng localStorage trong `buildHeaders`. Lớp api không cần biết
 * ứng dụng cất phiên đăng nhập ở đâu — mai này đổi sang cookie httpOnly hay
 * sessionStorage thì file này không phải sửa một dòng nào.
 */
let authToken: string | null = null

/** Gắn hoặc gỡ token. Chỉ `SessionProvider` được gọi hàm này. */
export function setAuthToken(token: string | null): void {
  authToken = token
}

/**
 * Việc phải làm khi máy chủ trả 401 ở một endpoint cần đăng nhập.
 *
 * File này không biết gì về React Router lẫn TanStack Query, và không được biết:
 * nó là lớp HTTP thuần. Nên chỗ này chỉ giữ một chỗ cắm, còn việc xoá phiên,
 * dọn cache và điều hướng do `session/ExpiredSessionWatcher.tsx` đăng ký vào.
 *
 * Đặt ở tầng dùng chung để MỌI endpoint được bảo vệ bằng một chỗ duy nhất. Bắt
 * 401 ở từng chỗ gọi thì sớm muộn cũng sót một cái, mà cái sót lại là chỗ người
 * dùng ngồi nhìn màn hình đứng im.
 */
let onUnauthorized: (() => void) | null = null

/** Đăng ký hoặc gỡ việc xử lý 401. Truyền `null` để gỡ. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

// ---------------------------------------------------------------------------
// Lỗi
// ---------------------------------------------------------------------------

/**
 * Các loại lỗi mà tầng UI cần phân biệt để hiển thị khác nhau.
 *
 * `request` là lỗi dữ liệu phía ứng dụng, phát hiện trước khi gửi đi.
 * `validation` là server trả về dữ liệu lệch hợp đồng. Hai cái khác hẳn nhau
 * về nguyên nhân nên không được gộp.
 */
export type ApiErrorKind = 'request' | 'network' | 'timeout' | 'http' | 'validation'

/**
 * Lỗi thống nhất của lớp API.
 *
 * `message` chứa chi tiết kỹ thuật để ghi log, `userMessage` là câu tiếng Việt
 * hiển thị thẳng cho bệnh nhân.
 */
export class ApiError extends Error {
  /** Loại lỗi, dùng để UI quyết định hiển thị gì. */
  readonly kind: ApiErrorKind
  /** Câu tiếng Việt dành cho người dùng cuối. */
  readonly userMessage: string
  /** Mã HTTP, chỉ có khi `kind` là `http`. */
  readonly status?: number
  /** Trường `detail` của FastAPI, chỉ có khi `kind` là `http`. */
  readonly detail?: string
  /** Danh sách issue của Zod, chỉ có khi `kind` là `request` hoặc `validation`. */
  readonly issues?: z.ZodError['issues']

  constructor(params: {
    kind: ApiErrorKind
    userMessage: string
    logMessage: string
    status?: number
    detail?: string
    issues?: z.ZodError['issues']
    cause?: unknown
  }) {
    super(params.logMessage, { cause: params.cause })
    this.name = 'ApiError'
    this.kind = params.kind
    this.userMessage = params.userMessage
    this.status = params.status
    this.detail = params.detail
    this.issues = params.issues
  }
}

/** Mục 1 — bảng mã lỗi. Mỗi mã có một câu giải thích cho bệnh nhân. */
const HTTP_USER_MESSAGES: Record<number, string> = {
  400: 'Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại thông tin đã nhập.',
  401: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
  403: 'Tài khoản của bạn không có quyền truy cập phần này. Khu vực quản trị nội dung chỉ dành cho biên tập viên y khoa.',
  404: 'Không tìm thấy dữ liệu. Có thể hồ sơ hoặc phiên hội thoại chưa được tạo.',
  // Mục 8 — duyệt hoặc từ chối một mục đã xử lý rồi. Gần như luôn là hệ quả của
  // việc bấm hai lần khi mạng chậm, nên câu chữ phải trấn an chứ không doạ.
  409: 'Mục này đã được xử lý trước đó rồi. Bạn hãy tải lại danh sách để xem trạng thái mới nhất.',
  422: 'Thông tin gửi lên chưa đúng định dạng máy chủ yêu cầu. Vui lòng kiểm tra lại.',
  500: 'Hệ thống gặp sự cố khi xử lý câu hỏi. Vui lòng thử lại sau ít phút.',
  503: 'Trợ lý đang tạm thời không phản hồi. Vui lòng thử lại sau ít phút.',
}

// ---------------------------------------------------------------------------
// Hàm gọi HTTP dùng chung
// ---------------------------------------------------------------------------

/** Mục 1 — luôn gửi JSON. Chỗ gắn Authorization đã sẵn, chờ Gate sau bật JWT. */
function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (authToken !== null && authToken !== '') {
    headers.Authorization = `Bearer ${authToken}`
  }
  return headers
}

/**
 * Chặn payload sai ngay tại client, trước khi tốn một vòng request.
 *
 * Ném `kind: 'request'` chứ không phải `'validation'`: đây là lỗi dữ liệu do
 * ứng dụng tự dựng sai, server hoàn toàn vô can.
 */
function assertValidRequestBody(
  schema: z.ZodType,
  payload: unknown,
  context: string,
): void {
  const parsed = schema.safeParse(payload)
  if (parsed.success) return

  throw new ApiError({
    kind: 'request',
    userMessage:
      'Thông tin chưa hợp lệ nên chưa gửi đi được. Đây là lỗi dữ liệu phía ứng dụng, ' +
      'không phải lỗi máy chủ. Vui lòng kiểm tra lại thông tin vừa nhập.',
    logMessage: `Payload sai schema, không gửi request: ${context} — ${z.prettifyError(parsed.error)}`,
    issues: parsed.error.issues,
    cause: parsed.error,
  })
}

/** Lấy `detail` từ body lỗi của FastAPI. Trả về `undefined` nếu body không đọc được. */
async function readErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail
      return typeof detail === 'string' ? detail : JSON.stringify(detail)
    }
  } catch {
    // Body rỗng hoặc không phải JSON — không có gì thêm để log.
  }
  return undefined
}

/**
 * Gọi một endpoint và trả về `Response` đã chắc chắn `ok`.
 *
 * Tách khỏi phần parse để `logout` — trả 204, không có body — dùng lại được
 * toàn bộ xử lý timeout, lỗi mạng và mã HTTP mà không phải chép lại lần nữa.
 *
 * Mọi lỗi ném ra đều là `ApiError`, không bao giờ là lỗi thô của fetch.
 */
async function sendRequest(options: {
  path: string
  method: 'GET' | 'POST'
  body?: unknown
  /**
   * Bỏ qua việc xử lý 401 dùng chung.
   *
   * CHỈ endpoint đăng nhập được đặt cờ này. 401 ở đó nghĩa là "sai email hoặc
   * mật khẩu" — một câu trả lời bình thường của form, không phải phiên hết hạn.
   * Để nó chạy luồng chung thì người gõ sai mật khẩu sẽ bị đá về đúng cái màn
   * đang đứng, kèm câu "phiên đã hết hạn" hoàn toàn vô nghĩa với họ.
   */
  skipUnauthorizedHandler?: boolean
}): Promise<Response> {
  const { path, method, body, skipUnauthorizedHandler = false } = options
  const url = `${BASE_URL}${API_PREFIX}${path}`

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: buildHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (cause) {
    // AbortSignal.timeout ném DOMException tên TimeoutError khi hết giờ.
    const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError'
    if (timedOut) {
      throw new ApiError({
        kind: 'timeout',
        userMessage: `Máy chủ xử lý quá lâu (hơn ${TIMEOUT_MS / 1000} giây). Vui lòng thử lại.`,
        logMessage: `Timeout sau ${TIMEOUT_MS}ms: ${method} ${url}`,
        cause,
      })
    }
    throw new ApiError({
      kind: 'network',
      userMessage: 'Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng rồi thử lại.',
      logMessage: `Lỗi mạng: ${method} ${url}`,
      cause,
    })
  }

  if (!response.ok) {
    // Gọi TRƯỚC khi ném: dọn phiên và điều hướng không phụ thuộc vào việc chỗ
    // gọi có bắt lỗi hay không. Vẫn ném tiếp để tầng trên hiện được lỗi nếu nó
    // còn kịp render trước lúc chuyển màn.
    if (response.status === 401 && !skipUnauthorizedHandler) {
      onUnauthorized?.()
    }

    const detail = await readErrorDetail(response)
    throw new ApiError({
      kind: 'http',
      userMessage:
        HTTP_USER_MESSAGES[response.status] ??
        `Máy chủ trả về lỗi ${response.status}. Vui lòng thử lại sau.`,
      logMessage: `HTTP ${response.status} ${response.statusText}: ${method} ${url}${detail ? ` — ${detail}` : ''}`,
      status: response.status,
      detail,
    })
  }

  return response
}

/**
 * Gọi một endpoint rồi parse response bằng `schema`.
 *
 * Mọi lỗi ném ra đều là `ApiError`, không bao giờ là lỗi thô của fetch hay Zod.
 */
async function request<S extends z.ZodType>(options: {
  path: string
  method: 'GET' | 'POST'
  schema: S
  body?: unknown
  skipUnauthorizedHandler?: boolean
  /**
   * Sửa payload thô ngay trước khi parse, để đi vòng qua một lỗi đã biết của
   * máy chủ. Chỉ dùng cho biện pháp tạm, và mỗi chỗ dùng phải ghi rõ hạn gỡ.
   *
   * Đặt ở đây chứ không nới lỏng schema: schema vẫn là bản sao trung thực của
   * hợp đồng, còn chỗ này nói thẳng rằng dữ liệu thật đang lệch hợp đồng.
   */
  repairPayload?: (payload: unknown) => unknown
}): Promise<z.infer<S>> {
  const { path, method, schema, repairPayload } = options
  const url = `${BASE_URL}${API_PREFIX}${path}`

  const response = await sendRequest(options)

  let payload: unknown
  try {
    payload = await response.json()
  } catch (cause) {
    throw new ApiError({
      kind: 'validation',
      userMessage: 'Máy chủ trả về dữ liệu không đọc được. Vui lòng thử lại sau.',
      logMessage: `Response không phải JSON hợp lệ: ${method} ${url}`,
      cause,
    })
  }

  const parsed = schema.safeParse(
    repairPayload === undefined ? payload : repairPayload(payload),
  )
  if (!parsed.success) {
    // Dữ liệu lệch hợp đồng thì thà báo lỗi còn hơn render sai thông tin y tế.
    throw new ApiError({
      kind: 'validation',
      userMessage:
        'Máy chủ trả về dữ liệu không đúng hợp đồng API. Không hiển thị kết quả để tránh sai sót.',
      logMessage: `Response sai schema: ${method} ${url} — ${z.prettifyError(parsed.error)}`,
      issues: parsed.error.issues,
      cause: parsed.error,
    })
  }

  return parsed.data
}

/** Gọi một endpoint không trả body, ví dụ 204 của `/auth/logout`. */
async function requestNoContent(options: {
  path: string
  method: 'GET' | 'POST'
  body?: unknown
}): Promise<void> {
  await sendRequest(options)
}

// ---------------------------------------------------------------------------
// Mục 3: Xác thực
// ---------------------------------------------------------------------------

/**
 * Mục 3 — đăng nhập. Trả token và vai trò của tài khoản.
 *
 * Ném `ApiError` với `status` 401 khi sai email hoặc mật khẩu. Màn đăng nhập
 * bắt riêng mã này để hiện một câu duy nhất cho cả hai trường hợp — phân biệt
 * "sai email" với "sai mật khẩu" cho phép người ngoài dò xem một email có tài
 * khoản trong hệ thống hay không.
 */
export async function login(payload: LoginRequest): Promise<LoginResponse> {
  assertValidRequestBody(loginRequestSchema, payload, 'POST /auth/login')
  return request({
    path: '/auth/login',
    method: 'POST',
    schema: loginResponseSchema,
    body: payload,
    // Endpoint DUY NHẤT bỏ qua luồng 401 dùng chung. Ở đây 401 là "sai mật
    // khẩu", phải hiện ngay trên form chứ không phải "phiên đã hết hạn".
    skipUnauthorizedHandler: true,
  })
}

/**
 * Mục 3 — đăng xuất. Response 204, không có body.
 *
 * Người gọi phải xoá phiên khỏi máy dù hàm này ném lỗi: token nằm lại trên một
 * máy dùng chung còn nguy hiểm hơn là một phiên chưa kịp huỷ ở máy chủ.
 */
export function logout(): Promise<void> {
  return requestNoContent({ path: '/auth/logout', method: 'POST' })
}

// ---------------------------------------------------------------------------
// Bốn endpoint còn lại của mục 2
// ---------------------------------------------------------------------------

/**
 * Ba trạng thái mà hợp đồng mục 5 và mục 6 bắt buộc `citations` phải rỗng.
 *
 * Giữ bản sao riêng ở đây thay vì import từ `schemas.ts`: danh sách bên đó là
 * một hằng nội bộ của schema, và biện pháp tạm bên dưới sẽ bị xoá cả cụm.
 */
const STATUSES_WITHOUT_CITATIONS: ReadonlySet<string> = new Set([
  'red_flag',
  'refused',
  'referral',
])

/** Marker trích dẫn kèm khoảng trắng đứng trước, dạng ` [1]`. */
const ORPHAN_MARKER = /\s*\[\d+\]/g

/**
 * BIỆN PHÁP TẠM — thêm ngày 16/08/2026, chờ backend sửa.
 *
 * LỖI: với `status` là `red_flag`, `refused` hoặc `referral`, backend xoá sạch
 * `citations` nhưng KHÔNG gỡ marker `[1]`, `[2]` đã chèn vào `answer` trước đó
 * (`src/api/v1/chat.py`: chỗ thay `[doc_x]` bằng `[n]` chạy trước khi tính
 * `status`, còn chỗ xoá citations chạy sau và chỉ đụng tới mảng citations).
 *
 * HẬU QUẢ NẾU KHÔNG CÓ HÀM NÀY: ràng buộc hai chiều trong `chatResponseSchema`
 * ném "answer có marker [1] nhưng citations không có phần tử nào mang id 1", cả
 * câu trả lời bị chặn và người dùng chỉ thấy khối lỗi. Ba trạng thái này lại là
 * ba nhánh dễ gặp nhất khi thử: hỏi liều thuốc, kể triệu chứng nguy hiểm, hỏi
 * ngoài phạm vi.
 *
 * VÌ SAO GỠ MARKER CHỨ KHÔNG NỚI SCHEMA: ba trạng thái đó không có nguồn để
 * người dùng bấm vào, nên một số `[1]` nằm giữa câu chỉ là rác. Nới ràng buộc
 * thì lần sau backend đánh rơi citation ở `answered` cũng lọt qua, mà ở đó câu
 * khẳng định y khoa mất nguồn là chuyện nghiêm trọng.
 *
 * KHI NÀO GỠ ĐƯỢC: khi backend gỡ marker trước lúc trả về. Kiểm bằng cách hỏi
 * một câu chạm nhánh `refused` (ví dụ "tôi tăng liều thuốc huyết áp được
 * không") rồi xem `answer` trong tab Network — không còn `[n]` nào là xoá được
 * cả hằng `STATUSES_WITHOUT_CITATIONS`, `ORPHAN_MARKER`, hàm này và tham số
 * `repairPayload` ở chỗ gọi bên dưới.
 */
function dropOrphanMarkers(payload: unknown): unknown {
  if (payload === null || typeof payload !== 'object') return payload

  const body = payload as { status?: unknown; answer?: unknown }
  if (typeof body.status !== 'string' || !STATUSES_WITHOUT_CITATIONS.has(body.status)) {
    return payload
  }
  if (typeof body.answer !== 'string') return payload

  const cleaned = body.answer.replace(ORPHAN_MARKER, '').trim()
  if (cleaned === body.answer) return payload

  if (import.meta.env.DEV) {
    console.warn(
      `[api] Đã gỡ marker trích dẫn thừa khỏi answer của status "${body.status}". ` +
        'Đây là biện pháp tạm chờ backend sửa — xem ghi chú ở dropOrphanMarkers trong lib/api.ts.',
    )
  }

  return { ...body, answer: cleaned }
}

/**
 * Mục 5 — gửi câu hỏi. `conversation_id` bằng `null` là mở phiên mới.
 *
 * `async` để lỗi payload cũng trả về dưới dạng promise bị reject, đồng nhất với
 * mọi lỗi khác thay vì ném đồng bộ.
 */
export async function sendChatMessage(payload: ChatRequest): Promise<ChatResponse> {
  assertValidRequestBody(chatRequestSchema, payload, 'POST /chat')
  return request({
    path: '/chat',
    method: 'POST',
    schema: chatResponseSchema,
    body: payload,
    repairPayload: dropOrphanMarkers,
  })
}

/** Step event từ SSE /chat/stream — mỗi node LangGraph kích hoạt 1 event. */
export type StreamStepEvent = {
  node: string
  message: string
  icon: string
}

/** Done event từ SSE /chat/stream — kết quả cuối sau khi tất cả node chạy xong. */
export type StreamDoneEvent = {
  conversation_id: string
  message_id: string
  status: ChatResponse['status']
  answer: string
  citations: ChatResponse['citations']
  support_level: ChatResponse['support_level']
  intent: string
  disclaimer: string
}

/**
 * Gửi câu hỏi lên /chat/stream và đọc SSE realtime.
 *
 * Gọi callbacks theo từng loại event:
 * - onStep:  mỗi khi một node LangGraph bắt đầu (ví dụ "📚 Đang tìm kiếm...")
 * - onToken: từng mảnh nhỏ của câu trả lời (streaming text)
 * - onDone:  citations + support_level sau khi hoàn tất
 * - onError: lỗi trong quá trình stream
 */
export async function streamChatMessage(
  payload: ChatRequest,
  callbacks: {
    onStep?: (event: StreamStepEvent) => void
    onToken?: (text: string) => void
    onDone?: (event: StreamDoneEvent) => void
    onError?: (error: ApiError) => void
  },
): Promise<void> {
  assertValidRequestBody(chatRequestSchema, payload, 'POST /chat/stream')

  const url = `${BASE_URL}${API_PREFIX}/chat/stream`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (cause) {
    const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError'
    throw new ApiError({
      kind: timedOut ? 'timeout' : 'network',
      userMessage: timedOut
        ? `Máy chủ xử lý quá lâu (hơn ${TIMEOUT_MS / 1000} giây). Vui lòng thử lại.`
        : 'Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng rồi thử lại.',
      logMessage: `Stream lỗi: POST ${url}`,
      cause,
    })
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response)
    throw new ApiError({
      kind: 'http',
      userMessage:
        HTTP_USER_MESSAGES[response.status] ??
        `Máy chủ trả về lỗi ${response.status}. Vui lòng thử lại sau.`,
      logMessage: `HTTP ${response.status}: POST ${url}${detail ? ` — ${detail}` : ''}`,
      status: response.status,
      detail,
    })
  }

  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    let eventType = ''
    let dataLine = ''

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        dataLine = line.slice(6).trim()
      } else if (line === '' && eventType && dataLine) {
        // Một SSE event hoàn chỉnh
        try {
          const parsed: unknown = JSON.parse(dataLine)
          if (typeof parsed !== 'object' || parsed === null) continue

          if (eventType === 'step' && callbacks.onStep) {
            callbacks.onStep(parsed as StreamStepEvent)
          } else if (eventType === 'token' && callbacks.onToken) {
            callbacks.onToken((parsed as { text: string }).text)
          } else if (eventType === 'done' && callbacks.onDone) {
            callbacks.onDone(parsed as StreamDoneEvent)
          } else if (eventType === 'error' && callbacks.onError) {
            callbacks.onError(
              new ApiError({
                kind: 'http',
                userMessage: (parsed as { error: string }).error ?? 'Lỗi từ server.',
                logMessage: `SSE error event: ${dataLine}`,
              }),
            )
          }
        } catch {
          // JSON parse lỗi — bỏ qua dòng này
        }
        eventType = ''
        dataLine = ''
      }
    }
  }
}


/**
 * Mục 4 — tạo hoặc cập nhật hồ sơ bệnh nhân.
 *
 * Nhận kiểu input của schema nên `comorbidities` và `diagnosed_at` được phép
 * bỏ trống, đúng như cột "Bắt buộc" trong bảng mục 4.
 */
export async function upsertPatientProfile(
  payload: z.input<typeof patientProfileSchema>,
): Promise<PatientProfileResponse> {
  assertValidRequestBody(patientProfileSchema, payload, 'POST /patients/profile')
  return request({
    path: '/patients/profile',
    method: 'POST',
    schema: patientProfileResponseSchema,
    body: payload,
  })
}

/** Mục 4 — đọc hồ sơ. Backend trả 404 nếu chưa có hồ sơ. */
export function getPatientProfile(patientId: string): Promise<PatientProfileResponse> {
  return request({
    path: `/patients/${encodeURIComponent(patientId)}/profile`,
    method: 'GET',
    schema: patientProfileResponseSchema,
  })
}

/** Mục 7 — danh sách phiên hội thoại của một bệnh nhân. */
export function listConversations(patientId: string): Promise<ConversationList> {
  return request({
    path: `/conversations/${encodeURIComponent(patientId)}`,
    method: 'GET',
    schema: conversationListSchema,
  })
}

/** Mục 7 — chi tiết một phiên, gồm toàn bộ message theo thứ tự thời gian. */
export function getConversationDetail(
  patientId: string,
  conversationId: string,
): Promise<ConversationDetail> {
  return request({
    path: `/conversations/${encodeURIComponent(patientId)}/${encodeURIComponent(conversationId)}`,
    method: 'GET',
    schema: conversationDetailSchema,
  })
}

// ---------------------------------------------------------------------------
// Mục 8: Quản trị nội dung
//
// Bảy hàm dưới đây chỉ chạy được với tài khoản có `role` bằng `editor`. Vai trò
// khác thì backend trả 403, và `HTTP_USER_MESSAGES` ở trên đã có sẵn câu tiếng
// Việt cho mã đó.
// ---------------------------------------------------------------------------

/** Mục 8 — hai con số ở màn tổng quan: đang chờ duyệt, và chưa ai bắt đầu. */
export function getEditorDashboard(): Promise<EditorDashboard> {
  return request({
    path: '/editor/dashboard',
    method: 'GET',
    schema: editorDashboardSchema,
  })
}

/**
 * Mục 8 — danh sách mục trong hàng đợi.
 *
 * Bỏ trống `status` thì backend mặc định trả nhóm `pending`, đúng như bản vẽ:
 * mở màn hàng đợi ra là thấy ngay việc đang chờ duyệt.
 */
export function listEditorQueue(status?: EditorItemStatus): Promise<EditorQueueList> {
  const query = status === undefined ? '' : `?status=${encodeURIComponent(status)}`
  return request({
    path: `/editor/queue${query}`,
    method: 'GET',
    schema: editorQueueListSchema,
  })
}

/** Mục 8 — chi tiết một mục, đủ để dựng cả màn duyệt trong một lần gọi. */
export function getEditorQueueItem(itemId: string): Promise<EditorQueueItemDetail> {
  return request({
    path: `/editor/queue/${encodeURIComponent(itemId)}`,
    method: 'GET',
    schema: editorQueueItemDetailSchema,
  })
}

/**
 * Mục 8 — duyệt một mục, đưa vào thư viện chính thức.
 *
 * Ném `ApiError` với `status` 409 khi mục đã được duyệt hoặc từ chối trước đó.
 * Đây là hành động một chiều: một nút bấm hai lần vì mạng chậm không được phép
 * ghi vào thư viện hai lần.
 */
export async function approveEditorQueueItem(
  itemId: string,
  payload: EditorApproveRequest = {},
): Promise<EditorQueueItemDetail> {
  assertValidRequestBody(
    editorApproveRequestSchema,
    payload,
    `POST /editor/queue/${itemId}/approve`,
  )
  return request({
    path: `/editor/queue/${encodeURIComponent(itemId)}/approve`,
    method: 'POST',
    schema: editorQueueItemDetailSchema,
    body: payload,
  })
}

/**
 * Mục 8 — từ chối một mục. `reason` bắt buộc, schema chặn cả chuỗi toàn khoảng
 * trắng ngay tại client nên không tốn một vòng request để nhận về 422.
 */
export async function rejectEditorQueueItem(
  itemId: string,
  payload: EditorRejectRequest,
): Promise<EditorQueueItemDetail> {
  assertValidRequestBody(
    editorRejectRequestSchema,
    payload,
    `POST /editor/queue/${itemId}/reject`,
  )
  return request({
    path: `/editor/queue/${encodeURIComponent(itemId)}/reject`,
    method: 'POST',
    schema: editorQueueItemDetailSchema,
    body: payload,
  })
}

/** Mục 8 — câu hỏi thư viện chưa trả lời được, xếp theo số lượt hỏi giảm dần. */
export function listOutOfScopeLogs(): Promise<OutOfScopeList> {
  return request({
    path: '/editor/out-of-scope',
    method: 'GET',
    schema: outOfScopeListSchema,
  })
}

/**
 * Mục 8 — tạo một mục nháp trong hàng đợi từ một câu hỏi ngoài phạm vi.
 *
 * KHÔNG gửi body: hợp đồng ghi rõ endpoint này không nhận gì. Log đã có nháp rồi
 * thì backend trả lại chính mục nháp đang có thay vì tạo cái thứ hai, nên hàm
 * này gọi mấy lần cũng chỉ ra một kết quả.
 */
export function createDraftFromLog(logId: string): Promise<EditorQueueItemDetail> {
  return request({
    path: `/editor/out-of-scope/${encodeURIComponent(logId)}/draft`,
    method: 'POST',
    schema: editorQueueItemDetailSchema,
  })
}

/**
 * Mục 8 — Upload PDF tài liệu y khoa.
 * Do UploadFile dùng FormData nên chúng ta gửi qua một hàm fetch riêng, không dùng request()
 * vì request() đang mặc định content-type là application/json.
 */
export async function uploadDocument(formData: FormData): Promise<void> {
  const url = `${BASE_URL}${API_PREFIX}/editor/queue/upload`
  
  const headers: Record<string, string> = {}
  if (authToken !== null && authToken !== '') {
    headers.Authorization = `Bearer ${authToken}`
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData, // Trình duyệt sẽ tự động thêm Content-Type: multipart/form-data
  })

  if (!response.ok) {
    if (response.status === 401) {
      onUnauthorized?.()
    }
    throw new ApiError({
      kind: 'http',
      userMessage: HTTP_USER_MESSAGES[response.status] ?? 'Lỗi khi tải lên tài liệu.',
      logMessage: `HTTP ${response.status} khi upload document`,
      status: response.status,
    })
  }
}

// ---------------------------------------------------------------------------
// Gamification & Learning (Bệnh nhân)
// ---------------------------------------------------------------------------

export function getDailyLesson(): Promise<DailyLessonResponse> {
  return request({
    path: `/learning/daily-lesson`,
    method: 'GET',
    schema: dailyLessonResponseSchema,
  })
}

export function getLearningLibrary(): Promise<LearningLibraryResponse> {
  return request({
    path: `/learning/library`,
    method: 'GET',
    schema: learningLibraryResponseSchema,
  })
}

export function completeLesson(
  articleId: string,
  payload: CompleteLessonRequest,
): Promise<CompleteLessonResponse> {
  return request({
    path: `/learning/complete-lesson/${encodeURIComponent(articleId)}`,
    method: 'POST',
    schema: completeLessonResponseSchema,
    body: payload,
  })
}
export type {
  DailyLessonResponse,
  GamificationStats,
  LearningLibraryResponse,
  CompleteLessonRequest,
  CompleteLessonResponse,
} from './schemas'

// ---------------------------------------------------------------------------
// Mục 13: Trắc nghiệm kiến thức (Mini-Quiz Generation)
// ---------------------------------------------------------------------------

/**
 * Sinh đề mới. Đây là lời gọi CHẬM nhất của ứng dụng (~3-6s vì có LLM ở giữa),
 * nên chỗ gọi phải hiện trạng thái chờ tử tế thay vì để màn hình đứng im.
 */
export function generateQuiz(payload: QuizRequestPayload): Promise<QuizResponse> {
  return request({
    path: `/quiz`,
    method: 'POST',
    schema: quizResponseSchema,
    body: payload,
  })
}

/** Nộp bài. Sai hết vẫn trả 200 kèm giải thích từng câu — xem hợp đồng mục 13. */
export function submitQuiz(
  quizId: string,
  payload: QuizSubmitRequest,
): Promise<QuizSubmitResponse> {
  return request({
    path: `/quiz/${encodeURIComponent(quizId)}/submit`,
    method: 'POST',
    schema: quizSubmitResponseSchema,
    body: payload,
  })
}

export function getQuizHistory(): Promise<QuizHistoryResponse> {
  return request({
    path: `/quiz/history`,
    method: 'GET',
    schema: quizHistoryResponseSchema,
  })
}

/** Những chỗ người học đã trả lời sai, gom nhóm, câu sai nhiều lần đứng trước. */
export function getQuizMistakes(): Promise<QuizMistakesResponse> {
  return request({
    path: `/quiz/mistakes`,
    method: 'GET',
    schema: quizMistakesResponseSchema,
  })
}

export type {
  QuizSource,
  QuizQuestion,
  QuizResponse,
  QuizResult,
  QuizSubmitRequest,
  QuizSubmitResponse,
  QuizHistoryResponse,
  QuizMistake,
  QuizMistakesResponse,
} from './schemas'
