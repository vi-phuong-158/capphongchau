-- AI hỗ trợ chỉ tạo dự thảo cho cán bộ duyệt. Không lưu ảnh mới và không có đường
-- nào từ bảng này ghi thẳng vào hồ sơ chính thức.

alter table public.ai_extraction_jobs
  alter column submission_id drop not null,
  add column if not exists subject_type text not null default 'PUBLIC_SUBMISSION'
    check (subject_type in ('PUBLIC_SUBMISSION', 'CASE')),
  add column if not exists case_id text references public.cases(case_id),
  add column if not exists input_files_json jsonb not null default '[]'::jsonb,
  add column if not exists manifest_version text not null default 'v1.0',
  add column if not exists station_access_risk text not null default 'ADMIN_BROAD_ACCESS'
    check (station_access_risk in ('ADMIN_BROAD_ACCESS'));

alter table public.ai_extraction_jobs
  add constraint ai_extraction_jobs_one_subject_check
  check (num_nonnulls(submission_id, case_id) = 1);

alter table public.public_owners
  add column if not exists identity_override_reason text not null default '';

create index if not exists ai_extraction_jobs_subject_queue_idx
  on public.ai_extraction_jobs (submission_id, status, created_at desc)
  where submission_id is not null;

create table if not exists public.ai_extraction_job_files (
  job_id text not null references public.ai_extraction_jobs(job_id),
  file_id text not null,
  checksum_sha256 text not null,
  file_name text not null default '',
  ordinal integer not null check (ordinal >= 0),
  primary key (job_id, file_id),
  unique (job_id, ordinal)
);

create table if not exists public.ai_field_comparisons (
  comparison_id uuid primary key default gen_random_uuid(),
  job_id text not null references public.ai_extraction_jobs(job_id),
  result_id text not null references public.ai_extraction_results(result_id),
  field_path text not null,
  current_value text not null default '',
  ai_value text,
  source_value text,
  field_status text not null check (field_status in ('CLEAR', 'CHECK', 'MANUAL_REQUIRED')),
  evidence_json jsonb not null default '{}'::jsonb,
  decision text not null default 'PENDING'
    check (decision in ('PENDING', 'APPLIED', 'KEPT_EXISTING', 'MANUAL_ENTRY')),
  decision_reason text not null default '',
  decided_by text not null default '',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (result_id, field_path)
);
create index if not exists ai_field_comparisons_result_idx
  on public.ai_field_comparisons (result_id, field_path);
create index if not exists ai_field_comparisons_job_pending_idx
  on public.ai_field_comparisons (job_id, decision) where decision = 'PENDING';

alter table public.ai_extraction_job_files enable row level security;
alter table public.ai_field_comparisons enable row level security;
revoke all on table public.ai_extraction_job_files from anon, authenticated;
revoke all on table public.ai_field_comparisons from anon, authenticated;
