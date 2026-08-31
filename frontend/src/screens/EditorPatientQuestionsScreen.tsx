/** BTV replies to individual questions that verified RAG could not answer. */
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'

import { useInvalidateEditorData, usePatientEditorialQuestions } from '../app/editor'
import { answerPatientEditorialQuestion } from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import type { PatientEditorialQuestion } from '../lib/schemas'
import { EmptyState } from '../ui/EmptyState'
import { ErrorNotice } from '../ui/ErrorNotice'

const TEXTAREA_CLASS = 'font-body mt-tight w-full rounded-card border-2 border-slate bg-surface p-snug text-input text-body'

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

  return <li className="rounded-card bg-surface p-cozy">
    <p className="font-display text-question text-slate">Bệnh nhân hỏi lúc {formatDateTime(request.created_at)}</p>
    <p className="mt-snug text-notice text-body">{request.question}</p>
    <p className="font-display mt-snug rounded-card bg-canvas p-snug text-question text-slate">Phản hồi này chỉ được gửi cho bệnh nhân qua thông báo; không tự được thêm vào RAG hay dùng làm nguồn cho agent.</p>

    <form onSubmit={submit} className="mt-snug">
      <label htmlFor={`patient-question-answer-${request.request_id}`} className="font-display block text-input font-semibold text-body">Phản hồi cho bệnh nhân</label>
      <textarea id={`patient-question-answer-${request.request_id}`} rows={5} maxLength={4000} required value={answer} onChange={(event) => setAnswer(event.target.value)} className={TEXTAREA_CLASS} />
      {reply.isError && <div className="mt-snug"><ErrorNotice error={reply.error} retryLabel="Thử gửi lại" onRetry={() => reply.mutate()} /></div>}
      <button type="submit" disabled={reply.isPending || answer.trim() === ''} className="motion-press font-display mt-snug min-h-touch rounded-pill bg-mint px-cozy text-input font-bold text-mint-deep enabled:hover:bg-mint-press disabled:bg-canvas disabled:text-slate">{reply.isPending ? 'Đang gửi phản hồi…' : 'Gửi phản hồi cho bệnh nhân'}</button>
    </form>
  </li>
}

export function EditorPatientQuestionsScreen() {
  const query = usePatientEditorialQuestions()
  const requests = query.data?.requests ?? []

  return <div className="max-w-reading">
    <h1 className="text-ask font-semibold text-body">Yêu cầu phản hồi bệnh nhân</h1>
    <p className="mt-snug max-w-answer text-notice text-body">Đây là các câu hỏi mà agent không thể trả lời bằng thư viện đã duyệt. Khi bạn phản hồi, bệnh nhân nhận được thông báo riêng trong ứng dụng.</p>

    {query.isPending && <p role="status" className="font-display mt-block text-notice text-slate">Đang đọc yêu cầu phản hồi…</p>}
    {query.isError && <div className="mt-block"><ErrorNotice error={query.error} retryLabel="Đọc lại" onRetry={() => void query.refetch()} /></div>}
    {!query.isPending && !query.isError && requests.length === 0 && <div className="mt-block"><EmptyState title="Chưa có yêu cầu phản hồi" body="Những câu hỏi mà thư viện chưa hỗ trợ sẽ xuất hiện tại đây." /></div>}
    {requests.length > 0 && <ul className="mt-block space-y-snug">{requests.map((request) => <PatientQuestionCard key={request.request_id} request={request} />)}</ul>}
  </div>
}
