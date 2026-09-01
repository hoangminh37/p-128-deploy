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
 *   đã xong   — khối mint, dấu tick.         Mở lại để đọc.
 *   sắp tới   — khối ink, số chặng màu mint.  Đây là việc tiếp theo.
 *   chưa đọc  — khối canvas, số chặng slate.  Vẫn đọc được.
 *
 * KHÔNG CÒN KHOÁ TUẦN TỰ (bỏ 24/08/2026). Trạng thái thứ ba trước đây là "chưa
 * mở" và `disabled` thật. Nhưng cách DUY NHẤT hoàn thành một chặng là qua banner
 * "Bài học hôm nay" ở màn hỏi đáp, và banner đó chỉ cho làm một bài mỗi ngày —
 * nên lộ trình 21 bài cần đúng 21 ngày mới mở hết, người mới vào chỉ thấy một ô
 * sáng và hai mươi ô xám. Thứ tự vẫn còn nguyên ý nghĩa, và khối "Bài học hôm
 * nay" vẫn chỉ vào chặng kế, nhưng nó là GỢI Ý chứ không phải rào chắn. Đây là
 * tài liệu giáo dục sức khoẻ: người vừa được chẩn đoán cao huyết áp cần bài về
 * đo huyết áp tại nhà HÔM NAY, không phải sau mười một ngày.
 *
 * KHÔNG đổi một lời gọi API nào so với bản trước: vẫn đúng `useLearningLibrary`,
 * vẫn đọc `learning_paths` và `completed_articles` từ cùng một response.
 */
import { Link, useNavigate } from 'react-router-dom'

import { useLearningLibrary } from '../app/learning'
import type { LearningPathItem } from '../lib/schemas'
import { EmptyState } from '../ui/EmptyState'
import { ErrorNotice } from '../ui/ErrorNotice'
import { ReadingPerson } from '../ui/illustrations'

/**
 * Ba trạng thái của một chặng, ánh xạ sang lớp của bản mẫu.
 *
 * `id="tv"` dựng "toàn bộ lộ trình" bằng những hàng `.hang` — một dải kẻ ngang
 * chứ không phải một lưới thẻ. Mỗi hàng có ba phần: số chặng mono ở cột `.ma`,
 * tên bài ở cột `.noi`, và một `.chip` trạng thái đẩy sang mép phải.
 *
 * Ba trạng thái phân biệt bằng CẢ MÀU LẪN CHỮ:
 *
 *   done  số XANH   · chip `.duyet` "Đã xong"
 *   next  số TÍM    · chip `.cho`   "Đang học" · cả hàng nền tím nhạt
 *   todo  số XÁM    · nhãn `.lab`   "Chưa mở"  · tên bài lùi về `--xam`
 */
type ChapterState = 'done' | 'next' | 'todo'

const STATE_COLOR: Record<ChapterState, string> = {
  done: 'var(--xanh)',
  next: 'var(--tim)',
  todo: 'var(--ke-dam)',
}

/** Một hàng trong danh sách lộ trình. */
function ChapterRow({
  item,
  state,
  onOpen,
}: {
  item: LearningPathItem
  state: ChapterState
  onOpen: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="hang"
        style={{
          width: '100%',
          textAlign: 'left',
          background: state === 'next' ? 'var(--tim-wash)' : 'none',
          border: 0,
          borderBottom: '1px solid var(--ke)',
          font: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        <span className="ma mono" style={{ fontSize: 18, color: STATE_COLOR[state], width: 42 }}>
          {String(item.day_number).padStart(2, '0')}
        </span>

        <span
          className="noi"
          style={{
            fontSize: 'var(--t-lead)',
            color: state === 'todo' ? 'var(--xam)' : 'var(--ink)',
          }}
        >
          {item.article.title}
          {item.article.quiz_data && (
            <span className="pill-quiz" style={{ marginLeft: 10 }}>
              Có bài trắc nghiệm, +10 điểm
            </span>
          )}
        </span>

        {state === 'done' && <span className="chip duyet">Đã xong</span>}
        {state === 'next' && <span className="chip cho">Đang học</span>}
        {state === 'todo' && <span className="lab">Chưa mở</span>}
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
   * Chặng "sắp tới": chặng chưa xong đầu tiên.
   *
   * Tính đúng một lần ở đây rồi truyền xuống, thay vì để mỗi thẻ tự dò lại
   * mảng — cùng một luật nằm ở một chỗ thì khối nổi bật trên đầu và thẻ trong
   * lưới không bao giờ nói hai điều khác nhau về cùng một chặng.
   *
   * Vế "và chặng ngay trước nó đã xong" đã bỏ cùng lúc với khoá tuần tự. Giữ
   * lại thì một người nhảy cóc đọc chặng 5 trước sẽ thấy khối "Bài học hôm nay"
   * đứng im ở chặng 1 mãi.
   */
  const nextIndex = paths.findIndex((path) => !completed.includes(path.article.id))
  const featured = nextIndex >= 0 ? paths[nextIndex] : null

  const doneCount = completed.length

  return (
    /* CHÉP TỪ `id="tv"`: nhãn `.eb`, tiêu đề cùng dòng với bộ đếm mono, một
       thanh tiến trình ba đoạn, rồi `.co` hai cột — trái là `.phieu` "bài học
       hôm nay" cộng danh sách `.hang`, phải là `.phu` thẻ ôn tập. */
    <div>
      <div className="eb">Lộ trình học của bạn</div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 18,
          flexWrap: 'wrap',
          marginTop: 16,
        }}
      >
        <h1 style={{ fontSize: 'var(--t-h1)', lineHeight: 1.16 }}>Bài học hôm nay</h1>
        <div className="mono" style={{ fontSize: 'var(--t-note)', color: 'var(--xam)' }}>
          Đã học {doneCount} trên {paths.length} bài
        </div>
      </div>

      {/* Thanh tiến trình ba đoạn: đã xong (xanh) · đang học (tím) · chưa mở
          (xám). `aria-hidden` vì bộ đếm ngay trên đã nói đúng con số đó bằng
          chữ. Đoạn nào bằng 0 thì `flex:0` và nó biến mất, không để lại một
          vạch mồ côi. */}
      <div aria-hidden="true" style={{ display: 'flex', gap: 4, marginTop: 14, maxWidth: 640 }}>
        <span style={{ height: 6, flex: doneCount, background: 'var(--xanh)' }} />
        <span style={{ height: 6, flex: featured !== null ? 1 : 0, background: 'var(--tim)' }} />
        <span
          style={{
            height: 6,
            flex: Math.max(0, paths.length - doneCount - (featured !== null ? 1 : 0)),
            background: 'var(--ke-dam)',
          }}
        />
      </div>

      {paths.length === 0 ? (
        <div style={{ marginTop: 26 }}>
          {/* Chỉ mô tả điều màn này biết chắc: danh sách trả về không có chặng
              nào. KHÔNG suy ra rằng "hệ thống đang chuẩn bị giáo trình" — giao
              diện không có cơ sở nào cho khẳng định đó. */}
          <EmptyState
            illustration={<ReadingPerson size={144} />}
            title="Chưa có chặng nào trong lộ trình"
            body="Danh sách bài học trả về hiện không có mục nào. Bạn vẫn hỏi đáp bình thường ở màn Câu hỏi mới."
            action={
              <Link to="/chat" className="btn pri">
                Về màn hỏi đáp
              </Link>
            }
          />
        </div>
      ) : (
        <div className="co" style={{ marginTop: 26 }}>
          <div>
            {/* ---- Bài học hôm nay ---- */}
            {featured !== null && (
              <section aria-labelledby="hom-nay-heading" className="phieu">
                <div className="phieu-top">
                  <span id="hom-nay-heading">
                    Bài {String(featured.day_number).padStart(2, '0')} · hôm nay
                  </span>
                  <span>Đọc vài phút</span>
                </div>

                <div
                  style={{
                    padding: '22px clamp(16px,2vw,24px)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))',
                    gap: 20,
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: 'var(--t-h3)', lineHeight: 1.3 }}>
                      {featured.article.title}
                    </h2>
                    <p style={{ color: 'var(--xam)', marginTop: 9, maxWidth: '48ch', lineHeight: 1.7 }}>
                      {featured.article.content}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(`/learning/${featured.article.id}`)}
                    className="btn pri"
                    style={{ whiteSpace: 'nowrap', alignSelf: 'center' }}
                  >
                    Đọc bài
                  </button>
                </div>

                <div className="rangcua" />
              </section>
            )}

            {/* ---- Toàn bộ lộ trình ---- */}
            <section aria-labelledby="lo-trinh-heading" style={{ marginTop: 34 }}>
              <span className="lab" id="lo-trinh-heading">
                Toàn bộ lộ trình · {paths.length} bài
              </span>

              <ul
                style={{
                  listStyle: 'none',
                  margin: '10px 0 0',
                  padding: 0,
                  borderTop: '1px solid var(--ke-dam)',
                }}
              >
                {paths.map((path, index) => (
                  <ChapterRow
                    key={path.article.id}
                    item={path}
                    state={
                      completed.includes(path.article.id)
                        ? 'done'
                        : index === nextIndex
                          ? 'next'
                          : 'todo'
                    }
                    onOpen={() => navigate(`/learning/${path.article.id}`)}
                  />
                ))}
              </ul>
            </section>
          </div>

          {/* ---- Cột phải: ôn tập ---- */}
          <aside className="phu">
            <div className="phieu">
              <div className="phieu-top">
                <span>Ôn tập</span>
              </div>

              <div style={{ padding: '16px 18px' }}>
                <div
                  className="mono"
                  style={{ fontSize: 'clamp(30px,3vw,40px)', color: 'var(--tim)', lineHeight: 1.1 }}
                >
                  {String(paths.length - doneCount).padStart(2, '0')}
                </div>
                <div className="lab">Bài chưa học</div>

                <div style={{ height: 1, background: 'var(--ke)', margin: '14px 0' }} />

                <Link to="/quiz/mistakes" className="btn sm" style={{ width: '100%' }}>
                  Xem câu sai
                </Link>
              </div>

              <div className="rangcua" />
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
