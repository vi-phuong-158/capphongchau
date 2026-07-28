-- Public Intake V2 — chế độ cán bộ hỗ trợ kê khai.
--
-- Góp ý: "Làm phần mềm được ko để anh em đi làm cho dân". Không xây app native riêng; cán bộ dùng
-- chính PWA này ở route `/ke-khai-ho`, bắt buộc đăng nhập.
--
-- Vì sao phải phân biệt nguồn: hồ sơ do cán bộ nhập hộ có độ tin cậy khác hồ sơ hộ dân tự khai
-- (cán bộ cầm giấy tờ gốc trên tay). Khi rà soát chất lượng dữ liệu hoặc truy vết một hồ sơ sai,
-- phải biết ai đã ngồi nhập.
--
-- Additive: chỉ thêm cột, có mặc định cho hồ sơ cũ. Rollback là bỏ cột.

alter table public.public_submissions
  add column if not exists intake_channel text not null default 'SELF_SERVICE',
  add column if not exists assisted_by_email text,
  add column if not exists assisted_by_display_name text,
  add column if not exists assisted_at timestamptz;

comment on column public.public_submissions.intake_channel is
  'SELF_SERVICE: hộ dân tự kê khai. OFFICER_ASSISTED: cán bộ nhập hộ tại /ke-khai-ho. '
  'Do MÁY CHỦ gán từ phiên đăng nhập, client không được gửi giá trị này.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'public_submissions_intake_channel_check'
  ) then
    alter table public.public_submissions
      add constraint public_submissions_intake_channel_check
      check (intake_channel in ('SELF_SERVICE', 'OFFICER_ASSISTED'));
  end if;

  -- Ràng buộc nhất quán: đã khai là cán bộ nhập hộ thì phải có đủ dấu vết ai nhập và lúc nào.
  -- Không có ràng buộc này thì một lỗi lập trình có thể ghi OFFICER_ASSISTED mà bỏ trống người
  -- thực hiện, và hồ sơ đó vĩnh viễn không truy được về ai.
  if not exists (
    select 1 from pg_constraint where conname = 'public_submissions_assisted_actor_check'
  ) then
    alter table public.public_submissions
      add constraint public_submissions_assisted_actor_check
      check (
        intake_channel <> 'OFFICER_ASSISTED'
        or (
          assisted_by_email is not null and assisted_by_email <> ''
          and assisted_by_display_name is not null
          and assisted_at is not null
        )
      );
  end if;
end $$;

create index if not exists public_submissions_intake_channel_idx
  on public.public_submissions (intake_channel, created_at desc);
