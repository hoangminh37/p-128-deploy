/**
 * Handler MSW cho cả năm endpoint ở mục 2 của `docs/api-contract.md`.
 *
 * Mục đích là để dựng và test giao diện khi backend chưa có. Handler chỉ trả
 * fixture, không mô phỏng logic agent.
 */
import { delay, http, HttpResponse } from 'msw'
import { z } from 'zod'

import { patientProfileSchema, type ChatStatus } from '../lib/schemas'
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
  /** Mục 4 — gửi câu hỏi. */
  http.post(url('/chat'), async ({ request }) => {
    await delay(CHAT_DELAY_MS)

    const body = await request.json().catch(() => null)
    const query =
      body && typeof body === 'object' && 'query' in body && typeof body.query === 'string'
        ? body.query
        : ''

    return HttpResponse.json(pickFixture(query).response)
  }),

  /** Mục 3 — tạo hoặc cập nhật hồ sơ. Trả lại đúng object vừa lưu, thêm `updated_at`. */
  http.post(url('/patients/profile'), async ({ request }) => {
    await delay(QUICK_DELAY_MS)

    const parsed = patientProfileSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      // Bắt chước lỗi 422 của Pydantic, xem bảng mã lỗi ở mục 1.
      return HttpResponse.json({ detail: z.prettifyError(parsed.error) }, { status: 422 })
    }

    return HttpResponse.json({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
  }),

  /** Mục 3 — đọc hồ sơ. Mock luôn coi như hồ sơ đã tồn tại. */
  http.get(url('/patients/:patientId/profile'), async ({ params }) => {
    await delay(QUICK_DELAY_MS)

    return HttpResponse.json({
      ...patientProfileFixture,
      patient_id: String(params.patientId),
    })
  }),

  /** Mục 6 — danh sách phiên hội thoại. */
  http.get(url('/conversations/:patientId'), async () => {
    await delay(QUICK_DELAY_MS)

    return HttpResponse.json(conversationListFixture)
  }),

  /** Mục 6 — chi tiết một phiên. Id lạ thì trả 404 để test được nhánh lỗi. */
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
