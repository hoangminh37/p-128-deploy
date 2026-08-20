import { useParams, useNavigate, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { useLearningLibrary } from '../app/learning'
import { ErrorNotice } from '../ui/ErrorNotice'

export function ArticleDetailScreen() {
  const { articleId } = useParams<{ articleId: string }>()
  const navigate = useNavigate()
  const { data, isPending, isError, error, refetch } = useLearningLibrary()

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-medical/30 border-t-medical rounded-full animate-spin" />
          <p className="text-moss">Đang tải bài học...</p>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-snug">
        <ErrorNotice error={error} retryLabel="Tải lại" onRetry={() => void refetch()} />
      </div>
    )
  }

  const pathItem = data?.learning_paths.find((p) => p.article.id === articleId)

  if (!pathItem) {
    return (
      <div className="flex flex-1 items-center justify-center flex-col gap-4">
        <p className="text-2xl">😕</p>
        <p className="text-moss">Không tìm thấy bài học này.</p>
        <Link to="/learning" className="text-medical underline">← Quay lại Lộ trình</Link>
      </div>
    )
  }

  const { article, day_number } = pathItem
  const isCompleted = data?.completed_articles.includes(article.id)

  // Nguồn tài liệu
  const sourceFile = article.origin_source ?? ''
  const sourceLabels: Record<string, { name: string; code: string; publisher: string }> = {
    'vn-moh-5481-2020-t2dm.pdf': {
      name: 'Hướng dẫn chẩn đoán và điều trị đái tháo đường típ 2',
      code: 'Quyết định số 5481/QĐ-BYT',
      publisher: 'Bộ Y tế Việt Nam, năm 2020',
    },
    'vn-moh-3192-2010-htn.pdf': {
      name: 'Hướng dẫn chẩn đoán và điều trị tăng huyết áp',
      code: 'Quyết định số 3192/QĐ-BYT',
      publisher: 'Bộ Y tế Việt Nam, năm 2010',
    },
  }
  const source = sourceLabels[sourceFile]

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-gray-50/50">
      {/* Header điều hướng */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-rule px-6 py-3 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-moss hover:text-ink transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Lộ trình học tập
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-ink font-medium truncate max-w-xs">{article.title}</span>
      </div>

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-8 py-10 pb-20">
        {/* Badge ngày học */}
        <div className="flex items-center gap-3 mb-6">
          <span className="bg-medical text-white text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
            Chặng {day_number}
          </span>
          {isCompleted && (
            <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
                <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Đã hoàn thành
            </span>
          )}
        </div>

        {/* Tiêu đề */}
        <h1 className="text-3xl sm:text-4xl font-bold text-ink leading-tight mb-8">
          {article.title}
        </h1>

        {/* Nội dung bài học */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 sm:p-10 mb-8">
          <div className="article-body">
            <ReactMarkdown>
              {article.full_content ?? article.content}
            </ReactMarkdown>
          </div>
        </div>

        {/* Nguồn tài liệu */}
        {source && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5 text-blue-600">
                  <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">Nguồn tài liệu biên soạn</p>
                <p className="font-semibold text-blue-900 text-base leading-snug">{source.name}</p>
                <p className="text-blue-700 text-sm mt-1">{source.code}</p>
                <p className="text-blue-500 text-sm">{source.publisher}</p>
                <p className="text-xs text-blue-400 mt-2 italic">
                  Nội dung bài học được biên soạn lại từ tài liệu gốc nhằm giúp bệnh nhân dễ tiếp cận hơn. Không thay thế tư vấn y tế trực tiếp.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Trắc nghiệm ôn tập */}
        {article.quiz_data && (
          <div className="bg-gradient-to-br from-medical/5 to-purple-50 border border-medical/20 rounded-3xl p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-medical/10 rounded-xl flex items-center justify-center text-xl">💡</div>
              <div>
                <h3 className="font-bold text-ink text-lg">Ôn tập nhanh</h3>
                <p className="text-xs text-moss">Kiểm tra kiến thức bạn vừa học</p>
              </div>
            </div>

            <p className="text-ink font-semibold text-lg mb-6 leading-relaxed">
              {article.quiz_data.question}
            </p>

            <ul className="space-y-3 mb-6">
              {article.quiz_data.options.map((opt, idx) => {
                const isCorrect = idx === article.quiz_data!.correct_index
                return (
                  <li
                    key={idx}
                    className={`flex items-start gap-4 p-4 rounded-2xl border-2 transition-all ${
                      isCorrect
                        ? 'bg-white border-medical shadow-sm'
                        : 'bg-white/60 border-transparent'
                    }`}
                  >
                    <span className={`w-8 h-8 shrink-0 text-sm font-bold rounded-xl flex items-center justify-center ${
                      isCorrect ? 'bg-medical text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <div className="flex-1">
                      <span className={isCorrect ? 'text-ink font-semibold' : 'text-moss'}>{opt}</span>
                      {isCorrect && (
                        <span className="ml-2 text-xs font-bold text-medical bg-medical/10 px-2 py-0.5 rounded-full">
                          ✓ Đáp án đúng
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="bg-white/70 rounded-xl p-4 border border-medical/10">
              <p className="text-sm text-moss">
                <span className="font-semibold text-ink">📌 Lưu ý:</span>{' '}
                Bạn chỉ được cộng <strong className="text-medical">+10 HP</strong> khi trả lời đúng câu hỏi này trong phần{' '}
                <Link to="/chat" className="text-medical underline font-medium">Bài học hôm nay</Link>{' '}
                ở màn hình Chat (mỗi ngày 1 lần).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
