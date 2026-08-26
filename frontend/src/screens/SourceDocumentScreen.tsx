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
  const className = `border-b border-line px-snug py-tight align-top leading-relaxed ${
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
    <div className="mt-snug overflow-x-auto rounded-card border-2 border-line bg-surface">
      <table className="min-w-full border-collapse text-left text-question text-body">
        <caption className="sr-only">Bảng thông tin trong tài liệu nguồn</caption>
        <tbody>
          {Array.from({ length: table.rows }, (_, rowIndex) => {
            const cells = (cellsByRow.get(rowIndex) ?? []).sort((a, b) => a.column - b.column)
            return (
              <tr key={`structured-row-${rowIndex}`} className={rowIndex % 2 === 1 ? 'bg-canvas' : ''}>
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
    <div className="mt-snug overflow-x-auto rounded-card border-2 border-line bg-surface">
      <table className="min-w-full border-collapse text-left text-question text-body">
        <caption className={table.caption === null ? 'sr-only' : 'bg-ink px-snug py-tight text-left font-display font-semibold text-white'}>
          {table.caption ?? 'Bảng thông tin trong tài liệu nguồn'}
        </caption>
        {table.headerRows.length > 0 && (
          <thead className="bg-ink text-white">
          {table.headerRows.map((row, rowIndex) => (
            <tr key={`header-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <th
                  key={`header-${rowIndex}-${cellIndex}`}
                  scope={rowIndex === table.headerRows.length - 1 ? 'col' : undefined}
                  colSpan={row.length === 1 ? table.columnCount : 1}
                  className={`border-b border-slate px-snug py-tight font-display font-semibold ${
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
            <tr key={`row-${rowIndex}`} className="odd:bg-canvas">
              {Array.from({ length: table.columnCount }, (_, cellIndex) => (
                <td
                  key={`row-${rowIndex}-${cellIndex}`}
                  className={`border-b border-line px-snug py-tight align-top leading-relaxed ${
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

  return <p className="mt-snug whitespace-pre-wrap text-notice leading-relaxed">{content}</p>
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
          <Link
            to="/chat"
            className="motion-press font-display flex min-h-touch items-center rounded-pill bg-ink px-cozy text-input font-bold text-white no-underline hover:bg-ink-press"
          >
            Về hỏi đáp
          </Link>
        }
      />
    )
  }

  if (sourceQuery.isPending) {
    return (
      <p role="status" className="font-display text-notice text-slate">
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
    <article className="mx-auto w-full max-w-reading">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="motion-press font-display flex min-h-touch items-center rounded-pill border-2 border-slate px-cozy text-input font-semibold text-body hover:bg-canvas"
      >
        Về câu trả lời
      </button>

      <p className="font-display mt-block text-question font-semibold text-slate">
        Tài liệu nguồn đã duyệt
      </p>
      <h1 className="mt-hair text-ask font-semibold text-body">{source.title}</h1>

      <div className="mt-snug flex flex-wrap gap-tight">
        <span className="font-display rounded-pill bg-canvas px-snug py-hair text-question text-body">
          {source.issuer}
        </span>
        <span className="font-display rounded-pill bg-canvas px-snug py-hair text-question text-body">
          Ban hành {source.published}
        </span>
        {source.doc_code !== null && (
          <span className="font-mono rounded-pill bg-canvas px-snug py-hair text-question text-body">
            {source.doc_code}
          </span>
        )}
      </div>

      <section className="mt-block rounded-card bg-mint p-cozy text-mint-deep">
        <h2 className="font-display text-input font-semibold">Đoạn được trích trong câu trả lời</h2>
        <p className="font-display mt-hair text-question">
          Phần nền xanh bên dưới là đoạn hệ thống đã tìm thấy và dùng làm nguồn. Các phần còn lại
          giúp bạn đọc thêm ngữ cảnh gần đoạn đó trong cùng tài liệu. Tài liệu này có{' '}
          {source.total_chunks} đoạn đã được biên tập.
        </p>
      </section>

      <div className="mt-block space-y-snug">
        {source.chunks.map((chunk) => {
          const isHighlighted = chunk.chunk_id === source.highlighted_chunk_id
          const pages = pageLabel(chunk.page_start, chunk.page_end)
          return (
            <section
              id={`source-chunk-${chunk.chunk_id}`}
              key={chunk.chunk_id}
              aria-label={isHighlighted ? 'Đoạn được trích dẫn' : undefined}
              className={`scroll-mt-block rounded-card p-cozy ${
                isHighlighted
                  ? 'border-2 border-mint-deep bg-mint text-mint-deep'
                  : 'border-2 border-line bg-surface text-body'
              }`}
            >
              <div className="flex flex-wrap items-center gap-tight">
                {isHighlighted && (
                  <span className="font-display rounded-pill bg-mint-deep px-snug py-hair text-question font-semibold text-mint">
                    Đoạn đã trích
                  </span>
                )}
                {chunk.section_path !== null && (
                  <p className="font-display text-question font-semibold">{chunk.section_path}</p>
                )}
                {pages !== null && <p className="font-mono text-question">{pages}</p>}
              </div>
              <SourceChunkContent content={chunk.content} table={chunk.table} />
            </section>
          )
        })}
      </div>

      {source.url !== null && (
        <p className="font-display mt-block border-t border-line pt-snug text-question text-slate">
          Muốn đối chiếu bản công bố?{' '}
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-body underline underline-offset-4"
          >
            Mở tài liệu gốc
          </a>
        </p>
      )}
    </article>
  )
}
