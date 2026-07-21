# 01 — Architecture

## Stack

> Đây là stack đã **chốt trong tài liệu** (`AGENTS.md`, `PLAN.md`). Nền Next.js, TypeScript, Tailwind, Zod và bộ test đã có trong `package.json`; các dependency tích hợp Google/QR/HEIC sẽ chỉ được thêm ở mốc cần dùng.

| Layer             | Công nghệ                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend          | Next.js App Router (TypeScript strict) + Tailwind CSS, PWA                                                                                                                        |
| Backend           | Next.js API Route Handlers, cùng codebase với frontend                                                                                                                            |
| Database          | Không dùng DB truyền thống — Google Sheets là kho dữ liệu có cấu trúc duy nhất                                                                                                    |
| Lưu file          | Google My Drive (cá nhân, tài khoản `anmphongandn@gmail.com`)                                                                                                                     |
| Hạ tầng / Hosting | Vercel, ưu tiên region `sin1` (Singapore)                                                                                                                                         |
| Khác              | Zod (validation), Auth.js/Google OAuth, Google API Node client, `@zxing/browser` (đọc QR client-side), `heic2any`/`libheif-js` (chuyển HEIC→JPEG client-side), Vitest, Playwright |

## Cấu trúc thư mục chính

Scaffold mã nguồn hiện có:

```
.
├── AGENTS.md                 — chỉ dẫn kiến trúc/triển khai bắt buộc (chi tiết nhất)
├── PLAN.md                   — kế hoạch triển khai theo mốc M0–M5
├── README.md                 — tổng quan dự án
├── docs/
│   ├── architecture.md       — kiến trúc thử nghiệm (bản rút gọn, có sơ đồ mermaid)
│   └── brain/                — bộ nhớ AI dùng chung (thư mục này)
├── scripts/                  — bootstrap My Drive/Google Sheets chạy cục bộ
├── src/
│   ├── app/                  — App Router, manifest và global styles
│   ├── components/           — đăng ký PWA client-side
│   ├── lib/                  — metadata dùng chung ban đầu
│   └── modules/              — biên giới domain, repository và nghiệp vụ
├── public/                   — service worker online-only và biểu tượng PWA
├── tests/                    — Vitest và Playwright scaffold
└── Tai lieu/                 — nguồn nghiệp vụ gốc, giữ nguyên nội dung
```

Cấu trúc module đã tạo ở M0 Task 3: `auth`, `cases`, `files`, `drive`, `sheets`, `qr`, `users`, `reports`, `audit`, `common`. M1 bổ sung client Google chỉ dành cho server/CLI và schema bootstrap; repository nghiệp vụ vẫn sẽ được triển khai ở các mốc sau.

## Code Graph (bản đồ module)

M0 Task 3 đã mở rộng Code Graph bằng các quan hệ import thực tế. Những module này là nền cho các mốc sau; không được để component frontend hoặc service nghiệp vụ vượt qua hai repository để gọi Google API trực tiếp.

```text
src/app/layout.tsx
├── src/components/pwa-register.tsx → public/sw.js
├── src/lib/app-metadata.ts
└── src/app/globals.css

src/app/page.tsx ───────────────→ src/lib/app-metadata.ts
src/app/manifest.ts ────────────→ src/lib/app-metadata.ts
tests/app-metadata.test.ts ─────→ src/lib/app-metadata.ts
tests/e2e/home.spec.ts ─────────→ Next.js app qua Playwright

src/modules/common/domain.ts
├── src/modules/auth/index.ts
├── src/modules/cases/index.ts
├── src/modules/users/index.ts
└── src/modules/reports/index.ts

src/modules/files/index.ts ─────→ kiểu file nội bộ (file_id tách Drive ID)
src/modules/qr/index.ts ────────→ quy ước giải mã QR phía client
src/modules/audit/index.ts ─────→ kiểu tham chiếu audit append-only
src/modules/sheets/index.ts ────→ src/modules/sheets/data-repository.ts
src/modules/drive/index.ts ─────→ src/modules/drive/storage-repository.ts
tests/domain.test.ts ───────────→ src/modules/common/domain.ts
tests/api-error.test.ts ───────→ src/modules/common/api-error.ts
tests/env.test.ts ─────────────→ src/modules/common/env.ts

src/modules/bootstrap/schema.ts
├── src/modules/common/domain.ts
├── scripts/bootstrap-google.ts
├── src/app/api/health/google/route.ts
└── tests/bootstrap-schema.test.ts

src/modules/bootstrap/index.ts ─→ src/modules/bootstrap/schema.ts
src/modules/google/workspace-client.ts ─→ Google API Node client (`googleapis`)

scripts/bootstrap-google.ts
├── src/modules/bootstrap
└── src/modules/google/workspace-client.ts

src/app/api/health/google/route.ts
├── src/modules/bootstrap
├── src/modules/common/api-error.ts
├── src/modules/common/env.ts
└── src/modules/google/workspace-client.ts

src/app/ke-khai/wizard.tsx
└── POST /api/public/submissions (UUID idempotency-key, retry 5xx/network)
    ├── src/modules/public-intake/creation-idempotency.ts (HMAC định danh/mã ổn định)
    ├── src/modules/public-intake/repository.ts
    │   └── Google Sheets batch PUBLIC_SUBMISSIONS + REQUEST_LOG
    ├── src/modules/public-intake/storage.ts ─→ Google Drive 01_INBOX
    └── src/modules/public-intake/session.ts ─→ cookie + CSRF phiên công khai
tests/public-submission-create.test.ts ─→ route tạo nháp, replay, concurrent retry, lỗi Google
src/app/submissions/page.tsx ─→ src/components/submissions-queue.tsx
  └── GET /api/submissions ─→ PublicIntakeRepository (Google Sheets)
src/app/submissions/[submissionId]/page.tsx ─→ src/components/submission-detail.tsx
  └── GET/POST /api/submissions/:submissionId ─→ authorization + CSRF + transition/audit
```

Ràng buộc kiến trúc bắt buộc khi mở rộng Code Graph (đã chốt trong `AGENTS.md` §3.1):

- Tách rõ `DataRepository` (đọc/ghi Google Sheets) và `StorageRepository` (thao tác Google Drive).
- Service nghiệp vụ và component frontend **không được gọi trực tiếp** Google Drive/Sheets API — luôn đi qua hai repository trên.

### Luồng xử lý chính (dự kiến, theo `docs/architecture.md`)

```
Cán bộ chọn tổ dân phố → tạo hồ sơ (reserve case ID qua ID_RESERVATIONS append-only)
  → case DRAFT
  → chụp/chọn 1 CCCD mặt trước + 1-10 ảnh GCN
  → browser: kiểm tra định dạng/dung lượng, tạo preview, thử đọc QR (@zxing/browser)
  → API initiate resumable upload session
  → browser upload trực tiếp lên Google Drive (KHÔNG qua body của Vercel Function)
  → API complete: xác minh metadata/dung lượng/checksum/thư mục cha
  → đủ 1 CCCD + ≥1 GCN → case chuyển UPLOADED
  → cán bộ kiểm tra/xác nhận dữ liệu → PENDING_REVIEW → VERIFIED (hoặc NEEDS_MORE_DOCUMENTS → quay lại UPLOADED)
  → VERIFIED → ARCHIVED (chỉ SYSTEM_ADMIN/WARD_ADMIN)
```

### Code Graph bổ sung M2

```text
src/auth.config.ts -> Google OAuth config an toàn cho Node/Edge
src/auth.ts
├── src/auth.config.ts
├── src/modules/auth/authorization.ts -> USERS allowlist + audit từ chối đăng nhập
└── src/app/api/auth/[...nextauth]/route.ts
src/proxy.ts -> src/auth.config.ts (chặn session ở Edge cho /profile, /users)
src/modules/auth/authorization.ts
├── src/auth.ts (đọc session)
└── src/modules/users/google-sheets-user-repository.ts
src/app/api/users/route.ts
├── src/modules/auth/authorization.ts
├── src/modules/auth/csrf.ts
└── src/modules/users/google-sheets-user-repository.ts -> Google Sheets batchUpdate
src/app/api/security/csrf/route.ts -> authorization + CSRF HMAC
```

## Mô hình dữ liệu / API

Chi tiết đầy đủ nằm ở `AGENTS.md` §4 (mô hình dữ liệu) và §5 (API). Tóm tắt:

**Google Sheets tabs**: `CASES`, `CERTIFICATES`, `OWNERS`, `FILES`, `IDENTITY_QR_SCANS`, `USERS`, `REFERENCE_DATA`, `AUDIT_LOGS`, `ID_RESERVATIONS`, `REQUEST_LOG`, `SEARCH_INDEX` (đang dùng); `PARCELS`, `ASSETS`, `OCR_FIELDS` (tạo sẵn cho nâng cấp, chưa dùng trong luồng MVP), cùng bảy tab `PUBLIC_*` của cổng kê khai. `REQUEST_LOG` giữ idempotency key và kết quả đã cache tối thiểu 24 giờ; tạo nháp công khai ghi `PUBLIC_SUBMISSIONS` + `REQUEST_LOG` trong cùng batch và không cache mã bí mật rõ.

**API chính**:

```
POST/GET   /api/cases
GET/PATCH  /api/cases/:caseId
POST       /api/cases/:caseId/uploads/initiate
POST       /api/cases/:caseId/uploads/complete
DELETE     /api/cases/:caseId/files/:fileId
POST       /api/cases/:caseId/qr/confirm
POST       /api/cases/:caseId/request-more-documents
POST       /api/cases/:caseId/verify
GET        /api/dashboard/summary
POST       /api/exports
GET/POST/PATCH /api/users
GET        /api/health/google
GET        /api/security/csrf
POST       /api/public/submissions
GET/PATCH  /api/public/submissions/current
POST       /api/public/submissions/current/uploads/initiate
POST       /api/public/submissions/current/uploads/complete
POST       /api/public/submissions/current/submit
```

Google Drive folder layout:

```
CSDL-DAT-DAI-PHONG-CHAU-THU-NGHIEM/
├── 00_CONFIG/
├── 01_INBOX/
├── 02_CASES/{TDP_CODE}/{CASE_ID}/
│   ├── originals/
│   └── previews/
├── 03_EXPORTS/
└── 99_BACKUP/
```

## Biến môi trường

```
APP_BASE_URL=
AUTH_SECRET=
AUTH_GOOGLE_CLIENT_ID=
AUTH_GOOGLE_CLIENT_SECRET=
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_MY_DRIVE_ROOT_FOLDER_ID=
GOOGLE_SHEETS_SPREADSHEET_ID=
SYSTEM_ADMIN_EMAIL=anmphongandn@gmail.com
DATA_HASH_PEPPER=
MAX_UPLOAD_MB=30
VERCEL_REGION=sin1
```

Không dùng `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHARED_DRIVE_ID`, `GOOGLE_VISION_PROJECT_ID`, `TEMP_FILE_DIR` trong bản thử nghiệm.

`.env.example` là mẫu cấu hình được commit. Chỉ server gọi `loadServerEnvironment` trong `src/modules/common/env.ts`; lỗi validation chỉ công bố tên biến sai/thiếu, không bao giờ giá trị secret. API route sử dụng `createApiErrorPayload` trong `src/modules/common/api-error.ts` để giữ cấu trúc lỗi `{ error: { code, message, requestId, details } }` nhất quán.

M1 có `scripts/bootstrap-google.ts`, chạy cục bộ để xin OAuth offline và tạo idempotent cây thư mục, spreadsheet, 14 tab cùng dữ liệu danh mục/`SYSTEM_ADMIN`. Tệp `.bootstrap-state.json` chỉ giữ các ID cấu hình, còn `.bootstrap-secrets.json` giữ refresh token tạm thời; cả hai đã bị Git bỏ qua. Endpoint `GET /api/health/google` chỉ cần năm biến cấu hình kho Google của M1 (không đòi OAuth đăng nhập M2), kiểm tra token, thư mục gốc và schema Sheets rồi trả trạng thái tổng quát — không trả Drive ID, spreadsheet ID hoặc PII.

## Trạng thái PWA scaffold

- `src/app/manifest.ts` cung cấp metadata cài đặt PWA.
- `src/components/pwa-register.tsx` chỉ đăng ký service worker ở production.
- `public/sw.js` không cache API, ảnh hoặc dữ liệu nghiệp vụ; PWA vẫn online-only để tránh lưu PII trong cache thiết bị.

## Lưu ý kiến trúc quan trọng

- Ảnh gốc **không đi qua body của Vercel Function** — upload trực tiếp browser → Drive qua resumable upload session, backend chỉ tạo session và xác minh sau khi hoàn tất.
- Không dùng service account: service account không thể sở hữu file trên My Drive cá nhân — bắt buộc dùng OAuth offline của tài khoản quản trị.
- OAuth consent screen phải ở trạng thái `In production` trước khi dùng dữ liệu thật; để `Testing` có thể khiến refresh token Drive hết hạn sau 7 ngày.
- Không cập nhật Google Sheets theo từng ô — dùng batch read/write, cache đọc ngắn hạn có invalidation khi ghi.
- `file_id` nội bộ bất biến, tách khỏi `drive_file_id` (hạ tầng, có thể đổi khi migration sang Shared Drive).
- Giới hạn quy mô: tối đa 500 hồ sơ ở bản thử nghiệm — đây là ràng buộc kiến trúc (My Drive cá nhân + Google Sheets), không phải con số tùy ý.
- **Scope `drive.file`**: bootstrap thư mục gốc Drive phải chạy bằng cùng OAuth client dùng ở production — tạo thủ công qua Drive UI sẽ khiến app không có quyền ghi (xem `03-decisions.md`).
- **Single point of failure**: toàn bộ dữ liệu (Drive + Sheets + refresh token) phụ thuộc một tài khoản Gmail cá nhân (`anmphongandn@gmail.com`). Backup phải tách khỏi tài khoản này, không chỉ copy trong cùng Drive (xem `PLAN.md` §4 M5.3).
- **Write quota Google Sheets**: mỗi thao tác nghiệp vụ kéo theo nhiều lần ghi (bản ghi chính + `AUDIT_LOGS` + `SEARCH_INDEX`) — gộp thành `batchUpdate` để giảm khả năng chạm quota khi nhiều cán bộ thao tác cùng lúc.
- Case ID tính năm theo múi giờ `Asia/Ho_Chi_Minh` (UTC+7), không dùng UTC mặc định của Vercel.
- PWA online-only: báo lỗi mất kết nối rõ ràng, không cam kết lưu nháp hoặc upload khi offline.
- Xóa GCN chỉ là soft-delete; CCCD chỉ được thay sau khi ảnh mới upload/xác minh thành công, không được xóa trắng.
