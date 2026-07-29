-- Public Intake V2 — hiển thị TÊN cán bộ tiếp nhận, không chỉ email.
--
-- Câu hỏi của cán bộ đi thu hồ sơ: "Cán bộ tiếp nhận là ai?". Trước migration này hệ thống chỉ
-- lưu `claimed_by` là email đăng nhập. Màn hình quản trị hiện email, còn trang tra cứu công khai
-- thì không hiện gì — người dân không biết ai đang xử lý hồ sơ của mình.
--
-- Vì sao lưu tên tại thời điểm nhận thay vì join sang `public.users` mỗi lần đọc:
--   1. Tên hiển thị đổi được (đổi họ tên, sửa chính tả). Dòng thời gian phải ghi tên **lúc đó**,
--      giống mọi bản ghi hành chính khác.
--   2. Cán bộ nghỉ việc thì bản ghi `users` có thể bị vô hiệu hóa, join sẽ trả rỗng và lịch sử
--      hồ sơ mất dấu người từng xử lý.
--
-- Additive: chỉ thêm cột nullable, không đổi và không xóa cột nào. Rollback là bỏ cột.
-- Hồ sơ cũ để null; giao diện tự lùi về email (quản trị) hoặc "Đã phân công cán bộ" (công khai).

alter table public.public_submissions
  add column if not exists claimed_by_display_name text;

comment on column public.public_submissions.claimed_by_display_name is
  'Tên hiển thị của cán bộ tại thời điểm nhận xử lý. Null với hồ sơ nhận trước 2026-07-28. '
  'KHÔNG bao giờ trả email cán bộ ra cổng công khai — chỉ trả cột này.';
