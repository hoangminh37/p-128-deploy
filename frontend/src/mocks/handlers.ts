/**
 * Handler MSW cho cả năm endpoint ở mục 2 của `docs/api-contract.md`.
 *
 * Mục đích là để dựng và test giao diện khi backend chưa có. Handler chỉ trả
 * fixture, không mô phỏng logic agent.
 */
import { delay, http, HttpResponse } from 'msw'
import { z } from 'zod'

import {
  patientProfileSchema,
  type ChatStatus,
  type PatientProfileResponse,
} from '../lib/schemas'
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
