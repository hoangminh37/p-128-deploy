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

import { useEditorConditions, useEditorQueueItem, useInvalidateEditorData } from '../app/editor'
import { approveEditorQueueItem, rejectEditorQueueItem, retryEditorSourceIndex, updateEditorQueueDraft } from '../lib/api'
import { conditionLabel } from '../lib/conditions'
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

const FIELD_INPUT_CLASS =
  'font-body mt-snug w-full rounded-card border-2 border-slate bg-surface px-snug py-tight text-input text-body'

function normalizedTopics(value: string): string[] {
  const topics: string[] = []
  for (const rawTopic of value.split(',')) {
    const topic = rawTopic.trim()
    if (topic !== '' && !topics.includes(topic)) topics.push(topic)
  }
  return topics
}

function optionalValue(value: string): string | null {
  const normalized = value.trim()
  return normalized === '' ? null : normalized
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

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
  const conditionsQuery = useEditorConditions()

  const [title, setTitle] = useState(item.title)
  const [content, setContent] = useState(item.content)
  const [topicsInput, setTopicsInput] = useState(item.topics.join(', '))
  const [conditions, setConditions] = useState(item.conditions)
  const [sourceUrl, setSourceUrl] = useState(item.source_url ?? '')
  const [issuer, setIssuer] = useState(item.issuer ?? '')
  const [docCode, setDocCode] = useState(item.doc_code ?? '')
  const [note, setNote] = useState('')
  const [isRejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  const isSourceUpload = item.origin === 'editor_upload'
  const isDraft = item.status === 'draft'
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

  const saveDraft = useMutation({
    mutationFn: () => updateEditorQueueDraft(item.item_id, {
      title,
      content,
      topics: normalizedTopics(topicsInput),
      conditions,
      source_url: optionalValue(sourceUrl),
      issuer: optionalValue(issuer),
      doc_code: optionalValue(docCode),
    }),
    onSuccess: (updated) => {
      // The API trims/deduplicates these fields. Adopt its canonical result so
      // the form immediately knows this working copy has been saved.
      setTitle(updated.title)
      setContent(updated.content)
      setTopicsInput(updated.topics.join(', '))
      setConditions(updated.conditions)
      setSourceUrl(updated.source_url ?? '')
      setIssuer(updated.issuer ?? '')
      setDocCode(updated.doc_code ?? '')
      onChanged()
    },
  })

  const isSettled = item.status === 'approved' || item.status === 'rejected'
  const hasConditions = conditions.length > 0
  const availableConditions = (conditionsQuery.data?.conditions ?? []).filter(
    (condition) => condition.status === 'active' || conditions.includes(condition.condition_id),
  )
  const draftHasUnsavedChanges = isDraft && (
    title.trim() !== item.title ||
    content !== item.content ||
    !sameValues(normalizedTopics(topicsInput), item.topics) ||
    !sameValues(conditions, item.conditions) ||
    optionalValue(sourceUrl) !== item.source_url ||
    optionalValue(issuer) !== item.issuer ||
    optionalValue(docCode) !== item.doc_code
  )
  const isBusy = approve.isPending || reject.isPending || retryIndex.isPending || saveDraft.isPending
  const canApprove = hasConditions &&
    (item.origin !== 'question_log' || content.trim() !== '') &&
    !draftHasUnsavedChanges &&
    !isBusy &&
    !isIndexing &&
    !isFailed
  const canSendRejection = reason.trim() !== '' && !isBusy

  return (
    <div className="max-w-reading">
      <Link
        to="/editor/queue"
        className="font-display inline-flex min-h-touch items-center text-input font-semibold text-body underline underline-offset-4"
      >
        Về hàng đợi
      </Link>

      <h1 className="mt-snug text-ask font-semibold text-body">
        {isDraft ? 'Soạn bản nháp' : item.title}
      </h1>

      <div className="mt-snug flex flex-wrap items-center gap-tight">
        <OriginBadge origin={item.origin} />
        <StatusBadge status={item.status} />
        {/* Số hiệu văn bản là một viên thuốc đứng cạnh nhãn chủ đề, không phải
            một dòng chữ mono lọt thỏm trong bảng siêu dữ liệu bên dưới. Đây là
            thứ người duyệt đối chiếu với bản gốc, nên nó phải nằm trong tầm mắt
            cùng lúc với tên mục. */}
        {(isDraft ? optionalValue(docCode) : item.doc_code) !== null && (
          <span className="font-mono rounded-pill bg-canvas px-snug py-hair text-question text-body">
            {isDraft ? optionalValue(docCode) : item.doc_code}
          </span>
        )}
      </div>

      {(isDraft ? normalizedTopics(topicsInput) : item.topics).length > 0 && (
        <div className="mt-snug">
          <TopicTags topics={isDraft ? normalizedTopics(topicsInput) : item.topics} />
        </div>
      )}

      {/* ---- Siêu dữ liệu ---- */}
      <dl className="mt-block space-y-snug">
        <MetaRow label="Tài liệu nguồn">
          {isDraft ? (
            <input
              type="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="Dán liên kết tài liệu nguồn"
              aria-label="Tài liệu nguồn"
              maxLength={2_000}
              className={FIELD_INPUT_CLASS}
            />
          ) : item.source_url !== null ? (
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
          {isDraft ? (
            <input
              value={issuer}
              onChange={(event) => setIssuer(event.target.value)}
              placeholder="Ví dụ: Bộ Y tế"
              aria-label="Cơ quan ban hành"
              maxLength={240}
              className={FIELD_INPUT_CLASS}
            />
          ) : item.issuer ?? <span className="text-slate">Chưa có</span>}
        </MetaRow>

        <MetaRow label="Số hiệu văn bản">
          {isDraft ? (
            <input
              value={docCode}
              onChange={(event) => setDocCode(event.target.value)}
              placeholder="Ví dụ: 5481/QĐ-BYT"
              aria-label="Số hiệu văn bản"
              maxLength={120}
              className={`${FIELD_INPUT_CLASS} font-mono`}
            />
          ) : item.doc_code !== null ? (
            <span className="font-mono">{item.doc_code}</span>
          ) : (
            <span className="text-slate">Chưa có</span>
          )}
        </MetaRow>

        <MetaRow label="Thẻ chủ đề">
          {isDraft ? (
            <>
              <input
                value={topicsInput}
                onChange={(event) => setTopicsInput(event.target.value)}
                placeholder="Ví dụ: huyết áp, tự theo dõi"
                aria-label="Thẻ chủ đề"
                className={FIELD_INPUT_CLASS}
              />
              <p className="font-display mt-hair text-question text-slate">Ngăn cách các thẻ bằng dấu phẩy.</p>
            </>
          ) : item.topics.length > 0 ? (
            <TopicTags topics={item.topics} />
          ) : (
            <span className="text-slate">Chưa gắn thẻ nào</span>
          )}
        </MetaRow>

        <MetaRow label="Bệnh áp dụng">
          {isDraft ? (
            <fieldset>
              <legend className="sr-only">Bệnh áp dụng</legend>
              <p className="font-display text-question text-slate">
                Chọn ít nhất một bệnh trước khi duyệt.
              </p>
              {conditionsQuery.isPending && <p role="status" className="font-display mt-snug text-question text-slate">Đang đọc danh mục bệnh…</p>}
              {conditionsQuery.isError && <div className="mt-snug"><ErrorNotice error={conditionsQuery.error} retryLabel="Đọc lại danh mục bệnh" onRetry={() => void conditionsQuery.refetch()} /></div>}
              {!conditionsQuery.isPending && !conditionsQuery.isError && availableConditions.length === 0 && (
                <p className="font-display mt-snug text-question text-alert">Danh mục hiện chưa có bệnh đang hoạt động để gắn vào bản nháp.</p>
              )}
              {availableConditions.length > 0 && (
                <div className="mt-snug grid gap-tight sm:grid-cols-2">
                  {availableConditions.map((condition) => {
                    const checked = conditions.includes(condition.condition_id)
                    return (
                      <label key={condition.condition_id} className="font-display flex min-h-touch cursor-pointer items-center gap-tight rounded-card border-2 border-slate bg-surface px-snug py-tight text-question text-body has-[:checked]:border-mint has-[:checked]:bg-mint/15">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setConditions((current) => checked
                            ? current.filter((conditionId) => conditionId !== condition.condition_id)
                            : [...current, condition.condition_id])}
                          className="h-5 w-5 shrink-0 accent-ink"
                        />
                        <span>{condition.label_vi}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </fieldset>
          ) : hasConditions ? (
            conditions.map((condition) => conditionLabel(condition)).join(' · ')
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

          {(approve.isError || reject.isError || retryIndex.isError || saveDraft.isError) && (
            <div className="mt-block">
              <ErrorNotice
                error={approve.error ?? reject.error ?? retryIndex.error ?? saveDraft.error}
                retryLabel="Thử lại"
                onRetry={() => {
                  if (approve.isError) approve.mutate()
                  else if (reject.isError) reject.mutate()
                  else if (retryIndex.isError) retryIndex.mutate()
                  else saveDraft.mutate()
                }}
              />
            </div>
          )}

          {/* ---- Hai nút hành động ----
              Nút Duyệt bị chặn dùng `aria-disabled` chứ không dùng `disabled`:
              nút `disabled` bị bàn phím bỏ qua hoàn toàn, nên người dùng bàn phím
              sẽ không bao giờ nghe được dòng giải thích vì sao nó chưa bấm được. */}
          <div className="mt-block flex flex-wrap gap-snug">
            {isDraft && (
              <button
                type="button"
                disabled={!draftHasUnsavedChanges || isBusy || title.trim() === ''}
                onClick={() => saveDraft.mutate()}
                className="motion-press font-display min-h-call flex-1 rounded-pill bg-ink px-cozy text-input font-bold text-white enabled:hover:bg-ink-press disabled:bg-canvas disabled:font-normal disabled:text-slate"
              >
                {saveDraft.isPending ? 'Đang lưu bản nháp…' : 'Lưu bản nháp'}
              </button>
            )}
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
