/**
 * The media room for one already-authorized consultation.
 *
 * The API only stores WebRTC offers, answers and ICE candidates. Camera and
 * microphone bytes flow directly between the two browsers; they are never
 * uploaded to the application server or persisted in its database.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  ApiError,
  endVideoCall,
  getVideoSignals,
  postVideoSignal,
} from '../lib/api'
import type { VideoCallStart } from '../lib/schemas'
import { ErrorNotice } from './ErrorNotice'

type Props = {
  consultationId: string
  call: VideoCallStart
  /** True only for the participant who sent the initial offer. */
  isInitiator: boolean
  onEnded: () => void
}

function serializableCandidate(candidate: RTCIceCandidate): Record<string, unknown> {
  if (typeof candidate.toJSON === 'function') return candidate.toJSON() as Record<string, unknown>
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment,
  }
}

function serializableDescription(description: RTCSessionDescriptionInit): Record<string, unknown> {
  return { type: description.type, sdp: description.sdp ?? '' }
}

/** Only pass server-provided, structurally valid ICE configuration to WebRTC. */
function validIceServers(rawServers: VideoCallStart['ice_servers']): RTCIceServer[] {
  const iceServers: RTCIceServer[] = []
  for (const raw of rawServers) {
    const urls = raw.urls
    if (typeof urls !== 'string' && !(Array.isArray(urls) && urls.every((url) => typeof url === 'string'))) {
      continue
    }
    const server: RTCIceServer = { urls }
    if (typeof raw.username === 'string') server.username = raw.username
    if (typeof raw.credential === 'string') server.credential = raw.credential
    iceServers.push(server)
  }
  return iceServers
}

function mediaErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'SecurityError') {
    return 'Cuộc gọi video cần mở ứng dụng trên địa chỉ an toàn (HTTPS hoặc localhost).'
  }
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Trình duyệt chưa được cấp quyền camera hoặc micro. Hãy cấp quyền rồi vào lại cuộc gọi.'
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'Không tìm thấy camera hoặc micro trên thiết bị này.'
  }
  if (error instanceof DOMException && error.name === 'NotReadableError') {
    return 'Camera hoặc micro đang được một ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.'
  }
  return 'Không thể khởi động camera và micro cho cuộc gọi. Bạn hãy thử lại.'
}

export function VideoConsultationCall({ consultationId, call, isInitiator, onEnded }: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const latestSignalRef = useRef(0)
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const stoppingRef = useRef(false)
  const [isMuted, setMuted] = useState(false)
  const [isCameraOff, setCameraOff] = useState(false)
  const [hasRemoteStream, setHasRemoteStream] = useState(false)
  const [connectionLabel, setConnectionLabel] = useState('Đang kết nối bảo mật…')
  const [error, setError] = useState<ApiError | Error | null>(null)
  const hasIceInfrastructure = validIceServers(call.ice_servers).length > 0

  const stopLocalMedia = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (localVideoRef.current !== null) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current !== null) remoteVideoRef.current.srcObject = null
    peerRef.current?.close()
    peerRef.current = null
  }, [])

  const finish = useCallback(
    async (notifyOtherPerson: boolean) => {
      if (stoppingRef.current) return
      stoppingRef.current = true
      stopLocalMedia()
      if (notifyOtherPerson) {
        try {
          await endVideoCall(consultationId, call.call_id)
        } catch (cause) {
          // Media is already stopped locally. Keeping the room open after a
          // failed hangup would be worse than leaving a stale server status.
          console.error('Không thể báo kết thúc cuộc gọi', cause)
        }
      }
      onEnded()
    },
    [call.call_id, consultationId, onEnded, stopLocalMedia],
  )

  useEffect(() => {
    let disposed = false
    let pollTimer: number | null = null

    async function addCandidate(peer: RTCPeerConnection, payload: Record<string, unknown>): Promise<void> {
      const candidate = payload as RTCIceCandidateInit
      if (peer.remoteDescription === null) {
        queuedCandidatesRef.current.push(candidate)
        return
      }
      await peer.addIceCandidate(candidate)
    }

    async function flushCandidates(peer: RTCPeerConnection): Promise<void> {
      const queued = queuedCandidatesRef.current.splice(0)
      for (const candidate of queued) await peer.addIceCandidate(candidate)
    }

    async function processSignal(
      peer: RTCPeerConnection,
      kind: 'offer' | 'answer' | 'candidate' | 'hangup',
      payload: Record<string, unknown>,
    ): Promise<void> {
      if (kind === 'hangup') {
        await finish(false)
        return
      }
      if (kind === 'candidate') {
        await addCandidate(peer, payload)
        return
      }
      if (kind === 'offer') {
        await peer.setRemoteDescription(payload as unknown as RTCSessionDescriptionInit)
        await flushCandidates(peer)
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        await postVideoSignal(consultationId, call.call_id, {
          kind: 'answer',
          payload: serializableDescription(answer),
        })
        return
      }
      await peer.setRemoteDescription(payload as unknown as RTCSessionDescriptionInit)
      await flushCandidates(peer)
    }

    async function pollSignals(peer: RTCPeerConnection): Promise<void> {
      try {
        const batch = await getVideoSignals(consultationId, call.call_id, latestSignalRef.current)
        for (const signal of batch.signals) {
          latestSignalRef.current = Math.max(latestSignalRef.current, signal.signal_id)
          await processSignal(peer, signal.kind, signal.payload)
          if (disposed || stoppingRef.current) return
        }
      } catch (cause) {
        if (!disposed && !stoppingRef.current) {
          setError(cause instanceof Error ? cause : new Error('Không đọc được trạng thái cuộc gọi.'))
        }
      }
    }

    async function start(): Promise<void> {
      if (!window.isSecureContext) {
        setError(new Error('Cuộc gọi video cần mở ứng dụng trên HTTPS hoặc localhost để dùng camera và micro.'))
        return
      }
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
        setError(new Error('Trình duyệt này chưa hỗ trợ cuộc gọi video. Hãy mở bằng trình duyệt hiện đại.'))
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (localVideoRef.current !== null) localVideoRef.current.srcObject = stream

        const peer = new RTCPeerConnection({ iceServers: validIceServers(call.ice_servers) })
        peerRef.current = peer
        stream.getTracks().forEach((track) => peer.addTrack(track, stream))
        peer.ontrack = (event) => {
          if (remoteVideoRef.current !== null) remoteVideoRef.current.srcObject = event.streams[0]
          setHasRemoteStream(true)
        }
        peer.onicecandidate = (event) => {
          if (event.candidate === null || disposed || stoppingRef.current) return
          void postVideoSignal(consultationId, call.call_id, {
            kind: 'candidate',
            payload: serializableCandidate(event.candidate),
          }).catch((cause: unknown) => {
            if (!disposed) setError(cause instanceof Error ? cause : new Error('Không gửi được kết nối cuộc gọi.'))
          })
        }
        peer.onconnectionstatechange = () => {
          if (peer.connectionState === 'connected') setConnectionLabel('Đã kết nối với người tư vấn')
          if (peer.connectionState === 'connecting') setConnectionLabel('Đang kết nối bảo mật…')
          if (peer.connectionState === 'failed') {
            setConnectionLabel('Không thể kết nối video')
            setError(new Error('Kết nối video không thành công. Hãy kiểm tra mạng rồi thử gọi lại.'))
          }
          if (peer.connectionState === 'disconnected') setConnectionLabel('Kết nối đang gián đoạn…')
        }
        peer.oniceconnectionstatechange = () => {
          if (peer.iceConnectionState === 'failed') {
            setConnectionLabel('Không tìm được đường kết nối giữa hai thiết bị')
            setError(new Error('Không thể kết nối video qua mạng hiện tại. Hãy thử lại; nếu hai bên ở khác mạng, máy chủ TURN cần được cấu hình.'))
          }
        }

        if (isInitiator) {
          const offer = await peer.createOffer()
          await peer.setLocalDescription(offer)
          await postVideoSignal(consultationId, call.call_id, {
            kind: 'offer',
            payload: serializableDescription(offer),
          })
          setConnectionLabel('Đang chờ người kia tham gia…')
        }
        await pollSignals(peer)
        pollTimer = window.setInterval(() => void pollSignals(peer), 1_000)
      } catch (cause) {
        if (disposed) return
        if (cause instanceof ApiError) {
          setError(cause)
          return
        }
        if (cause instanceof DOMException) {
          setError(new Error(mediaErrorMessage(cause)))
          return
        }
        setError(new Error('Không thể thiết lập kết nối video. Hãy kiểm tra mạng rồi thử lại.'))
      }
    }

    void start()
    return () => {
      disposed = true
      if (pollTimer !== null) window.clearInterval(pollTimer)
      stopLocalMedia()
    }
  }, [call.call_id, call.ice_servers, consultationId, finish, isInitiator, stopLocalMedia])

  function toggleMute(): void {
    const next = !isMuted
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
    setMuted(next)
  }

  function toggleCamera(): void {
    const next = !isCameraOff
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !next
    })
    setCameraOff(next)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/35 backdrop-blur-[1px]" aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="consultation-call-title"
        className="fixed inset-x-snug top-snug z-50 mx-auto w-auto max-w-3xl overflow-hidden rounded-card-lg border border-white/10 bg-ink p-snug text-white shadow-card sm:top-block sm:p-cozy"
      >
        <div className="flex items-start justify-between gap-snug">
          <div>
            <p id="consultation-call-title" className="text-heading font-semibold text-white">Cuộc gọi tư vấn</p>
            <p aria-live="polite" className="font-display mt-hair text-question text-mist">{connectionLabel}</p>
          </div>
          <button type="button" onClick={() => void finish(true)} className="motion-press font-display min-h-touch rounded-pill border-2 border-mist px-snug text-question font-semibold text-white hover:bg-white/10">
            Đóng
          </button>
        </div>

        <div className="relative mt-snug aspect-video overflow-hidden rounded-card bg-slate/30">
          <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
          {!hasRemoteStream && <p className="absolute inset-0 flex items-center justify-center px-cozy text-center text-input text-mist">{connectionLabel}</p>}

          <div className="absolute bottom-tight right-tight h-[30%] min-h-20 w-[30%] min-w-28 overflow-hidden rounded-card border-2 border-white/70 bg-slate/30 shadow-card">
            <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            <p className="font-display absolute bottom-1 left-1 rounded-pill bg-ink/80 px-tight py-px text-note text-white">Bạn</p>
          </div>
        </div>

        {!hasIceInfrastructure && <p className="font-display mt-tight rounded-card bg-white/10 px-snug py-tight text-question text-mist">Đang thử kết nối trực tiếp giữa hai thiết bị. Để gọi ổn định khi hai bên ở khác mạng, hệ thống cần máy chủ TURN do đội vận hành cấu hình.</p>}

        {error !== null && <div className="mt-snug"><ErrorNotice error={error} retryLabel="Đóng cuộc gọi" onRetry={() => void finish(true)} /></div>}

        <div className="mt-snug flex flex-wrap justify-center gap-tight">
          <button type="button" onClick={toggleMute} className="motion-press font-display min-h-touch rounded-pill border-2 border-mist px-cozy text-input font-semibold text-white hover:bg-white/10" aria-label={isMuted ? 'Bật micro' : 'Tắt micro'}>
            {isMuted ? 'Bật micro' : 'Tắt micro'}
          </button>
          <button type="button" onClick={toggleCamera} className="motion-press font-display min-h-touch rounded-pill border-2 border-mist px-cozy text-input font-semibold text-white hover:bg-white/10" aria-label={isCameraOff ? 'Bật camera' : 'Tắt camera'}>
            {isCameraOff ? 'Bật camera' : 'Tắt camera'}
          </button>
          <button type="button" onClick={() => void finish(true)} className="motion-press font-display min-h-touch rounded-pill bg-coral px-cozy text-input font-bold text-ink hover:brightness-105">
            Kết thúc cuộc gọi
          </button>
        </div>
      </section>
    </>
  )
}
