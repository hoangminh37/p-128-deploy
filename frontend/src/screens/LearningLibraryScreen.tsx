/**
 * Lộ trình học tập, đường dẫn `/learning`.
 *
 * Nền canvas. Mỗi chặng là một thẻ trắng bo 16px với một khối biểu tượng vuông
 * bên trái — cùng ngôn ngữ hình với hàng đợi duyệt của biên tập viên, vì hai
 * chỗ đều là "danh sách việc, quét dọc mép trái là biết trạng thái".
 *
 * BA TRẠNG THÁI của một chặng, và cả ba đều nói bằng HAI kênh cùng lúc — màu
 * khối biểu tượng, và chữ trong khối đó:
 *
 *   đã xong   — khối mint, dấu tick.        Bấm được, mở lại để đọc.
 *   sắp tới   — khối ink, số chặng màu mint. Bấm được, đây là việc tiếp theo.
 *   chưa mở   — khối canvas, số chặng slate. KHÔNG bấm được.
 *
 * Chặng chưa mở dùng `disabled` thật chứ không phải `aria-disabled`: khác với
 * nút Duyệt ở màn biên tập, ở đây KHÔNG có dòng giải thích nào cần người dùng
 * bàn phím nghe được — lý do đã in thẳng vào chính thẻ ("hoàn thành các chặng
 * trước"), nên bỏ nó khỏi thứ tự Tab là đúng.
 */
import { Link, useNavigate } from 'react-router-dom'

import { useLearningLibrary } from '../app/learning'
import { EmptyState } from '../ui/EmptyState'
import { ErrorNotice } from '../ui/ErrorNotice'
import { CheckIcon } from '../ui/icons'

export function LearningLibraryScreen() {
  const { data, isPending, isError, error, refetch } = useLearningLibrary()
  const navigate = useNavigate()

  return (
    <div className="w-full">
      {isPending && (
        <p role="status" className="font-display text-notice text-slate">
          Đang tải lộ trình học tập…
        </p>
      )}

      {isError && (
        <ErrorNotice
          error={error}
          retryLabel="Tải lại lộ trình"
          onRetry={() => void refetch()}
        />
      )}

      {data && (
        <>
          {/* ---- Đầu trang: đã đi được bao xa ---- */}
          <div className="flex flex-wrap items-center justify-between gap-snug rounded-card-lg bg-white p-cozy">
            <div className="min-w-0">
              <h1 className="text-ask font-semibold text-ink">Lộ trình của bạn</h1>
              <p className="font-display mt-hair text-question text-slate">
                Đã hoàn thành {data.completed_articles.length} trên{' '}
                {data.learning_paths.length} chặng.
              </p>
            </div>

            <Link
              to="/chat"
              className="motion-press font-display flex min-h-touch shrink-0 items-center rounded-pill bg-mint px-cozy text-input font-bold text-ink no-underline hover:bg-mint-press"
            >
              Học bài hôm nay
            </Link>
          </div>

          {data.learning_paths.length === 0 ? (
            <div className="mt-block">
              {/* Chỉ mô tả điều màn này biết chắc: danh sách trả về không có
                  chặng nào. KHÔNG suy ra rằng "hệ thống đang chuẩn bị giáo
                  trình" — giao diện không có cơ sở nào cho khẳng định đó. */}
              <EmptyState
                title="Chưa có chặng nào trong lộ trình"
                body="Danh sách bài học trả về hiện không có mục nào. Bạn vẫn hỏi đáp bình thường ở màn Câu hỏi mới."
              />
            </div>
          ) : (
            <ul className="mt-block space-y-snug">
              {data.learning_paths.map((path, idx) => {
                const article = path.article
                const isCompleted = data.completed_articles.includes(article.id)
                const isNext =
                  !isCompleted &&
                  (idx === 0 ||
                    data.completed_articles.includes(
                      data.learning_paths[idx - 1].article.id,
                    ))
                const isClickable = isCompleted || isNext

                const box = isCompleted
                  ? 'bg-mint text-mint-deep'
                  : isNext
                    ? 'bg-ink text-mint'
                    : 'bg-canvas text-slate'

                return (
                  <li key={article.id}>
                    <button
                      type="button"
                      disabled={!isClickable}
                      onClick={() => navigate(`/learning/${article.id}`)}
                      // `motion-lift` chỉ gắn cho chặng bấm được. Một chặng
                      // chưa mở mà vẫn nhấc lên dưới con trỏ là lời mời bấm vào
                      // thứ không bấm được.
                      className={`flex w-full items-start gap-snug rounded-card p-cozy text-left ${
                        isClickable
                          ? 'motion-lift bg-white'
                          : 'cursor-not-allowed bg-white/60'
                      }`}
                    >
                      <span
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-icon ${box}`}
                      >
                        {isCompleted ? (
                          <CheckIcon className="h-6 w-6" />
                        ) : (
                          <span className="font-mono text-question font-semibold">
                            {path.day_number}
                          </span>
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="font-display block text-note font-semibold text-slate">
                          Chặng {path.day_number}
                          {isNext && ' · học tiếp'}
                        </span>

                        <span className="mt-hair block text-empty font-semibold text-ink">
                          {article.title}
                        </span>

                        <span className="font-display mt-tight block line-clamp-2 text-question text-slate">
                          {isClickable
                            ? article.content
                            : 'Hoàn thành các chặng trước để mở khoá nội dung này.'}
                        </span>

                        {isClickable && article.quiz_data && (
                          <span className="font-display mt-snug flex w-fit items-center rounded-pill bg-sand px-snug py-hair text-question font-semibold text-sand-deep">
                            Có bài trắc nghiệm, +10 điểm
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
