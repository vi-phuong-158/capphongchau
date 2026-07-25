-- Migration thêm ON DELETE CASCADE cho public_land_uses_parcel_id_fkey làm lưới an toàn tầng DB
alter table public.public_land_uses
  drop constraint if exists public_land_uses_parcel_id_fkey,
  add constraint public_land_uses_parcel_id_fkey
    foreign key (parcel_id) references public.public_parcels(parcel_id) on delete cascade;
