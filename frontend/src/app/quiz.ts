/**
 * TanStack Query cho luồng trắc nghiệm kiến thức.
 *
 * Sinh đề là MUTATION chứ không phải query, dù nó chỉ đọc dữ liệu: mỗi lần gọi
 * backend ghi một `QuizSession` mới vào DB và tốn một lượt LLM. Bọc bằng
 * `useQuery` thì refetch tự động lúc cửa sổ lấy lại focus sẽ âm thầm đổi đề
 * ngay dưới tay người đang làm bài.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { learningKeys } from './learning'
import {
  generateQuiz,
  getQuizHistory,
  getQuizMistakes,
  submitQuiz,
  type ApiError,
  type QuizHistoryResponse,
  type QuizMistakesResponse,
  type QuizResponse,
  type QuizSubmitRequest,
  type QuizSubmitResponse,
} from '../lib/api'
import type { QuizSource } from '../lib/schemas'

export const quizKeys = {
  all: ['quiz'] as const,
  history: () => [...quizKeys.all, 'history'] as const,
  mistakes: () => [...quizKeys.all, 'mistakes'] as const,
}

export type GenerateQuizInput = {
  source: QuizSource
  articleId?: string
  conversationId?: string
  numQuestions?: number
}

export function useGenerateQuiz() {
  return useMutation<QuizResponse, ApiError, GenerateQuizInput>({
    mutationFn: (input) =>
      generateQuiz({
        source: input.source,
        article_id: input.articleId,
        conversation_id: input.conversationId,
        num_questions: input.numQuestions,
      }),
    // Không retry: mỗi lần thử lại là thêm vài giây chờ và một lượt LLM nữa.
    // Backend đã tự thử lại tối đa 3 lần bên trong rồi.
    retry: false,
  })
}

export function useSubmitQuiz() {
  const queryClient = useQueryClient()

  return useMutation<QuizSubmitResponse, ApiError, { quizId: string; payload: QuizSubmitRequest }>({
    mutationFn: ({ quizId, payload }) => submitQuiz(quizId, payload),
    onSuccess: () => {
      // Điểm HP nằm chung một sổ với Thư viện học tập, nên phải dọn cả cache
      // của bài học hằng ngày — nếu không thanh điểm ở thanh bên vẫn là số cũ.
      void queryClient.invalidateQueries({ queryKey: learningKeys.all })
      void queryClient.invalidateQueries({ queryKey: quizKeys.history() })
      // Nộp bài xong là danh sách chỗ chưa nắm đã đổi — sai thêm chỗ mới, hoặc
      // gỡ được chỗ cũ. Không dọn thì màn ôn lại hiện số liệu của lượt trước.
      void queryClient.invalidateQueries({ queryKey: quizKeys.mistakes() })
    },
  })
}

export function useQuizHistory() {
  return useQuery<QuizHistoryResponse, ApiError>({
    queryKey: quizKeys.history(),
    queryFn: getQuizHistory,
    staleTime: 60_000,
  })
}

export function useQuizMistakes() {
  return useQuery<QuizMistakesResponse, ApiError>({
    queryKey: quizKeys.mistakes(),
    queryFn: getQuizMistakes,
    staleTime: 60_000,
  })
}
