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
