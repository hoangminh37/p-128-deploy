/**
 * Bốn trạng thái trợ lý KHÔNG trả lời như bình thường.
 *
 * CHÉP TỪ SECTION `id="tt"` CỦA BẢN MẪU. Bản mẫu bày cả bốn cạnh nhau trong
 * một lưới, và mỗi khối là một `.phieu` với đúng ba phần:
 *
 *   `.phieu-top`   một dải nhãn hai đầu — trái là TÊN TRẠNG THÁI, phải là một
 *                  con số hoặc một mẩu siêu dữ liệu.
 *   `.hang-tt`     ô biểu tượng `.obt` 48px bên trái, tiêu đề + nội dung bên
 *                  phải.
 *   cụm `.btn`     việc làm tiếp theo.
 *
 * BA MẶT CỦA `.obt`, và bản mẫu phân biệt bằng CẢ MÀU LẪN HÌNH — người không
 * bắt được màu vẫn đọc ra ba trạng thái khác nhau:
 *
 *   `.obt.cc`  nền đỏ đặc, chữ giấy      — tam giác cảnh báo · nguy cấp
 *   `.obt.tc`  nền vàng, chữ nâu         — tờ giấy gập góc  · ngoài phạm vi
 *   `.obt.tn`  nền tím nhạt, viền tím    — hai gáy sách     · chưa đủ căn cứ
 *
 * Khối nguy cấp là khối DUY NHẤT có `border-width:2px` và `.phieu-top` nền đỏ
 * đặc. Nó được phép hét, và chỉ nó thôi.
 *
 * Khối "mất kết nối" của bản mẫu (`border-style:dashed`) đã có `ErrorNotice`
 * đảm nhiệm, nên nó không dựng lại ở đây.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { splitParagraphs } from '../lib/paragraphs'
import { AlertIcon, LibraryIcon, NoteIcon, PhoneIcon } from './icons'

/**
 * Bốn giọng, ánh xạ thẳng sang các lớp của bản mẫu.
 *
 * `phieu` / `top` / `obt` là ba chỗ duy nhất khác nhau giữa bốn giọng; phần còn
 * lại của khung dùng chung, nên không có cách nào để hai khối lệch nhịp.
 */
const TONE = {
  /** Nguy cấp. `.phieu` viền đỏ 2px, `.phieu-top` nền đỏ đặc chữ giấy. */
  emergency: {
    phieu: { borderColor: 'var(--do)', borderWidth: 2 },
    top: { background: 'var(--do)', color: 'var(--paper)', borderBottomColor: 'var(--do)' },
    obt: 'obt cc',
    heading: { color: 'var(--do)' },
  },
  /** Ngoài phạm vi / từ chối. `.phieu-top` nền tím nhạt chữ tím. */
  refuse: {
    phieu: undefined,
    top: {
      background: 'var(--tim-wash)',
      color: 'var(--tim)',
      borderBottomColor: 'var(--tim)',
    },
    obt: 'obt tc',
    heading: undefined,
  },
  /** Chưa đủ căn cứ. `.phieu-top` mặc định, ô biểu tượng tím. */
  neutral: {
    phieu: undefined,
    top: undefined,
    obt: 'obt tn',
    heading: undefined,
  },
  /** Sự cố kỹ thuật. Bản mẫu dùng viền ĐỨT cho khối "mất kết nối". */
  fault: {
    phieu: { borderStyle: 'dashed' as const },
    top: undefined,
    obt: 'obt tn',
    heading: undefined,
  },
} as const

export type StateTone = keyof typeof TONE

/**
 * Khung chung của bốn khối.
 *
 * `label` là mẩu bên PHẢI của `.phieu-top` — bản mẫu đặt ở đó "Không hiện trích
 * dẫn", "Đã ghi lại", "0 trích dẫn". Nó luôn là một sự thật kiểm chứng được về
 * chính khối này, không phải một câu quảng cáo.
 */
export function StateBlock({
  tone,
  heading,
  label,
  icon,
  role,
  children,
}: {
  tone: StateTone
  heading: string
  /** Mẩu bên phải của `.phieu-top`. */
  label?: string
  icon: ReactNode
  /**
   * `alert` ngắt lời trình đọc màn hình để đọc ngay; `status` chờ đọc xong câu
   * đang đọc dở. Chỉ `red_flag` và khối lỗi kỹ thuật dùng `alert` — hai thứ đó
   * người dùng phải biết ngay lập tức, còn lại thì đọc tới đâu biết tới đó.
   */
  role?: 'alert' | 'status'
  children: ReactNode
}) {
  const t = TONE[tone]

  return (
    <section role={role} className="phieu" style={{ maxWidth: 920, ...t.phieu }}>
      <div className="phieu-top" style={t.top}>
        <span>{STATE_NAME[tone]}</span>
        {label !== undefined && <span>{label}</span>}
      </div>

      <div style={{ padding: '20px clamp(16px,2vw,24px)' }}>
        <div className="hang-tt">
          <span className={t.obt}>{icon}</span>
          <div>
            <h2 style={{ fontSize: 'var(--t-h3)', lineHeight: 1.3, ...t.heading }}>{heading}</h2>
            <div style={{ marginTop: 10 }}>{children}</div>
          </div>
        </div>
      </div>

      <div className="rangcua" />
    </section>
  )
}

/** Tên trạng thái ở mẩu TRÁI của `.phieu-top`, đúng chữ của bản mẫu. */
const STATE_NAME: Record<StateTone, string> = {
  emergency: 'Dấu hiệu nguy cấp',
  refuse: 'Ngoài phạm vi',
  neutral: 'Chưa đủ căn cứ',
  fault: 'Mất kết nối',
}

/**
 * Nội dung `answer` từ API, cắt thành đoạn.
 *
 * Ba trạng thái này luôn có `citations` rỗng theo mục 5 và mục 6 hợp đồng, nên
 * `answer` không bao giờ chứa marker `[n]` — cắt đoạn thuần là đủ, không cần
 * tới bộ máy trích dẫn của `AnswerDocument`.
 */
function AnswerText({ answer }: { answer: string }) {
  const paragraphs = splitParagraphs(answer)

  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          style={{
            whiteSpace: 'pre-wrap',
            maxWidth: '60ch',
            marginBottom: index < paragraphs.length - 1 ? 12 : 0,
          }}
        >
          {paragraph}
        </p>
      ))}
    </>
  )
}

/**
 * Dấu hiệu cấp cứu.
 *
 * Đặt NGAY DƯỚI tiêu đề câu hỏi, trước mọi thứ khác. Người đang đau ngực không
 * đọc hết trang rồi mới thấy nút gọi.
 *
 * `role="alert"` để trình đọc màn hình ngắt lời và đọc ngay khi khối này xuất
 * hiện — cùng với khối lỗi kỹ thuật, đây là một trong hai chỗ duy nhất trong
 * ứng dụng được phép ngắt lời người dùng.
 *
 * Nút gọi dùng `a href="tel:115"` thật chứ không phải nút JavaScript, để máy nào
 * gọi điện được là bấm ra ngay trình quay số. KHÔNG gắn `role="button"`: trình
 * đọc màn hình sẽ đọc là "nút", mà người dùng bàn phím bấm Space lên một cái
 * "nút" vốn là `a` thì không có gì xảy ra. Bản mẫu cũng để nó là `<a class="btn">`.
 */
export function RedFlagBlock({ answer }: { answer: string }) {
  return (
    <StateBlock
      tone="emergency"
      role="alert"
      label="Không hiện trích dẫn"
      heading="Dấu hiệu này cần được khám ngay"
      icon={<AlertIcon className="" />}
    >
      <AnswerText answer={answer} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
        {/* Nền đỏ đặc, chữ giấy — đúng kiểu bản mẫu đặt cho nút gọi 115. Đây
            là nút duy nhất trong ứng dụng không đổi một pixel nào khi chuyển
            chế độ, vì `--do` ở khối này là màu cố định của cấp cứu. */}
        <a
          href="tel:115"
          className="btn"
          style={{ background: 'var(--do)', borderColor: 'var(--do)', color: 'var(--paper)' }}
        >
          <PhoneIcon className="" />
          Gọi cấp cứu 115
        </a>
      </div>
    </StateBlock>
  )
}

/** Những chủ đề trợ lý trả lời được, để người dùng biết hỏi lại thế nào. */
const ANSWERABLE_TOPICS: readonly string[] = [
  'Chế độ ăn: nên ăn gì, kiêng gì, ăn bao nhiêu là vừa.',
  'Dấu hiệu cần chú ý: khi nào là bình thường, khi nào phải đi khám.',
  'Cách sinh hoạt: vận động, ngủ nghỉ, đo chỉ số tại nhà.',
]

/**
 * Từ chối trả lời.
 *
 * Giọng là GIẢI THÍCH, không phải cấm đoán. Người vừa bị từ chối mà không được
 * nói cho biết vì sao, và không được chỉ cho làm gì tiếp, thì sẽ đi hỏi chỗ
 * khác — mà chỗ khác thì không có ai kiểm duyệt nội dung y khoa.
 *
 * Nên khối này có hai thứ mà `answer` của API không có: một việc cụ thể để làm
 * ngay, và một danh sách nói rõ hỏi lại thế nào thì trợ lý trả lời được.
 */
export function RefusedBlock({ answer }: { answer: string }) {
  return (
    <StateBlock
      tone="refuse"
      label="Đã ghi lại"
      heading="Câu hỏi này phải do bác sĩ quyết định"
      icon={<NoteIcon className="" />}
    >
      <AnswerText answer={answer} />

      <p className="lab" style={{ marginTop: 18 }}>
        Việc bạn có thể làm ngay
      </p>
      <p style={{ marginTop: 6, fontSize: 'var(--t-note)', maxWidth: '60ch', lineHeight: 1.7 }}>
        Bạn hãy ghi câu hỏi này ra giấy, kèm ngày hôm nay, rồi mang theo trong lần tái
        khám tới. Bác sĩ đang điều trị cho bạn là người trả lời được, vì họ nắm kết quả
        xét nghiệm và những thuốc bạn đang uống.
      </p>

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--ke)' }}>
        <p className="lab">Những điều tôi trả lời được</p>
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {ANSWERABLE_TOPICS.map((topic) => (
            <li
              key={topic}
              style={{ fontSize: 'var(--t-note)', lineHeight: 1.7, marginTop: 4 }}
            >
              {topic}
            </li>
          ))}
        </ul>
      </div>
    </StateBlock>
  )
}

/**
 * Chưa có tài liệu về chủ đề này.
 *
 * Ô biểu tượng `.obt.tn` — TÍM, hình GIÁ SÁCH — và đó là cả lập luận của khối:
 * tím là màu của XUẤT XỨ, nên ô tím nói ngay rằng vấn đề nằm ở thư viện tài
 * liệu chứ không nằm ở câu hỏi. Người hỏi KHÔNG làm gì sai, và bố cục phải nói
 * ra điều đó trước khi họ kịp đọc chữ.
 *
 * Đặt cạnh khối `refused` phải nhận ra ngay là hai chuyện khác nhau: một bên ô
 * vàng hình tờ giấy, một bên ô tím hình giá sách. Khác cả màu lẫn hình.
 *
 * Câu "đã được ghi nhận" là lời hứa của HỆ THỐNG chứ không phải của mô hình,
 * nên nó do giao diện nói, không lấy từ `answer`.
 */
export function ReferralBlock({ answer }: { answer: string }) {
  return (
    <StateBlock
      tone="neutral"
      label="0 trích dẫn"
      heading="Thư viện chưa có tài liệu về chủ đề này"
      icon={<LibraryIcon className="" />}
    >
      <p style={{ fontSize: 'var(--t-note)', color: 'var(--xam)', lineHeight: 1.7 }}>
        Bạn không hỏi sai. Chủ đề này chỉ là chưa có trong thư viện tài liệu mà hệ thống
        được phép trích dẫn.
      </p>

      <div style={{ marginTop: 12 }}>
        <AnswerText answer={answer} />
      </div>

      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 18 }}>
        <Link to="/consultations" className="btn sm pri">
          Chọn tư vấn với bác sỹ
        </Link>
        <Link to="/chat" className="btn sm">
          Hỏi câu khác
        </Link>
      </div>

      <p
        className="lab"
        style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--ke)', lineHeight: 1.6 }}
      >
        Câu hỏi của bạn đã được ghi nhận. Đội ngũ biên tập y khoa sẽ xem xét bổ sung tài
        liệu cho chủ đề này.
      </p>
    </StateBlock>
  )
}

/**
 * Câu chốt bắt buộc ở mọi phản hồi, theo mục 5 hợp đồng.
 *
 * Mờ nhất trên trang: lớp `.lab` — mono, giãn chữ, màu `--xam` — tách bằng một
 * nét kẻ mảnh. Nó phải luôn đọc được, nhưng không bao giờ được tranh chỗ với
 * câu trả lời. Nó lùi lại bằng MÀU và VỊ TRÍ, không bằng cỡ chữ.
 */
export function Disclaimer({ text }: { text: string }) {
  return (
    <p
      className="lab"
      style={{
        marginTop: 26,
        maxWidth: '64ch',
        paddingTop: 14,
        borderTop: '1px solid var(--ke)',
        lineHeight: 1.6,
      }}
    >
      {text}
    </p>
  )
}
