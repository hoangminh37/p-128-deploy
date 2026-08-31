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
import { CameraIcon, CameraSwitchIcon, CloseIcon, MicrophoneIcon, PhoneIcon } from './icons'

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

/** `getCapabilities` chưa có ở một số trình duyệt cũ, nên phải kiểm tra trước khi dùng. */
function supportedFacingModes(track: MediaStreamTrack): string[] {
  const capabilityTrack = track as MediaStreamTrack & {
    getCapabilities?: () => { facingMode?: string[] }
  }
  return capabilityTrack.getCapabilities?.().facingMode ?? []
}

export function VideoConsultationCall({ consultationId, call, isInitiator, onEnded }: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const latestSignalRef = useRef(0)
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const stoppingRef = useRef(false)
  const cameraDeviceIdsRef = useRef<string[]>([])
  const cameraOffRef = useRef(false)
  const [isMuted, setMuted] = useState(false)
  const [isCameraOff, setCameraOff] = useState(false)
  const [canSwitchCamera, setCanSwitchCamera] = useState(false)
  const [isSwitchingCamera, setSwitchingCamera] = useState(false)
  const [cameraMessage, setCameraMessage] = useState<string | null>(null)
  const [hasRemoteStream, setHasRemoteStream] = useState(false)
  const [connectionLabel, setConnectionLabel] = useState('Đang kết nối bảo mật…')
  const [error, setError] = useState<ApiError | Error | null>(null)
  const hasIceInfrastructure = validIceServers(call.ice_servers).length > 0

  /**
   * Nhận biết camera có thể đổi sau khi quyền đã được cấp. `enumerateDevices`
   * nhìn được mọi camera trên máy; `facingMode` xử lý các điện thoại chỉ lộ ra
   * một camera logic nhưng vẫn đổi được trước/sau qua driver.
   */
  const updateCameraSwitchAvailability = useCallback(async (track: MediaStreamTrack): Promise<void> => {
    const facingModes = new Set(
      supportedFacingModes(track).filter((mode) => mode === 'user' || mode === 'environment'),
    )

    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDeviceIds = [...new Set(
        devices
          .filter((device) => device.kind === 'videoinput' && device.deviceId !== '')
          .map((device) => device.deviceId),
      )]
      cameraDeviceIdsRef.current = videoDeviceIds
      setCanSwitchCamera(videoDeviceIds.length > 1 || facingModes.size > 1)
    } catch {
      // Không mở được danh sách thiết bị vẫn có thể đổi camera nếu driver báo
      // hai hướng nhìn. Không biến lỗi phụ này thành lỗi làm rớt cuộc gọi.
      setCanSwitchCamera(facingModes.size > 1)
    }
  }, [])

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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' } },
          audio: true,
        })
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        stream.getVideoTracks().forEach((track) => {
          track.enabled = !cameraOffRef.current
        })
        if (localVideoRef.current !== null) localVideoRef.current.srcObject = stream
        const localVideoTrack = stream.getVideoTracks()[0]
        if (localVideoTrack !== undefined) void updateCameraSwitchAvailability(localVideoTrack)

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
  }, [call.call_id, call.ice_servers, consultationId, finish, isInitiator, stopLocalMedia, updateCameraSwitchAvailability])

  function toggleMute(): void {
    const next = !isMuted
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
    setMuted(next)
  }

  function toggleCamera(): void {
    const next = !cameraOffRef.current
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !next
    })
    cameraOffRef.current = next
    setCameraOff(next)
  }

  async function switchCamera(): Promise<void> {
    const stream = streamRef.current
    const currentTrack = stream?.getVideoTracks()[0]
    const peer = peerRef.current
    if (stream === null || stream === undefined || currentTrack === undefined || peer === null || isSwitchingCamera) return

    setSwitchingCamera(true)
    setCameraMessage(null)
    let replacementStream: MediaStream | null = null

    try {
      const currentDeviceId = currentTrack.getSettings().deviceId
      const deviceIds = cameraDeviceIdsRef.current
      const currentIndex = currentDeviceId === undefined ? -1 : deviceIds.indexOf(currentDeviceId)
      const nextDeviceId = deviceIds.length > 1
        ? deviceIds[(currentIndex + 1 + deviceIds.length) % deviceIds.length]
        : undefined
      const currentFacingMode = currentTrack.getSettings().facingMode
      const nextFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment'
      replacementStream = await navigator.mediaDevices.getUserMedia({
        video: nextDeviceId === undefined
          ? { facingMode: { ideal: nextFacingMode } }
          : { deviceId: { exact: nextDeviceId } },
        audio: false,
      })
      const replacementTrack = replacementStream.getVideoTracks()[0]
      if (replacementTrack === undefined) {
        replacementStream.getTracks().forEach((track) => track.stop())
        replacementStream = null
        throw new Error('Không tìm thấy camera thay thế.')
      }

      const videoSender = peer.getSenders().find((sender) => sender.track?.kind === 'video')
      if (videoSender === undefined) {
        replacementStream.getTracks().forEach((track) => track.stop())
        replacementStream = null
        throw new Error('Không thể cập nhật luồng camera.')
      }

      replacementTrack.enabled = !cameraOffRef.current
      await videoSender.replaceTrack(replacementTrack)
      stream.removeTrack(currentTrack)
      stream.addTrack(replacementTrack)
      currentTrack.stop()
      if (localVideoRef.current !== null) localVideoRef.current.srcObject = stream
      // `replacementTrack` đã được gắn vào stream chính; không dừng nó trong
      // `catch` bên dưới khi phần còn lại của thao tác thành công.
      replacementStream = null
      await updateCameraSwitchAvailability(replacementTrack)
    } catch (cause) {
      replacementStream?.getTracks().forEach((track) => track.stop())
      console.error('Không thể đổi camera', cause)
      setCameraMessage('Không thể đổi camera trên thiết bị này. Bạn hãy thử lại.')
    } finally {
      setSwitchingCamera(false)
    }
  }

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="consultation-call-title"
      className="video-call-screen fixed inset-0 z-50 flex h-dvh min-h-dvh w-full flex-col overflow-hidden bg-ink text-white shadow-card"
    >
      <header className="video-call-header flex shrink-0 items-center justify-between gap-snug border-b border-white/10">
        <div className="min-w-0">
          <p id="consultation-call-title" className="truncate text-heading font-semibold text-white">Cuộc gọi tư vấn</p>
          <p aria-live="polite" className="font-display mt-hair truncate text-question text-mist">{connectionLabel}</p>
        </div>
        <button type="button" onClick={() => void finish(true)} className="motion-press grid min-h-touch min-w-touch shrink-0 place-items-center rounded-pill border-2 border-mist text-white hover:bg-white/10" aria-label="Đóng cuộc gọi">
          <CloseIcon className="h-6 w-6" />
        </button>
      </header>

      <div className="video-call-stage relative min-h-0 flex-1 overflow-hidden bg-black">
        <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-contain" />
        {!hasRemoteStream && <p className="absolute inset-0 flex items-center justify-center px-cozy text-center text-input text-mist">{connectionLabel}</p>}

        <div className="video-call-local absolute aspect-video overflow-hidden rounded-card border-2 border-white/70 bg-slate/30 shadow-card">
          <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          {isCameraOff && <p className="font-display absolute inset-0 grid place-items-center bg-ink/80 px-tight text-center text-note text-white">Camera đang tắt</p>}
          <p className="font-display absolute bottom-1 left-1 rounded-pill bg-ink/80 px-tight py-px text-note text-white">Bạn</p>
        </div>

        {error !== null && <div className="absolute inset-x-snug bottom-snug z-10"><ErrorNotice error={error} retryLabel="Đóng cuộc gọi" onRetry={() => void finish(true)} /></div>}
      </div>

      <footer className="video-call-controls shrink-0 border-t border-white/10">
        {!hasIceInfrastructure && <p className="video-call-network-note font-display rounded-card bg-white/10 px-snug py-tight text-question text-mist">Đang thử kết nối trực tiếp giữa hai thiết bị. Để gọi ổn định khi hai bên ở khác mạng, hệ thống cần máy chủ TURN do đội vận hành cấu hình.</p>}
        {cameraMessage !== null && <p aria-live="polite" className="font-display mt-tight text-center text-question text-coral">{cameraMessage}</p>}

        <div className={`video-call-actions grid gap-tight ${canSwitchCamera ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
          <button type="button" onClick={toggleMute} className="motion-press font-display flex min-h-touch min-w-0 items-center justify-center gap-tight rounded-pill border-2 border-mist px-snug text-input font-semibold text-white hover:bg-white/10" aria-label={isMuted ? 'Bật micro' : 'Tắt micro'}>
            <MicrophoneIcon className="h-5 w-5 shrink-0" />
            <span>{isMuted ? 'Bật micro' : 'Tắt micro'}</span>
          </button>
          <button type="button" onClick={toggleCamera} className="motion-press font-display flex min-h-touch min-w-0 items-center justify-center gap-tight rounded-pill border-2 border-mist px-snug text-input font-semibold text-white hover:bg-white/10" aria-label={isCameraOff ? 'Bật camera' : 'Tắt camera'}>
            <CameraIcon className="h-5 w-5 shrink-0" />
            <span>{isCameraOff ? 'Bật camera' : 'Tắt camera'}</span>
          </button>
          {canSwitchCamera && <button type="button" disabled={isSwitchingCamera} onClick={() => void switchCamera()} className="motion-press font-display flex min-h-touch min-w-0 items-center justify-center gap-tight rounded-pill border-2 border-mist px-snug text-input font-semibold text-white enabled:hover:bg-white/10 disabled:cursor-wait disabled:text-mist" aria-label="Đổi camera">
            <CameraSwitchIcon className="h-5 w-5 shrink-0" />
            <span>{isSwitchingCamera ? 'Đang đổi…' : 'Đổi camera'}</span>
          </button>}
          <button type="button" onClick={() => void finish(true)} className="motion-press font-display col-span-2 flex min-h-touch min-w-0 items-center justify-center gap-tight rounded-pill bg-coral px-snug text-input font-bold text-ink hover:brightness-105 sm:col-span-1">
            <PhoneIcon className="h-5 w-5 shrink-0" />
            <span>Kết thúc cuộc gọi</span>
          </button>
        </div>
      </footer>
    </section>
  )
}
