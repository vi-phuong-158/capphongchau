# 01 — Architecture

## Stack hiện tại

| Layer            | Công nghệ                                                                   |
| ---------------- | --------------------------------------------------------------------------- |
| Frontend         | Next.js App Router, TypeScript strict, Tailwind, PWA online-only            |
| Backend          | Next.js Route Handlers trên Vercel `sin1`                                   |
| Database         | Supabase PostgreSQL tại Singapore, kết nối qua Supavisor transaction pooler |
| File storage     | Google My Drive cá nhân của tài khoản quản trị                              |
| Auth             | Auth.js + Google Sign-In; allowlist/roles trong bảng `users`                |
| Client utilities | Zod, ZXing, HEIC→JPEG client-side                                           |
| Test             | Vitest, Playwright                                                          |

Quyết định dùng Google Sheets làm kho runtime đã bị thay thế ngày 2026-07-23. Sheets chỉ còn là nguồn ETL legacy; Drive vẫn giữ file.

## Cấu trúc quan trọng

```text
supabase/migrations/
└── 202607230001_supabase_schema.sql       schema/constraint/RLS
scripts/
├── migrate-sheets-to-supabase.ts          ETL một lần, transaction + marker
├── migrate-public-intake.ts                schema Sheets legacy
└── migrate-citizen-id-pairs.ts             schema Sheets legacy
src/modules/supabase/database.ts             PostgreSQL client + health
src/modules/public-intake/repository.ts      repository hồ sơ Supabase
src/modules/users/supabase-user-repository.ts allowlist/roles Supabase
src/modules/drive/                           StorageRepository Google Drive
src/modules/public-intake/storage.ts         resumable upload + verify Drive
src/app/api/health/database/route.ts         health Supabase
src/app/api/health/google/route.ts           health Google Drive
```

## Code Graph

```text
src/modules/common/env.ts
├── loadSupabaseEnvironment → SUPABASE_DATABASE_URL
├── loadGoogleStorageEnvironment → Drive runtime
└── loadLegacyGoogleSheetsEnvironment → chỉ script bootstrap/ETL

src/modules/supabase/database.ts
├── postgres(SUPABASE_DATABASE_URL, prepare:false, max:1)
├── PublicIntakeRepository
├── SupabaseUserRepository
└── GET /api/health/database

src/auth.ts / src/modules/auth/authorization.ts
└── getUserRepository → SupabaseUserRepository.findActiveByEmail
    └── public.users (đọc lại mỗi request, không tin role JWT)

src/app/api/users/route.ts
└── SupabaseUserRepository.mutate
    └── transaction: users + audit_logs + request_log

src/app/ke-khai/wizard.tsx
├── POST /api/public/submissions (PUBLIC_CREATE idempotency)
├── PATCH /api/public/submissions/current (version)
├── initiate/complete upload → Google Drive + public_files
└── POST /api/public/submissions/current/submit (PUBLIC_SUBMIT idempotency)
    └── PublicIntakeRepository.submit
        └── transaction: public_submissions + normalized children
            + public_status_events + audit_logs + public_lookup_index + request_log

src/app/submissions/page.tsx / [submissionId]
└── PublicIntakeRepository
    ├── list/listSummaries/findById
    ├── commitStaffAction (transaction)
    ├── commitStaffDraftEdit (transaction) — PATCH sửa trực tiếp draft_json, khóa field QR_CONFIRMED
    │   └── mayStaffEdit / isOwnerIdentityLocked (src/modules/submissions/review.ts)
    ├── commitAccessSecretReset (transaction)
    └── appendAudit / appendExportJob

src/app/api/health/google/route.ts
└── Google Drive OAuth + root folder + quota

scripts/migrate-sheets-to-supabase.ts
├── Google Sheets read-only source
├── typed mapping/rename for legacy tabs
├── one PostgreSQL transaction
└── LEGACY_SHEETS_IMPORT marker + rebuilt lookup index
```

Các module frontend/service không được gọi trực tiếp PostgreSQL hoặc Google API. Dữ liệu cấu trúc đi qua repository; file đi qua `StorageRepository`/storage service.

## Database và bất biến

Migration SQL tạo các nhóm bảng:

- `users`, `audit_logs`, `request_log`, `reference_data`, `id_reservations`, `search_index`.
- `public_submissions`, `public_files`, status/supplement tables và các bảng chuẩn hóa public.
- `existing_certificates`, owners/link/import/index append-only.
- `cases`, `certificates`, `owners`, `files`, QR scans và bảng tương thích nâng cấp.
- `export_jobs`.

Bất biến quan trọng:

- `request_log.idempotency_key` là primary key; advisory transaction lock cho request cùng key.
- Mutation nghiệp vụ + audit/timeline + request log cùng transaction.
- Update version có điều kiện; không khớp → `409 VERSION_CONFLICT`.
- Partial unique index chặn hai ảnh CCCD cùng mặt active.
- `legacy_row_index` chỉ giữ tương thích cookie session v2 trong giai đoạn migration. ETL chèn giá trị legacy phải đồng bộ identity sequence trong cùng transaction để bản ghi mới không va chạm khóa unique.
- Nháp legacy thiếu `owners` được phục hồi có audit; route upload luôn kiểm shape dữ liệu trước khi gọi Drive và trả `409 INVALID_STATE` thay vì lỗi 500.
- GCN cũ append-only; bản mới nhất theo `row_version` có hiệu lực.
- RLS bật, không có policy/quyền cho `anon` và `authenticated`; browser không nhận database secret.

## API liên quan hạ tầng

```text
GET /api/health/database
GET /api/health/google
GET /api/security/csrf
POST/GET/PATCH /api/users
POST /api/public/submissions
GET/PATCH /api/public/submissions/current
POST /api/public/submissions/current/submit
POST /api/public/submissions/current/uploads/initiate
POST /api/public/submissions/current/uploads/complete
GET /api/submissions
GET /api/submissions/:submissionId
PATCH /api/submissions/:submissionId
POST /api/submissions/:submissionId/action
POST /api/submissions/:submissionId/reset-access-secret
POST /api/exports
```

Lỗi API giữ cấu trúc `{ error: { code, message, requestId, details } }`, không trả stack, PII, token hoặc Drive ID/link.

## Cấu hình

```env
APP_BASE_URL=
AUTH_SECRET=
AUTH_GOOGLE_CLIENT_ID=
AUTH_GOOGLE_CLIENT_SECRET=
SUPABASE_DATABASE_URL=
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_MY_DRIVE_ROOT_FOLDER_ID=
SYSTEM_ADMIN_EMAIL=anmphongandn@gmail.com
DATA_HASH_PEPPER=
MAX_UPLOAD_MB=30
VERCEL_REGION=sin1
```

`GOOGLE_SHEETS_SPREADSHEET_ID` là tùy chọn và chỉ cần trong cửa sổ ETL legacy. Không dùng `NEXT_PUBLIC_SUPABASE_*`, service-role key hay Data API ở runtime hiện tại.

## File flow

```text
Browser kiểm tra/chuyển HEIC
→ API initiate tạo resumable Drive session
→ browser upload trực tiếp Drive
→ API complete verify parent/MIME/size/checksum
→ repository transaction ghi metadata Supabase
```

File gốc không đi qua Vercel body. Xóa là soft delete; thay CCCD/GCN phải verify file mới trước khi chuyển file cũ sang `REPLACED`.

## Migration/cutover

```text
Apply supabase/migrations
→ backup + freeze Sheets writes
→ npm run migrate:sheets-to-supabase -- --dry-run
→ npm run migrate:sheets-to-supabase
→ đối chiếu row count/mẫu
→ health database + Drive
→ deploy code Supabase
→ giữ Sheet restricted/read-only trong thời hạn rollback
```

ETL fail-closed: dữ liệu trùng/không hợp lệ làm rollback toàn bộ. Marker theo hash spreadsheet chặn chạy lại sau lần thành công.

## Vận hành

- Supabase project/compute nên ở Singapore gần Vercel `sin1`.
- Vercel dùng URI Supavisor transaction pooler port `6543`; transaction mode không dùng prepared statements.
- Backup Supabase hằng ngày/PITR theo gói và `pg_dump` mã hóa ra nơi độc lập.
- Backup Drive phải tách khỏi Gmail gốc; snapshot trong `99_BACKUP` không đủ.
- Không log query parameters có PII, connection string, QR raw, CCCD đầy đủ hoặc Drive link.
