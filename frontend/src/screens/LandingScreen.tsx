/**
 * Trang giới thiệu, đường dẫn `/` cho người CHƯA đăng nhập.
 *
 * BẢN MẪU CÓ SECTION `id="gt"`. Tìm bằng:
 *
 *     grep -n 'section class="screen on" id="gt"' docs/design/eduhealth-ai.html
 *
 * Màn này chép chữ và thứ tự khối của section đó, còn lại bốn khối:
 *
 *   1. Thanh đầu trang — dấu hiệu, tên ứng dụng, nút sang màn đăng nhập.
 *   2. Phần dẫn — một cột chữ căn trái.
 *   3. Dải nền mực — ba bước kiểm tra 01 / 02 / 03.
 *   4. Chân trang một dòng.
 *
 * BỎ SO VỚI BẢN MẪU: bảng ba văn bản nguồn kèm chip "Đã duyệt", ba con số
 * 03 / 100% / 0 ở phần dẫn, và phiếu trả lời mẫu bên phải phần dẫn. Cả ba đều
 * khẳng định điều mà trang này không kiểm chứng được: trang giới thiệu không
 * gọi API nên không biết văn bản nào đang có trong hệ thống hay đã duyệt chưa,
 * không có nguồn nào cho ba con số, và phiếu trả lời là câu trả lời bịa chứ
 * không phải dữ liệu thật. Chỗ trống để nguyên, không lấp bằng khối mới.
 *
 * KHÔNG PHÁT MINH LỚP MỚI. Chỉ dùng đúng bộ lớp bản mẫu đã có trong
 * `index.css`: `.wrap` `.nhom-dau` `.eb` `.btn` `.mono` `.lab`.
 *
 * KHÁC BẢN MẪU MỘT CHỖ NỮA: dải chọn chế độ sáng/tối nằm trong `.nhom-dau`
 * ngay trước liên kết sang màn đăng nhập — đúng chỗ mà script bản mẫu chèn nó
 * vào (`document.querySelector('#gt header a[data-go="dn"]')`). Nó không thêm
 * chữ nào và không đổi thứ tự khối nào.
 *
 * Người đã đăng nhập không bao giờ thấy màn này: `App.tsx` rẽ họ thẳng theo vai
 * trò. Đây thuần là mặt tiền cho người mở đường dẫn gốc.
 */
import { Link } from 'react-router-dom'

import { APP_NAME } from '../lib/appName'
import { AppMark } from '../ui/icons'
import { ThemeToggle } from '../ui/ThemeToggle'

/** Ba bước kiểm tra của khối 3, nguyên chữ bản mẫu. */
const BA_BUOC = [
  {
    n: '01',
    title: 'Dấu hiệu nguy cấp',
    body: 'Đau ngực, khó thở, nói khó. Trợ lý dừng mọi bước còn lại và nhắc bạn gọi 115.',
  },
  {
    n: '02',
    title: 'Ngoài phạm vi',
    body: 'Hỏi chẩn đoán, hỏi liều thuốc, hoặc hỏi bệnh khác. Câu hỏi được ghi lại để biên tập viên bổ sung văn bản.',
  },
  {
    n: '03',
    title: 'Đủ căn cứ để trả lời',
    body: 'Không tìm được đoạn văn bản nào làm căn cứ thì trợ lý nói thẳng là chưa có, và khuyên bạn đi khám.',
  },
] as const

export function LandingScreen() {
  return (
    <>
      {/* ---- 1. Thanh đầu trang ---- */}
      <header style={{ borderBottom: '1px solid var(--ke)' }}>
        <div
          className="wrap"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 0',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <AppMark className="dn-mark" />
            <span
              style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(19px,1.4vw,23px)' }}
            >
              {APP_NAME}
            </span>
          </div>

          <div className="nhom-dau">
            <ThemeToggle />
            <Link to="/login" className="btn sm">
              Vào hệ thống
            </Link>
          </div>
        </div>
      </header>

      {/* ---- 2. Phần dẫn ---- */}
      <div
        className="wrap"
        style={{
          position: 'relative',
          padding: 'clamp(38px,6vw,64px) var(--pad-wrap) clamp(48px,7vw,76px)',
        }}
      >
        {/* Dấu chìm: hai vòng tròn và một cánh sen, `opacity:.05`, cố ý tràn ra
            ngoài khung bên phải. Đẩy ra xa hơn bản mẫu (`right:-14%` → `-26%`)
            để nó bám mép phải, không lấn vào khoảng trống giữa trang mà cột
            phiếu trả lời cũ để lại. */}
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          focusable="false"
          style={{
            position: 'absolute',
            right: '-26%',
            top: '-6%',
            opacity: 0.05,
            pointerEvents: 'none',
            width: 'min(620px,58vw)',
            height: 'auto',
          }}
        >
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--ink)" strokeWidth="1.4" />
          <circle cx="50" cy="50" r="39" fill="none" stroke="var(--ink)" strokeWidth=".6" />
          <path
            d="M50 26c10 8 15.5 18 15.5 27.5C65.5 65.5 59 73 50 73s-15.5-7.5-15.5-19.5C34.5 44 40 34 50 26Z"
            fill="var(--ink)"
          />
        </svg>

        {/* Một cột, chữ căn trái, trải hết bề ngang vùng nội dung. Bề rộng dòng
            chữ do từng khối con tự chặn, không chặn ở đây. */}
        <div style={{ position: 'relative', textAlign: 'left' }}>
          <div className="eb">Đái tháo đường típ 2 · Tăng huyết áp</div>

          {/* 16ch vừa đủ cho dòng dài hơn ("Mỗi câu trả lời"), nên tiêu đề ngắt
              đúng hai dòng kể cả khi `<br />` bị bỏ qua. */}
          <h1
            style={{
              fontSize: 'var(--t-hero)',
              lineHeight: 1.04,
              marginTop: 22,
              maxWidth: '16ch',
            }}
          >
            Mỗi câu trả lời
            <br />
            <span style={{ color: 'var(--tim)' }}>đều có số hiệu.</span>
          </h1>

          {/* Vệt bút dạ vàng dưới dòng hai: một nét `--vang` dày 7, hai đầu bo
              tròn, hơi gợn — vệt tay chứ không phải gạch chân. Bề ngang giữ
              nguyên `min(340px,74%)`: khối bao đã bỏ chặn 34ch nhưng cận 340px
              vẫn thắng ở mọi bề ngang thường gặp, nên vệt không dài ra. */}
          <svg
            viewBox="0 0 340 16"
            aria-hidden="true"
            focusable="false"
            style={{ width: 'min(340px,74%)', height: 16, marginTop: 4 }}
          >
            <path
              d="M3 11C58 4 120 13 176 7 226 2 280 12 337 5"
              fill="none"
              stroke="var(--vang)"
              strokeWidth="7"
              strokeLinecap="round"
            />
          </svg>

          <p
            style={{
              fontSize: 'var(--t-lead)',
              lineHeight: 1.66,
              marginTop: 24,
              maxWidth: '46ch',
            }}
          >
            Trợ lý hỏi đáp cho người sống chung với bệnh mãn tính. Không đoán, không
            chẩn đoán. Mỗi câu trả lời đều dẫn về một văn bản của Bộ Y tế, bấm vào là
            mở được nguyên văn ngay cạnh.
          </p>

          <div style={{ display: 'flex', gap: 11, flexWrap: 'wrap', marginTop: 30 }}>
            <Link to="/login" className="btn pri">
              Hỏi thử một câu
            </Link>
            <Link to="/login" className="btn">
              Dành cho biên tập viên
            </Link>
          </div>
        </div>
      </div>

      {/* ---- 3. Ba bước kiểm tra, trên nền mực ---- */}
      <div
        style={{
          background: 'var(--ink)',
          color: 'var(--paper)',
          padding: 'clamp(46px,6vw,68px) 0',
        }}
      >
        <div className="wrap">
          <div className="eb solo" style={{ color: 'var(--vang)' }}>
            Mỗi câu hỏi đi qua ba bước kiểm tra
          </div>

          <h2
            style={{
              fontSize: 'var(--t-h2)',
              marginTop: 16,
              maxWidth: '22ch',
              lineHeight: 1.24,
            }}
          >
            Bước nào không qua thì trợ lý dừng lại, không đoán tiếp.
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(240px,100%),1fr))',
              gap: 1,
              background: '#2A2E34',
              marginTop: 38,
              border: '1px solid #2A2E34',
            }}
          >
            {BA_BUOC.map((buoc) => (
              <div key={buoc.n} style={{ background: 'var(--ink)', padding: '26px 24px' }}>
                <div
                  className="mono"
                  style={{ fontSize: 36, color: 'var(--vang)', lineHeight: 1 }}
                >
                  {buoc.n}
                </div>
                <h3 style={{ fontSize: 'var(--t-h3)', marginTop: 10 }}>{buoc.title}</h3>
                <p
                  style={{
                    fontSize: 'var(--t-note)',
                    color: '#B9BEC4',
                    marginTop: 9,
                    lineHeight: 1.66,
                  }}
                >
                  {buoc.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- 4. Chân trang ---- */}
      <footer style={{ borderTop: '1px solid var(--ke-dam)', padding: '30px 0' }}>
        <div
          className="wrap"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <span className="lab">
            Thông tin giáo dục · Không thay thế khám bệnh · Cấp cứu gọi 115
          </span>
          <span className="lab">Đội P-128</span>
        </div>
      </footer>
    </>
  )
}
