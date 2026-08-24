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
import { EmptyState } from '../ui/EmptyState'
import { DocumentStack } from '../ui/illustrations'
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
      <h1 className="text-ask font-semibold text-body">Câu hỏi chưa trả lời được</h1>
      <p className="mt-snug max-w-answer text-notice text-body">
        Bệnh nhân đã hỏi những câu này nhưng thư viện chưa có tài liệu để trích
        dẫn. Xếp theo số lượt hỏi giảm dần — trên cùng là chỗ thiếu nhiều nhất.
      </p>

      {isPending && (
        <p role="status" className="font-display mt-block text-notice text-slate">
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

      {/* Chỉ nói đúng điều màn này biết: danh sách trả về không có mục nào.
          Bản trước viết "Thư viện đang phủ hết những gì bệnh nhân hỏi" — một
          khẳng định mà giao diện không có cơ sở nào để đưa ra, và là khẳng định
          nguy hiểm: biên tập viên đọc xong sẽ kết luận không cần bổ sung tài
          liệu, trong khi danh sách rỗng có thể chỉ vì chưa ai hỏi, hoặc vì phần
          ghi log chưa chạy. Câu thứ hai chỉ mô tả phạm vi của danh sách, không
          suy ra điều gì từ việc nó rỗng. */}
      {!isPending && !isError && logs.length === 0 && (
        <div className="mt-block">
          <EmptyState
            illustration={<DocumentStack size={128} />}
            title="Danh sách hiện không có mục nào"
            body="Chỗ này chỉ hiện những câu hỏi mà trợ lý đã phải trả lời rằng chưa có tài liệu để trích dẫn."
          />
        </div>
      )}

      {logs.length > 0 && (
        <ul className="mt-block space-y-snug">
          {logs.map((log) => {
            const isDrafting = draft.isPending && draft.variables === log.log_id

            return (
              <li
                key={log.log_id}
                className="flex items-start gap-snug rounded-card bg-surface p-cozy"
              >
                {/* Khối số lượt hỏi, vuông bo góc, số bằng Lora.
                    NỀN CORAL khi chưa ai tạo bài, NỀN SAND khi đã tạo. Đây là
                    thứ tự ưu tiên của cả màn hình gói vào một ô: quét dọc cột
                    trái, ô nào còn coral là ô còn việc. Cùng cặp màu với khối
                    nguồn gốc ở hàng đợi duyệt, và cùng một nghĩa — coral là
                    "có người đang chờ". */}
                <span
                  className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-chip ${
                    log.drafted ? 'bg-sand text-sand-deep' : 'bg-coral text-coral-deep'
                  }`}
                >
                  <span className="text-heading font-semibold">{log.ask_count}</span>
                  <span className="font-display text-note">lượt</span>
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-notice text-body">{log.question}</p>

                  <p className="font-display mt-snug text-question text-slate">
                    Gần nhất {formatDateTime(log.last_asked_at)}
                  </p>

                  <div className="mt-snug">
                    {log.drafted && log.drafted_item_id !== null ? (
                      <Link
                        to={`/editor/queue/${encodeURIComponent(log.drafted_item_id)}`}
                        className="motion-press font-display inline-flex min-h-touch items-center gap-tight rounded-pill border-2 border-slate px-cozy text-input font-semibold text-body no-underline hover:bg-canvas"
                      >
                        Đã tạo bài · mở mục nháp
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled={isDrafting}
                        onClick={() => draft.mutate(log.log_id)}
                        className="motion-press font-display flex min-h-touch items-center gap-tight rounded-pill bg-ink px-cozy text-input font-bold text-white enabled:hover:bg-ink-press disabled:bg-canvas disabled:font-normal disabled:text-slate"
                      >
                        <PlusIcon className="h-5 w-5 shrink-0" />
                        {isDrafting ? 'Đang tạo…' : 'Thêm bài'}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
