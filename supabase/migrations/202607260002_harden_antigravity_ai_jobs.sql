-- Hardening review: job cũ không có manifest hợp lệ không được gửi cho Antigravity.
-- `NOT VALID` vẫn kiểm tra các dòng mới, nhưng giữ nguyên dấu vết manifest cũ nếu từng có dữ liệu lỗi.

with stale_jobs as (
  update public.ai_extraction_jobs job
  set status = 'STALE',
      error_code = 'MANIFEST_MISSING_OR_INVALID',
      error_message_redacted = 'Job AI cũ không có manifest GCN hợp lệ.',
      lease_expires_at = null,
      updated_at = now()
  where job.subject_type = 'PUBLIC_SUBMISSION'
    and job.status in ('READY_FOR_AGENT', 'PROCESSING')
    and (
      not exists (
        select 1 from public.ai_extraction_job_files job_file
        where job_file.job_id = job.job_id
      )
      or exists (
        select 1
        from public.ai_extraction_job_files job_file
        left join public.public_files source_file on source_file.file_id = job_file.file_id
        where job_file.job_id = job.job_id
          and (
            source_file.file_id is null
            or source_file.submission_id is distinct from job.submission_id
            or source_file.document_type <> 'CERTIFICATE'
            or source_file.variant <> 'ORIGINAL'
            or source_file.status <> 'UPLOADED'
            or source_file.checksum_sha256 <> job_file.checksum_sha256
            or source_file.file_name <> job_file.file_name
          )
      )
    )
  returning job_id
)
insert into public.audit_logs (actor_email, action, entity_type, entity_id, request_id, metadata)
select 'SYSTEM_MIGRATION', 'AI_EXTRACTION_STALE', 'AI_EXTRACTION_JOB', job_id,
  'migration-202607260002', '{"reason":"MANIFEST_MISSING_OR_INVALID"}'::jsonb
from stale_jobs;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_extraction_job_files_public_file_fk'
  ) then
    alter table public.ai_extraction_job_files
      add constraint ai_extraction_job_files_public_file_fk
      foreign key (file_id) references public.public_files(file_id) not valid;
  end if;
end $$;

create index if not exists ai_extraction_jobs_expired_lease_idx
  on public.ai_extraction_jobs (worker_type, lease_expires_at, created_at)
  where status = 'PROCESSING';
