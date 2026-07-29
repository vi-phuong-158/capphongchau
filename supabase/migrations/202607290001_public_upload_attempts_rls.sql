-- Telemetry tải ảnh chỉ được ghi qua repository server-side.
-- Không có policy public; anon/authenticated không được đọc hay ghi trực tiếp.
--
-- CỐ Ý KHÔNG dùng `force row level security`, dù bản nháp đầu của migration này có dùng.
--
-- `force` bắt RLS áp cả lên chủ sở hữu bảng. Bảng không có policy nào, nên với bất kỳ role nào
-- không mang thuộc tính BYPASSRLS thì **mọi** lệnh insert đều trả về 0 dòng. Cả hai chỗ gọi
-- `appendUploadAttempt` đều bọc `.catch(...)` vì số đo là việc phụ — nghĩa là nếu role kết nối
-- không có BYPASSRLS thì bảng này sẽ rỗng vĩnh viễn mà không có một dòng log nào báo. Đúng cái
-- bảng được dựng để nghiệm thu ngưỡng hiệu năng và để mở cờ chuẩn hóa ảnh.
--
-- `enable` + `revoke` (không `force`) là đúng mô hình đe dọa ở đây và là mẫu đang dùng cho cả 8
-- bảng còn lại trong `supabase/migrations/` (xem 202607230001, 202607250002, 202607250005,
-- 202607260001): chặn anon/authenticated bằng cả RLS lẫn quyền cấp, còn đường ghi hợp lệ duy nhất
-- là repository chạy trên máy chủ. Giữ đúng một bảng lệch mẫu là cách chắc chắn để sau này không
-- ai nhớ vì sao nó khác.
alter table public.public_upload_attempts enable row level security;

revoke all on table public.public_upload_attempts from anon, authenticated;
