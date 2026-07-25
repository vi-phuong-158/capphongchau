-- Migration tạo bảng ai_extraction_jobs và ai_extraction_results cho hạ tầng AI Assistive Extraction
create table if not exists public.ai_extraction_jobs (
  job_id                  text primary key,
  submission_id           text not null references public.public_submissions(submission_id),
  citizen_payload_version integer not null,
  status                  text not null default 'QUEUED' check (status in (
    'QUEUED','READY_FOR_AGENT','PROCESSING','VALIDATING','COMPLETED',
    'NEEDS_REVIEW','FAILED','QUARANTINED','STALE','CANCELLED')),
  worker_type             text not null default 'ANTIGRAVITY',
  worker_instance_id      text not null default '',
  schema_version          text not null,
  prompt_version          text not null,
  model_name              text not null default '',
  input_fingerprint       text not null,
  attempt_count           integer not null default 0 check (attempt_count >= 0),
  claimed_at              timestamptz,
  lease_expires_at        timestamptz,
  started_at              timestamptz,
  completed_at            timestamptz,
  error_code              text not null default '',
  error_message_redacted  text not null default '',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create unique index if not exists ai_extraction_jobs_idempotency_idx
  on public.ai_extraction_jobs (submission_id, input_fingerprint, prompt_version, schema_version);
create index if not exists ai_extraction_jobs_queue_idx
  on public.ai_extraction_jobs (status, created_at) where status in ('QUEUED','READY_FOR_AGENT');

create table if not exists public.ai_extraction_results (
  result_id              text primary key,
  job_id                 text not null references public.ai_extraction_jobs(job_id),
  result_version         integer not null,
  raw_json               jsonb not null,
  normalized_json        jsonb,
  validation_status      text not null check (validation_status in ('PASSED','REVIEW_REQUIRED','BLOCKED')),
  warning_count          integer not null default 0,
  blocking_issue_count   integer not null default 0,
  result_fingerprint     text not null,
  model_name             text not null default '',
  prompt_version         text not null default '',
  processed_at           timestamptz,
  created_at             timestamptz not null default now(),
  unique (job_id, result_version)
);

alter table public.ai_extraction_jobs    enable row level security;
alter table public.ai_extraction_results enable row level security;
revoke all on table public.ai_extraction_jobs    from anon, authenticated;
revoke all on table public.ai_extraction_results from anon, authenticated;
