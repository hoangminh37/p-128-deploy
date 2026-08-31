/** BTV-managed condition catalog backed by the runtime registry YAML. */
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'

import { useEditorConditions, useInvalidateEditorData } from '../app/editor'
import {
  createEditorCondition,
  updateEditorConditionStatus,
} from '../lib/api'
import type { EditorConditionStatus } from '../lib/schemas'
import { ErrorNotice } from '../ui/ErrorNotice'

const INPUT_CLASS =
  'font-body mt-tight min-h-touch w-full rounded-card border-2 border-slate bg-surface p-snug text-input text-body'
const LABEL_CLASS = 'font-display block text-input font-semibold text-body'

const STATUS_LABEL: Record<EditorConditionStatus, string> = {
  waiting_for_sources: 'Chờ tài liệu nguồn',
  active: 'Đang dùng',
  inactive: 'Đã tạm ngừng',
}

function cleanAliases(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

export function EditorConditionsScreen() {
  const conditionsQuery = useEditorConditions()
  const invalidateEditorData = useInvalidateEditorData()
  const [error, setError] = useState<string | null>(null)
  const [conditionId, setConditionId] = useState('')
  const [labelVi, setLabelVi] = useState('')
  const [labelEn, setLabelEn] = useState('')
  const [aliases, setAliases] = useState('')

  const createCondition = useMutation({
    mutationFn: createEditorCondition,
    onSuccess: () => {
      setConditionId('')
      setLabelVi('')
      setLabelEn('')
      setAliases('')
      setError(null)
      invalidateEditorData()
    },
  })

  const updateStatus = useMutation({
    mutationFn: ({ conditionId: id, status }: { conditionId: string; status: 'active' | 'inactive' }) =>
      updateEditorConditionStatus(id, { status }),
    onSuccess: invalidateEditorData,
  })

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setError(null)
    const normalizedId = conditionId.trim().toLowerCase()
    if (normalizedId === '' || labelVi.trim() === '') {
      setError('Bạn hãy điền mã bệnh và tên tiếng Việt.')
      return
    }
    createCondition.mutate({
      condition_id: normalizedId,
      label_vi: labelVi.trim(),
      label_en: labelEn.trim() || null,
      aliases: cleanAliases(aliases),
    })
  }

  const mutationError = createCondition.error ?? updateStatus.error

  return (
    <div className="max-w-reading">
      <h1 className="text-ask font-semibold text-body">Danh mục bệnh</h1>
      <p className="mt-snug max-w-answer text-notice text-body">
        Bệnh thêm ở đây được lưu trong danh mục runtime, không sửa registry nền. Bệnh mới chỉ
        được kích hoạt sau khi một tài liệu nguồn đã được duyệt và index thành công.
      </p>

      <form onSubmit={submit} className="mt-block grid gap-snug rounded-card-lg bg-surface p-cozy sm:grid-cols-2">
        <div>
          <label htmlFor="condition-id" className={LABEL_CLASS}>Mã bệnh *</label>
          <input
            id="condition-id"
            value={conditionId}
            onChange={(event) => setConditionId(event.target.value)}
            placeholder="asthma"
            pattern="[a-z][a-z0-9_]{1,63}"
            required
            className={INPUT_CLASS}
          />
          <p className="font-display mt-hair text-question text-slate">Chữ thường, số và dấu gạch dưới.</p>
        </div>
        <div>
          <label htmlFor="condition-label-vi" className={LABEL_CLASS}>Tên tiếng Việt *</label>
          <input
            id="condition-label-vi"
            value={labelVi}
            onChange={(event) => setLabelVi(event.target.value)}
            placeholder="Hen phế quản"
            required
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="condition-label-en" className={LABEL_CLASS}>Tên tiếng Anh</label>
          <input
            id="condition-label-en"
            value={labelEn}
            onChange={(event) => setLabelEn(event.target.value)}
            placeholder="Asthma"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="condition-aliases" className={LABEL_CLASS}>Tên gọi khác</label>
          <input
            id="condition-aliases"
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
            placeholder="hen, hen suyễn"
            className={INPUT_CLASS}
          />
          <p className="font-display mt-hair text-question text-slate">Ngăn cách bằng dấu phẩy; dùng để nhận diện nội dung liên quan.</p>
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={createCondition.isPending}
            className="motion-press font-display min-h-touch rounded-pill bg-mint px-cozy text-input font-bold text-mint-deep enabled:hover:bg-mint-press disabled:bg-canvas disabled:text-slate"
          >
            {createCondition.isPending ? 'Đang thêm bệnh…' : 'Thêm bệnh'}
          </button>
        </div>
      </form>

      {error !== null && <p role="alert" className="font-display mt-snug rounded-card bg-sand p-snug text-input text-sand-deep">{error}</p>}
      {mutationError !== null && mutationError !== undefined && (
        <div className="mt-snug"><ErrorNotice error={mutationError} retryLabel="Thử lại" onRetry={() => undefined} /></div>
      )}

      {conditionsQuery.isPending && <p role="status" className="font-display mt-block text-notice text-slate">Đang đọc danh mục bệnh…</p>}
      {conditionsQuery.isError && (
        <div className="mt-block"><ErrorNotice error={conditionsQuery.error} retryLabel="Đọc lại danh mục" onRetry={() => void conditionsQuery.refetch()} /></div>
      )}
      {conditionsQuery.data !== undefined && (
        <ul className="mt-block space-y-snug">
          {conditionsQuery.data.conditions.map((condition) => {
            const canReactivate = condition.status === 'inactive' && condition.approved_source_count > 0
            return (
              <li key={condition.condition_id} className="rounded-card bg-surface p-cozy">
                <div className="flex flex-wrap items-start justify-between gap-snug">
                  <div>
                    <h2 className="text-notice font-semibold text-body">{condition.label_vi}</h2>
                    {condition.label_en !== null && <p className="font-display mt-hair text-question text-slate">{condition.label_en}</p>}
                  </div>
                  <span className="font-mono rounded-pill bg-canvas px-snug py-hair text-question text-body">{condition.condition_id}</span>
                </div>
                <p className="font-display mt-snug text-question text-slate">
                  {STATUS_LABEL[condition.status]} · {condition.approved_source_count}/{condition.source_document_count} tài liệu đã duyệt
                </p>
                {condition.aliases.length > 0 && <p className="font-display mt-hair text-question text-slate">Tên gọi khác: {condition.aliases.join(' · ')}</p>}
                {condition.status === 'waiting_for_sources' && <p className="font-display mt-snug text-question text-sand-deep">Hãy tải tài liệu nguồn, duyệt và index thành công để kích hoạt bệnh này.</p>}
                {condition.origin === 'editor_runtime' && condition.status === 'active' && (
                  <button
                    type="button"
                    disabled={updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ conditionId: condition.condition_id, status: 'inactive' })}
                    className="motion-press font-display mt-snug min-h-touch rounded-pill border-2 border-slate px-cozy text-input font-semibold text-body enabled:hover:bg-canvas"
                  >
                    Tạm ngừng
                  </button>
                )}
                {canReactivate && (
                  <button
                    type="button"
                    disabled={updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ conditionId: condition.condition_id, status: 'active' })}
                    className="motion-press font-display mt-snug min-h-touch rounded-pill bg-mint px-cozy text-input font-semibold text-mint-deep enabled:hover:bg-mint-press"
                  >
                    Bật lại
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
