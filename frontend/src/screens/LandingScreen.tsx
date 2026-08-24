/**
 * Trang giới thiệu, đường dẫn `/` cho người CHƯA đăng nhập.
 *
 * Người đã đăng nhập không bao giờ thấy màn này: `App.tsx` rẽ họ thẳng theo
 * vai trò, đúng như trước. Đây thuần là mặt tiền cho người mở đường dẫn gốc
 * lần đầu, và nó phải trả lời đúng ba câu trước khi họ bấm Đăng nhập: đây là
 * cái gì, dựa trên nguồn nào, và nó KHÔNG làm gì.
 *
 * Câu thứ ba là câu quan trọng nhất và cũng dễ bị bỏ nhất. Một trang giới
 * thiệu chỉ khoe điểm mạnh sẽ dựng lên kỳ vọng rằng trợ lý thay được bác sĩ —
 * rồi lần đầu bị từ chối một câu hỏi về liều thuốc, người dùng kết luận là
 * máy hỏng và đi hỏi chỗ khác, mà chỗ khác không có ai kiểm duyệt nội dung y
 * khoa. Nên thẻ giá trị thứ ba nói thẳng giới hạn, ngang hàng với hai thẻ kia.
 *
 * BỐ CỤC: nền navy có họa tiết cho phần dẫn và chân trang, một dải canvas ở
 * giữa cho ba thẻ giá trị. Đúng nguyên tắc nền của cả ứng dụng — tối để dẫn
 * dắt, sáng để làm việc.
 */
import { Link } from 'react-router-dom'

import { APP_NAME } from '../lib/appName'
import { Backdrop } from '../ui/Backdrop'
import { AppMark, LibraryIcon, NoteIcon, PillIcon } from '../ui/icons'
import { Mascot } from '../ui/Mascot'

/**
 * Ba mục trên thanh điều hướng.
 *
 * Là liên kết NEO TRONG TRANG chứ không phải đường dẫn của router: trang này
 * chỉ có một màn, và một mục điều hướng dẫn tới màn đăng nhập thì đã có nút
 * mint ngay bên cạnh rồi.
 */
const NAV_ITEMS: readonly { href: string; label: string }[] = [
  { href: '#gia-tri', label: 'Ứng dụng làm gì' },
  { href: '#nguon', label: 'Nguồn tài liệu' },
  { href: '#gioi-han', label: 'Giới hạn' },
]

type ValueCard = {
  id: string
  Icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}

const VALUE_CARDS: readonly ValueCard[] = [
  {
    id: 'gia-tri',
    Icon: NoteIcon,
    title: 'Trả lời theo bệnh của bạn',
    body:
      'Bạn khai tuổi và bệnh đã được bác sĩ chẩn đoán một lần. Từ đó mỗi câu ' +
      'trả lời được đặt vào đúng bệnh và lứa tuổi của bạn, thay vì lời khuyên ' +
      'chung cho tất cả mọi người.',
  },
  {
    id: 'nguon',
    Icon: LibraryIcon,
    title: 'Luôn kèm tài liệu gốc',
    body:
      'Mỗi khẳng định đều có số hiệu văn bản và đoạn trích của Bộ Y tế nằm ngay ' +
      'cạnh. Bạn tự kiểm tra được, hoặc in ra đưa bác sĩ xem trong lần tái khám.',
  },
  {
    id: 'gioi-han',
    Icon: PillIcon,
    title: 'Không kê đơn, không chỉnh liều',
    body:
      'Bạn hỏi nên uống mấy viên hay có nên tăng giảm liều thì trợ lý sẽ mời bạn ' +
      'hỏi bác sĩ điều trị. Đó là điều đã định sẵn, không phải máy hỏng.',
  },
]

/** Bốn mục sản phẩm ở chân trang. Mô tả cái đã có, không hứa cái chưa có. */
const FOOTER_ITEMS: readonly string[] = [
  'Hỏi đáp có trích dẫn tài liệu',
  'Hồ sơ sức khỏe rút gọn',
  'Thư viện bài học theo lộ trình',
  'Khu vực kiểm duyệt nội dung y khoa',
]

/**
 * Thanh điều hướng dạng viên thuốc, nổi trên nền navy.
 *
 * Nền trắng mờ 10% trên `ink` cho ra #233B58, và chữ trắng trên đó đạt
 * 11.43:1 — thanh vẫn nổi lên khỏi nền mà không cần một khối trắng đặc chen
 * ngang phần dẫn.
 */
function TopNav() {
  return (
    <nav
      aria-label="Điều hướng trang giới thiệu"
      className="mx-auto flex w-full max-w-page items-center gap-snug rounded-pill bg-white/10 px-cozy py-tight"
    >
      <span className="flex min-w-0 items-center gap-tight">
        <AppMark className="h-8 w-8 shrink-0 text-mint" />
        <span className="font-display truncate text-app font-bold text-white">
          {APP_NAME}
        </span>
      </span>

      {/* Ẩn ba mục chữ dưới 768px: thanh hẹp không đủ chỗ cho cả tên ứng dụng
          lẫn nút đăng nhập, mà cả ba mục đều chỉ cuộn xuống phần nằm ngay bên
          dưới — người dùng cuộn tay vẫn tới được. */}
      <ul className="ml-auto hidden items-center gap-cozy md:flex">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="font-display flex min-h-touch items-center text-question font-semibold text-mist no-underline hover:text-white"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>

      <Link
        to="/login"
        className="motion-press font-display ml-auto flex min-h-touch shrink-0 items-center rounded-pill bg-mint px-cozy text-input font-bold text-ink no-underline hover:bg-mint-press md:ml-0"
      >
        Đăng nhập
      </Link>
    </nav>
  )
}

export function LandingScreen() {
  return (
    <div className="min-h-dvh bg-ink">
      {/* ---- Phần dẫn, nền navy có họa tiết ---- */}
      <header className="relative isolate overflow-hidden px-cozy pt-cozy pb-block">
        <Backdrop />

        <div className="relative z-10">
          <TopNav />

          <div className="mx-auto mt-block flex w-full max-w-page flex-col items-start gap-block lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <p className="font-display text-note font-semibold tracking-wide text-mint uppercase">
                Tăng huyết áp · Đái tháo đường típ 2
              </p>

              {/* Ngắt dòng bằng hai `span` chứ không để trình duyệt tự xuống
                  dòng: chỗ ngắt là chỗ ngắt Ý, và ở cỡ 36px thì một chỗ ngắt
                  sai làm cả tiêu đề đọc vấp. */}
              <h1 className="mt-snug text-hero font-semibold text-white">
                <span className="block">Câu trả lời cho bệnh của bạn,</span>
                <span className="block text-mint">kèm tài liệu để đối chiếu.</span>
              </h1>

              <p className="mt-cozy max-w-answer text-answer text-mist">
                Trợ lý dành cho người đã có kết luận của bác sĩ. Bạn hỏi bằng lời
                thường, câu trả lời đi kèm tên và số hiệu văn bản của Bộ Y tế để
                bạn tự kiểm tra hoặc đưa bác sĩ xem.
              </p>

              <div className="mt-block flex flex-wrap gap-snug">
                <Link
                  to="/login"
                  className="motion-press font-display flex min-h-call items-center justify-center rounded-pill bg-mint px-block text-input font-bold text-ink no-underline hover:bg-mint-press"
                >
                  Bắt đầu hỏi
                </Link>

                <a
                  href="#gia-tri"
                  className="motion-press font-display flex min-h-call items-center justify-center rounded-pill border-2 border-mist px-block text-input font-semibold text-white no-underline hover:bg-white/10"
                >
                  Xem ứng dụng làm gì
                </a>
              </div>
            </div>

            {/* Linh vật bên phải. Ở bản hẹp nó rơi xuống dưới hai nút và thu
                nhỏ lại — nó là hình minh hoạ, không được đẩy nội dung thật ra
                khỏi màn hình đầu. */}
            <div className="mx-auto shrink-0 lg:mx-0">
              <Mascot variant="solid" size={240} />
            </div>
          </div>
        </div>
      </header>

      {/* ---- Ba thẻ giá trị, nền canvas ---- */}
      <section
        aria-labelledby="gia-tri-heading"
        className="relative isolate overflow-hidden bg-canvas px-cozy py-block"
      >
        <Backdrop tone="canvas" />

        <div className="relative z-10 mx-auto w-full max-w-page">
          <h2
            id="gia-tri-heading"
            className="max-w-answer text-heading font-semibold text-ink"
          >
            Ba điều nên biết trước khi bắt đầu
          </h2>

          <ul className="mt-block grid gap-cozy md:grid-cols-3">
            {VALUE_CARDS.map(({ id, Icon, title, body }) => (
              <li
                key={id}
                id={id}
                className="scroll-mt-block rounded-card-lg bg-white p-cozy"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-chip bg-mint text-mint-deep">
                  <Icon className="h-7 w-7" />
                </span>

                <h3 className="mt-cozy text-empty font-semibold text-ink">{title}</h3>
                <p className="font-display mt-tight text-question text-slate">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Chân trang, nền navy, ba cột ---- */}
      <footer className="relative isolate overflow-hidden px-cozy py-block">
        <Backdrop />

        <div className="relative z-10 mx-auto grid w-full max-w-page gap-block md:grid-cols-3">
          <div>
            <span className="flex items-center gap-tight">
              <AppMark className="h-8 w-8 shrink-0 text-mint" />
              <span className="font-display text-app font-bold text-white">
                {APP_NAME}
              </span>
            </span>
            <p className="font-display mt-snug max-w-answer text-question text-mist">
              Trợ lý giáo dục sức khỏe cho người sống chung với tăng huyết áp
              hoặc đái tháo đường típ 2. Không thay thế việc khám và điều trị.
            </p>
          </div>

          <div>
            <h2 className="font-display text-question font-semibold text-white">
              Trong ứng dụng có gì
            </h2>
            <ul className="mt-snug space-y-tight">
              {FOOTER_ITEMS.map((item) => (
                <li key={item} className="font-display text-question text-mist">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-display text-question font-semibold text-white">
              Liên hệ
            </h2>
            <p className="font-display mt-snug text-question text-mist">
              hotro@trolysuckhoe.vn
            </p>
            <p className="font-display mt-hair text-question text-mist">
              Hà Nội, Việt Nam
            </p>

            {/* Dòng cấp cứu tách hẳn bằng màu coral và bằng một nét kẻ. Nó là
                thứ duy nhất ở chân trang mà người đọc có thể cần tới ngay lập
                tức, nên nó không được nằm lẫn trong danh sách liên hệ. */}
            <p className="font-display mt-snug border-t border-white/20 pt-snug text-input font-bold text-coral">
              Cấp cứu: gọi 115
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
