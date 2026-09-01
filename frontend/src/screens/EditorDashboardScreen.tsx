/**
 * Màn tổng quan của biên tập viên, đường dẫn `/editor`.
 *
 * DỰNG TỪ `id="bt"` CỦA BẢN MẪU (`docs/design/eduhealth-ai.html`): nhãn `.eb`
 * kèm ngày, tiêu đề `--t-h1`, một lưới `.auto-w` hai ô số liệu ngăn nhau bằng
 * nét 1px, rồi `.co` hai cột — trái là bảng hàng chờ duyệt trong một `.phieu`,
 * phải là `.phu` một thẻ số liệu dính theo màn hình.
 *
 * NỀN GIẤY, KHÔNG CÒN MẢNG MỰC ĐẶC. Bản trước đặt cả màn này lên một tấm navy
 * để tách nó khỏi ba màn làm việc còn lại; bản mẫu cho cả bốn màn biên tập đứng
 * trên cùng một tờ giấy và để `.phieu` với đường kẻ lo việc phân tầng.
 *
 * HAI CON SỐ Ở `.auto-w` KHÔNG GỘP LÀM MỘT. `pending_count` là việc đang chờ
 * người duyệt bấm nút, `out_of_scope_count` là việc chưa ai bắt đầu soạn. Gộp
 * lại sẽ giấu mất chuyện cái nào đang tắc; nét lề trái — xanh cho hàng chờ, đỏ
 * cho chỗ thư viện còn thiếu — nói ra điều đó trước cả khi kịp đọc nhãn.
 *
 * BẢNG HÀNG CHỜ đọc `useEditorQueues(['pending','failed'])`, đúng khóa cache mà
 * màn hàng đợi dùng, nên mở tiếp sang đó không tốn thêm request nào. Bản mẫu
 * còn một cột "Số hiệu" dạng mono, nhưng `editorQueueItemSchema` (mục 8) không
 * trả `doc_code` cho danh sách — chỉ chi tiết một mục mới có. Thà bỏ hẳn cột đó
 * còn hơn in một giá trị thay thế trông như thật.
 *
 * GIỌNG CHỮ ở khu vực này khác hẳn luồng bệnh nhân: người đọc là dược sĩ hoặc
 * bác sĩ, dùng thẳng thuật ngữ được, không phải giải thích "vector store là gì".
 */
import { Link } from 'react-router-dom'

import { useEditorDashboard, useEditorQueues } from '../app/editor'
import { formatDate } from '../lib/datetime'
import { ORIGIN_LABEL } from '../lib/editorLabels'
import { StatusBadge } from '../ui/EditorBadges'
import { ErrorNotice } from '../ui/ErrorNotice'

/** Bản mẫu đệm số về hai chữ số (`07`, `23`) cho cột số thẳng hàng khi quét dọc. */
function padded(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Một ô của lưới `.auto-w`.
 *
 * `hint` là dòng ngữ cảnh bắt buộc: một con số trần không nói được nó đang là
 * tin tốt hay tin xấu, mà "12" ở hàng chờ duyệt với "12" ở log ngoài phạm vi là
 * hai tình huống đòi hai việc khác nhau.
 */
function MetricTile({
  to,
  value,
  label,
  hint,
  accent,
}: {
  to: string
  value: number
  label: string
  hint: string
  /** `--xanh` cho hàng chờ duyệt, `--do` cho chỗ thư viện còn thiếu. */
  accent: string
}) {
  return (
    <Link
      to={to}
      style={{
        background: 'var(--paper)',
        padding: 20,
        display: 'block',
        borderLeft: '3px solid ' + accent,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div className="lab">{label}</div>
      <div
        className="mono"
        style={{
          fontSize: 'clamp(32px,3.4vw,46px)',
          lineHeight: 1.1,
          color: accent,
          marginTop: 5,
        }}
      >
        {padded(value)}
      </div>
      <p className="lab" style={{ marginTop: 6 }}>
        {hint}
      </p>
    </Link>
  )
}

export function EditorDashboardScreen() {
  const { data, isPending, isError, error, refetch } = useEditorDashboard()

  // Hai trạng thái "còn việc phải làm" của hàng đợi. `failed` đi cùng `pending`
  // ở đây vì cả hai đều đang chờ một con người mở ra, chỉ khác nhau ở chỗ một
  // cái chờ quyết định còn một cái chờ bấm chạy lại.
  const queues = useEditorQueues(['pending', 'failed'])
  const isQueuePending = queues.some((result) => result.isPending)
  const queueFailure = queues.find((result) => result.isError)
  // Mỗi request đã sắp riêng phần của nó, nhưng nối hai mảng đã sắp lại với
  // nhau thì không còn đúng thứ tự nữa.
  const queueItems = queues
    .flatMap((result) => result.data?.items ?? [])
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 6)

  return (
    <div>
      <div className="eb">Bảng công việc · {formatDate(new Date().toISOString())}</div>

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
        <h1 style={{ fontSize: 'var(--t-h1)', lineHeight: 1.16 }}>Hôm nay cần bạn xử lý</h1>

        {/* Đường duy nhất tới màn tải tài liệu — thanh bên không có mục đó. */}
        <Link to="/editor/upload" className="btn sm">
          Tải lên tài liệu
        </Link>
      </div>

      {isPending && (
        <p role="status" className="lab" style={{ marginTop: 26 }}>
          Đang đọc số liệu…
        </p>
      )}

      {isError && (
        <div style={{ marginTop: 26 }}>
          <ErrorNotice
            error={error}
            retryLabel="Đọc lại số liệu"
            onRetry={() => void refetch()}
          />
        </div>
      )}

      {data !== undefined && (
        <div className="auto-w" style={{ marginTop: 26 }}>
          <MetricTile
            to="/editor/queue"
            value={data.pending_count}
            label="Mục chờ duyệt"
            hint="Đã soạn xong, đang đợi người duyệt quyết định."
            accent="var(--xanh)"
          />
          <MetricTile
            to="/editor/out-of-scope"
            value={data.out_of_scope_count}
            label="Câu hỏi chưa trả lời được"
            hint="Bệnh nhân đã hỏi nhưng thư viện chưa có tài liệu."
            accent="var(--do)"
          />
        </div>
      )}

      <div className="co" style={{ marginTop: 34 }}>
        <div>
          <span className="lab">Hàng chờ duyệt</span>

          {isQueuePending && (
            <p role="status" className="lab" style={{ marginTop: 12 }}>
              Đang đọc hàng chờ…
            </p>
          )}

          {queueFailure !== undefined && (
            <div style={{ marginTop: 12 }}>
              <ErrorNotice
                error={queueFailure.error}
                retryLabel="Đọc lại hàng chờ"
                onRetry={() => void queueFailure.refetch()}
              />
            </div>
          )}

          {!isQueuePending && queueFailure === undefined && queueItems.length === 0 && (
            <p style={{ marginTop: 12, fontSize: 'var(--t-note)', color: 'var(--xam)' }}>
              Lần đọc này không có mục nào đang chờ duyệt hoặc cần chạy lại index.
            </p>
          )}

          {queueItems.length > 0 && (
            <>
              <div
                className="phieu"
                style={{ marginTop: 8, borderTop: '2px solid var(--ink)', overflowX: 'auto' }}
              >
                <table>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 240 }}>Tiêu đề</th>
                      <th style={{ minWidth: 120 }}>Gửi lúc</th>
                      <th style={{ minWidth: 110 }}>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueItems.map((item) => (
                      <tr key={item.item_id}>
                        <td>
                          <Link
                            to={'/editor/queue/' + encodeURIComponent(item.item_id)}
                            style={{ color: 'var(--tim)' }}
                          >
                            {item.title}
                          </Link>
                          <div style={{ fontSize: 'var(--t-note)', color: 'var(--xam)' }}>
                            {ORIGIN_LABEL[item.origin]}
                          </div>
                        </td>
                        <td className="mono" style={{ fontSize: 'var(--t-note)' }}>
                          {formatDate(item.created_at)}
                        </td>
                        <td>
                          <StatusBadge status={item.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Link to="/editor/queue" className="btn sm gh" style={{ marginTop: 14 }}>
                Mở toàn bộ hàng đợi
              </Link>
            </>
          )}
        </div>

        <div className="phu">
          <div className="phieu" style={{ borderLeft: '3px solid var(--tim)' }}>
            <div
              className="phieu-top"
              style={{
                background: 'var(--tim-wash)',
                color: 'var(--tim)',
                borderBottomColor: 'var(--tim)',
              }}
            >
              <span>Yêu cầu phản hồi bệnh nhân</span>
            </div>
            <div style={{ padding: '16px 18px' }}>
              {data === undefined ? (
                // Hiện `0` trong lúc đang tải là nói dối: biên tập viên nhìn
                // thấy số không rồi bỏ đi làm việc khác, trong khi thật ra đang
                // có mấy chục yêu cầu chờ trả lời.
                <p className="lab">Chưa đọc được số liệu</p>
              ) : (
                <div
                  className="mono"
                  style={{
                    fontSize: 'clamp(30px,3vw,40px)',
                    color: 'var(--tim)',
                    lineHeight: 1.1,
                  }}
                >
                  {padded(data.patient_question_count)}
                </div>
              )}
              <p style={{ fontSize: 'var(--t-note)', marginTop: 8, lineHeight: 1.66 }}>
                Câu hỏi người bệnh gửi thẳng cho biên tập viên và đang chờ một
                người trả lời. Mỗi câu là một chỗ thiếu trong kho văn bản, không
                phải lỗi của người hỏi.
              </p>
              <Link
                to="/editor/patient-questions"
                className="btn sm"
                style={{ width: '100%', marginTop: 16 }}
              >
                Xem danh sách
              </Link>
            </div>
            <div className="rangcua" />
          </div>
        </div>
      </div>
    </div>
  )
}
