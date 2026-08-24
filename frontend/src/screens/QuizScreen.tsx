/**
 * Màn trắc nghiệm độc lập — `/quiz`.
 *
 * Nguồn ra đề đọc từ query string để đường dẫn chia sẻ được và bấm Back vẫn về
 * đúng chỗ cũ:
 *
 *   /quiz                                  → ôn tập tổng hợp: bài đã học + câu đã hỏi
 *   /quiz?source=article&ref=a_XXXXXX      → ra đề từ một bài trong Thư viện
 *   /quiz?source=conversation&ref=c_XXXXXX → ra đề từ một phiên chat
 *
 * Query string lệch chuẩn (thiếu `ref`, `source` lạ) thì rơi về `profile` chứ
 * không báo lỗi: người dùng gõ tay hay dán nhầm link vẫn có bài để làm.
 */
import { Link, useSearchParams } from 'react-router-dom'

import { QuizPanel } from '../ui/QuizPanel'
import type { QuizSource } from '../lib/schemas'

function readSource(raw: string | null, ref: string | null): QuizSource {
  if (raw === 'article' && ref) return 'article'
  if (raw === 'conversation' && ref) return 'conversation'
  return 'profile'
}

export function QuizScreen() {
  const [searchParams] = useSearchParams()
  const ref = searchParams.get('ref')
  const source = readSource(searchParams.get('source'), ref)

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-reading px-cozy py-block">
        <nav className="mb-block">
          <Link
            to="/learning"
            className="font-display inline-flex min-h-touch items-center text-input text-moss underline underline-offset-4 hover:text-ink"
          >
            ← Thư viện học tập
          </Link>
        </nav>

        <header className="mb-block">
          <h1 className="font-display text-ask font-bold text-ink">Trắc nghiệm kiến thức</h1>
          <p className="mt-tight font-display text-question text-moss">
            Đây là chặng cuối của vòng học: đọc bài trong Thư viện, hỏi trợ lý những
            chỗ chưa rõ, rồi tự kiểm tra lại xem mình đã nắm chưa. Đề được soạn riêng
            từ những bài bạn đã hoàn thành và những điều bạn từng thắc mắc.
          </p>
        </header>

        <p className="mb-block font-display text-question">
          <Link
            to="/quiz/mistakes"
            className="inline-flex min-h-touch items-center text-medical underline underline-offset-4"
          >
            Xem lại những chỗ bạn chưa nắm →
          </Link>
        </p>

        <QuizPanel
          source={source}
          articleId={source === 'article' ? (ref ?? undefined) : undefined}
          conversationId={source === 'conversation' ? (ref ?? undefined) : undefined}
          ctaLabel="Bắt đầu làm bài"
        />
      </div>
    </div>
  )
}
