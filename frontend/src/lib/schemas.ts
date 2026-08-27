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
 * Một thuật ngữ y khoa được phát hiện động trong câu trả lời.
 *
 * `start_offset` / `end_offset` dùng UTF-16 offsets trong `answer` string gốc,
 * đúng đơn vị mà JavaScript `String.slice` sử dụng để tô đúng vị trí cả khi có emoji.
 */
export const termAnnotationSchema = z.object({
  term: z.string(),
  start_offset: z.number().int().nonnegative(),
  end_offset: z.number().int().nonnegative(),
  short_explanation: z.string(),
  source_chunk_id: z.string(),
  source_document_id: z.string().nullable(),
})

export type TermAnnotation = z.infer<typeof termAnnotationSchema>

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
// Mục 3: Xác thực
// ---------------------------------------------------------------------------

/**
 * Mục 3: vai trò của tài khoản.
 *
 * BACKEND quyết định giá trị này từ tài khoản trong cơ sở dữ liệu. Frontend chỉ
 * đọc, không có chỗ nào cho người dùng tự chọn hay tự đổi. Đây là lý do màn
 * chọn vai trò cũ đã bị bỏ hẳn: hỏi "bạn là ai" rồi tin luôn câu trả lời thì
 * bất kỳ ai cũng tự nhận là biên tập viên y khoa được.
 */
export const userRoleSchema = z.enum(['patient', 'editor'])

/** Mục 3 — payload gửi lên POST /auth/login. */
export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

/**
 * Mục 3 — thông tin tài khoản trả kèm khi đăng nhập.
 *
 * Hai `refine` dưới đây canh đúng một câu trong hợp đồng: `patient_id` chỉ có
 * giá trị khi `role` là `patient`. Lệch một trong hai chiều đều là lỗi nặng —
 * một biên tập viên mang theo `patient_id` sẽ đọc được hồ sơ của người khác,
 * còn một bệnh nhân không có `patient_id` thì mọi câu hỏi đều mất ngữ cảnh bệnh
 * lý. Thà chặn ngay ở tầng parse còn hơn để nó chảy vào ứng dụng.
 */
export const userInfoSchema = z
  .object({
    user_id: z.string(),
    email: z.string(),
    role: userRoleSchema,
    patient_id: z.string().nullable(),
  })
  .refine((value) => value.role !== 'editor' || value.patient_id === null, {
    error: 'Tài khoản vai trò editor không được kèm patient_id.',
    path: ['patient_id'],
  })
  .refine((value) => value.role !== 'patient' || value.patient_id !== null, {
    error: 'Tài khoản vai trò patient bắt buộc phải có patient_id.',
    path: ['patient_id'],
  })

/** Mục 3 — response 200 của POST /auth/login. */
export const loginResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal('bearer'),
  user: userInfoSchema,
})

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
  // Hai trường thể trạng, cả hai đều không bắt buộc.
  //
  // Hợp đồng mục 4 nói rõ chúng CHỈ dùng để trợ lý chọn đúng tài liệu phù hợp
  // thể trạng. Không được dẫn tới chỉ tiêu cân nặng, mục tiêu giảm cân hay số
  // calo cụ thể — đó là tư vấn dinh dưỡng cá nhân hoá, nằm ngoài phạm vi giáo
  // dục của sản phẩm. Vì vậy frontend cũng không tính BMI hay bất kỳ chỉ số dẫn
  // xuất nào từ hai số này, chỉ gửi nguyên giá trị người dùng khai.
  //
  height_cm: z.number().int().min(100).max(250).nullish(),
  // Hợp đồng khuyến nghị nhập tới một chữ số thập phân nhưng KHÔNG ràng buộc
  // điều đó, nên ở đây cũng không có `multipleOf` — 70.35 vẫn hợp lệ.
  weight_kg: z.number().min(25).max(300).nullish(),
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
  // Có ở citation mới. Để optional cho lịch sử chat đã lưu trước khi bổ sung
  // màn xem tài liệu; các citation đó vẫn mở được URL gốc nếu có.
  document_id: z.string().nullable().optional(),
  chunk_id: z.string().nullable().optional(),
})

/** Một đoạn đã được biên tập và nạp vào kho RAG của tài liệu nguồn. */
export const sourceTableCellSchema = z.object({
  text: z.string(),
  row: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
  row_span: z.number().int().min(1),
  column_span: z.number().int().min(1),
  is_column_header: z.boolean(),
  is_row_header: z.boolean(),
})

/** Lưới bảng nguyên bản từ parser; không suy đoán cột từ nội dung câu chữ. */
export const sourceTableSchema = z.object({
  rows: z.number().int().min(1),
  columns: z.number().int().min(1),
  cells: z.array(sourceTableCellSchema),
})

export const sourceDocumentChunkSchema = z.object({
  chunk_id: z.string(),
  content: z.string(),
  section_path: z.string().nullable(),
  page_start: z.number().int().nullable(),
  page_end: z.number().int().nullable(),
  table: sourceTableSchema.nullable().optional(),
})

/** Tài liệu nguồn kèm đoạn chính xác mà agent đã trích dẫn. */
export const sourceDocumentSchema = z.object({
  document_id: z.string(),
  title: z.string(),
  issuer: z.string(),
  doc_code: z.string().nullable(),
  url: z.string().nullable(),
  published: z.string(),
  highlighted_chunk_id: z.string(),
  total_chunks: z.number().int().min(1),
  chunks: z.array(sourceDocumentChunkSchema),
})

/** Mục 5 — payload gửi lên POST /chat. `conversation_id` bằng `null` là mở phiên mới. */
export const chatRequestSchema = z.object({
  query: z.string().min(1).max(5000),
  patient_id: z.string(),
  conversation_id: z.string().nullable(),
})

/**
 * Độ dài tối thiểu của câu hỏi — LUẬT CỦA RIÊNG FRONTEND, KHÔNG PHẢI HỢP ĐỒNG.
 *
 * Hợp đồng mục 5 đang để `min_length: 1`, nghĩa là gõ đúng một ký tự rồi bấm
 * gửi cũng hợp lệ. Một ký tự thì agent không có gì để tra, nên frontend vẫn giữ
 * một cái sàn và chặn ngay tại máy khách, trước khi tốn request.
 *
 * SÀN TỪNG LÀ 10 VÀ ĐÓ LÀ MỘT LỖI: nó nuốt mất "hi", "chào", "bạn là ai" —
 * đúng những câu người dùng gõ đầu tiên khi chưa biết hỏi gì. Người dùng bấm
 * gửi và KHÔNG THẤY GÌ XẢY RA, tưởng hệ thống hỏng. Mà những câu đó backend xử
 * lý bằng template ở `out_of_domain_handler`, chặn bởi rule-based guardrail nên
 * KHÔNG tốn vòng LLM nào — lý do tiết kiệm token không còn đúng với chúng.
 *
 * `chatRequestSchema` ở trên CỐ Ý giữ nguyên `min(1)` để nó vẫn là bản sao trung
 * thực của hợp đồng — lệch chỗ đó là mất luôn tác dụng đối chiếu.
 */
export const MIN_QUERY_LENGTH = 2

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
  annotations: z.array(termAnnotationSchema).default([]),
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
// Mục 8: Quản trị nội dung
//
// Toàn bộ phần này chỉ dành cho vai trò `editor`. Gọi bằng vai trò khác thì
// backend trả 403 — xem `HTTP_USER_MESSAGES` ở `lib/api.ts`.
// ---------------------------------------------------------------------------

/** Mục 8: vòng đời của một mục trong hàng đợi duyệt. */
export const editorItemStatusSchema = z.enum([
  'draft',
  'pending',
  'approved',
  'rejected',
])

/**
 * Mục 8: mục này từ đâu ra.
 *
 * `question_log` là sinh từ một câu hỏi mà bệnh nhân đã hỏi nhưng thư viện chưa
 * trả lời được; `editor_upload` là biên tập viên tự thêm tài liệu. Bản vẽ Gate 1
 * hiện nhãn này ngay dưới tiêu đề từng mục, nên nó phải có sẵn ở danh sách chứ
 * không phải thứ chỉ tra được khi mở chi tiết.
 */
export const editorItemOriginSchema = z.enum(['question_log', 'editor_upload'])

/** Mục 8 — response GET /editor/dashboard. */
export const editorDashboardSchema = z.object({
  pending_count: z.number().int().min(0),
  out_of_scope_count: z.number().int().min(0),
})

/** Mục 8 — một dòng trong GET /editor/queue. `title` do backend cắt tối đa 120 ký tự. */
export const editorQueueItemSchema = z.object({
  item_id: z.string(),
  title: z.string().max(120),
  origin: editorItemOriginSchema,
  topics: z.array(z.string()),
  created_at: z.iso.datetime({ offset: true }),
  status: editorItemStatusSchema,
})

/** Mục 8 — response GET /editor/queue, bọc danh sách mục. */
export const editorQueueListSchema = z.object({
  items: z.array(editorQueueItemSchema),
})

/**
 * Hai trạng thái bắt buộc phải gắn bệnh.
 *
 * Hợp đồng mục 8: `conditions` được rỗng ở `draft`, nhưng phải có ít nhất một
 * giá trị trước khi chuyển sang `pending`. `rejected` không bị ràng buộc — một
 * mục hoàn toàn có thể bị từ chối vì chính lý do chưa gắn được bệnh nào.
 */
const STATUSES_NEEDING_CONDITIONS: ReadonlySet<
  z.infer<typeof editorItemStatusSchema>
> = new Set(['pending', 'approved'] as const)

/**
 * Mục 8 — chi tiết một mục, dùng cho GET chi tiết và cho response của cả
 * `approve` lẫn `reject`.
 *
 * `source_url`, `issuer`, `doc_code` chính là ba trường `url`, `issuer`,
 * `doc_code` của `Citation` ở mục 5: duyệt xong thì nội dung này thành nguồn mà
 * bệnh nhân nhìn thấy ngay cạnh câu trả lời.
 *
 * Ràng buộc `conditions` không phải chuyện hình thức. Trợ lý chỉ tra tài liệu
 * theo bệnh trong hồ sơ bệnh nhân, nên một mục đã duyệt mà không gắn bệnh nào sẽ
 * nằm trong thư viện và KHÔNG BAO GIỜ được lấy ra — hỏng âm thầm, không ai biết.
 * Thà chặn ngay ở tầng parse.
 */
export const editorQueueItemDetailSchema = editorQueueItemSchema
  .extend({
    content: z.string(),
    source_url: z.string().nullable(),
    issuer: z.string().nullable(),
    doc_code: z.string().nullable(),
    conditions: z.array(primaryConditionSchema),
    review_note: z.string().nullable(),
    reject_reason: z.string().nullable(),
    reviewed_at: z.iso.datetime({ offset: true }).nullable(),
    reviewed_by: z.string().nullable(),
  })
  .refine(
    (value) =>
      !STATUSES_NEEDING_CONDITIONS.has(value.status) || value.conditions.length > 0,
    {
      error: (issue) => {
        const value = issue.input as { status: string }
        return `Mục ở trạng thái ${value.status} bắt buộc phải gắn ít nhất một bệnh, nhưng conditions đang rỗng.`
      },
      path: ['conditions'],
    },
  )

/** Mục 8 — body POST /editor/queue/{item_id}/approve. Cả hai trường đều tuỳ chọn. */
export const editorApproveRequestSchema = z.object({
  /** Nội dung đã chỉnh sửa. Bỏ trống thì giữ nguyên nội dung đang có. */
  content: z.string().nullish(),
  /** Ghi chú của người duyệt. */
  note: z.string().nullish(),
})

/**
 * Mục 8 — body POST /editor/queue/{item_id}/reject.
 *
 * Lý do là BẮT BUỘC: mục bị từ chối mà không ghi vì sao thì người sau lại soạn
 * đúng nội dung ấy lần nữa, và cả vòng duyệt lặp lại từ đầu.
 *
 * Kiểm bằng `refine` trên chuỗi đã `trim` chứ không dùng `.trim().min(1)`: thứ
 * tự áp dụng giữa transform và check tuỳ phiên bản Zod, mà ở đây sai một nhịp
 * là một chuỗi toàn dấu cách lọt qua được. Viết thẳng điều kiện thì không phải
 * đoán.
 */
export const editorRejectRequestSchema = z.object({
  reason: z.string().refine((value) => value.trim().length > 0, {
    error: 'Lý do từ chối không được để trống hoặc chỉ có khoảng trắng.',
  }),
})

/**
 * Mục 8 — body POST /editor/out-of-scope/{log_id}/draft.
 *
 * Hợp đồng ghi rõ endpoint này KHÔNG có body. Schema rỗng và `strict` để giữ
 * chỗ: nếu sau này hợp đồng thêm trường thì sửa ở đây, còn bây giờ nó chặn việc
 * vô tình gửi kèm dữ liệu thừa lên một endpoint không nhận gì.
 */
export const createDraftRequestSchema = z.strictObject({})

/**
 * Mục 8 — một dòng trong GET /editor/out-of-scope.
 *
 * KHÔNG có `patient_id`, và cố ý không có. Biên tập viên đọc log để biết thư
 * viện thiếu chủ đề gì, không phải để biết ai đang hỏi. `question` cũng đã được
 * backend làm sạch PII trước khi ghi.
 *
 * `refine` buộc `drafted` và `drafted_item_id` phải khớp nhau: lệch một chiều là
 * giao diện hiện nút "Thêm bài" cho mục đã có nháp, lệch chiều kia là có nháp mà
 * không có đường nào mở ra.
 */
export const outOfScopeLogSchema = z
  .object({
    log_id: z.string(),
    question: z.string(),
    ask_count: z.number().int().min(1),
    last_asked_at: z.iso.datetime({ offset: true }),
    drafted: z.boolean(),
    drafted_item_id: z.string().nullable(),
  })
  .refine((value) => value.drafted === (value.drafted_item_id !== null), {
    error:
      'drafted và drafted_item_id không khớp: đã tạo bài thì phải có item_id, chưa tạo thì phải là null.',
    path: ['drafted_item_id'],
  })

/** Mục 8 — response GET /editor/out-of-scope, bọc danh sách log. */
export const outOfScopeListSchema = z.object({
  logs: z.array(outOfScopeLogSchema),
})

// ---------------------------------------------------------------------------
// Kiểu suy ra — component dùng những tên này, không cần biết tới Zod
// ---------------------------------------------------------------------------

export type PrimaryCondition = z.infer<typeof primaryConditionSchema>
export type ChatStatus = z.infer<typeof chatStatusSchema>
export type SupportLevel = z.infer<typeof supportLevelSchema>
export type AskingAs = z.infer<typeof askingAsSchema>
export type UserRole = z.infer<typeof userRoleSchema>

export type LoginRequest = z.infer<typeof loginRequestSchema>
export type LoginResponse = z.infer<typeof loginResponseSchema>
export type UserInfo = z.infer<typeof userInfoSchema>

export type PatientProfile = z.infer<typeof patientProfileSchema>
export type PatientProfileResponse = z.infer<typeof patientProfileResponseSchema>
export type Citation = z.infer<typeof citationSchema>
export type SourceDocument = z.infer<typeof sourceDocumentSchema>
export type SourceDocumentChunk = z.infer<typeof sourceDocumentChunkSchema>
export type SourceTable = z.infer<typeof sourceTableSchema>
export type SourceTableCell = z.infer<typeof sourceTableCellSchema>
export type ChatRequest = z.infer<typeof chatRequestSchema>
export type ChatResponse = z.infer<typeof chatResponseSchema>

export type ConversationSummary = z.infer<typeof conversationSummarySchema>
export type ConversationList = z.infer<typeof conversationListSchema>
export type UserMessage = z.infer<typeof userMessageSchema>
export type AssistantMessage = z.infer<typeof assistantMessageSchema>
export type ConversationMessage = z.infer<typeof conversationMessageSchema>
export type ConversationDetail = z.infer<typeof conversationDetailSchema>

export type EditorItemStatus = z.infer<typeof editorItemStatusSchema>
export type EditorItemOrigin = z.infer<typeof editorItemOriginSchema>
export type EditorDashboard = z.infer<typeof editorDashboardSchema>
export type EditorQueueItem = z.infer<typeof editorQueueItemSchema>
export type EditorQueueList = z.infer<typeof editorQueueListSchema>
export type EditorQueueItemDetail = z.infer<typeof editorQueueItemDetailSchema>
export type EditorApproveRequest = z.infer<typeof editorApproveRequestSchema>
export type EditorRejectRequest = z.infer<typeof editorRejectRequestSchema>
export type CreateDraftRequest = z.infer<typeof createDraftRequestSchema>
export type OutOfScopeLog = z.infer<typeof outOfScopeLogSchema>
export type OutOfScopeList = z.infer<typeof outOfScopeListSchema>

// ---------------------------------------------------------------------------
// Gamification & Learning
// ---------------------------------------------------------------------------

export const quizDataSchema = z.object({
  question: z.string(),
  options: z.array(z.string()),
  correct_index: z.number().int(),
  /** Bài sinh trước 24/08/2026 chưa có trường này — backend tự vá khi chấm. */
  explanation: z.string().nullable().optional(),
})

export const microArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  full_content: z.string().nullable().optional(),
  category: z.string(),
  quiz_data: quizDataSchema.nullable().optional(),
  origin_source: z.string().nullable().optional(),
})

export const gamificationStatsSchema = z.object({
  total_score: z.number().int(),
  current_streak: z.number().int(),
  completed_articles: z.array(z.string()),
})

/** Kết quả chấm câu hỏi bài học hằng ngày. Trả 200 cho cả đúng lẫn sai. */
export const completeLessonResponseSchema = z.object({
  is_correct: z.boolean(),
  correct_index: z.number().int(),
  explanation: z.string(),
  hp_earned: z.number().int(),
  stats: gamificationStatsSchema,
})

export const dailyLessonResponseSchema = z.object({
  lesson: microArticleSchema.nullable(),
  day_number: z.number().int(),
  stats: gamificationStatsSchema,
})

export const learningPathItemSchema = z.object({
  day_number: z.number().int(),
  disease_category: z.string(),
  article: microArticleSchema,
})

export const learningLibraryResponseSchema = z.object({
  learning_paths: z.array(learningPathItemSchema),
  completed_articles: z.array(z.string()),
})

export const completeLessonRequestSchema = z.object({
  answer_index: z.number().int(),
})

export type QuizData = z.infer<typeof quizDataSchema>
export type MicroArticle = z.infer<typeof microArticleSchema>
export type GamificationStats = z.infer<typeof gamificationStatsSchema>
export type DailyLessonResponse = z.infer<typeof dailyLessonResponseSchema>
export type LearningPathItem = z.infer<typeof learningPathItemSchema>
export type LearningLibraryResponse = z.infer<typeof learningLibraryResponseSchema>
export type CompleteLessonRequest = z.infer<typeof completeLessonRequestSchema>
export type CompleteLessonResponse = z.infer<typeof completeLessonResponseSchema>

// ---------------------------------------------------------------------------
// Mục 13: Trắc nghiệm kiến thức (Mini-Quiz Generation)
// ---------------------------------------------------------------------------

/** Ba nguồn ngữ cảnh mà backend dựa vào để ra đề. */
export const quizSourceSchema = z.enum(['article', 'conversation', 'profile', 'mistakes'])

export const quizDifficultySchema = z.enum(['easy', 'medium', 'hard'])

/**
 * Một câu trong đề CHƯA nộp.
 *
 * Cố ý KHÔNG có `correct_index`: backend giữ đáp án lại và chấm ở server, nên
 * schema này phải phản ánh đúng điều đó. Thêm trường đó vào đây, dù chỉ là
 * optional, là mở đường cho một bản backend tương lai lỡ tay trả đáp án về mà
 * không ai phát hiện.
 */
export const quizQuestionSchema = z.object({
  index: z.number().int(),
  question: z.string(),
  options: z.array(z.string()).length(4),
  difficulty: quizDifficultySchema,
})

export const quizMetadataSchema = z.object({
  latency_ms: z.number().int(),
  cached: z.boolean(),
  /** `false` khi đề chỉ dựa vào hồ sơ vì kho tài liệu không trả về trích đoạn nào. */
  grounded: z.boolean(),
})

export const quizResponseSchema = z.object({
  quiz_id: z.string(),
  source: quizSourceSchema,
  topic: z.string(),
  questions: z.array(quizQuestionSchema),
  disclaimer: z.string(),
  citations: z.array(citationSchema),
  metadata: quizMetadataSchema,
})

export const quizRequestSchema = z.object({
  source: quizSourceSchema,
  article_id: z.string().optional(),
  conversation_id: z.string().optional(),
  num_questions: z.number().int().min(2).max(10).optional(),
})

/** Kết quả một câu, chỉ có sau khi nộp bài. Đây mới là chỗ `correct_index` xuất hiện. */
export const quizResultSchema = z.object({
  index: z.number().int(),
  question: z.string(),
  options: z.array(z.string()),
  your_answer: z.number().int(),
  correct_index: z.number().int(),
  is_correct: z.boolean(),
  explanation: z.string(),
})

export const quizSubmitRequestSchema = z.object({
  answers: z.array(z.number().int()),
})

export const quizSubmitResponseSchema = z.object({
  quiz_id: z.string(),
  score: z.number().int(),
  total: z.number().int(),
  passed: z.boolean(),
  results: z.array(quizResultSchema),
  hp_earned: z.number().int(),
  stats: gamificationStatsSchema,
})

export const quizHistoryItemSchema = z.object({
  quiz_id: z.string(),
  source: quizSourceSchema,
  topic: z.string(),
  score: z.number().int().nullable(),
  total: z.number().int(),
  created_at: z.string(),
  submitted_at: z.string().nullable(),
})

export const quizHistoryResponseSchema = z.object({
  items: z.array(quizHistoryItemSchema),
})

export type QuizSource = z.infer<typeof quizSourceSchema>
export type QuizDifficulty = z.infer<typeof quizDifficultySchema>
export type QuizQuestion = z.infer<typeof quizQuestionSchema>
export type QuizResponse = z.infer<typeof quizResponseSchema>
export type QuizRequest = z.infer<typeof quizRequestSchema>
export type QuizResult = z.infer<typeof quizResultSchema>
export type QuizSubmitRequest = z.infer<typeof quizSubmitRequestSchema>
export type QuizSubmitResponse = z.infer<typeof quizSubmitResponseSchema>
export type QuizHistoryItem = z.infer<typeof quizHistoryItemSchema>
export type QuizHistoryResponse = z.infer<typeof quizHistoryResponseSchema>

/**
 * Một chỗ người học chưa nắm.
 *
 * Khác `quizQuestionSchema`, schema này CÓ `correct_index` và `explanation` —
 * và điều đó là đúng. Người học đã nộp bài rồi; mục đích của màn ôn lại chính
 * là cho họ thấy đáp án đúng cùng lý do.
 */
export const quizMistakeSchema = z.object({
  question: z.string(),
  options: z.array(z.string()),
  correct_index: z.number().int(),
  explanation: z.string(),
  /** Các đáp án đã chọn, mới nhất trước. */
  chosen: z.array(z.number().int()),
  times_wrong: z.number().int(),
  topic: z.string(),
  quiz_id: z.string(),
})

export const quizMistakesResponseSchema = z.object({
  items: z.array(quizMistakeSchema),
  total_wrong: z.number().int(),
  sessions_scanned: z.number().int(),
})

export type QuizMistake = z.infer<typeof quizMistakeSchema>
export type QuizMistakesResponse = z.infer<typeof quizMistakesResponseSchema>

// ---------------------------------------------------------------------------
// Term Annotations (SSE event: annotations)
// ---------------------------------------------------------------------------

/** Payload của SSE event `annotations`. */
export const annotationsEventSchema = z.object({
  message_id: z.string(),
  annotations: z.array(termAnnotationSchema),
})

export type AnnotationsEvent = z.infer<typeof annotationsEventSchema>
