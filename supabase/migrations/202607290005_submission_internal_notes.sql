-- Đợt 2A-2: một ô ghi chú nội bộ cho cán bộ, không hiển thị cho người dân.
alter table public.public_submissions
  add column if not exists internal_notes text not null default '';
