const colorTokens = [
  {
    token: '--color-ink',
    hex: '#13322B',
    swatch: 'bg-ink',
    text: 'text-ink',
    role: 'Chữ chính',
    ratio: '12.74:1',
  },
  {
    token: '--color-paper',
    hex: '#F4F6F5',
    swatch: 'bg-paper',
    text: 'text-paper',
    role: 'Nền trang',
    ratio: '—',
  },
  {
    token: '--color-medical',
    hex: '#0B6E4F',
    swatch: 'bg-medical',
    text: 'text-medical',
    role: 'Nhấn mạnh y khoa',
    ratio: '5.76:1',
  },
  {
    token: '--color-moss',
    hex: '#4E5F58',
    swatch: 'bg-moss',
    text: 'text-moss',
    role: 'Chữ phụ',
    ratio: '6.24:1',
  },
  {
    token: '--color-alert',
    hex: '#B3261E',
    swatch: 'bg-alert',
    text: 'text-alert',
    role: 'Cảnh báo',
    ratio: '6.02:1',
  },
  {
    token: '--color-refuse',
    hex: '#7E631C',
    swatch: 'bg-refuse',
    text: 'text-refuse',
    role: 'Từ chối trả lời',
    ratio: '5.25:1',
  },
  {
    token: '--color-border',
    hex: '#788C83',
    swatch: 'bg-border',
    text: 'text-border',
    role: 'Viền ô nhập liệu, nút bấm, mọi thành phần tương tác',
    ratio: '3.29:1',
  },
  {
    token: '--color-rule',
    hex: '#C3CCC8',
    swatch: 'bg-rule',
    text: 'text-rule',
    role: 'Chỉ đường kẻ trang trí và đường phân cách',
    ratio: '1.51:1',
  },
]

// Token nào dùng ở đâu, và phải vượt ngưỡng nào.
const usageRules = [
  {
    purpose: 'Chữ trên nền paper',
    use: '--color-ink, --color-moss, --color-medical, --color-alert, --color-refuse',
    threshold: 'WCAG 1.4.3 — tối thiểu 4.5:1',
  },
  {
    purpose: 'Viền thành phần tương tác (ô nhập liệu, nút, ô chọn)',
    use: '--color-border',
    threshold: 'WCAG 1.4.11 — tối thiểu 3:1',
  },
  {
    purpose: 'Đường kẻ trang trí, đường phân cách',
    use: '--color-rule',
    threshold: 'Không có ngưỡng — thuần thẩm mỹ',
  },
  {
    purpose: 'Nền trang',
    use: '--color-paper',
    threshold: 'Là nền tham chiếu của mọi phép đo trên',
  },
]

const typeScale = [
  { cls: 'text-3xl', label: '3xl · 30px' },
  { cls: 'text-2xl', label: '2xl · 24px' },
  { cls: 'text-xl', label: 'xl · 20px' },
  { cls: 'text-lg', label: 'lg · 18px' },
  { cls: 'text-base', label: 'base · 16px' },
]

const SAMPLE = 'Bác sĩ đã giải thích rõ kết quả xét nghiệm.'

function App() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="border-b border-rule pb-6">
        <h1 className="text-3xl font-bold">Hệ thiết kế</h1>
        <p className="font-display mt-2 text-moss">
          Trang kiểm tra token màu và chữ. Cỡ chữ gốc 18px, nền paper, chữ ink.
        </p>
      </header>

      {/* ---- Màu ---- */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold">Token màu</h2>
        <ul className="mt-5 space-y-3">
          {colorTokens.map((c) => (
            <li
              key={c.token}
              className="flex items-center gap-4 rounded-lg border border-rule bg-white/40 p-3"
            >
              <span
                className={`${c.swatch} h-touch w-touch shrink-0 rounded-md border border-rule`}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="font-mono block text-base font-medium">
                  {c.hex}
                </span>
                <span className="font-mono block text-base text-moss">
                  {c.token}
                </span>
                <span className="font-display block text-base text-moss">
                  {c.role} · tương phản trên paper {c.ratio}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="font-display mt-5 rounded-lg border-2 border-alert p-4">
          <p className="text-alert">
            <span className="font-bold">Đừng dùng nhầm rule và border.</span>{' '}
            <span className="font-mono">--color-rule</span> chỉ đạt 1,51:1 —
            không đạt cả ngưỡng 3:1 dành cho thành phần phi văn bản. Nó chỉ dùng
            cho đường kẻ trang trí. Viền của ô nhập liệu, nút bấm và mọi thành
            phần bấm được phải dùng{' '}
            <span className="font-mono">--color-border</span> (3,29:1).
          </p>
        </div>

        <h3 className="mt-8 text-xl font-bold">Dùng token nào cho việc gì</h3>
        <ul className="mt-4 space-y-3">
          {usageRules.map((u) => (
            <li
              key={u.purpose}
              className="rounded-lg border border-rule p-3"
            >
              <span className="font-display block font-semibold">
                {u.purpose}
              </span>
              <span className="font-mono mt-1 block text-base text-medical">
                {u.use}
              </span>
              <span className="font-display block text-base text-moss">
                {u.threshold}
              </span>
            </li>
          ))}
        </ul>

        <h3 className="mt-8 text-xl font-bold">So sánh trực tiếp</h3>
        <p className="font-display mt-2 text-moss">
          Cùng một ô nhập liệu, vẽ bằng hai màu. Hãy nhìn ở khoảng cách cầm điện
          thoại bình thường.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <p className="font-mono text-base text-alert">
              SAI — viền bằng --color-rule (1,51:1)
            </p>
            <div className="mt-1 rounded-lg border-2 border-rule p-4">
              <span className="font-display text-moss">
                Nhập số thẻ bảo hiểm y tế
              </span>
            </div>
          </div>
          <div>
            <p className="font-mono text-base text-medical">
              ĐÚNG — viền bằng --color-border (3,29:1)
            </p>
            <div className="mt-1 rounded-lg border-2 border-border p-4">
              <span className="font-display text-moss">
                Nhập số thẻ bảo hiểm y tế
              </span>
            </div>
          </div>
          <div>
            <p className="font-mono text-base text-moss">
              ĐÚNG — --color-rule làm đường phân cách trang trí
            </p>
            <hr className="mt-3 border-rule" />
          </div>
        </div>
      </section>

      {/* ---- Chữ ---- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold">Họ chữ</h2>

        <div className="mt-5 rounded-lg border border-rule p-4">
          <p className="font-mono text-base text-moss">
            --font-display · Be Vietnam Pro · giao diện và tiêu đề
          </p>
          <div className="mt-3 space-y-2">
            {typeScale.map((t) => (
              <p key={`d-${t.cls}`} className={`font-display ${t.cls}`}>
                {SAMPLE}{' '}
                <span className="font-mono text-base text-moss">{t.label}</span>
              </p>
            ))}
          </div>
          <p className="font-display mt-3 text-lg">
            <span className="font-normal">Thường 400</span> ·{' '}
            <span className="font-semibold">Đậm vừa 600</span> ·{' '}
            <span className="font-bold">Đậm 700</span>
          </p>
        </div>

        <div className="mt-5 rounded-lg border border-rule p-4">
          <p className="font-mono text-base text-moss">
            --font-body · Lora Variable · nội dung câu trả lời
          </p>
          <div className="mt-3 space-y-2">
            {typeScale.map((t) => (
              <p key={`b-${t.cls}`} className={`font-body ${t.cls}`}>
                {SAMPLE}{' '}
                <span className="font-mono text-base text-moss">{t.label}</span>
              </p>
            ))}
          </div>
          <p className="font-body mt-3 text-lg">
            <span className="font-normal">Thường 400</span> ·{' '}
            <span className="font-semibold">Đậm vừa 600</span> ·{' '}
            <span className="font-bold">Đậm 700</span>
          </p>
        </div>

        <div className="mt-5 rounded-lg border border-rule p-4">
          <p className="font-mono text-base text-moss">
            --font-mono · IBM Plex Mono · số hiệu văn bản và nhãn nguồn
          </p>
          <div className="mt-3 space-y-2">
            {typeScale.map((t) => (
              <p key={`m-${t.cls}`} className={`font-mono ${t.cls}`}>
                QĐ-1234/BYT · 0123456789 · {t.label}
              </p>
            ))}
          </div>
          <p className="font-mono mt-3 text-lg">
            <span className="font-normal">Thường 400</span> ·{' '}
            <span className="font-medium">Đậm vừa 500</span>
          </p>
        </div>
      </section>

      {/* ---- Dấu tiếng Việt ---- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold">Kiểm tra dấu tiếng Việt</h2>

        <p className="font-mono mt-5 text-base text-moss">
          Đủ 12 nguyên âm có dấu phụ và 6 thanh điệu
        </p>
        <p className="font-body mt-2 text-xl">
          ă â đ ê ô ơ ư · à á ả ã ạ · ằ ắ ẳ ẵ ặ · ầ ấ ẩ ẫ ậ · è é ẻ ẽ ẹ · ề ế ể
          ễ ệ · ì í ỉ ĩ ị · ò ó ỏ õ ọ · ồ ố ổ ỗ ộ · ờ ớ ở ỡ ợ · ù ú ủ ũ ụ · ừ ứ
          ử ữ ự · ỳ ý ỷ ỹ ỵ
        </p>
        <p className="font-display mt-2 text-xl">
          Ă Â Đ Ê Ô Ơ Ư · Ằ Ắ Ẳ Ẵ Ặ · Ầ Ấ Ẩ Ẫ Ậ · Ề Ế Ể Ễ Ệ · Ồ Ố Ổ Ỗ Ộ · Ờ Ớ Ở
          Ỡ Ợ · Ừ Ứ Ử Ữ Ự
        </p>

        <p className="font-mono mt-6 text-base text-moss">
          Đoạn văn — font body (Lora Variable)
        </p>
        <p className="font-body mt-2 text-lg">
          Kết quả xét nghiệm của bạn cho thấy đường huyết lúc đói hơi cao hơn
          mức bình thường một chút. Điều này chưa có nghĩa là bạn bị tiểu đường.
          Bác sĩ sẽ hẹn bạn quay lại đo thêm một lần nữa để chắc chắn. Trong lúc
          chờ đợi, bạn nên ăn ít cơm trắng và bánh ngọt, đi bộ khoảng ba mươi
          phút mỗi ngày, và ngủ đủ giấc. Nếu bạn thấy khát nước liên tục, sụt
          cân nhanh, hoặc mệt mỏi bất thường, hãy gọi ngay cho phòng khám. Đừng
          quá lo lắng — rất nhiều người ở tuổi của bạn gặp tình trạng này và vẫn
          khỏe mạnh khi được theo dõi đều đặn.
        </p>

        <p className="font-mono mt-6 text-base text-moss">
          Đoạn văn — font display (Be Vietnam Pro)
        </p>
        <p className="font-display mt-2 text-lg">
          Kết quả xét nghiệm của bạn cho thấy đường huyết lúc đói hơi cao hơn
          mức bình thường một chút. Điều này chưa có nghĩa là bạn bị tiểu đường.
          Bác sĩ sẽ hẹn bạn quay lại đo thêm một lần nữa để chắc chắn. Trong lúc
          chờ đợi, bạn nên ăn ít cơm trắng và bánh ngọt, đi bộ khoảng ba mươi
          phút mỗi ngày, và ngủ đủ giấc.
        </p>

        <p className="font-mono mt-6 text-base text-moss">
          Nhãn nguồn — font mono (IBM Plex Mono)
        </p>
        <p className="font-mono mt-2 text-base">
          Nguồn: Quyết định số 5481/QĐ-BYT ngày 30/12/2020 — trang 12, mục 3.2
        </p>
      </section>

      {/* ---- Vùng chạm ---- */}
      <section className="mt-12 border-t border-rule pt-6">
        <h2 className="text-2xl font-bold">Vùng chạm tối thiểu 44px</h2>
        <p className="font-display mt-2 text-moss">
          Nút dưới đây không có class kích thước — chiều cao và chiều rộng tối
          thiểu đến từ lớp base trong index.css.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="button"
            className="font-display rounded-lg border-2 border-medical bg-medical px-6 text-paper"
          >
            Tôi đã hiểu
          </button>
          <button
            type="button"
            className="font-display rounded-lg border-2 border-border px-6 text-ink"
          >
            Hỏi lại bác sĩ
          </button>
        </div>

        <p className="font-display mt-6 text-refuse">
          <span className="font-mono">--color-refuse</span> ở 5,25:1 — dùng cho
          câu trả lời mà hệ thống từ chối đưa ra, ví dụ: “Câu hỏi này cần bác sĩ
          trực tiếp khám mới trả lời được.”
        </p>
      </section>
    </main>
  )
}

export default App
