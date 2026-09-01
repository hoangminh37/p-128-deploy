/**
 * Câu hỏi chưa trả lời được, đường dẫn `/editor/out-of-scope`.
 *
 * CHÉP TỪ `id="btn"` của bản mẫu: nhãn `.eb` "Thiếu nguồn", tiêu đề "Câu ngoài
 * phạm vi", một đoạn dẫn, rồi `.phieu` chứa bảng bốn cột — Câu hỏi · Số lượt ·
 * Gần nhất · nút hành động — và dải `.rangcua` khép lại.
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
import type { OutOfScopeLog } from '../lib/schemas'
import { EmptyState } from '../ui/EmptyState'
import { DocumentStack } from '../ui/illustrations'
import { ErrorNotice } from '../ui/ErrorNotice'

/**
 * Một dòng của bảng.
 *
 * Ô "Số lượt" là chữ mono theo bản mẫu, và số đếm là thứ tự ưu tiên của cả màn
 * gói vào một ô — quét dọc cột ấy là biết thư viện thiếu chỗ nào nặng nhất.
 * Dòng ĐÃ TẠO BÀI lùi màu: việc của nó đã chuyển sang hàng đợi duyệt, nó không
 * còn là chỗ trống nữa.
 */
function LogRow({
  log,
  isDrafting,
  onDraft,
}: {
  log: OutOfScopeLog
  isDrafting: boolean
  onDraft: () => void
}) {
  return (
    <tr>
      <td style={{ color: log.drafted ? 'var(--xam)' : 'var(--ink)' }}>{log.question}</td>

      <td className="mono" style={{ color: log.drafted ? 'var(--xam)' : 'var(--tim)' }}>
        {String(log.ask_count).padStart(2, '0')}
      </td>

      <td className="mono" style={{ color: 'var(--xam)', whiteSpace: 'nowrap' }}>
        {formatDateTime(log.last_asked_at)}
      </td>

      <td>
        {log.drafted && log.drafted_item_id !== null ? (
          <Link
            to={`/editor/queue/${encodeURIComponent(log.drafted_item_id)}`}
            className="btn sm gh"
          >
            Mở bản nháp
          </Link>
        ) : (
          <button
            type="button"
            className="btn sm"
            disabled={isDrafting}
            style={isDrafting ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            onClick={onDraft}
          >
            {isDrafting ? 'Đang tạo…' : 'Tạo bản nháp'}
          </button>
        )}
      </td>
    </tr>
  )
}

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
    <div>
      <div className="eb">Thiếu nguồn</div>

      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 12 }}>Câu ngoài phạm vi</h1>

      <p
        style={{
          fontSize: 'var(--t-note)',
          color: 'var(--xam)',
          marginTop: 12,
          maxWidth: '62ch',
        }}
      >
        Những câu người bệnh hỏi mà trợ lý chưa có văn bản để trả lời, xếp theo số lượt hỏi. Danh
        sách không kèm thông tin nhận dạng người hỏi.
      </p>

      {isPending && (
        <p role="status" className="lab" style={{ marginTop: 22 }}>
          Đang đọc danh sách…
        </p>
      )}

      {isError && (
        <div style={{ marginTop: 22 }}>
          <ErrorNotice error={error} retryLabel="Đọc lại danh sách" onRetry={() => void refetch()} />
        </div>
      )}

      {draft.isError && (
        <div style={{ marginTop: 22 }}>
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
        <div style={{ marginTop: 22 }}>
          <EmptyState
            illustration={<DocumentStack size={128} />}
            title="Danh sách hiện không có mục nào"
            body="Chỗ này chỉ hiện những câu hỏi mà trợ lý đã phải trả lời rằng chưa có tài liệu để trích dẫn."
          />
        </div>
      )}

      {logs.length > 0 && (
        <div className="phieu" style={{ marginTop: 22 }}>
          <div style={{ padding: 'clamp(14px,2vw,22px)', overflowX: 'auto' }}>
            <table style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th>Câu hỏi</th>
                  <th>Số lượt</th>
                  <th>Gần nhất</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <LogRow
                    key={log.log_id}
                    log={log}
                    isDrafting={draft.isPending && draft.variables === log.log_id}
                    onDraft={() => draft.mutate(log.log_id)}
                  />
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
