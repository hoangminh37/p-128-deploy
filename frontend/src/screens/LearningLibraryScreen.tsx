/**
 * Lộ trình học tập, đường dẫn `/learning`.
 *
 * BỐ CỤC HAI TẦNG, và thứ tự đó là thứ tự người dùng cần:
 *
 *   1. BÀI HỌC HÔM NAY — một khối lớn nổi hẳn lên đầu trang. Đây là việc duy
 *      nhất người dùng cần làm hôm nay; mọi thứ còn lại là tra cứu. Bản trước
 *      chôn nó thành một chặng giữa danh sách, ngang hàng với mọi chặng khác.
 *
 *   2. TOÀN BỘ LỘ TRÌNH — lưới thẻ, hai cột từ 768px và ba cột từ 1162px.
 *      Bản trước xếp một cột dọc, nên trên màn hình rộng nó là một dải hẹp
 *      dính lề trái với gần nửa trang bỏ trống bên phải.
 *
 * BA TRẠNG THÁI của một chặng, mỗi trạng thái nói bằng HAI kênh cùng lúc — màu
 * khối biểu tượng, và chữ trong khối đó:
 *
 *   đã xong   — khối mint, dấu tick.         Bấm được, mở lại để đọc.
 *   sắp tới   — khối ink, số chặng màu mint.  Bấm được, đây là việc tiếp theo.
 *   chưa mở   — khối canvas, số chặng slate.  KHÔNG bấm được.
 *
 * Chặng chưa mở dùng `disabled` thật chứ không phải `aria-disabled`: khác với
 * nút Duyệt ở màn biên tập, ở đây KHÔNG có dòng giải thích nào cần người dùng
 * bàn phím nghe được — lý do đã in thẳng vào chính thẻ ("hoàn thành các chặng
 * trước"), nên bỏ nó khỏi thứ tự Tab là đúng.
 *
 * KHÔNG đổi một lời gọi API nào so với bản trước: vẫn đúng `useLearningLibrary`,
 * vẫn đọc `learning_paths` và `completed_articles` từ cùng một response.
 */
import { Link, useNavigate } from 'react-router-dom'

import { useLearningLibrary } from '../app/learning'
import type { LearningPathItem } from '../lib/schemas'
import { EmptyState } from '../ui/EmptyState'
import { ErrorNotice } from '../ui/ErrorNotice'
import { CheckIcon, LibraryIcon } from '../ui/icons'
import { DocumentStack, ReadingPerson } from '../ui/illustrations'

/**
 * Ba bộ mặt của khối biểu tượng đầu thẻ.
 *
 * Khai một chỗ để khối "bài học hôm nay" và thẻ trong lưới không bao giờ tô
 * khác nhau cho cùng một trạng thái.
 */
const STATE_SKIN = {
  done: 'bg-mint text-mint-deep',
  next: 'bg-ink text-mint',
  locked: 'bg-canvas text-slate',
} as const

type ChapterState = keyof typeof STATE_SKIN

/** Khối biểu tượng vuông đầu thẻ: dấu tick khi đã xong, số chặng khi chưa. */
function ChapterMark({ state, day }: { state: ChapterState; day: number }) {
  return (
    <span
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-icon ${STATE_SKIN[state]}`}
    >
      {state === 'done' ? (
        <CheckIcon className="h-6 w-6" />
      ) : (
        <span className="font-mono text-question font-semibold">{day}</span>
      )}
    </span>
  )
}

/** Một thẻ trong lưới lộ trình. */
function ChapterCard({
  item,
  state,
  onOpen,
}: {
  item: LearningPathItem
  state: ChapterState
  onOpen: () => void
}) {
  const isClickable = state !== 'locked'

  return (
    <li>
      <button
        type="button"
        disabled={!isClickable}
        onClick={onOpen}
        // `motion-lift` chỉ gắn cho chặng bấm được. Một chặng chưa mở mà vẫn
        // nhấc lên dưới con trỏ là lời mời bấm vào thứ không bấm được.
        //
        // `h-full` để mọi thẻ trong một hàng của lưới cao bằng nhau, bất kể
        // tiêu đề dài ngắn — thiếu nó thì hàng nào cũng so le.
        className={`flex h-full w-full flex-col rounded-card p-cozy text-left ${
          isClickable ? 'motion-lift bg-surface' : 'cursor-not-allowed bg-surface/60'
        }`}
      >
        <span className="flex items-center gap-snug">
          <ChapterMark state={state} day={item.day_number} />

          <span className="font-display min-w-0 flex-1 text-note font-semibold text-slate">
            Chặng {item.day_number}
            {state === 'next' && ' · học tiếp'}
            {state === 'done' && ' · đã xong'}
          </span>
        </span>

        <span className="mt-cozy block text-empty font-semibold text-body">
          {item.article.title}
        </span>

        <span className="font-display mt-tight block line-clamp-3 text-question text-slate">
          {isClickable
            ? item.article.content
            : 'Hoàn thành các chặng trước để mở khoá nội dung này.'}
        </span>

        {isClickable && item.article.quiz_data && (
          <span className="font-display mt-cozy flex w-fit items-center rounded-pill bg-sand px-snug py-hair text-question font-semibold text-sand-deep">
            Có bài trắc nghiệm, +10 điểm
          </span>
        )}
      </button>
    </li>
  )
}

export function LearningLibraryScreen() {
  const { data, isPending, isError, error, refetch } = useLearningLibrary()
  const navigate = useNavigate()

  if (isPending) {
    return (
      <p role="status" className="font-display text-notice text-slate">
        Đang tải lộ trình học tập…
      </p>
    )
  }

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-answer">
        <ErrorNotice
          error={error}
          retryLabel="Tải lại lộ trình"
          onRetry={() => void refetch()}
        />
      </div>
    )
  }

  const paths = data?.learning_paths ?? []
  const completed = data?.completed_articles ?? []

  /**
   * Chặng "sắp tới": chặng chưa xong đầu tiên mà chặng ngay trước nó đã xong.
   *
   * Tính đúng một lần ở đây rồi truyền xuống, thay vì để mỗi thẻ tự dò lại
   * mảng — cùng một luật nằm ở một chỗ thì khối nổi bật trên đầu và thẻ trong
   * lưới không bao giờ nói hai điều khác nhau về cùng một chặng.
   */
  const nextIndex = paths.findIndex(
    (path, index) =>
      !completed.includes(path.article.id) &&
      (index === 0 || completed.includes(paths[index - 1].article.id)),
  )
  const featured = nextIndex >= 0 ? paths[nextIndex] : null

  return (
    <div className="w-full">
      <h1 className="text-ask font-semibold text-body">Lộ trình của bạn</h1>
      <p className="mt-snug max-w-answer text-notice text-body">
        Đã hoàn thành {completed.length} trên {paths.length} chặng. Mỗi chặng là
        một bài ngắn, đọc trong vài phút.
      </p>

      {paths.length === 0 ? (
        <div className="mt-block">
          {/* Chỉ mô tả điều màn này biết chắc: danh sách trả về không có chặng
              nào. KHÔNG suy ra rằng "hệ thống đang chuẩn bị giáo trình" — giao
              diện không có cơ sở nào cho khẳng định đó. */}
          <EmptyState
            illustration={<ReadingPerson size={144} />}
            title="Chưa có chặng nào trong lộ trình"
            body="Danh sách bài học trả về hiện không có mục nào. Bạn vẫn hỏi đáp bình thường ở màn Câu hỏi mới."
            action={
              <Link
                to="/chat"
                className="motion-press font-display flex min-h-touch items-center rounded-pill bg-mint px-cozy text-input font-bold text-ink no-underline hover:bg-mint-press"
              >
                Về màn hỏi đáp
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {/* ---- Bài học hôm nay ---- */}
          {featured !== null && (
            <section
              aria-labelledby="hom-nay-heading"
              className="mt-block flex flex-col items-start gap-cozy rounded-card-lg bg-surface p-cozy sm:flex-row sm:items-center"
            >
              <DocumentStack size={112} className="mx-auto shrink-0 sm:mx-0" />

              <div className="min-w-0 flex-1">
                <p
                  id="hom-nay-heading"
                  className="font-display text-note font-semibold text-slate"
                >
                  Bài học hôm nay · chặng {featured.day_number}
                </p>
                <h2 className="mt-hair text-heading font-semibold text-body">
                  {featured.article.title}
                </h2>
                <p className="font-display mt-tight line-clamp-2 text-question text-slate">
                  {featured.article.content}
                </p>

                <div className="mt-cozy flex flex-wrap gap-snug">
                  <button
                    type="button"
                    onClick={() => navigate(`/learning/${featured.article.id}`)}
                    className="motion-press font-display flex min-h-touch items-center rounded-pill bg-mint px-cozy text-input font-bold text-ink enabled:hover:bg-mint-press"
                  >
                    Đọc bài này
                  </button>

                  {/* Bài trắc nghiệm CHẤM ĐIỂM nằm ở màn hỏi đáp, không ở đây —
                      xem dòng lưu ý cuối `ArticleDetailScreen`. */}
                  <Link
                    to="/chat"
                    className="motion-press font-display flex min-h-touch items-center rounded-pill border-2 border-slate px-cozy text-input font-semibold text-body no-underline hover:bg-canvas"
                  >
                    Làm bài trắc nghiệm
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* ---- Toàn bộ lộ trình ---- */}
          <section aria-labelledby="lo-trinh-heading" className="mt-block">
            <h2
              id="lo-trinh-heading"
              className="font-display flex items-center gap-tight text-input font-semibold text-body"
            >
              <LibraryIcon className="h-6 w-6 shrink-0 text-slate" />
              Tất cả {paths.length} chặng
            </h2>

            {/* Ba cột từ `rail:` (1162px) — cùng mốc mà màn hỏi đáp dùng để nhả
                dải nguồn ra lề phải, nên hai màn đổi bố cục cùng một lúc thay vì
                mỗi màn nhảy ở một chỗ khác nhau. */}
            <ul className="mt-cozy grid gap-cozy md:grid-cols-2 rail:grid-cols-3">
              {paths.map((path, index) => (
                <ChapterCard
                  key={path.article.id}
                  item={path}
                  state={
                    completed.includes(path.article.id)
                      ? 'done'
                      : index === nextIndex
                        ? 'next'
                        : 'locked'
                  }
                  onOpen={() => navigate(`/learning/${path.article.id}`)}
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
