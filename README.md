# HRM Pro – Web quản lý nhân sự cơ bản

Ứng dụng cần Node.js và MySQL Server. Mã nguồn được chia theo nhiệm vụ:

- `Backend/`: HTTP API, xử lý nhận diện, mã hóa mẫu khuôn mặt và truy cập MySQL
- `database/`: SQL khởi tạo cấu trúc MySQL
- `frontend/`: giao diện HTML/CSS/JavaScript
- `package.json`, `.env`: lệnh chạy và cấu hình riêng ở thư mục gốc

Tính năng đã có:

- Đăng nhập, đăng xuất, tạo tài khoản, quên mật khẩu (mô phỏng gửi hướng dẫn)
- Trang tổng quan và thống kê nhân sự
- Danh sách, tìm kiếm, lọc phòng ban và thêm nhân viên
- Đăng ký mẫu khuôn mặt có sự đồng ý, mã hóa mẫu bằng AES-256-GCM và nhận diện để chấm công; ảnh gốc không được lưu
- Chấm công thủ công vẫn có sẵn khi không dùng được nhận diện
- Bảng chấm công trong ngày và cài đặt giờ vào ca
- Cài đặt giờ bắt đầu ca và thời gian ân hạn để tự phân loại đi trễ
- Nhân viên và chấm công được lưu trong MySQL; cài đặt ca và tài khoản demo vẫn lưu trong trình duyệt

Để dùng camera, hãy cấp quyền truy cập khi trình duyệt yêu cầu. Mở ứng dụng qua địa chỉ `localhost` do backend cung cấp, không mở `index.html` trực tiếp.

Tài khoản demo: `admin@hrm.vn` / `123456`.

## Khởi tạo MySQL

1. Mở `database/hrm_schema.sql` trong MySQL Workbench và chạy script để tạo database `HRM_Pro` cùng các bảng nhân viên, mẫu khuôn mặt và chấm công. Script không xóa database hoặc bảng hiện có.
2. Sao chép `.env.example` thành `.env`, điền mật khẩu MySQL cục bộ vào `DB_PASSWORD` và tạo khóa mã hóa riêng bằng `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, sau đó đặt kết quả vào `FACE_ENCRYPTION_KEY`. Không chia sẻ hoặc commit file `.env`; sao lưu khóa an toàn vì mất khóa đồng nghĩa không giải mã được mẫu đã lưu.
3. Trong thư mục gốc dự án, chạy `npm install`, sau đó `npm start`. Lệnh khởi chạy `Backend/server.js` và backend phục vụ giao diện từ `frontend/`.
4. Mở `http://127.0.0.1:3000`. Backend sẽ kết nối MySQL tại `127.0.0.1:3306`; sửa `DB_HOST`/`DB_PORT` trong `.env` nếu cấu hình Workbench của bạn khác.

Bảng nhân viên, chấm công và mẫu khuôn mặt được đọc/ghi qua backend vào MySQL. Mẫu khuôn mặt được mã hóa ở server, ảnh gốc không được lưu; đăng ký chỉ bật camera sau khi nhân viên xác nhận đồng ý và mẫu tự hết hạn sau một năm. Có thể xóa mẫu trong danh sách nhân viên.

Đây là bản thử nghiệm trên một máy: chưa có kiểm tra người thật/chống giả mạo ảnh hoặc video, chưa có đăng nhập và phân quyền API ở backend. Không dùng cho chấm công chính thức hoặc mở server ra mạng công cộng; hãy tiếp tục cung cấp chấm công thủ công.
