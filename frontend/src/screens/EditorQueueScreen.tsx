/**
 * Hàng đợi duyệt, đường dẫn `/editor/queue`.
 *
 * DỰNG TỪ `id="bth"` CỦA BẢN MẪU (`docs/design/eduhealth-ai.html`): nhãn `.eb`,
 * tiêu đề `--t-h2`, một hàng nút lọc `.btn.sm`, rồi một `.phieu` bọc bảng có
 * `overflow-x` riêng và viền răng cưa `.rangcua` ở đáy.
 *
 * BỘ LỌC MẶC ĐỊNH là "Đang xử lý", gồm cả `pending` lẫn `draft`. Hai trạng thái
 * này là việc còn phải làm; `indexing` đang chạy nền và `failed` cần BTV thử
 * lại. `approved` và `rejected` là việc đã xong, xem lại được nhưng không được
 * chen vào danh sách hằng ngày.
 *
 * Hợp đồng chỉ cho lọc một trạng thái mỗi lần gọi, nên bộ lọc mặc định bắn hai
 * request rồi gộp lại ở đây — xem `useEditorQueues`.
 *
 * SỐ ĐẾM CHỈ HIỆN Ở BỘ LỌC ĐANG CHỌN. Bản mẫu vẽ cả ba nút đều có số
 * ("Đã duyệt · 41"), nhưng hai bộ lọc kia chưa được gọi nên con số của chúng là
 * số bịa. Một màn quản trị nội dung y khoa thì thà thiếu một con số còn hơn in
 * một con số không ai kiểm được.
 *
 * BẢNG BỎ HAI CỘT của bản mẫu — "Văn bản nguồn" và "Bệnh".
 * `editorQueueItemSchema` (mục 8) chỉ trả `item_id`, `title`, `origin`,
 * `topics`, `created_at`, `status`; số hiệu văn bản và danh sách bệnh chỉ có ở
 * chi tiết một mục. Cùng một luật với cột "Số hiệu" ở màn tổng quan.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useEditorQueues } from '../app/editor'
import { formatDateTime } from '../lib/datetime'
import { ORIGIN_LABEL } from '../lib/editorLabels'
import type { EditorItemStatus, EditorQueueItem } from '../lib/schemas'
import { OriginIconBox, StatusBadge, TopicTags } from '../ui/EditorBadges'
import { EmptyState } from '../ui/EmptyState'
import { DocumentStack } from '../ui/illustrations'
import { ErrorNotice } from '../ui/ErrorNotice'

type QueueFilter = {
  id: string
  label: string
  statuses: EditorItemStatus[]
  empty: string
}

/**
 * CÂU CHỮ CỦA TRẠNG THÁI RỖNG chỉ được mô tả đúng một điều mà màn này biết
 * chắc: bộ lọc đang chọn không trả về mục nào.
 *
 * Không suy ra nguyên nhân, không khẳng định gì về thư viện. Bản trước viết
 * "Hàng đợi đã sạch" — nghe như vừa duyệt xong hết, trong khi cùng một danh
 * sách rỗng cũng có thể nghĩa là chưa từng có mục nào được tạo. Hai tình huống
 * đó đòi hai hành động ngược nhau, mà giao diện thì không phân biệt được.
 *
 * Cùng một lối mở đầu "Danh sách hiện không có mục nào" cho cả ba bộ lọc: lặp
 * lại như vậy là cố ý, để người đọc nhận ra ngay đây là câu mô tả trạng thái
 * chứ không phải một nhận định về công việc.
 */
const FILTERS: readonly QueueFilter[] = [
  {
    id: 'active',
    label: 'Đang xử lý',
    statuses: ['pending', 'draft', 'indexing', 'failed'],
    empty: 'Danh sách hiện không có mục nào đang soạn, chờ duyệt, index hoặc cần thử lại.',
  },
  {
    id: 'approved',
    label: 'Đã duyệt',
    statuses: ['approved'],
    empty: 'Danh sách hiện không có mục nào đã duyệt.',
  },
  {
    id: 'rejected',
    label: 'Đã từ chối',
    statuses: ['rejected'],
    empty: 'Danh sách hiện không có mục nào bị từ chối.',
  },
]

/**
 * Một dòng của bảng: khối biểu tượng `.hopbt` bên trái, tiêu đề là liên kết,
 * thẻ chủ đề `.the-chu` xuống dòng dưới.
 *
 * Khối biểu tượng mang màu NGUỒN GỐC (đỏ cho câu hỏi bệnh nhân, vàng cho mục
 * biên tập viên tự thêm), nên quét dọc mép trái bảng là thấy ngay dòng nào có
 * người đang chờ. Nhãn nguồn gốc dạng chữ vẫn giữ, nhưng ở cỡ `--t-note` màu
 * `--xam` dưới tiêu đề: khối màu nói nhanh hơn, dòng chữ nói chắc hơn.
 */
function QueueRow({ item }: { item: EditorQueueItem }) {
  return (
    <tr>
      <td>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <OriginIconBox origin={item.origin} />
          <div style={{ minWidth: 0 }}>
            <Link
              to={'/editor/queue/' + encodeURIComponent(item.item_id)}
              style={{ color: 'var(--tim)' }}
            >
              {item.title}
            </Link>
            <div style={{ fontSize: 'var(--t-note)', color: 'var(--xam)' }}>
              {ORIGIN_LABEL[item.origin]}
            </div>
            {item.topics.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <TopicTags topics={item.topics} />
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="mono" style={{ fontSize: 'var(--t-note)' }}>
        {formatDateTime(item.created_at)}
      </td>
      <td>
        <StatusBadge status={item.status} />
      </td>
    </tr>
  )
}

export function EditorQueueScreen() {
  const [filterId, setFilterId] = useState(FILTERS[0].id)
  const filter = FILTERS.find((candidate) => candidate.id === filterId) ?? FILTERS[0]

  const results = useEditorQueues(filter.statuses)

  const isPending = results.some((result) => result.isPending)
  const failed = results.find((result) => result.isError)

  // Gộp nhiều trạng thái thì phải sắp lại: mỗi request đã sắp riêng phần của nó,
  // nhưng nối hai mảng đã sắp lại với nhau thì không còn đúng thứ tự nữa.
  const items = results
    .flatMap((result) => result.data?.items ?? [])
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))

  return (
    <div>
      <div className="eb">Chờ bạn duyệt</div>
      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 12 }}>
        Hàng đợi duyệt
      </h1>
      <p
        style={{
          fontSize: 'var(--t-note)',
          color: 'var(--xam)',
          marginTop: 12,
          maxWidth: '62ch',
        }}
      >
        Nguồn chỉ được agent dùng sau khi parse, chunk, embedding và index thành
        công. Mở một mục để duyệt, theo dõi tiến độ hoặc xem lỗi để thử lại.
      </p>

      {/* ---- Bộ lọc trạng thái ---- */}
      <div
        role="group"
        aria-label="Lọc theo trạng thái"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}
      >
        {FILTERS.map((candidate) => {
          const isActive = candidate.id === filter.id
          return (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFilterId(candidate.id)}
              // Ô đang chọn mang màu tím của bản mẫu — nền `--tim-wash`, viền
              // và chữ `--tim`. Chưa chọn thì là `.btn.gh`: viền nhạt, chữ xám.
              className={isActive ? 'btn sm' : 'btn sm gh'}
              style={
                isActive
                  ? {
                      borderColor: 'var(--tim)',
                      color: 'var(--tim)',
                      background: 'var(--tim-wash)',
                    }
                  : undefined
              }
            >
              {/* Số chỉ đi kèm bộ lọc ĐANG CHỌN, và chỉ khi cả các request của
                  nó đã về — hai bộ lọc kia chưa được gọi nên không có số thật. */}
              {isActive && !isPending && failed === undefined
                ? candidate.label + ' · ' + String(items.length).padStart(2, '0')
                : candidate.label}
            </button>
          )
        })}
      </div>

      {isPending && (
        <p role="status" className="lab" style={{ marginTop: 18 }}>
          Đang đọc hàng đợi…
        </p>
      )}

      {failed !== undefined && (
        <div style={{ marginTop: 18 }}>
          <ErrorNotice
            error={failed.error}
            retryLabel="Đọc lại hàng đợi"
            onRetry={() => void failed.refetch()}
          />
        </div>
      )}

      {!isPending && failed === undefined && items.length === 0 && (
        <div style={{ marginTop: 18 }}>
          <EmptyState
            illustration={<DocumentStack size={128} />}
            title="Không có mục nào"
            body={filter.empty}
          />
        </div>
      )}

      {items.length > 0 && (
        <div className="phieu" style={{ marginTop: 18 }}>
          <div style={{ padding: 'clamp(14px,2vw,22px)', overflowX: 'auto' }}>
            <table style={{ minWidth: 680 }}>
              <thead>
                <tr>
                  <th>Nội dung</th>
                  <th style={{ minWidth: 150 }}>Gửi lúc</th>
                  <th style={{ minWidth: 110 }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <QueueRow key={item.item_id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="rangcua" />
        </div>
      )}
    </div>
  )
}
