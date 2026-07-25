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
├── 202607230001_supabase_schema.sql       schema/constraint/RLS
└── 202607240001_official_acceptance.sql   case_counters + saga checkpoint
scripts/
├── migrate-sheets-to-supabase.ts          ETL một lần, transaction + marker
├── migrate-public-intake.ts                schema Sheets legacy
└── migrate-citizen-id-pairs.ts             schema Sheets legacy
src/modules/supabase/database.ts             PostgreSQL client + health
src/modules/public-intake/repository.ts      repository hồ sơ Supabase
src/modules/users/supabase-user-repository.ts allowlist/roles Supabase
src/modules/submissions/acceptance-saga.ts   saga tiếp nhận chính thức resumable
src/modules/public-intake/file-naming.ts     quy ước tên file gốc GCN/GT (thuần, dùng chung)
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
    ├── commitOfficialAmendment (transaction) — PATCH sửa hồ sơ ĐÃ tiếp nhận (Q2, 2026-07-25)
    │   ├── mayAmendOfficialRecord — ACCEPTED + có official_case_id + (người giữ | admin)
    │   ├── bắt buộc amendmentReason >= 10 ký tự → audit OFFICIAL_RECORD_AMENDED
    │   └── syncOfficialRecord (src/modules/submissions/official-record.ts) — CÙNG transaction:
    │       upsert certificates/owners/parcels/assets theo case_id + xóa bản ghi không còn
    │       trong bản kê khai. DÙNG CHUNG với bước RECORDS_WRITTEN của saga.
    ├── commitStaffDraftEdit (transaction) — PATCH sửa trực tiếp draft_json
    │   ├── mayStaffEdit (src/modules/submissions/review.ts) — chỉ người đang giữ + UNDER_REVIEW
    │   ├── isOwnerIdentityQrConfirmed — CẢNH BÁO, không còn khóa cứng (2026-07-25, Q1):
    │   │   cán bộ sửa được cả field QR_CONFIRMED, audit ghi identityOverride
    │   └── refreshCanonicalProjection — XÓA CON TRƯỚC CHA:
    │       land_uses → parcels → owners → certificates → assets
    │       (FK public_land_uses.parcel_id không cascade; sai thứ tự = 500 từ lần sửa thứ hai)
    ├── commitAccessSecretReset (transaction)
    └── appendAudit / appendExportJob

src/app/api/submissions/[submissionId]/accept/route.ts
└── runOfficialAcceptance (src/modules/submissions/acceptance-saga.ts)
    ├── Bước 0 (tx): advisory lock + request_log replay + public_acceptance_sagas
    │   + public_submissions ACCEPTING + audit/timeline (insertAudit/insertTimeline
    │   của PublicIntakeRepository, truyền transaction — KHÔNG dùng method pool)
    ├── ID_RESERVED (tx): case_counters (ON CONFLICT ... RETURNING) + id_reservations
    ├── CASE_FOLDER_READY: storage.findOrCreateFolder 02_CASES/{TDP}/{CASE_ID}/originals
    │   (NGOÀI transaction — quy tắc pool max:1)
    ├── FILES_MOVED: drive.files.update từng file (đổi parent + đổi tên `requestBody.name`),
    │   checkpoint moved_files (NGOÀI tx) — tên sinh bởi buildOriginalFileNames
    │   (src/modules/public-intake/file-naming.ts), issueNumber rỗng → bỏ qua đổi tên
    ├── RECORDS_WRITTEN (tx): cases + files, rồi syncOfficialRecord cho
    │   certificates + owners + parcels(data_json) + assets(data_json),
    │   ID deterministic ACC:{submissionId}:{id|idx-N}, upsert + xóa dòng thừa
    │   (thửa và mục đích sử dụng đi nguyên object vào public.parcels.data_json —
    │    landUses lồng bên trong; bổ sung 2026-07-25, trước đó KHÔNG được ghi đâu cả)
    └── COMPLETED (tx): public_submissions ACCEPTED + official_case_id + request_log

src/modules/public-intake/pl3-export.ts (thuần, không I/O)
├── buildPl3Content(records) → tách sheet PL3 (ACCEPTED) / Ton dong (đang xử lý)
├── scannedFileNames (trường 49) → buildOriginalFileNames cùng file-naming.ts,
│   dùng chung quy ước với bước FILES_MOVED để tên không lệch nhau
└── POST /api/exports (route.ts) không còn lọc theo status — luôn đưa toàn bộ
    allRecords (giới hạn 2000) vào buildPl3Content, để nó tự phân 2 sheet

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

- `users`, `audit_logs`, `request_log`, `reference_data`, `id_reservations`, `case_counters`, `public_acceptance_sagas`, `search_index`.
- `public_submissions`, `public_files`, status/supplement tables và các bảng chuẩn hóa public.
- `existing_certificates`, owners/link/import/index append-only.
- `cases`, `certificates`, `owners`, `files`, QR scans và bảng tương thích nâng cấp.
- `export_jobs`.

Bất biến quan trọng:

- `request_log.idempotency_key` là primary key; advisory transaction lock cho request cùng key.
- Mutation nghiệp vụ + audit/timeline + request log cùng transaction.
- Update version có điều kiện; không khớp → `409 VERSION_CONFLICT`.
- Partial unique index chặn hai ảnh CCCD cùng mặt active.
- `case_counters` cấp số theo năm nguyên tử; lỗ hổng dãy số khi saga bỏ dở được chấp nhận.
- `id_reservations` có thêm `sequence_number`, `official_case_id`, `submission_id`; unique `(year, sequence_number)`; idempotent theo `request_id`.
- Quy tắc pool `max: 1`: không gọi method repository/storage dùng pool bên trong `database.begin`; thao tác Drive luôn nằm ngoài transaction.
- `legacy_row_index` chỉ giữ tương thích cookie session v2 trong giai đoạn migration. ETL chèn giá trị legacy phải đồng bộ identity sequence trong cùng transaction để bản ghi mới không va chạm khóa unique.
- Nháp legacy thiếu `owners` hoặc bị lưu JSON lồng được phục hồi/chuẩn hóa có audit; repository giải mã tương thích trong thời gian chuyển đổi, còn route upload luôn kiểm shape dữ liệu trước khi gọi Drive và trả `409 INVALID_STATE` thay vì lỗi 500.
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
