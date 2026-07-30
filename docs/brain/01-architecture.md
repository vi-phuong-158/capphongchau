# 01 — Architecture

> Cập nhật PR #8 (2026-07-29): `PUT /api/submissions/:id/working-payload` so sánh payload hiệu lực
> trước khi commit. Sửa bốn trường định danh sau `QR_CONFIRMED` bắt buộc lý do và server chuyển sang
> `QR_OVERRIDE_PENDING_REVIEW`; sửa sau `MANUAL_COMPLETE` xóa dấu xác nhận và về
> `PENDING_CONFIRMATION`. Client không tự gán trạng thái/nguồn/thời điểm định danh. GET detail trả
> `files[].ownerId` nội bộ để `DocumentViewer` gắn đúng chủ ảnh CCCD.

## Cập nhật Code Graph 2026-07-29 — Phase 1 hiệu năng hàng chờ

```text
src/components/submissions-queue.tsx
├── query < 2 ký tự → không gửi tìm kiếm
├── query hợp lệ → debounce 350 ms + AbortController request cũ
└── GET /api/submissions?status&q&cursor
    ├── requireActiveUser(SUBMISSION_READ_ROLES)
    ├── validate status + decode cursor base64url {updatedAt, submissionId}
    └── PublicIntakeRepository.listQueuePage
        └── PostgreSQL:
            WHERE status/search
            + keyset (updated_at, submission_id)
            + ORDER BY updated_at DESC, submission_id DESC
            + LIMIT 101 → trả tối đa 100

202607290004_queue_search_performance.sql
├── generated: queue_owner_name, queue_issue_number
├── btree: status/updated_at/submission_id + all-status page
└── pg_trgm GIN: receipt_code, queue_issue_number, queue_owner_name
```

## Cập nhật Code Graph 2026-07-29 — review PR #6

```text
POST /api/public/submissions/current/uploads/complete
├── findStoredMutation(PUBLIC_UPLOAD_COMPLETE) trước validation upload/replace
├── replay → trả nguyên fileId/sizeBytes đã commit
└── mọi lỗi cleanup → discardIfOrphan → isDriveFileAdopted → StorageRepository.discardFile

POST /api/staff/assisted-submissions/current/submit
├── requireActiveUser(ASSISTED_INTAKE_ROLES) + staff CSRF
├── public session ký chỉ định vị submission OFFICER_ASSISTED
└── validateCitizenSubmitDraft/files → repository.submit transaction; không Turnstile

PATCH /api/public/submissions/current
└── body.version === record.version → saveDraft(expectedVersion) → SQL WHERE version = expected

completionChecks
└── consentAccepted + identity confirmed; QR_OVERRIDE_PENDING_REVIEW là BLOCKING

PublicIntakeRepository
├── create transaction: submission + request_log + consent audit
└── listTimeline → serializePublicTimelineEvent allowlist + sanitize legacy

202607290001_public_upload_attempts_rls.sql
└── ENABLE/FORCE RLS + REVOKE anon/authenticated; không public policy

POST /api/public/certificate-lookup
├── Turnstile `lookup` + edge guard
├── QR CCCD giữ decode client-side; số GCN nhận `issueNumber` + `issueDate`
├── certificate-normalization.ts: bỏ space/hyphen, uppercase; date hợp lệ
└── PublicIntakeRepository.lookupCertificateByIssue
    ├── advisory lock theo HMAC nguồn → 8 lượt/10 phút, audit cùng transaction
    ├── `public_certificates` active → IN_PROCESSING
    └── `certificates` + latest VERIFIED `existing_certificates` → OFFICIALLY_RECEIVED

POST /api/public/submissions/current/certificate-duplicate-check
└── public session + CSRF + idempotency → cùng repository, loại trừ submission đang kê khai
```

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
├── 202607230001_supabase_schema.sql                       schema/constraint/RLS gốc
├── 202607240001_repair_public_submission_identity_and_drafts.sql
├── 202607240002_normalize_legacy_public_draft_json.sql
├── 202607240003_official_acceptance.sql                   case_counters + saga checkpoint
│   (đổi tên từ 202607240001 — hai file từng trùng version, xem 03-decisions.md)
├── 202607250002_submission_payload_layers.sql              citizen/working_payload + history
├── 202607250003_submission_official_parcels.sql            official_parcels/official_land_uses
│   + 3 cột official_payload_* trên public_submissions
├── 202607250004_submission_claim_guard.sql                 claim_note/claim_released_at + index
├── 202607250005_ai_extraction_tables.sql                   ai_extraction_jobs/results
├── 202607250007_land_uses_cascade_delete.sql                FK public_land_uses → on delete cascade
├── 202607250008_payload_history_layer_official.sql          thêm 'OFFICIAL' vào layer check
├── 202607290002_full_pl3_editor.sql                         cột PL3 còn thiếu cho owner/parcel/
│   asset + official projection + override B/V/AX
└── 202607290003_drop_working_payload_override_columns.sql   GỠ 4 cột ward_admin_code_override*/
    scanned_file_names_override* trên public_submissions. `working_payload_json` là nguồn sự thật
    DUY NHẤT cho ghi đè cột B và AX — 4 cột đó chỉ từng được ghi, không có đường đọc.
    `drop column if exists` nên chạy được dù 202607290002 đã áp hay chưa; KHÔNG sửa 202607290002
    vì file đó có thể đã chạy ở local/preview. Preflight kiểm cả hai chiều.
    (202607250001 hiện TỰ DO — file untracked từng chiếm số này đã bị xóa 2026-07-25, xem
     03-decisions.md; 202607250006 chưa cấp, dành cho Phase 12 — đổi quy ước `-1/-2` → `-01/-02`
     ĐÃ làm ở file-naming.ts nhưng CHƯA có migration đổi tên file cũ đã có trên Drive)
scripts/
├── migrate-sheets-to-supabase.ts          ETL một lần, transaction + marker
├── migrate-public-intake.ts                schema Sheets legacy
├── migrate-citizen-id-pairs.ts             schema Sheets legacy
└── ai/
    ├── manifest.ts                        hằng số cấu hình gói job AI (chưa phải bộ đóng gói thật)
    └── validator.ts                       validateAiResultPayload — đường gọi thật duy nhất nhận
                                            JSON từ AI, gồm cả kiểm tra prompt injection
src/modules/supabase/database.ts             PostgreSQL client + health
src/modules/public-intake/repository.ts      repository hồ sơ Supabase
src/modules/public-intake/payload-layers.ts  effectivePayload/payloadLayerOf (official > working >
                                              citizen > draft)
src/modules/submissions/official-record.ts   syncOfficialRecord — ghi cases/owners/certificates +
                                              official_parcels/official_land_uses (Phase 8)
src/modules/submissions/completion-checks.ts completionChecks — chặn tiếp nhận khi thiếu dữ liệu
src/modules/ai-extraction/                   fingerprints.ts, prompt-safety.ts, types.ts
src/modules/users/supabase-user-repository.ts allowlist/roles Supabase
src/modules/submissions/acceptance-saga.ts   saga tiếp nhận chính thức resumable
src/modules/public-intake/file-naming.ts     quy ước tên file gốc GCN/GT (thuần, dùng chung)
src/modules/public-intake/upload-commit.ts   DÙNG CHUNG cho hai đường tải ảnh (hộ dân + cán bộ):
                                              MAX_CERTIFICATE_PHOTOS, SUBMISSION_BYTE_BUDGET và
                                              discardIfOrphan. Trần là trần của HỒ SƠ, không của
                                              một đường — hai đường ghi vào cùng thư mục Drive
                                              (2026-07-30, Đợt 2C)
src/components/admin/officer-file-upload.tsx  ô tải ảnh của cán bộ trên màn duyệt; hiện khi
                                              isClaimedByMe + UNDER_REVIEW (2026-07-30, Đợt 2C)
src/components/admin/document-viewer.tsx      prop `onDeleteFile` (gỡ ảnh GCN) và
                                              `onReassignOwner`+`reassignableOwners` (gán lại chủ
                                              ảnh CCCD) — không truyền = không hiện nút tương ứng,
                                              quyền nằm ở bên gọi (2026-07-30, Đợt 2C)
src/modules/drive/                           StorageRepository Google Drive
src/modules/public-intake/storage.ts         resumable upload + verify Drive + findOrCreateFolder
                                              (cache trong tiến trình + PostgreSQL advisory lock
                                              xuyên tiến trình khi cache miss)
src/app/api/health/database/route.ts         health Supabase
src/app/api/health/google/route.ts           health Google Drive
agent/                                       prompt tĩnh + JSON schema cho Antigravity đọc ảnh GCN
                                              (agent/prompts/, agent/schemas/, agent/examples/) —
                                              CHƯA có bộ đóng gói job thật (scripts/ai/manifest.ts
                                              chỉ là hằng số, không copy file từ Drive)
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

src/app/ke-khai/wizard.tsx — PUBLIC INTAKE V2 (2026-07-29): 4 BƯỚC, không còn 7
│   STEPS = Ảnh GCN | Người kê khai và CCCD | Thông tin thửa đất | Kiểm tra và gửi
│   Bước 1 có hai pha: trước CREATE chỉ hiện phone + consent; server kiểm consent trước
│   Turnstile/Drive/database, CREATE thành công mới hiện upload GCN trong chính bước đó.
│   Nhận prop `assisted?: { officerName }` — /ke-khai-ho dùng lại NGUYÊN component này,
│   không có bản wizard song song nào.
├── src/modules/public-intake/public-wizard-validation.ts (thuần, test được ở Node)
│   └── validatePublicWizardStep → GỌI validateCitizenSubmitDraft (cùng hàm với máy chủ)
│       rồi lọc theo bước + ánh xạ fieldPath → khóa ô nhập.
│       ⚠️ TRƯỚC V2 `validate()` trong wizard chép lại luật bằng regex riêng — hai bản lệch nhau.
│       Sửa luật nghiệp vụ thì sửa validation.ts, KHÔNG sửa lại ở wizard.
├── src/modules/public-intake/image-normalization.client.ts (cờ
│   NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED; source default FALSE, Vercel Preview +
│   Production TRUE từ 2026-07-29 theo quyết định trực tiếp của chủ dự án)
│   └── normalizeIntakeImage → CCCD 2400px / GCN 3000px, JPEG q0.88, không phóng to,
│       imageOrientation:"from-image" (thiếu là ảnh dọc bị xoay ngang), mọi lỗi → trả tệp nguồn;
│       khi có chuẩn hóa, Drive giữ bản tiếp nhận vận hành chứ không giữ byte camera
├── src/modules/public-intake/upload-queue.ts (thuần)
│   └── runWithConcurrency — GCN tối đa 2 luồng, 1 khi saveData/2g; một ảnh hỏng KHÔNG
│       hủy ảnh khác (trước V2 vòng lặp `break` làm mất cả các ảnh chưa thử)
├── src/modules/public-intake/upload-transport.ts + xhr-upload-transport.client.ts
│   └── ResumablePutTransport — PUT dữ liệu qua XHR để có upload.onprogress;
│       initiate / hỏi tiến độ / complete VẪN dùng fetch.
│       resumable-upload.ts giữ tiến độ ĐƠN ĐIỆU TĂNG (Google có thể báo nhận ít hơn số byte
│       XHR đã đếm; thanh phần trăm tụt bị người dân đọc là "hỏng").
├── POST /api/public/submissions (PUBLIC_CREATE idempotency)
│   └── src/modules/public-intake/create-submission.ts — DÙNG CHUNG với route cán bộ;
│       body bắt buộc `phone` + `consent.accepted === true`; route validate trước Turnstile/Drive,
│       server tự gán consent version; `channel` là tham số BẮT BUỘC, cổng công khai gán cứng
│       "SELF_SERVICE"
├── GET /api/public/submissions/current → draft + server version
│   └── draft-adoption.ts giữ dữ liệu local, thay owner/parcel/land-use ID bằng ID server sau
│       CREATE; recovery dùng nguyên draft server
├── PATCH /api/public/submissions/current (version) — qua flushDraft() single-flight + cờ dirty;
│   client gửi version gần nhất và cập nhật version từ response
├── POST .../uploads/initiate → phiên resumable Drive
│   ⚠️ tên tệp trong kho do MÁY CHỦ đặt, KHÔNG ghép body.fileName (tên máy ảnh hay mang CCCD,
│   họ tên); chỉ đuôi mở rộng lấy từ mimeType đã qua canonicalImageMimeType
├── POST .../uploads/complete → verifyUploadedFile → appendFile + số đo
│   ├── src/modules/public-intake/upload-metrics.ts (thuần) — Zod strict, danh mục ĐÓNG,
│   │   kẹp giá trị; KHÔNG có ô văn bản tự do nào để CCCD/tên tệp lọt vào
│   ├── appendUploadAttempt(...).catch(() => undefined) — metric hỏng KHÔNG phá lượt tải
│   └── discardIfOrphan (src/modules/public-intake/upload-commit.ts — DÙNG CHUNG với đường cán
│       bộ từ Đợt 2C) → isDriveFileAdopted(...).catch(() => true)
│       ⚠️ hỏi DB không được thì mặc định ĐÃ NHẬN, tức là KHÔNG xóa. Sót tệp thừa thì
│       scripts/audit-orphan-public-files.ts dọn được; xóa nhầm là mất ảnh vĩnh viễn.
├── POST .../uploads/metrics → số đo cho lượt HỎNG (lượt hỏng không có complete để bám vào);
│   luôn trả 204, vẫn đòi phiên + CSRF
│
├── POST /api/submissions/:id/uploads/initiate|complete — ĐƯỜNG CÁN BỘ (2026-07-30, Đợt 2C)
│   ├── requireActiveUser(SUBMISSION_DECISION_ROLES) + verifyCsrfToken + mayStaffEdit
│   │   ⚠️ `/api/submissions/*` KHÔNG nằm trong matcher của src/proxy.ts → ba lớp này là lớp
│   │   chặn DUY NHẤT. Không dùng lại resolvePublicRequest được: phiên kê khai của hộ dân đã
│   │   khóa đúng lúc cán bộ cần thêm ảnh (isEditable đòi DRAFT/NEEDS_SUPPLEMENT + chưa ai giữ).
│   ├── chủ sử dụng đọc từ effectivePayload(record).owners, KHÔNG từ record.draft — chủ do cán bộ
│   │   thêm ở Bàn làm việc chỉ tồn tại ở working_payload
│   ├── ảnh CCCD trùng chỗ ĐÒI replaceFileId tường minh; appendFile đánh ảnh cũ thành REPLACED
│   │   (không xóa khỏi Drive). Chưa có DELETE ảnh cho cán bộ — thay ảnh là đường duy nhất.
│   ├── request_log.kind = OFFICER_UPLOAD_COMPLETE (appendFile nhận `kind`, mặc định
│   │   PUBLIC_UPLOAD_COMPLETE) — dùng chung một loại là hai đường đọc replay của nhau
│   ├── audit SUBMISSION_OFFICER_FILE_UPLOADED — metadata chỉ documentType/fileId/sizeBytes/
│   │   replaced, KHÔNG driveFileId, KHÔNG tên tệp, KHÔNG ownerId
│   └── dùng chung upload-commit.ts với đường hộ dân (trần + discardIfOrphan)
│
├── DELETE /api/submissions/:id/files/:fileId — CÁN BỘ GỠ ẢNH GCN (2026-07-30, Đợt 2C)
│   ├── cùng ba lớp chặn với uploads/* (mayStaffEdit); không đòi idempotency-key
│   ├── repository.markFileDeleted → markFileStatus: `for update` + no-op khi đã DELETED
│   │   + refreshFileSummaries (completionChecks đọc `fileSummaries`, không refresh là hồ sơ
│   │   thiếu ảnh vẫn tiếp nhận được)
│   ├── ⚠️ XÓA MỀM. Tuyệt đối KHÔNG discardFile/drive.files.delete ở đây. isDriveFileAdopted
│   │   không lọc status nên audit-orphan-public-files.ts vẫn coi tệp là đã có hồ sơ nhận →
│   │   ảnh đã gỡ tra lại được. Hệ quả đã chấp nhận: ảnh DELETED/REPLACED tích trên Drive vĩnh viễn.
│   ├── CHỈ `CERTIFICATE` — CCCD là ràng buộc bắt buộc của completionChecks.checkFiles, gỡ nó chỉ
│   │   tạo trạng thái không tiếp nhận được; luồng đúng là THAY ảnh
│   ├── KHÔNG chặn ảnh GCN cuối cùng — việc đó của completionChecks (FILES_CERTIFICATE_MISSING)
│   └── audit SUBMISSION_OFFICER_FILE_DELETED (documentType/fileId/sizeBytes)
│
├── PATCH /api/submissions/:id/files/:fileId — CÁN BỘ GÁN LẠI CHỦ SỬ DỤNG ẢNH CCCD
│   (2026-07-30, Đợt 2C bổ sung thứ hai)
│   ├── repository.reassignFileOwner: transaction khóa CẢ hàng nguồn (for update) LẪN hàng đích
│   │   cùng owner_id + document_type + status='UPLOADED' (for update) — chống hai gán lại đồng
│   │   thời cùng thấy "còn trống" rồi cùng ghi vào một ô
│   ├── ⚠️ owner_id trùng chủ đích → trả "NOOP", không lỗi, route KHÔNG ghi audit (an toàn khi
│   │   gọi lại sau mất mạng, không cần idempotency-key)
│   ├── ⚠️ chủ đích ĐÃ có ảnh cùng mặt → ném FileOwnerReassignConflictError → 409 VERSION_CONFLICT.
│   │   KHÔNG tự động đánh REPLACED như appendFile lúc thay ảnh — reassign là "sửa nhãn ảnh cũ",
│   │   không phải "vừa chụp ảnh mới"; ảnh đang chiếm ô đích có thể đang đúng
│   ├── CHỈ CITIZEN_ID_FRONT/BACK — CERTIFICATE không gắn với một chủ cụ thể (luôn ownerId='')
│   ├── chủ đích đọc từ effectivePayload(record).owners + requiresCitizenId, cùng quy tắc uploads/*
│   └── audit SUBMISSION_OFFICER_FILE_OWNER_REASSIGNED (documentType/fileId, không ownerId)
└── POST /api/public/submissions/current/submit (PUBLIC_SUBMIT idempotency)
    ├── isHeldByOfficer(record) → 409 INVALID_STATE NGAY, TRƯỚC Turnstile (2026-07-29, Đợt 2A-3)
    ├── validateCitizenSubmitDraft + validateCitizenRequiredFiles → CitizenSubmitIssue[]
    │   (code + fieldPath, trả trong error.details.issues)
    ├── citizenIdsForLookup — CHỈ băm CCCD khớp 12 số; không bao giờ băm chuỗi rỗng
    └── PublicIntakeRepository.submit
        ├── ⚠️ XÓA claimed_by/claimed_by_display_name/claimed_at mỗi lần gửi lại. Đây là lý do
        │   isEditable phải chặn khi có cán bộ đang giữ: version vẫn khớp nên optimistic
        │   concurrency KHÔNG coi đó là xung đột, hồ sơ bị cướp khỏi cán bộ mà không ai biết.
        └── transaction: public_submissions + normalized children
            + public_status_events + audit_logs + public_lookup_index + request_log

src/modules/public-intake/route-context.ts — CHỐT CHẶN DUY NHẤT của mọi route công khai
├── resolvePublicRequest — phiên từ cookie đã ký (không bao giờ nhận submission_id từ URL/body)
├── isHeldByOfficer(record) — claimed_by khác rỗng sau trim (2026-07-29, Đợt 2A-3)
└── isEditable(record) — (DRAFT | NEEDS_SUPPLEMENT) VÀ không có cán bộ đang giữ
    ⚠️ Cả 7 route /api/public/submissions/current/* + staff/assisted-submissions đều đi qua đây;
    sửa hàm này là sửa toàn bộ bề mặt ghi công khai cùng lúc — cả theo hướng tốt lẫn hướng xấu.

src/app/ke-khai-ho/page.tsx — CHẾ ĐỘ CÁN BỘ HỖ TRỢ KÊ KHAI (2026-07-28)
├── requireActiveUser(ASSISTED_INTAKE_ROLES) TRƯỚC, rồi mới đọc kill switch (thứ tự cố ý — giữ
│   401/403 đúng cho người không đủ quyền, không lộ ra một 503 chung chung)
│   ⚠️ ASSISTED_INTAKE_ROLES ⊊ SUBMISSION_READ_ROLES — REVIEW_OFFICER bị loại để không ai
│   vừa nhập hộ dân vừa thẩm định chính hồ sơ đó. Trang và API đọc CÙNG một hằng số.
├── environment.OFFICER_ASSISTED_INTAKE_ENABLED (mặc định FALSE) — kill switch server-side,
│   ĐỘC LẬP với vai trò. Tắt → trang hiện "Chế độ chưa được bật", API trả 503
│   SERVICE_UNAVAILABLE. KHÔNG có biến NEXT_PUBLIC_ tương ứng — cờ client không phải hàng rào.
├── assisted-wizard.tsx → <IntakeWizard assisted={{ officerName }} />
└── POST /api/staff/assisted-submissions
    ├── requireActiveUser + kill switch (cùng thứ tự trang) + verifyCsrfToken, KHÔNG Turnstile
    ├── body bắt buộc `phone` + `consent.accepted === true`; thiếu consent trả 400 trước create/audit
    ├── createIntakeSubmission({ channel: "OFFICER_ASSISTED", assistedBy: từ phiên })
    │   ⚠️ client KHÔNG gửi được channel/assistedBy — nhận từ client là để ai cũng gắn nhãn
    │   "cán bộ đã nhập hộ" cho hồ sơ của mình
    ├── lưu consent version + assistedBy/assistedAt; audit ASSISTED_SUBMISSION_CREATED kèm metadata
    │   consentAccepted/consentVersion/intakeChannel
    └── đặt CÙNG cookie phiên công khai → wizard/upload/submit dùng lại y nguyên

src/modules/submissions/detail-view.ts — ĐƯỜNG ĐỌC DUY NHẤT của màn duyệt hồ sơ (2026-07-30, Đợt 2B)
├── SubmissionDetailView — kiểu dữ liệu DUY NHẤT cho màn duyệt. `submission-detail.tsx` lấy luôn
│   kiểu này (`type Submission = SubmissionDetailView`) thay vì khai lại như trước, nên thêm/bớt
│   trường chỉ sửa một nơi. Trước 2B hình dạng bị khai hai lần và đã lệch thật (2A-2 phải thêm
│   `internalNotes` ở cả route lẫn component).
└── loadSubmissionDetail(submissionId, viewer, requestId) — findById → appendAudit → listFiles → DTO
    ⚠️ CÓ GHI AUDIT `SUBMISSION_SENSITIVE_DETAIL_VIEWED`. Audit nằm TRONG hàm dùng chung chứ không
    ở route, để server-priming của trang không làm mất dấu vết "ai đã xem hồ sơ nào". Cả
    `GET /api/submissions/:id` và `src/app/submissions/[submissionId]/page.tsx` đều gọi hàm này;
    khóa bằng tests/submission-detail-view.test.ts.

src/app/submissions/[submissionId]/page.tsx — SERVER-PRIMING (2026-07-30, Đợt 2B)
├── loadSubmissionDetail ngay trên server → truyền `initialSubmission` xuống SubmissionDetail.
│   Trước 2B component tự fetch sau hydrate: HTML → tải JS → hydrate → fetch → mới thấy dữ liệu.
├── SubmissionDetail chỉ fetch khi `initialSubmission` là null (nạp sẵn lỗi tạm) — nếu fetch cả khi
│   đã có dữ liệu thì mất lợi ích VÀ ghi thêm một dòng audit cho cùng một lần mở trang.
├── record không tồn tại → notFound(); lỗi tạm (DB) → vẫn render, để client tự fetch và tự báo lỗi
└── ⚠️ HTML giờ CHỨA PII (SĐT/CCCD/địa chỉ), không còn là khung rỗng → `src/proxy.ts` gắn
    `cache-control: private, no-store` cho toàn bộ matcher cán bộ. Gỡ header đó = để PII của hộ dân
    nằm lại trong cache của proxy trung gian.

src/components/admin/document-viewer.tsx — TẢI ẢNH THEO YÊU CẦU (2026-07-30, Đợt 2B)
├── usePreviewImages(submissionId) — fetch ảnh thành blob MỘT lần/ảnh, giữ object URL trong Map ref
│   ⚠️ Vì sao không để `<img src>` tự tải: route ảnh trả `cache-control: private, no-store` (đúng —
│   ảnh giấy tờ là PII), nên mỗi lần `<img>` mount lại là MỘT lần tải lại từ Drive + MỘT dòng audit.
│   Trước 2B khung toàn màn hình render thêm `<img>` cùng `src` → tải đúng ảnh đó HAI lần; chuyển
│   qua lại giữa các tab ảnh cũng tải lại từ đầu.
├── Chỉ tải ảnh ĐANG CHỌN; các ảnh khác chờ cán bộ bấm sang tab của nó
└── revokeObjectURL khi rời trang — không giữ ảnh PII trong bộ nhớ lâu hơn mức cần

src/components/admin/ai-draft-panel.tsx — ACCORDION, LAZY (2026-07-30, Đợt 2B)
├── Thu gọn mặc định; chỉ gọi `GET /api/submissions/:id/ai-draft` khi cán bộ MỞ panel.
│   Trước 2B panel fetch ngay khi render VÀ fetch lại mỗi lần `version` đổi — tức mỗi lần lưu bàn
│   làm việc/ghi chú nội bộ cũng kéo một lần tải kết quả AI, dù phần lớn hồ sơ không có kết quả AI
│   và panel render ra rỗng (`return null`).
├── Vẫn tải lại khi `version` đổi NẾU panel đang mở — cột "Hiện có" so với dữ liệu hồ sơ hiện tại
└── `loading` là giá trị SUY RA (`open && loadedVersion !== version`), không phải state — quy tắc
    eslint react-hooks/set-state-in-effect cấm setState đồng bộ trong thân effect

src/app/submissions/page.tsx / [submissionId]
└── PublicIntakeRepository
    ├── listQueuePage — hàng chờ SQL keyset; không đọc toàn bảng/draft_json
    ├── list/listSummaries — giữ cho đường gọi cũ/nội bộ, không dùng ở GET hàng chờ
    ├── findById
    ├── commitStaffAction (transaction) — CLAIM/FORCE_CLAIM/RELEASE/TRANSFER (2026-07-25, Phase 5)
    │   ├── UPDATE mang điều kiện atomic ngay trong SQL:
    │   │   `and ($force = true or claimed_by is null or claimed_by = '' or claimed_by = $actor)`
    │   │   — không phải kiểu SELECT-rồi-UPDATE bị cấm ở review; version conflict + claim conflict
    │   │   phân biệt được bằng SubmissionAlreadyClaimedError → 409 ALREADY_CLAIMED
    │   ├── mayClaim (review.ts) — SUBMITTED/RESUBMITTED/NEEDS_SUPPLEMENT (đã bỏ UNDER_REVIEW so
    │   │   với thiết kế cũ; NEEDS_SUPPLEMENT thêm ở Đợt 2A-3 để hồ sơ cũ của luồng "yêu cầu bổ
    │   │   sung" đã bỏ không kẹt vĩnh viễn sau khi chặn người dân gửi lại)
    │   ├── mayForceClaim/mayRelease/mayTransfer — WARD_ADMIN/SYSTEM_ADMIN mới force được
    │   ├── nếu claim lần đầu (working_payload_json is null) → khởi tạo
    │   │   working_payload_json = coalesce(citizen_payload_json, draft_json), ghi history WORKING
    │   └── claim_note/claim_released_at (migration 202607250004) — CỘT CHƯA AI GHI, chỉ tồn tại
    │       trong schema, không có code path nào set giá trị
    ├── commitWorkingPayload (transaction) — PUT /api/submissions/:id/working-payload (Phase 6)
    │   ├── Chỉ cán bộ đang giữ (claimedBy === actor) + status UNDER_REVIEW mới gọi được
    │   ├── Ghi working_payload_json VÀ draft_json cùng lúc (khớp quyết định 2026-07-24 "Cho phép
    │   │   cán bộ sửa trực tiếp draft_json" — không phải lỗi, staff edit cố ý hiển thị cho dân)
    │   ├── refreshCanonicalProjection nếu status khác DRAFT
    │   ├── audit chỉ ghi changedFieldPaths + lý do override, không ghi giá trị PII trước/sau
    │   ├── PATCH manualIdentityConfirmation cũng đi qua transaction này: chỉ cán bộ đang giữ hồ sơ
    │   │   `UNDER_REVIEW`, server tự đặt `MANUAL_COMPLETE`/thời điểm sau khi kiểm trường CCCD;
    │   │   audit action `SUBMISSION_IDENTITY_MANUALLY_CONFIRMED` chỉ lưu số dòng
    │   │   ⚠️ changedFieldPaths CẮT ở MAX_AUDIT_FIELD_PATHS=250 nhưng changedFieldCount đếm
    │   │   TRƯỚC khi cắt, kèm cờ changedFieldPathsTruncated (sửa 2026-07-29, review PR #7 —
    │   │   trước đó count lấy .length của mảng đã cắt nên luôn ≤250)
    │   │   ⚠️ `reason` của override là free text và ĐI VÀO audit metadata, nên bị quét PII
    │   │   fail-closed ở HAI cửa (2026-07-29): validateWorkingPayloadForSave lúc lưu +
    │   │   completionChecks lúc tiếp nhận (cửa 2 dành cho dữ liệu lưu trước khi có luật). Cả hai
    │   │   gọi overrideReasonsWithCitizenIdLike → scanForCitizenIdLikeValues, DÙNG CHUNG một định
    │   │   nghĩa "giống CCCD" với đường AI extraction. Thông báo lỗi KHÔNG chép lại chuỗi PII.
    │   └── WorkingPayloadEditor bao phủ B–AX: owner/org/representative/current user, parcel,
    │       tối đa 3 land-use và asset AO–AW; B/V/AX hiện nguồn + override có lý do
    │       ├── MỌI đường ghi owner đi qua migrateLegacyOrganisationOwner (types.ts): dòng tổ
    │       │   chức lưu trước 202607290002 giữ tên tổ chức trong `fullName`, mà form mới dùng ô
    │       │   đó cho NGƯỜI ĐẠI DIỆN. Không di trú trước thì gõ vào H là mất tên tổ chức.
    │       │   Đổi ownerType KHÔNG di trú (tổ chức → cá nhân = fullName vốn là tên người).
    │       └── xóa thửa gọi detachAssetsFromMissingParcels: draftSchema từ chối asset.parcelId
    │           mồ côi và chỉ trả lỗi cấu trúc chung, cán bộ không biết ô nào sai
    ├── commitOfficialAmendment (transaction) — PATCH sửa hồ sơ ĐÃ tiếp nhận (Q2, 2026-07-25)
    │   ├── mayAmendOfficialRecord — ACCEPTED + có official_case_id + (người giữ | admin)
    │   ├── bắt buộc amendmentReason >= 10 ký tự → audit OFFICIAL_RECORD_AMENDED
    │   └── CÙNG transaction: cập nhật draft_json + official_payload_json/at/by và
    │       syncOfficialRecord (src/modules/submissions/official-record.ts) upsert
    │       certificates/owners/parcels/assets theo case_id + xóa bản ghi không còn.
    ├── commitStaffDraftEdit (transaction) — PATCH sửa trực tiếp draft_json (phạm vi hẹp: certificate
    │   3 trường + owner 6 trường; PUT working-payload ở trên mới sửa được thửa/mục đích)
    │   ├── mayStaffEdit (src/modules/submissions/review.ts) — chỉ người đang giữ + UNDER_REVIEW
    │   ├── isOwnerIdentityQrConfirmed — CẢNH BÁO, không còn khóa cứng (2026-07-25, Q1):
    │   │   cán bộ sửa được cả field QR_CONFIRMED, audit ghi identityOverride
    │   └── refreshCanonicalProjection — XÓA CON TRƯỚC CHA:
    │       land_uses → parcels → owners → certificates → assets
    │       (thứ tự code đã đúng; migration 202607250007 thêm `on delete cascade` làm lưới an toàn
    │        tầng DB — đã CHẠY THẬT và PASS trên Postgres rehearsal, xem 03-decisions.md)
    ├── commitInternalNotes (transaction) — PUT /api/submissions/:id/internal-notes (2026-07-29, Đợt 2A-2)
    │   ├── Không kiểm tra claimedBy/status — bất kỳ SUBMISSION_DECISION_ROLES nào cũng ghi được,
    │   │   ở bất kỳ trạng thái nào (kể cả ACCEPTED/REJECTED) — ghi chú không phải dữ liệu PL3
    │   ├── Chỉ update internal_notes + version + updated_at, KHÔNG chạm draft_json/canonical
    │   │   projection, KHÔNG sinh timeline (người dân không bao giờ thấy trường này)
    │   └── audit SUBMISSION_INTERNAL_NOTE_UPDATED chỉ ghi noteLength, không ghi nội dung ghi chú
    │       (ô tự do — cán bộ có thể gõ SĐT/tên người dân vào đây)
    ├── findActiveFile(submissionId, fileId) — MỘT truy vấn cho MỘT ảnh (2026-07-30, Đợt 2B)
    │   Các route phục vụ ảnh trước đây gọi `listFiles` rồi `.find(...)`: kéo toàn bộ ảnh của hồ sơ
    │   về chỉ để lấy một tệp. Điều kiện `status = 'UPLOADED'` giữ đúng ngữ nghĩa mặc định của
    │   `listFiles` để hai đường không lệch. Dùng ở GET /api/submissions/:id/files/:fileId và ở
    │   nhánh dự phòng của GET /api/public/submissions/current/files/:fileId (nhánh nhanh vẫn là
    │   `record.fileSummaries`). KHÔNG dùng cho DELETE công khai — route đó cần cả trạng thái
    │   DELETED để trả về idempotent.
    ├── commitAccessSecretReset (transaction)
    └── appendAudit / appendExportJob

src/modules/public-intake/payload-layers.ts (thuần, không I/O)
├── effectivePayload(record) → official > working > citizen > draft
├── payloadLayerOf(record) → "OFFICIAL" | "WORKING" | "CITIZEN" | "DRAFT"
└── GET /api/submissions/:id trả payloadLayer/citizenPayload/workingPayload/officialPayload
    (chỉ SUBMISSION_READ_ROLES; không API công khai nào chạm 3 cột payload)

src/app/api/submissions/[submissionId]/accept/route.ts
├── completionChecks (src/modules/submissions/completion-checks.ts) chạy TRƯỚC khi mở saga —
│   còn BLOCKING → 400 VALIDATION_FAILED, không mở transaction nào (Phase 8); trả
│   error.details.issues[] = code/label/message an toàn để màn hình cán bộ chỉ đúng mục cần sửa
│   ⚠️ TỪ V2 (2026-07-28) ĐÂY LÀ GÁC CỔNG DUY NHẤT cho dữ liệu nghiệp vụ đầy đủ.
│   Cổng công khai chỉ còn đòi phone + tên chủ + đủ ảnh, nên MỌI trường PL3 mà
│   validateDraftForSubmit từng chặn đã chuyển hết về đây: vai trò trên GCN, ngày sinh/giới
│   tính/địa chỉ, định danh tổ chức, nhóm người sử dụng hiện tại, địa chỉ trên GCN, oldWard
│   TRỐNG (trước chỉ chặn khi sai danh mục), land use rỗng, nguồn gốc/hình thức/thời hạn,
│   tổng diện tích. Ảnh chuyển từ WARNING sang BLOCKING.
│   NỚI completionChecks = mở đường cho hồ sơ chỉ có tên + ảnh đi thẳng vào hồ sơ chính thức.
└── runOfficialAcceptance (src/modules/submissions/acceptance-saga.ts)
    ⚠️ OFFICIAL_ACCEPTANCE_ENABLED = true NGAY TỪ ĐIỂM GỐC của nhánh này (b8e67a2, trước Phase 1) —
    saga dưới đây đã LIVE suốt Phase 2-14 và hai vòng vá lỗi, không phải trạng thái "chưa bật".
    ├── Bước 0 (tx): advisory lock + request_log replay + public_acceptance_sagas
    │   + public_submissions ACCEPTING + audit/timeline (insertAudit/insertTimeline
    │   của PublicIntakeRepository, truyền transaction — KHÔNG dùng method pool)
    ├── ID_RESERVED (tx): case_counters (ON CONFLICT ... RETURNING) + id_reservations
    ├── CASE_FOLDER_READY: storage.findOrCreateFolder 02_CASES/{TDP}/{CASE_ID}/originals
    │   (ngoài transaction nghiệp vụ; mỗi cache miss mở transaction RIÊNG, giữ
    │   pg_advisory_xact_lock theo parent/name bao quanh thao tác Drive, nên nhiều lambda không
    │   thể tạo trùng thư mục)
    ├── FILES_MOVED: drive.files.update từng file (đổi parent + đổi tên `requestBody.name`),
    │   checkpoint moved_files (NGOÀI tx) — tên sinh bởi buildOriginalFileNames
    │   (src/modules/public-intake/file-naming.ts, đệm 0 `-01/-02` từ 2026-07-25), issueNumber
    │   rỗng → bỏ qua đổi tên
    ├── RECORDS_WRITTEN (tx): cases + files, syncOfficialRecord ghi certificates/owners/
    │   parcels(data_json)/assets(data_json) NHƯ CŨ, cộng thêm (Phase 8, 2026-07-25):
    │   upsert public.official_parcels + public.official_land_uses (bảng chuẩn hóa riêng, KHÔNG
    │   phải data_json lồng nữa) — ID tất định ACC:{submissionId}:{id|idx-N}, xóa dòng thừa
    └── COMPLETED (tx): public_submissions ACCEPTED + official_case_id +
        official_payload_json/at/by = effectivePayload(record) tại thời điểm hoàn tất + ghi
        public_submission_payload_history layer 'OFFICIAL' + request_log

src/modules/public-intake/pl3-export.ts (thuần, không I/O)
├── buildPl3Content / createPl3Accumulator → tách sheet PL3 (ACCEPTED) / Ton dong (đang xử lý)
├── PL3_COLUMNS khóa nguyên văn 49 nhãn B–AX của `Tai lieu/PL3.xlsx`
├── cột W lấy `cadastralParcelNumber`; AO–AW lấy tài sản gắn theo thửa, không để rỗng cố định
│   ⚠️ PL3 chỉ có MỘT bộ 9 cột AO–AW cho mỗi thửa. Nhiều tài sản cùng thửa → assetColumn() gộp
│   bằng "; " GIỮ NGUYÊN số phần tử và thứ tự ở cả 9 cột, ô rỗng ghi ASSET_EMPTY_PLACEHOLDER "-".
│   KHÔNG được bỏ trùng hay bỏ ô rỗng (bug đã sửa 2026-07-29, review PR #7): làm vậy thì cột AS
│   còn 1 giá trị trong khi AO có 2, người đọc không ghép lại được giá trị nào thuộc tài sản nào.
├── buildSubmissionRows dedupe `warnings` trước khi trả: buildRow chạy mỗi cặp (thửa × chủ) nên
│   cảnh báo thuộc về THỬA bị lặp đúng bằng số đồng sở hữu. Thêm cảnh báo mới vào buildRow thì
│   không cần lo trùng, nhưng cảnh báo phải là chuỗi tất định (đừng nhét timestamp/random vào).
├── B/V/AX dùng nguồn tự động trừ khi working payload có override + lý do hợp lệ
├── scannedFileNames (trường 49) → buildOriginalFileNames cùng file-naming.ts,
│   dùng chung quy ước với bước FILES_MOVED để tên không lệch nhau
└── POST /api/exports (route.ts) — ĐÃ SỬA (Phase 2, 2026-07-25): dùng
    repository.listForExport (keyset pagination theo legacy_row_index, batch 500), KHÔNG còn
    `.slice(0, 2000)` ngầm. Giới hạn mới là MAX_EXPORT_SUBMISSIONS = 20000 kèm cờ `truncated` hiển
    thị ra sheet "Canh bao" — không âm thầm cắt bớt như trước.

src/modules/ai-extraction/ + scripts/ai/ + agent/ (Phase 9-11, khung sườn — CHƯA nối AI thật)
├── src/modules/ai-extraction/fingerprints.ts
│   computeInputFingerprint (sort checksum) / computeResultFingerprint (sort key đệ quy trước
│   khi JSON.stringify — tránh lệch fingerprint khi model trả JSON khác thứ tự key)
├── src/modules/ai-extraction/prompt-safety.ts
│   detectPromptInjection / scanForPromptInjection — quét đệ quy giá trị chuỗi tìm dấu hiệu mô
│   hình "làm theo" chỉ dẫn giấu trong ảnh thay vì trích xuất (GEMINI.md §6.2)
├── scripts/ai/validator.ts
│   validateAiResultPayload — ĐƯỜNG GỌI THẬT DUY NHẤT nhận JSON từ AI: kiểm certificate/parcels,
│   gọi scanForPromptInjection (khớp → BLOCKING), kiểm unreadableFields (thiếu → WARNING)
├── src/app/api/ai/results/route.ts (POST, worker gọi bằng header x-ai-worker-key)
│   ├── Chặn bằng AI_EXTRACTION_ENABLED qua loadServerEnvironment() — tắt → 503
│   │   SERVICE_UNAVAILABLE (trước 2026-07-25 vòng 2 review, cờ không chặn gì)
│   ├── validateAiResultPayload → validationStatus PASSED/REVIEW_REQUIRED/BLOCKED
│   └── ghi ai_extraction_results + cập nhật ai_extraction_jobs.status
│       ⚠️ result_version hardcode 1 — kết quả thứ hai cho cùng job vỡ unique constraint (chưa vá)
├── agent/prompts/certificate-extraction.md — prompt tĩnh, có quy tắc chống prompt injection §6.2
└── agent/schemas/certificate-extraction-schema.json — có unreadableFields + null cho phép trên
    trường bắt buộc (§6.4 "không suy diễn")
    ⚠️ scripts/ai/manifest.ts chỉ là object hằng số — CHƯA có script thật đóng gói job (copy file
    documentType=CERTIFICATE từ Drive vào ANTIGRAVITY_WORKSPACE_ROOT, loại trừ ảnh CCCD)

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
- `public_upload_attempts` (2026-07-28, Phase 5) — số đo mỗi lượt tải ảnh. **KHÔNG chứa PII**:
  không tên tệp, CCCD, họ tên, điện thoại, user agent thô, Drive ID, URL upload hay IP. Chỉ số,
  enum và `submission_id` (`on delete cascade`). Retention 90 ngày, chưa có job tự xóa.
  7 cột metadata chuẩn hóa (`source_*`, `upload_*`, `normalization_version`) nằm ngay trên
  `public_files`, không phải bảng riêng.
- `public_submission_payload_history` (2026-07-25) — layer `CITIZEN`/`WORKING`/`OFFICIAL`, unique
  `(submission_id, layer, payload_version)`. 6+3 cột `citizen_payload_*`/`working_payload_*`/
  `official_payload_*` nằm ngay trên `public_submissions`, không phải bảng riêng.
- `official_parcels`, `official_land_uses` (2026-07-25, Phase 8/P0-5) — bản chính thức của thửa
  đất/mục đích sử dụng, tách khỏi `public.parcels.data_json` (vốn là JSON tự do, không truy vấn
  được theo cột). FK `official_land_uses.official_parcel_id → official_parcels` có `on delete
cascade`.
- `ai_extraction_jobs`, `ai_extraction_results` (2026-07-25, Phase 9) — hàng đợi AI đọc ảnh GCN.
  Unique `(submission_id, input_fingerprint, prompt_version, schema_version)` chống job trùng.

Bất biến quan trọng:

- `request_log.idempotency_key` là primary key; advisory transaction lock cho request cùng key.
- Mutation nghiệp vụ + audit/timeline + request log cùng transaction.
- Update version có điều kiện; không khớp → `409 VERSION_CONFLICT`.
- Partial unique index chặn hai ảnh CCCD cùng mặt active.
- `case_counters` cấp số theo năm nguyên tử; lỗ hổng dãy số khi saga bỏ dở được chấp nhận.
- `id_reservations` có thêm `sequence_number`, `official_case_id`, `submission_id`; unique `(year, sequence_number)`; idempotent theo `request_id`.
- Quy tắc pool `max: 1`: không gọi method repository/storage dùng pool bên trong `database.begin`; thao tác Drive luôn nằm ngoài transaction.
- `findOrCreateFolder` là ngoại lệ được kiểm soát: bản thân nó mở **một transaction riêng** chỉ để
  giữ advisory lock `DRIVE_FOLDER:{parentId}:{name}` trong lúc list/create trên Drive. Không được
  gọi nó từ một transaction đã mở; `folderCache` chỉ giảm số lần lấy khóa, không là cơ chế đồng bộ.
- `legacy_row_index` chỉ giữ tương thích cookie session v2 trong giai đoạn migration. ETL chèn giá trị legacy phải đồng bộ identity sequence trong cùng transaction để bản ghi mới không va chạm khóa unique.
- Nháp legacy thiếu `owners` hoặc bị lưu JSON lồng được phục hồi/chuẩn hóa có audit; repository giải mã tương thích trong thời gian chuyển đổi, còn route upload luôn kiểm shape dữ liệu trước khi gọi Drive và trả `409 INVALID_STATE` thay vì lỗi 500.
- GCN cũ append-only; bản mới nhất theo `row_version` có hiệu lực.
- RLS bật, không có policy/quyền cho `anon` và `authenticated`; browser không nhận database secret.
- **CAS thay advisory lock cho claim (2026-07-25):** `commitStaffAction` chống hai cán bộ claim
  đồng thời bằng điều kiện ngay trong câu `UPDATE` (`claimed_by is null or claimed_by = $actor or
$force`), không phải khóa tường minh — đủ cho luồng hiện tại nhưng phụ thuộc bất biến ngầm "mọi
  ghi đều tăng version".
- **Đồng bộ Drive folder xuyên tiến trình (2026-07-25):** cache miss trong
  `PublicIntakeStorage.findOrCreateFolder` khóa PostgreSQL bằng `pg_advisory_xact_lock` theo
  `(parentId, name)` trước khi list/create Drive, rồi re-check cache/Drive trong cùng transaction.
  Vì advisory lock là cấp database, các lambda Vercel khác nhau được tuần tự hóa; `Map` static chỉ
  là cache tối ưu và không còn quyết định tính đúng đắn.
- **`OFFICIAL_ACCEPTANCE_ENABLED = true`** (`src/modules/submissions/acceptance.ts`) — bật từ
  trước khi nhánh `feat/antigravity-assisted-review` tách ra (xem 03-decisions.md
  `[2026-07-25] MỞ tiếp nhận chính thức`). Toàn bộ saga tiếp nhận chính thức đang LIVE, không phải
  trạng thái tắt/an toàn — mọi thay đổi vào `acceptance-saga.ts`/`official-record.ts` ảnh hưởng
  ngay tới dữ liệu chính thức thật nếu deploy.

## API liên quan hạ tầng

```text
GET /api/health/database
GET /api/health/google
GET /api/security/csrf
POST/GET/PATCH /api/users
POST /api/public/submissions
GET/PATCH /api/public/submissions/current              (GET trả thêm `hasAssignedOfficer` — CHỈ
                                                        boolean, không kèm tên/email cán bộ;
                                                        2026-07-29, Đợt 2A-3)
POST /api/public/submissions/current/submit           (2026-07-29, Đợt 2A-3 — 409 INVALID_STATE
                                                        khi hồ sơ đang có cán bộ giữ: gửi lại sẽ
                                                        xóa mất claim của cán bộ)
POST /api/public/submissions/current/uploads/initiate
POST /api/public/submissions/current/uploads/complete
POST /api/public/submissions/current/uploads/metrics   (2026-07-28, Phase 5 — số đo lượt hỏng,
                                                        best-effort, luôn 204)
GET /api/submissions
GET /api/submissions/:submissionId
PATCH /api/submissions/:submissionId                         (2026-07-29, Đợt 2A-1 — chỉ còn hai
                                                        nhánh: `manualIdentityConfirmation` xác
                                                        nhận CCCD thủ công vào working payload, và
                                                        `amendmentReason` điều chỉnh hồ sơ đã
                                                        `ACCEPTED`. Nhánh `STAFF_DRAFT_EDIT` sửa
                                                        GCN/chủ sử dụng khi `UNDER_REVIEW` đã ĐÓNG
                                                        — dùng PUT .../working-payload, tránh ghi
                                                        vào `draft_json` bị `working_payload_json`
                                                        che khuất)
PUT /api/submissions/:submissionId/working-payload   (2026-07-25, Phase 6 — sửa đầy đủ bản làm
                                                        việc: thửa đất, mục đích sử dụng)
PUT /api/submissions/:submissionId/internal-notes     (2026-07-29, Đợt 2A-2 — ô ghi chú nội bộ tự
                                                        do ≤ 4000 ký tự, tách khỏi PATCH chính vì
                                                        sửa được ở BẤT KỲ trạng thái nào, không cần
                                                        đang claim. Quyền SUBMISSION_DECISION_ROLES,
                                                        không sinh timeline, audit chỉ ghi độ dài
                                                        không ghi nội dung)
POST /api/submissions/:submissionId/action            (CLAIM/FORCE_CLAIM/RELEASE/TRANSFER/REJECT.
                                                        `REQUEST_SUPPLEMENT` đã bị chặn server-side
                                                        2026-07-29, Đợt 2A-1 — luồng mới không còn
                                                        yêu cầu bổ sung, cán bộ sửa trực tiếp)
PATCH /api/submissions/:submissionId/files/:fileId    (2026-07-30, Đợt 2C bổ sung — cán bộ gán
                                                        lại chủ sử dụng của một ảnh CCCD. Vá lỗ
                                                        "tải ảnh CCCD vào đúng ô nhưng gán nhầm
                                                        người" mà cả thay ảnh lẫn gỡ ảnh đều không
                                                        vá được. CHỈ ảnh CCCD (không áp dụng
                                                        CERTIFICATE). KHÔNG tự động đánh REPLACED
                                                        ảnh đang có ở ô đích — ném VERSION_CONFLICT
                                                        bắt cán bộ xử lý trước, khác hẳn appendFile
                                                        lúc thay ảnh. Gán đúng chủ đang có = NOOP
                                                        thành công, không lỗi, không audit. Audit
                                                        SUBMISSION_OFFICER_FILE_OWNER_REASSIGNED)
DELETE /api/submissions/:submissionId/files/:fileId   (2026-07-30, Đợt 2C — cán bộ gỡ ảnh GCN.
                                                        XÓA MỀM `status = DELETED`, KHÔNG chạm
                                                        Drive. CHỈ `CERTIFICATE`: CCCD là ràng buộc
                                                        của completionChecks, luồng đúng là thay
                                                        ảnh. Gỡ được cả ảnh do hộ dân tải lên.
                                                        Không đòi idempotency-key —
                                                        `markFileStatus` khóa dòng và no-op khi đã
                                                        `DELETED`. Audit
                                                        `SUBMISSION_OFFICER_FILE_DELETED`)
POST /api/submissions/:submissionId/uploads/initiate  (2026-07-30, Đợt 2C — cán bộ tự tải ảnh
POST /api/submissions/:submissionId/uploads/complete    giấy tờ bổ sung. Cửa quyền `mayStaffEdit`
                                                        (đang giữ hồ sơ + `UNDER_REVIEW`) +
                                                        SUBMISSION_DECISION_ROLES + CSRF; KHÔNG
                                                        dùng `resolvePublicRequest` được vì phiên
                                                        kê khai của hộ dân đã khóa đúng lúc đó.
                                                        `request_log.kind` =
                                                        `OFFICER_UPLOAD_COMPLETE`, tách khỏi
                                                        `PUBLIC_UPLOAD_COMPLETE` để hai đường
                                                        không đọc replay của nhau. Ghi audit
                                                        `SUBMISSION_OFFICER_FILE_UPLOADED`.
                                                        Không migration)
POST /api/submissions/:submissionId/accept             (chạy completionChecks trước khi mở saga)
POST /api/submissions/:submissionId/reset-access-secret
POST /api/exports
POST /api/ai/results                                   (2026-07-25, Phase 11 — worker AI gọi bằng
                                                         x-ai-worker-key; 503 khi AI_EXTRACTION_
                                                         ENABLED tắt)
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

# AI extraction (Phase 9-11, 2026-07-25) — mặc định tắt
AI_EXTRACTION_ENABLED=false
AI_EXTRACTION_WORKER_TYPE=ANTIGRAVITY
AI_EXTRACTION_PROMPT_VERSION=v1.0
AI_EXTRACTION_SCHEMA_VERSION=v1.0
AI_WORKER_API_KEY=            # khóa để worker gọi POST /api/ai/results
ANTIGRAVITY_WORKSPACE_ROOT=   # PHẢI ngoài cây repo — xem .env.example
```

Danh sách trên **chưa đầy đủ** so với `.env.example` thật — thiếu từ trước nhánh này
(`PUBLIC_SESSION_SECRET`, `PUBLIC_ACCESS_CODE_PEPPER`, `ORIGIN_SHARED_SECRET`,
`TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `CONSENT_NOTICE_VERSION`,
`PUBLIC_INTAKE_MODE`, `MIN_DRIVE_FREE_GB`). Đọc `.env.example` trực tiếp để có danh sách đúng —
mục này chỉ mới bổ sung phần AI extraction, chưa dọn lại toàn bộ.

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

## Migration/cutover (đã hoàn tất 2026-07-24)

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
Runtime production không còn đọc/ghi Google Sheets. Sheet cũ chỉ giữ read-only/restricted làm nguồn
legacy/rollback; không chạy lại ETL nếu không có kế hoạch phục hồi được phê duyệt.

## AI draft GCN — Antigravity local station (2026-07-26)

```text
PUBLIC_SUBMIT transaction → ai_extraction_jobs + ai_extraction_job_files (GCN/checksum)
→ local station poll READY_FOR_AGENT/lease hết hạn → claim idempotent manifest
→ Antigravity/Gemini 3.6 Flash đọc GCN gốc theo whitelist
→ POST /api/ai/results với workerInstanceId + lease còn hạn → schema/checksum/version/idempotency
→ ai_extraction_results + ai_field_comparisons + audit
→ cán bộ GET /ai-draft → POST /ai-draft/apply → working_payload (CLEAR + trống)
```

- `src/modules/ai-extraction/{draft,repository}.ts`: schema v2, so sánh dữ liệu và enqueue job.
- `src/app/api/ai/jobs/{ready,claim}`: giao manifest không có Drive link/CCCD; `results` nhận output
  idempotent và chặn kết quả cũ.
- `agent/AGENTS.md`: ranh giới local station. Máy dùng tài khoản quản trị mang nhãn
  `ADMIN_BROAD_ACCESS`; đây không phải rào chắn kỹ thuật tuyệt đối với CCCD.
- Claim và result bị buộc vào cùng `workerInstanceId`, lease đang hiệu lực và idempotency key; lease
  hết hạn có thể được station khác thu hồi nguyên tử. Trước khi phát manifest hoặc nhận result, server
  join lại `public_files` để xác nhận cùng submission, `CERTIFICATE`, `ORIGINAL`, `UPLOADED`, checksum
  và tên file. Job lỗi thời/manifest sai chuyển `STALE` trong cùng transaction + audit.
- Nhánh `STALE` cũng ghi `REQUEST_LOG` trong transaction, nên retry cùng idempotency key luôn nhận cùng
  lỗi `409`. Một trường `CLEAR` bắt buộc evidence có `fileId` thuộc manifest đã xác minh; server kiểm
  lại điều kiện này lúc nhập result và lúc lấy kết quả cũ để nạp nháp.
- AI không gọi từ Vercel, không ghi chính thức, không đọc CCCD/QR; chỉ số phát hành, ngày cấp, số
  vào sổ dạng chữ đánh máy cùng bằng chứng. Ảnh mờ/chữ viết tay trả `MANUAL_REQUIRED`. Server quét toàn
  bộ JSON trước persist: chuỗi giống CCCD 12 số bị từ chối fail-closed, không được lưu raw/normalized JSON.

## Vận hành

- Supabase project/compute nên ở Singapore gần Vercel `sin1`.
- Vercel dùng URI Supavisor transaction pooler port `6543`; transaction mode không dùng prepared statements.
- Backup Supabase hằng ngày/PITR theo gói và `pg_dump` mã hóa ra nơi độc lập.
- Backup Drive phải tách khỏi Gmail gốc; snapshot trong `99_BACKUP` không đủ.
- Không log query parameters có PII, connection string, QR raw, CCCD đầy đủ hoặc Drive link.
