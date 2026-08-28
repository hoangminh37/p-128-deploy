/**
 * Thư viện nguồn của biên tập viên, đường dẫn `/editor/documents`.
 *
 * Màn này đọc registry RAG, không đọc editor queue. Vì vậy mỗi dòng ở đây là
 * một tài liệu nguồn thật và hai nhãn trạng thái trả lời hai câu khác nhau:
 *
 * - Có được phép dùng về mặt biên tập không?
 * - Đã thực sự có chunk trong Vector Store để agent truy xuất chưa?
 *
 * Giữ hai điều đó riêng giúp tránh lỗi vận hành nguy hiểm: nói "đã duyệt" rồi
 * để người biên tập hiểu nhầm tài liệu đang được dùng dù job index đã thất bại.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useEditorSourceDocuments } from '../app/editor'
import { formatDateTime } from '../lib/datetime'
import type {
  EditorSourceApprovalStatus,
  EditorSourceDocument,
  EditorSourceIndexStatus,
} from '../lib/schemas'
import { EmptyState } from '../ui/EmptyState'
import { ErrorNotice } from '../ui/ErrorNotice'
import { LibraryIcon } from '../ui/icons'

type DocumentFilter = 'all' | 'available' | 'needs_attention' | 'uploaded'

const FILTERS: readonly { id: DocumentFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'available', label: 'Đang dùng được' },
  { id: 'needs_attention', label: 'Cần xử lý' },
  { id: 'uploaded', label: 'Đã tải lên' },
]

const APPROVAL_LABEL: Record<EditorSourceApprovalStatus, string> = {
  approved: 'Đã duyệt',
  pending_review: 'Chờ duyệt',
  indexing: 'Đang index',
  index_failed: 'Index thất bại',
  draft: 'Bản nháp',
  quarantined: 'Đã từ chối',
}

const APPROVAL_TONE: Record<EditorSourceApprovalStatus, string> = {
  approved: 'bg-mint text-mint-deep',
  pending_review: 'bg-ink text-white',
  indexing: 'bg-coral text-coral-deep',
  index_failed: 'bg-alert-solid text-white',
  draft: 'bg-canvas text-slate',
  quarantined: 'bg-sand text-sand-deep',
}

const INDEX_LABEL: Record<EditorSourceIndexStatus, string> = {
  indexed: 'Đã index · agent dùng được',
  indexing: 'Đang xử lý · agent chưa dùng',
  failed: 'Index thất bại · agent chưa dùng',
  not_indexed: 'Chưa index · agent chưa dùng được',
  not_applicable: 'Chưa cần index',
  unavailable: 'Chưa xác minh được index',
}

const INDEX_TONE: Record<EditorSourceIndexStatus, string> = {
  // `mint-deep` và `alert` là màu chữ dành cho nền sáng. Trên thẻ surface ở
  // dark mode chúng bị chìm, nên mỗi trạng thái index có nền riêng với cặp chữ
  // đã đủ tương phản ở cả hai chế độ.
  indexed: 'bg-mint-deep text-mint',
  indexing: 'bg-coral-deep text-coral',
  failed: 'bg-alert-solid text-white',
  not_indexed: 'bg-alert-solid text-white',
  not_applicable: 'bg-canvas text-slate',
  unavailable: 'bg-alert-solid text-white',
}

function StatusBadge({ children, className }: { children: string; className: string }) {
  return (
    <span
      className={`font-display inline-flex items-center rounded-pill px-snug py-hair text-question font-semibold ${className}`}
    >
      {children}
    </span>
  )
}

function isAvailable(document: EditorSourceDocument): boolean {
  return document.approval_status === 'approved' && document.index_status === 'indexed'
}

function needsAttention(document: EditorSourceDocument): boolean {
  return (
    document.approval_status === 'pending_review' ||
    document.approval_status === 'indexing' ||
    document.approval_status === 'index_failed' ||
    document.approval_status === 'draft' ||
    document.index_status === 'failed' ||
    document.index_status === 'not_indexed' ||
    document.index_status === 'unavailable'
  )
}

function matchesFilter(document: EditorSourceDocument, filter: DocumentFilter): boolean {
  if (filter === 'available') return isAvailable(document)
  if (filter === 'needs_attention') return needsAttention(document)
  if (filter === 'uploaded') return document.source_origin === 'editor_upload'
  return true
}

function SourceDocumentCard({ document }: { document: EditorSourceDocument }) {
  const sourceLabel = document.source_origin === 'editor_upload' ? 'Biên tập viên tải lên' : 'Nguồn hệ thống'
  const statusDescription =
    document.index_status === 'indexed'
      ? `${document.chunk_count} đoạn đã sẵn sàng cho truy xuất.`
      : document.index_status === 'indexing'
        ? 'Đang parse, chunk, embedding và ghi vào Vector Store. Agent chưa được dùng tài liệu này.'
        : document.index_status === 'failed'
          ? 'Index chưa hoàn tất; agent không thể dùng tài liệu này cho đến khi biên tập viên chạy lại thành công.'
      : document.index_status === 'not_indexed'
        ? 'Tài liệu đã duyệt nhưng chưa có đoạn nào trong Vector Store.'
        : document.index_status === 'unavailable'
          ? 'Không đọc được Vector Store ở thời điểm này; chưa thể khẳng định agent có dùng được hay không.'
          : 'Nguồn chưa được phép đi vào bước index.'
  const canOpenFullDocument = document.source_file_available && document.viewer_type !== 'unsupported'
  const viewerDescription =
    !document.source_file_available
      ? 'Bản gốc chưa có trên máy chủ này.'
      : document.viewer_type === 'unsupported'
        ? 'Định dạng file gốc chưa có màn xem trong trình duyệt.'
        : document.viewer_type === 'pdf'
          ? 'Có thể xem toàn bộ PDF gốc.'
          : 'Có thể xem bản Markdown đã được render.'

  return (
    <li className="rounded-card bg-surface p-cozy">
      <div className="flex flex-wrap items-start justify-between gap-snug">
        <div className="min-w-0 flex-1">
          <p className="font-display text-question font-semibold text-slate">{sourceLabel}</p>
          <h2 className="mt-hair text-notice font-semibold text-body">{document.title}</h2>
        </div>

        <span className="font-mono shrink-0 rounded-pill bg-canvas px-snug py-hair text-question text-body">
          {document.document_id}
        </span>
      </div>

      <div className="mt-snug flex flex-wrap gap-tight">
        <StatusBadge className={APPROVAL_TONE[document.approval_status]}>
          {APPROVAL_LABEL[document.approval_status]}
        </StatusBadge>
        <StatusBadge className={INDEX_TONE[document.index_status]}>
          {INDEX_LABEL[document.index_status]}
        </StatusBadge>
      </div>

      <p className="font-display mt-snug text-question text-slate">{statusDescription}</p>

      {document.index_error !== null && document.index_error !== undefined && (
        <p className="font-display mt-hair rounded-card bg-sand p-snug text-question text-sand-deep">
          Lỗi index: {document.index_error}
        </p>
      )}

      <p className="font-display mt-hair text-question text-slate">{viewerDescription}</p>

      <dl className="mt-snug grid gap-snug border-t border-line pt-snug sm:grid-cols-2">
        <div>
          <dt className="font-display text-question text-slate">Cơ quan ban hành</dt>
          <dd className="font-display mt-hair text-input text-body">{document.issuer}</dd>
        </div>
        <div>
          <dt className="font-display text-question text-slate">Ngày ban hành</dt>
          <dd className="font-display mt-hair text-input text-body">{document.published}</dd>
        </div>
        <div>
          <dt className="font-display text-question text-slate">Số hiệu</dt>
          <dd className="font-mono mt-hair text-input text-body">{document.doc_code ?? 'Chưa có'}</dd>
        </div>
        <div>
          <dt className="font-display text-question text-slate">Bệnh áp dụng</dt>
          <dd className="font-display mt-hair flex flex-wrap gap-tight text-input text-body">
            {document.conditions.length > 0 ? (
              document.conditions.map((condition) => (
                <span key={condition} className="rounded-pill border-2 border-slate px-snug py-hair text-question text-slate">
                  {condition}
                </span>
              ))
            ) : (
              <span className="text-slate">Không áp dụng</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-snug flex flex-wrap items-center gap-snug">
        {document.uploaded_at !== null && (
          <p className="font-display text-question text-slate">
            Tải lên {formatDateTime(document.uploaded_at)}
          </p>
        )}
        {document.status_at !== null && (
          <p className="font-display text-question text-slate">
            {document.approval_status === 'quarantined'
              ? 'Từ chối'
              : document.approval_status === 'indexing'
                ? 'Bắt đầu index'
                : document.approval_status === 'index_failed'
                  ? 'Index lỗi'
                  : 'Duyệt'}{' '}
            {formatDateTime(document.status_at)}
          </p>
        )}
        {document.index_attempts !== undefined && document.index_attempts > 0 && (
          <p className="font-display text-question text-slate">Lần index: {document.index_attempts}</p>
        )}
        {document.url !== null && (
          <a
            href={document.url}
            target="_blank"
            rel="noreferrer"
            className="font-display ml-auto inline-flex min-h-touch items-center text-input font-semibold text-body underline underline-offset-4"
          >
            Mở nguồn gốc
          </a>
        )}
        {canOpenFullDocument && (
          <Link
            to={`/editor/documents/${encodeURIComponent(document.document_id)}`}
            className="motion-press font-display inline-flex min-h-touch items-center rounded-pill bg-mint px-cozy text-input font-semibold text-mint-deep no-underline enabled:hover:bg-mint-press"
          >
            Xem toàn văn
          </Link>
        )}
      </div>
    </li>
  )
}

export function EditorDocumentsScreen() {
  const [filter, setFilter] = useState<DocumentFilter>('all')
  const { data, isPending, isError, error, refetch } = useEditorSourceDocuments()

  const documents = (data?.documents ?? []).filter((document) => matchesFilter(document, filter))
  const allDocuments = data?.documents ?? []
  const availableCount = allDocuments.filter(isAvailable).length
  const attentionCount = allDocuments.filter(needsAttention).length
  const uploadedCount = allDocuments.filter((document) => document.source_origin === 'editor_upload').length

  return (
    <div className="max-w-reading">
      <h1 className="text-ask font-semibold text-body">Tài liệu nguồn</h1>
      <p className="mt-snug max-w-answer text-notice text-body">
        Danh sách này lấy từ thư viện RAG thực tế. “Đã duyệt” và “đã index” là hai trạng thái riêng: chỉ tài liệu có cả hai mới được agent dùng để trả lời.
      </p>

      {data !== undefined && (
        <dl className="mt-block grid gap-snug sm:grid-cols-3">
          <div className="rounded-card bg-mint p-cozy text-mint-deep">
            <dt className="font-display text-question font-semibold">Đang dùng được</dt>
            <dd className="mt-hair text-heading font-semibold">{availableCount}</dd>
          </div>
          <div className="rounded-card bg-coral p-cozy text-coral-deep">
            <dt className="font-display text-question font-semibold">Cần xử lý</dt>
            <dd className="mt-hair text-heading font-semibold">{attentionCount}</dd>
          </div>
          <div className="rounded-card bg-sand p-cozy text-sand-deep">
            <dt className="font-display text-question font-semibold">Đã tải lên</dt>
            <dd className="mt-hair text-heading font-semibold">{uploadedCount}</dd>
          </div>
        </dl>
      )}

      <div role="group" aria-label="Lọc tài liệu nguồn" className="mt-block flex flex-wrap gap-tight">
        {FILTERS.map((candidate) => {
          const selected = candidate.id === filter
          return (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilter(candidate.id)}
              className={`motion-press font-display min-h-touch rounded-pill px-cozy text-input ${
                selected
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
          Đang đọc thư viện nguồn…
        </p>
      )}

      {isError && (
        <div className="mt-block">
          <ErrorNotice error={error} retryLabel="Đọc lại thư viện" onRetry={() => void refetch()} />
        </div>
      )}

      {!isPending && !isError && documents.length === 0 && (
        <div className="mt-block">
          <EmptyState
            illustration={<LibraryIcon className="h-24 w-24 text-slate" />}
            title="Không có tài liệu ở bộ lọc này"
            body="Thử đổi bộ lọc hoặc tải lên một tài liệu nguồn mới để bắt đầu quy trình biên tập."
          />
        </div>
      )}

      {!isPending && !isError && documents.length > 0 && (
        <ul className="mt-block space-y-snug">
          {documents.map((document) => (
            <SourceDocumentCard key={document.document_id} document={document} />
          ))}
        </ul>
      )}
    </div>
  )
}
