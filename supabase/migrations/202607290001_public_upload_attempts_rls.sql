-- Telemetry tải ảnh chỉ được ghi qua repository server-side.
-- Không có policy public; anon/authenticated không được đọc hay ghi trực tiếp.
alter table public.public_upload_attempts enable row level security;
alter table public.public_upload_attempts force row level security;

revoke all on table public.public_upload_attempts from anon, authenticated;
