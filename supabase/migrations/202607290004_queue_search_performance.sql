-- Phase 1 tối ưu hàng chờ cán bộ:
-- - tách hai trường hiển thị/tìm kiếm khỏi draft_json thành generated columns;
-- - phân trang keyset theo (updated_at, submission_id);
-- - hỗ trợ tìm chứa chuỗi bằng pg_trgm mà không đọc toàn bộ draft_json vào Node.
--
-- Migration additive và idempotent. Phải áp migration trước khi deploy code gọi listQueuePage().

create extension if not exists pg_trgm with schema extensions;

alter table public.public_submissions
  add column if not exists queue_owner_name text
    generated always as (
      coalesce(draft_json #>> '{owners,0,fullName}', '')
    ) stored,
  add column if not exists queue_issue_number text
    generated always as (
      coalesce(draft_json #>> '{certificate,issueNumber}', '')
    ) stored;

create index if not exists public_submissions_queue_page_idx
  on public.public_submissions (status, updated_at desc, submission_id desc);

create index if not exists public_submissions_queue_all_page_idx
  on public.public_submissions (updated_at desc, submission_id desc);

create index if not exists public_submissions_queue_receipt_trgm_idx
  on public.public_submissions using gin ((receipt_code::text) extensions.gin_trgm_ops);

create index if not exists public_submissions_queue_issue_trgm_idx
  on public.public_submissions using gin (queue_issue_number extensions.gin_trgm_ops);

create index if not exists public_submissions_queue_owner_trgm_idx
  on public.public_submissions using gin (queue_owner_name extensions.gin_trgm_ops);
