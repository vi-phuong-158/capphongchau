-- Migration: Official Acceptance Saga Infrastructure (202607240001)

create table if not exists public.case_counters (
  year integer primary key,
  last_sequence integer not null default 0 check (last_sequence >= 0)
);

alter table public.id_reservations
  add column if not exists sequence_number integer,
  add column if not exists official_case_id text,
  add column if not exists submission_id text;

create unique index if not exists id_reservations_year_seq_idx
  on public.id_reservations (year, sequence_number)
  where sequence_number is not null;

create table if not exists public.public_acceptance_sagas (
  submission_id text primary key
    references public.public_submissions(submission_id),
  idempotency_key text not null unique,
  step text not null default 'CLAIMED',
  official_case_id text not null default '',
  case_folder_id text not null default '',
  originals_folder_id text not null default '',
  moved_files jsonb not null default '{}'::jsonb,
  last_error text not null default '',
  actor_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.case_counters enable row level security;
alter table public.public_acceptance_sagas enable row level security;
