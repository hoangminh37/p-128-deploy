/**
 * AnnotatedAnswer — render câu trả lời với hover popup giải thích thuật ngữ y khoa.
 *
 * Nhận một đoạn của `answer` + `annotations` có offset UTF-16 tuyệt đối.
 * Dùng đúng offset backend trả về, thay vì tìm lại phrase trong từng đoạn:
 * cùng một thuật ngữ lặp lại nhiều lần sẽ không bị tô sai vị trí. Sau đó render:
 *   - plain text → <span>
 *   - annotated term → <mark> có tooltip hover
 *
 * Tooltip dùng React portal + position: fixed để không bao giờ bị clip bởi
 * overflow hay container cha. Tự detect không gian còn lại để flip lên/xuống.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { TermAnnotation } from '../lib/schemas'

// ---------------------------------------------------------------------------
// Segment splitting
// ---------------------------------------------------------------------------

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'term'; value: string; annotation: TermAnnotation }

/**
 * Tách `text` thành segments dựa theo annotations.
 *
 * `answerOffset` là vị trí bắt đầu của `text` trong chuỗi answer gốc. Cả client
 * lẫn backend đều dùng UTF-16 offsets, nên có thể cắt trực tiếp và không cần
 * phrase matching mơ hồ.
 */
function splitAnnotatedSegments(
  text: string,
  annotations: TermAnnotation[],
  answerOffset: number,
): Segment[] {
  if (annotations.length === 0) return [{ kind: 'text', value: text }]

  // Lấy các annotation nằm trọn trong text segment này.
  type LocalHit = { start: number; end: number; annotation: TermAnnotation }
  const hits: LocalHit[] = []
  const answerEnd = answerOffset + text.length

  for (const ann of annotations) {
    if (ann.start_offset < answerOffset || ann.end_offset > answerEnd) continue
    const start = ann.start_offset - answerOffset
    const end = ann.end_offset - answerOffset
    if (start < 0 || end <= start || text.slice(start, end) === '') continue
    hits.push({ start, end, annotation: ann })
  }

  if (hits.length === 0) return [{ kind: 'text', value: text }]

  // Sort theo vị trí, loại bỏ overlap
  hits.sort((a, b) => a.start - b.start)
  const nonOverlapping: LocalHit[] = [hits[0]]
  for (let i = 1; i < hits.length; i++) {
    const prev = nonOverlapping[nonOverlapping.length - 1]
    if (hits[i].start >= prev.end) nonOverlapping.push(hits[i])
  }

  const segments: Segment[] = []
  let cursor = 0

  for (const { start, end, annotation } of nonOverlapping) {
    if (start > cursor) segments.push({ kind: 'text', value: text.slice(cursor, start) })
    segments.push({ kind: 'term', value: text.slice(start, end), annotation })
    cursor = end
  }

  if (cursor < text.length) segments.push({ kind: 'text', value: text.slice(cursor) })

  return segments
}

// ---------------------------------------------------------------------------
// Tooltip position
// ---------------------------------------------------------------------------

const TOOLTIP_WIDTH = 288   // w-72 = 18rem
const TOOLTIP_HEIGHT = 200  // max estimated height
const TOOLTIP_GAP = 8       // khoảng cách giữa term và tooltip

type TooltipPos = {
  top: number
  left: number
  /** true = hiện phía trên term; false = phía dưới */
  above: boolean
}

function computeTooltipPos(rect: DOMRect): TooltipPos {
  const spaceAbove = rect.top
  const spaceBelow = window.innerHeight - rect.bottom
  const above = spaceAbove >= TOOLTIP_HEIGHT + TOOLTIP_GAP || spaceAbove >= spaceBelow

  // Căn trái với term nhưng không tràn ra khỏi viewport
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - 8))

  const top = above
    ? rect.top - TOOLTIP_GAP   // anchor: bottom của tooltip = top của term
    : rect.bottom + TOOLTIP_GAP // anchor: top của tooltip = bottom của term

  return { top, left, above }
}

// ---------------------------------------------------------------------------
// Tooltip portal component
// ---------------------------------------------------------------------------

function TermTooltipPortal({
  annotation,
  tooltipId,
  pos,
}: {
  annotation: TermAnnotation
  tooltipId: string
  pos: TooltipPos
}) {
  const style: React.CSSProperties = {
    position: 'fixed',
    left: pos.left,
    width: Math.min(TOOLTIP_WIDTH, window.innerWidth - 16),
    zIndex: 9999,
    // Nếu above: căn đáy tooltip vào điểm pos.top
    // Nếu below: căn đầu tooltip vào điểm pos.top
    ...(pos.above
      ? { bottom: window.innerHeight - pos.top }
      : { top: pos.top }),
  }

  return createPortal(
    <div
      id={tooltipId}
      role="tooltip"
      style={style}
      className="rounded-card bg-ink p-snug shadow-xl animate-answer-in"
    >
      {/* Tên thuật ngữ */}
      <span className="font-display block text-source font-semibold text-mint">
        {annotation.term}
      </span>

      {/* Giải thích ngắn */}
      <span className="font-body mt-hair block text-question text-white">
        {annotation.short_explanation}
      </span>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// AnnotatedTerm — một từ có hover tooltip
// ---------------------------------------------------------------------------

function AnnotatedTerm({ annotation, value }: { annotation: TermAnnotation; value: string }) {
  const [pos, setPos] = useState<TooltipPos | null>(null)
  const tooltipId = useId()
  const termRef = useRef<HTMLElement>(null)

  function show() {
    if (!termRef.current) return
    setPos(computeTooltipPos(termRef.current.getBoundingClientRect()))
  }

  function hide() {
    setPos(null)
  }

  // Cập nhật vị trí khi scroll (giữ tooltip đúng chỗ)
  useEffect(() => {
    if (!pos) return
    const onScroll = () => {
      if (termRef.current) {
        setPos(computeTooltipPos(termRef.current.getBoundingClientRect()))
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [pos])

  return (
    <mark
      ref={termRef}
      aria-describedby={tooltipId}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
      className="
        relative inline cursor-help rounded-sm
        bg-transparent font-inherit text-inherit
        underline decoration-mint decoration-dotted underline-offset-2
        focus:outline-none focus-visible:ring-2 focus-visible:ring-mint
      "
    >
      {value}
      {pos !== null && (
        <TermTooltipPortal annotation={annotation} tooltipId={tooltipId} pos={pos} />
      )}
    </mark>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

function renderInlineFormatting(rawText: string) {
  if (!rawText.includes('*') && !rawText.includes('_')) {
    return rawText
  }
  // Tách **in đậm** trước, sau đó xử lý text thường
  const boldParts = rawText.split(/(\*\*.*?\*\*)/g)
  return boldParts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={`b-${i}`} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return part
  })
}

/**
 * Render một đoạn văn bản với annotations highlight.
 *
 * Dùng thay cho `<span>{text}</span>` thuần tuý trong AnswerDocument.
 * Khi không có annotation trong đoạn này → render bình thường, không có overhead.
 */
export function AnnotatedText({
  text,
  annotations,
  answerOffset,
}: {
  text: string
  annotations: TermAnnotation[]
  answerOffset: number
}) {
  const segments = splitAnnotatedSegments(text, annotations, answerOffset)

  // Fast path: không có annotation nào → tránh map + JSX overhead
  if (segments.every((s) => s.kind === 'text')) {
    return <>{renderInlineFormatting(text)}</>
  }

  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <span key={index}>{renderInlineFormatting(segment.value)}</span>
        ) : (
          <AnnotatedTerm
            key={index}
            value={segment.value}
            annotation={segment.annotation}
          />
        ),
      )}
    </>
  )
}
