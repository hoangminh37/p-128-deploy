/**
 * Một bài học trong lộ trình, đường dẫn `/learning/:articleId`.
 *
 * MÀN ĐỂ ĐỌC, nên cả trang bị chặn ở `max-w-answer` (594px, ~62 ký tự mỗi
 * dòng) và CĂN GIỮA. Bản trước để `w-full`, tức ở màn hình rộng bài viết chạy
 * hết 878px — khoảng 90 ký tự mỗi dòng, vượt xa ngưỡng dễ đọc mà cả thang cỡ
 * chữ của dự án được đặt ra để giữ. Đây là màn duy nhất trong ứng dụng mà người
 * dùng đọc liền vài phút, nên nó là chỗ ít được phép nhân nhượng nhất.
 *
 * Nội dung bài nằm trong một thẻ bo 18px, giống hệt thẻ bọc câu trả lời ở màn
 * hỏi đáp: hai chỗ đều là "chữ dài để đọc kỹ", nên chúng phải trông như nhau.
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
import { CheckIcon, ChevronLeftIcon, LibraryIcon } from '../ui/icons'
import { QuizPanel } from '../ui/QuizPanel'

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
    <div className="mx-auto w-full max-w-answer">
      {/* Nút quay lại là một NÚT, không phải liên kết: nó gọi `navigate(-1)`,
          tức "lùi một bước trong lịch sử", chứ không dẫn tới một địa chỉ cố
          định. Dựng nó thành thẻ `a` thì bấm chuột giữa sẽ mở một tab trống. */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="motion-press font-display flex min-h-touch items-center gap-tight rounded-pill border-2 border-slate px-cozy text-input font-semibold text-body enabled:hover:bg-canvas"
      >
        <ChevronLeftIcon className="h-5 w-5 shrink-0" />
        Về lộ trình học tập
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

      {/* Tiêu đề Lora — thẻ `h1` lấy `--font-title` từ luật nền ở `index.css`,
          không cần gắn `font-title` ở đây. */}
      <h1 className="mt-cozy text-ask font-semibold text-body">{article.title}</h1>

      {/* Nội dung bài học */}
      <div className="mt-block rounded-card-lg bg-surface p-cozy">
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

      {/* Ôn tập nhanh — HAI CÂU SINH TỪ CHÍNH BÀI VỪA ĐỌC.

          Khối cũ ở đây lấy `article.quiz_data` rồi tô sẵn "— đáp án đúng", nên
          người đọc không phải trả lời gì. Tệ hơn: nó lộ đáp án của ĐÚNG câu hỏi
          mà banner "Bài học hôm nay" ở màn hỏi đáp dùng để chấm 10 điểm. Cả
          khối vừa không dạy được gì, vừa làm hỏng chỗ duy nhất đang chấm điểm.

          Hai câu chứ không phải năm: đây là chỗ ngay sau khi đọc xong 800 chữ,
          hai câu là mức người đọc còn chịu làm. Ai muốn kỹ hơn thì có đường dẫn
          xuống bài đầy đủ ngay bên dưới. */}
      <div className="mt-block">
        <QuizPanel
          source="article"
          articleId={article.id}
          numQuestions={2}
          title="Ôn tập nhanh"
          hint="Hai câu hỏi soạn từ chính bài bạn vừa đọc. Chọn đáp án rồi nộp — mỗi câu sẽ có lời giải thích ngắn."
          ctaLabel="Ôn tập nhanh (2 câu)"
        />
      </div>

      <p className="font-display mt-cozy text-question text-slate">
        Muốn kiểm tra kỹ hơn?{' '}
        <Link
          to={`/quiz?source=article&ref=${encodeURIComponent(article.id)}`}
          className="font-semibold text-body underline"
        >
          Làm bài đầy đủ 5 câu về bài học này
        </Link>
      </p>

      {/* Nhắc chỗ cộng điểm. Cố ý KHÔNG in câu hỏi ra đây — in ra là lộ lại
          đúng cái vừa gỡ đi ở trên. */}
      {article.quiz_data && !isCompleted && (
        <p className="font-display mt-block border-t border-line pt-snug text-question text-slate">
          Bài này có một câu hỏi cộng 10 điểm. Bạn trả lời nó ở phần{' '}
          <Link to="/chat" className="font-semibold text-body underline">
            Bài học hôm nay
          </Link>{' '}
          trên màn hỏi đáp, mỗi ngày một lần. Trả lời sai vẫn xem được lời giải
          thích và làm lại được.
        </p>
      )}
    </div>
  )
}
