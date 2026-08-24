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
import { AppMark, LibraryIcon, NoteIcon, PillIcon, PlusIcon } from '../ui/icons'
import { DocumentStack, PhoneInHand } from '../ui/illustrations'
import { Mascot } from '../ui/Mascot'
import { ThemeToggle } from '../ui/ThemeToggle'

/**
 * Ba mục trên thanh điều hướng.
 *
 * Là liên kết NEO TRONG TRANG chứ không phải đường dẫn của router: trang này
 * chỉ có một màn, và một mục điều hướng dẫn tới màn đăng nhập thì đã có nút
 * mint ngay bên cạnh rồi.
 */
const NAV_ITEMS: readonly { href: string; label: string }[] = [
  { href: '#cach-hoat-dong', label: 'Cách hoạt động' },
  { href: '#nguon-tai-lieu', label: 'Nguồn tài liệu' },
  { href: '#cau-hoi', label: 'Câu hỏi thường gặp' },
]

type ValueCard = {
  id: string
  Icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}

const VALUE_CARDS: readonly ValueCard[] = [
  {
    id: 'gia-tri-hoc-tap',
    Icon: NoteIcon,
    title: 'Lộ trình học cá nhân hóa',
    body:
      'Bài học Micro-learning ngắn gọn 3–5 phút mỗi ngày được tinh chỉnh theo ' +
      'đúng độ tuổi và bệnh mãn tính của bạn, giúp bạn tiếp thu kiến thức mà ' +
      'không bị quá tải.',
  },
  {
    id: 'gia-tri-nguon',
    Icon: LibraryIcon,
    title: 'Kiến thức chuẩn Bộ Y tế',
    body:
      'Mọi bài học và câu trả lời đều có số hiệu văn bản và đoạn trích từ ' +
      'Hướng dẫn điều trị của Bộ Y tế nằm ngay cạnh để bạn hoàn toàn an tâm ' +
      'khi học tập.',
  },
  {
    id: 'gia-tri-quiz',
    Icon: PillIcon,
    title: 'Mini-Quiz & Sổ tay lỗi sai',
    body:
      'AI tự động sinh câu hỏi trắc nghiệm tình huống từ chính bài học và cuộc ' +
      'trò chuyện, giúp bạn củng cố ghi nhớ chủ động và sửa chữa quan niệm ' +
      'sai lầm.',
  },
]

/**
 * Ba bước, đúng thứ tự người dùng thật sự đi qua.
 */
const STEPS: readonly { title: string; body: string }[] = [
  {
    title: 'Khai hồ sơ sức khỏe',
    body:
      'Bạn cho biết tuổi và bệnh bác sĩ đã chẩn đoán để hệ thống xây dựng lộ ' +
      'trình học tập cá nhân hóa.',
  },
  {
    title: 'Học bài ngắn & Hỏi đáp 24/7',
    body:
      'Đọc các bài học ngắn mỗi ngày và đặt câu hỏi bằng lời thường khi có ' +
      'thắc mắc về dinh dưỡng, chỉ số xét nghiệm.',
  },
  {
    title: 'Làm Mini-Quiz & Tích lũy HP',
    body:
      'Tham gia trắc nghiệm ôn tập, tích lũy điểm sức khỏe (HP), duy trì ' +
      'chuỗi streak và xem lại câu sai trong Sổ tay lỗi sai.',
  },
]

/**
 * Bốn câu hỏi thường gặp.
 *
 * BÁM ĐÚNG RÀNG BUỘC SẢN PHẨM, không phải bốn câu quảng cáo. Ba trong bốn câu
 * dưới đây nói ra một GIỚI HẠN — không kê đơn, chỉ hai bệnh, không thay bác sĩ.
 * Người đọc biết trước ba điều đó thì lúc gặp chúng trong ứng dụng sẽ hiểu là
 * thiết kế, không phải máy hỏng, và họ không đi hỏi chỗ khác — mà chỗ khác thì
 * không có ai kiểm duyệt nội dung y khoa.
 */
const FAQS: readonly { question: string; answer: string }[] = [
  {
    question: 'Vì sao trợ lý không trả lời câu hỏi về liều thuốc?',
    answer:
      'Liều thuốc phụ thuộc kết quả xét nghiệm, chức năng gan thận và những ' +
      'thuốc bạn đang uống — những thứ chỉ bác sĩ đang điều trị cho bạn mới ' +
      'nắm. Trợ lý được đặt ra để KHÔNG trả lời loại câu hỏi đó, và khi bạn ' +
      'hỏi, nó sẽ nói thẳng như vậy chứ không đoán.',
  },
  {
    question: 'Ứng dụng có lưu thông tin cá nhân của tôi không?',
    answer:
      'Không hỏi và không lưu tên, số điện thoại, địa chỉ hay số giấy tờ. Hồ ' +
      'sơ chỉ gồm tuổi, bệnh đã được chẩn đoán, và tuỳ chọn chiều cao cân ' +
      'nặng. Khu vực kiểm duyệt nội dung cũng không thấy được ai đã hỏi câu ' +
      'nào — người biên tập chỉ đọc nội dung câu hỏi để biết thư viện đang ' +
      'thiếu chủ đề gì.',
  },
  {
    question: 'Ứng dụng dùng cho bệnh nào?',
    answer:
      'Hai bệnh: tăng huyết áp và đái tháo đường típ 2. Thư viện tài liệu chỉ ' +
      'phủ hai bệnh này, nên câu hỏi ngoài phạm vi đó sẽ được trả lời rằng ' +
      'chưa có tài liệu để trích dẫn, thay vì được trả lời qua loa.',
  },
  {
    question: 'Trợ lý có thay thế bác sĩ không?',
    answer:
      'Không, và không được dùng thay. Đây là công cụ giáo dục sức khỏe cho ' +
      'người ĐÃ đi khám và đã có kết luận. Nếu bạn đang thấy khó chịu trong ' +
      'người và muốn biết mình bị bệnh gì, việc cần làm là đi khám. Gặp dấu ' +
      'hiệu cấp cứu thì gọi 115.',
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

      <div className="ml-auto flex shrink-0 items-center gap-tight md:ml-0">
        <ThemeToggle tone="shell" />

        <Link
          to="/login"
          className="motion-press font-display flex min-h-touch shrink-0 items-center rounded-pill bg-mint px-cozy text-input font-bold text-ink no-underline hover:bg-mint-press"
        >
          Đăng nhập
        </Link>
      </div>
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
                Giáo dục sức khỏe cá nhân hóa · Tăng huyết áp & Đái tháo đường
              </p>

              {/* Ngắt dòng bằng hai `span` chứ không để trình duyệt tự xuống
                  dòng: chỗ ngắt là chỗ ngắt Ý, và ở cỡ 36px thì một chỗ ngắt
                  sai làm cả tiêu đề đọc vấp. */}
              <h1 className="mt-snug text-hero font-semibold text-white">
                <span className="block">Học cách làm chủ sức khỏe,</span>
                <span className="block text-mint">chuẩn y khoa & cá nhân hóa.</span>
              </h1>

              <p className="mt-cozy max-w-answer text-answer text-mist">
                Nền tảng AI giáo dục sức khỏe thông minh với lộ trình học Micro-learning
                hàng ngày, giải thích thuật ngữ chuẩn Bộ Y tế và trắc nghiệm
                Mini-Quiz tương tác thích ứng.
              </p>

              <div className="mt-block flex flex-wrap gap-snug">
                <Link
                  to="/login"
                  className="motion-press font-display flex min-h-call items-center justify-center rounded-pill bg-mint px-block text-input font-bold text-ink no-underline hover:bg-mint-press"
                >
                  Bắt đầu học ngay
                </Link>

                <a
                  href="#gia-tri-heading"
                  className="motion-press font-display flex min-h-call items-center justify-center rounded-pill border-2 border-mist px-block text-input font-semibold text-white no-underline hover:bg-white/10"
                >
                  Xem lộ trình giáo dục
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
        className="relative isolate scroll-mt-block overflow-hidden bg-canvas px-cozy py-block"
      >
        <Backdrop tone="canvas" />

        <div className="relative z-10 mx-auto w-full max-w-page">
          <h2
            id="gia-tri-heading"
            className="max-w-answer text-heading font-semibold text-body"
          >
            Ba điều nên biết trước khi bắt đầu
          </h2>

          <ul className="mt-block grid gap-cozy md:grid-cols-3">
            {VALUE_CARDS.map(({ id, Icon, title, body }) => (
              <li
                key={id}
                id={id}
                className="scroll-mt-block rounded-card-lg bg-surface p-cozy"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-chip bg-mint text-mint-deep">
                  <Icon className="h-7 w-7" />
                </span>

                <h3 className="mt-cozy text-empty font-semibold text-body">{title}</h3>
                <p className="font-display mt-tight text-question text-slate">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Cách hoạt động: ba bước có đánh số, nền navy ---- */}
      <section
        aria-labelledby="cach-hoat-dong-heading"
        id="cach-hoat-dong"
        className="relative isolate scroll-mt-block overflow-hidden px-cozy py-block"
      >
        <Backdrop />

        <div className="relative z-10 mx-auto w-full max-w-page">
          <div className="flex flex-col items-start gap-block lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <h2
                id="cach-hoat-dong-heading"
                className="text-heading font-semibold text-white"
              >
                Dùng thế nào
              </h2>

              {/* `ol` chứ không phải `ul`: ba bước này CÓ thứ tự, và trình đọc
                  màn hình phải nghe được điều đó. Con số hiện ra bằng khối mint
                  bên trái là bản nhìn của chính thứ tự ấy, nên `list-none` bỏ
                  đánh số mặc định đi cho khỏi đọc hai lần. */}
              <ol className="mt-block list-none space-y-cozy">
                {STEPS.map((step, index) => (
                  <li key={step.title} className="flex items-start gap-snug">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-chip bg-mint text-heading font-semibold text-mint-deep">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-empty font-semibold text-white">
                        {step.title}
                      </h3>
                      <p className="font-display mt-hair text-question text-mist">
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mx-auto shrink-0 lg:mx-0">
              <PhoneInHand size={260} />
            </div>
          </div>
        </div>
      </section>

      {/* ---- Nguồn tài liệu: giải thích, kèm một thẻ trích dẫn mẫu ---- */}
      <section
        aria-labelledby="nguon-tai-lieu-heading"
        id="nguon-tai-lieu"
        className="relative isolate scroll-mt-block overflow-hidden bg-canvas px-cozy py-block"
      >
        <Backdrop tone="canvas" />

        <div className="relative z-10 mx-auto grid w-full max-w-page gap-block lg:grid-cols-2 lg:items-center">
          <div className="min-w-0">
            <h2
              id="nguon-tai-lieu-heading"
              className="text-heading font-semibold text-body"
            >
              Thư viện đến từ đâu
            </h2>
            <p className="mt-cozy text-answer text-body">
              Trợ lý chỉ được trích dẫn những văn bản đã nằm trong thư viện, và
              một văn bản chỉ vào được thư viện sau khi có người trong đội ngũ
              biên tập y khoa đọc, sửa và bấm duyệt. Không có đường nào khác.
            </p>
            <p className="font-display mt-cozy text-question text-slate">
              Nguồn hiện tại là hướng dẫn chẩn đoán và điều trị của Bộ Y tế cho
              hai bệnh trong phạm vi sản phẩm. Câu hỏi nào thư viện chưa phủ,
              trợ lý nói thẳng là chưa có tài liệu — và câu hỏi đó được ghi lại
              để đội ngũ biên tập bổ sung.
            </p>

            <div className="mt-block flex items-center gap-snug">
              <DocumentStack size={96} />
              <p className="font-display min-w-0 text-question text-slate">
                Mỗi câu trả lời đi kèm một thẻ như bên cạnh: tên tài liệu, đúng
                câu được trích, cơ quan ban hành và số hiệu văn bản.
              </p>
            </div>
          </div>

          {/* Thẻ trích dẫn MẪU, dựng đúng bằng ngôn ngữ hình của thẻ nguồn thật
              ở màn hỏi đáp (xem `RAIL_SKIN.lead` trong `AnswerDocument.tsx`).
              Cố ý giống hệt: người xem trang này phải nhận ra ngay chính cái
              thẻ đó khi họ gặp nó lần đầu trong ứng dụng.

              `aria-hidden` vì đây là hình minh hoạ cho đoạn văn bên trái, không
              phải một nguồn thật để ai đi tra. */}
          <div
            aria-hidden="true"
            className="w-full max-w-answer justify-self-center rounded-card bg-ink p-cozy lg:justify-self-end"
          >
            <p className="font-mono text-question font-semibold text-mint">01</p>
            <p className="font-display mt-hair text-source font-semibold text-white">
              Hướng dẫn chẩn đoán và điều trị tăng huyết áp
            </p>
            <p className="font-body mt-tight text-question text-white">
              “Hạn chế lượng muối ăn vào dưới 5 gam mỗi ngày, tương đương khoảng
              một thìa cà phê gạt ngang.”
            </p>
            <p className="font-display mt-tight text-question text-mist">
              Bộ Y tế Việt Nam
            </p>
            <p className="font-mono text-question text-mist">3192/QĐ-BYT</p>
            <span className="font-display mt-snug inline-flex min-h-touch items-center justify-center rounded-pill bg-mint px-cozy text-question font-semibold text-ink">
              Mở tài liệu
            </span>
          </div>
        </div>
      </section>

      {/* ---- Câu hỏi thường gặp ---- */}
      <section
        aria-labelledby="cau-hoi-heading"
        id="cau-hoi"
        className="relative isolate scroll-mt-block overflow-hidden px-cozy py-block"
      >
        <Backdrop />

        <div className="relative z-10 mx-auto w-full max-w-page">
          <h2
            id="cau-hoi-heading"
            className="text-heading font-semibold text-white"
          >
            Câu hỏi thường gặp
          </h2>

          {/* `details` / `summary` của HTML chứ không phải accordion tự viết.
              Miễn phí toàn bộ hành vi bàn phím, trạng thái mở/đóng mà trình đọc
              màn hình hiểu đúng, và tìm-trong-trang của trình duyệt vẫn mở được
              mục đang đóng. Một accordion tự viết bằng `useState` phải dựng lại
              tất cả những thứ đó, và thường dựng thiếu.

              Bốn mục xếp hai cột từ 768px: mỗi câu trả lời dài 3–5 dòng, một
              cột thì phần này chiếm gần hai màn hình cuộn. */}
          <div className="mt-block grid gap-snug md:grid-cols-2">
            {FAQS.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-card bg-white/10 px-cozy [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-snug py-snug text-input font-semibold text-white">
                  {faq.question}
                  {/* Dấu cộng xoay thành dấu trừ khi mở. Chuyển động bọc trong
                      `motion-safe:` — người tắt hiệu ứng thấy nó đổi ngay, không
                      thấy nó quay. */}
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint text-ink motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-45"
                  >
                    <PlusIcon className="h-5 w-5" />
                  </span>
                </summary>
                <p className="font-display border-t border-white/20 py-snug text-question text-mist">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
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
