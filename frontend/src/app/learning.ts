import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDailyLesson, getLearningLibrary, completeLesson, type DailyLessonResponse, type LearningLibraryResponse, type CompleteLessonRequest, type CompleteLessonResponse } from '../lib/api'

export const learningKeys = {
  all: ['learning'] as const,
  dailyLesson: () => [...learningKeys.all, 'daily-lesson'] as const,
  library: () => [...learningKeys.all, 'library'] as const,
}

export function useDailyLesson(enabled = true) {
  return useQuery<DailyLessonResponse, Error>({
    queryKey: learningKeys.dailyLesson(),
    queryFn: getDailyLesson,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useLearningLibrary() {
  return useQuery<LearningLibraryResponse, Error>({
    queryKey: learningKeys.library(),
    queryFn: getLearningLibrary,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useCompleteLesson() {
  const queryClient = useQueryClient()

  return useMutation<CompleteLessonResponse, Error, { articleId: string, payload: CompleteLessonRequest }>({
    mutationFn: ({ articleId, payload }) => completeLesson(articleId, payload),
    onSuccess: (data) => {
      // Trả lời sai vẫn là 200 nhưng KHÔNG có gì đổi trong DB — nạp lại lúc đó
      // chỉ tốn hai request và làm nhấp nháy banner đang hiển thị giải thích.
      if (!data.is_correct) return
      queryClient.invalidateQueries({ queryKey: learningKeys.dailyLesson() })
      queryClient.invalidateQueries({ queryKey: learningKeys.library() })
    },
  })
}
