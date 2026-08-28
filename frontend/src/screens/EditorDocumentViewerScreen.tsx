/**
 * Màn xem toàn văn dành cho biên tập viên.
 *
 * PDF được tải qua API có Bearer token rồi đưa vào Object URL cục bộ. Không đặt
 * URL API thẳng vào iframe, vì iframe không tự gắn được header Authorization.
 * Markdown được render bằng ReactMarkdown + GFM, không render HTML thô từ file
 * để một tài liệu tải lên không thể chèn script vào phiên biên tập viên.
 */
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, useParams } from 'react-router-dom'
import remarkGfm from 'remark-gfm'

import { useEditorSourceDocuments } from '../app/editor'
import { getEditorSourceDocumentFile } from '../lib/api'
import { formatDate } from '../lib/datetime'
import type { EditorSourceDocument } from '../lib/schemas'
import { EmptyState } from '../ui/EmptyState'
import { ErrorNotice } from '../ui/ErrorNotice'

type LoadedDocument =
  | { type: 'pdf'; objectUrl: string }
  | { type: 'markdown'; content: string }
  | null

function BackToLibrary() {
  return (
    <Link
      to="/editor/documents"
      className="motion-press font-display inline-flex min-h-touch items-center rounded-pill border-2 border-slate bg-surface px-cozy text-input font-semibold text-body no-underline hover:bg-canvas"
    >
      Về thư viện tài liệu
    </Link>
  )
}

function DocumentDetails({ sourceDocument }: { sourceDocument: EditorSourceDocument }) {
  return (
    <dl className="mt-snug grid gap-snug border-t border-line pt-snug sm:grid-cols-3">
      <div>
        <dt className="font-display text-question text-slate">Cơ quan ban hành</dt>
        <dd className="font-display mt-hair text-input text-body">{sourceDocument.issuer}</dd>
      </div>
      <div>
        <dt className="font-display text-question text-slate">Ngày ban hành</dt>
        <dd className="font-display mt-hair text-input text-body">{sourceDocument.published}</dd>
      </div>
      <div>
        <dt className="font-display text-question text-slate">Số hiệu</dt>
        <dd className="font-mono mt-hair text-input text-body">{sourceDocument.doc_code ?? 'Chưa có'}</dd>
      </div>
    </dl>
  )
}

function FileUnavailable({ sourceDocument }: { sourceDocument: EditorSourceDocument }) {
  const message = !sourceDocument.source_file_available
    ? 'Bản gốc không có trong máy chủ hiện tại nên không thể dựng nội dung toàn văn. Đây là trạng thái thật của kho file; không có nội dung thay thế hay dữ liệu mẫu được hiển thị.'
    : 'File gốc có định dạng chưa có màn xem trực tiếp. Hiện hệ thống hỗ trợ xem toàn văn PDF và Markdown.'

  return (
    <section className="mt-block rounded-card-lg bg-sand p-cozy text-sand-deep" aria-labelledby="file-unavailable-title">
      <h2 id="file-unavailable-title" className="font-display text-notice font-semibold">
        Chưa thể mở toàn văn tại đây
      </h2>
      <p className="font-display mt-tight max-w-answer text-input leading-relaxed">{message}</p>
      {sourceDocument.url !== null && (
        <a
          href={sourceDocument.url}
          target="_blank"
          rel="noreferrer"
          className="font-display mt-cozy inline-flex min-h-touch items-center rounded-pill border-2 border-sand-deep px-cozy text-input font-semibold text-sand-deep no-underline hover:bg-sand-lift"
        >
          Mở nguồn do nhà phát hành cung cấp
        </a>
      )}
    </section>
  )
}

export function EditorDocumentViewerScreen() {
  const { documentId } = useParams<{ documentId: string }>()
  const sourceDocumentsQuery = useEditorSourceDocuments()
  const sourceDocument = sourceDocumentsQuery.data?.documents.find(
    (item) => item.document_id === documentId,
  )
  const [loadedDocument, setLoadedDocument] = useState<LoadedDocument>(null)
  const [fileError, setFileError] = useState<unknown>(null)
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)

  const canRender =
    sourceDocument !== undefined &&
    sourceDocument.source_file_available &&
    sourceDocument.viewer_type !== 'unsupported'

  useEffect(() => {
    if (!canRender || sourceDocument === undefined) {
      // Không cần reset state đồng bộ ở đây: phần render bên dưới đã bị chặn
      // bởi `canRender`. Khi mở nguồn hợp lệ khác, `load()` sẽ thay state theo
      // dữ liệu mới. Tránh một render dây chuyền chỉ vì chuyển sang file không
      // thể trình bày trực tiếp.
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    const load = async () => {
      setLoadedDocument(null)
      setFileError(null)
      setIsLoadingFile(true)

      try {
        const file = await getEditorSourceDocumentFile(sourceDocument.document_id)
        if (cancelled) return

        if (sourceDocument.viewer_type === 'pdf') {
          objectUrl = URL.createObjectURL(file)
          setLoadedDocument({ type: 'pdf', objectUrl })
        } else {
          const content = await file.text()
          if (cancelled) return
          setLoadedDocument({ type: 'markdown', content })
        }
      } catch (error) {
        if (!cancelled) setFileError(error)
      } finally {
        if (!cancelled) setIsLoadingFile(false)
      }
    }

    void load()

    return () => {
      cancelled = true
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [canRender, reloadVersion, sourceDocument])

  if (sourceDocumentsQuery.isPending) {
    return (
      <p role="status" className="font-display text-notice text-slate">
        Đang kiểm tra tài liệu nguồn…
      </p>
    )
  }

  if (sourceDocumentsQuery.isError) {
    return (
      <ErrorNotice
        error={sourceDocumentsQuery.error}
        retryLabel="Đọc lại thư viện"
        onRetry={() => void sourceDocumentsQuery.refetch()}
      />
    )
  }

  if (documentId === undefined || sourceDocument === undefined) {
    return (
      <EmptyState
        title="Không tìm thấy tài liệu này"
        body="Tài liệu có thể đã được gỡ khỏi thư viện hoặc đường dẫn không còn đúng."
        action={<BackToLibrary />}
      />
    )
  }

  return (
    <div className="w-full max-w-page">
      <BackToLibrary />

      <header className="mt-block rounded-card-lg bg-surface p-cozy">
        <p className="font-mono text-question text-slate">{sourceDocument.document_id}</p>
        <h1 className="mt-hair text-ask font-semibold text-body">{sourceDocument.title}</h1>
        <DocumentDetails sourceDocument={sourceDocument} />
        {sourceDocument.status_at !== null && (
          <p className="font-display mt-snug text-question text-slate">
            Cập nhật trạng thái {formatDate(sourceDocument.status_at)}
          </p>
        )}
      </header>

      {!canRender && <FileUnavailable sourceDocument={sourceDocument} />}

      {canRender && isLoadingFile && (
        <p role="status" className="font-display mt-block text-notice text-slate">
          Đang mở toàn văn tài liệu…
        </p>
      )}

      {canRender && fileError !== null && (
        <div className="mt-block">
          <ErrorNotice
            error={fileError}
            retryLabel="Mở lại tài liệu"
            onRetry={() => setReloadVersion((value) => value + 1)}
          />
        </div>
      )}

      {loadedDocument?.type === 'pdf' && (
        <section className="mt-block" aria-label="Toàn văn PDF">
          <iframe
            src={loadedDocument.objectUrl}
            title={`Toàn văn: ${sourceDocument.title}`}
            className="h-[72dvh] min-h-[38rem] w-full rounded-card-lg border-2 border-line bg-surface"
          />
          <a
            href={loadedDocument.objectUrl}
            target="_blank"
            rel="noreferrer"
            className="font-display mt-snug inline-flex min-h-touch items-center text-input font-semibold text-body underline underline-offset-4"
          >
            Mở PDF ở tab riêng
          </a>
        </section>
      )}

      {loadedDocument?.type === 'markdown' && (
        <article className="source-markdown mt-block rounded-card-lg bg-surface p-cozy">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
            {loadedDocument.content}
          </ReactMarkdown>
        </article>
      )}
    </div>
  )
}
