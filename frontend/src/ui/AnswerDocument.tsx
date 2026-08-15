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
import { splitParagraphs } from '../lib/paragraphs'
import type { Citation } from '../lib/schemas'

/** Marker trích dẫn trong `answer`, dạng `[1]`, `[2]`... Khớp mục 4 hợp đồng. */
const CITATION_MARKER = /\[(\d+)\]/g

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'marker'; id: number }

type Paragraph = {
  segments: Segment[]
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
function CitationCard({ citation }: { citation: Citation }) {
  return (
    <li className="rounded-lg border-l-4 border-medical bg-medical/10 p-snug lg:rounded-none lg:bg-transparent lg:py-0 lg:pr-0 lg:pl-snug">
      <p className="font-display text-source text-ink">
        <span className="font-mono text-medical">{citation.id}.</span>{' '}
        {citation.title}
      </p>

      <p className="font-body mt-tight text-question text-ink">
        “{citation.snippet}”
      </p>

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
    </li>
  )
}

/** Thẻ nguồn của MỘT đoạn văn. */
function CitationRail({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null

  return (
    <aside
      // Nhãn nói rõ đây là nguồn của riêng đoạn liền kề, không phải của cả bài.
      aria-label="Nguồn cho đoạn trên"
      className="mt-snug lg:absolute lg:top-0 lg:left-full lg:mt-0 lg:ml-block lg:w-rail"
    >
      <ul className="space-y-snug">
        {citations.map((citation) => (
          <CitationCard key={citation.id} citation={citation} />
        ))}
      </ul>
    </aside>
  )
}

export function AnswerDocument({
  answer,
  citations,
}: {
  answer: string
  citations: Citation[]
}) {
  const paragraphs = parseAnswer(answer, citations)

  return (
    <div className="max-w-answer">
      {paragraphs.map((paragraph, index) => (
        // `relative` là mốc neo cho thẻ nguồn ở bản rộng. Khoảng cách dưới luôn
        // đúng một bậc `para`, không phụ thuộc chiều cao thẻ nguồn.
        <div
          key={index}
          className={`relative ${index < paragraphs.length - 1 ? 'mb-para' : ''}`}
        >
          <p className="text-answer">
            {paragraph.segments.map((segment, segmentIndex) =>
              segment.kind === 'text' ? (
                <span key={segmentIndex}>{segment.value}</span>
              ) : (
                <CitationMarker key={segmentIndex} id={segment.id} />
              ),
            )}
          </p>
          <CitationRail citations={paragraph.citations} />
        </div>
      ))}
    </div>
  )
}
