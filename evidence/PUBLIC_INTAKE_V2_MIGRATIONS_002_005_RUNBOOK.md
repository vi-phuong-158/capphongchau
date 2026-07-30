# PUBLIC INTAKE V2 — RUNBOOK MIGRATION `202607290002`–`202607290005`

Áp dụng cho bốn migration còn nợ tính đến 2026-07-30: `202607290002_full_pl3_editor.sql`,
`202607290003_drop_working_payload_override_columns.sql`,
`202607290004_queue_search_performance.sql`, `202607290005_submission_internal_notes.sql`.

**Đây là đợt migration khác** với đợt trong
`evidence/PUBLIC_INTAKE_V2_PREVIEW_MIGRATION_RUNBOOK.md` (`202607280001`–`04`, đã chạy từ 2026-07-29
— xem `docs/brain/06-ai-working-log.md`, mục "Phase 1 rehearsal reset, preflight 32/32 và Preview
deploy"). File đó không nói về bốn migration này; đừng lẫn hai runbook.

**Không chạy trên production trong phiên viết runbook này.** Viết cho **preview** — chưa xác nhận
được project preview thật đã ở trạng thái nào (xem mục 0).

## 0. Trước khi bắt đầu — xác nhận trạng thái thật, đừng đoán

Tài liệu nội bộ đang có hai câu chuyện khác nhau về bốn migration này:

- `docs/brain/04-current-tasks.md` ghi cả bốn là **"chưa chạy"**.
- `docs/brain/06-ai-working-log.md` (mục "Phase 1 rehearsal reset") ghi một agent khác đã **reset
  và áp lại 20 migration** (gồm `202607290001`–`04`, tức đã bao gồm ba trong bốn file này, thiếu
  `202607290005` vì file đó sinh ra sau) trên project ref `ddiaaweuqfvutogjckwc`, gọi project này là
  "rehearsal/Preview" — không nói rõ đây là project Preview thật dùng cho Vercel Preview deployment,
  hay một project riêng dùng để tập dượt rồi có thể đã bị reset/xóa sau đó.

**Không suy luận thêm** — xác nhận bằng truy vấn đọc trước khi chạy bất kỳ DDL nào:

- [ ] Xác nhận `SUPABASE_DATABASE_URL` đang trỏ đúng project **preview** dùng cho Vercel Preview
      deployment thật, bằng cách so project-ref trong connection string với project-ref đã biết
      trước trong Vercel dashboard — **không dùng project ref `ddiaaweuqfvutogjckwc` trong log trên**
      làm mặc định nếu chưa xác nhận lại đó vẫn là project đang chạy.
- [ ] Chạy `npx tsx scripts/preflight-public-intake-v2-migrations.ts` **trước khi áp bất cứ gì** —
      script chỉ đọc, không ghi. Kết quả cho biết **chính xác** bốn migration này đã áp hay chưa,
      không cần đoán qua tài liệu. Nếu báo PASS cho cả bốn: dừng, không cần chạy gì thêm ở runbook
      này.
- [ ] Gọi `GET /api/health/database` trên deployment preview hiện tại — phải trả `status: "ok"`.

## 1. An toàn từng migration — đã đọc mã nguồn `.sql`, không đoán

Cả bốn đều **additive và idempotent** (`add column if not exists` / `drop column if exists` /
`create index if not exists`) — chạy lại trên schema đã có sẵn cột/index là no-op, không lỗi. Đây là
lý do bốn migration này an toàn để `db push` mà không cần biết chính xác trạng thái hiện tại, miễn
đã xác nhận **đúng project** ở mục 0.

| Migration | Việc làm | Rủi ro khóa bảng |
| --- | --- | --- |
| `202607290002_full_pl3_editor.sql` | Thêm cột cho `public_submissions`, `public_owners`, `public_parcels`, `public_assets`, `owners`, `official_parcels`, `official_land_uses`; thêm FK `public_assets_parcel_fk` (có kiểm tồn tại trước khi thêm); thêm 1 index | **Thấp.** Cột `parcel_id` mới thêm trong cùng migration nên toàn bộ hàng đang có là `NULL` lúc thêm FK — validate FK trên cột toàn `NULL` gần như tức thời, không quét dữ liệu thật |
| `202607290003_drop_working_payload_override_columns.sql` | Gỡ 4 cột `ward_admin_code_override*`/`scanned_file_names_override*` trên `public_submissions` | **Thấp.** `DROP COLUMN` trong Postgres là thao tác catalog, không viết lại toàn bảng ngay (dọn không gian đĩa để `VACUUM` sau) |
| `202607290004_queue_search_performance.sql` | Tạo extension `pg_trgm`; thêm 2 **generated column `STORED`** (`queue_owner_name`, `queue_issue_number`); tạo 5 index (2 btree, 3 GIN trigram) | **Migration rủi ro nhất trong bốn cái.** Thêm generated column `STORED` bắt Postgres **tính và ghi giá trị cho mọi hàng đang có ngay lúc `ALTER TABLE`** — giữ khóa `ACCESS EXCLUSIVE` trên `public_submissions` suốt quá trình đó, chặn cả đọc lẫn ghi. Năm lệnh `CREATE INDEX` phía sau **không dùng `CONCURRENTLY`** — mỗi lệnh cũng khóa ghi (không khóa đọc) trong lúc build. Ở quy mô hồ sơ hiện tại (theo benchmark trong log 2026-07-29: 20.000 hàng synthetic, trang trạng thái 17,99 ms) mức này vẫn ổn; canh giờ ít cán bộ thao tác nếu bảng đã lớn hơn |
| `202607290005_submission_internal_notes.sql` | Thêm cột `internal_notes text not null default ''` | **Không đáng kể.** Có default hằng số nên Postgres không cần viết lại bảng (tối ưu có từ Postgres 11), chỉ đổi catalog |

Không migration nào xóa hay đổi kiểu dữ liệu đang có — chỉ thêm mới hoặc gỡ cột đã xác nhận không
còn đường đọc (`202607290003`, xem lý do đầy đủ ở `docs/brain/03-decisions.md`, mục
"`working_payload_json` là nguồn sự thật DUY NHẤT").

## 2. Backup/checkpoint

Cùng quy trình với `PUBLIC_INTAKE_V2_PREVIEW_MIGRATION_RUNBOOK.md` mục 1 — không lặp lại ở đây, chỉ
nhắc: bắt buộc dump trước khi chạy DDL nếu preview đang giữ dữ liệu test đáng giữ.

```bash
supabase db dump --db-url "$SUPABASE_DATABASE_URL" -f preview-checkpoint-before-002-005.sql
```

- [ ] File dump đã tạo, kích thước > 0 byte, không commit vào git.

## 3. Thứ tự migration

**Đúng thứ tự file, không nhảy cóc:**

```text
202607290002_full_pl3_editor.sql
202607290003_drop_working_payload_override_columns.sql
202607290004_queue_search_performance.sql
202607290005_submission_internal_notes.sql
```

```powershell
supabase link --project-ref <preview-project-ref>
supabase db push
```

## 4. Lệnh kiểm tra sau MỖI migration

### Sau `202607290002`

```sql
select count(*) from information_schema.columns
where table_schema='public' and table_name='public_assets' and column_name='parcel_id';
-- kỳ vọng: 1

select conname from pg_constraint where conname = 'public_assets_parcel_fk';
-- kỳ vọng: 1 dòng

select count(*) from information_schema.columns
where table_schema='public' and table_name='official_land_uses'
  and column_name='purpose_free_text';
-- kỳ vọng: 1
```

### Sau `202607290003`

```sql
select count(*) from information_schema.columns
where table_schema='public' and table_name='public_submissions'
  and column_name in ('ward_admin_code_override','ward_admin_code_override_reason',
                      'scanned_file_names_override','scanned_file_names_override_reason');
-- kỳ vọng: 0 (đã gỡ)
```

### Sau `202607290004`

```sql
select is_generated from information_schema.columns
where table_schema='public' and table_name='public_submissions'
  and column_name='queue_owner_name';
-- kỳ vọng: 1 dòng, is_generated = 'ALWAYS'

select count(*) from pg_indexes
where schemaname='public' and indexname in (
  'public_submissions_queue_page_idx','public_submissions_queue_all_page_idx',
  'public_submissions_queue_receipt_trgm_idx','public_submissions_queue_issue_trgm_idx',
  'public_submissions_queue_owner_trgm_idx'
);
-- kỳ vọng: 5
```

### Sau `202607290005`

```sql
select count(*) from information_schema.columns
where table_schema='public' and table_name='public_submissions' and column_name='internal_notes';
-- kỳ vọng: 1
```

### Kiểm tổng hợp — một lệnh thay vì bốn

```bash
npx tsx scripts/preflight-public-intake-v2-migrations.ts
```

- [ ] Báo PASS cho toàn bộ, bao gồm cả các migration cũ hơn (`202607280001`–`202607290001`) — script
      kiểm nguyên chuỗi phụ thuộc, không chỉ bốn file này.

## 5. Dấu hiệu phải rollback

| Dấu hiệu | Mức độ | Diễn giải |
| --- | --- | --- |
| `preflight` FAIL ở bất kỳ dòng nào | **Dừng ngay** | Đừng chạy migration tiếp theo, đừng deploy code |
| `GET /api/health/database` lỗi sau khi migrate | **Dừng ngay** | Kết nối hoặc schema tối thiểu hỏng |
| `db push` treo/timeout ở `202607290004` | Trung bình, không lạ | Migration này khóa bảng lâu nhất trong bốn (xem mục 1) — nếu preview đang có truy vấn dài chạy song song, đợi rồi thử lại ngoài giờ traffic thấp, **không ép chạy song song thứ hai** |
| Code đã deploy trước migration, màn hồ sơ 500 hàng loạt | **Khẩn** | Kinh điển "code trước, migration sau" — rollback code trước, xem mục 6 |

## 6. Rollback

Rollback **code trước, migration sau**. Theo đúng thứ tự ngược (05→02):

```sql
-- 202607290005
alter table public.public_submissions drop column if exists internal_notes;

-- 202607290004
drop index if exists public.public_submissions_queue_owner_trgm_idx;
drop index if exists public.public_submissions_queue_issue_trgm_idx;
drop index if exists public.public_submissions_queue_receipt_trgm_idx;
drop index if exists public.public_submissions_queue_all_page_idx;
drop index if exists public.public_submissions_queue_page_idx;
alter table public.public_submissions
  drop column if exists queue_issue_number,
  drop column if exists queue_owner_name;
-- KHÔNG drop extension pg_trgm ở đây nếu migration khác đã dùng chung extension đó.

-- 202607290003
-- ⚠️ Rollback này chỉ khôi phục CỘT, KHÔNG khôi phục dữ liệu từng có trong đó trước khi gỡ —
-- migration 202607290003 đã xác nhận không có dữ liệu nào chỉ tồn tại ở bốn cột này (mọi giá trị
-- đã sao chép vào working_payload_json/draft_json), nên rollback KHÔNG mất dữ liệu thật, chỉ mất
-- lại đúng bốn cột rỗng.
alter table public.public_submissions
  add column if not exists ward_admin_code_override text not null default '',
  add column if not exists ward_admin_code_override_reason text not null default '',
  add column if not exists scanned_file_names_override text not null default '',
  add column if not exists scanned_file_names_override_reason text not null default '';

-- 202607290002
alter table public.public_assets drop constraint if exists public_assets_parcel_fk;
drop index if exists public.public_assets_parcel_idx;
alter table public.public_assets
  drop column if exists grade,
  drop column if exists ownership_term,
  drop column if exists ownership_form,
  drop column if exists floor_area,
  drop column if exists construction_area,
  drop column if exists apartment_number,
  drop column if exists apartment_building_name,
  drop column if exists mixed_use_building_name,
  drop column if exists parcel_id;
alter table public.public_parcels
  drop column if exists cadastral_parcel_number,
  drop column if exists cadastral_map_sheet_override_reason,
  drop column if exists cadastral_map_sheet_number;
alter table public.public_owners
  drop column if exists organisation_identity_number,
  drop column if exists organisation_name;
alter table public.public_submissions
  drop column if exists ward_admin_code_override,
  drop column if exists ward_admin_code_override_reason,
  drop column if exists scanned_file_names_override,
  drop column if exists scanned_file_names_override_reason;
alter table public.owners drop column if exists data_json;
alter table public.official_parcels
  drop column if exists cadastral_parcel_number,
  drop column if exists cadastral_map_sheet_override_reason,
  drop column if exists cadastral_map_sheet_number,
  drop column if exists address_two_level,
  drop column if exists parcel_id_code;
alter table public.official_land_uses drop column if exists purpose_free_text;
```

**Mất gì khi rollback:** toàn bộ dữ liệu PL3 mở rộng (cột B–AX của Bàn làm việc), hai generated
column phục vụ tìm kiếm hàng đợi (tự sinh lại được từ `draft_json` một khi migrate lại, không mất
gốc), ghi chú nội bộ cán bộ đã nhập (`internal_notes` — **mất thật**, không có bản sao ở đâu khác).
**Không** mất dữ liệu kê khai gốc, không mất ảnh, không mất hồ sơ chính thức.

Sau rollback, chạy lại `npx tsx scripts/preflight-public-intake-v2-migrations.ts` — kỳ vọng các dòng
kiểm cột PL3/hàng đợi/ghi chú nội bộ chuyển sang FAIL (đúng, vì đã rollback), các dòng khác vẫn PASS.

## 7. Deploy code CHỈ SAU KHI preflight PASS

**Thứ tự bắt buộc: migration → preflight PASS → deploy code.** Không có ngoại lệ.

Bốn commit code liên quan tới bốn migration này (nhánh `claude/redesign-document-review-screen-tfuvov`,
xem `CHATGPT_HANDOFF.md`):

- Bàn làm việc PL3 đầy đủ — cần `202607290002`.
- Tối ưu hàng đợi (Phase 1) — cần `202607290004`.
- Ghi chú nội bộ (Đợt 2A-2) — cần `202607290005`.
- `202607290003` không gắn với tính năng mới; là dọn cột thừa, chạy được độc lập bất cứ lúc nào sau
  `202607290002`.

Checklist deploy:

- [ ] Bốn migration đã chạy trên preview, theo đúng thứ tự.
- [ ] `npx tsx scripts/preflight-public-intake-v2-migrations.ts` PASS toàn bộ.
- [ ] `GET /api/health/database` trả `status: "ok"`.
- [ ] Mở `/submissions/:id` (Bàn làm việc PL3), thử lưu→tải lại→tiếp nhận→xuất một hồ sơ giả đủ B–AX.
- [ ] Mở `/submissions` (hàng đợi), thử tìm kiếm theo tên chủ/số GCN/mã tiếp nhận — không trang nào
      500.
- [ ] Mở một hồ sơ `UNDER_REVIEW`, thử ghi và lưu ghi chú nội bộ.
