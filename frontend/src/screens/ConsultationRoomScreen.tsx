/** Direct, persisted chat and the gated video room for one consultation. */
import { useCallback, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import {
  useConsultationDetail,
  useInvalidateConsultations,
} from '../app/consultations'
import {
  acceptConsultation,
  endConsultation,
  joinVideoCall,
  sendConsultationMessage,
  startVideoCall,
} from '../lib/api'
import { formatDateTime } from '../lib/datetime'
import type { ConsultationStatus, VideoCallStart } from '../lib/schemas'
import { useSession } from '../session/context'
import { ErrorNotice } from '../ui/ErrorNotice'
import { VideoConsultationCall } from '../ui/VideoConsultationCall'

const STATUS_LABEL: Record<ConsultationStatus, string> = {
  requested: 'Đang chờ bác sỹ nhận phiên',
  active: 'Đang tư vấn',
  ended: 'Phiên tư vấn đã kết thúc',
}

export function ConsultationRoomScreen({ consultationId }: { consultationId: string }) {
  const { user } = useSession()
  const detailQuery = useConsultationDetail(consultationId)
  const invalidate = useInvalidateConsultations()
  const [message, setMessage] = useState('')
  const [joinedCall, setJoinedCall] = useState<{ call: VideoCallStart; isInitiator: boolean } | null>(null)

  // `VideoConsultationCall` owns a long-lived RTCPeerConnection. Its effect
  // must not be torn down just because this screen polls a new chat state.
  // Keeping this callback stable prevents an ordinary query refresh from
  // closing local media tracks halfway through the connection handshake.
  const handleCallEnded = useCallback(() => {
    setJoinedCall(null)
    invalidate()
  }, [invalidate])

  const accept = useMutation({
    mutationFn: () => acceptConsultation(consultationId),
    onSuccess: invalidate,
  })
  const end = useMutation({
    mutationFn: () => endConsultation(consultationId),
    onSuccess: () => {
      setJoinedCall(null)
      invalidate()
    },
  })
  const send = useMutation({
    mutationFn: (content: string) => sendConsultationMessage(consultationId, { content }),
    onSuccess: () => {
      setMessage('')
      invalidate()
    },
  })
  const startCall = useMutation({
    mutationFn: () => startVideoCall(consultationId),
    onSuccess: (call) => {
      setJoinedCall({ call, isInitiator: true })
      invalidate()
    },
  })
  const joinCall = useMutation({
    mutationFn: ({ callId, isInitiator }: { callId: string; isInitiator: boolean }) =>
      joinVideoCall(consultationId, callId).then((call) => ({ call, isInitiator })),
    onSuccess: (result) => {
      setJoinedCall(result)
      invalidate()
    },
  })

  function submitMessage(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (message.trim() !== '') send.mutate(message.trim())
  }

  if (detailQuery.isPending) return <p role="status" className="font-display text-notice text-slate">Đang mở phiên tư vấn…</p>
  if (detailQuery.isError) return <ErrorNotice error={detailQuery.error} retryLabel="Mở lại phiên" onRetry={() => void detailQuery.refetch()} />
  const consultation = detailQuery.data
  if (consultation === undefined || user === null) return null

  const isDoctor = user.role === 'doctor'
  const canSend = consultation.status !== 'ended' && (!isDoctor || consultation.status === 'active')
  const activeCall = consultation.active_video_call
  const participantBackPath = isDoctor ? '/doctor/consultations' : '/consultations'
  const mutationError = accept.error ?? end.error ?? send.error ?? startCall.error ?? joinCall.error
  const callAction = activeCall === null
    ? { label: startCall.isPending ? 'Đang mở cuộc gọi…' : 'Gọi video', pending: startCall.isPending, action: () => startCall.mutate() }
    : { label: joinCall.isPending ? 'Đang vào cuộc gọi…' : activeCall.initiated_by_user_id === user.user_id ? 'Vào lại cuộc gọi' : 'Tham gia gọi video', pending: joinCall.isPending, action: () => joinCall.mutate({ callId: activeCall.call_id, isInitiator: activeCall.initiated_by_user_id === user.user_id }) }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface" aria-labelledby="consultation-chat-title">
        <header className="flex flex-wrap items-center justify-between gap-snug border-b border-line bg-surface px-cozy py-snug">
          <div className="min-w-0">
            <Link to={participantBackPath} className="font-display inline-flex min-h-touch items-center text-question font-semibold text-slate underline underline-offset-4 hover:text-body">Quay lại danh sách tư vấn</Link>
            <h1 id="consultation-chat-title" className="truncate text-heading font-semibold text-body">{isDoctor ? 'Trao đổi với bệnh nhân' : consultation.doctor.display_name}</h1>
            <p className="font-display mt-hair text-question text-slate">{isDoctor ? 'Phiên tư vấn bảo mật' : consultation.doctor.specialty} · {STATUS_LABEL[consultation.status]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-tight">
            {consultation.status === 'active' && joinedCall === null && <button type="button" disabled={callAction.pending} onClick={callAction.action} className="motion-press font-display min-h-touch rounded-pill border-2 border-slate px-cozy text-input font-semibold text-body hover:bg-canvas">{callAction.label}</button>}
            {consultation.status !== 'ended' && <button type="button" disabled={end.isPending} onClick={() => end.mutate()} className="motion-press font-display min-h-touch rounded-pill border-2 border-coral px-snug text-input font-semibold text-coral-deep hover:bg-sand">{end.isPending ? 'Đang kết thúc…' : 'Kết thúc'}</button>}
          </div>
        </header>

        {isDoctor && consultation.patient_context !== null && (
          <section aria-label="Thông tin lâm sàng được bệnh nhân cho phép dùng trong phiên tư vấn" className="border-b border-line bg-canvas px-cozy py-tight">
            <p className="font-display text-question text-slate"><span className="font-semibold text-body">Thông tin trong phiên:</span> {consultation.patient_context.age} tuổi · {consultation.patient_context.conditions.length > 0 ? consultation.patient_context.conditions.join(' · ') : 'Chưa có bệnh nền'}{consultation.patient_context.diagnosed_at !== null ? ` · Chẩn đoán ${consultation.patient_context.diagnosed_at}` : ''}</p>
          </section>
        )}

        {consultation.status === 'requested' && isDoctor && (
          <div className="border-b border-line bg-sand px-cozy py-snug">
            <p className="font-display text-input font-semibold text-sand-deep">Bệnh nhân đang chờ bạn nhận phiên tư vấn.</p>
            <button type="button" disabled={accept.isPending} onClick={() => accept.mutate()} className="motion-press font-display mt-tight min-h-touch rounded-pill bg-ink px-cozy text-input font-bold text-white hover:bg-ink-press">{accept.isPending ? 'Đang nhận phiên…' : 'Nhận phiên tư vấn'}</button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto bg-canvas px-snug py-cozy sm:px-block">
          <ol className="flex flex-col gap-snug" aria-live="polite">
            {consultation.status === 'requested' && !isDoctor && <li className="mx-auto max-w-[34rem] rounded-card bg-sand px-snug py-tight text-center"><p className="font-display text-question text-sand-deep">Bác sỹ đã nhận được yêu cầu. Bạn vẫn có thể để lại tin nhắn; bác sỹ sẽ trả lời sau khi nhận phiên.</p></li>}
            {consultation.messages.map((item) => {
              const mine = item.sender_role === (isDoctor ? 'doctor' : 'patient')
              return <li key={item.message_id} className={`max-w-[84%] sm:max-w-[70%] ${mine ? 'ml-auto' : 'mr-auto'}`}>
                <div className={`rounded-[1.35rem] px-snug py-tight ${mine ? 'rounded-br-md bg-mint text-ink' : 'rounded-bl-md border border-line bg-surface text-body'}`}>
                  {!mine && <p className="font-display text-question font-semibold text-slate">{item.sender_role === 'doctor' ? 'Bác sỹ' : 'Bệnh nhân'}</p>}
                  <p className={`${mine ? '' : 'mt-hair'} whitespace-pre-wrap text-input leading-relaxed`}>{item.content}</p>
                </div>
                <p className={`font-display mt-hair px-tight text-note text-slate ${mine ? 'text-right' : 'text-left'}`}>{formatDateTime(item.created_at)}</p>
              </li>
          })}
            {consultation.messages.length === 0 && <li className="mx-auto max-w-[28rem] rounded-card border border-dashed border-line bg-surface px-snug py-tight text-center"><p className="font-display text-question text-slate">Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện khi bạn sẵn sàng.</p></li>}
          </ol>
        </div>

        {canSend ? <form onSubmit={submitMessage} className="border-t border-line bg-surface px-snug py-snug sm:px-cozy">
          <label htmlFor="consultation-reply" className="sr-only">Nội dung tin nhắn</label>
          <div className="flex items-end gap-tight">
            <textarea id="consultation-reply" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} rows={1} placeholder="Nhập tin nhắn…" className="font-body min-h-touch min-w-0 flex-1 resize-y rounded-card border-2 border-slate bg-canvas px-snug py-tight text-input text-body focus:bg-surface" />
            <button type="submit" disabled={message.trim() === '' || send.isPending} className="motion-press font-display min-h-touch shrink-0 rounded-pill bg-mint px-cozy text-input font-bold text-mint-deep enabled:hover:bg-mint-press disabled:bg-canvas disabled:text-slate">{send.isPending ? 'Đang gửi…' : 'Gửi'}</button>
          </div>
        </form> : <p className="font-display border-t border-line bg-surface px-cozy py-snug text-question text-slate">{consultation.status === 'ended' ? 'Phiên tư vấn đã kết thúc. Bạn không thể gửi thêm tin nhắn.' : 'Bác sỹ cần nhận phiên trước khi có thể phản hồi.'}</p>}
      </section>

      {joinedCall !== null && <VideoConsultationCall consultationId={consultationId} call={joinedCall.call} isInitiator={joinedCall.isInitiator} onEnded={handleCallEnded} />}
      {mutationError !== null && mutationError !== undefined && <div className="absolute inset-x-snug bottom-snug z-30"><ErrorNotice error={mutationError} retryLabel="Thử lại" onRetry={() => void detailQuery.refetch()} /></div>}
    </div>
  )
}
