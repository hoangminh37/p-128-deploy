/**
 * Một bài học trong lộ trình, đường dẫn `/learning/:articleId`.
 *
 * Nền canvas — đây là màn để ĐỌC, thuộc họ nền sáng. Nội dung bài nằm trong một
 * thẻ trắng bo 18px, giống hệt thẻ bọc câu trả lời ở màn hỏi đáp: hai chỗ đều
 * là "chữ dài để đọc kỹ", nên chúng phải trông như nhau.
 *
 * Khối nguồn tài liệu dùng nền `sand`: nó là xuất xứ, không phải nội dung và
 * cũng không phải hành động. Mint đã dành cho hành động (nút, marker, nhãn
 * nguồn ở màn hỏi đáp), nên đưa nó vào đây sẽ làm khối này trông bấm được.
 */
import { useParams, useNavigate, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'

import { useLearningLibrary } from '../app/learning'
import { EmptyState } from '../ui/EmptyState'
import { ErrorNotice } from '../ui/ErrorNotice'
import { CheckIcon, LibraryIcon } from '../ui/icons'

export function ArticleDetailScreen() {
  const { articleId } = useParams<{ articleId: string }>()
  const navigate = useNavigate()
  const { data, isPending, isError, error, refetch } = useLearningLibrary()

  if (isPending) {
    return (
      <p role="status" className="font-display text-notice text-slate">
        Đang mở bài học…
      </p>
    )
  }

  if (isError) {
    return (
      <ErrorNotice error={error} retryLabel="Tải lại" onRetry={() => void refetch()} />
    )
  }

  const pathItem = data?.learning_paths.find((p) => p.article.id === articleId)

  if (!pathItem) {
    return (
      <EmptyState
        title="Không tìm thấy bài học này"
        body="Đường dẫn có thể đã cũ, hoặc bài học đã được gỡ khỏi lộ trình."
        action={
          <Link
            to="/learning"
            className="motion-press font-display flex min-h-touch items-center rounded-pill bg-ink px-cozy text-input font-bold text-white no-underline hover:bg-ink-press"
          >
            Về lộ trình học tập
          </Link>
        }
      />
    )
  }

  const { article, day_number } = pathItem
  const isCompleted = data?.completed_articles.includes(article.id)

  // Nguồn tài liệu
  const sourceFile = article.origin_source ?? ''
  const sourceLabels: Record<string, { name: string; code: string; publisher: string }> = {
    'vn-moh-5481-2020-t2dm.pdf': {
      name: 'Hướng dẫn chẩn đoán và điều trị đái tháo đường típ 2',
      code: 'Quyết định số 5481/QĐ-BYT',
      publisher: 'Bộ Y tế Việt Nam, năm 2020',
    },
    'vn-moh-3192-2010-htn.pdf': {
      name: 'Hướng dẫn chẩn đoán và điều trị tăng huyết áp',
      code: 'Quyết định số 3192/QĐ-BYT',
      publisher: 'Bộ Y tế Việt Nam, năm 2010',
    },
  }
  const source = sourceLabels[sourceFile]

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="font-display flex min-h-touch items-center gap-tight text-input font-semibold text-ink underline underline-offset-4"
      >
        ← Lộ trình học tập
      </button>

      <div className="mt-snug flex flex-wrap items-center gap-tight">
        <span className="font-display rounded-pill bg-mint px-snug py-hair text-question font-semibold text-ink">
          Chặng {day_number}
        </span>
        {isCompleted && (
          <span className="font-display flex items-center gap-hair rounded-pill bg-ink px-snug py-hair text-question font-semibold text-white">
            <CheckIcon className="h-5 w-5 shrink-0" />
            Đã hoàn thành
          </span>
        )}
      </div>

      <h1 className="mt-cozy text-ask font-semibold text-ink">{article.title}</h1>

      {/* Nội dung bài học */}
      <div className="mt-block rounded-card-lg bg-white p-cozy">
        <div className="article-body">
          <ReactMarkdown>{article.full_content ?? article.content}</ReactMarkdown>
        </div>
      </div>

      {/* Nguồn tài liệu */}
      {source && (
        <div className="mt-block flex items-start gap-snug rounded-card bg-sand p-cozy">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-icon bg-sand-deep text-sand">
            <LibraryIcon className="h-7 w-7" />
          </span>
          <div className="min-w-0 text-sand-deep">
            <p className="font-display text-note font-semibold">
              Nguồn tài liệu biên soạn
            </p>
            <p className="font-display mt-hair text-input font-semibold">
              {source.name}
            </p>
            <p className="font-mono mt-hair text-question">{source.code}</p>
            <p className="font-display text-question">{source.publisher}</p>
            <p className="font-display mt-snug text-question">
              Nội dung bài học được biên soạn lại từ tài liệu gốc nhằm giúp bệnh
              nhân dễ tiếp cận hơn. Không thay thế tư vấn y tế trực tiếp.
            </p>
          </div>
        </div>
      )}

      {/* Trắc nghiệm ôn tập.
          Đây là bản ĐÃ LỘ ĐÁP ÁN, để ôn lại — không phải bài chấm điểm. Bài
          chấm điểm nằm ở màn hỏi đáp, và dòng lưu ý cuối khối nói rõ điều đó. */}
      {article.quiz_data && (
        <div className="mt-block rounded-card-lg bg-white p-cozy">
          <h2 className="text-empty font-semibold text-ink">Ôn tập nhanh</h2>
          <p className="font-display mt-hair text-question text-slate">
            Kiểm tra kiến thức bạn vừa học. Đáp án đúng đã được đánh dấu sẵn.
          </p>

          <p className="font-display mt-cozy text-input font-semibold text-ink">
            {article.quiz_data.question}
          </p>

          <ul className="mt-snug space-y-tight">
            {article.quiz_data.options.map((opt, idx) => {
              const isCorrect = idx === article.quiz_data!.correct_index
              return (
                <li
                  key={idx}
                  className={`flex items-start gap-snug rounded-card p-snug ${
                    isCorrect ? 'bg-mint text-ink' : 'bg-canvas text-ink'
                  }`}
                >
                  <span
                    className={`font-mono flex h-8 w-8 shrink-0 items-center justify-center rounded-icon text-question font-semibold ${
                      isCorrect ? 'bg-ink text-mint' : 'bg-white text-slate'
                    }`}
                  >
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="font-display min-w-0 flex-1 text-question">
                    {opt}
                    {isCorrect && (
                      <span className="font-semibold"> — đáp án đúng</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>

          <p className="font-display mt-cozy border-t border-line pt-snug text-question text-slate">
            Bạn chỉ được cộng 10 điểm khi trả lời đúng câu hỏi này ở phần{' '}
            <Link to="/chat" className="font-semibold text-ink underline">
              Bài học hôm nay
            </Link>{' '}
            trên màn hỏi đáp, mỗi ngày một lần.
          </p>
        </div>
      )}
    </div>
  )
}
