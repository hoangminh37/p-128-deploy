/**
 * Câu trả lời — CHÉP TỪ SECTION `id="hd"` CỦA BẢN MẪU.
 *
 * BỘ XƯƠNG, và nó khác hẳn bản trước:
 *
 *     <div class="co">                    lưới hai cột, tự gãy dưới 1162px
 *       <div>                             cột trái
 *         <div class="phieu">
 *           <div class="phieu-top">       "Trả lời · đã đối chiếu văn bản" | "2 trích dẫn"
 *           <div class="doc">
 *             <div class="doc-rail">      số hiệu + số điều, mono, căn phải
 *             <div class="doc-body">      cột chữ, trần 64ch
 *           cụm nút                       .lab + .btn sm
 *           <div class="rangcua">         mép răng cưa ở chân phiếu
 *       <div class="phu">                 cột phải: VĂN BẢN GỐC
 *         <div class="phieu">             .phieu-top nền tím, số hiệu cỡ lớn,
 *                                         tên điều, đoạn trích, nút mở toàn văn
 *
 * BỎ HẲN BỘ MÁY `position:absolute` CỦA BẢN TRƯỚC. Bản trước tự đo chiều cao
 * từng đoạn bằng `ResizeObserver` rồi neo thẻ nguồn vào toạ độ tính ra — khoảng
 * hai trăm dòng, và chúng tồn tại chỉ để mô phỏng một cái lưới. Bản mẫu dùng
 * `.co { grid-template-columns: minmax(0,1fr) var(--w-nguon) }` cộng
 * `.phu { position: sticky }`, và dưới 1162px thì đúng một media query đưa nó
 * về một cột. Không JavaScript nào cả.
 *
 * Đổi lại, thẻ nguồn KHÔNG còn thẳng hàng với đoạn văn chứa marker của nó —
 * đúng như bản mẫu. Cột phải là "văn bản gốc đang mở", một chồng thẻ dính theo
 * cuộn, và marker `[n]` trong dòng chữ là thứ nối hai bên với nhau.
 *
 * CỘT LỀ TRÁI `.doc-rail` CHỈ CÓ Ở MÀN TOÀN VĂN. Bản mẫu tắt nó ở đây bằng
 * `#hd .doc-rail{display:none}` — trích dẫn đã nằm bên phải rồi, thêm một cột
 * số hiệu bên trái nữa là nói cùng một thứ hai lần và bóp cột chữ từ hai phía.
 * `.doc-body` lúc đó nhận `max-width:64ch` và bỏ luôn `padding-left`; ở đây
 * việc ấy do lớp `.doc-khong-le` làm, khai ngay cạnh `.doc` trong `index.css`.
 */
import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { Citation, TermAnnotation } from '../lib/schemas'
import { AnnotatedText } from './AnnotatedAnswer'

/** Marker trích dẫn trong `answer`, dạng `[1]`, `[2]`... Khớp mục 5 hợp đồng. */
const CITATION_MARKER = /\[(\d+)\]/g

type Segment =
  | { kind: 'text'; value: string; startOffset: number }
  | { kind: 'marker'; id: number }

type Paragraph = { segments: Segment[] }

type AnswerBlock = { value: string; startOffset: number }

/**
 * Cắt đoạn mà vẫn giữ toạ độ UTF-16 của từng block trong `answer` gốc.
 *
 * Annotation backend dùng chính coordinate space này; nếu cắt rồi tìm lại
 * phrase, từ lặp lại ở đoạn khác có thể bị tô nhầm. `String.slice` của
 * JavaScript cũng dùng UTF-16, nên offset này an toàn cả khi câu trả lời có
 * emoji.
 */
function splitAnswerBlocks(answer: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = []
  let cursor = 0

  const addBlock = (rawStart: number, rawEnd: number) => {
    const raw = answer.slice(rawStart, rawEnd)
    const first = raw.search(/\S/)
    if (first === -1) return
    const lastWhitespace = raw.match(/\s*$/)?.[0].length ?? 0
    const end = rawEnd - lastWhitespace
    const start = rawStart + first
    if (end > start) blocks.push({ value: answer.slice(start, end), startOffset: start })
  }

  for (const match of answer.matchAll(/\n\s*\n/g)) {
    const separatorStart = match.index ?? cursor
    addBlock(cursor, separatorStart)
    cursor = separatorStart + match[0].length
  }
  addBlock(cursor, answer.length)
  return blocks
}

/**
 * Cắt `answer` thành các đoạn văn kèm marker.
 *
 * Khoảng trắng ngay trước marker bị cắt bỏ, để `...dưa cà muối [1].` trong dữ
 * liệu render ra thành `...dưa cà muối¹.` — marker phải dính vào chữ nó chú
 * thích và dính vào dấu câu theo sau, đúng lối chú thích của sách in.
 */
function parseAnswer(answer: string): Paragraph[] {
  return splitAnswerBlocks(answer).map((blockInfo) => {
    const block = blockInfo.value
    const segments: Segment[] = []
    let cursor = 0

    for (const match of block.matchAll(new RegExp(CITATION_MARKER))) {
      const start = match.index
      if (start > cursor) {
        // `trimEnd` chính là chỗ khử khoảng trắng trước marker.
        const text = block.slice(cursor, start).trimEnd()
        if (text !== '') {
          segments.push({
            kind: 'text',
            value: text,
            startOffset: blockInfo.startOffset + cursor,
          })
        }
      }
      segments.push({ kind: 'marker', id: Number(match[1]) })
      cursor = start + match[0].length
    }

    if (cursor < block.length) {
      segments.push({
        kind: 'text',
        value: block.slice(cursor),
        startOffset: blockInfo.startOffset + cursor,
      })
    }

    return { segments }
  })
}

/**
 * Marker giữa dòng chữ — lớp `.mk` của bản mẫu.
 *
 * `color:var(--tim); font-family:var(--f-mono); font-size:.8em;
 * vertical-align:.35em` — một CHỮ SỐ nâng lên trong dòng văn, đúng như số chú
 * thích trong một văn bản in. Không nền, không viền, không viên thuốc.
 *
 * Đây là chỗ thứ hai trong bốn chỗ được dùng tím.
 */
function CitationMarker({ id }: { id: number }) {
  return (
    <span className="mk">
      {id}
      <span className="sr-only"> (nguồn {id})</span>
    </span>
  )
}

/**
 * Đoạn trích trong thẻ nguồn, cắt còn ba dòng kèm nút mở rộng.
 *
 * Đoạn trích của một văn bản pháp quy thường dài 200–300 ký tự, tức 8–10 dòng ở
 * bề ngang `--w-nguon`. Để chạy hết thì cột phải dài hơn cả câu trả lời.
 *
 * Nút mở LUÔN có mặt: khác bản trước, ở đây không đo `scrollHeight` để quyết
 * định có hiện nút hay không. Phép đo đó chạy trước khi font tải xong thì cho
 * kết quả sai, và một nút "Xem đủ đoạn trích" hiện trên một đoạn vốn đã đủ thì
 * vô hại — bấm vào không có gì đổi.
 */
function CitationSnippet({ text }: { text: string }) {
  const [isExpanded, setExpanded] = useState(false)
  const snippetId = useId()

  return (
    <>
      <p
        id={snippetId}
        style={{
          fontSize: 'var(--t-note)',
          lineHeight: 1.72,
          marginTop: 8,
          ...(isExpanded
            ? {}
            : {
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical' as const,
                overflow: 'hidden',
              }),
        }}
      >
        {text}
      </p>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={isExpanded}
        aria-controls={snippetId}
        className="lab"
        style={{
          background: 'none',
          border: 0,
          padding: '6px 0',
          minHeight: 0,
          cursor: 'pointer',
          color: 'var(--tim)',
          textDecoration: 'underline',
          textUnderlineOffset: '.2em',
        }}
      >
        {isExpanded ? 'Thu gọn đoạn trích' : 'Xem đủ đoạn trích'}
      </button>
    </>
  )
}

/**
 * Một thẻ VĂN BẢN GỐC ở cột phải.
 *
 * Chép nguyên trình tự của bản mẫu: dải `.phieu-top` nền tím nhạt → SỐ HIỆU cỡ
 * lớn mono tím → tên tài liệu → nét kẻ → nhãn "Đoạn trích" → đoạn trích → nét
 * kẻ → nút mở toàn văn.
 *
 * Số hiệu dẫn đầu chứ không phải số thứ tự trích dẫn: thứ người bệnh mang đi
 * đối chiếu với một tờ giấy thật là SỐ HIỆU. Số thứ tự lùi về mẩu phải của dải
 * đầu thẻ, đúng chỗ bản mẫu đặt "Điều 12".
 *
 * Đây là chỗ thứ ba trong bốn chỗ được dùng tím.
 */
function SourceCard({ citation }: { citation: Citation }) {
  const documentId = citation.document_id?.trim()
  const chunkId = citation.chunk_id?.trim()
  const originalUrl = citation.url?.trim()
  const docCode = citation.doc_code?.trim()

  const sourcePath =
    documentId !== undefined && chunkId !== undefined && documentId !== '' && chunkId !== ''
      ? `/sources/${encodeURIComponent(documentId)}?chunk=${encodeURIComponent(chunkId)}`
      : null

  return (
    <div className="phieu">
      <div
        className="phieu-top"
        style={{
          background: 'var(--tim-wash)',
          color: 'var(--tim)',
          borderBottomColor: 'var(--tim)',
        }}
      >
        <span>Văn bản gốc</span>
        <span>[{citation.id}]</span>
      </div>

      <div style={{ padding: '16px 18px' }}>
        {/* SỐ HIỆU CỠ LỚN, MONO, TÍM. `overflowWrap` chứ không cắt ba chấm:
            một số hiệu bị cắt đuôi là một số hiệu SAI, và người đang cầm tờ
            văn bản thật để đối chiếu sẽ không biết mình đọc hụt.

            Thiếu số hiệu thì nói thẳng là thiếu, không in một giá trị thay thế
            trông như thật — đúng nguyên tắc mà bản mẫu nêu ở màn `id="xc"`. */}
        <div
          className="mono"
          style={{
            fontSize: 'clamp(15px,1.2vw,18px)',
            color: docCode !== undefined && docCode !== '' ? 'var(--tim)' : 'var(--xam)',
            overflowWrap: 'anywhere',
          }}
        >
          {docCode !== undefined && docCode !== '' ? docCode : 'Chưa có số hiệu văn bản'}
        </div>

        <div
          style={{
            fontSize: 'var(--t-note)',
            color: 'var(--xam)',
            marginTop: 3,
            lineHeight: 1.5,
          }}
        >
          {citation.title} · {citation.issuer}
        </div>

        <div style={{ height: 1, background: 'var(--ke)', margin: '14px 0' }} />

        <div className="lab">Đoạn trích</div>
        <CitationSnippet text={citation.snippet} />

        <div style={{ height: 1, background: 'var(--ke)', margin: '14px 0' }} />

        {sourcePath !== null && (
          <Link to={sourcePath} className="btn sm" style={{ width: '100%' }}>
            Mở toàn văn
            <span className="sr-only">: {citation.title}</span>
          </Link>
        )}

        {/* Hợp đồng cho phép `url` bằng `null` — tài liệu chưa đăng công khai
            thì không dựng một liên kết chết, người bệnh bấm vào sẽ mất lòng tin
            vào cả những nguồn còn lại. */}
        {originalUrl !== undefined && originalUrl !== '' && (
          <a
            href={originalUrl}
            target="_blank"
            rel="noreferrer"
            className="btn sm gh"
            style={{ width: '100%', marginTop: 7 }}
          >
            Mở bản công bố
            <span className="sr-only">: {citation.title}, mở ở tab mới</span>
          </a>
        )}
      </div>

      <div className="rangcua" />
    </div>
  )
}

export function AnswerDocument({
  answer,
  citations,
  annotations = [],
  actions,
}: {
  answer: string
  citations: Citation[]
  /** Danh sách thuật ngữ y khoa cần highlight. Không bắt buộc — thiếu thì bỏ qua. */
  annotations?: TermAnnotation[]
  /** Cụm nút của lượt, đặt trong chân `.phieu` đúng như bản mẫu. */
  actions?: ReactNode
}) {
  const paragraphs = parseAnswer(answer)
  const railHeadingId = useId()

  return (
    <div className="co">
      {/* ---- Cột trái: phiếu trả lời ---- */}
      <div>
        <div className="phieu">
          <div className="phieu-top">
            <span>Trả lời · đã đối chiếu văn bản</span>
            <span>{citations.length} trích dẫn</span>
          </div>

          <div style={{ padding: '0 clamp(16px,2vw,24px)' }}>
            {/* `.doc` không có `.doc-rail` ở màn này — xem ghi chú đầu file. */}
            <div className="doc doc-khong-le">
              <div className="doc-body">
                {paragraphs.map((paragraph, index) => (
                  <p
                    key={index}
                    style={{
                      whiteSpace: 'pre-wrap',
                      marginBottom: index < paragraphs.length - 1 ? 15 : 0,
                    }}
                  >
                    {paragraph.segments.map((segment, segmentIndex) =>
                      segment.kind === 'text' ? (
                        <AnnotatedText
                          key={segmentIndex}
                          text={segment.value}
                          answerOffset={segment.startOffset}
                          annotations={annotations}
                        />
                      ) : (
                        <CitationMarker key={segmentIndex} id={segment.id} />
                      ),
                    )}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {actions !== undefined && (
            <div
              style={{
                display: 'flex',
                gap: 9,
                flexWrap: 'wrap',
                alignItems: 'center',
                padding: '18px clamp(16px,2vw,24px)',
              }}
            >
              <span className="lab" style={{ marginRight: 'auto' }}>
                Dựa trên {citations.length} tài liệu đã duyệt
              </span>
              {actions}
            </div>
          )}

          <div className="rangcua" />
        </div>
      </div>

      {/* ---- Cột phải: văn bản gốc. `.phu` dính theo cuộn từ 1162px và rơi
              xuống dưới cột trái ở dưới mốc đó — một media query của bản mẫu lo
              cả hai, không có JavaScript nào. ---- */}
      {citations.length > 0 && (
        <aside className="phu" aria-labelledby={railHeadingId}>
          <h2 id={railHeadingId} className="sr-only">
            Văn bản gốc của câu trả lời
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {citations.map((citation) => (
              <SourceCard key={citation.id} citation={citation} />
            ))}
          </div>

          <p className="lab" style={{ marginTop: 14, lineHeight: 1.6 }}>
            Số nhỏ màu tím trong câu trả lời trỏ tới thẻ tương ứng ở đây
          </p>
        </aside>
      )}
    </div>
  )
}
