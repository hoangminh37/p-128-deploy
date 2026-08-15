/**
 * Handler MSW cho cả năm endpoint ở mục 2 của `docs/api-contract.md`.
 *
 * Mục đích là để dựng và test giao diện khi backend chưa có. Handler chỉ trả
 * fixture, không mô phỏng logic agent.
 */
import { delay, http, HttpResponse } from 'msw'
import { z } from 'zod'

import {
  loginRequestSchema,
  patientProfileSchema,
  type ChatStatus,
  type PatientProfileResponse,
  type UserInfo,
} from '../lib/schemas'
import { DEMO_ACCOUNTS } from './demoAccounts'
import {
  chatFixtures,
  conversationDetailFixture,
  conversationListFixture,
  patientProfileFixture,
} from './fixtures'

// ---------------------------------------------------------------------------
// Cấu hình
// ---------------------------------------------------------------------------

/** Khớp cách `lib/api.ts` dựng URL, để mock ăn cả khi đặt `VITE_API_URL`. */
const BASE_URL: string = import.meta.env.VITE_API_URL ?? ''
const url = (path: string) => `${BASE_URL}/api/v1${path}`

/** Trả lời của LLM thật mất vài giây, giả lập để thấy được trạng thái đang chờ. */
const CHAT_DELAY_MS = 1500

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

/** Không khớp từ khóa nào thì trả kịch bản `answered`. */
function pickFixture(query: string) {
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

  /** Mục 5 — gửi câu hỏi. */
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
]
