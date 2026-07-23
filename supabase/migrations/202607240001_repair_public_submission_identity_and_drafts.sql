-- Hậu cutover: ETL chèn tường minh legacy_row_index nên phải đồng bộ identity sequence.
-- Đồng thời phục hồi nháp legacy thiếu mảng owners để endpoint CCCD không gặp dữ liệu sai shape.
do $$
declare
  sequence_name text;
  maximum bigint;
begin
  select pg_get_serial_sequence('public.public_submissions', 'legacy_row_index') into sequence_name;
  if sequence_name is null then
    raise exception 'Không tìm thấy sequence legacy_row_index';
  end if;

  select max(legacy_row_index) into maximum from public.public_submissions;
  if maximum is null then
    perform setval(sequence_name::regclass, 1, false);
  else
    perform setval(sequence_name::regclass, maximum, true);
  end if;
end
$$;

with repaired as (
  update public.public_submissions
  set
    draft_json = jsonb_set(
      draft_json,
      '{owners}',
      jsonb_build_array(
        jsonb_build_object(
          'id', gen_random_uuid()::text,
          'ownerType', 'CA_NHAN',
          'fullName', '',
          'identityNumber', '',
          'dateOfBirth', '',
          'gender', '',
          'residenceAddress', '',
          'identitySource', '',
          'qrPayloadHash', '',
          'qrDecoderVersion', '',
          'qrParserVersion', '',
          'identityStatus', '',
          'identityConfirmedAt', '',
          'roleOnCertificate', '',
          'hasDistinctCurrentUser', false,
          'currentUserName', '',
          'currentUserCitizenId', '',
          'currentUserAddress', '',
          'changeReason', ''
        )
      ),
      true
    ),
    version = version + 1,
    updated_at = now()
  where jsonb_typeof(draft_json) = 'object'
    and coalesce(jsonb_typeof(draft_json->'owners'), 'missing') <> 'array'
  returning submission_id
)
insert into public.audit_logs
  (audit_id, actor_email, action, entity_type, entity_id, request_id, metadata)
select
  gen_random_uuid(),
  'SYSTEM',
  'PUBLIC_SUBMISSION_DRAFT_REPAIRED',
  'PUBLIC_SUBMISSION',
  submission_id,
  'migration-202607240001-public-submissions',
  jsonb_build_object('migration', '202607240001', 'repairedField', 'owners')
from repaired;
