-- Một số dòng legacy đã lưu JSON hai lần: jsonb giữ string chứa object draft.
-- Hàm cục bộ giúp migration bỏ qua chuỗi JSON hỏng thay vì làm dừng cả migration.
create or replace function public.try_parse_legacy_draft_json(value text)
returns jsonb
language plpgsql
immutable
as $$
begin
  return value::jsonb;
exception when others then
  return null;
end;
$$;

-- Chỉ chuẩn hóa string hợp lệ đã xác nhận là object; không đọc/ghi từng trường PII.
with normalized as (
  update public.public_submissions
  set
    draft_json = public.try_parse_legacy_draft_json(draft_json #>> '{}'),
    version = version + 1,
    updated_at = now()
  where jsonb_typeof(draft_json) = 'string'
    and jsonb_typeof(public.try_parse_legacy_draft_json(draft_json #>> '{}')) = 'object'
  returning submission_id
)
insert into public.audit_logs
  (audit_id, actor_email, action, entity_type, entity_id, request_id, metadata)
select
  gen_random_uuid(),
  'SYSTEM',
  'PUBLIC_SUBMISSION_DRAFT_JSON_NORMALIZED',
  'PUBLIC_SUBMISSION',
  submission_id,
  'migration-202607240002-public-draft-json',
  jsonb_build_object('migration', '202607240002', 'normalization', 'JSON_STRING_TO_OBJECT')
from normalized;

drop function public.try_parse_legacy_draft_json(text);