/**
 * Ba điều phải hiểu trước khi khai hồ sơ, cộng lời trấn an về giấy tờ.
 *
 * VỊ TRÍ MỚI: cột phụ `.phu` của màn hồ sơ, dựng theo đúng thẻ `.phieu` ở cột
 * phải của `id="hs"` trong bản mẫu — mũ `.phieu-top` mono chữ hoa, thân đệm
 * 16/18, các mảng ngăn nhau bằng chỉ kẻ một pixel, chân `.rangcua` răng cưa.
 *
 * Trước đây khối này nằm chắn ngang đầu cột chính và đẩy ô nhập đầu tiên xuống
 * dưới màn hình đầu. Sang cột phụ thì trên màn rộng nó đứng SONG SONG với form:
 * người dùng đọc lời dặn và nhìn thấy câu hỏi đầu tiên cùng lúc, không phải
 * cuộn qua lời dặn mới tới việc cần làm. Dưới 1162px `.co` tự về một cột và
 * khối này rơi xuống DƯỚI form — vẫn đọc được, và bước 1 vẫn ở ngay đầu trang.
 *
 * MỘT BẢN DUY NHẤT, không có bản ngắn kèm bản đầy đủ. Bản trước hiện ba dòng
 * ngắn rồi thêm một khối "Xem chi tiết" chứa lại đúng ba điều đó ở dạng dài:
 * cùng một nội dung nằm hai chỗ, cộng lại còn dài hơn cả bản gốc, và người dùng
 * đọc xong ba dòng ngắn vẫn phải đoán xem bên trong có gì khác không. Nay mỗi
 * điều là một tới hai câu, đủ ý và hết.
 *
 * Cố ý viết bằng CÂU THẬT, không phải thẻ tính năng: không tiêu đề `.lab` in
 * hoa cộng một dòng quảng cáo bên dưới, dù cột phụ của bản mẫu có sẵn lối đó.
 * Ba điều này không phải điểm mạnh của sản phẩm, chúng là ba giới hạn mà người
 * dùng cần biết trước khi tin vào bất cứ thứ gì ứng dụng nói ra. Vì lẽ đó cũng
 * bỏ luôn ba ô biểu tượng: cột phụ rộng 300–390px, một khối 44px cạnh mỗi đoạn
 * ăn mất một phần tư bề ngang của chính lời dặn nó đứng cạnh.
 *
 * Điểm thứ ba nói thẳng chuyện trợ lý sẽ TỪ CHỐI câu hỏi về liều thuốc. Biết
 * trước thì lúc bị từ chối người dùng hiểu đó là thiết kế, không phải hỏng —
 * còn không biết trước thì họ đi hỏi chỗ khác, mà chỗ khác không có ai kiểm
 * duyệt nội dung y khoa. Vì vậy rút gọn đến đâu thì câu này vẫn phải giữ được
 * chữ "không kê đơn, không chỉnh liều", chứ không thành "trợ lý có giới hạn".
 *
 * CỠ CHỮ `--t-note` (14–15px) cho cả ba đoạn lẫn dòng về giấy tờ, tức đúng cỡ
 * chữ mà bản mẫu đặt cho MỌI thẻ trong cột phụ. Đây là lời dặn đọc một lượt
 * trước khi khai, không phải nội dung y khoa để đọc kỹ rồi quay lại tra, và nó
 * không mang khẳng định y khoa nào để ai phải dò lại từng câu. Cái phải giữ cỡ
 * lớn là thứ người bệnh thực sự đọc để hành động — câu trả lời và các khối
 * trạng thái ở cột chính — chứ không phải phần này.
 *
 * Đừng nống riêng thẻ này lên `--t-body` cho "dễ đọc hơn": cột phụ ở mọi màn
 * khác đều là `--t-note`, một thẻ to hơn hàng xóm sẽ trông như lỗi dựng trang
 * chứ không như một sự ưu tiên.
 *
 * AI THẤY GÌ: tất cả, kể cả người quay lại sửa hồ sơ. Ba điều này là giới hạn
 * của công cụ chứ không phải màn chào lần đầu, nên không có prop nào để bật tắt
 * hay thu gọn chúng.
 */
type IntroPoint = {
  id: string
  /** Một tới hai câu. Đọc hết trong một nhịp, và không có bản dài nào khác. */
  body: string
}

const POINTS: readonly IntroPoint[] = [
  {
    id: 'diagnosed',
    body:
      'Nơi này dành cho người đã đi khám và có kết luận của bác sĩ. Nếu bạn đang ' +
      'thấy khó chịu trong người và muốn biết mình bị bệnh gì, bạn cần đi khám.',
  },
  {
    id: 'sources',
    body:
      'Mỗi câu trả lời đều kèm tên tài liệu của Bộ Y tế, để bạn tự kiểm tra được ' +
      'hoặc đưa cho bác sĩ xem.',
  },
  {
    id: 'no-prescription',
    body:
      'Trợ lý không kê đơn và không chỉnh liều thuốc. Bạn hỏi nên uống mấy viên ' +
      'hay có nên tăng giảm liều thì trợ lý sẽ mời bạn hỏi bác sĩ điều trị — đó ' +
      'là điều đã định sẵn, không phải máy hỏng.',
  },
]

export function ProfileIntro() {
  return (
    <div className="phieu">
      {/* Mũ thẻ nói thẳng đây là gì và đọc lúc nào. Bản mẫu để mũ một vế khi
          thẻ không có con số nào đáng đặt ở vế phải, và ở đây thì không có. */}
      <div className="phieu-top">
        <span>Đọc trước khi khai</span>
      </div>

      <div style={{ padding: '16px 18px' }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {POINTS.map(({ id, body }, index) => (
            <li
              key={id}
              style={{
                fontSize: 'var(--t-note)',
                lineHeight: 1.66,
                // Chỉ kẻ NGĂN GIỮA, không viền quanh: ba đoạn là ba ý rời của
                // cùng một lời dặn, không phải ba thẻ độc lập.
                borderTop: index === 0 ? undefined : '1px solid var(--ke)',
                marginTop: index === 0 ? 0 : 14,
                paddingTop: index === 0 ? 0 : 14,
              }}
            >
              {body}
            </li>
          ))}
        </ul>

        <div style={{ height: 1, background: 'var(--ke)', margin: '14px 0' }} />

        {/* Ràng buộc PII của brief, gói trong một câu. Người sắp phải điền thông
            tin sức khỏe cần được trấn an TRƯỚC khi điền, và một câu là đủ. Để
            màu `--xam` vì nó là lời hứa của hệ thống chứ không phải một điều
            người dùng phải cân nhắc như ba đoạn trên. */}
        <p style={{ fontSize: 'var(--t-note)', lineHeight: 1.66, color: 'var(--xam)' }}>
          Ứng dụng không hỏi và không lưu tên, số điện thoại hay giấy tờ của bạn.
        </p>
      </div>

      <div className="rangcua" />
    </div>
  )
}
