/**
 * Yêu cầu phản hồi bệnh nhân, đường dẫn `/editor/patient-questions`.
 *
 * Dựng theo màn `#btph` của bản mẫu: mỗi câu hỏi là MỘT `.phieu` riêng, mốc
 * giờ hỏi nằm ở `.phieu-top`, câu hỏi đọc ở cỡ `--t-lead`, rồi tới ô soạn trả
 * lời. Không gom nhiều câu hỏi vào một thẻ: mỗi phiếu là đúng một việc gửi đi,
 * và người trực phải thấy ranh giới đó bằng mắt.
 *
 * Khối nhắc ở giữa mỗi phiếu dùng nền `--tim-wash` với nét trái tím — cùng
 * giọng với `.chip.cho`, tức "còn chờ một CON NGƯỜI xử lý". Nó không phải cảnh
 * báo lỗi nên tuyệt đối không tô đỏ; đỏ trong ứng dụng này chỉ dành cho khối
 * cấp cứu và nhãn hỏng.
 *
 * Câu nhắc lặp lại ở từng phiếu chứ không đặt một lần trên đầu trang, vì nó là
 * điều kiện của ĐÚNG hành động bấm gửi ngay dưới nó: phản hồi đi thẳng tới một
 * bệnh nhân, không vào thư viện tra cứu và không thành nguồn cho trợ lý.
 */
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'

import { useInvalidateEditorData, usePatientEditorialQuestions } from '../app/editor'
import { answerPatientEditorialQuestion } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import type { PatientEditorialQuestion } from '../lib/schemas'
import { EmptyState } from '../ui/EmptyState'
import { ErrorNotice } from '../ui/ErrorNotice'
import { DocumentStack } from '../ui/illustrations'

function PatientQuestionCard({ request }: { request: PatientEditorialQuestion }) {
  const invalidate = useInvalidateEditorData()
  const [answer, setAnswer] = useState('')
  const reply = useMutation({
    mutationFn: () => answerPatientEditorialQuestion(request.request_id, { answer: answer.trim() }),
    onSuccess: invalidate,
  })

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    reply.mutate()
  }

  const isEmpty = answer.trim() === ''

  return (
    <li>
      <form onSubmit={submit} className="phieu" style={{ marginTop: 14 }}>
        <div className="phieu-top">
          <span>Hỏi lúc {formatDateTime(request.created_at)}</span>
          <span className="mono">{request.request_id}</span>
        </div>

        <div style={{ padding: '18px clamp(16px,2vw,24px)' }}>
          <p style={{ fontSize: 'var(--t-lead)', maxWidth: '56ch', lineHeight: 1.65 }}>
            {request.question}
          </p>

          <div
            style={{
              marginTop: 16,
              padding: '12px 14px',
              background: 'var(--tim-wash)',
              borderLeft: '2px solid var(--tim)',
            }}
          >
            <p style={{ fontSize: 'var(--t-note)', color: 'var(--xam)', lineHeight: 1.6 }}>
              Phản hồi này chỉ được gửi cho bệnh nhân qua thông báo, không tự được thêm vào
              thư viện tra cứu hay dùng làm nguồn cho trợ lý.
            </p>
          </div>

          <div style={{ marginTop: 16 }}>
            <label htmlFor={`patient-question-answer-${request.request_id}`} className="lab">
              Phản hồi cho bệnh nhân
            </label>
            <textarea
              id={`patient-question-answer-${request.request_id}`}
              rows={5}
              maxLength={4000}
              required
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Viết câu trả lời bằng lời dễ hiểu."
              className="o"
              style={{ marginTop: 6, minHeight: 120, lineHeight: 1.65 }}
            />
          </div>

          {reply.isError && (
            <div style={{ marginTop: 16 }}>
              <ErrorNotice error={reply.error} retryLabel="Thử gửi lại" onRetry={() => reply.mutate()} />
            </div>
          )}

          <button
            type="submit"
            disabled={reply.isPending || isEmpty}
            className="btn pri"
            style={{ marginTop: 14, opacity: reply.isPending || isEmpty ? 0.5 : 1 }}
          >
            {reply.isPending ? 'Đang gửi phản hồi…' : 'Gửi phản hồi cho bệnh nhân'}
          </button>
        </div>

        <div className="rangcua" />
      </form>
    </li>
  )
}

export function EditorPatientQuestionsScreen() {
  const query = usePatientEditorialQuestions()
  const requests = query.data?.requests ?? []

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="eb">Hộp thư việc</div>

      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 12 }}>
        Yêu cầu phản hồi bệnh nhân
      </h1>

      <p
        style={{
          fontSize: 'var(--t-note)',
          color: 'var(--xam)',
          marginTop: 12,
          maxWidth: '62ch',
          lineHeight: 1.7,
        }}
      >
        Đây là các câu hỏi mà trợ lý không trả lời được bằng thư viện đã duyệt. Khi bạn
        phản hồi, bệnh nhân nhận được thông báo riêng trong ứng dụng.
      </p>

      {query.isPending && (
        <p role="status" className="lab" style={{ marginTop: 22 }}>
          Đang đọc yêu cầu phản hồi…
        </p>
      )}

      {query.isError && (
        <div style={{ marginTop: 22 }}>
          <ErrorNotice error={query.error} retryLabel="Đọc lại" onRetry={() => void query.refetch()} />
        </div>
      )}

      {!query.isPending && !query.isError && requests.length === 0 && (
        <div style={{ marginTop: 22 }}>
          <EmptyState
            title="Chưa có yêu cầu phản hồi"
            body="Những câu hỏi mà thư viện chưa hỗ trợ sẽ xuất hiện tại đây."
            illustration={<DocumentStack size={128} />}
          />
        </div>
      )}

      {requests.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {requests.map((request) => (
            <PatientQuestionCard key={request.request_id} request={request} />
          ))}
        </ul>
      )}
    </div>
  )
}
