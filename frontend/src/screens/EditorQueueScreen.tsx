/**
 * Hàng đợi duyệt, đường dẫn `/editor/queue`.
 *
 * BỘ LỌC MẶC ĐỊNH là "Đang xử lý", gồm cả `pending` lẫn `draft`. Hai trạng thái
 * này là việc còn phải làm; `approved` và `rejected` là việc đã xong, xem lại
 * được nhưng không được chen vào danh sách hằng ngày.
 *
 * Hợp đồng chỉ cho lọc một trạng thái mỗi lần gọi, nên bộ lọc mặc định bắn hai
 * request rồi gộp lại ở đây — xem `useEditorQueues`.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useEditorQueues } from '../app/editor'
import { formatDateTime } from '../lib/datetime'
import type { EditorItemStatus, EditorQueueItem } from '../lib/schemas'
import { OriginIconBox, StatusBadge, TopicTags } from '../ui/EditorBadges'
import { EmptyState } from '../ui/EmptyState'
import { DocumentStack } from '../ui/illustrations'
import { ErrorNotice } from '../ui/ErrorNotice'
import { ChevronRightIcon } from '../ui/icons'

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
    statuses: ['pending', 'draft'],
    empty: 'Danh sách hiện không có mục nào đang soạn hoặc chờ duyệt.',
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
 * Một dòng của hàng đợi: khối biểu tượng bên trái, nội dung ở giữa, mũi tên
 * bên phải.
 *
 * Khối biểu tượng mang màu NGUỒN GỐC (coral cho câu hỏi bệnh nhân, sand cho
 * mục biên tập viên tự thêm), nên quét dọc mép trái danh sách là thấy ngay
 * dòng nào có người đang chờ. Nhãn nguồn gốc dạng chữ vì thế bỏ đi được: hai
 * thứ nói cùng một điều, mà khối màu nói nhanh hơn.
 *
 * Mũi tên KHÔNG mang thông tin — cả dòng đã là một liên kết và trình đọc màn
 * hình đọc ra điều đó — nên nó `aria-hidden`. Nó ở đây để mắt biết dòng này bấm
 * được, việc mà một thẻ trắng phẳng không tự nói ra.
 */
function QueueRow({ item }: { item: EditorQueueItem }) {
  return (
    <li>
      <Link
        to={`/editor/queue/${encodeURIComponent(item.item_id)}`}
        className="motion-lift flex min-h-touch items-start gap-snug rounded-card bg-surface p-cozy no-underline"
      >
        <OriginIconBox origin={item.origin} />

        <div className="min-w-0 flex-1">
          <p className="font-display text-notice font-semibold text-body">
            {item.title}
          </p>

          <div className="mt-snug flex flex-wrap items-center gap-tight">
            <StatusBadge status={item.status} />
          </div>

          {item.topics.length > 0 && (
            <div className="mt-snug">
              <TopicTags topics={item.topics} />
            </div>
          )}

          <p className="font-display mt-snug text-question text-slate">
            Tạo lúc {formatDateTime(item.created_at)}
          </p>
        </div>

        <ChevronRightIcon className="mt-snug h-6 w-6 shrink-0 text-slate" />
      </Link>
    </li>
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
    <div className="max-w-reading">
      <h1 className="text-ask font-semibold text-body">Hàng đợi duyệt</h1>
      <p className="mt-snug max-w-answer text-notice text-body">
        Nội dung chờ vào thư viện trích dẫn. Mở một mục để xem toàn văn, chỉnh sửa
        rồi duyệt hoặc từ chối.
      </p>

      {/* ---- Bộ lọc trạng thái ---- */}
      <div
        role="group"
        aria-label="Lọc theo trạng thái"
        className="mt-block flex flex-wrap gap-tight"
      >
        {FILTERS.map((candidate) => {
          const isActive = candidate.id === filter.id
          return (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFilterId(candidate.id)}
              // Viên thuốc đang chọn: nền ink chữ trắng (15.39:1). Chưa chọn:
              // nền trắng chữ ink (15.39:1). Hai trạng thái đảo ngược sáng tối
              // nên nhận ra được mà không cần đọc `aria-pressed`.
              className={`motion-press font-display min-h-touch rounded-pill px-cozy text-input ${
                isActive
                  ? 'bg-ink font-semibold text-white enabled:hover:bg-ink-press'
                  : 'bg-surface text-body enabled:hover:bg-canvas'
              }`}
            >
              {candidate.label}
            </button>
          )
        })}
      </div>

      {isPending && (
        <p role="status" className="font-display mt-block text-notice text-slate">
          Đang đọc hàng đợi…
        </p>
      )}

      {failed !== undefined && (
        <div className="mt-block">
          <ErrorNotice
            error={failed.error}
            retryLabel="Đọc lại hàng đợi"
            onRetry={() => void failed.refetch()}
          />
        </div>
      )}

      {!isPending && failed === undefined && items.length === 0 && (
        <div className="mt-block">
          <EmptyState
            illustration={<DocumentStack size={128} />}
            title="Không có mục nào"
            body={filter.empty}
          />
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-block space-y-snug">
          {items.map((item) => (
            <QueueRow key={item.item_id} item={item} />
          ))}
        </ul>
      )}
    </div>
  )
}
