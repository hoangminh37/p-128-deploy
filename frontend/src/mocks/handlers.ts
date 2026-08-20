/**
 * Handler MSW cho cả năm endpoint ở mục 2 của `docs/api-contract.md`.
 *
 * Mục đích là để dựng và test giao diện khi backend chưa có. Handler chỉ trả
 * fixture, không mô phỏng logic agent.
 */
import { delay, http, HttpResponse } from 'msw'
import { z } from 'zod'

import {
  editorApproveRequestSchema,
  editorItemStatusSchema,
  editorRejectRequestSchema,
  loginRequestSchema,
  patientProfileSchema,
  type EditorItemStatus,
  type EditorQueueItemDetail,
  type OutOfScopeLog,
  type PatientProfileResponse,
  type UserInfo,
} from '../lib/schemas'
import { DEMO_ACCOUNTS } from './demoAccounts'
import {
  conversationDetailFixture,
  conversationListFixture,
  editorQueueFixture,
  outOfScopeFixture,
  patientProfileFixture,
  chatFixtures,
} from './fixtures'
import type { ChatStatus } from '../lib/schemas'

// ---------------------------------------------------------------------------
// Cấu hình
// ---------------------------------------------------------------------------

/** Khớp cách `lib/api.ts` dựng URL, để mock ăn cả khi đặt `VITE_API_URL`. */
const BASE_URL: string = import.meta.env.VITE_API_URL ?? ''
const url = (path: string) => `${BASE_URL}/api/v1${path}`

/**
 * Trả lời của LLM thật mất vài giây, giả lập để thấy được trạng thái đang chờ.
 *
 * `export` là cố ý dù chưa ai import: handler `/chat` bên dưới đang bị comment
 * để gọi backend thật, nên hằng số này tạm thời mồ côi. Không export thì cả
 * eslint lẫn `tsc -b` đều báo lỗi biến không dùng và CI đỏ. Xoá hẳn thì lúc cần
 * bật lại mock sẽ phải viết lại từ đầu.
 */
export const CHAT_DELAY_MS = 1500

/** Các endpoint còn lại chỉ đọc ghi dữ liệu, cho trễ ngắn thôi. */
const QUICK_DELAY_MS = 300

/**
 * Kho hồ sơ trong bộ nhớ, sống theo vòng đời của tab.
 *
 * Bản trước để GET luôn trả về fixture, tức mock KHÔNG BAO GIỜ nói được câu
 * "bệnh nhân này chưa khai hồ sơ". Mà đó lại đúng là trạng thái mà cả luồng
 * người dùng mới xoay quanh: đường dẫn gốc rẽ đi đâu, và màn hỏi đáp có hiện
 * dải nhắc chưa có hồ sơ hay không. Không dựng được trạng thái đó thì không thử
 * được luồng chính.
 *
 * Gieo sẵn đúng fixture để ai đang dùng `patient_id` mẫu vẫn thấy hồ sơ cũ.
 * `patient_id` sinh mới ở máy khách thì không có trong kho, nên GET trả 404 —
 * đúng như backend thật sẽ trả.
 */
const profiles = new Map<string, PatientProfileResponse>([
  [patientProfileFixture.patient_id, patientProfileFixture],
])

/**
 * Tài khoản của hai email mẫu.
 *
 * Mật khẩu nằm ở `demoAccounts.ts` để màn đăng nhập đọc được mà không kéo theo
 * cả MSW; phần định danh và vai trò thì ở đây, vì chỉ máy chủ giả mới cần biết.
 *
 * Bệnh nhân mẫu dùng đúng `patient_id` của hồ sơ đã gieo sẵn trong `profiles`,
 * nên đăng nhập xong là vào thẳng màn hỏi đáp với hồ sơ đầy đủ. Muốn xem lại
 * luồng khai hồ sơ lần đầu thì đổi giá trị này sang một id chưa có trong kho.
 */
const DEMO_USERS: Record<string, UserInfo> = {
  'benhnhan@demo.vn': {
    user_id: 'u_01HQZW',
    email: 'benhnhan@demo.vn',
    role: 'patient',
    patient_id: patientProfileFixture.patient_id,
  },
  'bientap@demo.vn': {
    user_id: 'u_01HQZV',
    email: 'bientap@demo.vn',
    role: 'editor',
    patient_id: null,
  },
}

/**
 * Hàng đợi duyệt và log ngoài phạm vi, giữ trong bộ nhớ theo vòng đời của tab.
 *
 * Phải có trạng thái thật chứ không trả fixture cố định: duyệt một mục xong mà
 * lần gọi danh sách sau vẫn thấy nó nằm ở `pending` thì không ai thử được luồng
 * duyệt, và cũng không phát hiện được lỗi ở chỗ frontend nạp lại danh sách.
 */
const editorQueue = new Map<string, EditorQueueItemDetail>(
  editorQueueFixture.map((item) => [item.item_id, item]),
)

const outOfScopeLogs = new Map<string, OutOfScopeLog>(
  outOfScopeFixture.map((log) => [log.log_id, log]),
)

/** Đếm lên cho `item_id` của bản nháp mới, để không đụng id đã gieo sẵn. */
let draftCounter = 0

/** `user_id` của biên tập viên mẫu, dùng điền vào `reviewed_by`. */
const EDITOR_USER_ID = 'u_01HQZV'

// ---------------------------------------------------------------------------
// Quyền truy cập khu vực biên tập
// ---------------------------------------------------------------------------

/**
 * Đọc tài khoản từ header `Authorization`.
 *
 * Token mẫu có dạng `mock.<user_id>.<timestamp>` do chính handler đăng nhập sinh
 * ra, nên chỉ cần tách đoạn giữa là biết ai đang gọi. Backend thật sẽ giải mã
 * JWT ở chỗ này.
 */
function readCaller(request: Request): UserInfo | null {
  const header = request.headers.get('Authorization')
  if (header === null || !header.startsWith('Bearer ')) return null

  const userId = header.slice('Bearer '.length).split('.')[1]
  if (userId === undefined) return null

  return Object.values(DEMO_USERS).find((user) => user.user_id === userId) ?? null
}

/**
 * Chặn mọi endpoint của mục 8 với tài khoản không phải `editor`.
 *
 * Trả về response lỗi nếu phải chặn, `null` nếu cho đi tiếp. Mock cũng phải kiểm
 * đúng như backend thật: nếu ở đây cho qua hết thì frontend sẽ được dựng trên
 * giả định là không bao giờ gặp 403, rồi vỡ đúng lúc gắn backend thật vào.
 */
function denyIfNotEditor(request: Request): HttpResponse<{ detail: string }> | null {
  const caller = readCaller(request)

  if (caller === null) {
    return HttpResponse.json(
      { detail: 'Chưa đăng nhập hoặc token không hợp lệ' },
      { status: 401 },
    )
  }
  if (caller.role !== 'editor') {
    return HttpResponse.json(
      { detail: 'Tài khoản này không có quyền truy cập khu vực biên tập' },
      { status: 403 },
    )
  }
  return null
}

/** Bỏ các trường chỉ có ở bản chi tiết, để danh sách trả đúng hình dạng hợp đồng. */
function toQueueRow(item: EditorQueueItemDetail) {
  return {
    item_id: item.item_id,
    title: item.title,
    origin: item.origin,
    topics: item.topics,
    created_at: item.created_at,
    status: item.status,
  }
}

/** Hai trạng thái đã chốt. Duyệt hay từ chối lần nữa đều trả 409. */
function isSettled(item: EditorQueueItemDetail): boolean {
  return item.status === 'approved' || item.status === 'rejected'
}

// ---------------------------------------------------------------------------
// Chọn kịch bản theo từ khóa trong câu hỏi
// ---------------------------------------------------------------------------

/**
 * Thứ tự có ý nghĩa: dấu hiệu cấp cứu phải được xét trước, vì một câu vừa hỏi
 * liều thuốc vừa kể triệu chứng nguy hiểm thì phải ra `red_flag`.
 */
const KEYWORD_RULES: ReadonlyArray<{
  status: ChatStatus
  keywords: readonly string[]
}> = [
  {
    status: 'red_flag',
    keywords: [
      'đau ngực', 'tức ngực', 'khó thở', 'méo miệng', 'yếu tay',
      'tê nửa người', 'nói khó', 'ngất', 'cấp cứu', 'mờ mắt đột ngột',
    ],
  },
  {
    status: 'refused',
    keywords: [
      'liều', 'mấy viên', 'tăng thuốc', 'giảm thuốc', 'đổi thuốc',
      'bỏ thuốc', 'kê đơn', 'đơn thuốc', 'uống thêm',
    ],
  },
  {
    status: 'referral',
    keywords: [
      'tế bào gốc', 'ghép tụy', 'thuốc nam', 'đông y', 'chữa khỏi hẳn',
      'khỏi hẳn', 'thực phẩm chức năng',
    ],
  },
  {
    status: 'partial',
    keywords: ['tập thể dục', 'tập luyện', 'vận động', 'đi bộ', 'thể thao'],
  },
]

/**
 * Không khớp từ khóa nào thì trả kịch bản `answered`.
 *
 * `export` cùng lý do với CHAT_DELAY_MS: hàm này chỉ được handler `/chat` dùng,
 * mà handler đó đang bị comment để gọi backend thật. Giữ lại vì bảng
 * KEYWORD_RULES ở trên là bản đối chiếu với mục 5 hợp đồng, chép lại không dễ.
 */
export function pickFixture(query: string) {
  const normalized = query.toLowerCase()
  const rule = KEYWORD_RULES.find((candidate) =>
    candidate.keywords.some((keyword) => normalized.includes(keyword)),
  )
  return chatFixtures[rule?.status ?? 'answered']
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handlers = [
  /**
   * Mục 3 — đăng nhập.
   *
   * Một thông báo 401 DUY NHẤT cho cả ba trường hợp: email không tồn tại, email
   * đúng nhưng mật khẩu sai, và payload đúng dạng nhưng không khớp tài khoản
   * nào. Phân biệt chúng cho phép người ngoài dò xem một địa chỉ có tài khoản
   * trong hệ thống hay không — mà đây là hệ thống y tế, riêng việc "người này có
   * bệnh mãn tính" đã là thông tin không được để lộ. Backend thật phải giữ đúng
   * nguyên tắc này, đây không phải chi tiết riêng của mock.
   */
  http.post(url('/auth/login'), async ({ request }) => {
    await delay(QUICK_DELAY_MS)

    const parsed = loginRequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return HttpResponse.json({ detail: z.prettifyError(parsed.error) }, { status: 422 })
    }

    const email = parsed.data.email.trim().toLowerCase()
    const account = DEMO_ACCOUNTS.find((candidate) => candidate.email === email)
    const user = DEMO_USERS[email]

    if (
      account === undefined ||
      user === undefined ||
      account.password !== parsed.data.password
    ) {
      return HttpResponse.json(
        { detail: 'Email hoặc mật khẩu không đúng' },
        { status: 401 },
      )
    }

    return HttpResponse.json({
      // Không phải JWT thật, chỉ là một chuỗi để lớp api có cái mà gắn vào
      // header. Khi backend bật JWT thì chỉ chỗ này đổi, frontend không đổi gì.
      access_token: `mock.${user.user_id}.${Date.now()}`,
      token_type: 'bearer',
      user,
    })
  }),

  /** Mục 3 — đăng xuất. Response 204, không có body. */
  http.post(url('/auth/logout'), async () => {
    await delay(QUICK_DELAY_MS)

    return new HttpResponse(null, { status: 204 })
  }),

  /**
   * Mục 5 — gửi câu hỏi.
   *
   * Handler này từng bị comment lại để gọi backend thật. Nay việc bật tắt mock
   * đã do `VITE_ENABLE_MSW` quyết định ở `main.tsx`, nên comment ở đây là một
   * công tắc THỨ HAI cho cùng một việc: ai đặt `VITE_ENABLE_MSW=true` để thử
   * năm kịch bản phản hồi sẽ thấy đúng endpoint quan trọng nhất lại không được
   * mock, mà không có gì nói cho họ biết vì sao.
   */
  http.post(url('/chat'), async ({ request }) => {
    await delay(CHAT_DELAY_MS)

    const body = await request.json().catch(() => null)
    const query =
      body && typeof body === 'object' && 'query' in body && typeof body.query === 'string'
        ? body.query
        : ''

    return HttpResponse.json(pickFixture(query).response)
  }),

  /** Mục 4 — tạo hoặc cập nhật hồ sơ. Trả lại đúng object vừa lưu, thêm `updated_at`. */
  http.post(url('/patients/profile'), async ({ request }) => {
    await delay(QUICK_DELAY_MS)

    const parsed = patientProfileSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      // Bắt chước lỗi 422 của Pydantic, xem bảng mã lỗi ở mục 1.
      return HttpResponse.json({ detail: z.prettifyError(parsed.error) }, { status: 422 })
    }

    const saved: PatientProfileResponse = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    }
    profiles.set(saved.patient_id, saved)

    return HttpResponse.json(saved)
  }),

  /** Mục 4 — đọc hồ sơ. Chưa khai thì trả 404, đúng như hợp đồng mục 4. */
  http.get(url('/patients/:patientId/profile'), async ({ params }) => {
    await delay(QUICK_DELAY_MS)

    const patientId = String(params.patientId)
    const saved = profiles.get(patientId)
    if (saved === undefined) {
      return HttpResponse.json(
        { detail: `Chưa có hồ sơ cho bệnh nhân ${patientId}` },
        { status: 404 },
      )
    }

    return HttpResponse.json(saved)
  }),

  /** Mục 7 — danh sách phiên hội thoại. */
  http.get(url('/conversations/:patientId'), async () => {
    await delay(QUICK_DELAY_MS)

    return HttpResponse.json(conversationListFixture)
  }),

  /** Mục 7 — chi tiết một phiên. Id lạ thì trả 404 để test được nhánh lỗi. */
  http.get(url('/conversations/:patientId/:conversationId'), async ({ params }) => {
    await delay(QUICK_DELAY_MS)

    const conversationId = String(params.conversationId)
    if (conversationId !== conversationDetailFixture.conversation_id) {
      return HttpResponse.json(
        { detail: `Không tìm thấy phiên hội thoại ${conversationId}` },
        { status: 404 },
      )
    }

    return HttpResponse.json(conversationDetailFixture)
  }),

  // -------------------------------------------------------------------------
  // Mục 8 — Quản trị nội dung. Mọi handler dưới đây kiểm quyền trước tiên.
  // -------------------------------------------------------------------------

  /** Mục 8 — hai con số ở màn tổng quan, tính từ kho hiện tại chứ không cứng. */
  http.get(url('/editor/dashboard'), async ({ request }) => {
    await delay(QUICK_DELAY_MS)
    const denied = denyIfNotEditor(request)
    if (denied !== null) return denied

    const pendingCount = [...editorQueue.values()].filter(
      (item) => item.status === 'pending',
    ).length
    const outOfScopeCount = [...outOfScopeLogs.values()].filter(
      (log) => !log.drafted,
    ).length

    return HttpResponse.json({
      pending_count: pendingCount,
      out_of_scope_count: outOfScopeCount,
    })
  }),

  /** Mục 8 — hàng đợi. `status` không truyền thì mặc định `pending`. */
  http.get(url('/editor/queue'), async ({ request }) => {
    await delay(QUICK_DELAY_MS)
    const denied = denyIfNotEditor(request)
    if (denied !== null) return denied

    const raw = new URL(request.url).searchParams.get('status')
    const parsed = editorItemStatusSchema.safeParse(raw ?? 'pending')
    if (!parsed.success) {
      return HttpResponse.json(
        { detail: `Giá trị status không hợp lệ: ${raw}` },
        { status: 422 },
      )
    }
    const status: EditorItemStatus = parsed.data

    const items = [...editorQueue.values()]
      .filter((item) => item.status === status)
      // Mới nhất lên đầu, đúng thứ tự hợp đồng quy định.
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .map(toQueueRow)

    return HttpResponse.json({ items })
  }),

  /** Mục 8 — chi tiết một mục. */
  http.get(url('/editor/queue/:itemId'), async ({ request, params }) => {
    await delay(QUICK_DELAY_MS)
    const denied = denyIfNotEditor(request)
    if (denied !== null) return denied

    const item = editorQueue.get(String(params.itemId))
    if (item === undefined) {
      return HttpResponse.json(
        { detail: `Không tìm thấy mục ${String(params.itemId)}` },
        { status: 404 },
      )
    }

    return HttpResponse.json(item)
  }),

  /** Mục 8 — duyệt. Mục đã chốt rồi thì trả 409, không ghi vào thư viện lần hai. */
  http.post(url('/editor/queue/:itemId/approve'), async ({ request, params }) => {
    await delay(QUICK_DELAY_MS)
    const denied = denyIfNotEditor(request)
    if (denied !== null) return denied

    const item = editorQueue.get(String(params.itemId))
    if (item === undefined) {
      return HttpResponse.json(
        { detail: `Không tìm thấy mục ${String(params.itemId)}` },
        { status: 404 },
      )
    }
    if (isSettled(item)) {
      return HttpResponse.json(
        { detail: `Mục ${item.item_id} đã ở trạng thái ${item.status}` },
        { status: 409 },
      )
    }

    const parsed = editorApproveRequestSchema.safeParse(
      await request.json().catch(() => ({})),
    )
    if (!parsed.success) {
      return HttpResponse.json({ detail: z.prettifyError(parsed.error) }, { status: 422 })
    }

    const approved: EditorQueueItemDetail = {
      ...item,
      status: 'approved',
      content: parsed.data.content ?? item.content,
      review_note: parsed.data.note ?? null,
      reject_reason: null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: EDITOR_USER_ID,
    }
    editorQueue.set(approved.item_id, approved)

    return HttpResponse.json(approved)
  }),

  /** Mục 8 — từ chối. `reason` bắt buộc, rỗng hoặc toàn khoảng trắng thì 422. */
  http.post(url('/editor/queue/:itemId/reject'), async ({ request, params }) => {
    await delay(QUICK_DELAY_MS)
    const denied = denyIfNotEditor(request)
    if (denied !== null) return denied

    const item = editorQueue.get(String(params.itemId))
    if (item === undefined) {
      return HttpResponse.json(
        { detail: `Không tìm thấy mục ${String(params.itemId)}` },
        { status: 404 },
      )
    }
    if (isSettled(item)) {
      return HttpResponse.json(
        { detail: `Mục ${item.item_id} đã ở trạng thái ${item.status}` },
        { status: 409 },
      )
    }

    const parsed = editorRejectRequestSchema.safeParse(
      await request.json().catch(() => null),
    )
    if (!parsed.success) {
      return HttpResponse.json({ detail: z.prettifyError(parsed.error) }, { status: 422 })
    }

    const rejected: EditorQueueItemDetail = {
      ...item,
      status: 'rejected',
      review_note: null,
      reject_reason: parsed.data.reason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: EDITOR_USER_ID,
    }
    editorQueue.set(rejected.item_id, rejected)

    return HttpResponse.json(rejected)
  }),

  /** Mục 8 — log ngoài phạm vi, xếp theo số lượt hỏi giảm dần. */
  http.get(url('/editor/out-of-scope'), async ({ request }) => {
    await delay(QUICK_DELAY_MS)
    const denied = denyIfNotEditor(request)
    if (denied !== null) return denied

    const logs = [...outOfScopeLogs.values()].sort(
      (a, b) => b.ask_count - a.ask_count,
    )

    return HttpResponse.json({ logs })
  }),

  /**
   * Mục 8 — tạo bản nháp từ một câu hỏi ngoài phạm vi.
   *
   * Log đã có nháp thì trả 200 kèm chính bản nháp đang có, KHÔNG tạo cái thứ
   * hai. Bấm nhầm hai lần là chuyện thường, mà hai bản nháp trùng nhau trong
   * hàng đợi thì người duyệt phải tự đoán nên xoá cái nào.
   */
  http.post(url('/editor/out-of-scope/:logId/draft'), async ({ request, params }) => {
    await delay(QUICK_DELAY_MS)
    const denied = denyIfNotEditor(request)
    if (denied !== null) return denied

    const logId = String(params.logId)
    const log = outOfScopeLogs.get(logId)
    if (log === undefined) {
      return HttpResponse.json(
        { detail: `Không tìm thấy câu hỏi ${logId}` },
        { status: 404 },
      )
    }

    if (log.drafted && log.drafted_item_id !== null) {
      const existing = editorQueue.get(log.drafted_item_id)
      if (existing !== undefined) return HttpResponse.json(existing)
    }

    draftCounter += 1
    const draft: EditorQueueItemDetail = {
      item_id: `e_draft_${draftCounter}`,
      // Hợp đồng: tiêu đề lấy từ câu hỏi, cắt còn tối đa 120 ký tự.
      title: log.question.slice(0, 120),
      origin: 'question_log',
      topics: [],
      created_at: new Date().toISOString(),
      status: 'draft',
      content: '',
      source_url: null,
      issuer: null,
      doc_code: null,
      conditions: [],
      review_note: null,
      reject_reason: null,
      reviewed_at: null,
      reviewed_by: null,
    }

    editorQueue.set(draft.item_id, draft)
    outOfScopeLogs.set(logId, {
      ...log,
      drafted: true,
      drafted_item_id: draft.item_id,
    })

    return HttpResponse.json(draft, { status: 201 })
  }),
]
