/**
 * Compact voice recorder for the patient chat.
 *
 * The waveform is drawn from the actual `AnalyserNode` samples. It is not a
 * canned animation: when no microphone/audio is active it becomes a quiet
 * baseline, and when the patient or assistant speaks its bars change with the
 * real signal.
 */
import { useEffect, useRef, useState } from 'react'

type VoiceMode = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

export type VoiceSubmitResult = {
  transcript: string
  messageId: string
  /** Red-flag guidance remains visible text and is deliberately not synthesized. */
  canSpeak: boolean
}

type Props = {
  onClose: () => void
  onSubmitAudio: (audio: Blob) => Promise<VoiceSubmitResult>
  onLoadSpeech: (messageId: string) => Promise<Blob>
}

const SILENCE_TIMEOUT_MS = 12_000
const INPUT_LEVEL_THRESHOLD = 0.025

function userMessage(error: unknown): string {
  if (
    error !== null &&
    typeof error === 'object' &&
    'userMessage' in error &&
    typeof error.userMessage === 'string'
  ) {
    return error.userMessage
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Không thể hoàn tất cuộc trò chuyện bằng giọng nói. Bạn hãy thử lại.'
}

function statusFor(mode: VoiceMode, error: string | null, notice: string | null): string {
  if (mode === 'error') return error ?? 'Có lỗi xảy ra. Bạn có thể thử lại.'
  if (mode === 'listening') return 'Đang nghe. Bấm Gửi khi bạn nói xong.'
  if (mode === 'processing') return 'Đang xử lý câu hỏi của bạn…'
  if (mode === 'speaking') return 'Trợ lý đang nói. Bấm Nói chen nếu cần.'
  return notice ?? 'Bấm Bắt đầu để đặt câu hỏi bằng giọng nói.'
}

export function VoiceChatWidget({ onClose, onSubmitAudio, onLoadSpeech }: Props) {
  const primaryActionRef = useRef<HTMLButtonElement>(null)
  const waveformRef = useRef<HTMLCanvasElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const microphoneStreamRef = useRef<MediaStream | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const inputContextRef = useRef<AudioContext | null>(null)
  const outputContextRef = useRef<AudioContext | null>(null)
  const meterFrameRef = useRef<number | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const shouldSubmitRecordingRef = useRef(true)
  const lastSpeechAtRef = useRef(0)
  const mountedRef = useRef(true)

  const [mode, setMode] = useState<VoiceMode>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<string | null>(null)

  useEffect(() => {
    // React StrictMode chạy một vòng setup → cleanup → setup bổ sung ở dev để
    // phát hiện side effect. Cleanup dưới đây đặt cờ false để hủy getUserMedia
    // đang chờ; lần setup thứ hai PHẢI bật lại, nếu không mọi micro stream lấy
    // được sau đó đều bị stop ngay tại `beginListening`.
    mountedRef.current = true
    primaryActionRef.current?.focus()
    drawWaveform()

    const onResize = () => drawWaveform()
    window.addEventListener('resize', onResize)
    return () => {
      mountedRef.current = false
      window.removeEventListener('resize', onResize)
      stopPlayback()
      stopInput(false)
    }
    // The refs and helpers intentionally remain stable for the component life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        finishConversation()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    if (meterFrameRef.current === null) drawWaveform()
    // Redraw the quiet line in the state color after a transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  function drawWaveform(samples?: Uint8Array): void {
    const canvas = waveformRef.current
    if (canvas === null) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width <= 0 || height <= 0) return

    const pixelRatio = window.devicePixelRatio || 1
    const pixelWidth = Math.round(width * pixelRatio)
    const pixelHeight = Math.round(height * pixelRatio)
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }

    const context = canvas.getContext('2d')
    if (context === null) return
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, width, height)
    context.lineCap = 'round'
    context.lineWidth = 2.5
    // Dự phòng là `color` đã tính của chính `<canvas>` — nó luôn giải ra một
    // màu hợp lệ và luôn đi theo chế độ sáng/tối, khác một mã hex gõ cứng vốn
    // sẽ sai ở đúng một trong hai chế độ. Mọi mã màu của ứng dụng nằm ở
    // `index.css`, kể cả những mã chỉ dùng làm dự phòng.
    const computed = getComputedStyle(canvas)
    context.strokeStyle =
      computed.getPropertyValue('--voice-wave-color').trim() || computed.color

    const bars = Math.max(30, Math.floor(width / 8))
    const gap = width / bars
    const centerY = height / 2
    const bucketSize = samples === undefined ? 0 : Math.max(1, Math.floor(samples.length / bars))

    for (let index = 0; index < bars; index += 1) {
      let amplitude = 0
      if (samples !== undefined) {
        const start = index * bucketSize
        const end = Math.min(samples.length, start + bucketSize)
        for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
          amplitude += Math.abs(samples[sampleIndex] - 128) / 128
        }
        amplitude /= Math.max(1, end - start)
      }

      const barHeight = Math.max(5, Math.min(height * 0.86, amplitude * height * 4.2))
      const x = (index + 0.5) * gap
      context.beginPath()
      context.moveTo(x, centerY - barHeight / 2)
      context.lineTo(x, centerY + barHeight / 2)
      context.stroke()
    }
  }

  function stopMeter(): void {
    if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current)
    meterFrameRef.current = null
    drawWaveform()
  }

  function closeInputContext(): void {
    const context = inputContextRef.current
    inputContextRef.current = null
    if (context !== null && context.state !== 'closed') void context.close()
  }

  function closeOutputContext(): void {
    const context = outputContextRef.current
    outputContextRef.current = null
    if (context !== null && context.state !== 'closed') void context.close()
  }

  /**
   * Prime the output context while this still runs inside a click. Waiting for
   * STT + RAG before creating it causes browsers to reject delayed autoplay.
   */
  function primePlaybackContext(): void {
    if (typeof AudioContext === 'undefined') return
    const existing = outputContextRef.current
    if (existing !== null && existing.state !== 'closed') {
      void existing.resume()
      return
    }
    try {
      const context = new AudioContext()
      outputContextRef.current = context
      void context.resume()
    } catch {
      // The verified text answer remains visible if Web Audio is unavailable.
    }
  }

  function startMicrophoneMeter(stream: MediaStream): void {
    if (typeof AudioContext === 'undefined') return
    try {
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      const samples = new Uint8Array(analyser.fftSize)
      context.createMediaStreamSource(stream).connect(analyser)
      inputContextRef.current = context
      lastSpeechAtRef.current = Date.now()

      const draw = () => {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) {
          const value = (sample - 128) / 128
          sum += value * value
        }
        const level = Math.sqrt(sum / samples.length)
        drawWaveform(samples)
        if (level >= INPUT_LEVEL_THRESHOLD) lastSpeechAtRef.current = Date.now()
        if (Date.now() - lastSpeechAtRef.current >= SILENCE_TIMEOUT_MS) {
          stopInput(false)
          if (mountedRef.current) {
            setMode('error')
            setError('Tôi chưa nghe thấy giọng nói. Bạn hãy kiểm tra micro rồi thử lại.')
          }
          return
        }
        meterFrameRef.current = requestAnimationFrame(draw)
      }
      meterFrameRef.current = requestAnimationFrame(draw)
    } catch {
      // Recording remains usable if the optional waveform cannot start.
    }
  }

  function stopInput(submit: boolean): void {
    stopMeter()
    closeInputContext()
    shouldSubmitRecordingRef.current = submit
    const recorder = recorderRef.current
    if (recorder?.state === 'recording') {
      recorder.stop()
      return
    }
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop())
    microphoneStreamRef.current = null
  }

  function stopPlayback(): void {
    stopMeter()
    const player = audioElementRef.current
    audioElementRef.current = null
    if (player !== null) {
      player.pause()
      player.src = ''
    }
    closeOutputContext()
    if (audioUrlRef.current !== null) URL.revokeObjectURL(audioUrlRef.current)
    audioUrlRef.current = null
  }

  async function beginListening(): Promise<void> {
    if (mode === 'processing') return
    stopPlayback()
    stopInput(false)
    primePlaybackContext()
    setError(null)
    setNotice(null)
    setTranscript(null)

    if (!window.isSecureContext) {
      setMode('error')
      setError('Micro chỉ hoạt động trên HTTPS hoặc localhost. Bạn hãy mở ứng dụng bằng http://localhost:5180.')
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMode('error')
      setError('Trình duyệt này chưa hỗ trợ ghi âm. Bạn vẫn có thể nhập câu hỏi.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      )
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const chunks: Blob[] = []
      microphoneStreamRef.current = stream
      recorderRef.current = recorder
      shouldSubmitRecordingRef.current = true

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        recorderRef.current = null
        microphoneStreamRef.current?.getTracks().forEach((track) => track.stop())
        microphoneStreamRef.current = null
        closeInputContext()
        stopMeter()
        const recording = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (!mountedRef.current || !shouldSubmitRecordingRef.current) return
        if (recording.size === 0) {
          setMode('error')
          setError('Không thu được âm thanh. Bạn hãy kiểm tra micro rồi thử lại.')
          return
        }
        void processRecording(recording)
      }
      recorder.onerror = () => {
        if (!mountedRef.current) return
        setMode('error')
        setError('Việc ghi âm bị gián đoạn. Bạn hãy thử lại.')
      }

      recorder.start()
      startMicrophoneMeter(stream)
      setMode('listening')
    } catch (cause) {
      const denied = cause instanceof DOMException && cause.name === 'NotAllowedError'
      setMode('error')
      setError(
        denied
          ? 'Bạn cần cho phép dùng micro trong cài đặt trình duyệt để trò chuyện bằng giọng nói.'
          : 'Không thể mở micro. Bạn hãy kiểm tra thiết bị rồi thử lại.',
      )
    }
  }

  function endListening(): void {
    primePlaybackContext()
    stopInput(true)
    setMode('processing')
  }

  async function processRecording(recording: Blob): Promise<void> {
    setMode('processing')
    try {
      const result = await onSubmitAudio(recording)
      if (!mountedRef.current) return
      setTranscript(result.transcript)
      if (!result.canSpeak) {
        setMode('idle')
        setNotice('Hướng dẫn quan trọng đã hiện trong phần chat để bạn đọc ngay.')
        return
      }
      await beginSpeaking(result.messageId)
    } catch (cause) {
      if (!mountedRef.current) return
      setMode('error')
      setError(userMessage(cause))
    }
  }

  async function beginSpeaking(messageId: string): Promise<void> {
    setMode('processing')
    const blob = await onLoadSpeech(messageId)
    if (!mountedRef.current) return
    const url = URL.createObjectURL(blob)
    audioUrlRef.current = url
    const player = new Audio(url)
    audioElementRef.current = player
    player.onended = () => {
      stopPlayback()
      if (mountedRef.current) setMode('idle')
    }
    player.onerror = () => {
      stopPlayback()
      if (mountedRef.current) {
        setMode('error')
        setError('Không thể phát âm thanh. Câu trả lời vẫn có ở phần chat.')
      }
    }

    if (typeof AudioContext !== 'undefined') {
      try {
        const context = outputContextRef.current ?? new AudioContext()
        const analyser = context.createAnalyser()
        analyser.fftSize = 256
        const samples = new Uint8Array(analyser.fftSize)
        const source = context.createMediaElementSource(player)
        source.connect(analyser)
        analyser.connect(context.destination)
        if (context.state !== 'running') await context.resume()
        outputContextRef.current = context
        const draw = () => {
          analyser.getByteTimeDomainData(samples)
          drawWaveform(samples)
          meterFrameRef.current = requestAnimationFrame(draw)
        }
        meterFrameRef.current = requestAnimationFrame(draw)
      } catch {
        // The audio can still play if the browser cannot expose an analyser.
      }
    }

    await player.play()
    if (mountedRef.current) setMode('speaking')
  }

  function handlePrimaryAction(): void {
    if (mode === 'listening') {
      endListening()
      return
    }
    void beginListening()
  }

  function finishConversation(): void {
    stopPlayback()
    stopInput(false)
    onClose()
  }

  const status = statusFor(mode, error, notice)
  const primaryLabel =
    mode === 'listening'
      ? 'Gửi'
      : mode === 'speaking'
        ? 'Nói chen'
        : mode === 'processing'
          ? 'Đang xử lý'
          : mode === 'error'
            ? 'Thử lại'
            : 'Bắt đầu'
  const closeLabel = mode === 'listening' || mode === 'processing' ? 'Hủy' : 'Đóng'

  return (
    <section
      role="region"
      aria-labelledby="voice-wave-title"
      className="voice-wave-shell"
      data-state={mode}
    >
      <h2 id="voice-wave-title" className="sr-only">Trò chuyện bằng giọng nói</h2>
      <div className="voice-wave-card">
        <div className="voice-wave-summary">
          <p className="voice-wave-title">Trò chuyện bằng giọng nói</p>
          <p
            role={mode === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className="voice-wave-status"
          >
            {status}
          </p>
        </div>
        <div className="voice-wave-meter">
          <canvas ref={waveformRef} className="voice-wave-canvas" aria-hidden="true" />
        </div>
        <div className="voice-wave-actions">
          <button
            type="button"
            onClick={finishConversation}
            aria-label="Đóng trò chuyện bằng giọng nói"
            className="voice-wave-cancel"
          >
            {closeLabel}
          </button>
          <button
            ref={primaryActionRef}
            type="button"
            onClick={handlePrimaryAction}
            disabled={mode === 'processing'}
            className="voice-wave-submit"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
      {transcript !== null && <p className="voice-wave-caption">Bạn vừa nói: “{transcript}”</p>}
    </section>
  )
}
