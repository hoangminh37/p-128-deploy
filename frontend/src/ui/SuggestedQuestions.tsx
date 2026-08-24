/**
 * Gợi ý câu hỏi khi màn chat còn trống.
 *
 * Chọn theo bệnh trong hồ sơ, vì màn hình trắng với một ô nhập trống là rào cản
 * thật với người chưa quen dùng ứng dụng: họ không biết được phép hỏi cái gì.
 * Bấm vào là gửi luôn, không đổ chữ vào ô rồi bắt bấm thêm nút Gửi.
 */
import type { PatientProfileResponse, PrimaryCondition } from '../lib/schemas'
import { Mascot } from './Mascot'

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
      {/* Màn hỏi đáp chưa có lượt nào CŨNG LÀ một trạng thái rỗng, nên linh vật
          xuất hiện ở đây theo đúng luật ba chỗ ở `Mascot.tsx`. Không dùng
          `EmptyState` vì khối này còn có một danh sách bấm được bên dưới, mà
          `EmptyState` chỉ nhận đúng một hành động. */}
      <Mascot variant="muted" size={80} />

      <h2 id="suggested-heading" className="mt-cozy text-heading font-semibold text-ink">
        Bạn có thể hỏi gì?
      </h2>
      <p className="font-display mt-tight text-question text-slate">
        Bấm vào một câu bên dưới để hỏi ngay, hoặc tự gõ câu hỏi của bạn ở ô cuối
        màn hình.
      </p>

      <ul className="mt-cozy space-y-snug">
        {questions.map((question) => (
          <li key={question}>
            <button
              type="button"
              onClick={() => onPick(question)}
              // Thẻ trắng trên nền canvas, không viền. Ranh giới của nút là
              // chỗ nền đổi từ canvas sang trắng — đủ thấy ở mọi cỡ chữ, và
              // không thêm một nét kẻ nữa vào một danh sách vốn đã nhiều nét.
              className="motion-lift font-display min-h-touch w-full rounded-card bg-white p-cozy text-left text-question text-ink"
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
