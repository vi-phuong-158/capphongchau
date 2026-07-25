-- Migration: Official Parcels, Land Uses and Official Payload for Submissions (P0-5)
create table if not exists public.official_parcels (
  official_parcel_id text primary key,
  official_case_id   text not null references public.cases(case_id),
  submission_id      text not null references public.public_submissions(submission_id),
  map_sheet_number   text not null default '',
  parcel_number      text not null default '',
  address_on_cert    text not null default '',
  old_ward           text not null default '',
  area               numeric(12, 2) not null check (area >= 0),
  created_at         timestamptz not null default now()
);

create table if not exists public.official_land_uses (
  official_land_use_id text primary key,
  official_parcel_id   text not null references public.official_parcels(official_parcel_id) on delete cascade,
  purpose_code         text not null default '',
  origin_code          text not null default '',
  form_code            text not null default '',
  term_code            text not null default '',
  area                 numeric(12, 2) check (area >= 0),
  created_at           timestamptz not null default now()
);

alter table public.public_submissions
  add column if not exists official_payload_json jsonb,
  add column if not exists official_payload_at   timestamptz,
  add column if not exists official_payload_by   text;

alter table public.official_parcels enable row level security;
alter table public.official_land_uses enable row level security;
revoke all on table public.official_parcels from anon, authenticated;
revoke all on table public.official_land_uses from anon, authenticated;
