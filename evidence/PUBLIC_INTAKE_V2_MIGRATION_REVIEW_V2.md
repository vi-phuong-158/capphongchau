# PUBLIC INTAKE V2 — RÀ SOÁT MIGRATION (VÒNG 2)

**Cả bốn migration CHƯA CHẠY ở bất kỳ môi trường nào — kể cả local.** Bản này thay
`PUBLIC_INTAKE_V2_MIGRATION_REVIEW.md` (chỉ có hai migration đầu).

## Danh sách, theo đúng thứ tự chạy

| #   | File                                                  | Nội dung                                                               | Loại     |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| 1   | `202607280001_assigned_officer_display_name.sql`      | `public_submissions.claimed_by_display_name`                           | Additive |
| 2   | `202607280002_officer_assisted_intake.sql`            | `intake_channel` (NOT NULL DEFAULT), `assisted_by_*`, 2 CHECK, 1 index | Additive |
| 3   | `202607280003_upload_attempt_metrics.sql`             | Bảng mới `public_upload_attempts`, 6 CHECK, 3 index                    | Bảng mới |
| 4   | `202607280004_public_file_normalization_metadata.sql` | 7 cột trên `public_files`                                              | Additive |

Migration mới nhất trước đợt này: `202607260002_harden_antigravity_ai_jobs.sql`. Bốn số
`202607280001`–`202607280004` chưa ai dùng; `tests/migration-versions.test.ts` xanh.

## Additive — kiểm từng điểm

- Không `drop`, không `rename`, không đổi kiểu cột nào.
- Toàn bộ dùng `if not exists`; chạy lại nhiều lần không hỏng.
- Không đụng `draft_json`, `citizen_payload_json`, `working_payload_json`, `official_payload_json`.
- `intake_channel` có `default 'SELF_SERVICE'` → hàng cũ đúng ngay, **không cần backfill**.
- Bảy cột ở migration 4 đều nullable trừ `normalization_version` có mặc định rỗng.
- Hai CHECK ở migration 2 chỉ ràng buộc hàng mới; hàng cũ đều `SELF_SERVICE` nên thỏa sẵn nhánh
  `intake_channel <> 'OFFICER_ASSISTED'`.
- Sáu CHECK ở migration 3 nằm trên bảng rỗng vừa tạo — không thể fail.

## Thứ tự triển khai

**Migration TRƯỚC, code SAU. Không có ngoại lệ.**

| Tình huống                        | Hậu quả                                      |
| --------------------------------- | -------------------------------------------- |
| Migration trước, code cũ còn chạy | An toàn. Cột và bảng thừa không ảnh hưởng gì |
| **Code trước, migration sau**     | **500 hàng loạt** — xem bảng dưới            |

Chính xác code mới hỏng ở đâu nếu thiếu migration:

| Thiếu   | Vỡ ở đâu                                      | Biểu hiện                                                                                                                                            |
| ------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| MIG 1+2 | `SUBMISSION_SELECT` chọn 5 cột chưa tồn tại   | **Mọi** màn hình hồ sơ 500: hàng đợi, chi tiết, tra cứu công khai, tạo hồ sơ mới. Nặng nhất                                                          |
| MIG 3   | `appendUploadAttempt` insert vào bảng chưa có | **Không hỏng gì thấy được.** Lời gọi đã bọc `.catch(() => undefined)` ở cả hai đường; chỉ mất số đo                                                  |
| MIG 4   | `appendFile` insert 7 cột chưa có             | **Mọi lượt tải ảnh hỏng ở bước cuối.** Tệp lên Drive xong rồi bị `discardIfOrphan` xóa đúng theo thiết kế; người dân thấy "Ảnh tải lên không hợp lệ" |

Nói cách khác: MIG 1, 2, 4 là bắt buộc trước khi deploy code. MIG 3 có thể chậm hơn mà không ai
thấy — nhưng chậm ngày nào là mất số liệu ngày đó, và số liệu đó là điều kiện để bật chuẩn hóa ảnh.

## Có cần feature flag để tránh 500 không

**Không**, và thêm cờ ở đây là sai hướng.

Cờ chỉ giúp nếu code có thể chạy được ở cả hai trạng thái schema. Ở đây MIG 1+2 nằm trong
`SUBMISSION_SELECT` — câu select dùng chung cho mọi đường đọc hồ sơ. Muốn chống đỡ bằng cờ thì
phải giữ hai bản câu select và một nhánh rẽ ở mọi chỗ đọc, tức là nhân đôi đường nóng của cả hệ
thống để tránh một thao tác chạy trước 30 giây. Kỷ luật thứ tự triển khai rẻ hơn nhiều và không để
lại nợ.

MIG 3 thì đã tự an toàn sẵn — không phải nhờ cờ mà nhờ metric là best-effort ngay từ thiết kế.

## Khóa và index

| Thao tác                       | Rủi ro khóa     | Ghi chú                                                                                                                                   |
| ------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `add column` có DEFAULT hằng   | Thấp            | PostgreSQL 11+ không rewrite bảng                                                                                                         |
| `add column` nullable          | Thấp            | Chỉ sửa catalog                                                                                                                           |
| `add constraint check` (MIG 2) | **Trung bình**  | Quét toàn bảng dưới `ACCESS EXCLUSIVE`. Với vài chục nghìn hàng là dưới một giây; vẫn nên chạy ngoài giờ cao điểm                         |
| `create index` (MIG 2, 3)      | Thấp/Trung bình | Không dùng `concurrently` — bảng metric mới rỗng nên vô hại; index ở MIG 2 khóa ghi trong lúc dựng. Bảng vài chục nghìn hàng thì rất ngắn |
| `create table` (MIG 3)         | Không           | Bảng mới                                                                                                                                  |

Nếu `public_submissions` đã lớn hơn dự kiến, tách CHECK của MIG 2 thành `not valid` rồi
`validate constraint` sau. Chưa làm vì quy mô hiện tại không cần và thêm bước là thêm chỗ sai.

## Rollback

Rollback **code trước, migration sau**. Ngược lại là 500 hàng loạt.

```sql
-- 202607280004
alter table public.public_files
  drop column if exists normalization_version,
  drop column if exists upload_height,
  drop column if exists upload_width,
  drop column if exists source_height,
  drop column if exists source_width,
  drop column if exists source_mime_type,
  drop column if exists source_size_bytes;

-- 202607280003
drop table if exists public.public_upload_attempts;

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

Mất gì khi rollback: tên cán bộ đã nhận, nhãn nguồn của hồ sơ tạo sau deploy, toàn bộ số đo hiệu
năng, metadata chuẩn hóa. **Không** mất dữ liệu kê khai, không mất ảnh, không mất hồ sơ chính thức.

## Bảo mật và lưu trữ của bảng số đo

- Không có cột nào chứa được PII: không tên tệp, CCCD, họ tên, điện thoại, user agent thô, Drive
  ID, URL upload hay IP. Khóa lại ở `tests/upload-metrics.test.ts`.
- `submission_id` là liên kết duy nhất sang hồ sơ, có `on delete cascade` — xóa hồ sơ là số đo đi
  theo.
- Không public select. Ghi qua repository phía máy chủ.
- **Retention 90 ngày, chưa có job tự xóa.** Cố ý: một job xóa tự động chạy trên production mà
  chưa ai duyệt là rủi ro lớn hơn việc giữ thừa vài tháng số liệu không PII. Xóa thủ công theo quy
  trình đã duyệt.

## Kiểm sau khi chạy

```sql
-- 1. Cột mới có đủ
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'public_submissions'
  and column_name in ('claimed_by_display_name', 'intake_channel',
                      'assisted_by_email', 'assisted_by_display_name', 'assisted_at');
-- kỳ vọng: 5 dòng

select count(*) from information_schema.columns
where table_schema = 'public' and table_name = 'public_files'
  and column_name in ('source_size_bytes', 'source_mime_type', 'source_width', 'source_height',
                      'upload_width', 'upload_height', 'normalization_version');
-- kỳ vọng: 7

-- 2. Hồ sơ cũ đều SELF_SERVICE, không hàng nào NULL
select intake_channel, count(*) from public.public_submissions group by 1;

-- 3. Không hàng nào vi phạm ràng buộc nhất quán
select count(*) from public.public_submissions
where intake_channel = 'OFFICER_ASSISTED'
  and (assisted_by_email is null or assisted_by_email = '' or assisted_at is null);
-- kỳ vọng: 0

-- 4. Bảng số đo tồn tại và rỗng
select count(*) from public.public_upload_attempts;
-- kỳ vọng: 0

-- 5. Sau vài lượt kê khai thử — có số đo và không có cột lạ
select document_type, outcome, client_platform, effective_connection_type,
       upload_duration_ms, source_size_bytes, upload_size_bytes
from public.public_upload_attempts order by created_at desc limit 20;
```
