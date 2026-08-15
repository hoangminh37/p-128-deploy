/**
 * Dữ liệu mẫu cho lớp mock MSW.
 *
 * Chỉ dùng cho phát triển và test giao diện. Nội dung y khoa ở đây đã được viết
 * lại cho dễ hiểu, không phải nguyên văn văn bản gốc, và không được dùng làm
 * nguồn tham khảo lâm sàng.
 *
 * Phạm vi bệnh bám theo brief: chỉ đái tháo đường típ 2 và tăng huyết áp.
 * Giọng viết nhắm vào người 45 đến 70 tuổi, ít quen thuật ngữ y khoa: câu ngắn,
 * từ thông dụng, thuật ngữ nào dùng thì giải thích ngay.
 */
import { z } from 'zod'

import {
  chatResponseSchema,
  conversationDetailSchema,
  conversationListSchema,
  editorQueueItemDetailSchema,
  outOfScopeLogSchema,
  patientProfileResponseSchema,
  type ChatResponse,
  type ChatStatus,
  type Citation,
  type ConversationDetail,
  type ConversationList,
  type EditorQueueItemDetail,
  type OutOfScopeLog,
  type PatientProfileResponse,
} from '../lib/schemas'

// ---------------------------------------------------------------------------
// Nguồn trích dẫn dùng lại
// ---------------------------------------------------------------------------

/** Mục 5 — hai văn bản Bộ Y tế tương ứng hai bệnh trong phạm vi dự án. */
const HUONG_DAN_TANG_HUYET_AP = {
  title: 'Hướng dẫn chẩn đoán và điều trị tăng huyết áp',
  issuer: 'Bộ Y tế',
  doc_code: '3192/QĐ-BYT',
  url: 'https://kcb.vn/van-ban/huong-dan-chan-doan-va-dieu-tri-tang-huyet-ap',
} as const

const HUONG_DAN_DAI_THAO_DUONG = {
  title: 'Hướng dẫn chẩn đoán và điều trị đái tháo đường típ 2',
  issuer: 'Bộ Y tế',
  doc_code: '5481/QĐ-BYT',
  url: 'https://kcb.vn/van-ban/huong-dan-chan-doan-va-dieu-tri-dai-thao-duong-tip-2',
} as const

/** Câu chốt bắt buộc có ở mọi phản hồi, theo mục 5 của hợp đồng. */
const DISCLAIMER = 'Thông tin mang tính giáo dục, không thay thế tư vấn của bác sĩ.'

// ---------------------------------------------------------------------------
// Năm kịch bản của POST /chat
// ---------------------------------------------------------------------------

/** Một kịch bản gồm câu hỏi mẫu và phản hồi tương ứng, dùng lại được làm test case. */
export interface ChatFixture {
  /** Câu hỏi mẫu dẫn tới phản hồi này. */
  question: string
  /** Phản hồi đúng hợp đồng mục 5. */
  response: ChatResponse
}

const answered: ChatFixture = {
  question: 'Tôi vừa bị tăng huyết áp vừa bị tiểu đường thì nên ăn uống thế nào?',
  response: {
    conversation_id: 'c_mock_answered',
    message_id: 'm_mock_answered',
    status: 'answered',
    answer: [
      'Bạn cần chú ý hai việc: ăn nhạt và bớt đồ ngọt.',
      '',
      'Về muối: mỗi ngày chỉ nên dùng dưới 5 gam muối, tức khoảng một thìa cà phê gạt ngang. Số này tính cả muối, nước mắm, nước tương và hạt nêm. Bạn nên bớt mì gói, đồ hộp, dưa cà muối [1].',
      '',
      'Về chất bột đường: cơm, bún, phở, bánh mì đều làm đường huyết tăng. Bạn không cần bỏ hẳn, chỉ cần ăn vừa phải và chia đều ra các bữa trong ngày. Nên tránh nước ngọt, bánh kẹo và trái cây quá ngọt [2].',
      '',
      'Bữa nào cũng nên có rau xanh. Rau giúp no lâu và làm đường huyết lên chậm hơn [2].',
      '',
      'Về chất béo: nên ăn cá, thịt nạc, đậu phụ. Nên bớt mỡ, da và nội tạng động vật [1].',
    ].join('\n'),
    citations: [
      {
        id: 1,
        ...HUONG_DAN_TANG_HUYET_AP,
        snippet:
          'Chế độ ăn giảm muối: hạn chế lượng natri đưa vào cơ thể, dùng dưới 5 gam muối mỗi ngày. Hạn chế thực phẩm chế biến sẵn, đồ hộp, dưa cà muối. Tăng cường rau xanh và trái cây. Hạn chế mỡ động vật, phủ tạng.',
      },
      {
        id: 2,
        ...HUONG_DAN_DAI_THAO_DUONG,
        snippet:
          'Dinh dưỡng cho người bệnh đái tháo đường típ 2: phân bố đều lượng carbohydrate trong các bữa ăn trong ngày, tăng cường rau xanh và chất xơ, hạn chế đường hấp thu nhanh và đồ uống có đường.',
      },
    ],
    support_level: 'fully',
    disclaimer: DISCLAIMER,
    metadata: { latency_ms: 3120, cached: false },
  },
}

const partial: ChatFixture = {
  question: 'Tôi bị tiểu đường type 2, tôi nên tập thể dục thế nào cho đúng?',
  response: {
    conversation_id: 'c_mock_partial',
    message_id: 'm_mock_partial',
    status: 'partial',
    answer: [
      'Bạn nên vận động đều đặn, không cần tập nặng.',
      '',
      'Mỗi tuần nên vận động vừa sức ít nhất 150 phút, chia ra từ 3 ngày trở lên. Đi bộ nhanh là đủ. Không nên nghỉ quá 2 ngày liền [1].',
      '',
      'Riêng chuyện nên tập vào giờ nào trong ngày, và bài tập nào hợp với người đã có bệnh khớp hoặc bệnh tim, thì tài liệu đã duyệt chưa nói rõ. Phần này bạn nên hỏi bác sĩ điều trị của mình.',
      '',
      'Khi đang tập mà thấy chóng mặt, vã mồ hôi lạnh hoặc run tay, bạn hãy dừng lại ngay, ăn hoặc uống một chút đồ ngọt và báo cho người nhà biết.',
    ].join('\n'),
    citations: [
      {
        id: 1,
        ...HUONG_DAN_DAI_THAO_DUONG,
        snippet:
          'Hoạt động thể lực: khuyến cáo tập luyện cường độ trung bình ít nhất 150 phút mỗi tuần, chia ra ít nhất 3 ngày, không nghỉ quá 2 ngày liên tiếp.',
      },
    ],
    support_level: 'partially',
    disclaimer: DISCLAIMER,
    metadata: { latency_ms: 3480, cached: false },
  },
}

const redFlag: ChatFixture = {
  question: 'Tôi bị tăng huyết áp, sáng nay thấy đau tức ngực và khó thở, tôi nên uống thuốc gì?',
  response: {
    conversation_id: 'c_mock_red_flag',
    message_id: 'm_mock_red_flag',
    status: 'red_flag',
    answer: [
      'Những dấu hiệu bạn vừa kể có thể nguy hiểm. Bạn cần được khám ngay bây giờ.',
      '',
      'Bạn hãy gọi 115, hoặc nhờ người nhà đưa tới cơ sở y tế gần nhất. Bạn đừng tự lái xe.',
      '',
      'Trong lúc chờ, bạn hãy ngồi hoặc nằm nghỉ, nới lỏng quần áo và không đi lại.',
      '',
      'Tôi không thể khám cho bạn qua tin nhắn, nên tôi không nói được bạn đang bị gì và cũng không hướng dẫn bạn uống thuốc. Việc này phải do bác sĩ trực tiếp quyết định.',
    ].join('\n'),
    citations: [],
    support_level: null,
    disclaimer: DISCLAIMER,
    metadata: { latency_ms: 640, cached: false },
  },
}

const refused: ChatFixture = {
  question: 'Đường huyết sáng nay của tôi là 9.5, tôi tự tăng thuốc tiểu đường lên 2 viên một lần được không?',
  response: {
    conversation_id: 'c_mock_refused',
    message_id: 'm_mock_refused',
    status: 'refused',
    answer: [
      'Tôi không được phép hướng dẫn bạn tăng, giảm hay đổi liều thuốc.',
      '',
      'Liều thuốc phải do bác sĩ điều trị quyết định. Bác sĩ còn phải cân nhắc kết quả xét nghiệm, chức năng thận và những thuốc khác mà bạn đang uống. Tự tăng liều có thể làm đường huyết tụt quá thấp, rất nguy hiểm.',
      '',
      'Bạn hãy giữ đúng liều bác sĩ đã kê cho tới khi được khám lại.',
      '',
      'Bạn nên ghi lại chỉ số đường huyết vài ngày gần đây rồi mang theo khi đi khám. Nếu chỉ số cao kéo dài nhiều ngày, bạn nên đi khám sớm hơn lịch hẹn.',
    ].join('\n'),
    citations: [],
    support_level: null,
    disclaimer: DISCLAIMER,
    metadata: { latency_ms: 580, cached: false },
  },
}

const referral: ChatFixture = {
  question: 'Bệnh tiểu đường type 2 có chữa khỏi hẳn bằng ghép tế bào gốc không?',
  response: {
    conversation_id: 'c_mock_referral',
    message_id: 'm_mock_referral',
    status: 'referral',
    answer: [
      'Rất tiếc, tôi chưa trả lời được câu hỏi này của bạn.',
      '',
      'Tôi chỉ trả lời dựa trên các tài liệu của Bộ Y tế đã được đưa vào thư viện của hệ thống. Chủ đề bạn hỏi hiện chưa có trong thư viện đó, nên tôi không có căn cứ để trả lời.',
      '',
      'Đây là câu hỏi nên hỏi trực tiếp bác sĩ điều trị. Bạn có thể ghi câu hỏi ra giấy và mang theo trong lần tái khám tới.',
      '',
      'Câu hỏi của bạn đã được ghi nhận để bổ sung tài liệu cho thư viện.',
    ].join('\n'),
    citations: [],
    support_level: null,
    disclaimer: DISCLAIMER,
    metadata: { latency_ms: 2400, cached: false },
  },
}

/** Năm kịch bản, khóa theo `status` nên thiếu cái nào là lỗi biên dịch. */
export const chatFixtures: Record<ChatStatus, ChatFixture> = {
  answered,
  partial,
  red_flag: redFlag,
  refused,
  referral,
}

// ---------------------------------------------------------------------------
// Dữ liệu mẫu cho các endpoint còn lại
// ---------------------------------------------------------------------------

/** Mục 4 — hồ sơ mẫu: người 58 tuổi, tăng huyết áp kèm đái tháo đường típ 2. */
export const patientProfileFixture: PatientProfileResponse = {
  patient_id: 'p_01HQZX',
  age: 58,
  primary_condition: 'hypertension',
  comorbidities: ['type2_diabetes'],
  diagnosed_at: '2026-03',
  asking_as: 'self',
  updated_at: '2026-08-12T09:14:00+07:00',
}

/** Mục 7 — danh sách phiên hội thoại. */
export const conversationListFixture: ConversationList = {
  conversations: [
    {
      conversation_id: 'c_mock_answered',
      title: 'Chế độ ăn khi vừa tăng huyết áp vừa tiểu đường',
      last_message_at: '2026-08-12T09:14:00+07:00',
      message_count: 2,
    },
    {
      conversation_id: 'c_mock_partial',
      title: 'Tập thể dục cho người tiểu đường type 2',
      last_message_at: '2026-08-11T16:02:00+07:00',
      message_count: 2,
    },
  ],
}

/** Mục 7 — chi tiết một phiên, dựng lại từ kịch bản `answered`. */
export const conversationDetailFixture: ConversationDetail = {
  conversation_id: 'c_mock_answered',
  messages: [
    {
      role: 'user',
      content: answered.question,
      created_at: '2026-08-12T09:12:00+07:00',
    },
    {
      role: 'assistant',
      message_id: answered.response.message_id,
      status: answered.response.status,
      content: answered.response.answer,
      citations: answered.response.citations,
      support_level: answered.response.support_level,
      created_at: '2026-08-12T09:14:00+07:00',
    },
  ],
}

// ---------------------------------------------------------------------------
// Mục 8: Quản trị nội dung
// ---------------------------------------------------------------------------

/**
 * Hàng đợi duyệt, gieo sẵn để handler có cái mà biến đổi.
 *
 * Phủ đủ CẢ BỐN trạng thái và cả hai nguồn gốc, vì màn hàng đợi phải dựng và thử
 * được từng nhóm mà không cần bấm qua bấm lại để tự tạo dữ liệu.
 *
 * Nội dung nằm trong phạm vi dự án — đái tháo đường típ 2 và tăng huyết áp — và
 * viết lại cho dễ hiểu chứ không phải nguyên văn văn bản gốc. Không dùng làm
 * nguồn tham khảo lâm sàng.
 *
 * Riêng `e_01HR13` là bản nháp sinh từ log `o_01HR22` bên dưới: nội dung rỗng,
 * chưa gắn bệnh, đúng như cái vỏ mà `POST .../draft` tạo ra.
 */
export const editorQueueFixture: EditorQueueItemDetail[] = [
  {
    item_id: 'e_01HR10',
    title: 'Dinh dưỡng cho người đái tháo đường típ 2',
    origin: 'question_log',
    topics: ['Đái tháo đường', 'Dinh dưỡng'],
    created_at: '2026-08-13T08:30:00+07:00',
    status: 'pending',
    content: [
      'Cơm, bún, phở, bánh mì đều làm đường huyết tăng. Bạn không cần bỏ hẳn, chỉ cần ăn vừa phải và chia đều ra các bữa trong ngày.',
      '',
      'Bữa nào cũng nên có rau xanh. Rau giúp no lâu và làm đường huyết lên chậm hơn.',
      '',
      'Nên tránh nước ngọt, bánh kẹo và trái cây quá ngọt. Nếu thèm ngọt thì ăn một miếng nhỏ ngay sau bữa chính, đừng ăn lúc đói.',
      '',
      'Về chất đạm: nên ăn cá, thịt nạc, đậu phụ. Nên bớt mỡ, da và nội tạng động vật.',
    ].join('\n'),
    source_url:
      'https://kcb.vn/van-ban/huong-dan-chan-doan-va-dieu-tri-dai-thao-duong-tip-2',
    issuer: 'Bộ Y tế',
    doc_code: '5481/QĐ-BYT',
    conditions: ['type2_diabetes'],
    review_note: null,
    reject_reason: null,
    reviewed_at: null,
    reviewed_by: null,
  },
  {
    item_id: 'e_01HR11',
    title: 'Đo huyết áp tại nhà cho đúng cách',
    origin: 'editor_upload',
    topics: ['Tăng huyết áp', 'Theo dõi tại nhà'],
    created_at: '2026-08-12T15:05:00+07:00',
    status: 'pending',
    content: [
      'Trước khi đo, bạn hãy ngồi nghỉ khoảng 5 phút. Không đo ngay sau khi vừa đi lại, vừa ăn no, hoặc vừa uống cà phê.',
      '',
      'Khi đo, ngồi tựa lưng, hai chân đặt phẳng xuống sàn, không bắt chéo chân. Cánh tay đặt ngang mức tim.',
      '',
      'Mỗi lần nên đo hai lượt, cách nhau 1 đến 2 phút, rồi lấy trung bình. Ghi lại cả hai chỉ số và giờ đo.',
      '',
      'Nên đo vào một khung giờ cố định mỗi ngày, thường là buổi sáng trước khi uống thuốc. Mang sổ ghi này theo khi đi khám.',
    ].join('\n'),
    source_url: 'https://kcb.vn/van-ban/huong-dan-chan-doan-va-dieu-tri-tang-huyet-ap',
    issuer: 'Bộ Y tế',
    doc_code: '3192/QĐ-BYT',
    conditions: ['hypertension'],
    review_note: null,
    reject_reason: null,
    reviewed_at: null,
    reviewed_by: null,
  },
  {
    item_id: 'e_01HR12',
    title: 'Ăn nhạt khi vừa tăng huyết áp vừa đái tháo đường',
    origin: 'editor_upload',
    topics: ['Tăng huyết áp', 'Đái tháo đường', 'Dinh dưỡng'],
    created_at: '2026-08-10T10:20:00+07:00',
    status: 'approved',
    content: [
      'Mỗi ngày chỉ nên dùng dưới 5 gam muối, tức khoảng một thìa cà phê gạt ngang.',
      '',
      'Số này tính cả muối, nước mắm, nước tương và hạt nêm, không phải chỉ tính muối hạt. Bạn nên bớt mì gói, đồ hộp, dưa cà muối.',
      '',
      'Khi nấu, nêm nhạt hơn thói quen một chút rồi để cả nhà tự thêm nếu cần. Vị giác quen dần sau khoảng hai tuần.',
    ].join('\n'),
    source_url: 'https://kcb.vn/van-ban/huong-dan-chan-doan-va-dieu-tri-tang-huyet-ap',
    issuer: 'Bộ Y tế',
    doc_code: '3192/QĐ-BYT',
    conditions: ['hypertension', 'type2_diabetes'],
    review_note: 'Đã rút gọn còn ba đoạn. Giữ nguyên con số 5 gam của văn bản gốc.',
    reject_reason: null,
    reviewed_at: '2026-08-10T14:00:00+07:00',
    reviewed_by: 'u_01HQZV',
  },
  {
    item_id: 'e_01HR13',
    title: 'Người tiểu đường bị hạ đường huyết ban đêm thì xử lý thế nào?',
    origin: 'question_log',
    topics: [],
    created_at: '2026-08-13T09:45:00+07:00',
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
  },
  {
    item_id: 'e_01HR14',
    title: 'Uống metformin mấy viên một ngày',
    origin: 'question_log',
    topics: ['Đái tháo đường'],
    created_at: '2026-08-09T11:00:00+07:00',
    status: 'rejected',
    content:
      'Bản nháp ban đầu liệt kê các mức liều metformin thường dùng và cách tăng liều theo đáp ứng đường huyết.',
    source_url: null,
    issuer: null,
    doc_code: null,
    conditions: ['type2_diabetes'],
    review_note: null,
    reject_reason:
      'Nội dung nói về liều thuốc. Trợ lý không được phép trả lời chuyện liều, nên đưa vào thư viện là mở đường cho một câu trả lời mà lẽ ra phải từ chối.',
    reviewed_at: '2026-08-09T16:30:00+07:00',
    reviewed_by: 'u_01HQZV',
  },
]

/**
 * Log câu hỏi ngoài phạm vi.
 *
 * Chủ đề ở đây CỐ Ý nằm ngoài hai bệnh của dự án — đó chính là ý nghĩa của log
 * này: những gì bệnh nhân hỏi mà thư viện chưa trả lời được. `o_01HR22` là ngoại
 * lệ có chủ đích: bệnh thì trong phạm vi, nhưng thư viện thiếu tài liệu về tình
 * huống cụ thể ấy, và nó đã được tạo thành bản nháp `e_01HR13`.
 *
 * Số lượt hỏi khác nhau để thử được thứ tự ưu tiên, và có cả mục đã tạo bài lẫn
 * chưa để thử được hai trạng thái của nút "Thêm bài".
 *
 * Không mục nào có `patient_id` — xem ràng buộc PII ở mục 8 hợp đồng.
 */
export const outOfScopeFixture: OutOfScopeLog[] = [
  {
    log_id: 'o_01HR20',
    question: 'Chăm sóc vết mổ tại nhà thế nào cho đúng?',
    ask_count: 8,
    last_asked_at: '2026-08-13T07:50:00+07:00',
    drafted: false,
    drafted_item_id: null,
  },
  {
    log_id: 'o_01HR21',
    question: 'Chế độ ăn cho người suy thận nên như thế nào?',
    ask_count: 6,
    last_asked_at: '2026-08-12T18:20:00+07:00',
    drafted: false,
    drafted_item_id: null,
  },
  {
    log_id: 'o_01HR22',
    question: 'Người tiểu đường bị hạ đường huyết ban đêm thì xử lý thế nào?',
    ask_count: 4,
    last_asked_at: '2026-08-13T06:10:00+07:00',
    drafted: true,
    drafted_item_id: 'e_01HR13',
  },
  {
    log_id: 'o_01HR23',
    question: 'Tập luyện sau sinh bắt đầu được từ khi nào?',
    ask_count: 2,
    last_asked_at: '2026-08-11T20:35:00+07:00',
    drafted: false,
    drafted_item_id: null,
  },
]

// ---------------------------------------------------------------------------
// Tự kiểm khi nạp module
// ---------------------------------------------------------------------------

/** Ném lỗi ngay nếu fixture lệch schema, để phát hiện lúc nạp chứ không lúc render. */
function assertFixture(label: string, schema: z.ZodType, value: unknown): void {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new Error(`Fixture "${label}" không khớp schema:\n${z.prettifyError(parsed.error)}`)
  }
}

for (const [status, fixture] of Object.entries(chatFixtures)) {
  assertFixture(`chat/${status}`, chatResponseSchema, fixture.response)
  if (fixture.response.status !== status) {
    throw new Error(`Fixture "chat/${status}" có status là "${fixture.response.status}", không khớp khóa.`)
  }
}

assertFixture('patientProfile', patientProfileResponseSchema, patientProfileFixture)
assertFixture('conversationList', conversationListSchema, conversationListFixture)
assertFixture('conversationDetail', conversationDetailSchema, conversationDetailFixture)

for (const item of editorQueueFixture) {
  assertFixture(`editorQueue/${item.item_id}`, editorQueueItemDetailSchema, item)
}
for (const log of outOfScopeFixture) {
  assertFixture(`outOfScope/${log.log_id}`, outOfScopeLogSchema, log)
}

/**
 * `drafted_item_id` phải trỏ tới một mục có thật trong hàng đợi.
 *
 * Schema đã canh `drafted` khớp với `drafted_item_id`, nhưng nó không biết mục
 * kia có tồn tại hay không — đó là ràng buộc GIỮA hai fixture, chỉ kiểm được ở
 * đây. Trỏ hụt thì giao diện mở ra một mục trống mà không ai hiểu vì sao.
 */
for (const log of outOfScopeFixture) {
  if (log.drafted_item_id === null) continue
  const exists = editorQueueFixture.some((item) => item.item_id === log.drafted_item_id)
  if (!exists) {
    throw new Error(
      `Fixture "outOfScope/${log.log_id}" trỏ tới mục "${log.drafted_item_id}" không có trong editorQueueFixture.`,
    )
  }
}

/** Kiểu tiện dụng khi test cần dựng thêm citation. */
export type { Citation }
