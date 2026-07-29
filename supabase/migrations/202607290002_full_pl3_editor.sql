-- Bàn làm việc biên tập đầy đủ PL3 (cột B–AX).
-- Tất cả thay đổi đều additive; payload JSON cũ tiếp tục đọc được.

alter table public.public_submissions
  add column if not exists ward_admin_code_override text not null default '',
  add column if not exists ward_admin_code_override_reason text not null default '',
  add column if not exists scanned_file_names_override text not null default '',
  add column if not exists scanned_file_names_override_reason text not null default '';

alter table public.public_owners
  add column if not exists organisation_name text not null default '',
  add column if not exists organisation_identity_number text not null default '';

alter table public.public_parcels
  add column if not exists cadastral_map_sheet_number text not null default '',
  add column if not exists cadastral_map_sheet_override_reason text not null default '',
  add column if not exists cadastral_parcel_number text not null default '';

alter table public.public_assets
  add column if not exists parcel_id text,
  add column if not exists mixed_use_building_name text not null default '',
  add column if not exists apartment_building_name text not null default '',
  add column if not exists apartment_number text not null default '',
  add column if not exists construction_area text not null default '',
  add column if not exists floor_area text not null default '',
  add column if not exists ownership_form text not null default '',
  add column if not exists ownership_term text not null default '',
  add column if not exists grade text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'public_assets_parcel_fk'
      and conrelid = 'public.public_assets'::regclass
  ) then
    alter table public.public_assets
      add constraint public_assets_parcel_fk
      foreign key (parcel_id) references public.public_parcels(parcel_id) on delete set null;
  end if;
end
$$;

create index if not exists public_assets_parcel_idx
  on public.public_assets (submission_id, parcel_id);

-- Bản chính thức giữ nguyên payload chi tiết để không làm mất tổ chức/người đại diện hiện tại.
alter table public.owners
  add column if not exists data_json jsonb not null default '{}'::jsonb;

alter table public.official_parcels
  add column if not exists parcel_id_code text not null default '',
  add column if not exists address_two_level text not null default '',
  add column if not exists cadastral_map_sheet_number text not null default '',
  add column if not exists cadastral_map_sheet_override_reason text not null default '',
  add column if not exists cadastral_parcel_number text not null default '';

alter table public.official_land_uses
  add column if not exists purpose_free_text text not null default '';
