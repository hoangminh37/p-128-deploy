# Tài liệu thiết kế giao diện — EduHealth AI

## 1. Giới thiệu

### 1.1. Mục đích

Tài liệu này mô tả hệ thống thiết kế đang chạy thật trong sản phẩm: bảng màu, bộ
chữ, thang khoảng cách, khung bố cục, thư viện thành phần, và các quy ước về khả
năng tiếp cận. Mọi con số đều lấy từ mã nguồn, chủ yếu là
`frontend/src/index.css` và các file trong `frontend/src/ui/`.

Dùng tài liệu này khi cần thêm một màn hình mới mà không muốn tự nghĩ ra một
kiểu riêng, hoặc khi cần biết một giá trị đang là bao nhiêu và vì sao.

### 1.2. Phạm vi

Bao phủ:

- Toàn bộ token khai trong `frontend/src/index.css`
- Ba họ font và mười ba bậc cỡ chữ
- Khung ứng dụng, điểm ngắt màn hình, chiều rộng đọc
- Toàn bộ thành phần trong `frontend/src/ui/`
- Chế độ sáng tối, linh vật, biểu tượng, hình minh hoạ
- Các biện pháp tiếp cận đang có trong code
- Quy ước ngôn ngữ và giọng văn

Không bao phủ: luồng nghiệp vụ và đặc tả từng màn hình, đã có ở
`docs/functional-spec.md`; hợp đồng dữ liệu, đã có ở `docs/api-contract.md`.

### 1.3. Người đọc dự kiến

- Người viết giao diện, cần biết dùng token nào cho việc gì
- Người thiết kế, cần biết ràng buộc nào đang có và vì sao
- Người kiểm thử khả năng tiếp cận, cần danh sách biện pháp để đối chiếu
- Người viết nội dung trong ứng dụng, cần quy ước giọng văn

## 2. Nguyên tắc thiết kế

Người dùng chính là người bệnh 45 đến 70 tuổi, đọc trên điện thoại, nhiều người
đang lo lắng khi mở ứng dụng, và phần lớn không quen thuật ngữ y khoa. Bảy
nguyên tắc dưới đây đều xuất phát từ đó, và mỗi nguyên tắc kèm chỗ áp dụng thật.

### 2.1. Chữ đủ lớn, và không bao giờ nhỏ đi để nhường chỗ

`frontend/src/index.css` khai ba sàn cứng ở dòng 200 đến 203: nội dung từ 17px,
chữ phụ từ 14px, tuyệt đối từ 13px. Cùng chỗ đó ghi rõ quy tắc xử lý khi thiếu
chỗ: đổi bố cục, không hạ cỡ chữ.

Ví dụ trong sản phẩm: cỡ chữ gốc của trang đặt 18px chứ không phải 16px mặc định
của trình duyệt (`index.css` dòng 445). Danh sách hội thoại ở thanh bên là chỗ
dễ bị thu nhỏ nhất, nhưng `ConversationNav.tsx` giữ tiêu đề phiên ở bậc
`question` 16px và nhãn nhóm ở 15px.

### 2.2. Ba việc quan trọng nhất được phóng to hơn phần còn lại

Bậc `notice` 19px lớn hơn cả bậc nội dung câu trả lời 18px, dành riêng cho chữ
người dùng không được phép đọc lướt (`index.css` dòng 225 đến 236): bốn khối
trạng thái, chữ trên nút gọi cấp cứu, và nhãn trên các thẻ lựa chọn lớn của form.

Nút gọi cấp cứu 115 có bậc chiều cao riêng `--spacing-call` 56px, cao hơn hẳn
ngưỡng chạm chung 44px, vì đây là nút có thể được bấm bởi người đang đau ngực,
tay run (`index.css` dòng 190 đến 193, dùng ở `ui/ResponseStates.tsx`).

### 2.3. Không bao giờ phân biệt chỉ bằng màu

Bốn khối trạng thái trả lời phân biệt nhau bằng ba tín hiệu cùng lúc là nền,
khối biểu tượng và hình vẽ, không chỉ bằng màu. Lý do ghi trong
`ui/ResponseStates.tsx`: `alert` và `sand` là đỏ và vàng nâu, hai màu mà khoảng
8 phần trăm nam giới không phân biệt được.

`ui/StepProgress.tsx` cũng theo luật này: thanh tiến trình có một dòng chữ làm
bản chính và mấy vạch màu làm bản phụ, vạch màu đã `aria-hidden` để không bị đọc
lặp.

### 2.4. Hai họ nền, mỗi họ có bộ màu chữ riêng

Nền navy `ink` dành cho phần dẫn dắt: trang giới thiệu, đăng nhập, thanh bên,
tổng quan biên tập viên; chữ trên đó là `white` và `mist`. Nền sáng
`canvas` và `surface` dành cho phần làm việc: hỏi đáp, khai hồ sơ, hàng đợi; chữ
trên đó là `body` và `slate` (`index.css` dòng 4 đến 21).

Nhờ tách hai họ, không có cặp màu nào phải phục vụ hai nền cùng lúc.

### 2.5. Chuyển động chỉ được làm đúng hai việc

Chỉ có hai hoạt ảnh trong toàn ứng dụng (`index.css` dòng 341 đến 361): câu trả
lời hiện dần từ dưới lên trong 250ms và chạy đúng một lần, và linh vật thở với
chu kỳ 2 giây, biên độ 4,5 phần trăm, chỉ sống trong lúc chờ máy chủ. Không có
hiệu ứng gõ chữ, không skeleton nhấp nháy, không hiệu ứng chuyển màn.

Khối `red_flag` không có bất kỳ hoạt ảnh nào.

### 2.6. Người bấm nhầm phải sửa được

`ui/SignOutButton.tsx` có bước hỏi lại trước khi đăng xuất, vì nút nằm ngay dưới
khối hồ sơ, tức ngay cạnh thứ người dùng bấm thường xuyên.

`ui/ChatComposer.tsx` chặn câu quá ngắn ngay tại máy khách kèm dòng nhắc, thay
vì gửi đi rồi hiện lỗi.

### 2.7. Nguồn luôn nằm cạnh khẳng định

`ui/AnswerDocument.tsx` ghi nguyên tắc chi phối cả file: người bệnh không bao
giờ được nhìn thấy một khẳng định y khoa mà không nhìn thấy nguồn của nó cùng
lúc. Nguồn không nằm cuối bài, không nằm trong khối gập, không nằm sau một cú
bấm.

## 3. Hệ màu

### 3.1. Bảng đầy đủ token màu

25 token màu khai trong khối `@theme` của `frontend/src/index.css`.

| Token | Giá trị | Vai trò và nơi dùng | Dòng |
| :-- | :-- | :-- | :-- |
| `--color-ink` | `#0B2545` | Nền phần dẫn dắt, và màu chữ đặt trên ba màu nhấn | 39 |
| `--color-ink-soft` | `#123258` | Vòng tròn của họa tiết nền trên nền ink | 40 |
| `--color-dot` | `#1B4470` | Lưới chấm 3x2 ở góc khối navy | 41 |
| `--color-mint` | `#35D0B6` | Nhấn chính: nút, số liệu, marker trích dẫn | 44 |
| `--color-mint-deep` | `#06382F` | Màu chữ dành riêng cho nền mint | 45 |
| `--color-coral` | `#FF8A5B` | Nhấn phụ: số liệu, khối nguồn gốc | 46 |
| `--color-coral-deep` | `#5C2A11` | Màu chữ dành riêng cho nền coral | 47 |
| `--color-sand` | `#FFE3B8` | Nền khối từ chối, nền khối cảnh báo nhẹ | 48 |
| `--color-sand-deep` | `#5C3F0F` | Màu chữ dành riêng cho nền sand | 49 |
| `--color-canvas` | `#F2F7F6` | Nền vùng làm việc | 56 |
| `--color-surface` | `#FFFFFF` | Nền thẻ: câu trả lời, dòng hàng đợi, form | 57 |
| `--color-body` | `#0B2545` | Chữ chính của vùng làm việc | 58 |
| `--color-slate` | `#5A7387` | Chữ phụ vùng làm việc, và viền thành phần tương tác | 59 |
| `--color-mist` | `#93B0C7` | Chữ phụ trên nền navy | 62 |
| `--color-alert` | `#B3261E` | Đỏ ở vai chữ và viền | 74 |
| `--color-alert-solid` | `#B3261E` | Đỏ ở vai nền khối cấp cứu, không lật theo chế độ | 75 |
| `--color-veil` | `#F8FBFA` | Lớp voan thứ nhất của họa tiết nền trên canvas | 95 |
| `--color-veil-soft` | `#FBFDFC` | Lớp voan thứ hai, nhạt hơn | 96 |
| `--color-mint-lift` | `#5FE0C9` | Bậc sáng hơn của mint, cho thẻ bấm được khi rê chuột | 114 |
| `--color-coral-lift` | `#FFA57E` | Bậc sáng hơn của coral | 115 |
| `--color-sand-lift` | `#FFEDD1` | Bậc sáng hơn của sand | 116 |
| `--color-mint-press` | `#22B9A0` | Bậc đậm hơn của mint, cho nút khi rê chuột | 118 |
| `--color-ink-press` | `#061A32` | Bậc đậm hơn của ink | 119 |
| `--color-sand-deep-press` | `#452F0B` | Bậc đậm hơn của sand-deep | 120 |
| `--color-line` | `#C8D8E4` | Đường phân cách thuần trang trí | 129 |

### 3.2. Vai trò của từng nhóm màu

Nhóm nền dẫn dắt, gồm `ink`, `ink-soft`, `dot`. `ink` mang hai vai cùng lúc: nó
là nền của phần dẫn dắt, và là màu chữ đặt trên ba màu nhấn. Cả hai vai đều
không đổi khi sang chế độ tối. Ghi chú ở `index.css` dòng 25 đến 38 nói rõ vì
sao phải tách `ink` khỏi `--color-body`: một token không thể vừa là nền navy vừa
là chữ sáng.

Nhóm ba màu nhấn, gồm `mint`, `coral`, `sand`. Mỗi màu đi kèm đúng một màu chữ
dành riêng, hậu tố `-deep`. Quy tắc bắt buộc ghi ở `index.css` dòng 16 đến 18:
không đặt `slate` lên `sand`, vì cặp đó chỉ đạt 4.00:1.

Nhóm nền làm việc, gồm `canvas`, `surface`, `body`, `slate`. Đây là bốn token
duy nhất đổi giá trị theo chế độ sáng tối, cộng thêm hai lớp voan.

Nhóm đỏ, gồm `alert` và `alert-solid`. Tách làm hai vì hai vai khác nhau:
`alert` là chữ và viền nên phải lật theo chế độ; `alert-solid` là nền khối cảnh
báo cấp cứu nên giữ nguyên một sắc đỏ ở cả hai chế độ. Lý do ghi ở `index.css`
dòng 66 đến 73: người đang đau ngực không được nhìn thấy hai màu khác nhau tuỳ
máy họ đang để chế độ nào.

Nhóm bậc trạng thái con trỏ, gồm ba token `-lift` và ba token `-press`. Hai
chiều ngược nhau là có chủ ý: thẻ bấm được thì sáng ra khi rê chuột, nút thì đậm
lại (`index.css` dòng 102 đến 113).

Nhóm trang trí, chỉ có `line`. Có cảnh báo riêng ở `index.css` dòng 122 đến 128:
tuyệt đối không dùng làm viền ô nhập liệu, nút bấm, ô chọn hay bất kỳ thành phần
tương tác nào; chỗ đó dùng `slate`.

### 3.3. Bảng tỉ lệ tương phản

Ngưỡng đối chiếu theo WCAG 2.x mức AA: chữ thường cần từ 4.5:1, chữ lớn và thành
phần giao diện cần từ 3:1. Con số dưới đây lấy từ ghi chú trong
`frontend/src/index.css` và `frontend/src/ui/ResponseStates.tsx`.

Chế độ sáng, cặp chữ trên nền:

| Chữ | Nền | Tỉ lệ | Ngưỡng 4.5:1 | Nguồn |
| :-- | :-- | :-- | :-- | :-- |
| `body` | `canvas` | 14.22:1 | đạt | index.css:58 |
| `slate` | `canvas` | 4.58:1 | đạt | index.css:59 |
| `alert` | `canvas` | 6.04:1 | đạt | index.css:74 |
| `ink` | `surface` trắng | 15.39:1 | đạt | ResponseStates.tsx |
| `slate` | `surface` trắng | 4.96:1 | đạt | index.css:127 |
| `alert` | `surface` trắng | 6.54:1 | đạt | ResponseStates.tsx |
| `mist` | `ink` | 6.80:1 | đạt | index.css:62 |
| `mint` | `ink` | 7.95:1 | đạt | index.css:496 |
| `white` | `alert-solid` | 6.54:1 | đạt | ResponseStates.tsx |
| `mint-deep` | `mint` | 6.72:1 | đạt | index.css:45 |
| `ink` | `mint` | 7.95:1 | đạt | ChatScreen.tsx |
| `coral-deep` | `coral` | 5.04:1 | đạt | index.css:47 |
| `sand-deep` | `sand` | 7.79:1 | đạt | index.css:49 |
| `sand` | `sand-deep` | 7.79:1 | đạt | ResponseStates.tsx |
| `body` | `veil` | 14.78:1 | đạt | index.css:85 |
| `slate` | `veil` | 4.76:1 | đạt | index.css:85 |
| `alert` | `veil` | 6.28:1 | đạt | index.css:85 |
| `body` | `veil-soft` | 15.06:1 | đạt | index.css:86 |
| `slate` | `veil-soft` | 4.85:1 | đạt | index.css:86 |
| `alert` | `veil-soft` | 6.40:1 | đạt | index.css:86 |
| `ink` | `mint-lift` | 9.52:1 | đạt | index.css:109 |
| `ink` | `mint-press` | 6.24:1 | đạt | index.css:109 |
| `mint-deep` | `mint-lift` | 8.05:1 | đạt | index.css:110 |
| `mint-deep` | `mint-press` | 5.27:1 | đạt | index.css:110 |
| `coral-deep` | `coral-lift` | 6.09:1 | đạt | index.css:111 |
| `white` | `ink-press` | 17.48:1 | đạt | index.css:111 |
| `sand-deep` | `sand-lift` | 8.42:1 | đạt | index.css:112 |
| `sand` | `sand-deep-press` | 10.17:1 | đạt | index.css:112 |

Chế độ tối, cặp chữ trên nền:

| Chữ | Nền | Tỉ lệ | Ngưỡng 4.5:1 | Nguồn |
| :-- | :-- | :-- | :-- | :-- |
| `body` | `canvas` | 15.56:1 | đạt | index.css:391 |
| `slate` | `canvas` | 8.42:1 | đạt | index.css:391 |
| `white` | `canvas` | 18.07:1 | đạt | index.css:391 |
| `body` | `surface` | 10.93:1 | đạt | index.css:393 |
| `slate` | `surface` | 5.91:1 | đạt | index.css:393 |
| `mist` | `surface` | 5.61:1 | đạt | index.css:393 |
| `mint` | `surface` | 6.56:1 | đạt | index.css:393 |
| `alert` | `canvas` | 8.84:1 | đạt | index.css:406 |
| `alert` | `surface` | 6.21:1 | đạt | index.css:406 |
| `alert` | `ink` | 7.53:1 | đạt | index.css:406 |
| `body` | `veil` | 16.58:1 | đạt | index.css:412 |
| `slate` | `veil` | 8.97:1 | đạt | index.css:412 |
| `white` | `ink-press` | 11.57:1 | đạt | index.css:416 |

Thành phần giao diện và viền, ngưỡng 3:1:

| Cặp | Tỉ lệ | Ngưỡng 3:1 | Nguồn |
| :-- | :-- | :-- | :-- |
| `slate` làm viền ô nhập trên nền trắng, chế độ sáng | 4.96:1 | đạt | index.css:127 |
| `slate` làm viền ô nhập trên `surface`, chế độ tối | 5.91:1 | đạt | index.css:398 |
| Vòng focus `mint` trên `ink` | 7.95:1 | đạt | index.css:496 |
| Vòng focus `mint` trên `canvas` tối | 9.33:1 | đạt | index.css:502 |
| Vòng focus `mint` trên `surface` tối | 6.56:1 | đạt | index.css:502 |
| Vòng focus navy ngoài trên `canvas` sáng | 14.22:1 | đạt | index.css:497 |
| Quầng focus độ đặc 0.72 trên `mint` | 4.30:1 | đạt | index.css:509 |
| Quầng focus trên `coral` | 4.13:1 | đạt | index.css:509 |
| Quầng focus trên `sand` | 5.68:1 | đạt | index.css:510 |
| Quầng focus trên `canvas` sáng | 5.98:1 | đạt | index.css:510 |
| Quầng focus trên `surface` sáng | 6.26:1 | đạt | index.css:510 |
| Quầng focus trên `white` | 6.26:1 | đạt | index.css:514 |

Bốn cặp không đạt ngưỡng, đều đã được ghi chú và có luật xử lý riêng:

| Cặp | Tỉ lệ | Luật xử lý | Nguồn |
| :-- | :-- | :-- | :-- |
| `slate` trên `sand` | 4.00:1 | Cấm dùng. Chữ trên nền sand phải là `sand-deep` | index.css:17 |
| `line` trên nền trắng, chế độ sáng | 1.46:1 | Chỉ dùng cho nét phân cách trang trí, cấm dùng làm viền thành phần tương tác | index.css:122 |
| `line` trên `surface`, chế độ tối | 1.38:1 | Cùng luật trên | index.css:402 |
| Quầng focus trên `alert-solid` | 2.35:1 | Không áp dụng thực tế: trong khối cấp cứu, thứ duy nhất nhận focus là nút gọi 115, mà nút đó nền trắng và đạt 6.26:1 | index.css:512 |

Vòng focus dùng hai lớp chồng nhau chính vì không màu nào một mình đủ cho cả hai
họ nền: vòng trong `mint` mạnh trên nền navy nhưng chỉ đạt 1.79:1 trên canvas
sáng, còn quầng navy ngoài thì ngược lại (`index.css` dòng 492 đến 500).

Lớp giao diện giọng nói là thanh ghi âm gọn `.voice-wave-*`, dựng ở
`frontend/src/ui/VoiceChatWidget.tsx`. Thẻ của nó đặt trên nền `surface`, riêng
ô sóng âm `.voice-wave-meter` có nền `ink` cố định ở cả hai chế độ.

Chữ trên thẻ, nền `surface`:

| Chữ | Sáng | Tối | Ngưỡng 4.5:1 | Dùng cho |
| :-- | :-- | :-- | :-- | :-- |
| `body` | 15.39:1 | 10.93:1 | đạt | Tiêu đề, và chữ trên nút Huỷ |
| `slate` | 4.96:1 | 5.91:1 | đạt | Dòng trạng thái và phụ đề |
| `alert` | 6.54:1 | 6.21:1 | đạt | Dòng trạng thái khi lỗi |

Sóng âm trong ô `.voice-wave-meter`, nền `ink`. Màu đổi theo trạng thái qua biến
`--voice-wave-color`, và vì cả màu lẫn nền đều cố định nên tỉ lệ giống nhau ở
hai chế độ:

| Trạng thái | Màu | Tỉ lệ | Ngưỡng 4.5:1 |
| :-- | :-- | :-- | :-- |
| `listening` | `mint` `#35D0B6` | 7.95:1 | đạt |
| `speaking` | `coral` `#FF8A5B` | 6.62:1 | đạt |
| `idle` và `processing` | `mist` `#93B0C7` | 6.80:1 | đạt |
| `error` | `#FFB09A` | 8.74:1 | đạt |

Nút và viền:

| Cặp | Sáng | Tối | Ngưỡng | Dùng cho |
| :-- | :-- | :-- | :-- | :-- |
| `ink` trên `mint` | 7.95:1 | 7.95:1 | 4.5:1, đạt | Chữ trên nút Gửi |
| `slate` làm viền trên `surface` | 4.96:1 | 5.91:1 | 3:1, đạt | Viền nút Huỷ |
| `line` làm viền thẻ trên `surface` | 1.46:1 | 1.38:1 | chỉ trang trí | Viền ngoài của thẻ, xem luật ở bảng cặp không đạt ngưỡng |

Mọi cặp chữ ở đây đạt ngưỡng WCAG AA 4.5:1. Cặp chữ thấp nhất là `slate` trên
`surface` ở chế độ sáng với 4.96:1; cặp sóng âm thấp nhất là `coral` trên `ink`
với 6.62:1.

Hai trạng thái `idle` và `processing` dùng cùng một màu, đúng giá trị của token
`mist`.

### 3.4. Token đổi theo chế độ sáng tối

Chín token đổi giá trị, khai trong khối `[data-theme='dark']` của
`frontend/src/index.css`.

| Token | Sáng | Tối | Dòng |
| :-- | :-- | :-- | :-- |
| `--color-canvas` | `#F2F7F6` | `#061729` | 392 |
| `--color-surface` | `#FFFFFF` | `#153455` | 394 |
| `--color-body` | `#0B2545` | `#E7EFF7` | 397 |
| `--color-slate` | `#5A7387` | `#9BB4CB` | 400 |
| `--color-line` | `#C8D8E4` | `#2A4A6B` | 404 |
| `--color-alert` | `#B3261E` | `#FF9A8F` | 408 |
| `--color-veil` | `#F8FBFA` | `#040F1D` | 413 |
| `--color-veil-soft` | `#FBFDFC` | `#05121F` | 414 |
| `--color-ink-press` | `#061A32` | `#1A3A5F` | 418 |

Mười sáu token còn lại giữ nguyên ở cả hai chế độ, gồm cả `ink`, ba màu nhấn và
ba màu chữ `-deep` của chúng, cùng `alert-solid`.

Cách dựng chế độ tối không phải đảo ngược sáng tối, mà là mở rộng vùng navy ra
toàn bộ (`index.css` dòng 372 đến 380): `canvas` xuống đậm hơn `ink` một bậc,
`surface` lên nhạt hơn `ink` một bậc, còn `ink` giữ nguyên làm mốc ở giữa.

Hai lớp voan đổi chiều: ở chế độ sáng chúng sáng hơn `canvas`, ở chế độ tối
chúng tối hơn. Cùng một luật là đi xa khỏi màu chữ, chỉ khác hướng (`index.css`
dòng 88 đến 94 và 410 đến 412). Chênh lệch độ sáng giữ trong ngân sách 3 phần
trăm ở cả hai chiều.

## 4. Chữ

### 4.1. Ba họ font

Khai ở `frontend/src/index.css` dòng 146 đến 149, nạp từ gói `@fontsource`.

| Token | Họ chữ | Vai trò | Lý do chọn |
| :-- | :-- | :-- | :-- |
| `--font-title` | Lora Variable | Tiêu đề trang và tiêu đề khối, cùng mọi con số lớn | Chữ có chân, nhịp chậm, hợp với vai trò dẫn dắt. Con số lớn dùng font này vì chúng đóng vai tiêu đề |
| `--font-display` | Be Vietnam Pro | Mọi chữ giao diện: nhãn, nút, dòng phụ | Chữ không chân, dựng riêng cho tiếng Việt nên dấu không bị chồng |
| `--font-body` | Be Vietnam Pro | Nội dung câu trả lời và chữ trong ô nhập | Cùng họ với `display` |
| `--font-mono` | IBM Plex Mono | Số hiệu văn bản, số thứ tự nguồn | Chữ đều bề ngang, dễ đối chiếu từng ký tự với bản gốc |

`display` và `body` hiện trỏ cùng một họ chữ. Hai tên vẫn giữ riêng vì hai vai
trò khác nhau: ngày nào muốn tách ra thì chỉ đổi một dòng ở `index.css` thay vì
rà lại hàng trăm class trong markup (`index.css` dòng 140 đến 143).

Mặc định, mọi thẻ tiêu đề từ `h1` tới `h6` lấy `--font-title` qua luật nền ở
`index.css` dòng 462 đến 472. Chỗ nào cần chữ giao diện thì gắn thẳng
`font-display` lên chính thẻ đó.

### 4.2. Bảng bậc cỡ chữ

Mười ba bậc, đặt tên theo vai trò chứ không theo con số. Cỡ chữ gốc của trang là
18px (`index.css` dòng 445).

| Token | Cỡ | Chiều cao dòng | Dùng cho | Dòng |
| :-- | :-- | :-- | :-- | :-- |
| `--text-metric` | 44px | 1.1 | Con số lớn trên hai thẻ số liệu của màn tổng quan biên tập | 213 |
| `--text-hero` | 36px | 1.25 | Tiêu đề lớn của trang giới thiệu | 209 |
| `--text-ask` | 25px | 1.35 | Câu hỏi của người dùng, đóng vai tiêu đề của trang câu trả lời | 218 |
| `--text-heading` | 22px | 1.35 | Tiêu đề khối trạng thái: red_flag, refused, referral | 222 |
| `--text-notice` | 19px | 1.75 | Chữ không được phép đọc lướt: bốn khối trạng thái, chữ trên nút gọi 115, nhãn thẻ lựa chọn lớn của form | 235 |
| `--text-empty` | 18px | 1.4 | Tiêu đề của mọi trạng thái rỗng | 239 |
| `--text-answer` | 18px | 1.8 | Nội dung câu trả lời | 244 |
| `--text-app` | 18px | 1.3 | Tên ứng dụng ở thanh bên và thanh tiêu đề | 248 |
| `--text-input` | 17px | 1.5 | Chữ trong ô nhập và trên nút | 252 |
| `--text-source` | 17px | 1.4 | Tên tài liệu trong thẻ nguồn | 257 |
| `--text-question` | 16px | 1.5 | Chữ chạy dòng ở mọi vai trò phụ trợ: đoạn trích trong thẻ nguồn, cơ quan ban hành, dòng miễn trừ, câu dẫn, thông báo trạng thái | 268 |
| `--text-note` | 15px | 1.5 | Nhãn phụ nhỏ nhất: câu dẫn, nhãn nhóm trên thanh bên, nhãn nhỏ trên trang giới thiệu | 273 |
| `--text-marker` | 15px | 1 | Marker `[n]` trong dòng chữ | 279 |

Bậc `answer` lấy 18px và giãn dòng 1.8 để mắt dò từ cuối dòng này sang đầu dòng
sau không bị lạc (`index.css` dòng 242 đến 243).

Bậc `marker` bằng đúng bậc `note` là có chủ ý: marker là con trỏ tới nguồn của
một khẳng định y khoa, người đọc phải đọc được con số chứ không chỉ thấy một vệt
màu (`index.css` dòng 276 đến 278).

Tên `question` là dấu vết của một bản trước, khi bậc này dùng cho câu hỏi của
người dùng. Tên được giữ nguyên vì đổi tên là sửa hàng chục chỗ ở hơn mười file,
mà class Tailwind gõ sai thì không có gì báo lỗi (`index.css` dòng 264 đến 267).

Ngoài mười ba bậc trên, hai khối markdown có bậc riêng tính theo `rem`:
`.article-body` cho bài học và `.source-markdown` cho tài liệu gốc. Bậc nhỏ nhất
ở đó là `code` 0.8rem, tức 14,4px ở cỡ chữ gốc 18px, vẫn trên sàn 14px của chữ
phụ (`index.css` dòng 597 đến 601, và bậc `code` ở dòng 701).

### 4.3. Sàn cỡ chữ và cách bảo đảm

Ba sàn khai ngay trong `index.css` dòng 200 đến 205:

| Sàn | Ngưỡng | Bậc đang dùng |
| :-- | :-- | :-- |
| Nội dung | từ 17px | `answer` 18, `notice` 19, `app` 18, `input` 17, `source` 17 |
| Chữ phụ | từ 14px | `question` 16, `note` 15, `marker` 15 |
| Tuyệt đối | từ 13px | Không bậc nào chạm tới sàn này |

Bậc nhỏ nhất đang dùng thật là 15px, ở hai bậc `note` và `marker`.

Cách bảo đảm: thang cỡ chữ đặt tên theo vai trò chứ không theo con số, nên khi
viết markup người viết chọn vai trò chứ không chọn kích thước; mọi bậc trong
thang đều đã ở trên sàn, nên không có cách nào chọn nhầm xuống dưới sàn. Quy tắc
khi thiếu chỗ ghi ngay tại chỗ khai thang: đổi bố cục, không hạ cỡ chữ.

## 5. Khoảng cách, bo góc, kích thước chạm

### 5.1. Thang khoảng cách

Mọi bậc là bội số của 4px. `--spacing` đặt bằng 4px nên cả thang số của Tailwind
cũng rơi đúng bội số 4 (`index.css` dòng 160 đến 168).

| Token | Giá trị | Ngăn cách hai thứ gì | Dòng |
| :-- | :-- | :-- | :-- |
| `--spacing-hair` | 4px | Khe hẹp nhất: số nguồn với chữ, chữ với dấu | 170 |
| `--spacing-tight` | 8px | Nhãn với ô nhập; các dòng bên trong một thẻ nguồn | 171 |
| `--spacing-snug` | 12px | Giữa hai thẻ nguồn; padding của khối nhỏ | 172 |
| `--spacing-cozy` | 16px | Padding trong khối lớn | 173 |
| `--spacing-para` | 24px | Giữa các đoạn văn trong câu trả lời | 174 |
| `--spacing-block` | 32px | Giữa các khối lớn | 185 |
| `--spacing-turn` | 56px | Giữa hai lượt hỏi đáp, nhịp nghỉ lớn nhất | 186 |
| `--spacing-touch` | 44px | Vùng chạm tối thiểu | 188 |
| `--spacing-call` | 56px | Chiều cao nút gọi cấp cứu 115 | 193 |
| `--spacing-rail` | 252px | Bề ngang dải nguồn ở lề phải, và bề ngang thanh bên | 195 |

Quy ước dùng: trong markup dùng bậc có tên, không dùng con số, vì tên nói được
khoảng cách này đang ngăn hai thứ gì.

Có một cảnh báo riêng ở `index.css` dòng 175 đến 184: tên bậc `block` đụng tên
tiện ích `inline-block` của Tailwind, khiến mọi phần tử gắn class đó bị ép còn
32px chiều ngang. Quy ước của dự án là không dùng `inline-block`, thay bằng
`w-fit`, `inline-flex` hoặc `inline`.

### 5.2. Bo góc

Năm bậc, đặt tên theo thứ chúng bo (`index.css` dòng 154 đến 158).

| Token | Giá trị | Dùng cho |
| :-- | :-- | :-- |
| `--radius-card` | 16px | Thẻ thường: dòng hàng đợi, dòng log, thẻ giá trị |
| `--radius-card-lg` | 18px | Thẻ lớn: khối câu trả lời, khối trạng thái |
| `--radius-icon` | 12px | Khối biểu tượng vuông nhỏ |
| `--radius-chip` | 14px | Khối biểu tượng lớn, khối số |
| `--radius-pill` | 24px | Nút và nhãn bo tròn hoàn toàn |

### 5.3. Kích thước vùng chạm

Ngưỡng chung là 44px theo cả hai chiều, áp bằng một luật nền ở `index.css` dòng
474 đến 489. Luật này bắt vào `button`, `[role="button"]`, `a[role="button"]`,
`select`, `summary`, `input` không phải loại `hidden`, và `textarea`; năm loại
đầu còn bị ép thêm chiều ngang tối thiểu.

Vì luật nằm ở tầng nền, mọi nút mới thêm sau này tự đạt ngưỡng mà không cần
người viết nhớ gắn class.

Một ngoại lệ đi lên: nút gọi cấp cứu 115 cao tối thiểu 56px bằng
`--spacing-call`, đặt tường minh trong `ui/ResponseStates.tsx`, và chiếm hết bề
ngang trên điện thoại.

## 6. Bố cục

### 6.1. Khung ứng dụng

Khung dựng ở `frontend/src/ui/RootLayout.tsx`, bọc mọi màn sau đăng nhập. Ba
phần:

Thanh bên. Nội dung dựng ở `ui/Sidebar.tsx`, nền navy toàn phần. Với vai trò
bệnh nhân, thanh bên chứa danh sách hội thoại (`ui/ConversationNav.tsx`); với
vai trò biên tập viên, chỗ đó là ba mục điều hướng (`ui/EditorNav.tsx`). Đáy
thanh bên là khối hồ sơ và nút đăng xuất (`ui/SignOutButton.tsx`).

Thanh tiêu đề. Dựng ở `ui/ContentHeader.tsx`, dính theo cuộn bằng
`sticky top-0`. Tiêu đề đổi theo đường dẫn: `Hồ sơ của bạn`, `Thư viện học tập`,
`Câu hỏi mới`, tên hội thoại đang mở, hoặc một trong sáu tiêu đề của khu vực
biên tập. Thanh này dùng thẻ `p` chứ không dùng `h1`, vì mỗi màn đã có `h1` của
riêng nó.

Vùng nội dung. Thẻ `main`, nền `canvas` cho hầu hết màn và nền `ink` riêng cho
`/editor`. Bo góc trái chỉ ở bản rộng, vì dưới 1024px không có nền navy nào bên
trái để lộ ra.

Nền của `body` là `ink` chứ không phải nền sáng, để phần lộ ra khi bo góc và
phần lộ ra khi kéo quá đà trên điện thoại đều liền mạch với thanh bên
(`index.css` dòng 448 đến 460).

### 6.2. Điểm ngắt màn hình

Có hai mốc chính, cố ý độc lập nhau và mang hai tên khác nhau.

| Mốc | Giá trị | Đổi cái gì |
| :-- | :-- | :-- |
| `lg` | 1024px | Thanh bên chuyển từ ngăn kéo sang cột thường trực; thanh tiêu đề đổi bố cục; vùng nội dung bo góc trái |
| `rail` | 1162px | Màn hỏi đáp chuyển từ một cột sang hai cột, dải nguồn nhả ra lề phải |

`--breakpoint-rail` khai ở `index.css` dòng 339, và giá trị 1162px là một phép
cộng chứ không phải con số chọn cho đẹp: thanh bên 252px cộng bề ngang tối đa
của vùng nội dung 910px (`index.css` dòng 317 đến 338).

Dưới 1024px, thanh bên mở dạng ngăn kéo trượt từ trái, phủ lớp `bg-ink/70` lên
nội dung phía sau, có khoá cuộn và bẫy tiêu điểm bàn phím
(`ui/RootLayout.tsx`, thành phần `SidebarDrawer`).

Ngoài hai mốc trên, các mốc chuẩn của Tailwind vẫn được dùng tại chỗ: `sm` cho
việc hiện chữ bên cạnh biểu tượng ở `ui/ThemeToggle.tsx`, `md` và `rail` cho
lưới thẻ ở màn thư viện bài học, `lg` cho việc chia đôi màn đăng nhập. Lớp giao
diện giọng nói có một mốc riêng viết bằng `max-width` là 40rem, tức 640px, trùng
đúng điểm ngắt `sm` (`index.css`, phần `voice-wave`). Dưới mốc đó, thẻ ghi âm
chuyển lưới từ hai cột sang một cột xếp dọc, và hai nút chuyển từ xếp dọc sang
xếp ngang chia đôi.

### 6.3. Chiều rộng đọc tối đa

Ba mức, khai ở `index.css` dòng 292 đến 315.

| Token | Giá trị | Dùng cho |
| :-- | :-- | :-- |
| `--container-answer` | 33rem, tức 594px ở cỡ chữ gốc 18px | Cột câu trả lời, khoảng 62 ký tự mỗi dòng |
| `--container-reading` | 910px | Bề ngang `main` ở bố cục hai cột |
| `--container-page` | 68rem | Bề ngang tối đa của trang giới thiệu |

`--container-reading` cũng là một phép cộng, ghi ngay tại chỗ khai: padding 16px
cộng cột chữ 594px cộng khe 32px cộng dải nguồn 252px cộng padding 16px.

Ghi chú ở `index.css` dòng 288 đến 290 nói rõ vì sao không dùng đơn vị `ch`: `ch`
đo bề ngang chữ số 0, mà chữ số rộng hơn chữ thường khá nhiều, nên `65ch` cho ra
khoảng 85 ký tự thật.

## 7. Thư viện thành phần

Toàn bộ nằm trong `frontend/src/ui/`. Tổng cộng 57 thành phần React, chia thành
31 thành phần giao diện, 23 biểu tượng và 3 hình minh hoạ, cộng 4 hook dùng
chung.

### 7.1. Khung ứng dụng và điều hướng

| Thành phần | File | Mục đích | Nơi dùng |
| :-- | :-- | :-- | :-- |
| `RootLayout` | RootLayout.tsx | Khung ngoài dùng chung: thanh bên và vùng nội dung | App.tsx |
| `Sidebar` | Sidebar.tsx | Nội dung thanh bên, dùng chung cho cột thường trực và ngăn kéo | RootLayout.tsx |
| `ContentHeader` | ContentHeader.tsx | Thanh tiêu đề của vùng nội dung, hai bố cục theo bề ngang | RootLayout.tsx |
| `ConversationNav` | ConversationNav.tsx | Danh sách hội thoại trên thanh bên, gom theo ba mốc thời gian | Sidebar.tsx |
| `EditorNav` | EditorNav.tsx | Ba mục điều hướng của khu vực biên tập | Sidebar.tsx |
| `SignOutButton` | SignOutButton.tsx | Nút đăng xuất có bước hỏi lại | Sidebar.tsx |
| `Backdrop` | Backdrop.tsx | Họa tiết nền, hai bản theo họ nền `ink` và `canvas` | RootLayout.tsx, LandingScreen, LoginScreen, EditorDashboardScreen |

### 7.2. Hỏi đáp

| Thành phần | File | Mục đích | Nơi dùng |
| :-- | :-- | :-- | :-- |
| `AnswerTurn` | AnswerTurn.tsx | Một lượt hỏi đáp, trình bày như một trang tra cứu | ChatScreen |
| `QuestionHeading` | AnswerTurn.tsx | Câu dẫn và tiêu đề câu hỏi | AnswerTurn.tsx, ChatScreen |
| `AnswerDocument` | AnswerDocument.tsx | Dựng câu trả lời kèm thẻ nguồn đứng cạnh khẳng định | AnswerTurn.tsx |
| `AnnotatedText` | AnnotatedAnswer.tsx | Chèn chú thích thuật ngữ y khoa theo offset backend trả về | AnswerDocument.tsx |
| `ChatComposer` | ChatComposer.tsx | Thanh nhập câu hỏi ở đáy màn, và nút mở chế độ giọng nói | ChatScreen |
| `VoiceChatWidget` | VoiceChatWidget.tsx | Lớp hội thoại bằng giọng nói, sóng âm vẽ từ mẫu thật của `AnalyserNode` | ChatScreen |
| `SuggestedQuestions` | SuggestedQuestions.tsx | Gợi ý câu hỏi khi màn chat còn trống, chọn theo bệnh trong hồ sơ | ChatScreen |
| `StateBlock` | ResponseStates.tsx | Khung chung của bốn khối trạng thái | ResponseStates.tsx, ErrorNotice.tsx, LoginScreen |
| `RedFlagBlock` | ResponseStates.tsx | Khối dấu hiệu cấp cứu, nền đỏ đặc, có nút gọi 115 | AnswerTurn.tsx |
| `RefusedBlock` | ResponseStates.tsx | Khối từ chối, nền sand, kèm việc cụ thể để làm tiếp | AnswerTurn.tsx |
| `ReferralBlock` | ResponseStates.tsx | Khối thư viện chưa có tài liệu, nền trắng, kèm linh vật | AnswerTurn.tsx |
| `Disclaimer` | ResponseStates.tsx | Câu miễn trừ ở cuối mọi phản hồi | AnswerTurn.tsx |

### 7.3. Học tập

| Thành phần | File | Mục đích | Nơi dùng |
| :-- | :-- | :-- | :-- |
| `QuizPanel` | QuizPanel.tsx | Khối trắc nghiệm dùng chung cho bốn nguồn ra đề | ArticleDetailScreen, ChatScreen, MistakesScreen, QuizScreen |
| `ProfileIntro` | ProfileIntro.tsx | Ba điều phải hiểu trước khi khai hồ sơ, cộng lời trấn an về giấy tờ | ProfileScreen |
| `StepProgress` | StepProgress.tsx | Thanh tiến trình của form nhiều bước | ProfileScreen |

### 7.4. Khu vực biên tập

| Thành phần | File | Mục đích | Nơi dùng |
| :-- | :-- | :-- | :-- |
| `OriginIconBox` | EditorBadges.tsx | Khối biểu tượng vuông đứng đầu mỗi dòng hàng đợi, phân biệt nguồn gốc | EditorQueueScreen |
| `OriginBadge` | EditorBadges.tsx | Nhãn nguồn gốc dạng chữ | EditorItemScreen |
| `StatusBadge` | EditorBadges.tsx | Nhãn trạng thái của một mục | EditorQueueScreen, EditorItemScreen, EditorDocumentsScreen |
| `TopicTags` | EditorBadges.tsx | Danh sách thẻ chủ đề | EditorQueueScreen, EditorItemScreen |

### 7.5. Trạng thái chung

| Thành phần | File | Mục đích | Nơi dùng |
| :-- | :-- | :-- | :-- |
| `EmptyState` | EmptyState.tsx | Khuôn chung của mọi trạng thái rỗng: linh vật, một dòng tiêu đề 18px, một đoạn giải thích | 7 màn hình cộng ConversationNav.tsx |
| `ErrorNotice` | ErrorNotice.tsx | Lỗi kỹ thuật, dựng trên `StateBlock` giọng `fault`, kèm câu hành động theo từng loại lỗi | 13 màn hình cộng QuizPanel.tsx |

### 7.6. Chế độ hiển thị

| Thành phần | File | Mục đích | Nơi dùng |
| :-- | :-- | :-- | :-- |
| `ThemeProvider` | ThemeProvider.tsx | Giữ lựa chọn sáng tối và đồng bộ với thẻ `html` | App.tsx |
| `ThemeToggle` | ThemeToggle.tsx | Ba nút bày sẵn: Sáng, Tối, Theo máy | ContentHeader.tsx, LandingScreen |

### 7.7. Hình

| Thành phần | File | Mục đích | Nơi dùng |
| :-- | :-- | :-- | :-- |
| `Mascot` | Mascot.tsx | Linh vật Sen, hai bản `solid` và `muted` | LandingScreen, EmptyState.tsx, ResponseStates.tsx, SuggestedQuestions.tsx |
| `ReadingPerson` | illustrations/index.tsx | Một người ngồi đọc tài liệu | LandingScreen, LearningLibraryScreen |
| `DocumentStack` | illustrations/index.tsx | Chồng tài liệu | LandingScreen, LearningLibraryScreen, EditorQueueScreen, OutOfScopeScreen |
| `PhoneInHand` | illustrations/index.tsx | Điện thoại trên tay | LandingScreen |

### 7.8. Hook dùng chung

Khai ở `frontend/src/ui/shellHooks.ts`, tách khỏi file component để giữ Fast
Refresh của Vite hoạt động đúng.

| Hook | Mục đích |
| :-- | :-- |
| `useMediaQuery` | Theo dõi một media query, dựng trên `useSyncExternalStore` |
| `useTransientNotice` | Dòng phản hồi thoáng qua, tự tắt sau 4000ms |
| `useScrollLock` | Khoá cuộn trang khi mở lớp phủ |
| `useFocusTrap` | Bẫy tiêu điểm bàn phím trong một vùng, kèm xử lý phím Escape |

### 7.9. Biểu tượng

23 biểu tượng khai ở `frontend/src/ui/icons.tsx`: `AppMark`, `ChevronLeftIcon`,
`ChevronRightIcon`, `MenuIcon`, `CloseIcon`, `PlusIcon`, `CopyIcon`, `SaveIcon`,
`AlertIcon`, `PhoneIcon`, `NoteIcon`, `LibraryIcon`, `QuizIcon`, `PillIcon`,
`SearchIcon`, `SendIcon`, `MicrophoneIcon`, `SignOutIcon`, `UserIcon`,
`SunIcon`, `MoonIcon`, `SystemIcon`, `CheckIcon`. Quy ước vẽ ở mục 10.

## 8. Chế độ sáng tối

### 8.1. Ba lựa chọn, hai giá trị thật

Người dùng chọn một trong ba: `light`, `dark`, `system`. Mặc định là `system`.
Thẻ `html` thì chỉ bao giờ mang một trong hai giá trị `data-theme="light"` hoặc
`data-theme="dark"`; lựa chọn `system` được giải ra ngay lúc đọc, không truyền
nguyên xuống CSS (`frontend/src/ui/theme.ts` dòng 1 đến 20).

Lý do giải sớm: nếu để CSS tự lo `system` thì phải viết hai khối token song
song, một cho `[data-theme='dark']` và một cho `@media (prefers-color-scheme:
dark)`, với cùng một danh sách hơn mười biến. Giải sớm thì CSS chỉ có đúng một
khối.

Nhãn hiển thị của ba lựa chọn: Sáng, Tối, Theo máy (`ui/theme.ts` dòng 108).
Nhãn cho trình đọc màn hình dài hơn: Dùng chế độ sáng, Dùng chế độ tối, Dùng chế
độ theo cài đặt của máy (`ui/theme.ts` dòng 115).

### 8.2. Cách lưu

Khoá `localStorage` là `tro-ly-suc-khoe:theme`, dùng chung tiền tố với phiên
đăng nhập nhưng không bị xoá khi đăng xuất, vì chế độ hiển thị là thiết lập của
cái máy chứ không phải của tài khoản (`ui/theme.ts` dòng 40 đến 47).

Lựa chọn `system` không được lưu: vắng mặt chính là `system`. Nhờ vậy một máy
chưa từng chọn gì và một máy vừa chọn lại theo hệ điều hành cho ra cùng một
trạng thái (`ui/theme.ts` dòng 68 đến 79).

Mọi giá trị lạ trong `localStorage` đều rơi về `system`, kể cả chuỗi người dùng
tự sửa bằng công cụ nhà phát triển. Đọc hỏng thì không ném lỗi, vì một thiết lập
hiển thị hỏng không được phép chặn cả ứng dụng.

### 8.3. Chống nháy màu lúc tải

`frontend/index.html` có một script đồng bộ đặt trong `head`, chạy trước khi
trình duyệt vẽ khung hình đầu tiên. Script này đọc `localStorage`, giải lựa chọn
ra `light` hoặc `dark`, rồi đặt `data-theme` lên thẻ `html`.

Phải là script đồng bộ và không phải `type="module"`: module bị hoãn tới sau khi
dựng xong cây DOM, nên người dùng để chế độ tối sẽ thấy một nháy trắng đầy màn
hình rồi mới tối lại.

Nếu `localStorage` bị chặn thì script rơi về chế độ sáng.

Khoá `localStorage` bị gõ lại lần thứ hai trong file này vì script thường không
import được; cả `ui/theme.ts` và `index.html` đều ghi chú rằng đổi một chỗ thì
phải đổi cả hai.

`index.html` cũng khai `<meta name="color-scheme" content="light dark">`.

### 8.4. Những gì đổi và những gì giữ nguyên

Đổi: chín token liệt kê ở mục 3.4.

Giữ nguyên: `ink` và hai màu họa tiết của nó, ba màu nhấn `mint`, `coral`,
`sand`, ba màu chữ `-deep` đi kèm, `mist`, `alert-solid`, và ba bậc `-lift`. Lý
do giữ nguyên ba màu nhấn ghi ở `index.css` dòng 382 đến 386: hạ độ sáng thì mọi
cặp `-deep` phải tính lại và mint mất đúng cái sắc mà cả sản phẩm nhận diện qua
đó; chúng là những mảng nhỏ nên độ chói không thành vấn đề.

Nút gọi cấp cứu 115 là nút duy nhất trong ứng dụng không đổi một pixel nào khi
chuyển chế độ: nền trắng thật và chữ `alert-solid`, cố định ở cả hai chế độ
(`ui/ResponseStates.tsx`).

Hình minh hoạ và linh vật cũng không lật màu, xem mục 10.

### 8.5. Hai thứ làm đổi giao diện

Cả hai đều đi qua `ui/ThemeProvider.tsx`:

1. Người dùng bấm nút chuyển, gọi `setPreference`
2. Hệ điều hành đổi chế độ, qua listener `matchMedia`, và chỉ có tác dụng khi
   lựa chọn đang là `system`. Người đã chọn tay Sáng thì máy chuyển sang tối
   cũng không được đụng vào màn hình họ

Listener chạy một lần ngay lúc gắn, để bắt trường hợp hệ điều hành đã đổi chế độ
giữa lúc script ở `index.html` chạy và lúc effect gắn.

## 9. Linh vật

Tên: Sen. Hình: một búp sen chưa nở. Dựng ở `frontend/src/ui/Mascot.tsx`.

Lý do chọn búp thay vì hoa đã nở, ghi trong chính file: búp là thứ đang lớn lên,
còn hoa nở là thứ đã xong; người dùng ở đây đang sống chung với một bệnh mãn
tính, tức đang trong một quá trình chưa kết thúc.

Hai bản:

| Bản | Mô tả | Dùng ở |
| :-- | :-- | :-- |
| `solid` | Màu đầy đủ | Trang giới thiệu, nơi linh vật là nhân vật chính của bố cục |
| `muted` | Cùng hình, hạ bão hoà | Trạng thái rỗng và khối `referral`, nơi linh vật chỉ lấp một khoảng trống và không được tranh chỗ với chữ |

Hai bảng màu dùng chung năm khoá, để phần vẽ không phải rẽ nhánh. Giá trị lấy từ
hằng `PALETTE` ở `frontend/src/ui/Mascot.tsx` dòng 41 đến 58.

| Khoá | Bộ phận | Bản `solid` | Bản `muted` |
| :-- | :-- | :-- | :-- |
| `outer` | Lớp cánh ngoài của búp sen | `#35D0B6` | `#B8E8DE` |
| `inner` | Lớp cánh trong | `#5FE0C9` | `#D2F2EB` |
| `sprout` | Mầm nhú ở đỉnh búp | `#FF8A5B` | `#FFC7AC` |
| `face` | Nét mặt | `#0B2545` | `#5A7387` |
| `glint` | Điểm sáng | `#FFFFFF` | `#FFFFFF` |

Bản `solid` lấy thẳng bốn màu của bảng chung: `mint`, `mint-lift`, `coral` và
`ink`. Bản `muted` hạ bão hoà bốn màu đó, riêng `face` đổi sang `slate` để nét
mặt lùi lại cùng mức với phần còn lại. Khoá `glint` giống nhau ở cả hai bản.

Cả mười giá trị đều cố định, không lật theo chế độ sáng tối.

Bốn chỗ xuất hiện, và danh sách này là đóng:

1. Trang giới thiệu, chỗ duy nhất linh vật được phép lớn và vui
2. Mọi trạng thái rỗng, nơi màn hình không có gì và một khoảng trắng trơ trọi
   làm người dùng tưởng ứng dụng hỏng
3. Khối trạng thái `referral`, khi thư viện chưa có tài liệu; người hỏi không
   làm gì sai và hình phải nói ra điều đó
4. Khối chờ câu trả lời, chỗ duy nhất linh vật được phép chuyển động, và chỉ một
   kiểu là nhịp thở 2 giây biên độ 4,5 phần trăm

Hai chỗ cấm tuyệt đối: cạnh khối `red_flag` và cạnh khối `refused`. Lý do ghi
trong file: một khuôn mặt cười đứng cạnh dòng dấu hiệu này cần được khám ngay là
đùa cợt với người có thể đang nguy hiểm thật; đứng cạnh một lời từ chối thì
thành ra chế nhạo. Hai khối đó dùng biểu tượng nét.

Linh vật mang `aria-hidden` ở cả hai bản: nó không mang thông tin nào mà chữ bên
cạnh chưa nói.

Kích thước mặc định trong khối `referral` là 64px, chọn theo ràng buộc bố cục
trên máy 360px (`ui/ResponseStates.tsx`).

## 10. Hình minh hoạ và biểu tượng

### 10.1. Biểu tượng

23 hình vẽ thẳng bằng SVG ở `frontend/src/ui/icons.tsx`, không nạp thư viện
icon.

Quy ước vẽ, ghi ở đầu file:

- Khung `viewBox` 24 nhân 24
- Nét dày 2, `strokeLinecap` và `strokeLinejoin` đều là `round`
- Màu lấy theo `currentColor` của chữ, không tự đặt màu
- Mọi biểu tượng đều `aria-hidden="true"` và `focusable="false"`
- Cỡ đặt bằng class ở chỗ dùng, ví dụ `h-6 w-6`

Lý do nét dày 2 chứ không phải 1: nét mảnh kiểu 1px là thứ đầu tiên biến mất với
người 45 đến 70 tuổi.

Mọi biểu tượng luôn đi kèm nhãn chữ, hoặc nằm trong một nút đã có `aria-label`.

### 10.2. Hình minh hoạ

Ba hình ở `frontend/src/ui/illustrations/index.tsx`: `ReadingPerson`,
`DocumentStack`, `PhoneInHand`.

Bốn luật dựng hình, ghi ở đầu file:

1. Phẳng hoàn toàn. Không đổ bóng, không chuyển sắc, không viền mảnh. Mọi hình
   là một mảng màu đặc hoặc một nét dày. Nét mảnh và bóng nhạt là thứ đầu tiên
   biến mất với mắt 45 đến 70 tuổi
2. Là một vật sáng, đặt lên nền nào cũng được. Mảng giấy dùng trắng đặc và nét
   vẽ dùng navy, cả hai cố định không lật theo chế độ. Nếu để giấy đi theo
   `--color-surface` thì ở chế độ tối giấy thành navy và nét navy trên nó biến
   mất
3. Chỉ dùng mint, coral, sand, navy. Không thêm màu nào ngoài bảng, vì ba màu
   nhấn đã mang sẵn nghĩa trong sản phẩm
4. `aria-hidden`. Minh hoạ không mang thông tin nào mà chữ bên cạnh chưa nói

Bảng màu riêng của minh hoạ, cố định ở cả hai chế độ: navy `#0B2545`, mint
`#35D0B6`, mintSoft `#5FE0C9`, coral `#FF8A5B`, sand `#FFE3B8`, paper `#FFFFFF`.

Cấm đặt cạnh khối cảnh báo cấp cứu, cùng một luật với linh vật.

Khác biệt giữa minh hoạ và linh vật: Sen là nhân vật, có mặt, xuất hiện đúng ở
bốn chỗ đã liệt kê. Ba hình minh hoạ là minh hoạ nội dung, không có mặt mũi, và
luôn đứng cạnh một ý đang được nói bằng chữ.

### 10.3. Họa tiết nền

`frontend/src/ui/Backdrop.tsx`, hai bản theo họ nền:

- Bản `ink`: vòng tròn màu `ink-soft`, một dải cong, và lưới chấm 3 nhân 2. Dùng
  ở trang giới thiệu, nửa trái màn đăng nhập, tổng quan biên tập
- Bản `canvas`: vài hình khối rất nhạt dùng hai lớp voan `veil` và `veil-soft`

## 11. Khả năng tiếp cận

### 11.1. Vai trò ARIA đang dùng

Đếm trên toàn bộ `frontend/src/`:

| Vai trò | Số chỗ | Dùng ở đâu |
| :-- | :-- | :-- |
| `status` | 28 | Mọi thông báo trạng thái không cần ngắt lời: đang tải, đã sao chép, đã lưu, phiên hết hạn |
| `alert` | 11 | Chỉ hai loại được phép ngắt lời: khối `red_flag` và khối lỗi kỹ thuật, cộng thông báo lỗi của từng trường trong form |
| `button` | 5 | Phần tử không phải thẻ `button` nhưng hành xử như nút |
| `presentation` | 4 | Phần tử chỉ để dựng hình, không mang ngữ nghĩa |
| `group` | 4 | Nhóm nút lọc và nhóm ba nút chế độ hiển thị |
| `dialog` | 2 | Ngăn kéo thanh bên và lớp giọng nói |
| `tooltip` | 1 | Chú thích thuật ngữ y khoa |
| `region` | 1 | Vùng nội dung có nhãn riêng |
| `radio` | 1 | Ô chọn một trong nhiều |
| `img` | 1 | Hình có nghĩa cần đọc |

Nguyên tắc phân biệt `alert` với `status`, ghi ở `ui/ResponseStates.tsx`:
`alert` ngắt lời trình đọc màn hình để đọc ngay, `status` chờ đọc xong câu đang
đọc dở. Chỉ `red_flag` và khối lỗi kỹ thuật dùng `alert`.

### 11.2. Thuộc tính ARIA đang dùng

| Thuộc tính | Số chỗ | Vai trò |
| :-- | :-- | :-- |
| `aria-hidden` | 19 | Mọi biểu tượng, minh hoạ, linh vật, và lớp phủ của ngăn kéo |
| `aria-label` | 18 | Nhãn cho nút chỉ có biểu tượng, và nhãn cho nhóm |
| `aria-describedby` | 15 | Nối ô nhập với dòng gợi ý và dòng lỗi của nó |
| `aria-labelledby` | 13 | Nối một vùng với tiêu đề của nó |
| `aria-invalid` | 7 | Đánh dấu ô nhập đang có lỗi |
| `aria-live` | 4 | Vùng cập nhật động |
| `aria-current` | 4 | Mục điều hướng đang mở |
| `aria-pressed` | 3 | Nút lọc và nút chế độ hiển thị đang được chọn |
| `aria-expanded` | 2 | Nút mở đóng |
| `aria-disabled` | 2 | Nút bị chặn nhưng vẫn nhận được tiêu điểm bàn phím |
| `aria-modal` | 1 | Ngăn kéo thanh bên |
| `aria-haspopup` | 1 | Nút mở lớp phủ |
| `aria-controls` | 1 | Nối nút với vùng nó điều khiển |

`aria-disabled` thay cho `disabled` ở nút Duyệt trong `EditorItemScreen.tsx` là
có chủ ý: nút `disabled` bị bàn phím bỏ qua hoàn toàn, nên người dùng bàn phím
sẽ không bao giờ nghe được dòng giải thích vì sao nút chưa bấm được.

### 11.3. Bẫy tiêu điểm và khoá cuộn

`useFocusTrap` ở `frontend/src/ui/shellHooks.ts` dòng 116:

- Danh sách phần tử nhận được tiêu điểm gồm `a[href]`, `button` không bị vô hiệu,
  `input`, `select`, `textarea` không bị vô hiệu, và mọi phần tử có `tabindex`
  khác `-1`
- Tự đưa tiêu điểm vào phần tử đầu tiên khi mở
- Phím Tab và Shift Tab cuộn vòng trong vùng, không thoát ra ngoài
- Phím Escape đóng lớp phủ
- Khi đóng, tiêu điểm trả về đúng phần tử trước đó

`useScrollLock` ở dòng 92 khoá cuộn trang khi lớp phủ mở, và khôi phục đúng giá
trị `overflow` cũ khi đóng.

Cả hai dùng ở `SidebarDrawer` trong `ui/RootLayout.tsx`.

Lớp phủ tối phía sau ngăn kéo mang `aria-hidden="true"` vì đóng ngăn kéo đã có
hai đường chính thức là nút đóng và phím Escape; thêm một nút vô hình nữa chỉ
làm dài thêm danh sách của trình đọc màn hình.

### 11.4. Viền tiêu điểm

Khai ở `frontend/src/index.css` dòng 518 đến 523, áp cho `:focus-visible`:

- Nét ngoài 3px màu `mint`, cách 2px
- Quầng navy 7px, độ đặc 0.72

Nét 3px chứ không phải viền mặc định mảnh của trình duyệt, vì mắt lão thị không
bắt được nét 1px nhạt. Độ đặc quầng đặt 0.72 chứ không phải 0.55 vì ở 0.55 quầng
chỉ đạt 2.91:1 trên nền mint và 2.89:1 trên coral, đều dưới ngưỡng 3:1. Số liệu
đầy đủ ở mục 3.3.

### 11.5. Nhãn cho trình đọc màn hình

`sr-only` dùng ở tám chỗ, đều là chữ chỉ dành cho trình đọc:

| Chỗ | Nội dung |
| :-- | :-- |
| `ChatScreen.tsx:712` | `h1` ẩn "Hỏi đáp sức khỏe" khi màn chưa có tiêu đề câu hỏi nào |
| `AnswerDocument.tsx:204` | Đọc thêm "(nguồn n)" sau mỗi marker trích dẫn |
| `AnswerDocument.tsx:367,384` | Đọc thêm tên tài liệu sau số thứ tự nguồn, và báo liên kết mở ở tab mới |
| `ChatComposer.tsx:47` | Nhãn của ô nhập câu hỏi |
| `SourceDocumentScreen.tsx:135,167` | `caption` của bảng trong tài liệu nguồn |
| `QuizPanel.tsx:162` | Ô chọn đáp án |
| `ProfileScreen.tsx:374` | Ô chọn bệnh, ẩn để thay bằng thẻ lựa chọn lớn |

`ui/ContentHeader.tsx` dòng 31 đến 39 có xử lý riêng: khi sao chép hoặc lưu nội
dung, phần `sr-only` bị tắt tạm ngay trước khi đọc, để những chuỗi như "(nguồn
1)" không lọt vào bản chép.

### 11.6. Thứ tự tiêu đề

Toàn bộ `frontend/src/screens/` và `frontend/src/ui/` dùng 17 thẻ `h1`, 20 thẻ
`h2` và 5 thẻ `h3`. Không có thẻ `h4` tới `h6` nào ngoài hai khối markdown.

Quy ước: mỗi màn hình có đúng một `h1` của riêng nó. Thanh tiêu đề của khung
ngoài cố ý dùng thẻ `p` chứ không dùng `h1`, để không thành hai tiêu đề cấp một
trên cùng một trang (`ui/ContentHeader.tsx`).

Màn hỏi đáp khi chưa có lượt nào thì `h1` là một dòng `sr-only`; khi đã có lượt
thì chính câu hỏi của người dùng đóng vai `h1` (`ui/AnswerTurn.tsx`).

### 11.7. Giảm chuyển động

Hai lớp phòng vệ, khai ở `index.css` dòng 525 đến 580:

- Lớp lưới an toàn: trong `@media (prefers-reduced-motion: reduce)`, mọi hoạt
  ảnh và chuyển tiếp bị rút còn 0.01ms và chạy đúng một lần
- Lớp chính: hai lớp `.motion-lift` và `.motion-press` chỉ tồn tại bên trong
  `@media (prefers-reduced-motion: no-preference)`

Cần cả hai vì `transition-duration: 0` không cứu được một `transform`: nếu luật
`:hover { transform: translateY(-2px) }` vẫn tồn tại thì thẻ vẫn nhảy 2px, chỉ
là nhảy tức thì thay vì trượt.

### 11.8. Ngôn ngữ trang

`frontend/index.html` khai `<html lang="vi">`.

## 12. Ngôn ngữ và giọng văn

### 12.1. Xưng hô

Gọi người dùng là "bạn", tự xưng là "tôi" khi trợ lý nói. Ví dụ trong
`ChatScreen.tsx`: "Tôi đang tìm tài liệu phù hợp." và "Tôi sẽ chỉ dùng thông tin
có nguồn để trả lời bạn."

Không dùng "quý khách", không dùng "người dùng", không dùng ngôi thứ ba.

Tên ứng dụng là `EduHealth AI`, khai một chỗ duy nhất ở
`frontend/src/lib/appName.ts` để màn đăng nhập không phải kéo cả thanh bên vào
chỉ để lấy tên.

### 12.2. Cách viết thông báo lỗi

Khuôn ba phần, thấy rõ nhất ở `frontend/src/ui/ErrorNotice.tsx`:

1. Một tiêu đề nói chuyện gì đã xảy ra, viết ở thể khẳng định ngắn. Ví dụ:
   "Không kết nối được tới máy chủ", "Máy chủ trả lời quá lâu"
2. Một đoạn nói người dùng bây giờ phải làm gì, cụ thể tới mức bấm được. Ví dụ:
   "Máy của bạn đang không vào được mạng, nên câu hỏi chưa gửi đi được. Bạn hãy
   kiểm tra xem còn wifi hoặc còn 4G không, rồi bấm nút thử lại bên dưới."
3. Nút thử lại, và chỉ hiện ở những loại lỗi mà thử lại thực sự có cơ may thành
   công. Trường `retryable` trong `ADVICE` quyết định điều này

Lý do có phần 2, ghi trong file: `ApiError.userMessage` đã có sẵn câu tiếng Việt
nhưng nó mô tả chuyện gì đã xảy ra, còn người 45 đến 70 tuổi đang lo lắng cần
biết bây giờ phải làm gì.

Năm loại lỗi đều được phủ, và hai nửa 4xx với 5xx của loại `http` được tách
riêng vì chúng đòi hai hành động ngược nhau.

Quy ước khác về lỗi:

- Lỗi của một trường hiện ngay dưới trường đó, không gom về cuối form
  (`LoginScreen.tsx`, `ProfileScreen.tsx`)
- Lỗi đăng nhập không phân biệt "email không tồn tại" với "mật khẩu sai", và
  nói thẳng lý do: "Vì lý do an toàn, hệ thống không cho biết địa chỉ email này
  đã có tài khoản hay chưa." (`LoginScreen.tsx`)
- Thông báo trạng thái rỗng chỉ mô tả điều màn hình biết chắc, không suy diễn.
  Ví dụ ở `LearningLibraryScreen.tsx`: "Danh sách bài học trả về hiện không có
  mục nào." chứ không phải "Hệ thống đang chuẩn bị giáo trình."

### 12.3. Cách viết nhãn nút

Nhãn là một động từ kèm tân ngữ, nói đúng việc nút sẽ làm. Ví dụ đang dùng:
"Tải lên tài liệu", "Duyệt và bắt đầu index", "Gửi từ chối", "Thử lại index",
"Đọc bài này", "Bắt đầu làm bài", "Làm một bài trắc nghiệm", "Về hàng đợi",
"Khai hồ sơ".

Quy ước:

- Nút đang chạy đổi nhãn sang thể tiếp diễn kèm dấu ba chấm: "Đang tải lên…",
  "Đang đăng nhập…", "Đang gửi…", "Đang bắt đầu index…"
- Nhãn thử lại nói rõ thử lại cái gì, không dùng chữ "Thử lại" trơ: "Đăng nhập
  lại", "Gửi lại câu hỏi", "Mở lại hội thoại", "Đọc lại số liệu", "Tải lại tài
  liệu"
- Nút chỉ có biểu tượng luôn có `aria-label` là một câu đầy đủ
- Nhãn của ba nút chế độ hiển thị ngắn trên màn hình là "Sáng", "Tối", "Theo
  máy", còn `aria-label` dài hơn: "Dùng chế độ sáng", "Dùng chế độ tối", "Dùng
  chế độ theo cài đặt của máy" (`ui/theme.ts`)
- Nút gọi cấp cứu ghi rõ số: "Gọi cấp cứu 115" (`ui/ResponseStates.tsx`)

### 12.4. Giọng của các khối trạng thái

Ba khối trạng thái có ba giọng khác nhau, ghi ở `ui/ResponseStates.tsx`:

| Khối | Giọng | Ví dụ |
| :-- | :-- | :-- |
| `red_flag` | Ngắn, dứt khoát, có việc phải làm ngay | Tiêu đề "Dấu hiệu này cần được khám ngay" |
| `refused` | Giải thích vì sao, kèm việc cụ thể để làm tiếp, không phải giọng cấm đoán | Tiêu đề "Câu hỏi này phải do bác sĩ quyết định", kèm mục "Việc bạn có thể làm ngay" |
| `referral` | Trung tính, nói rõ người hỏi không làm gì sai | "Bạn không hỏi sai. Chủ đề này chỉ là chưa có trong thư viện tài liệu mà hệ thống được phép trích dẫn." |

Khối `refused` còn có một danh sách nói rõ hỏi lại thế nào thì trợ lý trả lời
được, gồm chế độ ăn, dấu hiệu cần chú ý, và cách sinh hoạt. Lý do ghi trong
file: người vừa bị từ chối mà không được nói cho biết vì sao, và không được chỉ
cho làm gì tiếp, thì sẽ đi hỏi chỗ khác.

## 13. Ghi chú bổ sung

### 13.1. Quan hệ với wireframe Gate 1

Ba bản vẽ ở `docs/gate1/wireframes/` là thiết kế ban đầu của giai đoạn Gate 1.
Giao diện đã phát triển tiếp từ đó, và tài liệu này mô tả trạng thái hiện tại
của sản phẩm.

### 13.2. Tương phản của hình minh hoạ

Ba hình trong `frontend/src/ui/illustrations/index.tsx` và linh vật Sen đều mang
`aria-hidden` và luôn đi kèm chữ giải thích ngay cạnh, nên chúng không thuộc
diện phải đạt ngưỡng tương phản của chữ hay của thành phần giao diện.

### 13.3. Điểm ngắt riêng của lớp giọng nói

Lớp giọng nói có đúng một media query theo bề ngang trong toàn bộ
`frontend/src/index.css`, đặt tại `max-width: 40rem`, tức 640px, trùng đúng điểm
ngắt `sm` của thang chung.

Con số phải gõ lại thay vì tham chiếu token vì media query không đọc được
`var()`: `@media (max-width: var(--breakpoint-rail))` là cú pháp không hợp lệ,
nên một khối CSS viết tay không thể lấy giá trị từ `@theme`. Cũng lưu ý trong
media query, đơn vị `rem` tính theo cỡ chữ khởi tạo 16px của trình duyệt chứ
không theo `html { font-size: 18px }` của dự án, nên 40rem ra đúng 640px. Đổi
điểm ngắt `sm` thì phải đổi cả con số này; có một dòng ghi chú nhắc điều đó ngay
trên media query.
