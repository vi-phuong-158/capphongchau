-- Phase 3: defer the per-submission Drive folder until the first valid upload request.
--
-- Additive and safe while LAZY_DRIVE_FOLDER_CREATION_ENABLED remains false. Existing rows are
-- backfilled READY, preserving the eager path. No Drive error text is persisted because Google
-- errors may contain internal file/folder identifiers.

alter table public.public_submissions
  alter column drive_folder_id drop not null;

alter table public.public_submissions
  add column if not exists drive_folder_state text not null default 'PENDING',
  add column if not exists drive_folder_lease_until timestamptz,
  add column if not exists drive_folder_attempts integer not null default 0;

update public.public_submissions
set drive_folder_id = null
where drive_folder_id is not null
  and btrim(drive_folder_id) = '';

update public.public_submissions
set drive_folder_state = 'READY',
    drive_folder_lease_until = null
where drive_folder_id is not null
  and drive_folder_state <> 'READY';

update public.public_submissions
set drive_folder_state = 'PENDING',
    drive_folder_lease_until = null
where drive_folder_id is null
  and drive_folder_state not in ('PENDING', 'CREATING', 'FAILED');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.public_submissions'::regclass
      and conname = 'public_submissions_drive_folder_state_check'
  ) then
    alter table public.public_submissions
      add constraint public_submissions_drive_folder_state_check
      check (drive_folder_state in ('PENDING', 'CREATING', 'READY', 'FAILED'));
  end if;
end
$$;

create index if not exists public_submissions_drive_folder_lease_idx
  on public.public_submissions (drive_folder_lease_until)
  where drive_folder_id is null and drive_folder_state = 'CREATING';
