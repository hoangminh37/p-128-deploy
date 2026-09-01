/**
 * Trang đối chiếu citation với tài liệu đã duyệt trong thư viện.
 *
 * Không render bản PDF hay URL ngoài: nội dung ở đây là các chunk đã được hệ
 * thống biên tập, nạp vào RAG, và chính là thứ agent được phép dùng. Vì vậy
 * người đọc thấy đúng đoạn chứng minh cho câu trả lời, kể cả khi tài liệu gốc
 * không có URL công khai.
 */
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { getSourceDocument } from '../lib/api'
import type { SourceTable } from '../lib/schemas'
import { EmptyState } from '../ui/EmptyState'
import { ErrorNotice } from '../ui/ErrorNotice'

function pageLabel(start: number | null, end: number | null): string | null {
  if (start === null) return null
  return end === null || end === start ? `Trang ${start}` : `Trang ${start}–${end}`
}

type PipeTable = {
  caption: string | null
  headerRows: string[][]
  rows: string[][]
  columnCount: number
}

const TABLE_RULE = /^:?-{3,}:?$/

/** Parse bảng Markdown do pipeline PDF để lại thành cấu trúc an toàn để render. */
function parsePipeTable(content: string): PipeTable | null {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')

  // Chunk có đoạn văn kèm bảng vẫn phải giữ nguyên đoạn văn. Với pipeline hiện
  // tại bảng được tách thành chunk riêng, nên chỉ chuyển đổi khi TOÀN BỘ chunk
  // thực sự là bảng Markdown.
  if (lines.length === 0 || lines.some((line) => !line.startsWith('|') || !line.endsWith('|'))) {
    return null
  }

  const rows = lines
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()))

  const separatorIndex = rows.findIndex(
    (row) => row.length > 0 && row.every((cell) => TABLE_RULE.test(cell)),
  )
  if (separatorIndex < 1) return null

  const rawHeaderRows = rows.slice(0, separatorIndex)
  const dataRows = rows.slice(separatorIndex + 1).filter(
    (row) => !row.every((cell) => TABLE_RULE.test(cell)),
  )
  const columnCount = Math.max(
    ...dataRows.map((row) => row.length),
    ...rawHeaderRows.map((row) => row.length),
  )

  // Không tự biến một dòng có dấu "|" trong câu văn thành bảng. Chỉ render
  // table khi có dữ liệu thực sự gồm ít nhất hai cột.
  if (dataRows.length === 0 || columnCount < 2) return null

  // Một hàng có đúng một ô không rỗng là tiêu đề bảng/caption, không phải bằng
  // chứng để tách thành nhiều tiêu đề cột. Tách chữ ở đây sẽ là bịa cấu trúc.
  const titleRows = rawHeaderRows.filter(
    (row) => row.length === columnCount && row.filter((cell) => cell !== '').length === 1,
  )
  const caption = titleRows
    .flatMap((row) => row.filter((cell) => cell !== ''))
    .join(' — ') || null

  return {
    caption,
    headerRows: rawHeaderRows.filter((row) => !titleRows.includes(row)),
    rows: dataRows,
    columnCount,
  }
}

function Cell({
  children,
  isHeader,
  isRowHeader,
  column,
  columnCount,
  rowSpan = 1,
  columnSpan = 1,
}: {
  children: string
  isHeader: boolean
  isRowHeader: boolean
  column: number
  columnCount: number
  rowSpan?: number
  columnSpan?: number
}) {
  const className = `${
    column + columnSpan < columnCount ? 'border-r' : ''
  } ${isHeader ? 'bg-ink font-display font-semibold text-white' : ''}`
  if (isHeader || isRowHeader) {
    return (
      <th
        scope={isHeader ? 'col' : 'row'}
        rowSpan={rowSpan}
        colSpan={columnSpan}
        className={className}
      >
        {children}
      </th>
    )
  }

  return (
    <td rowSpan={rowSpan} colSpan={columnSpan} className={className}>
      {children}
    </td>
  )
}

function StructuredSourceTable({ table }: { table: SourceTable }) {
  const cellsByRow = new Map<number, SourceTable['cells']>()
  for (const cell of table.cells) {
    const row = cellsByRow.get(cell.row) ?? []
    row.push(cell)
    cellsByRow.set(cell.row, row)
  }

  return (
    <div style={{ marginTop: 14, overflowX: 'auto', border: '1px solid var(--ke)' }}>
      <table>
        <caption className="sr-only">Bảng thông tin trong tài liệu nguồn</caption>
        <tbody>
          {Array.from({ length: table.rows }, (_, rowIndex) => {
            const cells = (cellsByRow.get(rowIndex) ?? []).sort((a, b) => a.column - b.column)
            return (
              <tr key={`structured-row-${rowIndex}`}>
                {cells.map((cell) => (
                  <Cell
                    key={`structured-${cell.row}-${cell.column}`}
                    isHeader={cell.is_column_header}
                    isRowHeader={cell.is_row_header}
                    column={cell.column}
                    columnCount={table.columns}
                    rowSpan={cell.row_span}
                    columnSpan={cell.column_span}
                  >
                    {cell.text}
                  </Cell>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MarkdownSourceTable({ table }: { table: PipeTable }) {
  return (
    <div style={{ marginTop: 14, overflowX: 'auto', border: '1px solid var(--ke)' }}>
      <table>
        <caption className={table.caption === null ? 'sr-only' : 'lab'} style={table.caption === null ? undefined : { textAlign: 'left', padding: '10px 12px' }}>
          {table.caption ?? 'Bảng thông tin trong tài liệu nguồn'}
        </caption>
        {table.headerRows.length > 0 && (
          <thead>
          {table.headerRows.map((row, rowIndex) => (
            <tr key={`header-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <th
                  key={`header-${rowIndex}-${cellIndex}`}
                  scope={rowIndex === table.headerRows.length - 1 ? 'col' : undefined}
                  colSpan={row.length === 1 ? table.columnCount : 1}
                  className={`${
                    cellIndex < table.columnCount - 1 ? 'border-r' : ''
                  }`}
                >
                  {cell}
                </th>
              ))}
            </tr>
          ))}
          </thead>
        )}
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {Array.from({ length: table.columnCount }, (_, cellIndex) => (
                <td
                  key={`row-${rowIndex}-${cellIndex}`}
                  className={`${
                    cellIndex < table.columnCount - 1 ? 'border-r' : ''
                  }`}
                >
                  {row[cellIndex] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SourceChunkContent({ content, table }: { content: string; table: SourceTable | null | undefined }) {
  if (table !== null && table !== undefined && table.cells.length > 0) {
    return <StructuredSourceTable table={table} />
  }

  const markdownTable = parsePipeTable(content)
  if (markdownTable !== null) return <MarkdownSourceTable table={markdownTable} />

  return (
    <p style={{ marginTop: 14, whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{content}</p>
  )
}

export function SourceDocumentScreen() {
  const { documentId } = useParams<{ documentId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const chunkId = searchParams.get('chunk')

  const sourceQuery = useQuery({
    queryKey: ['source-document', documentId, chunkId],
    enabled: documentId !== undefined && chunkId !== null && chunkId !== '',
    queryFn: () => getSourceDocument(documentId ?? '', chunkId ?? ''),
  })

  useEffect(() => {
    const highlightedId = sourceQuery.data?.highlighted_chunk_id
    if (!highlightedId) return
    const element = document.getElementById(`source-chunk-${highlightedId}`)
    element?.scrollIntoView({ block: 'center' })
  }, [sourceQuery.data])

  if (documentId === undefined || chunkId === null || chunkId === '') {
    return (
      <EmptyState
        title="Liên kết tài liệu chưa đầy đủ"
        body="Hãy mở lại nguồn từ câu trả lời để xem đúng đoạn đã được trích dẫn."
        action={
          <Link to="/chat" className="btn pri">
            Về hỏi đáp
          </Link>
        }
      />
    )
  }

  if (sourceQuery.isPending) {
    return (
      <p role="status" className="lab">
        Đang mở tài liệu nguồn…
      </p>
    )
  }

  if (sourceQuery.isError) {
    return (
      <ErrorNotice
        error={sourceQuery.error}
        retryLabel="Tải lại tài liệu"
        onRetry={() => void sourceQuery.refetch()}
      />
    )
  }

  const source = sourceQuery.data
  if (source === undefined) return null

  return (
    /* CHÉP TỪ `id="vb"`: nút quay lại, nhãn `.eb`, tên tài liệu, SỐ HIỆU mono
       tím một dòng riêng, rồi `.co` hai cột — trái là `.phieu` chứa `.doc` có
       CỘT LỀ TRÁI, phải là `.phu` chứa thẻ "Xuất xứ".

       ĐÂY LÀ MÀN DUY NHẤT GIỮ `.doc-rail`. Bản mẫu tắt cột lề ở `#hd`, `#bh`
       và `#btm` nhưng để nguyên ở đây, và lý do nằm ở chính nội dung: không có
       thẻ nguồn nào bên phải để trỏ tới đoạn, mà người đọc đang lần theo một
       tài liệu dài — cột số điều bên trái chính là thứ cho họ biết mình đang
       đứng ở đâu. */
    <article>
      <button type="button" onClick={() => navigate(-1)} className="btn sm gh">
        Quay lại câu trả lời
      </button>

      <div className="eb" style={{ marginTop: 18 }}>
        Văn bản gốc · {source.issuer}
      </div>

      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 12, maxWidth: '26ch' }}>
        {source.title}
      </h1>

      {/* SỐ HIỆU VĂN BẢN một dòng riêng, mono TÍM — chỗ đầu tiên mắt tìm khi
          đang cầm một tờ văn bản thật để đối chiếu. Đây là chỗ thứ nhất trong
          bốn chỗ được dùng tím.

          Thiếu số hiệu thì nói thẳng là thiếu, không in một giá trị thay thế
          trông như thật — nguyên tắc bản mẫu nêu ở màn `id="xc"`. */}
      <p
        className="mono"
        style={{
          fontSize: 'clamp(15px,1.2vw,18px)',
          color: source.doc_code !== null ? 'var(--tim)' : 'var(--xam)',
          marginTop: 10,
          overflowWrap: 'anywhere',
        }}
      >
        {source.doc_code ?? 'Chưa có số hiệu văn bản'}
      </p>

      <div className="co" style={{ marginTop: 26 }}>
        {/* ---- Cột trái: toàn văn ---- */}
        <div>
          <div className="phieu">
            <div className="phieu-top">
              <span>Toàn văn đã biên tập</span>
              <span>{source.total_chunks} đoạn</span>
            </div>

            <div style={{ padding: '0 clamp(16px,2vw,24px)' }}>
              <div className="doc">
                {/* Cột lề: một `.ref` cho mỗi đoạn — tên mục ở dòng trên, số
                    trang ở dòng dưới. `aria-current="true"` ở đoạn đang được
                    trích, và `.ref[aria-current]` của bản mẫu vẽ một nét tím
                    14×2px trước nó. */}
                <div className="doc-rail">
                  {source.chunks.map((chunk) => (
                    <button
                      key={`ref-${chunk.chunk_id}`}
                      type="button"
                      className="ref"
                      style={{ background: 'none', border: 0, cursor: 'pointer', minHeight: 0 }}
                      aria-current={
                        chunk.chunk_id === source.highlighted_chunk_id ? 'true' : undefined
                      }
                      onClick={() => {
                        document
                          .getElementById(`source-chunk-${chunk.chunk_id}`)
                          ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                      }}
                    >
                      {chunk.section_path ?? `Đoạn ${chunk.chunk_id}`}
                      <span>{pageLabel(chunk.page_start, chunk.page_end) ?? '—'}</span>
                    </button>
                  ))}
                </div>

                <div className="doc-body">
                  {source.chunks.map((chunk) => {
                    const isHighlighted = chunk.chunk_id === source.highlighted_chunk_id
                    const pages = pageLabel(chunk.page_start, chunk.page_end)

                    return (
                      <section
                        id={`source-chunk-${chunk.chunk_id}`}
                        key={chunk.chunk_id}
                        aria-label={isHighlighted ? 'Đoạn được trích dẫn' : undefined}
                        style={{
                          scrollMarginTop: 80,
                          marginBottom: 26,
                          // Đoạn được trích tách ra bằng NÉT LỀ TRÁI TÍM 3px,
                          // không bằng một mảng nền. Tím là màu của xuất xứ, và
                          // đây đúng là đoạn mà câu trả lời lấy làm căn cứ.
                          ...(isHighlighted
                            ? { borderLeft: '3px solid var(--tim)', paddingLeft: 14 }
                            : {}),
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            gap: 9,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          {isHighlighted && <span className="chip cho">Đoạn đã trích</span>}
                          {chunk.section_path !== null && (
                            <span className="lab">{chunk.section_path}</span>
                          )}
                          {pages !== null && (
                            <span className="mono" style={{ fontSize: 'var(--t-mono-s)', color: 'var(--xam)' }}>
                              {pages}
                            </span>
                          )}
                        </div>

                        <SourceChunkContent content={chunk.content} table={chunk.table} />
                      </section>
                    )
                  })}

                  <p
                    style={{
                      fontSize: 'var(--t-note)',
                      color: 'var(--xam)',
                      borderLeft: '2px solid var(--ke-dam)',
                      paddingLeft: 12,
                      lineHeight: 1.7,
                    }}
                  >
                    Đoạn có nét lề tím là đoạn trích mà trợ lý đã dẫn trong câu trả lời
                    của bạn.
                  </p>
                </div>
              </div>
            </div>

            <div className="rangcua" />
          </div>
        </div>

        {/* ---- Cột phải: xuất xứ ---- */}
        <aside className="phu">
          <div className="phieu">
            <div
              className="phieu-top"
              style={{
                background: 'var(--tim-wash)',
                color: 'var(--tim)',
                borderBottomColor: 'var(--tim)',
              }}
            >
              <span>Xuất xứ</span>
            </div>

            <div style={{ padding: '16px 18px' }}>
              <span className="lab">Cơ quan ban hành</span>
              <p style={{ fontSize: 'var(--t-note)', marginTop: 2 }}>{source.issuer}</p>

              <span className="lab" style={{ display: 'block', marginTop: 12 }}>
                Năm ban hành
              </span>
              <p style={{ fontSize: 'var(--t-note)', marginTop: 2 }}>{source.published}</p>

              <span className="lab" style={{ display: 'block', marginTop: 12 }}>
                Số đoạn đã biên tập
              </span>
              <p style={{ fontSize: 'var(--t-note)', marginTop: 2 }}>{source.total_chunks}</p>

              {source.url !== null && (
                <>
                  <div style={{ height: 1, background: 'var(--ke)', margin: '14px 0' }} />
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn sm gh"
                    style={{ width: '100%' }}
                  >
                    Mở bản công bố
                    <span className="sr-only"> — mở ở tab mới</span>
                  </a>
                </>
              )}
            </div>

            <div className="rangcua" />
          </div>
        </aside>
      </div>
    </article>
  )
}
