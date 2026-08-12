/**
 * Câu trả lời trình bày như một trang tài liệu, kèm dải nguồn ở lề.
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
 * thường — vẫn đúng nguyên tắc trên, chỉ đổi hướng.
 */
import type { Citation } from '../lib/schemas'

/** Marker trích dẫn trong `answer`, dạng `[1]`, `[2]`... Khớp mục 4 hợp đồng. */
const CITATION_MARKER = /\[(\d+)\]/g

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'marker'; id: number }

/**
 * Một nguồn gắn với một đoạn văn cụ thể.
 *
 * `isFirstMention` quyết định hiện thẻ đầy đủ hay chỉ một dòng mảnh: nhắc lại
 * nguyên thẻ ở mọi đoạn thì lề phải biến thành một bức tường chữ, tự nó lại
 * cạnh tranh với câu trả lời.
 */
type ParagraphCitation = {
  citation: Citation
  isFirstMention: boolean
}

type Paragraph = {
  segments: Segment[]
  citations: ParagraphCitation[]
}

/**
 * Cắt `answer` thành các đoạn văn, mỗi đoạn kèm đúng những nguồn nó trích dẫn.
 *
 * Khoảng trắng ngay trước marker bị cắt bỏ, để `...dưa cà muối [1].` trong dữ
 * liệu render ra thành `...dưa cà muối[1].` — marker phải dính vào chữ nó chú
 * thích và dính vào dấu câu theo sau, đúng lối chú thích của sách in.
 */
function parseAnswer(answer: string, citations: Citation[]): Paragraph[] {
  const byId = new Map(citations.map((citation) => [citation.id, citation]))
  /** Nguồn nào đã hiện thẻ đầy đủ rồi, tính xuyên suốt cả bài. */
  const alreadyShown = new Set<number>()

  return answer
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .map((block) => {
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
        .map((citation) => {
          const isFirstMention = !alreadyShown.has(citation.id)
          alreadyShown.add(citation.id)
          return { citation, isFirstMention }
        })

      return { segments, citations: paragraphCitations }
    })
}

/**
 * Marker `[n]` giữa dòng chữ.
 *
 * Không để nguyên chữ thường, nhưng cũng không viền: chỉ một mảng nền nhạt và
 * font mono là đủ để mắt nhận ra đây là con trỏ tới nguồn. Không có margin
 * ngang, nên nó dính liền chữ đứng trước và dấu câu đứng sau.
 */
function CitationMarker({ id }: { id: number }) {
  return (
    <span className="font-mono rounded-xs bg-medical/10 px-hair align-baseline text-marker text-medical">
      {id}
      <span className="sr-only"> (nguồn {id})</span>
    </span>
  )
}

/**
 * Thẻ nguồn đầy đủ, hiện ở lần đầu nguồn được nhắc tới.
 *
 * Dấu hiệu thị giác chính DUY NHẤT là nét kẻ dọc bên trái. Bản trước có đồng
 * thời viền bao, nền, chữ đậm và gạch chân — bốn tín hiệu cùng lúc khiến chú
 * thích bên lề đòi được đọc trước cả câu trả lời. Nay bỏ hết, chỉ giữ nét kẻ.
 * Số hiệu văn bản vẫn để font mono vì đó là điểm nhận diện của nó.
 */
function FullCitation({ citation }: { citation: Citation }) {
  const body = (
    <>
      <span className="font-display block text-source text-ink">
        <span className="font-mono text-medical">{citation.id}.</span>{' '}
        {citation.title}
      </span>
      <span className="font-display mt-hair block text-source text-moss">
        {citation.issuer}
      </span>
      {citation.doc_code !== null && (
        <span className="font-mono block text-source text-moss">
          {citation.doc_code}
        </span>
      )}
    </>
  )

  if (citation.url !== null) {
    return (
      <a
        href={citation.url}
        target="_blank"
        rel="noreferrer"
        // Gạch chân chỉ hiện khi rê chuột hoặc focus: ở trạng thái nghỉ, thẻ
        // phải im lặng; khi người dùng chạm tới thì mới cần báo là bấm được.
        className="block no-underline hover:underline focus-visible:underline"
      >
        <span className="sr-only">Nguồn {citation.id}, mở tài liệu gốc: </span>
        {body}
      </a>
    )
  }

  return (
    <div>
      <span className="sr-only">Nguồn {citation.id}: </span>
      {body}
    </div>
  )
}

/**
 * Nhắc lại một nguồn đã hiện thẻ đầy đủ ở đoạn trên.
 *
 * Chỉ một dòng: số thứ tự và tên tài liệu cắt ngắn bằng `truncate`. Cắt bằng
 * CSS chứ không tự viết tên tắt — tên tài liệu pháp quy không được bịa lại.
 * `title` giữ tên đầy đủ cho ai rê chuột vào.
 */
function RepeatCitation({ citation }: { citation: Citation }) {
  return (
    <p className="font-display truncate text-source text-moss" title={citation.title}>
      <span className="font-mono text-medical">{citation.id}.</span>{' '}
      {citation.title}
    </p>
  )
}

/** Dải nguồn của MỘT đoạn văn. */
function CitationRail({ citations }: { citations: ParagraphCitation[] }) {
  if (citations.length === 0) return null

  return (
    <aside
      // Nhãn nói rõ đây là nguồn của riêng đoạn liền kề, không phải của cả bài.
      aria-label="Nguồn cho đoạn trên"
      className="
        mt-tight border-l-2 border-rule pl-snug
        lg:absolute lg:top-0 lg:left-full lg:mt-0 lg:ml-block lg:w-rail
      "
    >
      <ul className="space-y-snug">
        {citations.map(({ citation, isFirstMention }) => (
          <li key={citation.id}>
            {isFirstMention ? (
              <FullCitation citation={citation} />
            ) : (
              <RepeatCitation citation={citation} />
            )}
          </li>
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
        // `relative` là mốc neo cho dải nguồn ở bản rộng. Khoảng cách dưới luôn
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
