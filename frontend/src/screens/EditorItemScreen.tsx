/**
 * Duyệt chi tiết một mục, đường dẫn `/editor/queue/:itemId`.
 *
 * Đây là màn có hậu quả thật: bấm Duyệt là nội dung đi vào thư viện mà trợ lý
 * trích dẫn cho bệnh nhân, và không quay lại được. Nên màn này ưu tiên cho người
 * duyệt ĐỌC KỸ trước khi bấm: toàn văn nội dung, xuất xứ, và bệnh áp dụng đều
 * nằm cùng một trang, không giấu sau tab hay accordion nào.
 *
 * CHẶN DUYỆT KHI CHƯA GẮN BỆNH là ràng buộc quan trọng nhất ở đây. Trợ lý chỉ
 * tra tài liệu theo bệnh trong hồ sơ bệnh nhân, nên một mục đã duyệt mà không
 * gắn bệnh nào sẽ nằm trong thư viện và không bao giờ được lấy ra — hỏng âm
 * thầm, không báo lỗi, không ai biết cho tới khi có người đi dò. Schema ở
 * `lib/schemas.ts` cũng canh đúng luật này ở tầng dữ liệu.
 */
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useEditorQueueItem, useInvalidateEditorData } from '../app/editor'
import { approveEditorQueueItem, rejectEditorQueueItem, retryEditorSourceIndex } from '../lib/api'
import { CONDITION_LABEL } from '../lib/conditions'
import { formatDateTime } from '../lib/datetime'
import { STATUS_LABEL } from '../lib/editorLabels'
import type { EditorQueueItemDetail } from '../lib/schemas'
import { OriginBadge, StatusBadge, TopicTags } from '../ui/EditorBadges'
import { ErrorNotice } from '../ui/ErrorNotice'

const FIELD_LABEL_CLASS = 'font-display block text-input font-semibold text-body'

/** Ô soạn thảo. Viền `slate` (4.96:1 trên trắng) cho ngưỡng 3:1 của WCAG
 * 1.4.11 — `line` KHÔNG dùng được ở đây, xem cảnh báo trong `index.css`. */
const FIELD_TEXTAREA_CLASS =
  'font-body mt-snug w-full rounded-card border-2 border-slate bg-surface p-snug text-body'

/** Một dòng siêu dữ liệu. Nhãn và giá trị xếp dọc để không vỡ trên màn hẹp. */
function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pt-snug">
      <dt className="font-display text-question text-slate">{label}</dt>
      <dd className="font-display mt-hair text-input text-body">{children}</dd>
    </div>
  )
}

function ItemForm({ item, onChanged }: { item: EditorQueueItemDetail; onChanged: () => void }) {
  const navigate = useNavigate()
  const invalidateEditorData = useInvalidateEditorData()

  const [content, setContent] = useState(item.content)
  const [note, setNote] = useState('')
  const [isRejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  const isSourceUpload = item.origin === 'editor_upload'
  const isIndexing = item.status === 'indexing'
  const isFailed = item.status === 'failed'

  function returnToQueue(): void {
    invalidateEditorData()
    void navigate('/editor/queue', { replace: true })
  }

  function refreshSourceJob(): void {
    invalidateEditorData()
    onChanged()
  }

  const approve = useMutation({
    mutationFn: () =>
      approveEditorQueueItem(item.item_id, {
        content,
        note: note.trim() === '' ? null : note.trim(),
      }),
    onSuccess: isSourceUpload ? refreshSourceJob : returnToQueue,
  })

  const reject = useMutation({
    mutationFn: () => rejectEditorQueueItem(item.item_id, { reason }),
    onSuccess: isSourceUpload ? refreshSourceJob : returnToQueue,
  })

  const retryIndex = useMutation({
    mutationFn: () => retryEditorSourceIndex(item.item_id),
    onSuccess: refreshSourceJob,
  })

  const isSettled = item.status === 'approved' || item.status === 'rejected'
  const hasConditions = item.conditions.length > 0
  const isBusy = approve.isPending || reject.isPending || retryIndex.isPending
  const canApprove = hasConditions && !isBusy && !isIndexing && !isFailed
  const canSendRejection = reason.trim() !== '' && !isBusy

  return (
    <div className="max-w-reading">
      <Link
        to="/editor/queue"
        className="font-display inline-flex min-h-touch items-center text-input font-semibold text-body underline underline-offset-4"
      >
        Về hàng đợi
      </Link>

      <h1 className="mt-snug text-ask font-semibold text-body">{item.title}</h1>

      <div className="mt-snug flex flex-wrap items-center gap-tight">
        <OriginBadge origin={item.origin} />
        <StatusBadge status={item.status} />
        {/* Số hiệu văn bản là một viên thuốc đứng cạnh nhãn chủ đề, không phải
            một dòng chữ mono lọt thỏm trong bảng siêu dữ liệu bên dưới. Đây là
            thứ người duyệt đối chiếu với bản gốc, nên nó phải nằm trong tầm mắt
            cùng lúc với tên mục. */}
        {item.doc_code !== null && (
          <span className="font-mono rounded-pill bg-canvas px-snug py-hair text-question text-body">
            {item.doc_code}
          </span>
        )}
      </div>

      {item.topics.length > 0 && (
        <div className="mt-snug">
          <TopicTags topics={item.topics} />
        </div>
      )}

      {/* ---- Siêu dữ liệu ---- */}
      <dl className="mt-block space-y-snug">
        <MetaRow label="Tài liệu nguồn">
          {item.source_url !== null ? (
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer"
              className="font-display inline-flex min-h-touch items-center break-all text-body underline underline-offset-4"
            >
              {item.source_url}
            </a>
          ) : (
            <span className="text-slate">Chưa có</span>
          )}
        </MetaRow>

        <MetaRow label="Cơ quan ban hành">
          {item.issuer ?? <span className="text-slate">Chưa có</span>}
        </MetaRow>

        <MetaRow label="Số hiệu văn bản">
          {item.doc_code !== null ? (
            <span className="font-mono">{item.doc_code}</span>
          ) : (
            <span className="text-slate">Chưa có</span>
          )}
        </MetaRow>

        <MetaRow label="Thẻ chủ đề">
          {item.topics.length > 0 ? (
            <TopicTags topics={item.topics} />
          ) : (
            <span className="text-slate">Chưa gắn thẻ nào</span>
          )}
        </MetaRow>

        <MetaRow label="Bệnh áp dụng">
          {hasConditions ? (
            item.conditions.map((condition) => CONDITION_LABEL[condition]).join(' · ')
          ) : (
            <span className="text-alert">Chưa gắn bệnh nào</span>
          )}
        </MetaRow>

        <MetaRow label="Tạo lúc">{formatDateTime(item.created_at)}</MetaRow>
      </dl>

      {isSourceUpload && (
        <div className="mt-block rounded-card bg-canvas p-cozy">
          <p className="font-display text-input font-semibold text-body">Tiến độ đưa vào RAG</p>
          {isIndexing && (
            <p role="status" className="font-display mt-hair text-question text-slate">
              Đang parse, chunk, embedding và ghi vào Vector Store. Agent chưa thể dùng tài liệu này; trang sẽ tự cập nhật.
            </p>
          )}
          {isFailed && (
            <>
              <p className="font-display mt-hair text-question text-alert">
                Index chưa hoàn tất nên agent không thể dùng tài liệu này.
              </p>
              {item.source_index_error !== null && item.source_index_error !== undefined && (
                <p className="font-display mt-snug rounded-card bg-sand p-snug text-question text-sand-deep">
                  Lỗi: {item.source_index_error}
                </p>
              )}
              {item.index_attempts !== null && item.index_attempts !== undefined && (
                <p className="font-display mt-snug text-question text-slate">
                  Đã chạy {item.index_attempts} lần.
                </p>
              )}
            </>
          )}
          {item.status === 'approved' && (
            <p className="font-display mt-hair text-question text-mint-deep">
              {item.indexed_chunk_count ?? 0} đoạn đã index thành công. Agent có thể truy xuất tài liệu này.
            </p>
          )}
          {item.status === 'pending' && (
            <p className="font-display mt-hair text-question text-slate">
              Tài liệu vẫn tách khỏi RAG cho đến khi bạn duyệt và index hoàn tất.
            </p>
          )}
        </div>
      )}

      {/* ---- Kết quả đã chốt, nếu có ---- */}
      {isSettled && (
        <div className="mt-block rounded-card bg-surface p-cozy">
          <p className="font-display text-input font-semibold text-body">
            Mục này đã {STATUS_LABEL[item.status].toLowerCase()}
          </p>
          <p className="font-display mt-hair text-question text-slate">
            {item.reviewed_at !== null && `Xử lý lúc ${formatDateTime(item.reviewed_at)}. `}
            {item.reviewed_by !== null && `Người xử lý: ${item.reviewed_by}.`}
          </p>
          {item.review_note !== null && (
            <p className="mt-snug text-notice text-body">{item.review_note}</p>
          )}
          {item.reject_reason !== null && (
            <p className="mt-snug text-notice text-body">{item.reject_reason}</p>
          )}
        </div>
      )}

      {/* ---- Nội dung hoặc file nguồn ---- */}
      {isSourceUpload ? (
        <div className="mt-block">
          <p className={FIELD_LABEL_CLASS}>Nội dung tài liệu nguồn</p>
          <p className="font-display mt-hair text-question text-slate">
            RAG luôn parse từ file gốc đã tải lên, không dùng ô nội dung rỗng hay bản sao rút gọn trong hàng đợi.
          </p>
          <Link
            to={`/editor/documents/${encodeURIComponent(item.item_id)}`}
            className="font-display mt-snug inline-flex min-h-touch items-center text-input font-semibold text-body underline underline-offset-4"
          >
            Mở toàn văn tài liệu
          </Link>
        </div>
      ) : (
        <div className="mt-block">
          <label htmlFor="content" className={FIELD_LABEL_CLASS}>
            Nội dung
          </label>
          <p id="content-hint" className="font-display mt-hair text-question text-slate">
            Sửa trực tiếp ở đây trước khi duyệt. Đây chính là đoạn văn bệnh nhân sẽ đọc, nên viết câu ngắn và tránh thuật ngữ không giải thích.
          </p>
          <textarea
            id="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={12}
            disabled={isSettled}
            aria-describedby="content-hint"
            className={`${FIELD_TEXTAREA_CLASS} text-notice disabled:text-slate`}
          />
        </div>
      )}

      {!isSettled && !isIndexing && (
        <>
          {/* ---- Ghi chú của người duyệt ---- */}
          <div className="mt-block">
            <label htmlFor="note" className={FIELD_LABEL_CLASS}>
              Ghi chú của người duyệt
            </label>
            <p id="note-hint" className="font-display mt-hair text-question text-slate">
              Không bắt buộc. Ghi lại đã sửa gì so với bản gốc, để lần rà soát sau
              không phải đối chiếu lại từ đầu.
            </p>
            <textarea
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              aria-describedby="note-hint"
              className={`${FIELD_TEXTAREA_CLASS} text-input`}
            />
          </div>

          {/* ---- Chặn duyệt khi chưa gắn bệnh ---- */}
          {!hasConditions && (
            <p
              id="approve-blocked"
              role="alert"
              className="font-display mt-block rounded-card border-2 border-l-8 border-alert bg-surface p-cozy text-notice text-body"
            >
              Chưa gắn bệnh nào nên không duyệt được. Trợ lý chỉ tra tài liệu theo
              bệnh trong hồ sơ bệnh nhân, nên nội dung không gắn bệnh sẽ nằm trong
              thư viện mà không bao giờ được lấy ra.
            </p>
          )}

          {(approve.isError || reject.isError || retryIndex.isError) && (
            <div className="mt-block">
              <ErrorNotice
                error={approve.error ?? reject.error ?? retryIndex.error}
                retryLabel="Thử lại"
                onRetry={() => {
                  if (approve.isError) approve.mutate()
                  else if (reject.isError) reject.mutate()
                  else retryIndex.mutate()
                }}
              />
            </div>
          )}

          {/* ---- Hai nút hành động ----
              Nút Duyệt bị chặn dùng `aria-disabled` chứ không dùng `disabled`:
              nút `disabled` bị bàn phím bỏ qua hoàn toàn, nên người dùng bàn phím
              sẽ không bao giờ nghe được dòng giải thích vì sao nó chưa bấm được. */}
          <div className="mt-block flex flex-wrap gap-snug">
            {isFailed && isSourceUpload ? (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => retryIndex.mutate()}
                className="motion-press font-display min-h-call flex-1 rounded-pill bg-mint px-cozy text-input font-bold text-mint-deep enabled:hover:bg-mint-press disabled:bg-canvas disabled:font-normal disabled:text-slate"
              >
                {retryIndex.isPending ? 'Đang bắt đầu lại…' : 'Thử lại index'}
              </button>
            ) : (
            <button
              type="button"
              aria-disabled={!canApprove}
              aria-describedby={hasConditions ? undefined : 'approve-blocked'}
              onClick={() => {
                if (!canApprove) return
                approve.mutate()
              }}
              // Nền mint chữ mint-deep (6.72:1). Trạng thái bị chặn KHÔNG dùng
              // `disabled` (xem ghi chú ngay trên) nên nó phải tự nói bằng hình:
              // nền canvas, viền đứt, chữ slate (4.58:1) — vẫn đọc được, vẫn
              // Tab tới được, nhưng nhìn ra ngay là chưa bấm được.
              className={`motion-press font-display min-h-call flex-1 rounded-pill px-cozy text-input font-bold ${
                canApprove
                  ? 'bg-mint text-mint-deep hover:bg-mint-press'
                  : 'cursor-not-allowed border-2 border-dashed border-slate bg-canvas font-normal text-slate'
              }`}
            >
              {approve.isPending
                ? 'Đang bắt đầu index…'
                : isSourceUpload
                  ? 'Duyệt và bắt đầu index'
                  : 'Duyệt'}
            </button>
            )}

            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="motion-press font-display min-h-call flex-1 rounded-pill bg-surface px-cozy text-input font-semibold text-body enabled:hover:bg-canvas"
            >
              Từ chối
            </button>
          </div>

          {/* ---- Ô lý do, chỉ hiện khi đã bấm Từ chối ---- */}
          {isRejecting && (
            <div className="mt-block rounded-card bg-sand p-cozy">
              <label
                htmlFor="reason"
                className="font-display block text-input font-semibold text-sand-deep"
              >
                Lý do từ chối
              </label>
              <p id="reason-hint" className="font-display mt-hair text-question text-sand-deep">
                Bắt buộc. Không ghi lý do thì người sau lại soạn đúng nội dung này
                lần nữa, và cả vòng duyệt lặp lại từ đầu.
              </p>
              <textarea
                id="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                autoFocus
                aria-describedby="reason-hint"
                className={`${FIELD_TEXTAREA_CLASS} text-input`}
              />

              <div className="mt-snug flex flex-wrap gap-snug">
                <button
                  type="button"
                  aria-disabled={!canSendRejection}
                  aria-describedby="reason-hint"
                  onClick={() => {
                    if (!canSendRejection) return
                    reject.mutate()
                  }}
                  className={`motion-press font-display min-h-touch flex-1 rounded-pill px-cozy text-input font-bold ${
                    canSendRejection
                      ? 'bg-sand-deep text-sand hover:bg-sand-deep-press'
                      : 'cursor-not-allowed border-2 border-dashed border-sand-deep bg-sand font-normal text-sand-deep'
                  }`}
                >
                  {reject.isPending ? 'Đang gửi…' : 'Gửi từ chối'}
                </button>

                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  className="motion-press font-display min-h-touch rounded-pill bg-surface px-cozy text-input font-semibold text-body enabled:hover:bg-canvas"
                >
                  Huỷ
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function EditorItemScreen() {
  const { itemId } = useParams()
  const { data, isPending, isError, error, refetch } = useEditorQueueItem(itemId ?? '')

  useEffect(() => {
    if (data?.status !== 'indexing') return undefined
    const timer = window.setTimeout(() => void refetch(), 2_000)
    return () => window.clearTimeout(timer)
  }, [data?.status, refetch])

  if (isPending) {
    return (
      <p
        role="status"
        className="font-display mx-auto max-w-answer text-notice text-slate"
      >
        Đang mở mục…
      </p>
    )
  }

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-answer">
        <ErrorNotice
          error={error}
          retryLabel="Mở lại mục"
          onRetry={() => void refetch()}
        />
      </div>
    )
  }

  // `key` để đổi sang mục khác là dựng lại form từ đầu. Không có nó thì nội dung
  // đang sửa dở của mục trước sẽ dính sang mục sau.
  return <ItemForm key={data.item_id} item={data} onChanged={() => void refetch()} />
}
