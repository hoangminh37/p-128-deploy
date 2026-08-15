/**
 * Câu hỏi chưa trả lời được, đường dẫn `/editor/out-of-scope`.
 *
 * Đây là đầu vào của việc mở rộng thư viện: những gì bệnh nhân đã hỏi mà trợ lý
 * phải trả `referral` vì không có tài liệu nào để trích. Xếp theo số lượt hỏi
 * giảm dần, và thứ tự đó chính là thứ tự ưu tiên soạn bài — nên nó do máy chủ
 * quyết định, không phải lựa chọn hiển thị của màn này.
 *
 * KHÔNG có `patient_id` ở bất kỳ đâu trong màn này, và không có đường nào lần
 * ngược về một tài khoản. Ràng buộc PII ở mục 8 hợp đồng: biên tập viên đọc log
 * để biết thư viện thiếu chủ đề gì, không phải để biết ai đang hỏi.
 */
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { useInvalidateEditorData, useOutOfScopeLogs } from '../app/editor'
import { createDraftFromLog } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import { ErrorNotice } from '../ui/ErrorNotice'
import { PlusIcon } from '../ui/icons'

export function OutOfScopeScreen() {
  const { data, isPending, isError, error, refetch } = useOutOfScopeLogs()
  const invalidateEditorData = useInvalidateEditorData()

  /**
   * Một mutation dùng chung cho mọi dòng, phân biệt bằng `variables`.
   *
   * Dựng một hook riêng cho từng dòng thì số lần gọi hook đổi theo độ dài danh
   * sách — điều React cấm. `mutation.variables` cho biết đang chạy cho dòng nào
   * để chỉ nút đó hiện trạng thái chờ.
   */
  const draft = useMutation({
    mutationFn: createDraftFromLog,
    onSuccess: invalidateEditorData,
  })

  const logs = data?.logs ?? []

  return (
    <div className="max-w-reading">
      <h1 className="font-display text-ask font-bold">Câu hỏi chưa trả lời được</h1>
      <p className="mt-snug max-w-answer text-notice text-ink">
        Bệnh nhân đã hỏi những câu này nhưng thư viện chưa có tài liệu để trích
        dẫn. Xếp theo số lượt hỏi giảm dần — trên cùng là chỗ thiếu nhiều nhất.
      </p>

      {isPending && (
        <p role="status" className="font-display mt-block text-notice text-moss">
          Đang đọc danh sách…
        </p>
      )}

      {isError && (
        <div className="mt-block">
          <ErrorNotice
            error={error}
            retryLabel="Đọc lại danh sách"
            onRetry={() => void refetch()}
          />
        </div>
      )}

      {draft.isError && (
        <div className="mt-block">
          <ErrorNotice
            error={draft.error}
            retryLabel="Thử lại"
            onRetry={() => {
              if (draft.variables !== undefined) draft.mutate(draft.variables)
            }}
          />
        </div>
      )}

      {!isPending && !isError && logs.length === 0 && (
        <p className="font-display mt-block text-notice text-moss">
          Chưa có câu hỏi nào ngoài phạm vi. Thư viện đang phủ hết những gì bệnh
          nhân hỏi.
        </p>
      )}

      {logs.length > 0 && (
        <ul className="mt-block space-y-snug">
          {logs.map((log) => {
            const isDrafting = draft.isPending && draft.variables === log.log_id

            return (
              <li
                key={log.log_id}
                className="rounded-lg border-2 border-border p-cozy"
              >
                <p className="text-notice text-ink">{log.question}</p>

                <p className="font-display mt-snug text-question text-moss">
                  <span className="font-mono text-ink">{log.ask_count}</span> lượt hỏi
                  {' · '}
                  gần nhất {formatDateTime(log.last_asked_at)}
                </p>

                <div className="mt-snug">
                  {log.drafted && log.drafted_item_id !== null ? (
                    <Link
                      to={`/editor/queue/${encodeURIComponent(log.drafted_item_id)}`}
                      className="font-display inline-flex min-h-touch items-center gap-tight rounded-lg border-2 border-border px-cozy text-input font-semibold text-ink no-underline"
                    >
                      Đã tạo bài · mở mục nháp
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={isDrafting}
                      onClick={() => draft.mutate(log.log_id)}
                      className="font-display flex min-h-touch items-center gap-tight rounded-lg border-2 border-medical bg-medical px-cozy text-input font-bold text-paper disabled:border-rule disabled:bg-transparent disabled:font-normal disabled:text-moss"
                    >
                      <PlusIcon className="h-5 w-5 shrink-0" />
                      {isDrafting ? 'Đang tạo…' : 'Thêm bài'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
