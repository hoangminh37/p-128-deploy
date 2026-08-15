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
}): Promise<Response> {
  const { path, method, body } = options
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
}): Promise<z.infer<S>> {
  const { path, method, schema } = options
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

  const parsed = schema.safeParse(payload)
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
  })
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
