/**
 * Gợi ý câu hỏi khi màn chat còn trống.
 *
 * Chọn theo bệnh trong hồ sơ, vì màn hình trắng với một ô nhập trống là rào cản
 * thật với người chưa quen dùng ứng dụng: họ không biết được phép hỏi cái gì.
 * Bấm vào là gửi luôn, không đổ chữ vào ô rồi bắt bấm thêm nút Gửi.
 */
import type { PatientProfileResponse, PrimaryCondition } from '../lib/schemas'
import { Sen } from './Sen'

// Đây chỉ là các gợi ý được biên soạn sẵn cho những bệnh đã có nội dung UX
// riêng. `PrimaryCondition` bây giờ là mã động từ danh mục BTV, nên không thể
// dùng `Record<PrimaryCondition, ...>` (nó sẽ đòi có câu gợi ý cho mọi bệnh).
const BY_CONDITION: Partial<Record<PrimaryCondition, readonly string[]>> = {
  hypertension: [
    'Tôi bị tăng huyết áp thì nên ăn uống thế nào?',
    'Tôi nên đo huyết áp vào lúc nào trong ngày?',
  ],
  type2_diabetes: [
    'Tôi bị tiểu đường type 2, tôi nên tập thể dục thế nào cho đúng?',
    'Chỉ số đường huyết bao nhiêu thì gọi là cao?',
  ],
}

/** Chưa có hồ sơ thì vẫn phải gợi ý được gì đó, lấy câu chung cho cả hai bệnh. */
const FALLBACK: readonly string[] = [
  'Tôi nên ăn uống thế nào để giữ sức khỏe?',
  'Tôi nên đi khám lại bao lâu một lần?',
]

function questionsFor(profile: PatientProfileResponse | null): readonly string[] {
  if (profile === null) return FALLBACK

  // Bệnh chính trước, bệnh kèm sau — thứ tự này quyết định câu nào hiện đầu.
  const conditions: PrimaryCondition[] = [
    profile.primary_condition,
    ...(profile.comorbidities ?? []),
  ]

  const seen = new Set<string>()
  const questions: string[] = []
  for (const condition of conditions) {
    for (const question of BY_CONDITION[condition] ?? []) {
      if (!seen.has(question)) {
        seen.add(question)
        questions.push(question)
      }
    }
  }

  return questions.length > 0 ? questions : FALLBACK
}

export function SuggestedQuestions({
  profile,
  onPick,
}: {
  profile: PatientProfileResponse | null
  onPick: (question: string) => void
}) {
  const questions = questionsFor(profile)

  return (
    /* CHÉP TỪ `id="hdt"`: nét sen mờ 80px bên trái, tiêu đề và câu dẫn bên
       phải, rồi lưới `.auto` các nút `.btn` căn trái. `.auto` là
       `repeat(auto-fit, minmax(min(210px,100%),1fr))` — nó tự gãy theo bề
       ngang thật, không cần điểm ngắt nào. */
    <section
      aria-labelledby="suggested-heading"
      style={{
        marginTop: 30,
        display: 'flex',
        gap: 18,
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}
    >
      {/* Màn hỏi đáp chưa có lượt nào CŨNG LÀ một trạng thái rỗng, nên nét sen
          xuất hiện ở đây theo đúng luật hai chỗ ở `Sen.tsx`. */}
      <div style={{ flex: 'none', opacity: 0.6 }}>
        <Sen size={80} />
      </div>

      <div style={{ flex: 1, minWidth: 240 }}>
        <h2 id="suggested-heading" style={{ fontSize: 'var(--t-h3)' }}>
          Bạn có thể hỏi gì?
        </h2>
        <p
          style={{
            fontSize: 'var(--t-note)',
            color: 'var(--xam)',
            marginTop: 6,
            maxWidth: '52ch',
            lineHeight: 1.7,
          }}
        >
          Bấm vào một câu bên dưới để hỏi ngay, hoặc tự gõ câu hỏi của bạn ở ô cuối màn
          hình.
        </p>

        <ul className="auto" style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
          {questions.map((question) => (
            <li key={question} style={{ display: 'flex' }}>
              <button
                type="button"
                onClick={() => onPick(question)}
                className="btn"
                style={{ textAlign: 'left', justifyContent: 'flex-start', width: '100%' }}
              >
                {question}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
