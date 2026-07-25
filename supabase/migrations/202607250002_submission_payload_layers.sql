-- Thêm các cột lưu citizen_payload và working_payload cho public_submissions
alter table public.public_submissions
  add column if not exists citizen_payload_json     jsonb,
  add column if not exists citizen_payload_version  integer not null default 0,
  add column if not exists citizen_payload_at       timestamptz,
  add column if not exists working_payload_json     jsonb,
  add column if not exists working_payload_at       timestamptz,
  add column if not exists working_payload_by       text;

create table if not exists public.public_submission_payload_history (
  history_id      uuid primary key default gen_random_uuid(),
  submission_id   text not null references public.public_submissions(submission_id),
  layer           text not null check (layer in ('CITIZEN','WORKING')),
  payload_version integer not null,
  payload_json    jsonb not null,
  actor_email     text not null default '',
  created_at      timestamptz not null default now(),
  unique (submission_id, layer, payload_version)
);
create index if not exists public_submission_payload_history_idx
  on public.public_submission_payload_history (submission_id, layer, payload_version desc);
alter table public.public_submission_payload_history enable row level security;
revoke all on table public.public_submission_payload_history from anon, authenticated;

-- Nạp ngược cho các hồ sơ đã gửi: coi draft_json hiện tại là bản người dân gửi (citizen_payload)
update public.public_submissions
set citizen_payload_json = draft_json,
    citizen_payload_version = 1,
    citizen_payload_at = coalesce(updated_at, created_at, now())
where citizen_payload_json is null
  and draft_json is not null
  and status in ('SUBMITTED','RESUBMITTED','UNDER_REVIEW','NEEDS_SUPPLEMENT','ACCEPTING','ACCEPTED');
