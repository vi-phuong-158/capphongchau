# PUBLIC INTAKE V2 — MIGRATION REVIEW

**Cả hai migration CHƯA CHẠY ở bất kỳ môi trường nào.** Thứ tự bắt buộc: local → staging →
production, mỗi bước xác nhận xong mới đi tiếp.

## Danh sách

| File                                             | Nội dung                                                                                                              | Loại     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------- |
| `202607280001_assigned_officer_display_name.sql` | `public_submissions.claimed_by_display_name` (nullable)                                                               | Additive |
| `202607280002_officer_assisted_intake.sql`       | `intake_channel` (NOT NULL DEFAULT), `assisted_by_email`, `assisted_by_display_name`, `assisted_at`, 2 CHECK, 1 index | Additive |

Migration mới nhất trước đợt này là `202607260002_harden_antigravity_ai_jobs.sql`; hai số
`202607280001`/`202607280002` chưa ai dùng. `tests/migration-versions.test.ts` xanh.

## Vì sao an toàn

- Chỉ `add column if not exists` — chạy lại nhiều lần không hỏng.
- `intake_channel` có `default 'SELF_SERVICE'`, nên hàng cũ nhận giá trị đúng ngay, **không cần
  backfill**.
- Không sửa, không xóa, không đổi tên cột nào.
- Không đụng `draft_json`, `citizen_payload_json`, `working_payload_json`, `official_payload_json`.
- Hai CHECK chỉ ràng buộc hàng **mới**; hàng cũ đều là `SELF_SERVICE` nên thỏa mãn sẵn nhánh
  `intake_channel <> 'OFFICER_ASSISTED'`.

## Rủi ro và cách xử lý

| Rủi ro                                 | Đánh giá                                                     | Xử lý                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `ALTER TABLE ... ADD COLUMN` khóa bảng | Thấp — PostgreSQL 11+ thêm cột có DEFAULT không rewrite bảng | Chạy ngoài giờ cao điểm cho chắc                                                                                             |
| CHECK constraint fail lúc thêm         | Rất thấp — hàng cũ đều thỏa                                  | Nếu fail: kiểm hàng có `intake_channel = 'OFFICER_ASSISTED'` mà thiếu `assisted_*` (không nên tồn tại trước khi deploy code) |
| Code deploy trước migration            | **Đây là rủi ro thật**                                       | Chạy migration TRƯỚC khi deploy code. Code mới `select` các cột này; thiếu cột là 500 ở mọi màn hình hồ sơ                   |
| Migration chạy trước, code cũ còn chạy | An toàn                                                      | Cột thừa không ảnh hưởng code cũ                                                                                             |

**Thứ tự deploy bắt buộc: migration trước, code sau.**

## Rollback

```sql
-- 202607280002
alter table public.public_submissions
  drop constraint if exists public_submissions_assisted_actor_check,
  drop constraint if exists public_submissions_intake_channel_check;
drop index if exists public.public_submissions_intake_channel_idx;
alter table public.public_submissions
  drop column if exists assisted_at,
  drop column if exists assisted_by_display_name,
  drop column if exists assisted_by_email,
  drop column if exists intake_channel;

-- 202607280001
alter table public.public_submissions
  drop column if exists claimed_by_display_name;
```

Mất mát khi rollback: tên cán bộ đã nhận và nhãn nguồn hồ sơ của các hồ sơ tạo sau khi deploy.
Không mất dữ liệu kê khai, không mất ảnh, không mất hồ sơ chính thức. **Phải rollback code trước
rồi mới rollback migration** — ngược lại là 500 hàng loạt.

## Kiểm tra sau khi chạy

```sql
-- 1. Cột đã có và kiểu đúng
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'public_submissions'
  and column_name in ('claimed_by_display_name', 'intake_channel',
                      'assisted_by_email', 'assisted_by_display_name', 'assisted_at');

-- 2. Hồ sơ cũ đều là SELF_SERVICE, không hàng nào NULL
select intake_channel, count(*) from public.public_submissions group by 1;

-- 3. Không hàng nào vi phạm ràng buộc nhất quán
select count(*) from public.public_submissions
where intake_channel = 'OFFICER_ASSISTED'
  and (assisted_by_email is null or assisted_by_email = '' or assisted_at is null);
-- kỳ vọng: 0
```

## Phase 5 — migration CHƯA viết

Đầu bài §4.2 và §4.3 còn hai migration nữa (`public_upload_attempts`,
`public_file_normalization_metadata`). **Chưa làm trong đợt này.** Khi làm, dùng số tiếp theo
(`202607280003` trở đi) và kiểm lại migration mới nhất trước khi đặt tên.
