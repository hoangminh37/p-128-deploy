/**
 * Màn đầu tiên người dùng thấy.
 *
 * Việc của màn này không phải là chào hỏi, mà là đặt đúng kỳ vọng trước khi
 * người bệnh gõ câu hỏi đầu tiên. Ba điều phải hiểu trong vài giây:
 *
 *   1. Công cụ này dành cho người ĐÃ được bác sĩ chẩn đoán, không phải chỗ để
 *      tự tra xem mình bị bệnh gì.
 *   2. Câu trả lời nào cũng có nguồn, và nguồn hiện ngay cạnh câu trả lời.
 *   3. Công cụ không chẩn đoán, không kê đơn, không chỉnh liều thuốc.
 *
 * Phần chữ ở đây được viết bằng câu ngắn, từ thông dụng, và nói thẳng vào việc
 * người đọc cần làm gì. Nói bằng tên bệnh cụ thể ("tiểu đường", "cao huyết áp")
 * chứ không nói "bệnh mãn tính" — người ít quen thuật ngữ nhận ra mình qua tên
 * bệnh, không nhận ra qua tên nhóm bệnh.
 */
import { Link } from 'react-router-dom'

import { usePatient } from '../patient/context'

/** Ba điều phải hiểu ngay. Dòng đầu để quét mắt, dòng sau để đọc kỹ. */
const KEY_POINTS: ReadonlyArray<{ lead: string; body: string }> = [
  {
    lead: 'Dành cho người đã được bác sĩ chẩn đoán',
    body:
      'Bạn đã đi khám và bác sĩ kết luận bạn mắc tiểu đường hoặc cao huyết áp. ' +
      'Nếu bạn đang thấy khó chịu trong người và muốn biết mình bị bệnh gì, ' +
      'chỗ này không trả lời được. Bạn cần đi khám.',
  },
  {
    lead: 'Câu trả lời nào cũng có nguồn',
    body:
      'Trợ lý chỉ trả lời dựa trên tài liệu của Bộ Y tế đã được đưa vào thư viện. ' +
      'Tên tài liệu hiện ngay cạnh câu trả lời, để bạn tự kiểm tra được, hoặc ' +
      'đưa cho bác sĩ xem.',
  },
  {
    lead: 'Không chẩn đoán, không kê đơn, không chỉnh liều thuốc',
    body:
      'Trợ lý không kết luận bạn đang bị bệnh gì, không cho đơn thuốc, và không ' +
      'bảo bạn tăng hay giảm liều. Những việc đó chỉ bác sĩ khám trực tiếp cho ' +
      'bạn mới được làm.',
  },
]

export function RoleScreen() {
  const { profile } = usePatient()

  // Có hồ sơ rồi thì vào thẳng chỗ hỏi đáp, chưa có thì đi khai hồ sơ trước.
  //
  // Trên thực tế guard `RedirectIfPatientExists` ở `app/guards.tsx` đã đưa người
  // có patient_id thẳng sang `/chat` trước khi màn này kịp render, nên nhánh
  // `/chat` dưới đây gần như không chạy. Vẫn viết đúng để nếu sau này guard đổi
  // thì chỗ này không âm thầm dẫn sai đường.
  const destination = profile !== null ? '/chat' : '/profile'

  return (
    <div className="max-w-answer">
      <h1 className="font-display text-heading font-bold">
        Hỏi cho hiểu về bệnh của mình
      </h1>

      <p className="font-display mt-snug text-question text-moss">
        Đây là chỗ để bạn hỏi những điều còn băn khoăn về bệnh mà bác sĩ đã chẩn
        đoán cho bạn.
      </p>

      {/* Ba điều cốt lõi. Nét kẻ dọc gom chúng lại thành một khối để mắt nhận ra
          đây là phần cần đọc, không phải chữ trang trí. */}
      <ul className="mt-block space-y-cozy">
        {KEY_POINTS.map((point) => (
          <li key={point.lead} className="border-l-2 border-rule pl-snug">
            <p className="font-display text-question font-semibold text-ink">
              {point.lead}
            </p>
            <p className="font-display mt-hair text-note text-moss">{point.body}</p>
          </li>
        ))}
      </ul>

      {/* ---- Chọn vai trò ---- */}
      <div className="mt-turn">
        <h2 className="font-display text-question font-semibold">Bạn là ai?</h2>

        {/* Lối đi chính: chiếm hết bề ngang, nền đặc, chữ lớn nhất trong màn.
            Dùng `Link` thật chứ không phải `button` + navigate, để bấm giữ mở
            tab mới và trình đọc màn hình đọc đúng là một liên kết. */}
        <Link
          to={destination}
          className="font-display mt-cozy flex min-h-touch items-center justify-center rounded-lg border-2 border-medical bg-medical p-cozy text-center text-answer font-bold text-paper no-underline"
        >
          Tôi là bệnh nhân hoặc người chăm sóc
        </Link>

        {/* Lối phụ chưa mở.
            KHÔNG dùng thuộc tính `disabled`: nút `disabled` bị bàn phím bỏ qua
            hoàn toàn, nên người dùng bàn phím và người dùng trình đọc màn hình
            sẽ không bao giờ nghe được dòng giải thích vì sao nó chưa dùng được —
            và một ô xám câm lặng thì trông y như đang hỏng.

            Thay vào đó dùng `aria-disabled`: nút vẫn nhận được focus, vẫn đọc
            được, chỉ là bấm không đi đâu. Thêm nhãn "Sắp có" và viền nét đứt để
            trạng thái chưa mở là điều nhìn thấy được, không phải điều phải đoán. */}
        <div className="mt-cozy">
          <button
            type="button"
            aria-disabled="true"
            aria-describedby="editor-note"
            onClick={(event) => {
              // Chặn tại đây thay vì để nút trơ: bấm mà không có gì xảy ra và
              // cũng không báo gì thì người dùng sẽ tưởng ứng dụng treo.
              event.preventDefault()
            }}
            className="font-display flex min-h-touch w-full cursor-not-allowed items-center justify-center gap-tight rounded-lg border-2 border-dashed border-border p-snug text-center text-question text-moss"
          >
            Tôi là biên tập viên y khoa
            <span className="font-mono rounded-xs border border-rule px-hair text-marker">
              Sắp có
            </span>
          </button>

          <p id="editor-note" className="font-display mt-tight text-note text-moss">
            Phần dành cho biên tập viên đang được xây dựng, chưa mở trong bản này.
            Bạn chưa cần dùng tới nó.
          </p>
        </div>
      </div>
    </div>
  )
}
