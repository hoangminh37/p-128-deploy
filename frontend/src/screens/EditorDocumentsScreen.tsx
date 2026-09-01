/**
 * Thư viện nguồn của biên tập viên, đường dẫn `/editor/documents`.
 *
 * CHÉP TỪ `id="btv"` của bản mẫu: nhãn `.eb` "Thư viện nguồn", tiêu đề, một
 * đoạn dẫn giải thích hai nhãn, rồi một `.phieu` chứa đúng một BẢNG bốn cột —
 * Số hiệu · Tên văn bản · Duyệt · Thư viện tra cứu — và dải `.rangcua` khép lại.
 *
 * Màn này đọc registry RAG, không đọc editor queue. Vì vậy mỗi dòng ở đây là
 * một tài liệu nguồn thật và hai cột trạng thái trả lời hai câu khác nhau:
 *
 * - Có được phép dùng về mặt biên tập không?  (cột "Duyệt")
 * - Đã thực sự có chunk trong Vector Store để agent truy xuất chưa?  (cột
 *   "Thư viện tra cứu")
 *
 * Giữ hai điều đó riêng giúp tránh lỗi vận hành nguy hiểm: nói "đã duyệt" rồi
 * để người biên tập hiểu nhầm tài liệu đang được dùng dù job index đã thất bại.
 *
 * BẢNG CHỈ MANG BỐN CỘT ẤY. Cơ quan ban hành, năm ban hành, bệnh áp dụng và
 * người duyệt nằm ở cột phụ "Thông tin văn bản" của màn đọc toàn văn (`id="btd"`,
 * tức `/editor/documents/:documentId`) — bản mẫu cố ý để danh sách gọn để quét
 * mắt và dồn siêu dữ liệu về màn chi tiết. Hai thứ KHÔNG được giấu đi vì chúng
 * đổi hành động của người trực: câu lỗi index, và lý do một dòng không mở được
 * bản gốc. Cả hai đứng thành dòng phụ ngay trong ô của mình.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useEditorSourceDocuments } from '../app/editor'
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

/**
 * SÁU BẬC TRẠNG THÁI BIÊN TẬP, ánh xạ sang đúng năm biến thể `.chip` của bản
 * mẫu — cùng bảng với `ui/EditorBadges.tsx`, để "Chờ duyệt" ở đây và "Chờ
 * duyệt" ở hàng đợi không bao giờ là hai màu khác nhau.
 *
 *   Đã duyệt       `.duyet`  xanh công vụ — kết luận có
 *   Chờ duyệt      `.cho`    tím — đang chờ một CON NGƯỜI
 *   Đang index     `.idx`    hổ phách — đang chờ một CÁI MÁY
 *   Index thất bại `.loi`    đỏ nhạt có viền — nhãn lỗi, phải chạy lại
 *   Bản nháp       `.nhap`   xám viền nhạt
 *   Đã từ chối     `.nhap.chip-dong` — một kết luận ĐÓNG LẠI
 *
 * "Đang index" KHÔNG dùng chung màu với "Chờ duyệt", dù cả hai đều là "chưa
 * xong". Khác nhau ở chỗ AI còn việc: "Chờ duyệt" nghĩa là biên tập viên phải
 * mở ra đọc; "Đang index" nghĩa là biên tập viên không làm gì được, chỉ chờ
 * job chạy. Trộn hai màu này lại là bắt người trực hàng đợi mở nhầm vài chục
 * lần một ca.
 */
const APPROVAL_CHIP: Record<EditorSourceApprovalStatus, string> = {
  approved: 'duyet',
  pending_review: 'cho',
  indexing: 'idx',
  index_failed: 'loi',
  draft: 'nhap',
  quarantined: 'nhap chip-dong',
}

/**
 * Cột thứ hai trả lời câu hỏi khác hẳn: "agent đã thật sự dùng được tài liệu
 * này chưa?". Bản mẫu viết cột này bằng đúng hai chữ — "Đã đưa vào" và "Đang
 * đưa vào" — nên bốn bậc còn lại giữ nguyên lối nói đó.
 *
 * `failed` là NHÃN LỖI, giữ `.loi`. `not_indexed` và `unavailable` KHÔNG phải
 * lỗi — chưa vào chỉ mục, hoặc chưa xác minh được — nên chúng đứng ở `.nhap`
 * xám chứ không mượn màu đỏ. Đỏ chỉ dành cho lỗi thật; nếu nó xuất hiện ở chỗ
 * không có gì hỏng thì lần nó thật sự cần thiết sẽ không ai nhìn.
 */
const INDEX_LABEL: Record<EditorSourceIndexStatus, string> = {
  indexed: 'Đã đưa vào',
  indexing: 'Đang đưa vào',
  failed: 'Không đưa vào được',
  not_indexed: 'Chưa đưa vào',
  not_applicable: 'Chưa cần đưa vào',
  unavailable: 'Chưa xác minh được',
}

const INDEX_CHIP: Record<EditorSourceIndexStatus, string> = {
  indexed: 'duyet',
  indexing: 'idx',
  failed: 'loi',
  not_indexed: 'nhap',
  not_applicable: 'nhap',
  unavailable: 'nhap',
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

/**
 * Một dòng của bảng.
 *
 * Ô "Số hiệu" của bản mẫu là một liên kết mono màu tím mở màn đọc toàn văn.
 * Ở đây nó CHỈ là liên kết khi bản gốc thật sự mở được; không mở được thì nó
 * là chữ thường cộng một dòng `.lab` nói vì sao — người trực không phải bấm
 * vào mới biết.
 */
function DocumentRow({ document }: { document: EditorSourceDocument }) {
  const code = document.doc_code ?? document.document_id
  const canOpen = document.source_file_available && document.viewer_type !== 'unsupported'
  const blockedReason = !document.source_file_available
    ? 'Chưa có bản gốc trên máy chủ'
    : document.viewer_type === 'unsupported'
      ? 'Định dạng chưa có màn xem'
      : null

  return (
    <tr>
      <td className="mono">
        {canOpen ? (
          <Link
            to={`/editor/documents/${encodeURIComponent(document.document_id)}`}
            style={{ color: 'var(--tim)' }}
          >
            {code}
          </Link>
        ) : (
          <span style={{ color: 'var(--xam)' }}>{code}</span>
        )}
        {blockedReason !== null && (
          <span className="lab" style={{ display: 'block', marginTop: 4 }}>
            {blockedReason}
          </span>
        )}
      </td>

      <td>
        {document.title}
        {document.source_origin === 'editor_upload' && (
          <span className="lab" style={{ display: 'block', marginTop: 4 }}>
            Biên tập viên tải lên
          </span>
        )}
        {/* Câu lỗi index đứng nguyên văn ngay dưới tên: nó là thứ DUY NHẤT nói
            được vì sao job hỏng, và người trực cần nó để quyết định chạy lại
            hay sửa nguồn. */}
        {document.index_error !== null && document.index_error !== undefined && (
          <span
            style={{
              display: 'block',
              marginTop: 6,
              fontSize: 'var(--t-note)',
              color: 'var(--do)',
            }}
          >
            Lỗi index: {document.index_error}
          </span>
        )}
      </td>

      <td>
        <span className={`chip ${APPROVAL_CHIP[document.approval_status]}`}>
          {APPROVAL_LABEL[document.approval_status]}
        </span>
      </td>

      <td>
        <span className={`chip ${INDEX_CHIP[document.index_status]}`}>
          {INDEX_LABEL[document.index_status]}
        </span>
        {document.index_status === 'indexed' && document.chunk_count !== null && (
          <span className="lab" style={{ display: 'block', marginTop: 4 }}>
            {document.chunk_count} đoạn
          </span>
        )}
      </td>
    </tr>
  )
}

export function EditorDocumentsScreen() {
  const [filter, setFilter] = useState<DocumentFilter>('all')
  const { data, isPending, isError, error, refetch } = useEditorSourceDocuments()

  const allDocuments = data?.documents ?? []
  const documents = allDocuments.filter((document) => matchesFilter(document, filter))
  const availableCount = allDocuments.filter(isAvailable).length
  const attentionCount = allDocuments.filter(needsAttention).length
  const uploadedCount = allDocuments.filter((document) => document.source_origin === 'editor_upload').length

  return (
    <div>
      <div className="eb">Thư viện nguồn</div>

      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 12 }}>Văn bản nguồn</h1>

      <p
        style={{
          fontSize: 'var(--t-note)',
          color: 'var(--xam)',
          marginTop: 12,
          maxWidth: '62ch',
        }}
      >
        Hai nhãn tách biệt. Đã duyệt nghĩa là biên tập viên đã đọc và chấp nhận. Đã đưa vào thư
        viện tra cứu nghĩa là trợ lý dẫn được văn bản này.
      </p>

      {data !== undefined && (
        <p className="lab" style={{ marginTop: 14 }}>
          Đang dùng được {availableCount} · Cần xử lý {attentionCount} · Đã tải lên {uploadedCount}
        </p>
      )}

      {/* Bộ lọc: `.btn.sm` trung tính, cái đang chọn lên `.pri`. Bản mẫu không
          vẽ bộ lọc cho màn này, nhưng bốn nút này là chức năng sẵn có của màn
          và chúng nói bằng đúng nhịp nút của bản mẫu. */}
      <div
        role="group"
        aria-label="Lọc tài liệu nguồn"
        style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 16 }}
      >
        {FILTERS.map((candidate) => {
          const selected = candidate.id === filter
          return (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilter(candidate.id)}
              className={selected ? 'btn sm pri' : 'btn sm gh'}
            >
              {candidate.label}
            </button>
          )
        })}
      </div>

      {isPending && (
        <p role="status" className="lab" style={{ marginTop: 22 }}>
          Đang đọc thư viện nguồn…
        </p>
      )}

      {isError && (
        <div style={{ marginTop: 22 }}>
          <ErrorNotice error={error} retryLabel="Đọc lại thư viện" onRetry={() => void refetch()} />
        </div>
      )}

      {!isPending && !isError && documents.length === 0 && (
        <div style={{ marginTop: 22 }}>
          <EmptyState
            illustration={<LibraryIcon className="h-24 w-24 text-slate" />}
            title="Không có tài liệu ở bộ lọc này"
            body="Thử đổi bộ lọc hoặc tải lên một tài liệu nguồn mới để bắt đầu quy trình biên tập."
          />
        </div>
      )}

      {!isPending && !isError && documents.length > 0 && (
        <div className="phieu" style={{ marginTop: 22 }}>
          <div style={{ padding: 'clamp(14px,2vw,22px)', overflowX: 'auto' }}>
            <table style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Số hiệu</th>
                  <th>Tên văn bản</th>
                  <th>Duyệt</th>
                  <th>Thư viện tra cứu</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <DocumentRow key={document.document_id} document={document} />
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
