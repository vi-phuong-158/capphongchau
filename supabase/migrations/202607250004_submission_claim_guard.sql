-- Migration bổ sung thông tin trả lại hàng chờ và index cho queue công khai
alter table public.public_submissions
  add column if not exists claim_released_at timestamptz,
  add column if not exists claim_note        text not null default '';

create index if not exists public_submissions_open_queue_idx
  on public.public_submissions (status, updated_at desc)
  where status in ('SUBMITTED','RESUBMITTED');
