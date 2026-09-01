/**
 * Danh mục bệnh do biên tập viên quản lý, đường dẫn `/editor/conditions`.
 *
 * Dựng theo màn `#btdm` của bản mẫu: một `.eb` đề mục, tiêu đề `--t-h2`, rồi
 * hai `.phieu` — phiếu trên để THÊM, phiếu dưới để ĐỌC. Hai việc khác nhau nên
 * là hai khối tách rời, không trộn nút thêm vào giữa danh sách.
 *
 * Trạng thái của một bệnh nói bằng `.chip`, không bằng màu chữ: `duyet` cho
 * bệnh đang dùng, `cho` cho bệnh còn chờ tài liệu nguồn, `nhap` cho bệnh đã
 * tạm ngừng. Dòng giải thích dưới tiêu đề mới là chỗ nói người trực phải làm
 * gì tiếp — chip chỉ trả lời "đang ở bậc nào".
 */
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'

import { useEditorConditions, useInvalidateEditorData } from '../app/editor'
import {
  createEditorCondition,
  updateEditorConditionStatus,
} from '../lib/api'
import type { EditorConditionStatus } from '../lib/schemas'
import { ErrorNotice } from '../ui/ErrorNotice'

const STATUS_LABEL: Record<EditorConditionStatus, string> = {
  waiting_for_sources: 'Chờ tài liệu nguồn',
  active: 'Đang dùng',
  inactive: 'Đã tạm ngừng',
}

/** `.chip` nào cho bậc nào. Ba bậc, ba viên, không bậc nào dùng chung màu. */
const STATUS_CHIP: Record<EditorConditionStatus, string> = {
  waiting_for_sources: 'chip cho',
  active: 'chip duyet',
  inactive: 'chip nhap',
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
  const conditions = conditionsQuery.data?.conditions ?? []

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="eb">Danh mục</div>

      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 12 }}>Danh mục bệnh</h1>

      <p
        style={{
          fontSize: 'var(--t-note)',
          color: 'var(--xam)',
          marginTop: 12,
          maxWidth: '62ch',
          lineHeight: 1.7,
        }}
      >
        Bệnh thêm ở đây được lưu trong danh mục vận hành, không sửa danh mục nền. Bệnh
        mới chỉ được dùng sau khi một tài liệu nguồn đã được duyệt và đưa vào thư viện
        tra cứu thành công.
      </p>

      {/* ---- Phiếu thêm bệnh ---- */}
      <form onSubmit={submit} className="phieu" style={{ marginTop: 22 }}>
        <div className="phieu-top">
          <span>Thêm bệnh</span>
        </div>

        <div style={{ padding: '20px clamp(16px,2vw,24px)' }}>
          <div className="auto">
            <div>
              <label htmlFor="condition-id" className="lab">
                Mã bệnh
              </label>
              <input
                id="condition-id"
                value={conditionId}
                onChange={(event) => setConditionId(event.target.value)}
                placeholder="asthma"
                pattern="[a-z][a-z0-9_]{1,63}"
                required
                className="o"
                style={{ marginTop: 6 }}
              />
              <p className="lab" style={{ marginTop: 5, lineHeight: 1.5 }}>
                Chữ thường, số và dấu gạch dưới.
              </p>
            </div>

            <div>
              <label htmlFor="condition-label-vi" className="lab">
                Tên tiếng Việt
              </label>
              <input
                id="condition-label-vi"
                value={labelVi}
                onChange={(event) => setLabelVi(event.target.value)}
                placeholder="Hen phế quản"
                required
                className="o"
                style={{ marginTop: 6 }}
              />
            </div>

            <div>
              <label htmlFor="condition-label-en" className="lab">
                Tên tiếng Anh
              </label>
              <input
                id="condition-label-en"
                value={labelEn}
                onChange={(event) => setLabelEn(event.target.value)}
                placeholder="Asthma"
                className="o"
                style={{ marginTop: 6 }}
              />
            </div>

            <div>
              <label htmlFor="condition-aliases" className="lab">
                Tên gọi khác
              </label>
              <input
                id="condition-aliases"
                value={aliases}
                onChange={(event) => setAliases(event.target.value)}
                placeholder="hen suyễn, suyễn"
                className="o"
                style={{ marginTop: 6 }}
              />
              <p className="lab" style={{ marginTop: 5, lineHeight: 1.5 }}>
                Ngăn cách bằng dấu phẩy; dùng để nhận diện nội dung liên quan.
              </p>
            </div>
          </div>

          {error !== null && (
            <p role="alert" className="lab" style={{ color: 'var(--do)', marginTop: 14, lineHeight: 1.6 }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={createCondition.isPending} className="btn pri" style={{ marginTop: 18 }}>
            {createCondition.isPending ? 'Đang thêm bệnh…' : 'Thêm bệnh'}
          </button>
        </div>

        <div className="rangcua" />
      </form>

      {mutationError !== null && mutationError !== undefined && (
        <div style={{ marginTop: 16 }}>
          <ErrorNotice error={mutationError} retryLabel="Đọc lại danh mục" onRetry={() => void conditionsQuery.refetch()} />
        </div>
      )}

      {/* ---- Phiếu danh sách bệnh ---- */}
      {conditionsQuery.isPending && (
        <p role="status" className="lab" style={{ marginTop: 22 }}>
          Đang đọc danh mục bệnh…
        </p>
      )}

      {conditionsQuery.isError && (
        <div style={{ marginTop: 22 }}>
          <ErrorNotice
            error={conditionsQuery.error}
            retryLabel="Đọc lại danh mục"
            onRetry={() => void conditionsQuery.refetch()}
          />
        </div>
      )}

      {conditions.length > 0 && (
        <div className="phieu" style={{ marginTop: 16 }}>
          {conditions.map((condition, index) => {
            const canReactivate = condition.status === 'inactive' && condition.approved_source_count > 0
            const canSuspend = condition.origin === 'editor_runtime' && condition.status === 'active'

            return (
              <div
                key={condition.condition_id}
                style={{
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                  padding: '16px clamp(16px,2vw,22px)',
                  borderBottom: index === conditions.length - 1 ? undefined : '1px solid var(--ke)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 220 }}>
                  <h2 style={{ fontSize: 'var(--t-h3)' }}>{condition.label_vi}</h2>

                  <p className="lab">
                    {condition.label_en !== null && `${condition.label_en} · `}
                    <span className="mono">{condition.condition_id}</span>
                  </p>

                  {/* Bệnh còn chờ tài liệu nguồn thì dòng này KHÔNG kể trạng
                      thái nữa — chip đã kể rồi — mà nói thẳng việc phải làm. */}
                  {condition.status === 'waiting_for_sources' ? (
                    <p style={{ fontSize: 'var(--t-note)', color: 'var(--do)', marginTop: 6, lineHeight: 1.6 }}>
                      Hãy tải tài liệu nguồn, duyệt và đưa vào thư viện tra cứu để dùng được bệnh này.
                    </p>
                  ) : (
                    <p style={{ fontSize: 'var(--t-note)', color: 'var(--xam)', marginTop: 6 }}>
                      {STATUS_LABEL[condition.status]} · {condition.source_document_count} tài liệu nguồn,{' '}
                      {condition.approved_source_count} đã duyệt
                    </p>
                  )}

                  {condition.aliases.length > 0 && (
                    <p className="lab" style={{ marginTop: 6, lineHeight: 1.5 }}>
                      Tên gọi khác: {condition.aliases.join(' · ')}
                    </p>
                  )}
                </div>

                <span className={STATUS_CHIP[condition.status]}>{STATUS_LABEL[condition.status]}</span>

                {canSuspend && (
                  <button
                    type="button"
                    disabled={updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ conditionId: condition.condition_id, status: 'inactive' })}
                    className="btn sm gh"
                  >
                    Tạm ngừng
                  </button>
                )}

                {canReactivate && (
                  <button
                    type="button"
                    disabled={updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ conditionId: condition.condition_id, status: 'active' })}
                    className="btn sm pri"
                  >
                    Bật lại
                  </button>
                )}
              </div>
            )
          })}

          <div className="rangcua" />
        </div>
      )}
    </div>
  )
}
