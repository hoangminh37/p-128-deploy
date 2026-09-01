# Nhật ký tuần EduHealth AI

Nhật ký này ghi lại quá trình phát triển từ ngày 24 tháng 7 năm 2026 đến ngày
1 tháng 9 năm 2026. Nội dung được đối chiếu với lịch sử Git và chỉ ghi nhận
những công việc có bằng chứng trong repository.

## Tuần 1 từ ngày 24 tháng 7 đến ngày 30 tháng 7 năm 2026

Nhóm khởi tạo repository từ template của chương trình. Nền tảng ban đầu đã có
mã nguồn, cấu trúc kiểm thử, evaluation, Docker và cấu hình CI. Nhóm cũng kiểm
thử hook ghi AI log để lưu lại quá trình làm việc với trợ lý AI. Các mốc Git
tiêu biểu là 63d145a và 7ab81c6.

Kết thúc tuần đầu, dự án có môi trường làm việc chung và có cách ghi nhận quá
trình phát triển.

## Tuần 2 từ ngày 31 tháng 7 đến ngày 6 tháng 8 năm 2026

Nhóm hoàn thiện luồng giao diện và wireframe cho bệnh nhân cùng biên tập viên
y khoa. Project Brief và PRD Gate 1 được viết để xác định vấn đề, người dùng,
phạm vi và các ràng buộc an toàn. Trong giai đoạn này, nhóm thống nhất ba nguyên
tắc quan trọng là câu trả lời cần có nguồn, cần phù hợp với thông tin bệnh nhân
và không được chẩn đoán hoặc kê đơn. Các mốc Git tiêu biểu là 12074c2, a479d5c,
b460b7e, a141ad9 và 25dce9e.

Kết thúc tuần thứ hai, nhóm có định nghĩa sản phẩm và nền tảng thiết kế để bắt
đầu phát triển hệ thống.

## Tuần 3 từ ngày 7 tháng 8 đến ngày 13 tháng 8 năm 2026

Nhóm xây kiến trúc ban đầu, API contract, schema và API client. Frontend được
khởi tạo bằng Vite, React, TypeScript và Tailwind. Các màn hình chat, hồ sơ và
điều hướng cơ bản được hình thành để frontend và backend có thể phát triển song
song. Nhóm cũng bổ sung bộ test RAGAS, đánh giá bằng mô hình ngôn ngữ và chỉnh
lại typing cùng CI. Các mốc Git tiêu biểu là 1c5f75a, 608fa0d, 112b8d5,
a81e03f, 32b69fd, 01193f9, 32b2a6b, 0306b58, d549c50, e7da0e9 và cc397b5.

Kết thúc tuần thứ ba, dự án có contract chung và nền giao diện đủ để triển khai
chức năng thực tế.

## Tuần 4 từ ngày 14 tháng 8 đến ngày 20 tháng 8 năm 2026

Nhóm hoàn thiện phiên bản MVP cho hỏi đáp sức khỏe. Backend FastAPI, LangGraph,
RAG, Chroma và cơ chế dùng SQLite hoặc PostgreSQL được kết nối thành một luồng
hoạt động. JWT, phân quyền theo vai trò, hàng chờ của biên tập viên, red flag,
chống prompt injection và luồng chuyển bệnh nhân sang bác sĩ cũng được bổ sung.

Song song với phần hỏi đáp, nhóm thêm thư viện học tập, cơ chế tích điểm và
trắc nghiệm. Nền tảng Railway và Docker được đưa vào repository để chuẩn bị
triển khai. Các mốc Git tiêu biểu là 1945774, e0f3d04, ea7c5c7, a717e7f,
8e2d39b, 7c012ba, 43dbe9e, 75d17c1 và 7b8660d.

Kết thúc tuần thứ tư, người bệnh có thể dùng luồng hỏi đáp có nguồn, hệ thống
có guardrail và biên tập viên có thể quản lý nội dung y khoa.

## Tuần 5 từ ngày 21 tháng 8 đến ngày 27 tháng 8 năm 2026

Nhóm củng cố khả năng triển khai bằng Caddy, auto seed và CI deploy Railway.
Giao diện được thiết kế lại với hệ màu chung, dark mode và trang giới thiệu.
Nhóm bổ sung cơ chế dự phòng giữa nhiều nhà cung cấp mô hình ngôn ngữ, xử lý
tương thích SQLite và chuẩn bị sẵn vector store.

Agent được cải thiện bằng routine memory, điều chỉnh LangGraph để giảm độ trễ
và bổ sung tính năng giải thích thuật ngữ y khoa. Các mốc Git tiêu biểu là
ed9b4c0, 29ed260, 4069b67, a669b00, bb3727f, 646c461, 7dccd7b, 711e352,
d426016 và 4d96132.

Kết thúc tuần thứ năm, hệ thống có giao diện đồng nhất hơn, khả năng triển khai
tốt hơn và câu trả lời có thêm ngữ cảnh cá nhân của bệnh nhân.

## Tuần 6 từ ngày 28 tháng 8 đến ngày 1 tháng 9 năm 2026

Nhóm phát triển voice chat, khả năng xem tài liệu nguồn và cải thiện quy trình
tài liệu. Kho tri thức được mở rộng để dùng Chroma khi chạy cục bộ và pgvector
khi triển khai PostgreSQL. Quy trình embedding có thêm migration, retry,
rate limit và cập nhật evaluation RAGAS.

Vai trò bác sĩ được bổ sung cùng tư vấn bằng tin nhắn, thông báo, WebRTC
signalling và gọi video. Biên tập viên có thể quản lý bác sĩ và trả lời trực
tiếp những câu hỏi người bệnh chưa được thư viện giải đáp. Cuối tuần, nhóm cải
thiện giao diện gọi video trên các thiết bị và cập nhật benchmark baseline. Các
mốc Git tiêu biểu là 9e96780, 792aa05, b02350a, 2c145e6, e597fb6, 7903b90,
cb337f2, c231c36, 646c84b, 8f6511a và a6060cd.

Kết thúc tuần thứ sáu, sản phẩm hỗ trợ ba vai trò, có RAG dùng được trong hai
môi trường dữ liệu, voice chat, tư vấn trực tiếp và nền tảng đánh giá ban đầu.

## Cách dùng nhật ký này

Nhật ký tuần là bản tóm tắt về tiến độ. JOURNAL ở thư mục gốc giữ phiên bản
ngắn hơn để đáp ứng vị trí deliverable của chương trình. WORKLOG ghi công việc
theo ngày. Kiến trúc hiện tại được mô tả trong ARCHITECTURE và sơ đồ kiến trúc.

Khi đánh giá lại hệ thống, số liệu về chất lượng RAG và độ trễ cần luôn đi cùng
commit, model, embedding model, registry tài liệu và cấu hình môi trường. Lịch
sử Git giúp xác nhận thay đổi mã nguồn, nhưng không thay thế cho đánh giá lâm
sàng, kiểm thử tải hoặc đánh giá RAG trên dữ liệu thực tế.

