# CHATGPT HANDOFF REPORT

## Phase 3 lease-token rehearsal after PR #10 (2026-07-29)

### Outcome: READY_FOR_PREVIEW_REHEARSAL — not Phase 3 PASS, not Production-ready

- **Branch/base:** `codex/phase3-lazy-drive-folder`, based on `8942d3c` (`origin/main` after PR #9);
  it includes PR #10 and reviewer commit `bb0ffd8`. The corrective commit is
  `fix(public-intake): preserve lease token parameter precision`.
- **Git baseline:** clean branch at `fb2ddda`; local baseline typecheck and full Vitest had passed
  (79 files / 689 tests; 2 files / 13 tests skipped). User work was preserved.
- **Git status at handoff:** unrelated uncommitted PWA work (`next-env.d.ts`, `src/app/page.tsx`,
  `src/components/pwa-install-button.tsx`, `src/lib/pwa-install.ts`, `tests/pwa-install.test.ts` and
  its existing log entry) was present after the Phase 3 changes. It is deliberately not staged or
  included in this corrective commit.
- **Database scope:** migration `202607290005_lazy_drive_folder_creation.sql` was already applied to
  approved isolated rehearsal project `ddiaaweuqfvutogjckwc`. All rehearsal commands read only
  `ACCEPTANCE_SAGA_TEST_DATABASE_URL` from `.env.rehearsal.local`; Production database URL was removed
  from the test process. No Production migration, merge, deploy, feature-flag change or real Google
  Drive request was made.

### Root cause and exact correction

`drive_folder_lease_until::text` correctly returns microseconds, e.g.
`2026-07-29 16:15:36.185035+00`; yet a direct parameter
`${leaseToken}::timestamptz` is coerced by `postgres` through JavaScript millisecond precision before
PostgreSQL compares it (`...185+00`, a 35-microsecond mismatch). `READY` and `FAILED` therefore updated
zero rows, leaving a valid Drive folder uncheckpointed in `CREATING`.

```diff
- and drive_folder_lease_until = ${leaseToken}::timestamptz
+ and drive_folder_lease_until = (${leaseToken}::text)::timestamptz
```

The expression is now present in both `markSubmissionFolderReady` and
`markSubmissionFolderFailed`. The lease remains a string fencing token end-to-end: result columns use
`drive_folder_lease_until::text`, `SubmissionFolderSnapshot.leaseToken` stays a string, and neither
the folder service nor checkpoint path converts it to `Date`/ISO time.

### Files and symbols changed

| File | Symbols | Change |
| --- | --- | --- |
| `src/modules/public-intake/repository.ts` | `markSubmissionFolderReady`, `markSubmissionFolderFailed` | Cast bound lease token through text before `timestamptz` comparison. |
| `tests/staging-rehearsal-acceptance-saga.integration.test.ts` | Phase 3 token/fencing and concurrent lease cases | Fixed `.185035` token, READY/FAILED, wrong-token, stale-worker and one-Drive-call proof. |
| `docs/brain/03-decisions.md` | Phase 3 lease decision | Records text casting for both result and parameter paths. |
| `docs/brain/06-ai-working-log.md` | newest Phase 3 entry | Records rehearsal evidence and limited status. |
| `CHATGPT_HANDOFF.md` | this section | Official handoff update. |

### Verification and acceptance

| Check | Result |
| --- | --- |
| `npx.cmd vitest run tests/submission-folder.test.ts` | PASS — 1 file / 6 tests |
| Rehearsal `npx.cmd vitest run tests/staging-rehearsal-acceptance-saga.integration.test.ts` | PASS — **1 file / 12 tests** (real Postgres, fake Drive only) |
| fixed token `.185035` | READY and FAILED each checkpoint exactly one row |
| token `.185036` | READY and FAILED checkpoint zero rows; row remains `CREATING` |
| stale lease token | old worker cannot checkpoint after a new lease is acquired |
| concurrent initiate | both callers may observe READY, but exactly one Drive call/folder checkpoint |
| `npm.cmd run typecheck`; `npm.cmd run lint -- --quiet` | PASS |
| `npm.cmd test` | PASS — 79 files / 689 tests; 2 files / 13 tests skipped |
| `npm.cmd run build -- --webpack` | PASS — 23 routes |
| `preflight:public-intake-v2-migrations` on rehearsal | PASS — **36/36** |
| `git diff --check` | PASS |

### Scope, risks and next step

- No schema/API/security change: lease 60 seconds, attempt cap 10, `Retry-After: 3`, flag default false,
  auth, role, CSRF, Turnstile, consent and phone masking are unchanged.
- Build completed successfully. Next.js reported its normal environment discovery; no credential value
  was printed, and no OAuth/Drive API was called. Rehearsal and preflight themselves ran from a fresh
  temporary directory using only the isolated database URL.
- `LAZY_DRIVE_FOLDER_CREATION_ENABLED` remains **false**. Do not call this Phase 3 PASS until an
  authenticated Preview E2E exercises create, concurrent initiate, retry after a Drive interruption,
  complete/delete and acceptance with the flag enabled in Preview only.
- No Production deployment, no Production migration, no merge to `main`, and no actual Google Drive
  claim occurred. The remaining risk is therefore Preview integration, not the PostgreSQL fencing bug.

## Sửa review PR #10 — lease token Phase 3 (2026-07-29, Claude Code)

### 1. Trạng thái, git và commit

- Trạng thái: `READY_FOR_REVIEW`. Chưa merge, chưa áp migration, chưa deploy, chưa bật cờ.
- Branch: `claude/pr-review-cjlypf`, tách từ `dfb6cae09d300ab5c36ada4ea4e21846f2f3d863` (head PR #10,
  branch `codex/phase3-lazy-drive-folder`). Nhánh này chứa toàn bộ PR #10 **cộng** các fix dưới đây.
- `git status` sau khi commit: worktree sạch, không file untracked ngoài `.next/` và `node_modules/`
  (đều đã ignore).
- Commit: `fix(public-intake): keep Drive folder lease token lossless`; commit ID cuối được báo trong
  thông báo bàn giao vì chính file này nằm trong commit.
- Trong phạm vi: các phát hiện của vòng review PR #10.
- Ngoài phạm vi: áp migration, deploy Preview/Production, bật feature flag, merge PR.

### 2. Baseline trước thay đổi

Worktree sạch trên base `dfb6cae` (head PR #10):

| Lệnh | Kết quả baseline |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint -- --quiet` | PASS |
| `npm test` | PASS — 79 file, 688 test; 2 file/12 test skip |
| `npm run build -- --webpack` | PASS — 23/23 trang |

### 3. Lỗi chặn đã sửa

`tryAcquireSubmissionFolderLease` ghi `drive_folder_lease_until = now() + interval`, tức
`timestamptz` chính xác tới **micro-giây**. Driver `postgres` parse cột này thành `Date` của JS —
chỉ tới **mili-giây** — rồi `asIso()` cắt tiếp phần micro-giây. Khi `markSubmissionFolderReady`
so `drive_folder_lease_until = ${token}::timestamptz`, hai giá trị lệch nhau ở phần bị cắt:

```text
DB lưu:   2026-07-29 15:31:56.123456+00
Token gửi: 2026-07-29 15:31:56.123000+00   → khớp 0 dòng
```

Hệ quả trước khi sửa: `markSubmissionFolderReady` trả `null` → ném
`SubmissionFolderUnavailableError` → `markSubmissionFolderFailed` cũng so cùng token nên cũng khớp
0 dòng → hồ sơ kẹt `CREATING` với lease còn sống, thư mục Drive đã tạo nhưng không bao giờ được ghi
nhận, người dân nhận 503. Sau 60 giây lease hết hạn, lần thử lại đi đúng đường cũ và hỏng y hệt —
vòng lặp vĩnh viễn. Nghĩa là với `LAZY_DRIVE_FOLDER_CREATION_ENABLED=true`, **không lần upload nào
thành công**.

Vì sao CI xanh: toàn bộ unit test trong `tests/submission-folder.test.ts` mock repository và trả về
chuỗi literal `"future"`; test duy nhất chạm PostgreSQL thật là file `*.integration.test.ts` với
`describe.skipIf(!hasTestDb)` — nằm trong 12 test skip của baseline.

Cách sửa: đọc cột bằng `::text` để giá trị không bao giờ trở thành `Date`, và đổi tên
`SubmissionFolderSnapshot.leaseUntil` → `leaseToken` để bất biến "đây là token đối sánh, không phải
mốc thời gian để tính toán" hiện ngay ở tên gọi.

### 4. File và symbol đã sửa

| File | Symbol | Nội dung |
| --- | --- | --- |
| `src/modules/public-intake/repository.ts` | `SubmissionFolderRow.drive_folder_lease_until` | `Date \| null` → `string \| null`, kèm chú thích vì sao không được ép `Date` |
| | `SubmissionFolderSnapshot.leaseUntil` | đổi tên thành `leaseToken` |
| | `mapSubmissionFolder` | bỏ `asIso`, lấy thẳng chuỗi |
| | `tryAcquireSubmissionFolderLease` | `returning ... ::text as ...`; thêm điều kiện `drive_folder_attempts < 10` |
| | `getSubmissionFolderSnapshot`, `markSubmissionFolderReady` | `select`/`returning` cast `::text` |
| | `markSubmissionFolderReady`, `markSubmissionFolderFailed` | tham số `leaseUntil` → `leaseToken` |
| | `MAX_SUBMISSION_FOLDER_ATTEMPTS` | hằng số mới, export |
| `src/modules/public-intake/submission-folder.ts` | `SubmissionFolderBusyError.retryAfterSeconds` | `1` → `3` |
| | `ensureSubmissionFolderReady` | dùng `leaseToken`; hết trần thử lại thì ném `Unavailable` thay vì `Busy` |
| `src/modules/public-intake/storage.ts` | `listOrCreateOnDrive` | helper private mới, gom ~30 dòng trùng |
| | `findOrCreateFolder`, `findOrCreateFolderWithoutDatabaseLock` | gọi helper chung; giữ nguyên cơ chế khóa của mỗi hàm |
| | `ensureSubmissionFolder` | sửa comment nói sai rằng không còn transaction nào mở khi gọi Drive |
| `supabase/migrations/202607290005_...sql` | index lease | thêm chú thích: chỉ phục vụ vận hành, không truy vấn ứng dụng nào đọc |
| `tests/submission-folder.test.ts` | `snapshot`, case mới | đổi tên field; thêm case hết trần thử lại |
| `tests/staging-rehearsal-...integration.test.ts` | case mới | assert lease token round-trip nguyên vẹn |

Không đổi: schema migration (ngoài comment), tên endpoint, mã lỗi HTTP, feature flag, role, contract
audit.

### 5. Kết quả kiểm tra sau thay đổi

| Lệnh | Kết quả |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint -- --quiet` | PASS |
| `npm test` | PASS — 79 file, **689** test; 2 file/**13** test skip |
| `npm run build -- --webpack` | PASS — 23/23 trang, compiled in 43s |
| `git diff --check` | PASS |

Chênh lệch so với baseline: +1 test PASS (case hết trần thử lại) và +1 test skip (case round-trip
lease token, nằm trong file integration nên tự skip khi thiếu database rehearsal).

### 6. Acceptance criteria

- [x] Lease token round-trip không mất độ chính xác; `markSubmissionFolderReady` khớp đúng 1 dòng.
- [x] Retry vô hạn khi Drive lỗi kéo dài bị chặn bằng trần 10 lần.
- [x] `Retry-After` không mời client dồn request lên pool `max: 1`.
- [x] Không còn đoạn code trùng giữa hai helper folder; khác biệt duy nhất là cơ chế khóa.
- [x] Comment mô tả đúng hành vi thật của `ensureSubmissionFolder`.
- [x] typecheck/lint/test/build đều PASS.
- [ ] **Chưa đạt:** chạy file integration với database rehearsal thật. Bắt buộc trước khi bật cờ.
- [ ] **Chưa đạt:** áp migration + preflight 36/36 trên Preview.

### 7. Rủi ro và việc còn lại

- **Rủi ro cao nhất còn lại:** không unit test nào chạm tới đường lease thật. Test round-trip đã
  thêm sẽ bắt được đúng lỗi này, nhưng chỉ khi có `ACCEPTANCE_SAGA_TEST_DATABASE_URL`. Nếu Preview
  bật cờ mà chưa chạy file integration thì rủi ro tái diễn nguyên vẹn.
- **Trần 10 lần cần can thiệp thủ công:** hồ sơ chạm trần sẽ không bao giờ tự tạo được folder; phải
  reset `drive_folder_attempts` bằng tay. Chưa có runbook cho việc này.
- **Lease 60 giây so với độ trễ Drive:** nếu một lần gọi Drive vượt 60 giây, worker thứ hai có thể
  vào và tạo thư mục `{submissionId}` trùng. `list-before-create` thu hẹp nhưng không đóng hẳn cửa
  sổ này. Đánh đổi được chấp nhận, chưa ghi vào `03-decisions.md`.
- **Không có log ở biên Drive:** `submission-folder.ts` bắt lỗi trần (`catch {`) và không ghi gì.
  Đúng quy tắc không lộ PII/token, nhưng khi Drive lỗi sẽ không phân biệt được quota, credential hay
  thư mục bị xóa. Đề xuất log có lọc (tên lỗi + HTTP status, không kèm message) — chưa làm vì module
  `public-intake` hiện không có logger nào.
- **`discardIfOrphan` bỏ qua khi `driveFolderId` null**, để lại file mồ côi trên Drive. Chỉ xảy ra
  khi checkpoint READY bị mất — tức đúng trạng thái lỗi vừa sửa. Nên xem lại sau khi Preview xác
  nhận đường lease chạy đúng.

### 8. Diff chính

```diff
-  readonly drive_folder_lease_until: Date | null;
+  /**
+   * Luôn đọc bằng `::text`, KHÔNG để driver ép sang `Date`: `timestamptz` chính xác tới
+   * micro-giây còn `Date` của JS chỉ tới mili-giây. [...]
+   */
+  readonly drive_folder_lease_until: string | null;

-    leaseUntil: asIso(row.drive_folder_lease_until),
+    leaseToken: row.drive_folder_lease_until ?? "",

-      returning drive_folder_id, drive_folder_state, drive_folder_lease_until,
-        drive_folder_attempts
+      returning drive_folder_id, drive_folder_state,
+        drive_folder_lease_until::text as drive_folder_lease_until,
+        drive_folder_attempts

       where submission_id = ${submissionId}
         and drive_folder_id is null
+        and drive_folder_attempts < ${MAX_SUBMISSION_FOLDER_ATTEMPTS}

-  readonly retryAfterSeconds = 1;
+  /** Tạo folder Drive mất vài giây; 1 giây chỉ khiến client dồn request vô ích lên pool max:1. */
+  readonly retryAfterSeconds = 3;

-    if (current) throw new SubmissionFolderBusyError();
+    // Hết trần thử lại thì báo không khả dụng thay vì mời client quay lại vô hạn.
+    if (current && current.attempts < MAX_SUBMISSION_FOLDER_ATTEMPTS) {
+      throw new SubmissionFolderBusyError();
+    }
     throw new SubmissionFolderUnavailableError();
```

---

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
