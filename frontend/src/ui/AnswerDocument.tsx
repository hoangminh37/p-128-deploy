/**
 * Câu trả lời trình bày như một trang tài liệu, kèm thẻ nguồn.
 *
 * Nguyên tắc chi phối file này: bệnh nhân không bao giờ được nhìn thấy một
 * khẳng định y khoa mà không nhìn thấy nguồn của nó CÙNG LÚC. Nguồn không nằm
 * cuối bài, không nằm trong accordion, không nằm sau một cú bấm.
 *
 * BỐ CỤC — vì sao dùng absolute chứ không dùng grid:
 *
 * Bản trước đặt đoạn văn và thẻ nguồn vào hai ô của cùng một hàng grid. Ngang
 * hàng thì đúng, nhưng chiều cao hàng bằng chiều cao ô cao nhất, nên một đoạn
 * hai dòng đi với thẻ nguồn bốn dòng sẽ bị đẩy giãn ra, và nhịp giữa các đoạn
 * lúc rộng lúc hẹp — chữ mất nhịp đọc.
 *
 * Nay từ 1024px trở lên, thẻ nguồn được nhấc ra khỏi luồng bằng `absolute` và
 * neo vào mép phải của chính đoạn văn nó chú thích. Khoảng cách giữa các đoạn
 * vì thế luôn đúng một bậc `para`, bất kể thẻ cao bao nhiêu.
 *
 * Dưới 1024px `absolute` tắt, thẻ rơi xuống ngay dưới đoạn của nó theo luồng
 * thường — vẫn đúng nguyên tắc trên, chỉ đổi hướng. Ở bản hẹp thẻ có thêm nền
 * nhạt để tách khỏi dòng chữ đang chảy quanh nó; ở bản rộng thì lề phải đã tách
 * sẵn rồi nên bỏ nền, chỉ còn vạch dọc.
 *
 * THẺ LẶP LẠI: một nguồn được trích ở ba đoạn thì hiện ba thẻ đầy đủ, mỗi thẻ
 * cạnh đúng đoạn của nó. Cố ý không rút gọn lần nhắc thứ hai thành một dòng —
 * đoạn trích trong thẻ là bằng chứng cho ĐOẠN VĂN NẰM CẠNH NÓ, mà một dòng tên
 * tài liệu cụt lủn thì không chứng minh được gì cho đoạn đó.
 */
import { useId, useLayoutEffect, useRef, useState } from 'react'

import { splitParagraphs } from '../lib/paragraphs'
import { stackBottom, stackRailTops, type RailSlot } from '../lib/railStack'
import type { Citation } from '../lib/schemas'

/** Marker trích dẫn trong `answer`, dạng `[1]`, `[2]`... Khớp mục 5 hợp đồng. */
const CITATION_MARKER = /\[(\d+)\]/g

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'marker'; id: number }

type Paragraph = {
  segments: Segment[]
  /**
   * Chỉ những nguồn LẦN ĐẦU được nhắc tới trong cả bài.
   *
   * Nguồn đã có thẻ ở đoạn trên thì đoạn này không hiện gì ở lề. Marker số trong
   * câu chữ vẫn còn nguyên ở mọi lần nhắc — đó mới là thứ nối khẳng định với
   * nguồn, còn thẻ chỉ là chỗ trình bày chi tiết một lần.
   */
  citations: Citation[]
}

/**
 * Cắt `answer` thành các đoạn văn, mỗi đoạn kèm đúng những nguồn nó trích dẫn.
 *
 * Khoảng trắng ngay trước marker bị cắt bỏ, để `...dưa cà muối [1].` trong dữ
 * liệu render ra thành `...dưa cà muối¹.` — marker phải dính vào chữ nó chú
 * thích và dính vào dấu câu theo sau, đúng lối chú thích của sách in.
 */
function parseAnswer(answer: string, citations: Citation[]): Paragraph[] {
  const byId = new Map(citations.map((citation) => [citation.id, citation]))
  /** Nguồn nào đã hiện thẻ đầy đủ rồi, tính xuyên suốt cả bài. */
  const alreadyShown = new Set<number>()

  return splitParagraphs(answer).map((block) => {
    const segments: Segment[] = []
    const citedIds: number[] = []
    let cursor = 0

    for (const match of block.matchAll(new RegExp(CITATION_MARKER))) {
      const start = match.index
      if (start > cursor) {
        // `trimEnd` chính là chỗ khử khoảng trắng trước marker.
        const text = block.slice(cursor, start).trimEnd()
        if (text !== '') segments.push({ kind: 'text', value: text })
      }
      const id = Number(match[1])
      segments.push({ kind: 'marker', id })
      if (!citedIds.includes(id)) citedIds.push(id)
      cursor = start + match[0].length
    }

    if (cursor < block.length) {
      segments.push({ kind: 'text', value: block.slice(cursor) })
    }

    const paragraphCitations = citedIds
      .sort((a, b) => a - b)
      .map((id) => byId.get(id))
      .filter((citation): citation is Citation => citation !== undefined)
      // Giữ lại đúng lần nhắc đầu tiên. Từ lần thứ hai trở đi, lề phải im lặng.
      .filter((citation) => {
        if (alreadyShown.has(citation.id)) return false
        alreadyShown.add(citation.id)
        return true
      })

    return { segments, citations: paragraphCitations }
  })
}

/**
 * Marker giữa dòng chữ: số nhỏ nâng lên, nền medical đặc, chữ paper (5.76:1).
 *
 * Dùng `sup` thật chứ không phải `span` tự nâng bằng CSS, để trình đọc màn hình
 * và chế độ đọc của trình duyệt hiểu đúng đây là chú thích chứ không phải một
 * con số nằm giữa câu.
 *
 * Phần nâng lên để nguyên cho preflight của Tailwind lo: nó đã đặt sẵn
 * `position: relative; top: -.5em` cho `sup`. Thêm `align-super` vào đây nữa là
 * nâng hai lần, marker sẽ trôi lên trên cả dòng chữ. Riêng `font-size: 75%` của
 * preflight thì bị `text-marker` đè lại — 75% của 18px chỉ còn 13,5px, dưới sàn
 * 15px của cả ứng dụng.
 *
 * Cỡ 15px là sàn đó, không nhỏ hơn: con số này trỏ tới nguồn của một khẳng định
 * y khoa, người đọc phải đọc được nó chứ không chỉ thấy có một vệt màu. Không có
 * margin trái, nên marker dính liền chữ đứng trước và dấu câu đứng sau.
 */
function CitationMarker({ id }: { id: number }) {
  return (
    <sup className="font-mono rounded-xs bg-medical px-hair text-marker font-semibold text-paper">
      {id}
      <span className="sr-only"> (nguồn {id})</span>
    </sup>
  )
}

/**
 * Thẻ nguồn của một đoạn văn.
 *
 * Bốn phần, theo thứ tự người bệnh cần: tài liệu nào, tài liệu nói gì, số hiệu
 * để đối chiếu, rồi mới tới đường dẫn mở bản gốc.
 *
 * `snippet` là phần quan trọng nhất và trước đây bị bỏ quên hẳn: nó là chỗ duy
 * nhất người bệnh đọc được ĐÚNG CÂU trong văn bản gốc mà không phải mở tài liệu
 * ra. Đặt trong ngoặc kép và dùng font body để nhìn ra ngay đây là lời trích,
 * không phải lời của trợ lý.
 */
/** Khung chung của một mục trong dải nguồn: nét dọc, và nền nhạt ở bản hẹp. */
const RAIL_ITEM_CLASS =
  'rounded-lg border-l-4 border-medical bg-medical/10 p-snug lg:rounded-none lg:bg-transparent lg:py-0 lg:pr-0 lg:pl-snug'

/**
 * Đoạn trích, cắt còn hai dòng kèm nút mở rộng.
 *
 * Đoạn trích của một văn bản pháp quy thường dài 200–300 ký tự, tức 8–10 dòng ở
 * bề ngang 252px của dải nguồn. Để chạy hết thì mỗi thẻ cao hơn cả đoạn văn nó
 * chú thích, và cột thẻ đẩy trang dài ra gấp mấy lần. Hai dòng là đủ để người
 * đọc quyết định có cần đọc tiếp hay không.
 *
 * Nút mở rộng chỉ hiện khi đoạn trích THẬT SỰ bị cắt. Đo bằng cách so
 * `scrollHeight` với `clientHeight` chứ không đoán theo số ký tự: cùng một số ký
 * tự cho ra số dòng khác nhau tùy bề ngang và tùy font đã tải xong hay chưa.
 *
 * Cố ý KHÔNG đo lại khi đang mở rộng: lúc đó `line-clamp` đã tắt nên
 * `scrollHeight` bằng `clientHeight`, đo tiếp sẽ kết luận "không bị cắt" và nút
 * thu gọn tự biến mất — người dùng mở ra rồi không đóng lại được.
 */
function CitationSnippet({ text }: { text: string }) {
  const [isExpanded, setExpanded] = useState(false)
  const [isTruncated, setTruncated] = useState(false)
  const textRef = useRef<HTMLParagraphElement>(null)
  const snippetId = useId()

  useLayoutEffect(() => {
    if (isExpanded) return

    const element = textRef.current
    if (element === null) return

    function measure(): void {
      if (element === null) return
      // Chừa 1px sai số làm tròn của trình duyệt.
      setTruncated(element.scrollHeight - element.clientHeight > 1)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text, isExpanded])

  return (
    <>
      <p
        ref={textRef}
        id={snippetId}
        className={`font-body mt-tight text-question text-ink ${
          isExpanded ? '' : 'line-clamp-2'
        }`}
      >
        “{text}”
      </p>

      {isTruncated && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={isExpanded}
          aria-controls={snippetId}
          className="font-display flex min-h-touch items-center text-question font-semibold text-medical underline underline-offset-4"
        >
          {isExpanded ? 'Thu gọn đoạn trích' : 'Xem đầy đủ đoạn trích'}
        </button>
      )}
    </>
  )
}

/**
 * Thẻ nguồn đầy đủ, hiện ở LẦN ĐẦU một nguồn được nhắc tới.
 *
 * Bốn phần, theo thứ tự người bệnh cần: tài liệu nào, tài liệu nói gì, số hiệu
 * để đối chiếu, rồi mới tới đường dẫn mở bản gốc.
 *
 * `snippet` là chỗ duy nhất người bệnh đọc được ĐÚNG CÂU trong văn bản gốc mà
 * không phải mở tài liệu ra. Đặt trong ngoặc kép và dùng font body để nhìn ra
 * ngay đây là lời trích, không phải lời của trợ lý.
 */
function FullCitationCard({ citation }: { citation: Citation }) {
  return (
    <div className={RAIL_ITEM_CLASS}>
      <p className="font-display text-source text-ink">
        <span className="font-mono text-medical">{citation.id}.</span>{' '}
        {citation.title}
      </p>

      <CitationSnippet text={citation.snippet} />

      <p className="font-display mt-tight text-question text-moss">
        {citation.issuer}
      </p>

      {citation.doc_code !== null && (
        <p className="font-mono text-question text-moss">{citation.doc_code}</p>
      )}

      {/* Hợp đồng cho phép `url` bằng `null` — tài liệu chưa được đăng công khai
          thì không dựng một liên kết chết, người bệnh bấm vào sẽ mất lòng tin
          vào cả những nguồn còn lại. */}
      {citation.url !== null && (
        <a
          href={citation.url}
          target="_blank"
          rel="noreferrer"
          className="font-display mt-tight inline-flex min-h-touch items-center text-question font-semibold text-medical underline underline-offset-4"
        >
          Mở tài liệu
          <span className="sr-only">: {citation.title}, mở ở tab mới</span>
        </a>
      )}
    </div>
  )
}

/**
 * Thẻ nguồn của MỘT đoạn văn.
 *
 * Chỉ dựng cho những nguồn LẦN ĐẦU được nhắc tới — `parseAnswer` đã lọc sẵn.
 * Đoạn nào chỉ nhắc lại nguồn cũ thì trả `null`, lề phải bỏ trống hẳn chỗ đó và
 * thẻ tiếp theo được kéo lên gần đoạn văn của nó hơn.
 */
function CitationRail({
  citations,
  ref,
}: {
  citations: Citation[]
  /** Để `useCitationRailLayout` đo chiều cao và đặt `top` cho thẻ này. */
  ref: (element: HTMLElement | null) => void
}) {
  if (citations.length === 0) return null

  return (
    <aside
      ref={ref}
      // Nhãn nói rõ đây là nguồn của riêng đoạn liền kề, không phải của cả bài.
      aria-label="Nguồn cho đoạn trên"
      // KHÔNG có `lg:top-0` nữa: `top` do JavaScript đặt. Trước lúc script chạy
      // xong, `top: auto` cho thẻ đứng đúng chỗ tĩnh của nó — ngay dưới đoạn văn
      // — nên trạng thái tạm cũng không đè lên nhau.
      className="mt-snug lg:absolute lg:left-full lg:mt-0 lg:ml-block lg:w-rail"
    >
      <ul className="space-y-snug">
        {citations.map((citation) => (
          <li key={citation.id}>
            <FullCitationCard citation={citation} />
          </li>
        ))}
      </ul>
    </aside>
  )
}

/** Khe hở tối thiểu giữa hai thẻ, dùng khi không đọc được bậc `snug` từ CSS. */
const FALLBACK_RAIL_GAP = 12

function isElement(value: HTMLElement | null | undefined): value is HTMLElement {
  return value instanceof HTMLElement
}

/** Đọc bậc `snug` từ chính CSS, để khe hở giữa hai thẻ không bị gõ cứng hai nơi. */
function readRailGap(element: Element): number {
  const raw = window.getComputedStyle(element).getPropertyValue('--spacing-snug')
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : FALLBACK_RAIL_GAP
}

/**
 * Đo và đặt vị trí cho cột thẻ nguồn ở bản rộng.
 *
 * Luật xếp chồng nằm ở `lib/railStack.ts`; chỗ này chỉ lo phần đo đạc.
 *
 * `useLayoutEffect` chứ không `useEffect`: phải đặt xong `top` TRƯỚC khi trình
 * duyệt vẽ, nếu không người đọc thấy thẻ nhảy một nhịp.
 *
 * Đặt `top` cho một phần tử `absolute` không làm đổi chiều cao của bất cứ thứ
 * gì, nên vòng đo không tự nuôi chính nó. `ResizeObserver` chỉ chạy lại khi chữ
 * thật sự đổi kích thước — đổi bề ngang cửa sổ, hoặc font vừa tải xong.
 */
function useCitationRailLayout(signature: string) {
  const containerRef = useRef<HTMLDivElement>(null)
  const paragraphRefs = useRef<(HTMLElement | null)[]>([])
  const railRefs = useRef<(HTMLElement | null)[]>([])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (container === null) return

    function applyLayout(): void {
      if (container === null) return

      const rails = railRefs.current
      const firstRail = rails.find(isElement)
      if (firstRail === undefined) return

      // Hỏi thẳng CSS xem đang ở bố cục nào, thay vì chép lại mốc 1024px vào
      // JavaScript. Chép lại là hai nơi cùng giữ một con số, và sớm muộn cũng lệch.
      if (window.getComputedStyle(firstRail).position !== 'absolute') {
        for (const rail of rails) {
          if (isElement(rail) && rail.style.top !== '') rail.style.top = ''
        }
        if (container.style.minHeight !== '') container.style.minHeight = ''
        return
      }

      const containerTop = container.getBoundingClientRect().top
      const slots: RailSlot[] = []
      const elements: HTMLElement[] = []

      rails.forEach((rail, index) => {
        const paragraph = paragraphRefs.current[index]
        if (!isElement(rail) || !isElement(paragraph)) return

        slots.push({
          paragraphTop: paragraph.getBoundingClientRect().top - containerTop,
          height: rail.offsetHeight,
        })
        elements.push(rail)
      })

      const tops = stackRailTops(slots, readRailGap(container))

      // Chỉ ghi khi giá trị thật sự đổi: ghi lại y hệt vẫn khiến ResizeObserver
      // báo thêm một vòng, và trình duyệt kêu "loop completed with undelivered
      // notifications".
      tops.forEach((top, index) => {
        const next = `${Math.round(top)}px`
        if (elements[index].style.top !== next) elements[index].style.top = next
      })

      const minHeight = `${Math.round(stackBottom(slots, tops))}px`
      if (container.style.minHeight !== minHeight) container.style.minHeight = minHeight
    }

    applyLayout()

    const observer = new ResizeObserver(applyLayout)
    observer.observe(container)
    for (const element of [...paragraphRefs.current, ...railRefs.current]) {
      if (isElement(element)) observer.observe(element)
    }

    return () => observer.disconnect()
  }, [signature])

  return { containerRef, paragraphRefs, railRefs }
}

export function AnswerDocument({
  answer,
  citations,
}: {
  answer: string
  citations: Citation[]
}) {
  const paragraphs = parseAnswer(answer, citations)

  // Chữ ký đổi khi số đoạn hoặc chỗ đặt thẻ đổi — lúc đó phải gắn lại observer.
  // Dùng chuỗi chứ không dùng mảng, để mảng mới mỗi lần render không làm effect
  // chạy lại vô ích.
  const signature = paragraphs.map((paragraph) => paragraph.citations.length).join(',')
  const { containerRef, paragraphRefs, railRefs } = useCitationRailLayout(signature)

  return (
    // `relative` là mốc neo cho CẢ cột thẻ, không phải cho từng đoạn. Neo theo
    // từng đoạn thì mỗi thẻ chỉ biết ô của riêng nó và không có cách nào tránh
    // thẻ đứng trước.
    <div ref={containerRef} className="relative max-w-answer">
      {paragraphs.map((paragraph, index) => (
        <div
          key={index}
          ref={(element) => {
            paragraphRefs.current[index] = element
          }}
          // Khoảng cách giữa các đoạn luôn đúng một bậc `para`. Thẻ nguồn nằm
          // ngoài luồng ở bản rộng nên không kéo giãn được chỗ này.
          className={index < paragraphs.length - 1 ? 'mb-para' : ''}
        >
          <p className="text-answer whitespace-pre-wrap">
            {paragraph.segments.map((segment, segmentIndex) =>
              segment.kind === 'text' ? (
                <span key={segmentIndex}>{segment.value}</span>
              ) : (
                <CitationMarker key={segmentIndex} id={segment.id} />
              ),
            )}
          </p>
          <CitationRail
            citations={paragraph.citations}
            ref={(element) => {
              railRefs.current[index] = element
            }}
          />
        </div>
      ))}
    </div>
  )
}
