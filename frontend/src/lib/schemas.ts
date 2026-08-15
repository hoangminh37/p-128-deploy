/**
 * Zod schemas cho hợp đồng API luồng bệnh nhân.
 *
 * Nguồn sự thật duy nhất là file này: mọi kiểu TypeScript đều suy ra bằng
 * `z.infer`, không khai báo interface riêng ở nơi khác.
 *
 * Định nghĩa bám theo `docs/api-contract.md`. Số mục được ghi ở từng schema.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Enum dùng chung
// ---------------------------------------------------------------------------

/** Mục 4: tập giá trị của `primary_condition` và `comorbidities`. */
export const primaryConditionSchema = z.enum(['type2_diabetes', 'hypertension'])

/** Mục 6: năm trạng thái quyết định cách frontend render câu trả lời. */
export const chatStatusSchema = z.enum([
  'answered',
  'partial',
  'red_flag',
  'refused',
  'referral',
])

/** Mục 5: mức độ câu trả lời được nguồn chống lưng, `null` khi không chạy Self-RAG. */
export const supportLevelSchema = z.enum(['fully', 'partially', 'no_support'])

/**
 * Mục 4: người hỏi là chính bệnh nhân (`self`) hay người chăm sóc (`caregiver`).
 *
 * Hợp đồng nói rõ trường này CHỈ đổi cách xưng hô trong câu trả lời, không đổi
 * nội dung y khoa. Nghĩa là frontend cũng không được dùng nó để ẩn bớt hay đổi
 * bất kỳ cảnh báo nào — người chăm sóc cần biết đúng những điều mà người bệnh
 * cần biết.
 */
export const askingAsSchema = z.enum(['self', 'caregiver'])

// ---------------------------------------------------------------------------
// Mục 4: Hồ sơ bệnh nhân
// ---------------------------------------------------------------------------

/**
 * Mục 4 — hồ sơ bệnh nhân, dùng cho cả POST /patients/profile và
 * GET /patients/{patient_id}/profile.
 *
 * `diagnosed_at` theo định dạng `YYYY-MM`. Hợp đồng cấm gửi tên, số điện thoại,
 * số căn cước nên schema không có chỗ cho các trường đó.
 */
export const patientProfileSchema = z.object({
  patient_id: z.string(),
  age: z.number().int().min(18).max(120),
  primary_condition: primaryConditionSchema,
  comorbidities: z.array(primaryConditionSchema).default([]),
  diagnosed_at: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'diagnosed_at phải theo định dạng YYYY-MM.')
    .nullish(),
  // Không bắt buộc, mặc định `self` — cùng lối với `comorbidities` ở trên: hồ sơ
  // cũ lưu trước khi có trường này vẫn parse được, và ra đúng giá trị mà hợp
  // đồng quy định là mặc định.
  asking_as: askingAsSchema.default('self'),
})

/**
 * Mục 4 — hồ sơ trả về từ response 200 của POST /patients/profile và
 * GET /patients/{patient_id}/profile: đúng object vừa lưu, thêm `updated_at`.
 */
export const patientProfileResponseSchema = patientProfileSchema.extend({
  updated_at: z.iso.datetime({ offset: true }),
})

// ---------------------------------------------------------------------------
// Mục 5: Hỏi đáp
// ---------------------------------------------------------------------------

/**
 * Mục 5 — một nguồn trích dẫn.
 *
 * `snippet` là đoạn trích từ tài liệu y khoa đã duyệt trong thư viện, không bao
 * giờ chứa nội dung từ hồ sơ bệnh nhân.
 */
export const citationSchema = z.object({
  id: z.number().int().min(1),
  title: z.string(),
  issuer: z.string(),
  doc_code: z.string().nullable(),
  url: z.string().nullable(),
  snippet: z.string().max(300),
})

/** Mục 5 — payload gửi lên POST /chat. `conversation_id` bằng `null` là mở phiên mới. */
export const chatRequestSchema = z.object({
  query: z.string().min(1).max(5000),
  patient_id: z.string(),
  conversation_id: z.string().nullable(),
})

/**
 * Mục 5 — phần cấu trúc của response POST /chat, chưa gắn ràng buộc trích dẫn.
 * Tách riêng để hai `.refine()` bên dưới dùng lại được kiểu đã suy ra.
 */
const chatResponseShapeSchema = z.object({
  conversation_id: z.string(),
  message_id: z.string(),
  status: chatStatusSchema,
  answer: z.string(),
  citations: z.array(citationSchema),
  support_level: supportLevelSchema.nullable(),
  disclaimer: z.string(),
  metadata: z.object({
    latency_ms: z.number().int(),
    cached: z.boolean(),
  }),
})

type ChatResponseShape = z.infer<typeof chatResponseShapeSchema>

/** Marker trích dẫn trong `answer`, dạng `[1]`, `[2]`... */
const CITATION_MARKER = /\[(\d+)\]/g

/** Lấy các số n xuất hiện dưới dạng marker `[n]` trong `answer`, đã khử trùng lặp. */
function markerIds(answer: string): Set<number> {
  const ids = new Set<number>()
  for (const match of answer.matchAll(CITATION_MARKER)) {
    ids.add(Number(match[1]))
  }
  return ids
}

/** Số nào được nhắc trong `answer` mà `citations` không có id tương ứng. */
function markersWithoutCitation(value: ChatResponseShape): number[] {
  const citationIds = new Set(value.citations.map((c) => c.id))
  return [...markerIds(value.answer)]
    .filter((n) => !citationIds.has(n))
    .sort((a, b) => a - b)
}

/** Mục 5 và mục 6: ba trạng thái này không bao giờ kèm trích dẫn. */
const STATUSES_WITHOUT_CITATIONS: ReadonlySet<ChatResponseShape['status']> = new Set([
  'red_flag',
  'refused',
  'referral',
] as const)

/** Id nào có trong `citations` mà không hề xuất hiện dưới dạng marker trong `answer`. */
function citationsWithoutMarker(value: ChatResponseShape): number[] {
  const markers = markerIds(value.answer)
  return [...new Set(value.citations.map((c) => c.id))]
    .filter((id) => !markers.has(id))
    .sort((a, b) => a - b)
}

/**
 * Mục 5 — response của POST /chat.
 *
 * Ràng buộc trích dẫn hai chiều theo quy tắc ở cuối mục 5: mọi marker `[n]`
 * trong `answer` phải có citation id bằng n, và mọi citation id phải xuất hiện
 * ít nhất một lần dưới dạng marker trong `answer`.
 *
 * Thêm ràng buộc của mục 5 và mục 6: `red_flag`, `refused`, `referral` phải đi
 * kèm `citations` rỗng.
 */
export const chatResponseSchema = chatResponseShapeSchema
  .refine((value) => markersWithoutCitation(value).length === 0, {
    error: (issue) => {
      const missing = markersWithoutCitation(issue.input as ChatResponseShape)
      return `Thiếu nguồn trích dẫn: answer có marker [${missing.join('], [')}] nhưng citations không có phần tử nào mang id ${missing.join(', ')}.`
    },
    path: ['citations'],
  })
  .refine((value) => citationsWithoutMarker(value).length === 0, {
    error: (issue) => {
      const missing = citationsWithoutMarker(issue.input as ChatResponseShape)
      return `Thiếu marker trong answer: citations có id ${missing.join(', ')} nhưng answer không hề xuất hiện marker [${missing.join('], [')}].`
    },
    path: ['answer'],
  })
  .refine(
    (value) =>
      !STATUSES_WITHOUT_CITATIONS.has(value.status) || value.citations.length === 0,
    {
      error: (issue) => {
        const value = issue.input as ChatResponseShape
        return `Trạng thái ${value.status} bắt buộc citations phải là mảng rỗng, nhưng đang có ${value.citations.length} trích dẫn.`
      },
      path: ['citations'],
    },
  )

// ---------------------------------------------------------------------------
// Mục 7: Lịch sử hội thoại
// ---------------------------------------------------------------------------

/**
 * Mục 7 — một dòng trong danh sách phiên hội thoại của
 * GET /conversations/{patient_id}. `title` do backend cắt tối đa 60 ký tự.
 */
export const conversationSummarySchema = z.object({
  conversation_id: z.string(),
  title: z.string().max(60),
  last_message_at: z.iso.datetime({ offset: true }),
  message_count: z.number().int(),
})

/** Mục 7 — response của GET /conversations/{patient_id}, bọc danh sách phiên. */
export const conversationListSchema = z.object({
  conversations: z.array(conversationSummarySchema),
})

/** Mục 7 — message của người dùng trong một phiên. */
export const userMessageSchema = z.object({
  role: z.literal('user'),
  content: z.string(),
  created_at: z.iso.datetime({ offset: true }),
})

/**
 * Mục 7 — message của assistant trong một phiên. Dùng lại đúng các trường của
 * POST /chat, riêng `answer` được đổi tên thành `content` cho thống nhất với
 * message của user.
 */
export const assistantMessageSchema = z.object({
  role: z.literal('assistant'),
  message_id: z.string(),
  status: chatStatusSchema,
  content: z.string(),
  citations: z.array(citationSchema),
  support_level: supportLevelSchema.nullable(),
  created_at: z.iso.datetime({ offset: true }),
})

/** Mục 7 — một message bất kỳ trong lịch sử, phân biệt bằng `role`. */
export const conversationMessageSchema = z.discriminatedUnion('role', [
  userMessageSchema,
  assistantMessageSchema,
])

/** Mục 7 — chi tiết một phiên từ GET /conversations/{patient_id}/{conversation_id}. */
export const conversationDetailSchema = z.object({
  conversation_id: z.string(),
  messages: z.array(conversationMessageSchema),
})

// ---------------------------------------------------------------------------
// Kiểu suy ra — component dùng những tên này, không cần biết tới Zod
// ---------------------------------------------------------------------------

export type PrimaryCondition = z.infer<typeof primaryConditionSchema>
export type ChatStatus = z.infer<typeof chatStatusSchema>
export type SupportLevel = z.infer<typeof supportLevelSchema>
export type AskingAs = z.infer<typeof askingAsSchema>

export type PatientProfile = z.infer<typeof patientProfileSchema>
export type PatientProfileResponse = z.infer<typeof patientProfileResponseSchema>
export type Citation = z.infer<typeof citationSchema>
export type ChatRequest = z.infer<typeof chatRequestSchema>
export type ChatResponse = z.infer<typeof chatResponseSchema>

export type ConversationSummary = z.infer<typeof conversationSummarySchema>
export type ConversationList = z.infer<typeof conversationListSchema>
export type UserMessage = z.infer<typeof userMessageSchema>
export type AssistantMessage = z.infer<typeof assistantMessageSchema>
export type ConversationMessage = z.infer<typeof conversationMessageSchema>
export type ConversationDetail = z.infer<typeof conversationDetailSchema>
