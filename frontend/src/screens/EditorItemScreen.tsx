/**
 * Duyệt chi tiết một mục, đường dẫn `/editor/queue/:itemId`.
 *
 * DỰNG TỪ `id="btm"` CỦA BẢN MẪU (`docs/design/eduhealth-ai.html`): nút quay
 * lại `.btn.sm.gh`, nhãn `.eb`, tiêu đề `--t-h2`, rồi `.co` hai cột — trái là
 * nội dung trong một `.phieu` có dải trích dẫn `.doc-rail`, phải là `.phu` thẻ
 * "Xuất xứ và phân loại" dính theo màn hình.
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
 * `lib/schemas.ts` cũng canh đúng luật này ở tầng dữ liệu. Bản mẫu vẽ sẵn khối
 * "Chưa duyệt được" viền đỏ cho đúng tình huống này; nó nằm ngay trên hàng nút.
 *
 * THIẾU DỮ LIỆU THÌ NÓI LÀ THIẾU. Số hiệu văn bản, cơ quan ban hành hay tài
 * liệu nguồn còn trống thì ô tương ứng ghi thẳng "Chưa có" bằng chữ xám, không
 * in một giá trị thay thế trông như thật — cùng luật với màn `id="xc"` của bản
 * mẫu.
 */
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useEditorConditions, useEditorQueueItem, useInvalidateEditorData } from '../app/editor'
import { approveEditorQueueItem, rejectEditorQueueItem, retryEditorSourceIndex, updateEditorQueueDraft } from '../lib/api'
import { conditionLabel } from '../lib/conditions'
import { formatDateTime } from '../lib/datetime'
import { ORIGIN_LABEL, STATUS_LABEL } from '../lib/editorLabels'
import type { EditorQueueItemDetail } from '../lib/schemas'
import { StatusBadge, TopicTags } from '../ui/EditorBadges'
import { ErrorNotice } from '../ui/ErrorNotice'

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

/**
 * Một trường trong thẻ xuất xứ: nhãn `.lab` trên, giá trị dưới.
 *
 * Xếp dọc để không vỡ trên cột phụ hẹp, và để lúc trường đó thành ô nhập ở bản
 * nháp thì không phải đổi bố cục.
 */
function Field({
  label,
  children,
  danger = false,
}: {
  label: string
  children: React.ReactNode
  /** `true` cho trường bắt buộc còn trống — nhãn chuyển sang đỏ. */
  danger?: boolean
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <span className="lab" style={danger ? { color: 'var(--do)' } : undefined}>
        {label}
      </span>
      <div style={{ fontSize: 'var(--t-note)', marginTop: 3 }}>{children}</div>
    </div>
  )
}

/** Giá trị còn trống. Chữ xám, nói thẳng là chưa có. */
function Missing({ children = 'Chưa có' }: { children?: string }) {
  return <span style={{ color: 'var(--xam)' }}>{children}</span>
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

  // Số hiệu và cơ quan ban hành đang hiện: ở bản nháp là thứ đang gõ dở, ở mục
  // đã gửi là thứ máy chủ giữ. Tính một lần để dải trích dẫn bên trái và thẻ
  // xuất xứ bên phải không bao giờ nói hai điều khác nhau.
  const shownDocCode = isDraft ? optionalValue(docCode) : item.doc_code
  const shownIssuer = isDraft ? optionalValue(issuer) : item.issuer
  const shownTopics = isDraft ? normalizedTopics(topicsInput) : item.topics

  return (
    <div>
      <Link to="/editor/queue" className="btn sm gh">
        Quay lại hàng đợi
      </Link>

      <div className="eb" style={{ marginTop: 18 }}>
        {ORIGIN_LABEL[item.origin]} · {STATUS_LABEL[item.status]}
      </div>

      <h1
        style={{
          fontSize: 'var(--t-h2)',
          lineHeight: 1.22,
          marginTop: 12,
          maxWidth: '26ch',
        }}
      >
        {isDraft ? 'Soạn bản nháp' : item.title}
      </h1>

      <div className="co" style={{ marginTop: 24 }}>
        <div>
          {/* ---- Nội dung, cùng dải trích dẫn bên trái ---- */}
          <div className="phieu">
            <div className="phieu-top">
              <span>{isDraft ? 'Bản nháp đang soạn' : 'Nội dung chờ duyệt'}</span>
              <StatusBadge status={item.status} />
            </div>

            <div style={{ padding: '0 clamp(16px,2vw,24px)' }}>
              <div className="doc">
                <div className="doc-rail">
                  {/* Dải trích dẫn: số hiệu văn bản trên, điều khoản hoặc cơ
                      quan ban hành dưới. Thiếu số hiệu thì ghi thẳng là thiếu. */}
                  <div className="ref" aria-current="true">
                    {shownDocCode ?? <Missing>Chưa có số hiệu</Missing>}
                    <span>{shownIssuer ?? 'Chưa rõ cơ quan ban hành'}</span>
                  </div>
                </div>

                <div className="doc-body">
                  {isSourceUpload ? (
                    <>
                      <p>
                        RAG luôn parse từ file gốc đã tải lên, không dùng ô nội dung
                        rỗng hay bản sao rút gọn trong hàng đợi.
                      </p>
                      <Link
                        to={'/editor/documents/' + encodeURIComponent(item.item_id)}
                        className="btn sm gh"
                        style={{ marginTop: 14 }}
                      >
                        Mở toàn văn tài liệu
                      </Link>
                    </>
                  ) : isSettled ? (
                    <p style={{ whiteSpace: 'pre-wrap' }}>{content}</p>
                  ) : (
                    <>
                      <label htmlFor="content" className="lab">
                        Nội dung
                      </label>
                      <p
                        id="content-hint"
                        style={{
                          fontSize: 'var(--t-note)',
                          color: 'var(--xam)',
                          marginTop: 4,
                          lineHeight: 1.66,
                        }}
                      >
                        Sửa trực tiếp ở đây trước khi duyệt. Đây chính là đoạn văn
                        bệnh nhân sẽ đọc, nên viết câu ngắn và tránh thuật ngữ
                        không giải thích.
                      </p>
                      <textarea
                        id="content"
                        className="o"
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        rows={12}
                        aria-describedby="content-hint"
                        style={{ marginTop: 10 }}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="rangcua" />
          </div>

          {/* ---- Tiến độ đưa vào RAG, chỉ với tài liệu BTV tải lên ---- */}
          {isSourceUpload && (
            <div className="phieu" style={{ marginTop: 14 }}>
              <div className="phieu-top">
                <span>Tiến độ đưa vào RAG</span>
              </div>
              <div style={{ padding: '16px clamp(16px,2vw,24px)', fontSize: 'var(--t-note)' }}>
                {isIndexing && (
                  <p role="status">
                    Đang parse, chunk, embedding và ghi vào Vector Store. Agent chưa
                    thể dùng tài liệu này; trang sẽ tự cập nhật.
                  </p>
                )}
                {isFailed && (
                  <>
                    <p style={{ color: 'var(--do)' }}>
                      Index chưa hoàn tất nên agent không thể dùng tài liệu này.
                    </p>
                    {item.source_index_error !== null && item.source_index_error !== undefined && (
                      <p
                        className="mono"
                        style={{
                          marginTop: 10,
                          padding: '10px 12px',
                          border: '1px solid var(--do)',
                          background: 'var(--do-wash)',
                          color: 'var(--do)',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {item.source_index_error}
                      </p>
                    )}
                    {item.index_attempts !== null && item.index_attempts !== undefined && (
                      <p style={{ marginTop: 10, color: 'var(--xam)' }}>
                        Đã chạy {item.index_attempts} lần.
                      </p>
                    )}
                  </>
                )}
                {item.status === 'approved' && (
                  <p style={{ color: 'var(--xanh)' }}>
                    {item.indexed_chunk_count ?? 0} đoạn đã index thành công. Agent
                    có thể truy xuất tài liệu này.
                  </p>
                )}
                {item.status === 'pending' && (
                  <p style={{ color: 'var(--xam)' }}>
                    Tài liệu vẫn tách khỏi RAG cho đến khi bạn duyệt và index hoàn tất.
                  </p>
                )}
              </div>
              <div className="rangcua" />
            </div>
          )}

          {/* ---- Kết quả đã chốt, nếu có ---- */}
          {isSettled && (
            <div className="phieu" style={{ marginTop: 14 }}>
              <div className="phieu-top">
                <span>Mục này đã {STATUS_LABEL[item.status].toLowerCase()}</span>
              </div>
              <div style={{ padding: '16px clamp(16px,2vw,24px)', fontSize: 'var(--t-note)' }}>
                <p style={{ color: 'var(--xam)' }}>
                  {item.reviewed_at !== null && 'Xử lý lúc ' + formatDateTime(item.reviewed_at) + '. '}
                  {item.reviewed_by !== null && 'Người xử lý: ' + item.reviewed_by + '.'}
                </p>
                {item.review_note !== null && <p style={{ marginTop: 10 }}>{item.review_note}</p>}
                {item.reject_reason !== null && <p style={{ marginTop: 10 }}>{item.reject_reason}</p>}
              </div>
              <div className="rangcua" />
            </div>
          )}

          {!isSettled && !isIndexing && (
            <>
              {/* ---- Ghi chú của người duyệt ---- */}
              <div style={{ marginTop: 20 }}>
                <label htmlFor="note" className="lab">
                  Ghi chú của người duyệt
                </label>
                <p
                  id="note-hint"
                  style={{
                    fontSize: 'var(--t-note)',
                    color: 'var(--xam)',
                    marginTop: 4,
                    lineHeight: 1.66,
                  }}
                >
                  Không bắt buộc. Ghi lại đã sửa gì so với bản gốc, để lần rà soát
                  sau không phải đối chiếu lại từ đầu.
                </p>
                <textarea
                  id="note"
                  className="o"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  aria-describedby="note-hint"
                  style={{ marginTop: 10 }}
                />
              </div>

              {/* ---- Chặn duyệt khi chưa gắn bệnh ---- */}
              {!hasConditions && (
                <div
                  className="phieu"
                  style={{ marginTop: 14, borderColor: 'var(--do)', borderWidth: 2 }}
                >
                  <div
                    className="phieu-top"
                    style={{
                      background: 'var(--do-wash)',
                      color: 'var(--do)',
                      borderBottomColor: 'var(--do)',
                    }}
                  >
                    <span>Chưa duyệt được</span>
                  </div>
                  <div style={{ padding: '16px clamp(16px,2vw,24px)' }}>
                    <p
                      id="approve-blocked"
                      role="alert"
                      style={{ maxWidth: '54ch', fontSize: 'var(--t-note)', lineHeight: 1.66 }}
                    >
                      Mục này chưa gắn bệnh áp dụng nên không duyệt được. Trợ lý chỉ
                      tra tài liệu theo bệnh trong hồ sơ bệnh nhân, nên nội dung
                      không gắn bệnh sẽ nằm trong thư viện mà không bao giờ được lấy
                      ra. Chọn bệnh ở cột bên phải rồi mới duyệt được.
                    </p>
                  </div>
                </div>
              )}

              {(approve.isError || reject.isError || retryIndex.isError || saveDraft.isError) && (
                <div style={{ marginTop: 14 }}>
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

              {/* ---- Hàng nút hành động ----
                  Nút Duyệt bị chặn dùng `aria-disabled` chứ không dùng `disabled`:
                  nút `disabled` bị bàn phím bỏ qua hoàn toàn, nên người dùng bàn
                  phím sẽ không bao giờ nghe được dòng giải thích vì sao nó chưa
                  bấm được. Bản mẫu vẽ nút chặn ở `opacity:.45`; giữ đúng lớp mờ
                  đó, nhưng nút vẫn Tab tới được. */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
                {isDraft && (
                  <button
                    type="button"
                    className="btn"
                    disabled={!draftHasUnsavedChanges || isBusy || title.trim() === ''}
                    onClick={() => saveDraft.mutate()}
                    style={
                      !draftHasUnsavedChanges || isBusy || title.trim() === ''
                        ? { opacity: 0.45, cursor: 'not-allowed' }
                        : undefined
                    }
                  >
                    {saveDraft.isPending ? 'Đang lưu bản nháp…' : 'Lưu bản nháp'}
                  </button>
                )}

                {isFailed && isSourceUpload ? (
                  <button
                    type="button"
                    className="btn pri"
                    disabled={isBusy}
                    onClick={() => retryIndex.mutate()}
                    style={isBusy ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                  >
                    {retryIndex.isPending ? 'Đang bắt đầu lại…' : 'Thử lại index'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn pri"
                    aria-disabled={!canApprove}
                    aria-describedby={hasConditions ? undefined : 'approve-blocked'}
                    onClick={() => {
                      if (!canApprove) return
                      approve.mutate()
                    }}
                    style={canApprove ? undefined : { opacity: 0.45, cursor: 'not-allowed' }}
                  >
                    {approve.isPending
                      ? 'Đang bắt đầu index…'
                      : isSourceUpload
                        ? 'Duyệt và bắt đầu index'
                        : 'Duyệt'}
                  </button>
                )}

                <button type="button" className="btn" onClick={() => setRejecting(true)}>
                  Từ chối
                </button>
              </div>

              {/* ---- Ô lý do, chỉ hiện khi đã bấm Từ chối ---- */}
              {isRejecting && (
                <div
                  className="phieu"
                  style={{ marginTop: 16, borderLeft: '3px solid var(--tim)' }}
                >
                  <div
                    className="phieu-top"
                    style={{
                      background: 'var(--tim-wash)',
                      color: 'var(--tim)',
                      borderBottomColor: 'var(--tim)',
                    }}
                  >
                    <span>Lý do từ chối</span>
                  </div>
                  <div style={{ padding: '16px clamp(16px,2vw,24px)' }}>
                    <label htmlFor="reason" className="sr-only">
                      Lý do từ chối
                    </label>
                    <p
                      id="reason-hint"
                      style={{
                        fontSize: 'var(--t-note)',
                        color: 'var(--xam)',
                        lineHeight: 1.66,
                      }}
                    >
                      Bắt buộc. Không ghi lý do thì người sau lại soạn đúng nội dung
                      này lần nữa, và cả vòng duyệt lặp lại từ đầu.
                    </p>
                    <textarea
                      id="reason"
                      className="o"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={3}
                      autoFocus
                      aria-describedby="reason-hint"
                      style={{ marginTop: 10 }}
                    />

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                      <button
                        type="button"
                        className="btn sm"
                        aria-disabled={!canSendRejection}
                        aria-describedby="reason-hint"
                        onClick={() => {
                          if (!canSendRejection) return
                          reject.mutate()
                        }}
                        style={
                          canSendRejection ? undefined : { opacity: 0.45, cursor: 'not-allowed' }
                        }
                      >
                        {reject.isPending ? 'Đang gửi…' : 'Gửi từ chối'}
                      </button>

                      <button
                        type="button"
                        className="btn sm gh"
                        onClick={() => setRejecting(false)}
                      >
                        Huỷ
                      </button>
                    </div>
                  </div>
                  <div className="rangcua" />
                </div>
              )}
            </>
          )}
        </div>

        {/* ---- Cột phụ: xuất xứ và phân loại ---- */}
        <div className="phu">
          <div className="phieu">
            <div
              className="phieu-top"
              style={{
                background: 'var(--tim-wash)',
                color: 'var(--tim)',
                borderBottomColor: 'var(--tim)',
              }}
            >
              <span>Xuất xứ và phân loại</span>
            </div>

            <div style={{ padding: '4px 18px 16px' }}>
              {isDraft && (
                <Field label="Tiêu đề">
                  <input
                    className="o"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    aria-label="Tiêu đề"
                    maxLength={120}
                  />
                </Field>
              )}

              <Field label="Tài liệu nguồn">
                {isDraft ? (
                  <input
                    className="o"
                    type="url"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="Dán liên kết tài liệu nguồn"
                    aria-label="Tài liệu nguồn"
                    maxLength={2_000}
                  />
                ) : item.source_url !== null ? (
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {item.source_url}
                  </a>
                ) : (
                  <Missing />
                )}
              </Field>

              <Field label="Cơ quan ban hành">
                {isDraft ? (
                  <input
                    className="o"
                    value={issuer}
                    onChange={(event) => setIssuer(event.target.value)}
                    placeholder="Ví dụ: Bộ Y tế"
                    aria-label="Cơ quan ban hành"
                    maxLength={240}
                  />
                ) : item.issuer !== null ? (
                  item.issuer
                ) : (
                  <Missing />
                )}
              </Field>

              <Field label="Số hiệu văn bản">
                {isDraft ? (
                  <input
                    className="o mono"
                    value={docCode}
                    onChange={(event) => setDocCode(event.target.value)}
                    placeholder="Ví dụ: 5481/QĐ-BYT"
                    aria-label="Số hiệu văn bản"
                    maxLength={120}
                  />
                ) : item.doc_code !== null ? (
                  <span className="mono" style={{ color: 'var(--tim)' }}>
                    {item.doc_code}
                  </span>
                ) : (
                  <Missing />
                )}
              </Field>

              <Field label="Thẻ chủ đề">
                {isDraft ? (
                  <>
                    <input
                      className="o"
                      value={topicsInput}
                      onChange={(event) => setTopicsInput(event.target.value)}
                      placeholder="Ví dụ: huyết áp, tự theo dõi"
                      aria-label="Thẻ chủ đề"
                    />
                    <p style={{ color: 'var(--xam)', marginTop: 6 }}>
                      Ngăn cách các thẻ bằng dấu phẩy.
                    </p>
                  </>
                ) : shownTopics.length > 0 ? (
                  <TopicTags topics={shownTopics} />
                ) : (
                  <Missing>Chưa gắn thẻ nào</Missing>
                )}
              </Field>

              <Field label="Tạo lúc">
                <span className="mono">{formatDateTime(item.created_at)}</span>
              </Field>

              <div style={{ height: 1, background: 'var(--ke)', margin: '16px 0 0' }} />

              {/* ---- Bệnh áp dụng ----
                  Ở bản nháp đây là ô chọn `.chon` của bản mẫu; ở mục đã gửi nó
                  chỉ còn là danh sách chữ, vì lúc đó máy chủ đã chốt. */}
              <Field label="Bắt buộc chọn bệnh áp dụng" danger={!hasConditions}>
                {isDraft ? (
                  <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
                    <legend className="sr-only">Bệnh áp dụng</legend>

                    {conditionsQuery.isPending && (
                      <p role="status" style={{ color: 'var(--xam)' }}>
                        Đang đọc danh mục bệnh…
                      </p>
                    )}

                    {conditionsQuery.isError && (
                      <ErrorNotice
                        error={conditionsQuery.error}
                        retryLabel="Đọc lại danh mục bệnh"
                        onRetry={() => void conditionsQuery.refetch()}
                      />
                    )}

                    {!conditionsQuery.isPending &&
                      !conditionsQuery.isError &&
                      availableConditions.length === 0 && (
                        <p style={{ color: 'var(--do)' }}>
                          Danh mục hiện chưa có bệnh đang hoạt động để gắn vào bản nháp.
                        </p>
                      )}

                    {availableConditions.length > 0 && (
                      <div style={{ display: 'grid', gap: 8, marginTop: 9 }}>
                        {availableConditions.map((condition) => {
                          const checked = conditions.includes(condition.condition_id)
                          return (
                            <button
                              key={condition.condition_id}
                              type="button"
                              className="chon"
                              aria-pressed={checked}
                              onClick={() =>
                                setConditions((current) =>
                                  checked
                                    ? current.filter(
                                        (conditionId) => conditionId !== condition.condition_id,
                                      )
                                    : [...current, condition.condition_id],
                                )
                              }
                              style={{ padding: '11px 13px' }}
                            >
                              <span className="box" />
                              <span style={{ fontSize: 'var(--t-note)' }}>
                                {condition.label_vi}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </fieldset>
                ) : hasConditions ? (
                  conditions.map((condition) => conditionLabel(condition)).join(' · ')
                ) : (
                  <span style={{ color: 'var(--do)' }}>Chưa gắn bệnh nào</span>
                )}
              </Field>
            </div>

            <div className="rangcua" />
          </div>
        </div>
      </div>
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
      <p role="status" className="lab">
        Đang mở mục…
      </p>
    )
  }

  if (isError) {
    return (
      <ErrorNotice error={error} retryLabel="Mở lại mục" onRetry={() => void refetch()} />
    )
  }

  // `key` để đổi sang mục khác là dựng lại form từ đầu. Không có nó thì nội dung
  // đang sửa dở của mục trước sẽ dính sang mục sau.
  return <ItemForm key={data.item_id} item={data} onChanged={() => void refetch()} />
}
