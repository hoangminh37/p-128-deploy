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
import { OriginBadge, StatusBadge, TopicTags } from '../ui/EditorBadges'
import { ErrorNotice } from '../ui/ErrorNotice'

type QueueFilter = {
  id: string
  label: string
  statuses: EditorItemStatus[]
  empty: string
}

const FILTERS: readonly QueueFilter[] = [
  {
    id: 'active',
    label: 'Đang xử lý',
    statuses: ['pending', 'draft'],
    empty: 'Không còn mục nào chờ xử lý. Hàng đợi đã sạch.',
  },
  {
    id: 'approved',
    label: 'Đã duyệt',
    statuses: ['approved'],
    empty: 'Chưa có mục nào được duyệt.',
  },
  {
    id: 'rejected',
    label: 'Đã từ chối',
    statuses: ['rejected'],
    empty: 'Chưa có mục nào bị từ chối.',
  },
]

function QueueRow({ item }: { item: EditorQueueItem }) {
  return (
    <li>
      <Link
        to={`/editor/queue/${encodeURIComponent(item.item_id)}`}
        className="block min-h-touch rounded-lg border-2 border-border p-cozy no-underline"
      >
        <p className="font-display text-notice font-semibold text-ink">{item.title}</p>

        <div className="mt-snug flex flex-wrap items-center gap-tight">
          <OriginBadge origin={item.origin} />
          <StatusBadge status={item.status} />
        </div>

        {item.topics.length > 0 && (
          <div className="mt-snug">
            <TopicTags topics={item.topics} />
          </div>
        )}

        <p className="font-display mt-snug text-question text-moss">
          Tạo lúc {formatDateTime(item.created_at)}
        </p>
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
      <h1 className="font-display text-ask font-bold">Hàng đợi duyệt</h1>
      <p className="mt-snug max-w-answer text-notice text-ink">
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
              className={`font-display min-h-touch rounded-full border-2 px-cozy text-input ${
                isActive
                  ? 'border-medical bg-medical font-semibold text-paper'
                  : 'border-border text-ink'
              }`}
            >
              {candidate.label}
            </button>
          )
        })}
      </div>

      {isPending && (
        <p role="status" className="font-display mt-block text-notice text-moss">
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
        <p className="font-display mt-block text-notice text-moss">{filter.empty}</p>
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
