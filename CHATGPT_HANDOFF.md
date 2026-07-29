# CHATGPT HANDOFF REPORT

## Phase 3 — lazy Drive folder creation (2026-07-29)

### 1. Trạng thái và phạm vi

- Trạng thái: `READY_FOR_REVIEW`.
- Repository: `D:\04. Github\capphongchau`.
- Branch: `codex/phase3-lazy-drive-folder`.
- Base: `8942d3cd17249aeb33b637fd992f1214f7740950` (`origin/main`, sau khi PR #9 merge).
- Commit dự kiến: `perf(public-intake): defer Drive folder creation`; commit ID cuối được ghi trong
  thông báo bàn giao vì chính file này nằm trong commit.
- Nguồn kế hoạch:
  `docs/PERFORMANCE_REVIEW_AND_IMPLEMENTATION_PLAN_CAPPHONGCHAU.md`, mục Phase 3.
- Trong phạm vi: migration additive, feature flag, lease/checkpoint PostgreSQL, lazy Drive folder,
  route guards, preflight, test và tài liệu.
- Ngoài phạm vi: Phase 5B, deploy Preview/Production, merge, thay đổi Vercel environment, áp migration
  lên database, dữ liệu thật.
- Không sửa `.env.local`; build Next.js tự đọc file này theo cơ chế framework nhưng không có request
  ra ngoài hay thao tác dữ liệu.

### 2. Baseline trước thay đổi

Worktree sạch trên base `8942d3c`.

| Lệnh | Kết quả baseline |
| --- | --- |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint -- --quiet` | PASS |
| `npm.cmd test` | PASS — 78 file, 680 test; 2 file/11 test skip |
| `npm.cmd run build -- --webpack` | PASS — 23/23 trang |

### 3. Luồng trước và sau

Trước:

```text
POST /api/public/submissions
→ Turnstile/consent/idempotency
→ gọi Drive tạo 01_INBOX/{submissionId}/originals
→ transaction public_submissions + request_log + audit
→ trả receipt/session
```

Sau, khi `LAZY_DRIVE_FOLDER_CREATION_ENABLED=true`:

```text
POST /api/public/submissions
→ Turnstile/consent/idempotency
→ transaction public_submissions(folder=NULL, state=PENDING)
  + request_log + audit
→ trả receipt/session, KHÔNG gọi Drive

POST .../uploads/initiate (sau toàn bộ validation file)
→ atomic UPDATE giành lease 60 giây, commit DB
→ request thắng lease: Drive list-before-create ngoài transaction
→ checkpoint folder ID + READY bằng lease timestamp làm fencing token
→ tạo resumable upload session
→ request thua lease: 503 SERVICE_UNAVAILABLE + Retry-After
```

Khi flag `false` (mặc định), CREATE tiếp tục tạo folder eager như trước và ghi state `READY`.

### 4. Schema và dữ liệu

Migration mới:
`supabase/migrations/202607290005_lazy_drive_folder_creation.sql`.

- `public_submissions.drive_folder_id` chuyển sang nullable.
- Thêm `drive_folder_state`: `PENDING | CREATING | READY | FAILED`.
- Thêm `drive_folder_lease_until`, `drive_folder_attempts`.
- Backfill folder ID hiện hữu sang `READY`; chuỗi rỗng được chuẩn hóa thành `NULL`.
- Thêm CHECK constraint và partial lease index.
- Migration additive/idempotent, không drop dữ liệu.
- Không lưu error message Drive vì có thể chứa ID/link nội bộ.

`PublicIntakeRepository.create` vẫn giữ `public_submissions`, `request_log` và audit trong cùng một
transaction. Không thay contract body/response của API create hoặc upload.

### 5. File và symbol đã sửa

| Khu vực | File / symbol chính | Nội dung |
| --- | --- | --- |
| Cấu hình | `.env.example`, `src/modules/common/env.ts` | Flag server-only, literal `true`, default `false` |
| Create | `createIntakeSubmission` | Lazy path ghi folder `NULL`, không gọi Drive |
| Điều phối | `submission-folder.ts`; `ensureSubmissionFolderReady` | Lease, READY checkpoint, retryable errors, fencing timestamp |
| Repository | `SubmissionRecord`, `tryAcquireSubmissionFolderLease`, `getSubmissionFolderSnapshot`, `markSubmissionFolderReady`, `markSubmissionFolderFailed` | SQL atomic và không giữ connection trong Drive call |
| Storage | `PublicIntakeStorage.ensureSubmissionFolder`, `findOrCreateFolderWithoutDatabaseLock` | Giữ lock cho shared `01_INBOX`; folder riêng list-before-create ngoài DB transaction |
| Routes | upload `initiate`, `complete`, file `DELETE` | Ensure trước resumable session; guard folder nullable |
| Acceptance | `runOfficialAcceptance` | Fail closed nếu folder chưa sẵn sàng |
| Migration gate | `scripts/preflight-public-intake-v2-migrations.ts` | Thêm 4 check cho migration `202607290005` (32 → 36) |
| Unit tests | `env.test.ts`, `public-submission-create.test.ts`, `submission-folder.test.ts`, `storage-distributed-lock.test.ts`, `public-upload-legacy-draft.test.ts` | Flag, no-Drive create, lease, recovery, failure, shared/unlocked folder behavior |
| Rehearsal test | `staging-rehearsal-acceptance-saga.integration.test.ts` | Hai request thật trên PostgreSQL chỉ một request thắng lease |
| Tài liệu | `AGENTS.md`, architecture/brain/plan/baseline | Đồng bộ schema, API, rollback và trạng thái chưa deploy |

### 6. Bảo mật, phân quyền và tình huống biên

- Không đổi Turnstile, consent, CSRF, session, role hoặc file validation.
- `ensureSubmissionFolderReady` chỉ chạy sau khi initiate đã xác thực phiên/CSRF, editable state,
  MIME, size, quota, owner và replace target.
- Complete/delete/official acceptance từ chối khi folder ID còn null.
- Cleanup orphan fail-safe: thiếu folder ID thì không xóa file client chỉ định.
- Request thua lease không gọi Drive; lease hết hạn cho phép retry.
- Timestamp lease là fencing token: worker cũ không thể ghi `READY`/`FAILED` đè lên lease mới.
- Retry sau crash giữa Drive create và DB checkpoint dùng list-before-create để nhận lại folder.
- Error trả client là thông báo chung; repository chỉ lưu state, không lưu Google error/ID/link.
- Không đổi phone masking, auth hay role contract.

### 7. Kết quả kiểm tra cuối

| Lệnh | Kết quả |
| --- | --- |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint -- --quiet` | PASS |
| `npm.cmd test` | PASS — 79 file, 688 test; 2 file/12 test skip |
| `npm.cmd run build -- --webpack` | PASS — compile, TypeScript và 23/23 trang |
| `git diff --check` | PASS |

Test PostgreSQL thật mới tự skip khi thiếu `ACCEPTANCE_SAGA_TEST_DATABASE_URL`; đây là hành vi an
toàn hiện hữu. Không dùng `SUPABASE_DATABASE_URL`/`.env.local` để thay thế. Vì chưa được cấp URL
rehearsal riêng trong lượt này nên integration đó chưa chạy thật.

### 8. Acceptance criteria

| Tiêu chí Phase 3 | Trạng thái | Bằng chứng |
| --- | --- | --- |
| CREATE không gọi Drive khi flag bật | PASS code/unit | `public-submission-create.test.ts` |
| Hồ sơ chưa upload không tạo folder | PASS code/unit | lazy create lưu `NULL/PENDING` |
| Create idempotency transaction không đổi | PASS code/review | cùng `PublicIntakeRepository.create` transaction |
| Hai initiate đồng thời chỉ một winner | PASS unit; rehearsal test sẵn sàng | busy test + optional PostgreSQL integration |
| Crash sau Drive create được phục hồi | PASS unit | storage list-before-create recovery test |
| Không giữ DB transaction trong Drive call riêng | PASS code/unit | unlocked descendant helper; shared INBOX vẫn lock |
| Retryable loser có `Retry-After` | PASS code | initiate trả 503 + 1/2 giây |
| Complete/delete/acceptance guard nullable | PASS code/typecheck | ba guard fail closed |
| Không regression auth/CSRF/PII | PASS local | full suite; contract không đổi |
| Preview migration/preflight/E2E | NOT RUN | không deploy hoặc dùng database trong lượt này |

Phase 3 mới `READY_FOR_REVIEW`, chưa được gọi là Preview PASS.

### 9. Rủi ro, rollback và bước tiếp theo

- Code mới yêu cầu migration `202607290005` phải được áp trước deploy vì repository INSERT tham chiếu
  `drive_folder_state`.
- Cần chạy preflight mở rộng và đạt **36/36** trên rehearsal sau khi áp migration.
- Bật flag chỉ trên Preview, chạy E2E: create khi Drive chậm, concurrent initiate, retry sau injected
  crash, upload/complete/delete và official acceptance; kiểm tra không có orphan/duplicate folder.
- Chỉ sau evidence trên mới cân nhắc bật Production. Trong lần này không deploy/merge.
- Rollback nhanh: đặt `LAZY_DRIVE_FOLDER_CREATION_ENABLED=false`; giữ schema nullable và các cột
  additive. Trước khi khôi phục NOT NULL phải repair mọi row folder null.

### 10. Diff quan trọng

```diff
+ LAZY_DRIVE_FOLDER_CREATION_ENABLED=false

- const driveFolderId = await storage.createSubmissionFolder(submissionId)
+ const driveFolderId = lazyDriveFolderCreation
+   ? null
+   : await storage.createSubmissionFolder(submissionId)

+ UPDATE public_submissions
+ SET drive_folder_state='CREATING',
+     drive_folder_lease_until=now() + interval '60 seconds',
+     drive_folder_attempts=drive_folder_attempts + 1
+ WHERE drive_folder_id IS NULL
+   AND (state pending/failed OR lease expired)

+ folderId = await ensureSubmissionFolderReady(record)
+ response.headers.set("Retry-After", ...)
```

