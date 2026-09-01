/**
 * Hai loại nhãn của hàng đợi duyệt: nguồn gốc và trạng thái. Cộng khối biểu
 * tượng vuông đứng đầu mỗi dòng danh sách.
 *
 * MỌI NHÃN Ở ĐÂY LÀ MỘT KHUNG KẺ, không phải một viên thuốc nền đặc. Nền nhạt
 * cộng viền 1px cùng màu chữ — đúng nhịp `.chip` của bản mẫu thiết kế. Trên
 * một màn hàng đợi có ba bốn chục dòng, mỗi dòng hai ba nhãn, thì viên thuốc
 * nền đặc biến cả trang thành một mảng màu loang và không nhãn nào còn nổi lên
 * được nữa. Khung kẻ thì xếp chồng lên nhau bao nhiêu cũng vẫn đọc được.
 *
 * NGUỒN GỐC phải phân biệt được NGAY BẰNG MẮT, vì nó đổi cách người duyệt đọc
 * cả mục: nội dung sinh từ câu hỏi bệnh nhân là thứ có người đang chờ, còn nội
 * dung biên tập viên tự thêm thì không gấp bằng.
 *
 * Nên hai nhãn khác nhau ở CẢ HAI kênh — màu và hình — chứ không chỉ màu: tím
 * với hổ phách là hai màu mà người khó phân biệt màu có thể thấy gần nhau.
 * Biểu tượng gánh phần còn lại.
 *
 * Cỡ `question` 16px cho mọi nhãn: trên sàn 15px của chữ phụ, và đây là chữ để
 * quét mắt chứ không phải để đọc kỹ.
 *
 * TƯƠNG PHẢN: coral-deep trên coral 6.73:1, sand-deep trên sand 6.31:1,
 * mint-deep trên mint 5.33:1, alert trên alert-wash 5.39:1, body trên canvas
 * 15.79:1, slate trên canvas 4.93:1.
 */
import type { ReactNode } from 'react'

import { ORIGIN_LABEL, STATUS_LABEL } from '../lib/editorLabels'
import type { EditorItemOrigin, EditorItemStatus } from '../lib/schemas'
import { NoteIcon, UserIcon } from './icons'

/**
 * `.chip` của bản mẫu: mono, giãn chữ, chữ hoa, viền 1px, nền wash. Bản mẫu
 * khai sẵn năm biến thể — `.cho` `.duyet` `.loi` `.nhap` `.idx` — và năm cái
 * đó phủ đúng năm trong sáu bậc trạng thái ở đây.
 */
function Chip({ variant, children }: { variant: string; children: ReactNode }) {
  return <span className={`chip ${variant}`}>{children}</span>
}

/**
 * Cặp màu của một nguồn gốc, dùng ở HAI chỗ: nhãn trong thẻ, và khối biểu
 * tượng vuông đứng đầu dòng.
 *
 * KHÔNG export: file component chỉ được export component thì Fast Refresh của
 * Vite mới chạy đúng — cùng lý do mà nhãn tiếng Việt phải nằm ở
 * `lib/editorLabels.ts`. Chỗ nào ngoài file này cần cặp màu nguồn gốc thì dùng
 * `OriginIconBox` hoặc `OriginBadge`, đừng lôi bảng màu ra ngoài.
 *
 * Khai một chỗ để hai chỗ không bao giờ lệch nhau. Một dòng có khối vuông màu
 * tím mà nhãn lại màu hổ phách thì người duyệt phải dừng lại để nghĩ xem tin
 * cái nào — mà đây là danh sách để quét mắt, không phải để nghĩ.
 */
const ORIGIN_SKIN: Record<EditorItemOrigin, string> = {
  // `.hopbt.bn` — hộp "bệnh nhân", nền đỏ nhạt viền đỏ. Bản mẫu dùng đỏ ở đây
  // vì dòng sinh từ câu hỏi bệnh nhân là dòng CÓ NGƯỜI ĐANG CHỜ; nó không phải
  // cảnh báo nguy cấp nhưng nó là thứ phải xử lý trước.
  question_log: 'hopbt bn',
  // `.hopbt.btv` — hộp "biên tập viên", nền vàng viền vàng.
  editor_upload: 'hopbt btv',
}

const ORIGIN_CHIP: Record<EditorItemOrigin, string> = {
  question_log: 'loi',
  editor_upload: 'idx',
}

const ORIGIN_ICON: Record<EditorItemOrigin, ReactNode> = {
  question_log: <UserIcon className="" />,
  editor_upload: <NoteIcon className="" />,
}

/**
 * Khối biểu tượng vuông 48px, KHÔNG BO GÓC, đứng đầu mỗi dòng của hàng đợi.
 *
 * Nó mang đúng màu của nguồn gốc, nên cả danh sách quét dọc một lượt là thấy
 * ngay dòng nào sinh từ câu hỏi bệnh nhân — thứ có người đang chờ.
 */
export function OriginIconBox({ origin }: { origin: EditorItemOrigin }) {
  return <span className={ORIGIN_SKIN[origin]}>{ORIGIN_ICON[origin]}</span>
}

export function OriginBadge({ origin }: { origin: EditorItemOrigin }) {
  return <Chip variant={ORIGIN_CHIP[origin]}>{ORIGIN_LABEL[origin]}</Chip>
}

/**
 * SÁU BẬC TRẠNG THÁI, giữ nguyên nhãn tiếng Việt của bản trước
 * (`lib/editorLabels.ts`), đổi hết màu theo bảng mới.
 *
 * Đọc từ trên xuống là đọc đúng vòng đời của một mục:
 *
 *   Nháp          XÁM, viền nhạt, nền trong suốt. Chưa vào quy trình.
 *   Chờ duyệt     TÍM. Đang chờ một CON NGƯỜI ra quyết định.
 *   Đang index    HỔ PHÁCH. Đang chờ một CÁI MÁY chạy xong.
 *   Index thất bại ĐỎ NHẠT có viền. Máy chạy hỏng, phải chạy lại.
 *   Đã duyệt      XANH CÔNG VỤ. Kết luận có, mục được dùng.
 *   Đã từ chối    MỰC, viền mực. Kết luận không, và nó đóng lại.
 *
 * VÌ SAO "ĐANG INDEX" PHẢI CÓ MÀU RIÊNG, không dùng chung tím với "Chờ duyệt":
 * hai bậc này giống nhau ở chỗ cùng là "chưa xong", nhưng khác nhau ở chỗ AI
 * đang phải làm gì. "Chờ duyệt" nghĩa là biên tập viên còn việc; "Đang index"
 * nghĩa là biên tập viên KHÔNG có việc gì, chỉ chờ job chạy. Dùng chung một
 * màu thì người trực hàng đợi mở một mục đang index ra rồi mới biết mình không
 * làm gì được — và làm thế vài chục lần một ca.
 *
 * VÌ SAO "INDEX THẤT BẠI" ĐƯỢC DÙNG ĐỎ, dù bảng màu nói đỏ chỉ dành cho cảnh
 * báo nguy cấp: bản mẫu thiết kế có sẵn một bậc `.chip.loi` màu đỏ NHẠT CÓ
 * VIỀN cho nhãn lỗi, tách hẳn với nền đỏ ĐẶC của khối cấp cứu. Ở đây dùng
 * đúng bậc nhạt đó. Nền đỏ đặc vẫn chỉ có duy nhất một chỗ trong cả ứng dụng —
 * khối `red_flag` ở `ResponseStates.tsx`.
 */
const STATUS_CHIP: Record<EditorItemStatus, string> = {
  draft: 'nhap',
  pending: 'cho',
  indexing: 'idx',
  failed: 'loi',
  approved: 'duyet',
  // Bản mẫu không có biến thể cho "đã từ chối" — nó chỉ khai năm. Bậc thứ sáu
  // này dùng `.nhap` (xám, viền nhạt) cộng gạch ngang: một kết luận ĐÓNG LẠI
  // trông phải khác một mục chưa vào quy trình, mà nó cũng không được nóng hơn
  // `.loi`, vì từ chối là một quyết định bình thường chứ không phải sự cố.
  rejected: 'nhap chip-dong',
}

export function StatusBadge({ status }: { status: EditorItemStatus }) {
  return <Chip variant={STATUS_CHIP[status]}>{STATUS_LABEL[status]}</Chip>
}

/** Thẻ chủ đề. Trung tính, chỉ có viền — nó là phân loại, không phải trạng thái. */
export function TopicTags({ topics }: { topics: readonly string[] }) {
  if (topics.length === 0) return null

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {topics.map((topic) => (
        /* `.the-chu` của bản mẫu: viền 1.5px `--ke-dam`, chữ `--xam`. Trung
           tính — nó là phân loại, không phải trạng thái. */
        <li key={topic} className="the-chu">
          {topic}
        </li>
      ))}
    </ul>
  )
}
