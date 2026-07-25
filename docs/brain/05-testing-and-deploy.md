# 05 — Testing & Deploy

> Runbook hiện hành cho kiến trúc Supabase PostgreSQL + Google My Drive.
>
> **Trạng thái hiện hành 2026-07-25:** Supabase PostgreSQL đã cutover làm kho runtime; schema và ETL
> dữ liệu thật đã chạy; code production đã dùng repository Supabase. Việc còn lại là xác nhận env/
> health trên Vercel, backup độc lập và giữ Google Sheet cũ read-only.

## Cài đặt local

```powershell
npm install
```

Sao chép `.env.example` thành `.env.local`, thay placeholder bằng secret/ID thật và không commit file.
Trên PowerShell chặn `npm.ps1`, dùng `npm.cmd`.

Biến runtime chính:

```text
APP_BASE_URL, AUTH_SECRET, AUTH_GOOGLE_CLIENT_ID, AUTH_GOOGLE_CLIENT_SECRET,
SUPABASE_DATABASE_URL,
GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN,
GOOGLE_MY_DRIVE_ROOT_FOLDER_ID,
SYSTEM_ADMIN_EMAIL, DATA_HASH_PEPPER, MAX_UPLOAD_MB, VERCEL_REGION,
PUBLIC_SESSION_SECRET, PUBLIC_ACCESS_CODE_PEPPER,
ORIGIN_SHARED_SECRET, NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY
```

`GOOGLE_SHEETS_SPREADSHEET_ID` chỉ cần trên máy chạy ETL legacy, không cần ở request runtime sau
cutover. `SUPABASE_DATABASE_URL` là secret server; không dùng tiền tố `NEXT_PUBLIC_`.

Ở local dùng bộ khóa test chính thức của Cloudflare Turnstile trong `.env.example`. Không tạo nhánh
bypass trong code.

## Tạo Supabase

1. Tạo project ở Singapore gần Vercel `sin1`.
2. Lấy URI **Supavisor transaction pooler**, port `6543`. Runtime đặt `prepare: false`; không dùng URI
   session/direct cho Vercel serverless nếu chưa có lý do vận hành riêng.
3. Áp dụng theo thứ tự các file trong `supabase/migrations/`. Với Supabase CLI:

```powershell
supabase link --project-ref <project-ref>
supabase db push
```

Có thể dùng SQL Editor theo quy trình quản trị, nhưng production schema phải luôn được phản ánh lại
trong migration file — không sửa tay rồi bỏ quên source.

4. Đặt `SUPABASE_DATABASE_URL` vào `.env.local` và Vercel Production/Preview phù hợp.
5. Gọi `GET /api/health/database`; kết quả `status: "ok"` xác nhận kết nối và schema tối thiểu.

RLS đã bật và quyền `anon`/`authenticated` đã bị thu hồi. App không dùng Supabase Data API/Auth cho
client; không tạo policy mở bảng chỉ để health hoặc debug.

## Bootstrap Google Drive

Google Drive vẫn là kho file. Với môi trường mới, chạy `npm run bootstrap:google` bằng OAuth Desktop
client để tạo cây Drive bằng đúng production OAuth client/scope `drive.file`. Script cũ còn tạo
spreadsheet vì mục đích tương thích/migration; sau cutover runtime chỉ cần `rootFolderId` và refresh
token. `GET /api/health/google` kiểm tra OAuth Drive, root folder và quota, không còn kiểm tra Sheets.

`.bootstrap-state.json` và `.bootstrap-secrets.json` bị Git bỏ qua. Xóa file secret tạm sau khi chuyển
refresh token vào secret store.

## Cutover Google Sheets → Supabase (đã hoàn tất)

Quy trình dưới đây là runbook lịch sử đã thực hiện. Không chạy lại ETL trên production; chỉ dùng khi
phục hồi có kiểm soát hoặc dựng môi trường legacy riêng.

### Các bước đã thực hiện trước cửa sổ bảo trì

- [ ] Tạo backup restricted của spreadsheet và ghi checksum/thời điểm.
- [ ] Áp dụng SQL migration trên Supabase đích.
- [ ] Xác nhận `GET /api/health/database` và quyền RLS/revoke.
- [ ] Đặt đủ env Google legacy trên máy ETL; không đặt log verbose chứa dữ liệu hàng.
- [ ] Chạy dry-run:

```powershell
npm run migrate:sheets-to-supabase -- --dry-run
```

Dry-run chỉ đọc Sheets, kiểm tra parse và báo số dòng theo tab; không ghi PostgreSQL.

### Các bước đã thực hiện trong cửa sổ bảo trì

1. Tạm dừng cổng ghi/autosave và xác nhận không còn request đang chạy.
2. Chạy ETL thật đúng một lần:

```powershell
npm run migrate:sheets-to-supabase
```

ETL nạp dữ liệu và marker trong một PostgreSQL transaction. Dòng trùng, khóa ngoại sai hoặc kiểu dữ
liệu hỏng làm rollback toàn bộ. Sau thành công, cùng spreadsheet bị từ chối nhập lại.

3. Đối chiếu tối thiểu:

- số dòng `public_submissions`, `public_files`, `users`, `audit_logs`;
- 10 hồ sơ mẫu ở nhiều trạng thái, gồm draft, submitted, supplement và accepted;
- cặp ảnh CCCD/GCN, Drive ID nội bộ và checksum;
- `EXISTING_*`/lookup HMAC, request log, timeline và supplement;
- user allowlist/roles/active;
- `legacy_row_index` của submission khớp locator phiên v2 cũ.

4. Đã gọi health checks và deploy code dùng Supabase; việc kiểm tra lại health trên Vercel Production
   vẫn là checklist vận hành định kỳ.
5. Smoke test tạo nháp, autosave, upload, submit, tra cứu, staff action, reset secret, export và khóa user.
6. Giữ spreadsheet restricted/read-only trong cửa sổ rollback đã phê duyệt. Không xóa nguồn ngay.

Nếu ETL lỗi, sửa mapping/schema bằng migration mới rồi chạy lại; transaction đã rollback nên chưa có
trạng thái nửa vời. Nếu đã deploy nhưng phát hiện lỗi dữ liệu, đóng cổng ghi trước khi quyết định
rollback; không chạy đồng thời hai nguồn thật.

## Chạy ứng dụng và kiểm tra

```powershell
npm run dev
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:python
npm run build
npm run test:e2e
```

Checklist trước deploy:

- [ ] TypeScript strict, lint, unit test và build pass.
- [ ] Migration SQL áp dụng thành công trên môi trường đích sạch và bản nâng cấp thử nghiệm.
- [ ] API write có auth/allowlist, CSRF, idempotency, transaction và audit phù hợp.
- [ ] Không log connection string, PII, QR raw, CCCD đầy đủ, token hoặc Drive link/ID.
- [ ] Unique constraint chặn hai ảnh CCCD cùng mặt active; replace xác minh file mới trước.
- [ ] Response bị mất rồi retry create/submit/staff action không tạo bản ghi trùng.
- [ ] Cache miss tạo thư mục Drive đã được kiểm bằng advisory lock theo `(parentId, name)`; không gọi
      `findOrCreateFolder` bên trong một transaction database đang mở.
- [ ] Điều chỉnh hồ sơ `ACCEPTED` cập nhật đồng thời `official_payload_*` và các bảng chính thức.
- [ ] Email ngoài `users` bị từ chối dù Google Sign-In thành công.
- [ ] QR thất bại không làm mất draft.
- [ ] Ảnh gốc không đi qua body Vercel Function.

## Deploy Vercel và Cloudflare

- Vercel ưu tiên region `sin1`; đặt `SUPABASE_DATABASE_URL` pooler cho đúng môi trường.
- OAuth consent screen Google phải `In production` trước dữ liệu thật.
- Cloudflare proxy dùng SSL Full (strict), Transform Rule gắn `X-Origin-Auth`, bypass cache cho
  `/api/*` và `/ke-khai*`, Turnstile/rate limit theo `PLAN2.md`.
- Xóa `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE` trước dữ liệu thật; URL `*.vercel.app` gọi thẳng API public
  phải bị từ chối.
- Preview chỉ dùng dữ liệu giả/ẩn danh và database project/schema tách phù hợp.

Nghiệm thu lớp biên:

- gọi thẳng Vercel public API → 403;
- qua domain thật → hoạt động;
- `/api/*` và `/ke-khai*` không cache;
- Turnstile rỗng/replay/siteverify lỗi → fail-closed;
- trang cán bộ và Google Sign-In vẫn hoạt động.

## Backup và phục hồi

- Bật backup hằng ngày/PITR theo gói Supabase phù hợp yêu cầu RPO/RTO.
- Định kỳ chạy `pg_dump` và lưu bản mã hóa ở nơi độc lập với Supabase và Gmail; kiểm checksum.
- Diễn tập restore vào project/database tách biệt và ghi thời gian phục hồi thực tế.
- Snapshot Drive trong `99_BACKUP` vẫn nằm cùng Gmail, không bảo vệ khi tài khoản gốc bị khóa. Phải có
  bản sao file mã hóa ngoài tài khoản này.
- Không coi spreadsheet read-only sau cutover là backup lâu dài duy nhất; nó chỉ là nguồn rollback
  theo thời hạn đã chốt.

## Công cụ legacy

`npm run migrate:public-intake`, `npm run migrate:citizen-id-pairs` và
`scripts/import_existing_certificates.py` thao tác schema/dữ liệu Google Sheets cũ. Chỉ dùng trước
cutover hoặc cho phục hồi nguồn legacy có kiểm soát; không chạy như migration runtime sau khi
Supabase là nguồn thật. Import GCN mới sau cutover phải được chuyển sang repository/Supabase, không
ghi Sheet rồi chờ đồng bộ tự động (không có đồng bộ hai chiều).
