# CHECKLIST TRIỂN KHAI NHANH

## Cài một lần

- [ ] Dán đủ 5 tệp `.gs`, 1 tệp `Index.html`, 1 manifest.
- [ ] Kiểm tra số hỗ trợ trong `Config.gs`.
- [ ] Chạy `setupSystem()` và cấp quyền.
- [ ] Chạy `installCleanupTrigger()`.
- [ ] Deploy dạng Web app.
- [ ] Execute as: tài khoản triển khai.
- [ ] Access: Anyone.
- [ ] Lưu URL `/exec` vào nơi quản trị an toàn.
- [ ] Xác nhận Drive và Sheet không chia sẻ công khai.

## Khi App chính gặp sự cố

- [ ] Chạy `enableEmergencyMode()`.
- [ ] Thử gửi một hồ sơ kiểm tra bằng điện thoại.
- [ ] Đưa nút/link/QR dự phòng ra trang thông báo.
- [ ] Phân công cán bộ theo dõi Sheet.

## Khi App chính hoạt động lại

- [ ] Chạy `disableEmergencyMode()`.
- [ ] Đồng bộ từng hồ sơ vào App chính.
- [ ] Đánh dấu `ĐÃ ĐỒNG BỘ` trong Sheet.
- [ ] Rà soát hồ sơ trùng và hồ sơ cần liên hệ.
- [ ] Thực hiện lưu/xóa dữ liệu theo quy trình của đơn vị.
