/**
 * Màn ôn lại chỗ chưa nắm — `/quiz/mistakes`.
 *
 * Hai nửa, và thứ tự giữa chúng là chủ ý:
 *
 *   1. ĐỌC LẠI  — từng câu đã sai, đáp án mình đã chọn, đáp án đúng, và vì sao.
 *   2. LÀM LẠI  — đề MỚI trên cùng những khái niệm đó.
 *
 * Đọc trước rồi mới làm. Cho làm lại ngay khi chưa đọc giải thích thì người học
 * chỉ đang đoán lại lần nữa. Và đề làm lại là câu MỚI chứ không phải câu cũ xáo
 * đáp án — cách đó chỉ đo được trí nhớ mặt chữ, không đo được đã hiểu chưa.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useQuizMistakes } from '../app/quiz'
import type { QuizMistake } from '../lib/schemas'
import { ErrorNotice } from '../ui/ErrorNotice'
import { QuizPanel } from '../ui/QuizPanel'

export function MistakesScreen() {
  const { data, isPending, isError, error, refetch } = useQuizMistakes()
  const [dangLamLai, setDangLamLai] = useState(false)

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p role="status" className="font-display text-question text-slate">
          Đang xem lại bài làm của bạn…
        </p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-cozy">
        <ErrorNotice error={error} retryLabel="Tải lại" onRetry={() => void refetch()} />
      </div>
    )
  }

  const mistakes = data?.items ?? []

  return (
    /* CHÉP TỪ `id="cs"`: nhãn `.eb` đếm số chỗ, tiêu đề, rồi một `.phieu` cho
       mỗi chỗ — `.phieu-top` ghi tên khái niệm và số trích dẫn, một hàng
       `.pill-sai` + `.lab` ngay dưới, và thân là cặp "Bạn chọn / Đáp án" đặt
       cạnh nhau. */
    <div>
      <div className="eb">{mistakes.length} chỗ bạn còn nhầm</div>

      <h1 style={{ fontSize: 'var(--t-h2)', lineHeight: 1.22, marginTop: 12 }}>
        Chỗ chưa nắm
      </h1>

      {mistakes.length > 0 ? (
        <p className="lab" style={{ marginTop: 8, lineHeight: 1.6 }}>
          Tổng {data?.total_wrong} lần trả lời sai, tính trên {data?.sessions_scanned} bài
          đã nộp. Câu sai nhiều lần xếp trước.
        </p>
      ) : (
        <p className="lab" style={{ marginTop: 8, lineHeight: 1.6 }}>
          Bạn chưa trả lời sai câu nào. Làm thêm vài bài trắc nghiệm rồi quay lại đây nhé.
        </p>
      )}

      {mistakes.length === 0 ? (
        <Link to="/quiz" className="btn pri" style={{ marginTop: 22 }}>
          Làm một bài trắc nghiệm
        </Link>
      ) : (
        <>
          <ol style={{ listStyle: 'none', margin: '22px 0 0', padding: 0 }}>
            {mistakes.map((mistake, index) => (
              <MistakeCard key={`${mistake.quiz_id}-${index}`} mistake={mistake} />
            ))}
          </ol>

          <div style={{ marginTop: 22 }}>
            {dangLamLai ? (
              <QuizPanel source="mistakes" ctaLabel="Bắt đầu làm lại" />
            ) : (
              <>
                <p className="lab" style={{ maxWidth: '56ch', lineHeight: 1.6 }}>
                  Trợ lý sẽ soạn câu hỏi MỚI về đúng các khái niệm trên, diễn đạt khác
                  đi. Nhớ mặt đáp án cũ sẽ không giúp được — đó mới là cách biết bạn đã
                  thật sự hiểu.
                </p>
                <button
                  type="button"
                  onClick={() => setDangLamLai(true)}
                  className="btn pri"
                  style={{ marginTop: 14 }}
                >
                  Làm đề mới trên những chỗ này
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Một chỗ chưa nắm — CHÉP TỪ `id="cs"`.
 *
 * `.phieu` với `.phieu-top` ghi câu hỏi, một hàng `.pill-sai` + `.lab` ngay
 * dưới dải đầu, rồi cặp "Bạn chọn / Đáp án" đặt cạnh nhau.
 *
 * ĐỎ Ở "BẠN CHỌN" LÀ NHÃN LỖI, không phải cảnh báo nguy cấp — bản mẫu dùng
 * đúng cặp này (`--do` cho lựa chọn sai, `--xanh` cho đáp án đúng), và cả hai
 * đều kèm nhãn chữ nên người không phân biệt được màu vẫn đọc ra.
 */
function MistakeCard({ mistake }: { mistake: QuizMistake }) {
  /** Đáp án chọn gần nhất. Mảng `chosen` xếp mới nhất trước. */
  const daChon = mistake.chosen[0]

  return (
    <li className="phieu" style={{ marginTop: 14 }}>
      <div className="phieu-top">
        <span>{mistake.question}</span>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 9,
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '14px clamp(16px,2vw,24px) 0',
        }}
      >
        <span className="pill-sai">Sai {mistake.times_wrong} lần</span>
        {mistake.topic && <span className="lab">{mistake.topic}</span>}
      </div>

      <div style={{ padding: '18px clamp(16px,2vw,24px)' }}>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <div>
            <span className="lab">Bạn chọn</span>
            <p style={{ color: 'var(--do)', marginTop: 2 }}>
              {daChon !== undefined ? mistake.options[daChon] : 'Chưa trả lời'}
            </p>
          </div>
          <div>
            <span className="lab">Đáp án</span>
            <p style={{ color: 'var(--xanh)', marginTop: 2 }}>
              {mistake.options[mistake.correct_index]}
            </p>
          </div>
        </div>

        <p style={{ marginTop: 14, maxWidth: '56ch', fontSize: 'var(--t-note)', lineHeight: 1.7 }}>
          {mistake.explanation}
        </p>
      </div>

      <div className="rangcua" />
    </li>
  )
}
