/**
 * Gợi ý câu hỏi khi màn chat còn trống.
 *
 * Chọn theo bệnh trong hồ sơ, vì màn hình trắng với một ô nhập trống là rào cản
 * thật với người chưa quen dùng ứng dụng: họ không biết được phép hỏi cái gì.
 * Bấm vào là gửi luôn, không đổ chữ vào ô rồi bắt bấm thêm nút Gửi.
 */
import type { PatientProfileResponse, PrimaryCondition } from '../lib/schemas'

const BY_CONDITION: Record<PrimaryCondition, readonly string[]> = {
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
    <section aria-labelledby="suggested-heading" className="max-w-answer">
      <h2 id="suggested-heading" className="font-display text-heading font-bold">
        Bạn có thể hỏi gì?
      </h2>
      <p className="font-display mt-tight text-question text-moss">
        Bấm vào một câu bên dưới để hỏi ngay, hoặc tự gõ câu hỏi của bạn ở ô cuối
        màn hình.
      </p>

      <ul className="mt-cozy space-y-snug">
        {questions.map((question) => (
          <li key={question}>
            <button
              type="button"
              onClick={() => onPick(question)}
              className="font-display min-h-touch w-full rounded-lg border-2 border-border p-snug text-left text-question text-ink"
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
