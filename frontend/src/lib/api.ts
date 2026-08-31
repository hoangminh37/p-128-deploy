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
  consultationDetailSchema,
  consultationListSchema,
  consultationMessageSchema,
  conversationDetailSchema,
  conversationListSchema,
  editorApproveRequestSchema,
  editorDraftUpdateRequestSchema,
  editorConditionListSchema,
  editorConditionSchema,
  editorConditionStatusRequestSchema,
  editorCreateConditionRequestSchema,
  editorDashboardSchema,
  editorSourceDocumentListSchema,
  editorQueueItemDetailSchema,
  editorQueueListSchema,
  editorRejectRequestSchema,
  patientEditorialQuestionListSchema,
  patientEditorialQuestionSchema,
  answerPatientEditorialQuestionRequestSchema,
  loginRequestSchema,
  loginResponseSchema,
  outOfScopeListSchema,
  patientProfileResponseSchema,
  patientProfileSchema,
  patientNotificationListSchema,
  patientNotificationSchema,
  dailyLessonResponseSchema,
  completeLessonResponseSchema,
  createConsultationRequestSchema,
  createDoctorRequestSchema,
  annotationsEventSchema,
  availableConditionListSchema,
  adminDoctorListSchema,
  adminDoctorSchema,
  doctorListSchema,
  doctorDashboardSchema,
  doctorNotificationListSchema,
  doctorNotificationSchema,
  doctorOwnProfileSchema,
  doctorPublicProfileSchema,
  type ChatRequest,
  type ChatResponse,
  type ConsultationDetail,
  type ConsultationList,
  type ConsultationMessage,
  type ConversationDetail,
  type ConversationList,
  type EditorApproveRequest,
  type EditorDraftUpdateRequest,
  type EditorCondition,
  type EditorConditionList,
  type EditorConditionStatusRequest,
  type EditorCreateConditionRequest,
  type EditorDashboard,
  type EditorItemStatus,
  type EditorQueueItemDetail,
  type EditorQueueList,
  type EditorRejectRequest,
  type EditorSourceDocumentList,
  type PatientEditorialQuestionList,
  type PatientEditorialQuestion,
  type PatientEditorialQuestionStatus,
  type AnswerPatientEditorialQuestionRequest,
  type LoginRequest,
  type LoginResponse,
  type OutOfScopeList,
  type PatientProfileResponse,
  type PatientNotification,
  type PatientNotificationList,
  type DailyLessonResponse,
  type LearningLibraryResponse,
  type CompleteLessonRequest,
  type CompleteLessonResponse,
  type CreateConsultationRequest,
  type CreateDoctorRequest,
  learningLibraryResponseSchema,
  quizResponseSchema,
  quizSubmitResponseSchema,
  quizHistoryResponseSchema,
  quizMistakesResponseSchema,
  sourceDocumentSchema,
  type AnnotationsEvent,
  type AvailableConditionList,
  type AdminDoctor,
  type AdminDoctorList,
  type DoctorList,
  type DoctorDashboard,
  type DoctorNotification,
  type DoctorNotificationList,
  type DoctorOwnProfile,
  type DoctorPublicProfile,
  type QuizMistakesResponse,
  type QuizRequest as QuizRequestPayload,
  type QuizResponse,
  type QuizSubmitRequest,
  type QuizSubmitResponse,
  type QuizHistoryResponse,
  type SourceDocument,
  type SendConsultationMessageRequest,
  type UpdateAdminDoctorRequest,
  type UpdateDoctorOwnProfileRequest,
  type VideoCallStart,
  type VideoSignal,
  type VideoSignalList,
  type VideoSignalRequest,
  sendConsultationMessageRequestSchema,
  updateAdminDoctorRequestSchema,
  updateDoctorOwnProfileRequestSchema,
  videoCallStartSchema,
  videoSignalSchema,
  videoSignalListSchema,
  videoSignalRequestSchema,
  voiceSpeechRequestSchema,
  voiceTranscriptionSchema,
  type VoiceSpeechRequest,
  type VoiceTranscription,
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
  413: 'Bản ghi âm quá dài. Bạn hãy nói ngắn hơn rồi thử lại.',
  415: 'Trình duyệt đã gửi định dạng âm thanh chưa được hỗ trợ. Bạn hãy thử lại bằng trình duyệt hiện đại.',
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
  method: 'GET' | 'POST' | 'PATCH'
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
  method: 'GET' | 'POST' | 'PATCH'
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
  method: 'GET' | 'POST' | 'PATCH'
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
  /** Thời gian từ khi backend nhận request đến khi graph hoàn tất. */
  latency_ms?: number
  /** Thời gian mỗi node, dùng cho quan sát hiệu năng khi cần. */
  node_timings_ms?: Record<string, number>
}

export type ChatStreamCallbacks = {
  /** Only emitted by `/voice/chat/stream`, before the normal agent events. */
  onTranscript?: (transcript: string) => void
  onStep?: (event: StreamStepEvent) => void
  onToken?: (text: string) => void
  onDone?: (event: StreamDoneEvent) => void
  onAnnotations?: (event: AnnotationsEvent) => void
  onError?: (error: ApiError) => void
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
  callbacks: ChatStreamCallbacks,
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

  return consumeChatSse(response, url, callbacks)
}

/**
 * Send a recording to the server-owned voice flow. The browser receives the
 * same SSE events as text chat, preceded by the transcript event that the
 * server derived from the recording.
 */
export async function streamVoiceChatMessage(
  params: {
    patientId: string
    conversationId: string | null
    audio: Blob
  },
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  const url = `${BASE_URL}${API_PREFIX}/voice/chat/stream`
  const formData = new FormData()
  formData.set('patient_id', params.patientId)
  if (params.conversationId !== null) formData.set('conversation_id', params.conversationId)

  const filename = params.audio.type.startsWith('audio/mp4')
    ? 'patient-question.m4a'
    : params.audio.type.startsWith('audio/mpeg')
      ? 'patient-question.mp3'
      : 'patient-question.webm'
  formData.set('audio', params.audio, filename)

  const headers: Record<string, string> = {}
  if (authToken !== null && authToken !== '') headers.Authorization = `Bearer ${authToken}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (cause) {
    const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError'
    throw new ApiError({
      kind: timedOut ? 'timeout' : 'network',
      userMessage: timedOut
        ? `Dịch vụ giọng nói xử lý quá lâu (hơn ${TIMEOUT_MS / 1000} giây). Vui lòng thử lại.`
        : 'Không kết nối được tới dịch vụ giọng nói. Vui lòng kiểm tra mạng rồi thử lại.',
      logMessage: `Voice chat stream lỗi: POST ${url}`,
      cause,
    })
  }

  if (!response.ok) {
    if (response.status === 401) onUnauthorized?.()
    const detail = await readErrorDetail(response)
    throw new ApiError({
      kind: 'http',
      userMessage:
        HTTP_USER_MESSAGES[response.status] ??
        'Không thể xử lý câu hỏi bằng giọng nói lúc này. Vui lòng thử lại.',
      logMessage: `HTTP ${response.status}: POST ${url}${detail ? ` — ${detail}` : ''}`,
      status: response.status,
      detail,
    })
  }

  return consumeChatSse(response, url, callbacks)
}

/** One SSE parser shared by text and server-owned voice chat. */
async function consumeChatSse(
  response: Response,
  url: string,
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new ApiError({
      kind: 'network',
      userMessage: 'Máy chủ không thể mở luồng trả lời. Bạn hãy bấm Gửi lại câu hỏi.',
      logMessage: `Response không có body stream: POST ${url}`,
    })
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let receivedDone = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      // Chunk mạng không trùng ranh giới SSE. Tách theo frame hoàn chỉnh thay
      // vì theo từng lần reader.read(), nếu không `event:` và `data:` có thể
      // nằm ở hai chunk khác nhau và làm mất event `done`.
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''

      for (const frame of frames) {
        let eventType = ''
        const dataLines: string[] = []
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim())
          }
        }

        const dataLine = dataLines.join('\n')
        if (!eventType || !dataLine) continue

        // Một SSE event hoàn chỉnh
        try {
          const parsed: unknown = JSON.parse(dataLine)
          if (typeof parsed !== 'object' || parsed === null) continue

          if (eventType === 'transcript' && callbacks.onTranscript) {
            const transcript = (parsed as { transcript?: unknown }).transcript
            if (typeof transcript === 'string' && transcript.trim()) {
              callbacks.onTranscript(transcript.trim())
            }
          } else if (eventType === 'step' && callbacks.onStep) {
            callbacks.onStep(parsed as StreamStepEvent)
          } else if (eventType === 'token' && callbacks.onToken) {
            callbacks.onToken((parsed as { text: string }).text)
          } else if (eventType === 'done') {
            receivedDone = true
            callbacks.onDone?.(parsed as StreamDoneEvent)
          } else if (eventType === 'annotations' && callbacks.onAnnotations) {
            const result = annotationsEventSchema.safeParse(parsed)
            if (result.success) {
              callbacks.onAnnotations(result.data)
            }
          } else if (eventType === 'error') {
            callbacks.onError?.(
              new ApiError({
                kind: 'http',
                userMessage: (parsed as { error: string }).error ?? 'Lỗi từ server.',
                logMessage: `SSE error event: ${dataLine}`,
              }),
            )
            return
          }
        } catch {
          // JSON parse lỗi — bỏ qua frame này.
        }
      }
    }
  } catch (cause) {
    const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError'
    throw new ApiError({
      kind: timedOut ? 'timeout' : 'network',
      userMessage: timedOut
        ? `Máy chủ xử lý quá lâu (hơn ${TIMEOUT_MS / 1000} giây). Vui lòng thử lại.`
        : 'Kết nối tới máy chủ bị ngắt khi đang xử lý câu hỏi. Bạn hãy bấm Gửi lại câu hỏi.',
      logMessage: `SSE bị ngắt: POST ${url}`,
      cause,
    })
  }

  if (!receivedDone) {
    throw new ApiError({
      kind: 'network',
      userMessage: 'Kết nối tới máy chủ bị ngắt trước khi có câu trả lời. Bạn hãy bấm Gửi lại câu hỏi.',
      logMessage: `SSE kết thúc không có done event: POST ${url}`,
    })
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

/** Private notification inbox of the authenticated patient. */
export function listPatientNotifications(): Promise<PatientNotificationList> {
  return request({
    path: '/patients/notifications',
    method: 'GET',
    schema: patientNotificationListSchema,
  })
}

export function markPatientNotificationRead(notificationId: string): Promise<PatientNotification> {
  return request({
    path: `/patients/notifications/${encodeURIComponent(notificationId)}/read`,
    method: 'POST',
    schema: patientNotificationSchema,
  })
}

/** Mở tài liệu đã duyệt và đánh dấu đúng chunk được citation trỏ tới. */
export function getSourceDocument(documentId: string, chunkId: string): Promise<SourceDocument> {
  const params = new URLSearchParams({ chunk_id: chunkId })
  return request({
    path: `/sources/documents/${encodeURIComponent(documentId)}?${params.toString()}`,
    method: 'GET',
    schema: sourceDocumentSchema,
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
// Tư vấn bác sỹ
// ---------------------------------------------------------------------------

/** Danh sách bác sỹ đang được BTV bật nhận tư vấn. */
export function listAvailableDoctors(): Promise<DoctorList> {
  return request({ path: '/consultations/doctors', method: 'GET', schema: doctorListSchema })
}

/** Full verified professional profile before a patient selects a doctor. */
export function getDoctorPublicProfile(doctorId: string): Promise<DoctorPublicProfile> {
  return request({
    path: `/consultations/doctors/${encodeURIComponent(doctorId)}`,
    method: 'GET',
    schema: doctorPublicProfileSchema,
  })
}

/** Danh sách phiên tư vấn của đúng tài khoản đang đăng nhập. */
export function listConsultations(): Promise<ConsultationList> {
  return request({ path: '/consultations', method: 'GET', schema: consultationListSchema })
}

/** Nội dung chat và trạng thái video của một phiên được xác thực. */
export function getConsultation(consultationId: string): Promise<ConsultationDetail> {
  return request({
    path: `/consultations/${encodeURIComponent(consultationId)}`,
    method: 'GET',
    schema: consultationDetailSchema,
  })
}

export async function createConsultation(
  payload: CreateConsultationRequest,
): Promise<ConsultationDetail> {
  assertValidRequestBody(createConsultationRequestSchema, payload, 'POST /consultations')
  return request({ path: '/consultations', method: 'POST', schema: consultationDetailSchema, body: payload })
}

export function acceptConsultation(consultationId: string): Promise<ConsultationDetail> {
  return request({
    path: `/consultations/${encodeURIComponent(consultationId)}/accept`,
    method: 'POST',
    schema: consultationDetailSchema,
  })
}

export function endConsultation(consultationId: string): Promise<ConsultationDetail> {
  return request({
    path: `/consultations/${encodeURIComponent(consultationId)}/end`,
    method: 'POST',
    schema: consultationDetailSchema,
  })
}

export async function sendConsultationMessage(
  consultationId: string,
  payload: SendConsultationMessageRequest,
): Promise<ConsultationMessage> {
  assertValidRequestBody(
    sendConsultationMessageRequestSchema,
    payload,
    `POST /consultations/${consultationId}/messages`,
  )
  return request({
    path: `/consultations/${encodeURIComponent(consultationId)}/messages`,
    method: 'POST',
    schema: consultationMessageSchema,
    body: payload,
  })
}

export function startVideoCall(consultationId: string): Promise<VideoCallStart> {
  return request({
    path: `/consultations/${encodeURIComponent(consultationId)}/calls`,
    method: 'POST',
    schema: videoCallStartSchema,
  })
}

export function joinVideoCall(
  consultationId: string,
  callId: string,
): Promise<VideoCallStart> {
  return request({
    path: `/consultations/${encodeURIComponent(consultationId)}/calls/${encodeURIComponent(callId)}/join`,
    method: 'POST',
    schema: videoCallStartSchema,
  })
}

export async function postVideoSignal(
  consultationId: string,
  callId: string,
  payload: VideoSignalRequest,
): Promise<VideoSignal> {
  assertValidRequestBody(
    videoSignalRequestSchema,
    payload,
    `POST /consultations/${consultationId}/calls/${callId}/signals`,
  )
  return request({
    path: `/consultations/${encodeURIComponent(consultationId)}/calls/${encodeURIComponent(callId)}/signals`,
    method: 'POST',
    schema: videoSignalSchema,
    body: payload,
  })
}

export function getVideoSignals(
  consultationId: string,
  callId: string,
  afterId: number,
): Promise<VideoSignalList> {
  return request({
    path: `/consultations/${encodeURIComponent(consultationId)}/calls/${encodeURIComponent(callId)}/signals?after_id=${afterId}`,
    method: 'GET',
    schema: videoSignalListSchema,
  })
}

export function endVideoCall(consultationId: string, callId: string): Promise<void> {
  return requestNoContent({
    path: `/consultations/${encodeURIComponent(consultationId)}/calls/${encodeURIComponent(callId)}/end`,
    method: 'POST',
  })
}

/** BTV quản lý tài khoản và khả năng nhận tư vấn của bác sỹ. */
export function listAdminDoctors(): Promise<AdminDoctorList> {
  return request({ path: '/consultations/admin/doctors', method: 'GET', schema: adminDoctorListSchema })
}

/** In-app alerts emitted by actions from the doctor's own patients. */
export function listDoctorNotifications(): Promise<DoctorNotificationList> {
  return request({
    path: '/consultations/notifications',
    method: 'GET',
    schema: doctorNotificationListSchema,
  })
}

/** The signed-in doctor's profile, including only their own account state. */
export function getOwnDoctorProfile(): Promise<DoctorOwnProfile> {
  return request({
    path: '/consultations/me/profile',
    method: 'GET',
    schema: doctorOwnProfileSchema,
  })
}

/** Aggregated operational counts for the signed-in doctor's home screen. */
export function getDoctorDashboard(): Promise<DoctorDashboard> {
  return request({
    path: '/consultations/dashboard',
    method: 'GET',
    schema: doctorDashboardSchema,
  })
}

/** Update patient-facing profile information without changing BTV-verified data. */
export async function updateOwnDoctorProfile(
  payload: UpdateDoctorOwnProfileRequest,
): Promise<DoctorOwnProfile> {
  assertValidRequestBody(
    updateDoctorOwnProfileRequestSchema,
    payload,
    'PATCH /consultations/me/profile',
  )
  return request({
    path: '/consultations/me/profile',
    method: 'PATCH',
    schema: doctorOwnProfileSchema,
    body: payload,
  })
}

export function markDoctorNotificationRead(notificationId: string): Promise<DoctorNotification> {
  return request({
    path: `/consultations/notifications/${encodeURIComponent(notificationId)}/read`,
    method: 'POST',
    schema: doctorNotificationSchema,
  })
}

export async function createDoctor(payload: CreateDoctorRequest): Promise<AdminDoctor> {
  assertValidRequestBody(createDoctorRequestSchema, payload, 'POST /consultations/admin/doctors')
  return request({
    path: '/consultations/admin/doctors',
    method: 'POST',
    schema: adminDoctorSchema,
    body: payload,
  })
}

export async function updateAdminDoctor(
  doctorId: string,
  payload: UpdateAdminDoctorRequest,
): Promise<AdminDoctor> {
  assertValidRequestBody(
    updateAdminDoctorRequestSchema,
    payload,
    `PATCH /consultations/admin/doctors/${doctorId}`,
  )
  return request({
    path: `/consultations/admin/doctors/${encodeURIComponent(doctorId)}`,
    method: 'PATCH',
    schema: adminDoctorSchema,
    body: payload,
  })
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

/**
 * Chuyển một bản ghi ngắn thành chữ. Không đặt `Content-Type` bằng tay: trình
 * duyệt cần tự thêm multipart boundary cho FormData.
 */
export async function transcribeVoiceAudio(params: {
  patientId: string
  audio: Blob
}): Promise<VoiceTranscription> {
  const { patientId, audio } = params
  const url = `${BASE_URL}${API_PREFIX}/voice/transcriptions`
  const formData = new FormData()
  formData.set('patient_id', patientId)
  formData.set('audio', audio, 'patient-question.webm')

  const headers: Record<string, string> = {}
  if (authToken !== null && authToken !== '') headers.Authorization = `Bearer ${authToken}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (cause) {
    const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError'
    throw new ApiError({
      kind: timedOut ? 'timeout' : 'network',
      userMessage: timedOut
        ? `Dịch vụ giọng nói xử lý quá lâu (hơn ${TIMEOUT_MS / 1000} giây). Vui lòng thử lại.`
        : 'Không kết nối được tới dịch vụ giọng nói. Vui lòng kiểm tra mạng rồi thử lại.',
      logMessage: `Voice transcription lỗi: POST ${url}`,
      cause,
    })
  }

  if (!response.ok) {
    if (response.status === 401) onUnauthorized?.()
    const detail = await readErrorDetail(response)
    throw new ApiError({
      kind: 'http',
      userMessage: HTTP_USER_MESSAGES[response.status] ?? 'Không thể nhận diện lời nói lúc này. Vui lòng thử lại.',
      logMessage: `HTTP ${response.status}: POST ${url}${detail ? ` — ${detail}` : ''}`,
      status: response.status,
      detail,
    })
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (cause) {
    throw new ApiError({
      kind: 'validation',
      userMessage: 'Dịch vụ giọng nói trả về dữ liệu không đọc được. Vui lòng thử lại.',
      logMessage: `Voice transcription response không phải JSON: POST ${url}`,
      cause,
    })
  }

  const parsed = voiceTranscriptionSchema.safeParse(payload)
  if (!parsed.success) {
    throw new ApiError({
      kind: 'validation',
      userMessage: 'Dịch vụ giọng nói trả về dữ liệu không đúng định dạng. Vui lòng thử lại.',
      logMessage: `Voice transcription response sai schema: ${z.prettifyError(parsed.error)}`,
      issues: parsed.error.issues,
      cause: parsed.error,
    })
  }
  return parsed.data
}

/** Lấy MP3 của một câu trả lời đã được agent lưu và xác minh. */
export async function getVoiceSpeechAudio(
  payload: VoiceSpeechRequest,
): Promise<Blob> {
  assertValidRequestBody(voiceSpeechRequestSchema, payload, 'POST /voice/speech')
  const response = await sendRequest({
    path: '/voice/speech',
    method: 'POST',
    body: payload,
  })
  const audio = await response.blob()
  if (audio.size === 0) {
    throw new ApiError({
      kind: 'validation',
      userMessage: 'Dịch vụ giọng nói chưa tạo được âm thanh. Vui lòng thử lại.',
      logMessage: 'Voice speech response rỗng: POST /voice/speech',
    })
  }
  return audio
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

/** Danh mục bệnh thật do registry nền và runtime YAML hợp thành. */
export function listEditorConditions(): Promise<EditorConditionList> {
  return request({
    path: '/editor/conditions',
    method: 'GET',
    schema: editorConditionListSchema,
  })
}

/** Tạo một bệnh ở trạng thái chờ nguồn; thao tác này không tự đưa gì vào RAG. */
export async function createEditorCondition(
  payload: EditorCreateConditionRequest,
): Promise<EditorCondition> {
  assertValidRequestBody(editorCreateConditionRequestSchema, payload, 'POST /editor/conditions')
  return request({
    path: '/editor/conditions',
    method: 'POST',
    schema: editorConditionSchema,
    body: payload,
  })
}

/** Tạm ngừng hoặc bật lại một bệnh runtime đã có nguồn index thành công. */
export async function updateEditorConditionStatus(
  conditionId: string,
  payload: EditorConditionStatusRequest,
): Promise<EditorCondition> {
  assertValidRequestBody(
    editorConditionStatusRequestSchema,
    payload,
    `POST /editor/conditions/${conditionId}/status`,
  )
  return request({
    path: `/editor/conditions/${encodeURIComponent(conditionId)}/status`,
    method: 'POST',
    schema: editorConditionSchema,
    body: payload,
  })
}

/** Danh sách nguồn thật trong registry RAG, kèm trạng thái duyệt và index. */
export function listEditorSourceDocuments(): Promise<EditorSourceDocumentList> {
  return request({
    path: '/editor/documents',
    method: 'GET',
    schema: editorSourceDocumentListSchema,
  })
}

/** File gốc của nguồn chỉ được tải khi biên tập viên chủ động mở toàn văn.
 *
 * Không dùng `request()` ở đây vì PDF/Markdown là bytes, không phải JSON. Vẫn
 * đi qua `sendRequest()` để giữ nguyên timeout, xử lý 401 và cách chuẩn hoá
 * lỗi của toàn bộ lớp API. Caller giữ Blob cục bộ thay vì đưa file lớn vào cache
 * TanStack Query.
 */
export async function getEditorSourceDocumentFile(documentId: string): Promise<Blob> {
  const response = await sendRequest({
    path: `/editor/documents/${encodeURIComponent(documentId)}/file`,
    method: 'GET',
  })

  try {
    return await response.blob()
  } catch (cause) {
    throw new ApiError({
      kind: 'validation',
      userMessage: 'Không đọc được file gốc từ máy chủ. Vui lòng thử lại sau.',
      logMessage: `Không đọc được file gốc: GET /editor/documents/${documentId}/file`,
      cause,
    })
  }
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

/** Lưu bản nháp đang soạn, không đổi nó sang trạng thái duyệt. */
export async function updateEditorQueueDraft(
  itemId: string,
  payload: EditorDraftUpdateRequest,
): Promise<EditorQueueItemDetail> {
  assertValidRequestBody(
    editorDraftUpdateRequestSchema,
    payload,
    `PATCH /editor/queue/${itemId}/draft`,
  )
  return request({
    path: `/editor/queue/${encodeURIComponent(itemId)}/draft`,
    method: 'PATCH',
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

/** Chạy lại parse/chunk/embedding cho một nguồn từng index thất bại. */
export function retryEditorSourceIndex(itemId: string): Promise<EditorQueueItemDetail> {
  return request({
    path: `/editor/queue/${encodeURIComponent(itemId)}/retry-index`,
    method: 'POST',
    schema: editorQueueItemDetailSchema,
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

/** Individual RAG-referral requests that need a BTV response. */
export function listPatientEditorialQuestions(
  status?: PatientEditorialQuestionStatus,
): Promise<PatientEditorialQuestionList> {
  const query = status === undefined ? '' : `?status=${encodeURIComponent(status)}`
  return request({
    path: `/editor/patient-questions${query}`,
    method: 'GET',
    schema: patientEditorialQuestionListSchema,
  })
}

export async function answerPatientEditorialQuestion(
  requestId: string,
  payload: AnswerPatientEditorialQuestionRequest,
): Promise<PatientEditorialQuestion> {
  assertValidRequestBody(
    answerPatientEditorialQuestionRequestSchema,
    payload,
    `POST /editor/patient-questions/${requestId}/answer`,
  )
  return request({
    path: `/editor/patient-questions/${encodeURIComponent(requestId)}/answer`,
    method: 'POST',
    schema: patientEditorialQuestionSchema,
    body: payload,
  })
}

/**
 * Mục 8 — Upload PDF tài liệu y khoa.
 * Do UploadFile dùng FormData nên chúng ta gửi qua một hàm fetch riêng, không dùng request()
 * vì request() đang mặc định content-type là application/json.
 */
export async function uploadDocument(formData: FormData): Promise<EditorQueueItemDetail> {
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

  try {
    return editorQueueItemDetailSchema.parse(await response.json())
  } catch (cause) {
    throw new ApiError({
      kind: 'validation',
      userMessage: 'Máy chủ đã nhận tài liệu nhưng trả về dữ liệu không đúng định dạng. Vui lòng tải lại hàng đợi.',
      logMessage: 'Response sai schema: POST /editor/queue/upload',
      cause,
    })
  }
}

// ---------------------------------------------------------------------------
// Gamification & Learning (Bệnh nhân)
// ---------------------------------------------------------------------------

/** Danh mục bệnh active có nguồn đã duyệt, dùng để khai hồ sơ. */
export function listAvailableConditions(): Promise<AvailableConditionList> {
  return request({
    path: '/conditions',
    method: 'GET',
    schema: availableConditionListSchema,
  })
}

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
