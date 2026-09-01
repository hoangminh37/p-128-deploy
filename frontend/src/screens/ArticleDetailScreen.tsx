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
import { ChevronLeftIcon } from '../ui/icons'
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
          <Link to="/learning" className="btn pri">
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
    /* CHÉP TỪ `id="bh"`: nút quay lại, nhãn `.eb` đếm bài, tiêu đề, rồi MỘT
       `.phieu` chứa `.doc` — bài học là một trang tài liệu có trích dẫn, đúng
       như câu trả lời của trợ lý. Bản mẫu tắt cột lề ở màn này
       (`#bh .doc-rail{display:none}`), nên `.doc-khong-le`. */
    <div>
      {/* Nút quay lại là một NÚT, không phải liên kết: nó gọi `navigate(-1)`,
          tức "lùi một bước trong lịch sử", chứ không dẫn tới một địa chỉ cố
          định. Dựng nó thành thẻ `a` thì bấm chuột giữa sẽ mở một tab trống. */}
      <button type="button" onClick={() => navigate(-1)} className="btn sm gh">
        <ChevronLeftIcon className="" />
        Quay lại thư viện
      </button>

      <div className="eb" style={{ marginTop: 18 }}>
        Bài {day_number}
        {isCompleted && ' · đã hoàn thành'}
      </div>

      <h1 style={{ fontSize: 'var(--t-h1)', lineHeight: 1.2, marginTop: 12, maxWidth: '20ch' }}>
        {article.title}
      </h1>

      <div className="phieu" style={{ marginTop: 26, maxWidth: 820 }}>
        <div className="phieu-top">
          <span>Bài học · đã đối chiếu văn bản</span>
          {source && <span>1 trích dẫn</span>}
        </div>

        <div style={{ padding: '0 clamp(16px,2vw,24px)' }}>
          <div className="doc doc-khong-le">
            <div className="doc-body">
              <div className="article-body">
                <ReactMarkdown>{article.full_content ?? article.content}</ReactMarkdown>
              </div>

              {/* Số hiệu văn bản mono TÍM ở cuối thân bài — đúng chỗ bản mẫu
                  đặt "3192/QĐ-BYT · Điều 12". Đây là chỗ thứ nhất trong bốn
                  chỗ được dùng tím. */}
              {source && (
                <p
                  className="mono"
                  style={{
                    fontSize: 'var(--t-mono-s)',
                    color: 'var(--tim)',
                    marginTop: 18,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {source.code} · {source.name}
                </p>
              )}

              <p
                style={{
                  fontSize: 'var(--t-note)',
                  color: 'var(--xam)',
                  borderLeft: '2px solid var(--ke-dam)',
                  paddingLeft: 12,
                  marginTop: 15,
                  lineHeight: 1.7,
                }}
              >
                Nội dung bài học được biên soạn lại từ tài liệu gốc nhằm giúp bệnh nhân dễ
                tiếp cận hơn. Không thay thế tư vấn y tế trực tiếp.
                {source && ` Cơ quan ban hành: ${source.publisher}.`}
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 9,
            flexWrap: 'wrap',
            padding: '0 clamp(16px,2vw,24px) 18px',
          }}
        >
          <Link to="/chat" className="btn sm gh">
            Hỏi trợ lý về bài này
          </Link>
        </div>

        <div className="rangcua" />
      </div>

      {/* Ôn tập nhanh — HAI CÂU SINH TỪ CHÍNH BÀI VỪA ĐỌC.

          Khối cũ ở đây lấy `article.quiz_data` rồi tô sẵn "— đáp án đúng", nên
          người đọc không phải trả lời gì. Tệ hơn: nó lộ đáp án của ĐÚNG câu hỏi
          mà banner "Bài học hôm nay" ở màn hỏi đáp dùng để chấm 10 điểm. */}
      <div style={{ marginTop: 24 }}>
        <QuizPanel
          source="article"
          articleId={article.id}
          numQuestions={2}
          title="Ôn tập nhanh"
          hint="Hai câu hỏi soạn từ chính bài bạn vừa đọc. Chọn đáp án rồi nộp — mỗi câu sẽ có lời giải thích ngắn."
          ctaLabel="Làm câu hỏi ôn"
        />
      </div>

      <p className="lab" style={{ marginTop: 18, lineHeight: 1.6 }}>
        Muốn kiểm tra kỹ hơn?{' '}
        <Link to={`/quiz?source=article&ref=${encodeURIComponent(article.id)}`}>
          Làm bài đầy đủ 5 câu về bài học này
        </Link>
      </p>

      {/* Nhắc chỗ cộng điểm. Cố ý KHÔNG in câu hỏi ra đây — in ra là lộ lại
          đúng cái vừa gỡ đi ở trên. */}
      {article.quiz_data && !isCompleted && (
        <p
          className="lab"
          style={{
            marginTop: 26,
            paddingTop: 14,
            borderTop: '1px solid var(--ke)',
            lineHeight: 1.6,
          }}
        >
          Bài này có một câu hỏi cộng 10 điểm. Bạn trả lời nó ở phần{' '}
          <Link to="/chat">Bài học hôm nay</Link> trên màn hỏi đáp, mỗi ngày một lần. Trả
          lời sai vẫn xem được lời giải thích và làm lại được.
        </p>
      )}
    </div>
  )
}
