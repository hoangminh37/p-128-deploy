import { useLearningLibrary } from '../app/learning'
import { Link, useNavigate } from 'react-router-dom'
import { ErrorNotice } from '../ui/ErrorNotice'
import { CheckIcon } from '../ui/icons'

export function LearningLibraryScreen() {
  const { data, isPending, isError, error, refetch } = useLearningLibrary()
  const navigate = useNavigate()

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 p-snug overflow-y-auto bg-gray-50/50">
        {isPending && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-medical/30 border-t-medical rounded-full animate-spin" />
            <p className="text-moss">Đang tải Lộ trình học tập...</p>
          </div>
        )}

        {isError && (
          <ErrorNotice
            error={error}
            retryLabel="Tải lại lộ trình"
            onRetry={() => void refetch()}
          />
        )}

        {data && (
          <div className="flex flex-col gap-block max-w-3xl mx-auto py-block">
            {/* Header thống kê */}
            <div className="bg-white border-2 border-medical/20 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-bold text-ink text-2xl mb-1">Lộ trình của bạn 🚀</h2>
                <p className="text-moss">
                  Đã hoàn thành{' '}
                  <span className="font-bold text-medical">{data.completed_articles.length}</span>{' '}
                  / {data.learning_paths.length} chặng đường.
                </p>
              </div>
              <Link
                to="/chat"
                className="bg-medical text-white font-medium text-sm px-5 py-2.5 rounded-full hover:bg-medical/90 transition-colors shrink-0 shadow-sm"
              >
                Học bài hôm nay
              </Link>
            </div>

            {/* Roadmap Timeline */}
            <div className="relative mt-4 pl-4 sm:pl-8">
              {/* Đường dọc */}
              <div className="absolute top-0 bottom-0 left-[27px] sm:left-[43px] w-1 bg-medical/20 rounded-full" />

              <div className="flex flex-col gap-6">
                {data.learning_paths.map((path, idx) => {
                  const article = path.article
                  const isCompleted = data.completed_articles.includes(article.id)
                  const isNext =
                    !isCompleted &&
                    (idx === 0 ||
                      data.completed_articles.includes(data.learning_paths[idx - 1].article.id))
                  const isClickable = isCompleted || isNext

                  return (
                    <div key={article.id} className="relative flex items-start gap-4 sm:gap-6 group">
                      {/* Node */}
                      <button
                        disabled={!isClickable}
                        onClick={() => isClickable && navigate(`/learning/${article.id}`)}
                        className={`
                          relative z-10 w-10 h-10 shrink-0 rounded-full flex items-center justify-center border-4 border-white shadow-sm transition-all
                          ${isCompleted ? 'bg-medical text-white' : isNext ? 'bg-medical/20 text-medical ring-4 ring-medical/10' : 'bg-rule text-moss'}
                          ${isClickable ? 'cursor-pointer group-hover:scale-110' : 'cursor-not-allowed'}
                        `}
                      >
                        {isCompleted ? (
                          <CheckIcon className="w-5 h-5" />
                        ) : (
                          <span className="font-bold text-sm">{path.day_number}</span>
                        )}
                      </button>

                      {/* Card */}
                      <button
                        disabled={!isClickable}
                        onClick={() => isClickable && navigate(`/learning/${article.id}`)}
                        className={`
                          flex-1 text-left rounded-2xl border-2 p-5 transition-all
                          ${
                            isCompleted
                              ? 'border-medical/30 bg-white shadow-sm cursor-pointer hover:border-medical hover:shadow-md'
                              : isNext
                                ? 'border-medical bg-medical/5 shadow-md cursor-pointer hover:bg-medical/10'
                                : 'border-rule bg-gray-50 opacity-60 cursor-not-allowed'
                          }
                        `}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                              isCompleted
                                ? 'bg-medical/10 text-medical'
                                : isNext
                                  ? 'bg-medical text-white'
                                  : 'bg-gray-200 text-gray-500'
                            }`}
                          >
                            Ngày {path.day_number}
                          </span>
                          {isNext && (
                            <span className="text-xs text-medical font-semibold animate-pulse">
                              👉 Học tiếp
                            </span>
                          )}
                        </div>

                        <h4
                          className={`font-bold text-base mb-2 ${!isClickable ? 'text-gray-400' : 'text-ink'}`}
                        >
                          {article.title}
                        </h4>

                        <p className="text-sm text-moss line-clamp-2">
                          {isClickable
                            ? article.content
                            : 'Hoàn thành các chặng trước để mở khoá nội dung này.'}
                        </p>

                        {isClickable && article.quiz_data && (
                          <div className="mt-3 flex items-center gap-2 text-xs font-medium text-medical bg-medical/10 w-fit px-3 py-1.5 rounded-lg">
                            <span>🏆</span> Có bài tập trắc nghiệm (+10 HP)
                          </div>
                        )}

                        {isClickable && (
                          <div className="mt-3 flex items-center gap-1 text-xs text-medical/70 font-medium">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Đọc bài học đầy đủ
                          </div>
                        )}
                      </button>
                    </div>
                  )
                })}

                {data.learning_paths.length === 0 && (
                  <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-rule">
                    <p className="text-3xl mb-3">📚</p>
                    <p className="text-moss mb-1">Chưa có bài học nào trong thư viện.</p>
                    <p className="text-sm text-gray-400">Hệ thống đang chuẩn bị giáo trình, bạn quay lại sau nhé!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
