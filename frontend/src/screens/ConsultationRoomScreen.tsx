/**
 * Một phòng tư vấn — chat lưu trên máy chủ, và cuộc gọi video có kiểm soát.
 *
 * MỘT MÀN, HAI PHÍA. CHÉP TỪ `id="tvpg"` (phía bệnh nhân) và `id="bsphong"`
 * (phía bác sỹ) của bản mẫu. Hai bản mẫu đó dùng CHUNG một bộ khung —
 * `.phong-dau` ghim trên, `.phong-luong` cuộn ở giữa, `.phong-soan` ghim dưới —
 * và chỉ khác nhau ở ba chỗ, đúng ba chỗ mà hai vai thật sự khác nhau:
 *
 *   ĐẦU PHÒNG  bệnh nhân đọc tên bác sỹ; bác sỹ chỉ đọc "Trao đổi với bệnh
 *              nhân", vì danh tính bệnh nhân không phải cái để trưng ở tiêu đề.
 *   DẢI TÍM    chỉ bác sỹ mới có: tuổi và bệnh nền bệnh nhân cho phép dùng.
 *   DẢI 115    chỉ bệnh nhân mới có. Người đang đau ngực mà ngồi chờ tin nhắn
 *              là tình huống nguy hiểm nhất của cả sản phẩm này, nên lối thoát
 *              cấp cứu nằm NGAY TRÊN ô soạn tin, không nằm cuối trang.
 *
 * Ô SOẠN TIN TẮT KHI CHƯA ĐƯỢC PHÉP GỬI, và nói rõ vì sao ngay trong chỗ nhập:
 * bác sỹ phải nhận phiên trước, hoặc phiên đã đóng. Bản mẫu để sẵn cả trạng
 * thái mờ đó ở `#bsphong`.
 *
 * Khung `.main.phong` do `RootLayout` dựng, nên màn này trả về thẳng các khối
 * con — chèn thêm một lớp bọc là bố cục ba tầng ghim/cuộn/ghim vỡ ngay.
 */
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
  requested: 'Cần nhận phiên',
  active: 'Đang tư vấn',
  ended: 'Đã kết thúc',
}

/** Chip trạng thái: tím là việc đang chờ, xanh là phiên đang chạy, trơn là đã đóng. */
const STATUS_CHIP: Record<ConsultationStatus, string> = {
  requested: 'chip cho',
  active: 'chip duyet',
  ended: 'chip',
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

  if (detailQuery.isPending) {
    return (
      <p role="status" className="lab" style={{ padding: '20px var(--pad-main)' }}>
        Đang mở phiên tư vấn…
      </p>
    )
  }
  if (detailQuery.isError) {
    return (
      <div style={{ padding: '20px var(--pad-main)' }}>
        <ErrorNotice
          error={detailQuery.error}
          retryLabel="Mở lại phiên"
          onRetry={() => void detailQuery.refetch()}
        />
      </div>
    )
  }
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
  const composerPlaceholder = canSend
    ? isDoctor
      ? 'Nhắn cho bệnh nhân'
      : 'Nhắn cho bác sỹ'
    : consultation.status === 'ended'
      ? 'Phiên tư vấn đã kết thúc, không gửi thêm tin nhắn được.'
      : 'Bác sỹ cần nhận phiên trước khi có thể phản hồi.'

  return (
    <>
      <div className="phong-dau">
        <Link to={participantBackPath} className="btn sm gh">
          Quay lại danh sách tư vấn
        </Link>

        <div
          style={{
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginTop: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: 'var(--t-h3)' }}>
              {isDoctor ? 'Trao đổi với bệnh nhân' : consultation.doctor.display_name}
            </h1>
            <p className="lab">
              {isDoctor
                ? 'Phiên tư vấn bảo mật'
                : `${consultation.doctor.specialty} · Buổi tư vấn riêng tư`}
            </p>
          </div>

          <span className={STATUS_CHIP[consultation.status]}>
            {STATUS_LABEL[consultation.status]}
          </span>

          {isDoctor && consultation.status === 'requested' && (
            <button
              type="button"
              disabled={accept.isPending}
              onClick={() => accept.mutate()}
              className="btn pri sm"
            >
              {accept.isPending ? 'Đang nhận phiên…' : 'Nhận phiên tư vấn'}
            </button>
          )}

          {consultation.status === 'active' && joinedCall === null && (
            <button
              type="button"
              disabled={callAction.pending}
              onClick={callAction.action}
              className="btn sm"
            >
              {callAction.label}
            </button>
          )}

          {consultation.status !== 'ended' && (
            <button
              type="button"
              disabled={end.isPending}
              onClick={() => end.mutate()}
              className="btn sm gh"
            >
              {end.isPending ? 'Đang kết thúc…' : 'Kết thúc'}
            </button>
          )}
        </div>

        {/* Dải tím của `id="bsphong"` — CHỈ phía bác sỹ, và chỉ những gì bệnh
            nhân đã cho phép dùng trong phiên. */}
        {isDoctor && consultation.patient_context !== null && (
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              background: 'var(--tim-wash)',
              borderLeft: '2px solid var(--tim)',
            }}
          >
            <span className="lab" style={{ color: 'var(--tim)' }}>
              Thông tin lâm sàng bệnh nhân cho phép dùng
            </span>
            <p style={{ fontSize: 'var(--t-note)', marginTop: 5 }}>
              {consultation.patient_context.age} tuổi ·{' '}
              {consultation.patient_context.conditions.length > 0
                ? consultation.patient_context.conditions.join(', ')
                : 'chưa ghi nhận bệnh nền'}
              {consultation.patient_context.diagnosed_at !== null &&
                ` · chẩn đoán ${consultation.patient_context.diagnosed_at}`}
            </p>
          </div>
        )}
      </div>

      <div className="phong-luong" aria-live="polite">
        {consultation.status === 'requested' && !isDoctor && (
          <p
            className="lab"
            style={{
              alignSelf: 'center',
              maxWidth: '52ch',
              textAlign: 'center',
              lineHeight: 1.6,
            }}
          >
            Bác sỹ đã nhận được yêu cầu. Bạn vẫn có thể để lại tin nhắn; bác sỹ sẽ trả lời sau
            khi nhận phiên.
          </p>
        )}

        {consultation.messages.map((item) => {
          const mine = item.sender_role === (isDoctor ? 'doctor' : 'patient')
          return (
            <div key={item.message_id} className={mine ? 'bb minh' : 'bb ho'}>
              {/* Bản mẫu ghi vai người nói trên mỗi bóng của phía bên kia. Mốc
                  giờ đi kèm ngay trên dòng đó — hai người đang chờ nhau trả
                  lời, nên "gửi lúc nào" là thông tin phải đọc được. */}
              <span className="lab" style={mine ? { display: 'block', textAlign: 'right' } : undefined}>
                {mine ? '' : `${item.sender_role === 'doctor' ? 'Bác sỹ' : 'Bệnh nhân'} · `}
                {formatDateTime(item.created_at)}
              </span>
              <div className="bong">{item.content}</div>
            </div>
          )
        })}

        {consultation.messages.length === 0 && (
          <p
            className="lab"
            style={{
              alignSelf: 'center',
              maxWidth: '46ch',
              textAlign: 'center',
              lineHeight: 1.6,
            }}
          >
            Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện khi bạn sẵn sàng.
          </p>
        )}
      </div>

      {/* `.canh-115` của `id="tvpg"` — chỉ phía bệnh nhân, đặt ngay trên ô soạn tin. */}
      {!isDoctor && (
        <div className="canh-115">
          <p>
            Nếu bạn thấy đau ngực dữ dội, khó thở, méo miệng hay yếu nửa người, hãy gọi cấp cứu
            ngay, đừng ngồi chờ bác sỹ trả lời.
          </p>
          <a className="btn sm" href="tel:115">
            Gọi 115
          </a>
        </div>
      )}

      {mutationError !== null && mutationError !== undefined && (
        <div style={{ flex: 'none', padding: '12px var(--pad-main) 0' }}>
          <ErrorNotice
            error={mutationError}
            retryLabel="Thử lại"
            onRetry={() => void detailQuery.refetch()}
          />
        </div>
      )}

      <form className="phong-soan" onSubmit={submitMessage}>
        <label htmlFor="consultation-reply" className="sr-only">
          Nội dung tin nhắn
        </label>
        <input
          id="consultation-reply"
          className="o"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={4000}
          disabled={!canSend}
          autoComplete="off"
          placeholder={composerPlaceholder}
        />
        <button
          type="submit"
          className="btn pri"
          disabled={!canSend || message.trim() === '' || send.isPending}
          style={!canSend ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        >
          {send.isPending ? 'Đang gửi…' : 'Gửi'}
        </button>
      </form>

      {joinedCall !== null && (
        <VideoConsultationCall
          consultationId={consultationId}
          call={joinedCall.call}
          isInitiator={joinedCall.isInitiator}
          onEnded={handleCallEnded}
        />
      )}
    </>
  )
}
