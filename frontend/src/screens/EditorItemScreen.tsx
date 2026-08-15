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
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useEditorQueueItem, useInvalidateEditorData } from '../app/editor'
import { approveEditorQueueItem, rejectEditorQueueItem } from '../lib/api'
import { CONDITION_LABEL } from '../lib/conditions'
import { formatDateTime } from '../lib/datetime'
import { STATUS_LABEL } from '../lib/editorLabels'
import type { EditorQueueItemDetail } from '../lib/schemas'
import { OriginBadge, StatusBadge, TopicTags } from '../ui/EditorBadges'
import { ErrorNotice } from '../ui/ErrorNotice'

const FIELD_LABEL_CLASS = 'font-display block text-input font-semibold text-ink'

/** Một dòng siêu dữ liệu. Nhãn và giá trị xếp dọc để không vỡ trên màn hẹp. */
function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-rule pt-snug">
      <dt className="font-display text-question text-moss">{label}</dt>
      <dd className="font-display mt-hair text-input text-ink">{children}</dd>
    </div>
  )
}

function ItemForm({ item }: { item: EditorQueueItemDetail }) {
  const navigate = useNavigate()
  const invalidateEditorData = useInvalidateEditorData()

  const [content, setContent] = useState(item.content)
  const [note, setNote] = useState('')
  const [isRejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  function returnToQueue(): void {
    invalidateEditorData()
    void navigate('/editor/queue', { replace: true })
  }

  const approve = useMutation({
    mutationFn: () =>
      approveEditorQueueItem(item.item_id, {
        content,
        note: note.trim() === '' ? null : note.trim(),
      }),
    onSuccess: returnToQueue,
  })

  const reject = useMutation({
    mutationFn: () => rejectEditorQueueItem(item.item_id, { reason }),
    onSuccess: returnToQueue,
  })

  const isSettled = item.status === 'approved' || item.status === 'rejected'
  const hasConditions = item.conditions.length > 0
  const isBusy = approve.isPending || reject.isPending
  const canApprove = hasConditions && !isBusy
  const canSendRejection = reason.trim() !== '' && !isBusy

  return (
    <div className="max-w-reading">
      <Link
        to="/editor/queue"
        className="font-display inline-flex min-h-touch items-center text-input font-semibold text-medical underline underline-offset-4"
      >
        Về hàng đợi
      </Link>

      <h1 className="font-display mt-snug text-ask font-bold">{item.title}</h1>

      <div className="mt-snug flex flex-wrap items-center gap-tight">
        <OriginBadge origin={item.origin} />
        <StatusBadge status={item.status} />
      </div>

      {/* ---- Siêu dữ liệu ---- */}
      <dl className="mt-block space-y-snug">
        <MetaRow label="Tài liệu nguồn">
          {item.source_url !== null ? (
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer"
              className="font-display inline-flex min-h-touch items-center break-all text-medical underline underline-offset-4"
            >
              {item.source_url}
            </a>
          ) : (
            <span className="text-moss">Chưa có</span>
          )}
        </MetaRow>

        <MetaRow label="Cơ quan ban hành">
          {item.issuer ?? <span className="text-moss">Chưa có</span>}
        </MetaRow>

        <MetaRow label="Số hiệu văn bản">
          {item.doc_code !== null ? (
            <span className="font-mono">{item.doc_code}</span>
          ) : (
            <span className="text-moss">Chưa có</span>
          )}
        </MetaRow>

        <MetaRow label="Thẻ chủ đề">
          {item.topics.length > 0 ? (
            <TopicTags topics={item.topics} />
          ) : (
            <span className="text-moss">Chưa gắn thẻ nào</span>
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

      {/* ---- Kết quả đã chốt, nếu có ---- */}
      {isSettled && (
        <div className="mt-block rounded-lg border-l-4 border-border p-cozy">
          <p className="font-display text-input font-semibold text-ink">
            Mục này đã {STATUS_LABEL[item.status].toLowerCase()}
          </p>
          <p className="font-display mt-hair text-question text-moss">
            {item.reviewed_at !== null && `Xử lý lúc ${formatDateTime(item.reviewed_at)}. `}
            {item.reviewed_by !== null && `Người xử lý: ${item.reviewed_by}.`}
          </p>
          {item.review_note !== null && (
            <p className="mt-snug text-notice text-ink">{item.review_note}</p>
          )}
          {item.reject_reason !== null && (
            <p className="mt-snug text-notice text-ink">{item.reject_reason}</p>
          )}
        </div>
      )}

      {/* ---- Nội dung, sửa được ---- */}
      <div className="mt-block">
        <label htmlFor="content" className={FIELD_LABEL_CLASS}>
          Nội dung
        </label>
        <p id="content-hint" className="font-display mt-hair text-question text-moss">
          Sửa trực tiếp ở đây trước khi duyệt. Đây chính là đoạn văn bệnh nhân sẽ
          đọc, nên viết câu ngắn và tránh thuật ngữ không giải thích.
        </p>
        {/* Font body (Lora) đúng như lúc render cho bệnh nhân, để người duyệt
            thấy được nhịp đọc thật chứ không phải nhịp của một ô soạn thảo. */}
        <textarea
          id="content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={12}
          disabled={isSettled}
          aria-describedby="content-hint"
          className="font-body mt-snug w-full rounded-lg border-2 border-border bg-paper p-snug text-notice text-ink disabled:text-moss"
        />
      </div>

      {!isSettled && (
        <>
          {/* ---- Ghi chú của người duyệt ---- */}
          <div className="mt-block">
            <label htmlFor="note" className={FIELD_LABEL_CLASS}>
              Ghi chú của người duyệt
            </label>
            <p id="note-hint" className="font-display mt-hair text-question text-moss">
              Không bắt buộc. Ghi lại đã sửa gì so với bản gốc, để lần rà soát sau
              không phải đối chiếu lại từ đầu.
            </p>
            <textarea
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              aria-describedby="note-hint"
              className="font-body mt-snug w-full rounded-lg border-2 border-border bg-paper p-snug text-input text-ink"
            />
          </div>

          {/* ---- Chặn duyệt khi chưa gắn bệnh ---- */}
          {!hasConditions && (
            <p
              id="approve-blocked"
              role="alert"
              className="font-display mt-block rounded-lg border-l-4 border-alert p-cozy text-notice text-ink"
            >
              Chưa gắn bệnh nào nên không duyệt được. Trợ lý chỉ tra tài liệu theo
              bệnh trong hồ sơ bệnh nhân, nên nội dung không gắn bệnh sẽ nằm trong
              thư viện mà không bao giờ được lấy ra.
            </p>
          )}

          {(approve.isError || reject.isError) && (
            <div className="mt-block">
              <ErrorNotice
                error={approve.error ?? reject.error}
                retryLabel="Thử lại"
                onRetry={() => {
                  if (approve.isError) approve.mutate()
                  else reject.mutate()
                }}
              />
            </div>
          )}

          {/* ---- Hai nút hành động ----
              Nút Duyệt bị chặn dùng `aria-disabled` chứ không dùng `disabled`:
              nút `disabled` bị bàn phím bỏ qua hoàn toàn, nên người dùng bàn phím
              sẽ không bao giờ nghe được dòng giải thích vì sao nó chưa bấm được. */}
          <div className="mt-block flex flex-wrap gap-snug">
            <button
              type="button"
              aria-disabled={!canApprove}
              aria-describedby={hasConditions ? undefined : 'approve-blocked'}
              onClick={() => {
                if (!canApprove) return
                approve.mutate()
              }}
              className={`font-display min-h-touch flex-1 rounded-lg border-2 px-cozy text-input font-bold ${
                canApprove
                  ? 'border-medical bg-medical text-paper'
                  : 'cursor-not-allowed border-dashed border-border font-normal text-moss'
              }`}
            >
              {approve.isPending ? 'Đang duyệt…' : 'Duyệt'}
            </button>

            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="font-display min-h-touch rounded-lg border-2 border-border px-cozy text-input font-semibold text-ink"
            >
              Từ chối
            </button>
          </div>

          {/* ---- Ô lý do, chỉ hiện khi đã bấm Từ chối ---- */}
          {isRejecting && (
            <div className="mt-block rounded-lg border-l-4 border-refuse p-cozy">
              <label htmlFor="reason" className={FIELD_LABEL_CLASS}>
                Lý do từ chối
              </label>
              <p id="reason-hint" className="font-display mt-hair text-question text-moss">
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
                className="font-body mt-snug w-full rounded-lg border-2 border-border bg-paper p-snug text-input text-ink"
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
                  className={`font-display min-h-touch flex-1 rounded-lg border-2 px-cozy text-input font-bold ${
                    canSendRejection
                      ? 'border-refuse bg-refuse text-paper'
                      : 'cursor-not-allowed border-dashed border-border font-normal text-moss'
                  }`}
                >
                  {reject.isPending ? 'Đang gửi…' : 'Gửi từ chối'}
                </button>

                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  className="font-display min-h-touch rounded-lg border-2 border-border px-cozy text-input font-semibold text-ink"
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

  if (isPending) {
    return (
      <p role="status" className="font-display text-notice text-moss">
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
  return <ItemForm key={data.item_id} item={data} />
}
