import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDailyLesson, getLearningLibrary, completeLesson, type DailyLessonResponse, type GamificationStats, type LearningLibraryResponse, type CompleteLessonRequest } from '../lib/api'

export const learningKeys = {
  all: ['learning'] as const,
  dailyLesson: () => [...learningKeys.all, 'daily-lesson'] as const,
  library: () => [...learningKeys.all, 'library'] as const,
}

export function useDailyLesson() {
  return useQuery<DailyLessonResponse, Error>({
    queryKey: learningKeys.dailyLesson(),
    queryFn: getDailyLesson,
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

  return useMutation<GamificationStats, Error, { articleId: string, payload: CompleteLessonRequest }>({
    mutationFn: ({ articleId, payload }) => completeLesson(articleId, payload),
    onSuccess: () => {
      // Refresh the daily lesson when completed
      queryClient.invalidateQueries({ queryKey: learningKeys.dailyLesson() })
      queryClient.invalidateQueries({ queryKey: learningKeys.library() })
    },
  })
}
