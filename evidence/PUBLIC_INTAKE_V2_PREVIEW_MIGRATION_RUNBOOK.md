# PUBLIC INTAKE V2 — RUNBOOK CHẠY MIGRATION TRÊN PREVIEW

Áp dụng cho bốn migration: `202607280001`, `202607280002`, `202607280003`, `202607280004`.
**Không chạy trên production trong phiên thi công này.** Runbook này viết cho **preview** — một
project Supabase riêng cho môi trường thử nghiệm, không phải database production.

Phân tích an toàn chi tiết từng migration (additive, khóa, rollback SQL) đã có ở
`evidence/PUBLIC_INTAKE_V2_MIGRATION_REVIEW_V2.md`. File này là **quy trình thao tác**, không lặp
lại phân tích — chỉ trỏ tới.

## 0. Trước khi bắt đầu

- [ ] Xác nhận `SUPABASE_DATABASE_URL` trỏ đúng project **preview**, không phải production. Kiểm
      bằng cách so project-ref trong connection string với project-ref preview đã biết trước —
      **không** đoán qua tên biến.
- [ ] Xác nhận migration mới nhất đã áp trước đó là `202607260002_harden_antigravity_ai_jobs.sql`
      (khớp ghi chú ở `PUBLIC_INTAKE_V2_MIGRATION_REVIEW_V2.md`). Nếu preview đang ở một điểm khác,
      dừng và đối chiếu lại — bốn migration này giả định thứ tự đó.
- [ ] Gọi `GET /api/health/database` trên deployment preview hiện tại — phải trả `status: "ok"`
      trước khi đụng vào schema.

## 1. Backup/checkpoint

Supabase giữ Point-in-Time Recovery cho các gói trả phí; với gói free, backup thủ công là bắt buộc
trước khi chạy DDL trên preview có dữ liệu test quan trọng:

```bash
# Supabase CLI — export schema + data hiện tại của project preview thành một file có thể phục hồi.
supabase db dump --db-url "$SUPABASE_DATABASE_URL" -f preview-checkpoint-before-v2.sql
```

- [ ] File dump đã tạo và có kích thước > 0 byte.
- [ ] Ghi lại timestamp và tên file dump ở nơi nhóm vận hành xem được (không commit file dump vào
      git — có thể chứa dữ liệu test có định dạng giống thật).

Nếu preview không có dữ liệu đáng giữ (project mới tạo riêng cho đợt thử nghiệm này), có thể bỏ
qua bước dump và coi "tạo lại project preview" là checkpoint — ghi rõ lựa chọn nào đã dùng.

## 2. Thứ tự migration

**Đúng thứ tự file, không nhảy cóc, không chạy song song:**

```text
202607280001_assigned_officer_display_name.sql
202607280002_officer_assisted_intake.sql
202607280003_upload_attempt_metrics.sql
202607280004_public_file_normalization_metadata.sql
```

Áp dụng bằng Supabase CLI (cách sanctioned theo `docs/brain/05-testing-and-deploy.md`):

```powershell
supabase link --project-ref <preview-project-ref>
supabase db push
```

`db push` áp mọi migration chưa chạy theo đúng thứ tự tên file — không cần chạy tay từng file trừ
khi đang gỡ lỗi một migration cụ thể. Nếu buộc phải chạy tay qua SQL Editor, giữ đúng thứ tự trên
và dán **nguyên văn** nội dung file — không sửa tay rồi quên đồng bộ lại source (quy tắc đã chốt ở
`docs/brain/05-testing-and-deploy.md`).

## 3. Lệnh kiểm tra sau MỖI migration

Không đợi cả bốn chạy xong mới kiểm — kiểm ngay sau từng file để bắt lỗi đúng chỗ nó xảy ra.

### Sau `202607280001`

```sql
select column_name, is_nullable from information_schema.columns
where table_schema='public' and table_name='public_submissions'
  and column_name='claimed_by_display_name';
-- kỳ vọng: 1 dòng, is_nullable = YES
```

### Sau `202607280002`

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='public_submissions'
  and column_name in ('intake_channel','assisted_by_email','assisted_by_display_name','assisted_at');
-- kỳ vọng: 4 dòng

select conname from pg_constraint
where conname in ('public_submissions_intake_channel_check','public_submissions_assisted_actor_check');
-- kỳ vọng: 2 dòng

select intake_channel, count(*) from public.public_submissions group by 1;
-- kỳ vọng: mọi hàng cũ đều SELF_SERVICE, không hàng nào NULL
```

### Sau `202607280003`

```sql
select count(*) from public.public_upload_attempts;
-- kỳ vọng: 0 (bảng mới, rỗng), không lỗi "relation does not exist"

select conname from pg_constraint where conname like 'public_upload_attempts%';
-- kỳ vọng: 7 dòng (document_type, outcome, platform, connection, duration, size, retry)
```

### Sau `202607280004`

```sql
select count(*) from information_schema.columns
where table_schema='public' and table_name='public_files'
  and column_name in ('source_size_bytes','source_mime_type','source_width','source_height',
                      'upload_width','upload_height','normalization_version');
-- kỳ vọng: 7
```

### Kiểm tổng hợp — chạy một lệnh thay vì bốn lệnh trên

```bash
SUPABASE_DATABASE_URL="$PREVIEW_DATABASE_URL" npx tsx scripts/preflight-public-intake-v2-migrations.ts
```

Script này gói lại toàn bộ 17 kiểm tra ở trên (cột, bảng, constraint, index, và một kiểm tra dữ
liệu: không hồ sơ `OFFICER_ASSISTED` nào thiếu dấu vết cán bộ) thành một lần chạy, thoát mã khác 0
nếu có bất kỳ điều gì không đạt — dùng làm gate tự động được, không phải chỉ để đọc bằng mắt.

- [ ] `npm run preflight:public-intake-v2-migrations` báo "Schema sẵn sàng. Có thể deploy code."

## 4. Dấu hiệu phải rollback

| Dấu hiệu                                           | Mức độ                   | Diễn giải                                                                                                                                            |
| -------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preflight` báo FAIL ở bất kỳ dòng nào             | **Dừng ngay**            | Migration chưa áp đủ hoặc áp sai — đừng deploy code, đừng chạy migration tiếp theo                                                                   |
| `GET /api/health/database` trả lỗi sau khi migrate | **Dừng ngay**            | Kết nối hoặc schema tối thiểu hỏng                                                                                                                   |
| CHECK constraint fail lúc `db push` (202607280002) | Thấp nhưng phải điều tra | Chỉ xảy ra nếu preview đã có hàng `intake_channel='OFFICER_ASSISTED'` từ trước migration — không nên tồn tại. Kiểm bằng câu SQL ở mục "hàng cũ" trên |
| `db push` báo lỗi khóa bảng / timeout              | Trung bình               | Bảng `public_submissions` đang bị khóa bởi truy vấn khác — thử lại ngoài giờ ít traffic, không ép chạy                                               |
| Code đã deploy nhưng màn hình hồ sơ 500 hàng loạt  | **Khẩn**                 | Dấu hiệu kinh điển của "code trước, migration sau" — xem mục 6                                                                                       |

## 5. Cách rollback

Rollback SQL đầy đủ (theo đúng thứ tự ngược 4→1) đã có sẵn ở
`evidence/PUBLIC_INTAKE_V2_MIGRATION_REVIEW_V2.md` mục "Rollback". Không chép lại ở đây để tránh
hai bản có thể lệch nhau — luôn lấy từ file đó.

Quy trình:

1. Nếu code đã deploy: **rollback code trước** (revert về commit trước `210067c` cho Phase 5, hoặc
   trước `aa2135e` cho toàn bộ V2 tùy phạm vi sự cố).
2. Chạy rollback SQL theo thứ tự ngược trong `PUBLIC_INTAKE_V2_MIGRATION_REVIEW_V2.md`.
3. Nếu có backup từ mục 1: cân nhắc phục hồi toàn bộ từ dump thay vì rollback SQL từng phần, đặc
   biệt nếu đã có dữ liệu preview thật sự trong bảng `public_upload_attempts`.
4. Chạy lại `npm run preflight:public-intake-v2-migrations` sau rollback — kỳ vọng các cột/bảng
   V2 biến mất, không còn kiểm tra nào liên quan chạy được (script sẽ báo FAIL cho các dòng đó,
   đúng như kỳ vọng sau rollback — đọc "FAIL" ở bước này là tín hiệu ĐÚNG, không phải sự cố).

## 6. Deploy code CHỈ SAU KHI preflight PASS

**Thứ tự bắt buộc: migration → preflight PASS → deploy code.** Không có ngoại lệ, không "deploy
trước rồi migrate ngay sau" — khoảng hở dù chỉ vài giây vẫn là 500 hàng loạt cho bất kỳ ai mở màn
hình hồ sơ trong khoảng đó, vì `SUBMISSION_SELECT` chọn các cột chưa tồn tại.

Checklist deploy:

- [ ] Bốn migration đã chạy trên preview, theo đúng thứ tự.
- [ ] `npm run preflight:public-intake-v2-migrations` PASS toàn bộ.
- [ ] `GET /api/health/database` trả `status: "ok"`.
- [ ] Deploy code nhánh `claude/land-declaration-process-feedback-126f2e` lên preview (Vercel
      preview deployment — KHÔNG merge `main`, KHÔNG deploy production).
- [ ] Sau deploy: mở `/ke-khai`, `/submissions`, `/tra-cuu` — không trang nào 500.
- [ ] Chạy `npm run test:e2e:preview` theo `evidence/PUBLIC_INTAKE_V2_E2E_CHECKLIST.md`.

## 7. Sau khi xong — dọn dữ liệu test

Sau các đợt chạy E2E lặp lại, dọn dữ liệu bằng:

```bash
npm run cleanup:e2e-preview-data              # chạy khô, chỉ liệt kê
npm run cleanup:e2e-preview-data -- --apply --confirm=<token in ra ở lần chạy khô>
npx tsx scripts/audit-orphan-public-files.ts --apply --confirm=<token>   # dọn nốt Drive
```

Không xóa dữ liệu ngoài các hồ sơ mang số điện thoại E2E cố định — xem đầu file
`scripts/cleanup-e2e-preview-data.ts` để biết lý do dùng số điện thoại làm nhãn thay vì tiền tố mã
tiếp nhận (mã tiếp nhận do máy chủ sinh bằng HMAC, client không đặt được tiền tố).
