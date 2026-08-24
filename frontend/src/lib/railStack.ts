/**
 * Xếp chồng thẻ nguồn ở lề phải sao cho không bao giờ đè lên nhau.
 *
 * VẤN ĐỀ: bản trước neo mỗi thẻ vào đúng đỉnh đoạn văn của nó bằng
 * `position: absolute`. Ngang hàng thì đúng, nhưng thẻ nguồn đầy đủ — tên tài
 * liệu, đoạn trích, số hiệu, đường dẫn — cao khoảng 200px, còn một đoạn văn hai
 * dòng chỉ cao khoảng 65px. Thẻ tràn khỏi ô của mình và đè lên thẻ của đoạn kế
 * tiếp, chữ chồng chữ không đọc được.
 *
 * VÌ SAO KHÔNG SỬA BẰNG CSS THUẦN: cách hiển nhiên là cho đoạn văn và thẻ vào
 * cùng một hàng grid. Nhưng chiều cao hàng bằng ô cao nhất, nên hàng nào cũng bị
 * thẻ kéo giãn ra — nhịp giữa các đoạn lúc rộng lúc hẹp, chữ mất nhịp đọc. Mà
 * vị trí đúng của một thẻ lại phụ thuộc vào HAI thứ ở hai cột khác nhau: đỉnh
 * đoạn văn của nó, và đáy thẻ đứng trước. CSS không lấy được `max()` của hai giá
 * trị đó, nên phần này phải đo bằng JavaScript.
 *
 * LUẬT: mỗi thẻ nằm ở đỉnh đoạn văn của nó, TRỪ KHI làm thế sẽ đè lên thẻ trước
 * — lúc đó nó bị đẩy xuống vừa đủ để không đè. Cột chữ không bị đụng tới, nên
 * khoảng cách giữa các đoạn văn luôn đúng một bậc `para`.
 *
 * Tách khỏi component để kiểm được bằng số thuần, không cần trình duyệt.
 */

/**
 * Nhiều nhất bấy nhiêu thẻ thì dải nguồn còn được đứng ở lề phải.
 *
 * VÌ SAO PHẢI CÓ NGƯỠNG. Dải nguồn rộng 252px, còn một thẻ đầy đủ — số thứ tự,
 * tên tài liệu, đoạn trích hai dòng, nút xem đầy đủ, cơ quan ban hành, số hiệu,
 * nút mở tài liệu — cao khoảng 312px ở bề ngang đó. Một đoạn văn hai dòng thì
 * cao 65px. Tức mỗi thẻ chiếm chỗ bằng gần năm dòng chữ.
 *
 * Với một hai nguồn, `stackRailTops` đẩy thẻ xuống một chút là xong. Nhưng
 * backend có lúc trả về bảy nguồn cho một câu trả lời: cột thẻ khi đó cao
 * 7 × 312 + 6 × 12 = 2256px, trong khi cột chữ chỉ vài trăm px. Phần chênh
 * lệch là khoảng trắng thuần — gần ba màn hình laptop — và không có luật xếp
 * chồng nào chữa được, vì vấn đề không nằm ở chỗ xếp mà ở chỗ CỘT BÊN PHẢI DÀI
 * HƠN CỘT BÊN TRÁI.
 *
 * Khi số nguồn vượt quá chiều cao đoạn văn, việc thẳng hàng không còn nói lên
 * điều gì: thẻ thứ năm nằm ngang một đoạn văn mà nó không hề chú thích. Lúc đó
 * xếp toàn bộ thẻ xuống dưới câu trả lời thành lưới hai cột là TRUNG THỰC HƠN —
 * nó thôi hứa một mối liên hệ không có thật — và nó không bao giờ vỡ, vì chiều
 * cao lưới không còn phụ thuộc chiều cao cột chữ nữa.
 *
 * NGƯỠNG LÀ HAI, và con số đó đến từ trường hợp xấu nhất chứ không phải trường
 * hợp trung bình. Bản trước đặt ngưỡng ba vì cột ba thẻ cao khoảng 960px, vẫn
 * trong tầm một câu trả lời BÌNH THƯỜNG. Nhưng câu trả lời ngắn thì không hiếm:
 * một đoạn một dòng cao 32px, đi với ba thẻ là 960px cột bên phải — 928px trắng
 * trơn, hơn một màn hình laptop, cho một câu trả lời dài đúng một dòng.
 *
 * Hai thẻ thì trường hợp xấu nhất còn 636px cột thẻ, tức 604px trắng — vẫn
 * nhiều, nhưng đây là ngưỡng thấp nhất còn giữ được bố cục hai cột cho những
 * câu trả lời một nguồn và hai nguồn, vốn là đa số. Hạ xuống một nữa thì dải
 * nguồn ở lề phải không còn tồn tại trong thực tế.
 */
export const MAX_INLINE_RAIL_CARDS = 2

/**
 * Có phải xếp dải nguồn xuống dưới câu trả lời không.
 *
 * `cardCount` là số THẺ sẽ dựng, tức số nguồn được nhắc tới LẦN ĐẦU trong bài —
 * không phải `citations.length`. Hai con số lệch nhau khi máy chủ trả về một
 * nguồn mà `answer` không hề có marker trỏ tới: nguồn đó không sinh thẻ nào,
 * nên nó cũng không được tính vào quyết định bố cục.
 *
 * Luật này CHỈ áp ở bố cục từ `--breakpoint-rail` (1162px) trở lên. Dưới mốc đó
 * dải nguồn vốn đã nằm dưới đoạn văn tương ứng theo luồng thường, không có cột
 * nào để mà lệch.
 */
export function shouldStackRail(cardCount: number): boolean {
  return cardCount > MAX_INLINE_RAIL_CARDS
}

export type RailSlot = {
  /** Khoảng cách từ đỉnh cột chữ tới đỉnh đoạn văn tương ứng, đơn vị px. */
  paragraphTop: number
  /** Chiều cao thẻ khi đã ở bề ngang của lề phải, đơn vị px. */
  height: number
}

/**
 * Trả về vị trí `top` của từng thẻ, cùng thứ tự với `slots`.
 *
 * `slots` phải theo đúng thứ tự đoạn văn từ trên xuống. Kết quả luôn không giảm,
 * và luôn cách nhau ít nhất `gap` — nên hai thẻ không bao giờ đè nhau, dù đoạn
 * văn ngắn tới đâu.
 */
export function stackRailTops(slots: readonly RailSlot[], gap: number): number[] {
  const tops: number[] = []

  // Sàn của thẻ kế tiếp: đáy thẻ vừa đặt cộng khe hở. Thẻ đầu tiên chưa có sàn
  // nào nên nó luôn được nằm đúng đỉnh đoạn văn của mình.
  let floor = Number.NEGATIVE_INFINITY

  for (const slot of slots) {
    const top = Math.max(slot.paragraphTop, floor)
    tops.push(top)
    floor = top + slot.height + gap
  }

  return tops
}

/**
 * Đáy của thẻ thấp nhất, dùng đặt `min-height` cho cột chữ.
 *
 * Thẻ được nhấc khỏi luồng nên nó không tự đẩy được thứ gì xuống. Thiếu bước
 * này thì một thẻ dài đi với đoạn văn cuối sẽ thò xuống đè lên dòng miễn trừ
 * trách nhiệm bên dưới. Khoảng trống thêm nằm SAU đoạn cuối nên không ảnh hưởng
 * nhịp giữa các đoạn.
 */
export function stackBottom(slots: readonly RailSlot[], tops: readonly number[]): number {
  let bottom = 0

  for (const [index, slot] of slots.entries()) {
    const top = tops[index]
    if (top === undefined) continue
    bottom = Math.max(bottom, top + slot.height)
  }

  return bottom
}
