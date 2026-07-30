# WEB APP KÊ KHAI HỒ SƠ ĐẤT ĐAI DỰ PHÒNG

Dành cho UBND phường Phong Châu, sử dụng khi App kê khai chính gặp sự cố.

## 1. Chức năng đã có

- Không bắt người dân đăng nhập Google.
- Bắt đầu bằng cặp ảnh CCCD mặt trước/mặt sau, rồi tự thử đọc QR từ cả hai ảnh ngay trên thiết bị.
- Tự điền gợi ý họ tên, số CCCD và địa chỉ khi QR hợp lệ; người dân vẫn kiểm tra, sửa hoặc nhập tay khi QR lỗi.
- Nhập số điện thoại, số lượng GCN và ghi chú sau bước quét QR.
- Nhận từ 1 đến 5 GCN trong một lượt; mỗi GCN nhận nhiều ảnh.
- Tự nén ảnh trên điện thoại trước khi tải lên.
- Mỗi ảnh được tải riêng, có thể tiếp tục khi mạng chập chờn.
- Tạo mã hồ sơ dạng `DP-YYYYMMDD-0001`.
- Tạo thư mục riêng theo ngày và theo mã hồ sơ.
- Ghi danh sách hồ sơ vào Google Sheet và nhật ký từng tệp.
- Kiểm tra định dạng thật của ảnh JPG, PNG, WEBP, HEIC, AVIF.
- Tự đổi tên tệp; không sử dụng tên tệp do người dân gửi.
- Giới hạn số lượt gửi theo số điện thoại và thiết bị.
- Có chế độ bật/tắt kênh dự phòng.
- Có hàm tự dọn hồ sơ tải dở quá 24 giờ.

QR dùng đúng `@zxing/browser` 0.1.5 như App chính. Apps Script chỉ nạp runtime này động tại trình
duyệt vì HtmlService không nhận tệp JavaScript thuần như một partial HTML. Ảnh CCCD và payload QR chỉ
được xử lý trong trình duyệt để gợi ý điền biểu mẫu; không gọi Apps Script khi quét và không ghi
payload QR vào Drive, Sheet hoặc log.

## 2. Các tệp trong bộ mã

- `Config.gs`: tên đơn vị, số hỗ trợ, giới hạn và cấu hình.
- `Code.gs`: Web App và các hàm tiếp nhận hồ sơ.
- `Security.gs`: kiểm tra dữ liệu, ảnh và phiên tải.
- `Storage.gs`: lưu Google Drive, Google Sheet.
- `Admin.gs`: cài đặt, bật/tắt, dọn dữ liệu tải dở.
- `Index.html`: toàn bộ giao diện dùng trên điện thoại.
- `appsscript.json`: quyền và cấu hình dự án Apps Script.

## 3. Cài đặt lần đầu

### Bước 1 — Tạo dự án Apps Script

1. Mở Google Drive bằng tài khoản công vụ dùng để quản lý dữ liệu.
2. Chọn **Mới → Ứng dụng khác → Google Apps Script**.
3. Đặt tên dự án: `Kê khai dự phòng Phong Châu`.

### Bước 2 — Tạo đúng các tệp

Trong trình biên tập Apps Script:

1. Xóa nội dung mẫu trong `Code.gs`.
2. Tạo và dán lần lượt các tệp:
   - `Config.gs`
   - `Code.gs`
   - `Security.gs`
   - `Storage.gs`
   - `Admin.gs`
   - `Index.html` — phải chọn loại **HTML**.
3. Mở **Project Settings** và bật **Show "appsscript.json" manifest file in editor**.
4. Dán nội dung tệp `appsscript.json`.

### Bước 3 — Kiểm tra cấu hình

Mở `Config.gs` và kiểm tra:

```javascript
SUPPORT_OFFICER: 'Hoàng Thanh Sơn',
SUPPORT_PHONE: '0962570935',
```

Muốn tạo dữ liệu bên trong một thư mục Drive có sẵn, lấy ID thư mục và điền:

```javascript
ROOT_PARENT_FOLDER_ID: 'ID_THU_MUC_DRIVE',
```

Nếu để trống, hệ thống tạo thư mục trong **My Drive**.

### Bước 4 — Khởi tạo kho dữ liệu

1. Ở danh sách hàm phía trên trình biên tập, chọn `setupSystem`.
2. Bấm **Run**.
3. Chấp nhận quyền truy cập Drive và Google Sheets bằng tài khoản quản lý.
4. Sau khi chạy xong, chọn `getSystemInfo` rồi bấm **Run**.
5. Mở **Execution log** để lấy:
   - `rootFolderUrl`
   - `spreadsheetUrl`

Không chia sẻ công khai hai đường dẫn này.

### Bước 5 — Cài lịch dọn hồ sơ tải dở

1. Chọn hàm `installCleanupTrigger`.
2. Bấm **Run** một lần.

Hệ thống sẽ kiểm tra hằng ngày và đưa vào thùng rác các thư mục tải dở quá 24 giờ.

### Bước 6 — Triển khai Web App

1. Chọn **Deploy → New deployment**.
2. Loại triển khai: **Web app**.
3. Description: `Production v1`.
4. **Execute as:** `Me` / tài khoản triển khai.
5. **Who has access:** `Anyone` — bao gồm người chưa đăng nhập.
6. Bấm **Deploy** và sao chép URL kết thúc bằng `/exec`.

Luôn thử URL bằng cửa sổ ẩn danh và điện thoại không đăng nhập Google.

### Bước 7 — Bật chế độ dự phòng

Sau khi kiểm thử xong:

1. Chọn hàm `enableEmergencyMode`.
2. Bấm **Run**.
3. Mở lại URL `/exec`.

Khi App chính hoạt động trở lại, chạy:

```javascript
disableEmergencyMode()
```

Link vẫn tồn tại nhưng chỉ hiện thông báo hệ thống chưa mở.

## 4. Quy trình vận hành khi App chính lỗi

1. Cán bộ chạy `enableEmergencyMode()`.
2. Kiểm tra URL bằng điện thoại.
3. Đưa nút **Kê khai dự phòng** hoặc mã QR ra trang thông báo.
4. Theo dõi Sheet `HO_SO_DU_PHONG`.
5. Mở thư mục hồ sơ bằng cột **Thư mục hồ sơ**.
6. Nhập dữ liệu vào App chính khi App hoạt động lại.
7. Đổi cột **Trạng thái đồng bộ** thành `ĐÃ ĐỒNG BỘ`.
8. Chạy `disableEmergencyMode()` khi hết sự cố.

## 5. Cấu trúc dữ liệu được tạo

```text
HỒ SƠ KÊ KHAI DỰ PHÒNG - PHONG CHÂU/
├── DANH SÁCH HỒ SƠ KÊ KHAI DỰ PHÒNG (Google Sheet)
├── 00_HUONG_DAN_QUAN_TRI.txt
└── 2026-07-30/
    └── DP-20260730-0001_NGUYEN-VAN-A/
        ├── DP-20260730-0001_CCCD_MAT_TRUOC.jpg
        ├── DP-20260730-0001_CCCD_MAT_SAU.jpg
        ├── DP-20260730-0001_GCN_01_ANH_01.jpg
        ├── DP-20260730-0001_GCN_01_ANH_02.jpg
        └── THONG_TIN_HO_SO.txt
```

## 6. Bảo vệ dữ liệu

- Không đặt thư mục gốc hoặc Sheet ở chế độ **Anyone with the link**.
- Chỉ cấp quyền cho cán bộ thực sự xử lý hồ sơ.
- Không gửi link thư mục Drive cho người kê khai.
- Chỉ công bố URL Web App `/exec`.
- Không sử dụng bản triển khai `/dev` cho người dân.
- Không đưa URL Web App vào tin nhắn không rõ nguồn gốc; ưu tiên mở từ trang chính hoặc QR của đơn vị.
- Định kỳ rà soát và xóa dữ liệu không còn cần lưu theo quy trình của đơn vị.

## 7. Kiểm thử bắt buộc trước khi dùng thật

- [ ] Mở được bằng cửa sổ ẩn danh, không yêu cầu đăng nhập Google.
- [ ] Khi tắt chế độ dự phòng, link chỉ hiện thông báo chưa mở.
- [ ] Khi bật, nhập và gửi được một hồ sơ thử.
- [ ] Thiếu CCCD mặt trước hoặc mặt sau thì không gửi được.
- [ ] Chọn ảnh CCCD mặt trước hoặc mặt sau có QR hợp lệ: họ tên, số CCCD và địa chỉ được gợi ý ở bước tiếp theo.
- [ ] QR không đọc được, ảnh xoay hoặc thư viện QR không tải được: vẫn có thể nhập tay và gửi hồ sơ.
- [ ] Sửa tay thông tin sau khi quét, rồi chọn lại ảnh CCCD: dữ liệu đã sửa không bị QR ghi đè.
- [ ] Mỗi GCN thiếu ảnh thì không gửi được.
- [ ] Ảnh được lưu đúng thư mục và đúng tên.
- [ ] Sheet có đủ mã hồ sơ, thông tin, link thư mục, số ảnh.
- [ ] Thư mục và Sheet không được chia sẻ công khai.
- [ ] Thử tắt mạng giữa lúc tải, bật lại và gửi tiếp.
- [ ] Chạy `cleanupAbandonedSubmissions()` thử với hồ sơ tải dở.
- [ ] Kiểm tra số điện thoại hỗ trợ hiển thị đúng.

## 8. Cập nhật phiên bản sau khi sửa mã

Mỗi khi sửa mã:

1. Chọn **Deploy → Manage deployments**.
2. Chọn deployment hiện tại → biểu tượng **Edit**.
3. Chọn **New version**.
4. Bấm **Deploy**.

URL `/exec` cũ được giữ nguyên.

## 9. Tích hợp vào App chính

Không nhúng bằng iframe. Chỉ mở Web App ở tab mới khi có sự cố:

```html
<a href="URL_WEB_APP_EXEC" target="_blank" rel="noopener noreferrer">
  Kê khai dự phòng
</a>
```

Nên lưu URL trong biến môi trường hoặc cấu hình quản trị để có thể bật nút mà không sửa sâu giao diện.
