/**
 * Câu trả lời trình bày như một trang tài liệu, kèm thẻ nguồn.
 *
 * Nguyên tắc chi phối file này: bệnh nhân không bao giờ được nhìn thấy một
 * khẳng định y khoa mà không nhìn thấy nguồn của nó CÙNG LÚC. Nguồn không nằm
 * cuối bài, không nằm trong accordion, không nằm sau một cú bấm.
 *
 * BA BỐ CỤC, chọn theo BỀ NGANG và theo SỐ THẺ:
 *
 *   Dưới 1162px (`rail:`), mọi số thẻ — thẻ rơi xuống ngay dưới đoạn văn của
 *   nó theo luồng thường. Không có cột nào để mà lệch.
 *
 *   Từ 1162px, tới hai thẻ — dải nguồn ở lề phải, mỗi thẻ neo ngang đoạn văn
 *   chứa marker của nó. Đây là bố cục chính của sản phẩm.
 *
 *   Từ 1162px, từ ba thẻ trở lên — bỏ dải nguồn ở lề phải, toàn bộ thẻ xếp
 *   xuống dưới câu trả lời thành lưới hai cột. Ngưỡng và lý do đầy đủ nằm ở
 *   `shouldStackRail` trong `lib/railStack.ts`; tóm tắt: khi số thẻ vượt quá
 *   chiều cao đoạn văn thì việc thẳng hàng không còn nói lên điều gì — thẻ thứ
 *   ba đứng ngang một đoạn nó không hề chú thích — nên xếp xuống dưới vừa
 *   trung thực hơn vừa không bao giờ vỡ.
 *
 * CỘT CHỮ GIỮ NGUYÊN BỀ NGANG Ở CẢ BA BỐ CỤC: thẻ trắng luôn dừng ở
 * `max-w-answer` (594px, ~62 ký tự mỗi dòng). Chỉ KHỐI THẺ NGUỒN xếp dưới mới
 * lấy hết bề ngang vùng nội dung.
 *
 * Bản trước cho cả thẻ trắng giãn ra 850px ở bố cục xếp dưới, tức ~90 ký tự
 * mỗi dòng — vượt xa khoảng 62–68 ký tự mà `--container-answer` trong
 * `index.css` được đặt ra để giữ. Người đọc là bệnh nhân 45–70 tuổi: dòng dài
 * hơn thì mắt dò từ cuối dòng này sang đầu dòng sau dễ nhảy dòng, và đó đúng
 * là kiểu lỗi đọc mà cả thang cỡ chữ của dự án đang cố tránh. Bố cục thẻ nguồn
 * không phải lý do để nới cột chữ.
 *
 * VÌ SAO BỐ CỤC HAI CỘT DÙNG absolute CHỨ KHÔNG DÙNG grid:
 *
 * Bản trước đặt đoạn văn và thẻ nguồn vào hai ô của cùng một hàng grid. Ngang
 * hàng thì đúng, nhưng chiều cao hàng bằng chiều cao ô cao nhất, nên một đoạn
 * hai dòng đi với thẻ nguồn bốn dòng sẽ bị đẩy giãn ra, và nhịp giữa các đoạn
 * lúc rộng lúc hẹp — chữ mất nhịp đọc.
 *
 * Nay thẻ nguồn được nhấc ra khỏi luồng bằng `absolute` và neo vào mép phải của
 * chính đoạn văn nó chú thích. Khoảng cách giữa các đoạn vì thế luôn đúng một
 * bậc `para`, bất kể thẻ cao bao nhiêu.
 *
 * Thẻ giữ nguyên nền của nó ở mọi bố cục: từ bản này thẻ là một khối có nền đặc
 * (navy hoặc trắng viền), nên nó tự tách khỏi chữ mà không cần một kiểu riêng.
 *
 * THẺ LẶP LẠI: một nguồn được trích ở ba đoạn thì hiện ba thẻ đầy đủ, mỗi thẻ
 * cạnh đúng đoạn của nó. Cố ý không rút gọn lần nhắc thứ hai thành một dòng —
 * đoạn trích trong thẻ là bằng chứng cho ĐOẠN VĂN NẰM CẠNH NÓ, mà một dòng tên
 * tài liệu cụt lủn thì không chứng minh được gì cho đoạn đó.
 */
import { useId, useLayoutEffect, useRef, useState } from 'react'

import { splitParagraphs } from '../lib/paragraphs'
import {
  shouldStackRail,
  stackBottom,
  stackRailTops,
  type RailSlot,
} from '../lib/railStack'
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
  citations: RailCitation[]
}

/**
 * Thứ tự XUẤT HIỆN của một thẻ trong cả dải nguồn, đếm từ 0.
 *
 * KHÔNG phải `citation.id`. Hai thứ này trùng nhau ở phần lớn câu trả lời, rồi
 * lệch ngay khi bài trích nguồn 2 trước nguồn 1 — lúc đó thẻ mang số 2 mới là
 * thẻ đầu dải. Dải nguồn tô màu theo VỊ TRÍ chứ không theo số hiệu, nên nó cần
 * con số này.
 */
type RailCitation = { citation: Citation; order: number }

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

    const paragraphCitations: RailCitation[] = []

    for (const id of [...citedIds].sort((a, b) => a - b)) {
      const citation = byId.get(id)
      if (citation === undefined) continue
      // Giữ lại đúng lần nhắc đầu tiên. Từ lần thứ hai trở đi, lề phải im lặng.
      if (alreadyShown.has(citation.id)) continue

      // Gán `order` NGAY TRONG vòng lặp này, không tách thành một `.map()`
      // đứng sau `.filter()`: `filter` chạy xong toàn bộ mảng rồi `map` mới bắt
      // đầu, nên lúc đó `alreadyShown` đã chứa cả những nguồn phía sau và mọi
      // thẻ trong cùng một đoạn sẽ nhận chung một con số.
      paragraphCitations.push({ citation, order: alreadyShown.size })
      alreadyShown.add(citation.id)
    }

    return { segments, citations: paragraphCitations }
  })
}

/**
 * Marker giữa dòng chữ: số nhỏ nâng lên, NỀN MINT đặc, chữ `ink` (7.95:1).
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
    <sup className="font-mono rounded-sm bg-mint px-hair text-marker font-semibold text-ink">
      {id}
      <span className="sr-only"> (nguồn {id})</span>
    </sup>
  )
}

/**
 * Hai bộ mặt của một thẻ nguồn, chọn theo VỊ TRÍ trong dải chứ không theo số
 * hiệu tài liệu.
 *
 * THẺ ĐẦU nền navy chữ trắng, các thẻ sau nền trắng chữ ink. Nhịp này có hai
 * việc: nó cho mắt một điểm dừng ở đầu dải thay vì một cột thẻ trắng đều tăm
 * tắp, và nó ngầm nói rằng thẻ đầu là nguồn của khẳng định ĐẦU TIÊN trong bài —
 * thứ người bệnh đọc trước nhất.
 *
 * `lead` dùng `mist` cho dòng phụ (6.80:1 trên ink) và `rest` dùng `slate`
 * (4.96:1 trên trắng). Hai họ nền, hai màu chữ phụ, không lẫn.
 */
const RAIL_SKIN = {
  lead: {
    card: 'bg-ink',
    title: 'text-white',
    number: 'text-mint',
    quote: 'text-white',
    meta: 'text-mist',
    action: 'bg-mint text-ink hover:bg-mint-press',
    expand: 'text-mint',
  },
  rest: {
    // Nền `canvas` ở bản hẹp, `white` từ 1162px. Không phải hai ý thích: dưới
    // mốc đó thẻ nguồn rơi vào TRONG thẻ trắng bọc câu trả lời, nên một thẻ
    // trắng nữa đặt lên đó thì không còn ranh giới nào. Từ 1162px thẻ ra hẳn lề
    // phải hoặc xuống lưới bên dưới, đứng trên nền canvas của trang, và lúc đó
    // trắng mới là màu tách nó ra.
    card: 'bg-canvas rail:border-2 rail:border-line rail:bg-surface',
    title: 'text-body',
    number: 'text-body',
    quote: 'text-body',
    meta: 'text-slate',
    action: 'border-2 border-slate text-body hover:bg-canvas',
    expand: 'text-body',
  },
} as const

type RailSkin = (typeof RAIL_SKIN)[keyof typeof RAIL_SKIN]

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
function CitationSnippet({ text, skin }: { text: string; skin: RailSkin }) {
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
        className={`font-body mt-tight text-question ${skin.quote} ${
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
          className={`motion-press font-display flex min-h-touch items-center text-question font-semibold underline underline-offset-4 ${skin.expand}`}
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
function FullCitationCard({ citation, order }: RailCitation) {
  const skin = order === 0 ? RAIL_SKIN.lead : RAIL_SKIN.rest

  return (
    <div className={`rounded-card p-snug ${skin.card}`}>
      {/* Số thứ tự tách hẳn thành một dòng mono riêng ở trên tên tài liệu, chứ
          không nhét vào đầu câu như bản trước. Nó là thứ nối thẻ này với marker
          trong dòng chữ, nên nó phải tìm được bằng cách quét dọc mép trái dải
          nguồn — mà muốn quét dọc được thì mọi thẻ phải đặt số ở cùng một chỗ,
          không phụ thuộc tên tài liệu dài hay ngắn. */}
      <p className={`font-mono text-question font-semibold ${skin.number}`}>
        {String(citation.id).padStart(2, '0')}
      </p>

      <p className={`font-display mt-hair text-source font-semibold ${skin.title}`}>
        {citation.title}
      </p>

      <CitationSnippet text={citation.snippet} skin={skin} />

      <p className={`font-display mt-tight text-question ${skin.meta}`}>
        {citation.issuer}
      </p>

      {citation.doc_code !== null && (
        <p className={`font-mono text-question ${skin.meta}`}>{citation.doc_code}</p>
      )}

      {/* Hợp đồng cho phép `url` bằng `null` — tài liệu chưa được đăng công khai
          thì không dựng một liên kết chết, người bệnh bấm vào sẽ mất lòng tin
          vào cả những nguồn còn lại. */}
      {citation.url !== null && (
        <a
          href={citation.url}
          target="_blank"
          rel="noreferrer"
          className={`motion-press font-display mt-snug inline-flex min-h-touch items-center justify-center rounded-pill px-cozy text-question font-semibold no-underline ${skin.action}`}
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
 *
 * `isStacked` đổi hẳn vai của khối này: ở bố cục xếp dưới, nó chỉ còn sống dưới
 * 1162px và biến mất hẳn từ 1162px trở lên, nhường chỗ cho `StackedCitations`.
 * `rail:hidden` gỡ nó khỏi cả cây trợ năng nữa (`display: none`), nên trình đọc
 * màn hình không đọc hai lần cùng một danh sách nguồn.
 */
function CitationRail({
  citations,
  isStacked,
  ref,
}: {
  citations: RailCitation[]
  isStacked: boolean
  /** Để `useCitationRailLayout` đo chiều cao và đặt `top` cho thẻ này. */
  ref: (element: HTMLElement | null) => void
}) {
  if (citations.length === 0) return null

  return (
    <aside
      ref={ref}
      // Nhãn nói rõ đây là nguồn của riêng đoạn liền kề, không phải của cả bài.
      aria-label="Nguồn cho đoạn trên"
      // KHÔNG có `rail:top-0`: `top` do JavaScript đặt. Trước lúc script chạy
      // xong, `top: auto` cho thẻ đứng đúng chỗ tĩnh của nó — ngay dưới đoạn văn
      // — nên trạng thái tạm cũng không đè lên nhau.
      //
      // `rail:` chứ KHÔNG phải `lg:` (xem `--breakpoint-rail` ở `index.css`):
      // ở 1024px thì <main> chỉ còn 772px, thiếu 138px so với 910px mà bố cục
      // hai cột cần, nên dải nguồn thò ra khỏi mép cửa sổ và sinh thanh cuộn
      // ngang. `lg:` vẫn là mốc của thanh bên và của hai nút trên thanh tiêu đề;
      // hai mốc đó độc lập với mốc này.
      //
      // Ở bố cục xếp dưới thì KHÔNG gắn `rail:absolute`. Đó cũng chính là tín
      // hiệu mà `useCitationRailLayout` đọc để biết mình không có việc gì làm —
      // nó hỏi thẳng `getComputedStyle().position` chứ không giữ thêm một cờ.
      className={
        isStacked
          ? 'mt-snug rail:hidden'
          : 'mt-snug rail:absolute rail:left-full rail:mt-0 rail:ml-block rail:w-rail'
      }
    >
      <ul className="space-y-snug">
        {citations.map((entry) => (
          <li key={entry.citation.id}>
            <FullCitationCard citation={entry.citation} order={entry.order} />
          </li>
        ))}
      </ul>
    </aside>
  )
}

/**
 * Toàn bộ thẻ nguồn, xếp thành lưới hai cột dưới câu trả lời.
 *
 * CHỈ dựng từ 1162px (`hidden rail:block`) và chỉ khi có từ ba thẻ — dưới mốc
 * đó `CitationRail` đã lo phần việc này theo luồng thường.
 *
 * ĐẶT NGOÀI thẻ trắng bọc câu trả lời, không phải bên trong. Thẻ nguồn từ vị trí
 * thứ hai trở đi có nền trắng; nằm trong một thẻ trắng khác thì chúng mất hẳn
 * đường bao. Ở đây chúng đứng trên nền `canvas` của trang, nên nền trắng mới là
 * thứ tách chúng ra.
 *
 * Dòng tiêu đề nói rõ SỐ TÀI LIỆU. Ở bố cục hai cột, người đọc biết có bao nhiêu
 * nguồn bằng cách nhìn lề phải; ở bố cục này danh sách nằm dưới cuối và có thể
 * dài hơn một màn hình, nên con số phải nói ra bằng chữ.
 */
function StackedCitations({
  citations,
  headingId,
}: {
  citations: RailCitation[]
  headingId: string
}) {
  return (
    <aside
      aria-labelledby={headingId}
      className="mt-block hidden rail:block"
    >
      <h2
        id={headingId}
        className="font-display text-question font-semibold text-body"
      >
        Nguồn của câu trả lời · {citations.length} tài liệu
      </h2>

      <ul className="mt-snug grid grid-cols-2 gap-cozy">
        {citations.map((entry) => (
          <li key={entry.citation.id}>
            <FullCitationCard citation={entry.citation} order={entry.order} />
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
  const stackedHeadingId = useId()

  /**
   * Mọi thẻ sẽ dựng, theo đúng thứ tự xuất hiện trong bài.
   *
   * `parseAnswer` đã lọc lần nhắc thứ hai trở đi, nên độ dài mảng này CHÍNH LÀ
   * số thẻ — không phải `citations.length`, thứ còn đếm cả những nguồn mà
   * `answer` không có marker nào trỏ tới.
   */
  const railCards = paragraphs.flatMap((paragraph) => paragraph.citations)
  const isStacked = shouldStackRail(railCards.length)

  // Chữ ký đổi khi bố cục hoặc chỗ đặt thẻ đổi — lúc đó phải gắn lại observer.
  // Dùng chuỗi chứ không dùng mảng, để mảng mới mỗi lần render không làm effect
  // chạy lại vô ích. `isStacked` nằm trong chữ ký vì đổi bố cục là đổi hẳn tập
  // phần tử cần đo.
  const signature = `${isStacked}|${paragraphs
    .map((paragraph) => paragraph.citations.length)
    .join(',')}`
  const { containerRef, paragraphRefs, railRefs } = useCitationRailLayout(signature)

  return (
    // Khối ngoài lấy hết bề ngang vùng nội dung, nhưng CHỈ để khối thẻ nguồn
    // xếp dưới dùng hết chỗ đó. Thẻ trắng bên trong vẫn dừng ở `max-w-answer` ở
    // mọi bố cục — xem ghi chú "CỘT CHỮ GIỮ NGUYÊN BỀ NGANG" ở đầu file.
    <div className="w-full">
      <div className="max-w-answer rounded-card-lg bg-surface p-cozy">
        {/* `relative` là mốc neo cho CẢ cột thẻ, không phải cho từng đoạn. Neo
            theo từng đoạn thì mỗi thẻ chỉ biết ô của riêng nó và không có cách
            nào tránh thẻ đứng trước. */}
        <div ref={containerRef} className="relative w-full">
          {paragraphs.map((paragraph, index) => (
            <div
              key={index}
              ref={(element) => {
                paragraphRefs.current[index] = element
              }}
              // Khoảng cách giữa các đoạn luôn đúng một bậc `para`. Thẻ nguồn nằm
              // ngoài luồng ở bố cục hai cột nên không kéo giãn được chỗ này.
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
                isStacked={isStacked}
                ref={(element) => {
                  railRefs.current[index] = element
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {isStacked && (
        <StackedCitations citations={railCards} headingId={stackedHeadingId} />
      )}
    </div>
  )
}
