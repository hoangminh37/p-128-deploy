import { useState } from 'react'
import { useLearningLibrary } from '../app/learning'
import { Link } from 'react-router-dom'
import { ErrorNotice } from '../ui/ErrorNotice'
import { CloseIcon } from '../ui/icons'

export function LearningLibraryScreen() {
  const { data, isPending, isError, error, refetch } = useLearningLibrary()
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null)

  return (
    <div className="flex flex-1 flex-col relative">
      <div className="flex-1 p-snug overflow-y-auto">
        {isPending && (
          <p className="text-moss">Đang tải thư viện học tập...</p>
        )}
        
        {isError && (
          <ErrorNotice 
            error={error} 
            retryLabel="Tải lại thư viện" 
            onRetry={() => void refetch()} 
          />
        )}
        
        {data && (
          <div className="flex flex-col gap-block max-w-3xl">
            {/* Thống kê học tập */}
            <div className="bg-medical/10 border border-medical/20 rounded-lg p-cozy flex items-center justify-between">
              <div>
                <h3 className="font-bold text-medical text-lg">Tiến độ học tập</h3>
                <p className="text-moss text-sm">Bạn đã hoàn thành {data.completed_articles.length} bài học trong thư viện.</p>
              </div>
              <div className="text-right">
                <Link to="/chat" className="text-medical font-medium text-sm underline underline-offset-2">Làm bài học hôm nay &rarr;</Link>
              </div>
            </div>

            {/* Danh sách các bài học */}
            <div>
              <h3 className="font-bold text-ink mb-snug text-lg">Tất cả bài học</h3>
              <div className="grid gap-snug sm:grid-cols-2">
                {data.articles.map((article) => {
                  const isCompleted = data.completed_articles.includes(article.id)
                  
                  return (
                    <div 
                      key={article.id} 
                      onClick={() => setSelectedArticle(article)}
                      className={`rounded-lg border-2 p-cozy flex flex-col cursor-pointer transition-colors hover:border-medical/50 ${
                        isCompleted 
                          ? 'border-medical/30 bg-medical/5' 
                          : 'border-border bg-paper'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rule text-moss">
                          {article.category}
                        </span>
                        {isCompleted && (
                          <span className="text-xs font-bold text-medical bg-medical/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-medical"></span>
                            Hoàn thành
                          </span>
                        )}
                      </div>
                      
                      <h4 className="font-bold text-ink mb-1">{article.title}</h4>
                      <p className="text-sm text-moss line-clamp-3 mb-3 flex-1">{article.content}</p>
                      
                      {article.quiz_data && (
                        <div className="mt-auto pt-3 border-t border-rule text-xs text-moss font-medium">
                          ❓ Có bài tập trắc nghiệm
                        </div>
                      )}
                    </div>
                  )
                })}
                
                {data.articles.length === 0 && (
                  <p className="text-moss col-span-2 text-center py-block bg-rule rounded-lg">Chưa có bài học nào trong thư viện.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Popup Chi tiết Bài học */}
      {selectedArticle && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-paper border-2 border-border rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-cozy border-b border-rule">
              <h3 className="font-bold text-xl text-ink">{selectedArticle.title}</h3>
              <button 
                onClick={() => setSelectedArticle(null)}
                className="p-1 rounded-md hover:bg-rule text-moss"
              >
                <CloseIcon className="w-6 h-6" />
              </button>
            </div>
            <div className="p-cozy overflow-y-auto">
              <div className="prose prose-slate max-w-none text-ink">
                <p className="whitespace-pre-wrap">{selectedArticle.content}</p>
              </div>
              
              {selectedArticle.quiz_data && (
                <div className="mt-6 bg-rule rounded-lg p-cozy">
                  <h4 className="font-bold text-ink mb-2">Câu hỏi ôn tập:</h4>
                  <p className="text-ink mb-4">{selectedArticle.quiz_data.question}</p>
                  <ul className="space-y-2">
                    {selectedArticle.quiz_data.options.map((opt: string, idx: number) => (
                      <li 
                        key={idx} 
                        className={`p-3 rounded-md border ${
                          idx === selectedArticle.quiz_data.correct_index 
                            ? 'bg-medical/10 border-medical/40 text-medical font-medium' 
                            : 'bg-paper border-border text-moss'
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}. {opt}
                        {idx === selectedArticle.quiz_data.correct_index && (
                          <span className="ml-2 text-xs">(Đáp án đúng)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-moss mt-4 italic">
                    * Lưu ý: Bạn chỉ được cộng HP khi trả lời câu hỏi này tại Banner "Bài học hằng ngày" trên giao diện Chat.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
