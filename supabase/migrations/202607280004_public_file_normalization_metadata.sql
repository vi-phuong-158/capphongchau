-- Public Intake V2 — dấu vết chuẩn hóa ảnh trên từng tệp đã nhận.
--
-- Vì sao cần: sau khi bật chuẩn hóa, tệp nằm trong `01_INBOX/{id}/originals` **không còn chắc
-- chắn là byte gốc từ máy ảnh** — nó là bản tiếp nhận vận hành. Nếu về sau có tranh chấp về chất
-- lượng ảnh ("chữ trên bìa mờ quá không đọc được"), phải trả lời được ngay: tệp này đã bị thu nhỏ
-- chưa, từ kích thước nào xuống kích thước nào, bằng phiên bản tham số nào.
--
-- Tên thư mục `originals` giữ nguyên: đổi tên thư mục Drive sẽ phá các đường dẫn đang dùng, mà
-- lợi ích chỉ là chính xác về câu chữ. Sự thật được ghi ở đây và ở `docs/brain/03-decisions.md`.
--
-- Additive, toàn bộ nullable trừ cột phiên bản có mặc định rỗng. Tệp nhận trước migration này để
-- null — nghĩa là "không biết", không phải "không chuẩn hóa"; báo cáo phải lọc bỏ chúng chứ không
-- được coi tỷ lệ nén bằng 1.

alter table public.public_files
  add column if not exists source_size_bytes bigint,
  add column if not exists source_mime_type text,
  add column if not exists source_width integer,
  add column if not exists source_height integer,
  add column if not exists upload_width integer,
  add column if not exists upload_height integer,
  add column if not exists normalization_version text not null default '';

comment on column public.public_files.source_size_bytes is
  'Dung lượng tệp trên thiết bị TRƯỚC khi chuẩn hóa, do client báo. Null với tệp nhận trước '
  '2026-07-28 hoặc khi client không gửi số đo. Không dùng thay cho size_bytes đã xác minh.';
comment on column public.public_files.normalization_version is
  'Phiên bản tham số chuẩn hóa (ví dụ intake-v2-1). Rỗng nghĩa là không rõ hoặc không chuẩn hóa.';
