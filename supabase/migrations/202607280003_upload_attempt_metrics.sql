-- Public Intake V2 — số liệu hiệu năng tải ảnh.
--
-- Vì sao cần bảng riêng: góp ý đầu tiên của cán bộ đi thu hồ sơ là "up ảnh lâu quá". Sau khi đã
-- chuẩn hóa ảnh và mở hàng đợi hai luồng, câu hỏi "có nhanh hơn thật không, nhanh hơn bao nhiêu"
-- không trả lời được bằng cảm nhận. Bảng này là **nguồn số liệu duy nhất** để nghiệm thu ngưỡng
-- hiệu năng, và cũng là điều kiện để được phép bật cờ chuẩn hóa ảnh cho người dân.
--
-- Vì sao KHÔNG lưu vào `public_files`: một lần tải có thể thất bại, bị hủy hoặc thử lại nhiều
-- lượt mà không sinh ra file nào. Gắn số đo vào bảng file thì đúng những lần chậm nhất — tức là
-- những lần cần đo nhất — lại không có chỗ để ghi.
--
-- KHÔNG có trong bảng này, và không được thêm về sau: số CCCD, họ tên, số điện thoại, tên tệp
-- gốc, user agent thô, Drive file ID, URL phiên upload, địa chỉ IP. Bảng này để đo đường truyền,
-- không phải để lần ra người dân. `submission_id` là khóa duy nhất nối được sang hồ sơ, và nó có
-- `on delete cascade` nên xóa hồ sơ là số đo đi theo.

create table if not exists public.public_upload_attempts (
  attempt_id uuid primary key,
  submission_id text not null
    references public.public_submissions(submission_id) on delete cascade,
  document_type text not null,
  outcome text not null,
  source_size_bytes bigint not null,
  upload_size_bytes bigint not null,
  prepare_duration_ms integer not null,
  initiate_duration_ms integer not null,
  upload_duration_ms integer not null,
  complete_duration_ms integer not null,
  retry_count integer not null default 0,
  client_platform text not null default 'unknown',
  effective_connection_type text not null default 'unknown',
  normalization_version text not null default '',
  failure_stage text not null default '',
  failure_code text not null default '',
  created_at timestamptz not null default now(),

  constraint public_upload_attempts_document_type_check
    check (document_type in ('CITIZEN_ID_FRONT', 'CITIZEN_ID_BACK', 'CERTIFICATE')),
  constraint public_upload_attempts_outcome_check
    check (outcome in ('COMPLETED', 'FAILED', 'CANCELLED')),
  constraint public_upload_attempts_platform_check
    check (client_platform in ('android', 'ios', 'desktop', 'unknown')),
  constraint public_upload_attempts_connection_check
    check (effective_connection_type in ('slow-2g', '2g', '3g', '4g', 'unknown')),
  -- Chặn số rác làm hỏng P95: một giá trị âm hay 10^9 ms lọt vào là mọi biểu đồ sau đó vô nghĩa.
  constraint public_upload_attempts_duration_check
    check (
      prepare_duration_ms between 0 and 900000
      and initiate_duration_ms between 0 and 900000
      and upload_duration_ms between 0 and 900000
      and complete_duration_ms between 0 and 900000
    ),
  constraint public_upload_attempts_size_check
    check (source_size_bytes between 0 and 268435456 and upload_size_bytes between 0 and 268435456),
  constraint public_upload_attempts_retry_check
    check (retry_count between 0 and 100)
);

comment on table public.public_upload_attempts is
  'Số đo mỗi lượt tải ảnh của cổng công khai. KHÔNG chứa PII: không CCCD, họ tên, điện thoại, '
  'tên tệp gốc, user agent thô, Drive ID, URL upload hay IP. Retention 90 ngày (chưa có job tự '
  'xóa — xóa thủ công theo quy trình đã duyệt).';

create index if not exists public_upload_attempts_created_idx
  on public.public_upload_attempts (created_at desc);
create index if not exists public_upload_attempts_type_outcome_idx
  on public.public_upload_attempts (document_type, outcome, created_at desc);
create index if not exists public_upload_attempts_submission_idx
  on public.public_upload_attempts (submission_id);
