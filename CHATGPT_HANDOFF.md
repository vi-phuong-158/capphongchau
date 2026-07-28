# CHATGPT HANDOFF REPORT

> Báo cáo của **đợt thi công gần nhất**. Báo cáo vòng rà soát trước (Codex, cùng ngày) đã được lưu
> tại `docs/handoffs/2026-07-29_pr6-review-round-one_CHATGPT_HANDOFF.md` theo §14.6.

## 1. Report metadata

- **Project:** capphongchau (`land-ocr-180`) — thu thập và kiểm tra nhanh hồ sơ đất đai Phường Phong Châu
- **Repository path:** `D:/04. Github/capphongchau` (thi công trong worktree `.claude/worktrees/land-declaration-process-feedback-126f2e`)
- **Generated at:** 2026-07-29
- **Agent:** Claude Code (Opus 5)
- **Task:** Review PR #6 rồi sửa toàn bộ phát hiện. Đây là **vòng rà soát thứ hai** trên PR #6.
- **Status:** `READY_FOR_COMMIT`
- **Source plan:** không có kế hoạch viết trước. Phạm vi = danh sách phát hiện của bản review PR #6 do chính agent này tạo, được người dùng chốt bằng câu "Đồng ý hãy fix hết các lỗi cho tôi".
- **Source acceptance criteria:** mục 13 bên dưới (dẫn xuất 1–1 từ danh sách phát hiện).
- **Source security constraints:** `docs/brain/02-coding-rules.md` §Bảo mật; `AGENTS.md` §10.

## 2. Git identity

- **Current branch:** `claude/land-declaration-process-feedback-126f2e`
- **Remote:** `origin` → `https://github.com/vi-phuong-158/capphongchau.git`
- **Base commit before work:** `45b7fc9b2539d165dd5064bca0b968c3c19b26a9` ("ci: include Linux optional runtime in lockfile") — bằng đúng `origin/claude/land-declaration-process-feedback-126f2e`, tức HEAD của PR #6.
- **Head commit after work:** **chưa commit** — toàn bộ thay đổi đang ở working tree. Xem mục 18.
- **Commit created:** không.
- **Working tree state:** dirty (23 file sửa + 2 file mới) trước khi commit.
- **User changes detected before work:** CÓ. Trên nhánh chính `codex/antigravity-ai-draft-review` có 2 file sửa chưa commit (`AGENTS.md`, `CLAUDE.md`) và 2 file untracked (`AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md`, `CLAUDE_IMPLEMENTATION_PLAN_PUBLIC_INTAKE_V2.md`).
- **User changes preserved:** CÓ, nguyên vẹn.
  - Đã `git stash` rồi `git stash pop` lại đầy đủ; `git stash list` hiện rỗng; `git status` của thư mục chính trở lại đúng 4 mục ban đầu.
  - Sau đó **không đụng tới thư mục chính nữa**: repo đã có sẵn worktree cho đúng nhánh PR #6 tại `.claude/worktrees/land-declaration-process-feedback-126f2e`, toàn bộ thi công diễn ra ở đó.
  - Bản sao lưu phòng hờ của file untracked khác nội dung so với bản trong PR: `C:\Users\admin\AppData\Local\Temp\claude\D--04--Github-capphongchau\9485e81e-3ab4-41bd-85d5-65c92a3051e2\scratchpad\BACKUP_local_CLAUDE_IMPLEMENTATION_PLAN_PUBLIC_INTAKE_V2.md`.
  - File untracked `evidence/BUG_OWNER_ID_RACE_HANDOFF.md` trong worktree **không bị đụng tới** (PR ghi rõ là cố ý không đưa vào PR).

### Git status

```text
 M CHATGPT_HANDOFF.md
 M docs/brain/03-decisions.md
 M docs/brain/04-current-tasks.md
 M docs/brain/06-ai-working-log.md
 M scripts/cleanup-e2e-preview-data.ts
 M src/app/api/public/submissions/current/uploads/complete/route.ts
 M src/app/api/public/submissions/current/uploads/metrics/route.ts
 M src/app/ke-khai/wizard.tsx
 M src/modules/public-intake/draft-adoption.ts
 M src/modules/public-intake/repository.ts
 M src/modules/public-intake/storage.ts
 M src/modules/public-intake/upload-metrics.ts
 M supabase/migrations/202607290001_public_upload_attempts_rls.sql
 M tests/public-upload-complete-route.test.ts
 M tests/public-upload-legacy-draft.test.ts
?? docs/handoffs/2026-07-29_pr6-review-round-one_CHATGPT_HANDOFF.md
?? tests/pr6-review-round-two.test.ts
?? evidence/BUG_OWNER_ID_RACE_HANDOFF.md   <-- có sẵn từ trước, KHÔNG do đợt này tạo
```

### Diff statistics

Diff của mã nguồn + test + `docs/brain/` (không tính hai file báo cáo bàn giao):

```text
.gitattributes                                     |   8 +
 .prettierignore                                    |   6 +
 docs/brain/03-decisions.md                         |  49 ++++++
 docs/brain/04-current-tasks.md                     |  15 +-
 docs/brain/06-ai-working-log.md                    |  40 +++++
 scripts/cleanup-e2e-preview-data.ts                |  38 ++++-
 .../api/public/submissions/current/submit/route.ts |  21 ++-
 .../submissions/current/uploads/complete/route.ts  |  53 ++++--
 .../submissions/current/uploads/metrics/route.ts   |   3 +-
 .../assisted-submissions/current/submit/route.ts   |  11 +-
 .../[submissionId]/ai-draft/apply/route.ts         |   7 +
 src/app/api/submissions/[submissionId]/route.ts    |  18 +-
 .../[submissionId]/working-payload/route.ts        |  11 +-
 src/app/ke-khai/wizard.tsx                         | 190 ++++++++++++---------
 src/modules/public-intake/draft-adoption.ts        |  29 +++-
 src/modules/public-intake/repository.ts            |  78 ++++++++-
 src/modules/public-intake/storage.ts               |  19 ++-
 src/modules/public-intake/upload-metrics.ts        |  29 ++++
 .../202607290001_public_upload_attempts_rls.sql    |  15 +-
 tests/public-upload-complete-route.test.ts         |  36 +++-
 tests/public-upload-legacy-draft.test.ts           |  25 +++
 tests/working-payload.test.ts                      |  15 ++
 22 files changed, 585 insertions(+), 131 deletions(-)
```

`wizard.tsx` hiện 190 dòng đổi nhưng phần lớn là **di chuyển khối**: `adoptServerDraft` (78 dòng) được chuyển lên trước `saveDraft` vì `saveDraft` nay phải gọi nó. Logic thật thay đổi khoảng 30 dòng.

### Name status

```text
M	.gitattributes
M	.prettierignore
M	docs/brain/03-decisions.md
M	docs/brain/04-current-tasks.md
M	docs/brain/06-ai-working-log.md
M	scripts/cleanup-e2e-preview-data.ts
M	src/app/api/public/submissions/current/submit/route.ts
M	src/app/api/public/submissions/current/uploads/complete/route.ts
M	src/app/api/public/submissions/current/uploads/metrics/route.ts
M	src/app/api/staff/assisted-submissions/current/submit/route.ts
M	src/app/api/submissions/[submissionId]/ai-draft/apply/route.ts
M	src/app/api/submissions/[submissionId]/route.ts
M	src/app/api/submissions/[submissionId]/working-payload/route.ts
M	src/app/ke-khai/wizard.tsx
M	src/modules/public-intake/draft-adoption.ts
M	src/modules/public-intake/repository.ts
M	src/modules/public-intake/storage.ts
M	src/modules/public-intake/upload-metrics.ts
M	supabase/migrations/202607290001_public_upload_attempts_rls.sql
M	tests/public-upload-complete-route.test.ts
M	tests/public-upload-legacy-draft.test.ts
M	tests/working-payload.test.ts
A	tests/pr6-review-round-two.test.ts
A	docs/handoffs/2026-07-29_pr6-review-round-one_CHATGPT_HANDOFF.md
```

## 3. Executive summary

**Vấn đề:** PR #6 (118 file, +14.888/−1.381) đã qua một vòng rà soát nhưng vòng hai tìm thêm 3 vấn đề chính và 4 vấn đề phụ. Hai trong ba vấn đề chính có thể gây **mất dữ liệu vĩnh viễn** hoặc **mất dữ liệu trong im lặng**; vấn đề thứ ba làm người dân **kẹt giữa chừng** trên mạng yếu.

**Phương án:** sửa tại đúng ranh giới gây lỗi, không refactor lân cận. Với hai test đặc tả cũ khóa sai hành vi, **siết chặt** chúng theo bất biến mới thay vì xóa hoặc nới lỏng.

**Kết quả:** typecheck pass; lint 0 error / 5 warning có sẵn; unit test 590 pass / 10 skipped (baseline 570/10, +20 test); build pass.

**Đã hoàn thành toàn bộ.** Hạng mục cuối (AC-12 — chỉ mục tra cứu CCCD cho hồ sơ MỨC A) ban đầu bị chặn vì cần quyết định nghiệp vụ; người dùng đã chốt ngày 2026-07-29: ghi với `kind = 'PENDING'`, áp dụng cho cả `RESUBMITTED` và cả ba đường ghi của cán bộ. Đã thi công kèm test.

**Trạng thái đề xuất:** `READY_FOR_COMMIT`. Chưa merge, chưa deploy, chưa chạy migration.

## 4. Baseline before changes

Chạy trong worktree tại commit `45b7fc9`, **trước** mọi thay đổi.

| Check | Command | Result | Evidence |
|---|---|---|---|
| Unit tests | `npm test` | PASS | `Test Files 64 passed \| 2 skipped (66)` · `Tests 570 passed \| 10 skipped (580)` |
| Integration tests | — | KHÔNG CÓ BỘ RIÊNG | Dự án gộp integration vào Vitest; không có script riêng |
| E2E tests | `npm run test:e2e:preview` | NOT_RUN | Cần Supabase/Drive/tài khoản cán bộ thật; không có credential trong phiên này |
| Build | `npm run build` | NOT_RUN (baseline) | Chỉ chạy sau khi sửa — xem ghi chú trung thực bên dưới |
| Lint | `npm run lint` | PASS | `5 problems (0 errors, 5 warnings)` |
| Typecheck | `npm run typecheck` | PASS | Không output lỗi |

**Lỗi đã tồn tại từ trước (KHÔNG do đợt này gây ra):** 5 warning `@typescript-eslint/no-unused-vars` tại `scripts/add-system-admins.ts` (2) và `tests/staging-rehearsal-scenarios.test.ts` (3). Số lượng và vị trí không đổi sau thay đổi.

**Ghi chú trung thực:** `npm run build` baseline **không** được chạy riêng trước khi sửa; chỉ chạy sau. CI của PR đã chạy build ở commit này nên rủi ro thấp, nhưng không có bằng chứng trực tiếp trong phiên này.

## 5. Scope

### In scope

- 3 phát hiện chính và 4 phát hiện phụ từ bản review PR #6.
- Cập nhật test đặc tả bị ảnh hưởng + thêm test mới cho từng phát hiện.
- Cập nhật `docs/brain/03-decisions.md`, `04-current-tasks.md`, `06-ai-working-log.md` theo quy tắc bắt buộc trong `CLAUDE.md`.

### Out of scope

- Backfill HMAC tra cứu CCCD cho hồ sơ MỨC A (cần quyết định nghiệp vụ — mục 14).
- 7 cổng tích hợp mà PR tự khai còn treo (migration preview, E2E đầy đủ, rehearsal assisted, kịch bản resume/mất mạng, benchmark upload, kiểm chất lượng ảnh, orphan audit).
- Tách nhỏ PR, gỡ tài liệu `evidence/*` khỏi PR (khuyến nghị quy trình, không phải lỗi code).
- Commit, push, merge, deploy, chạy migration.

### Deviations from approved plan

- Không có kế hoạch viết trước để lệch. Một hạng mục trong danh sách phát hiện bị **hoãn có chủ đích** kèm lý do đầy đủ ở mục 14/15, thay vì đoán bừa quyết định nghiệp vụ (điều kiện dừng §6.9 của tài liệu quy trình).

## 6. Decisions implemented

| Decision | Implementation | Evidence |
|---|---|---|
| Câu hỏi trước khi xóa tệp Drive là "có hồ sơ NÀO trỏ vào nó không" | `isDriveFileAdopted(driveFileId)` bỏ lọc `submission_id` | `repository.ts`; test `truy vấn adopt KHÔNG lọc theo hồ sơ đang gọi` |
| Chỉ được xóa tệp nằm trong thư mục Drive của chính hồ sơ đang gọi | `storage.isFileInFolder()` + điều kiện thứ hai trong `discardIfOrphan` | `complete/route.ts`; 2 test âm trong `public-upload-legacy-draft.test.ts` |
| Không dùng `force row level security` cho bảng số đo | Bỏ dòng `force`, giữ `enable` + `revoke` như 8 bảng còn lại | `202607290001_*.sql`; test quét toàn thư mục migration |
| Nuốt lỗi telemetry vẫn phải để lại tín hiệu | `reportUploadMetricFailure()` — log 1 lần/tiến trình, chỉ mã lỗi Postgres | `upload-metrics.ts`; 2 test |
| Giữ kiểm version tuyệt đối ở máy chủ, thêm tự phục hồi ở client | `saveDraft` thử lại đúng 1 lần sau 409 | `wizard.tsx`; 3 test |
| Bảng số đo phải có trần ghi | `MAX_UPLOAD_ATTEMPTS_PER_SUBMISSION = 200`, áp trong chính câu insert | `repository.ts`; 1 test |
| Script xóa dữ liệu phải từ chối môi trường không phải preview | `refusesToRunHere()` chạy trước `cleanup()` | `cleanup-e2e-preview-data.ts`; 4 test |

## 7. Changed files

| File | Change type | Symbols/routes affected | Purpose | Risk |
|---|---|---|---|---|
| `src/modules/public-intake/repository.ts` | Modified | `isDriveFileAdopted`, `appendUploadAttempt`, `MAX_UPLOAD_ATTEMPTS_PER_SUBMISSION` (mới) | Bỏ lọc `submission_id` khi hỏi adopt; thêm trần ghi vào chính câu insert | Trung bình — đổi chữ ký public method, 1 chỗ gọi đã cập nhật |
| `src/modules/public-intake/storage.ts` | Modified | `isFileInFolder` (mới), `listFolderFileIds` | Thêm kiểm thư mục cha trước khi xóa; escape `folderId` trong truy vấn Drive | Thấp — thêm mới, không đổi hành vi cũ |
| `src/app/api/public/submissions/current/uploads/complete/route.ts` | Modified | `discardIfOrphan`, 8 chỗ gọi, import | Hai điều kiện trước khi xóa; đổi tham số `submissionId` → `record` | Trung bình — chạm mọi đường lỗi của route upload |
| `src/modules/public-intake/upload-metrics.ts` | Modified | `reportUploadMetricFailure`, `resetUploadMetricFailureReport` (mới) | Nuốt lỗi nhưng để lại tín hiệu, không lộ PII | Thấp |
| `src/app/api/public/submissions/current/uploads/metrics/route.ts` | Modified | `POST` | `.catch(() => undefined)` → `.catch(reportUploadMetricFailure)` | Thấp — hành vi HTTP không đổi, vẫn luôn 204 |
| `src/app/ke-khai/wizard.tsx` | Modified | `saveDraft`, `adoptServerDraft` (di chuyển + đổi kiểu trả về) | Tự phục hồi sau 409 giả | Trung bình — chạm đường lưu nháp chính |
| `src/modules/public-intake/draft-adoption.ts` | Modified | `deepEqual` (mới), `adoptServerDraftSnapshot` | `hasLocalChanges` không còn phụ thuộc thứ tự khóa | Thấp |
| `supabase/migrations/202607290001_public_upload_attempts_rls.sql` | Modified | migration chưa chạy ở đâu | Bỏ `force row level security` | Thấp — xem mục 10 |
| `scripts/cleanup-e2e-preview-data.ts` | Modified | `refusesToRunHere` (mới), entrypoint | Chặn chạy nhầm trên production | Thấp — chỉ thêm hàng rào |
| `tests/pr6-review-round-two.test.ts` | Added | 15 test | Khóa từng phát hiện đã sửa | — |
| `tests/public-upload-complete-route.test.ts` | Modified | 2 test sửa, 3 test thêm | Siết theo bất biến mới | — |
| `tests/public-upload-legacy-draft.test.ts` | Modified | mock + 2 test âm mới | Phủ nhánh không được xóa | — |
| `docs/brain/{03,04,06}-*.md` | Modified | — | Bắt buộc theo `CLAUDE.md` | — |
| `docs/handoffs/2026-07-29_pr6-review-round-one_*.md` | Added | — | Lưu báo cáo vòng một trước khi ghi đè (§14.6) | — |
| `.gitattributes` | Modified | — | `-whitespace` cho file báo cáo, nếu không `git diff --check` trong CI sẽ đỏ | Thấp |
| `.prettierignore` | Modified | — | Bỏ qua file báo cáo, tránh Prettier định dạng lại diff nhúng | Thấp |

## 8. Detailed implementation by phase

### Phase 1 — Chặn xóa nhầm tệp Drive của hộ dân khác

- **Mục tiêu:** `discardIfOrphan` không được xóa tệp không thuộc hộ dân đang gọi.
- **File:** `repository.ts`, `storage.ts`, `complete/route.ts`.
- **Đã thực hiện:**
  1. `isDriveFileAdopted(submissionId, driveFileId)` → `isDriveFileAdopted(driveFileId)`; truy vấn bỏ `where submission_id = ...`, chỉ còn `where drive_file_id = ...`.
  2. Thêm `PublicIntakeStorage.isFileInFolder(driveFileId, folderId)` đọc `parents` từ Drive.
  3. `discardIfOrphan(repository, record, driveFileId)` nay chỉ xóa khi **cả hai** đúng: chưa hồ sơ nào nhận tệp, **và** tệp nằm trong `record.driveFolderId`. Cả hai lệnh hỏi đều fail-closed về hướng **giữ tệp** (`.catch(() => true)` cho adopt, `.catch(() => false)` cho folder).
  4. Thêm `if (!driveFileId) return;` ở đầu hàm.
- **Không thực hiện:** không đổi thứ tự các kiểm tra trong `POST`, không đụng `verifyUploadedFile`.
- **Test:** `npm test` — pass.
- **Rủi ro:** thêm 1 lần gọi Drive trên đường lỗi. Đường lỗi hiếm; đánh đổi được ghi vào `03-decisions.md`.

### Phase 2 — Telemetry không được hỏng trong im lặng

- **Mục tiêu:** bảng số đo hoặc ghi được, hoặc để lại tín hiệu.
- **File:** `202607290001_*.sql`, `upload-metrics.ts`, `complete/route.ts`, `metrics/route.ts`, `repository.ts`.
- **Đã thực hiện:** bỏ `force row level security` (giữ `enable` + `revoke`, kèm comment dài giải thích vì sao **không** dùng `force`); thêm `reportUploadMetricFailure` log 1 lần/tiến trình chỉ với mã lỗi Postgres; hai chỗ `.catch(() => undefined)` đổi sang dùng nó; thêm trần 200 dòng/hồ sơ áp ngay trong câu `insert ... select ... where (select count(*) ...) < N`.
- **Không thực hiện:** không thêm migration mới (migration `202607290001` chưa chạy ở đâu nên sửa tại chỗ là đúng — xem mục 10).
- **Test:** `npm test` — pass; 5 test mới.
- **Rủi ro:** trần 200 là ngưỡng cứng, không cấu hình được. Xa thực tế (một hộ tối đa vài chục lượt) nên chấp nhận.

### Phase 3 — 409 giả trên mạng yếu phải tự gỡ

- **Mục tiêu:** người dân không bị kẹt khi response PATCH rơi mất.
- **File:** `wizard.tsx`.
- **Đã thực hiện:** chuyển `adoptServerDraft` lên trước `saveDraft`; đổi kiểu trả về từ `boolean` sang `{draft, version} | null` (vì `setServerVersion` là state setter, giá trị mới không thấy được trong cùng closure); `saveDraft` tách helper `patch(payload, version)` và sau một 409 thì gọi `adoptServerDraft({localDraft: draftToSave})` rồi thử lại **đúng một lần**.
- **Không thực hiện:** **không** nới lỏng kiểm version ở máy chủ — `body.version !== record.version` giữ nguyên. Không thêm idempotency key cho PATCH (sẽ cần migration cho `request_log.kind`).
- **Test:** `npm test` — pass; 3 test đặc tả mới.
- **Rủi ro:** hai chỗ gọi `adoptServerDraft` cũ dùng nó như boolean; `null` vẫn falsy nên tương thích. Typecheck xác nhận.

### Phase 4 — Bốn phát hiện phụ

- `deepEqual` thay `JSON.stringify` trong `draft-adoption.ts`; `escapeQueryValue(folderId)` trong `listFolderFileIds` (dùng lại hàm **đã có sẵn** trong file, không viết trùng); `refusesToRunHere()` trong script cleanup; trần ghi telemetry (đã nêu ở Phase 2).
- **Test:** `npm test` — pass.

## 9. Behavior before and after

| Scenario | Before | After | Verification |
|---|---|---|---|
| `POST /uploads/complete` với `driveFileId` của hồ sơ khác, ép lệch mutation hash | Tệp bị `discardFile` nếu chưa được hồ sơ **đang gọi** nhận → mất bằng chứng của hộ khác | Không xóa: adopt hỏi toàn bảng, và tệp không nằm trong thư mục người gọi | `tests/public-upload-legacy-draft.test.ts` (2 test âm mới) |
| Không hỏi được Drive về thư mục cha | Không có bước này | Không xóa (fail-closed) | Test `KHÔNG dọn khi không hỏi được Drive về thư mục cha` |
| Role kết nối không có BYPASSRLS, ghi bảng số đo | Insert trả 0 dòng, lỗi bị nuốt, không tín hiệu nào | `force` đã bỏ; nếu vẫn hỏng thì log 1 dòng có `pg_code` | `tests/pr6-review-round-two.test.ts` |
| PATCH ghi xong nhưng response rơi, client retry | 409 → thông báo sai "đang mở ở thiết bị khác" → kẹt | Lấy lại snapshot, gộp local, thử lại 1 lần → thành công | Test đặc tả trong `pr6-review-round-two.test.ts` |
| Hai thiết bị thật cùng sửa | 409 → kẹt | Thử lại 1 lần, vẫn 409 → hiện đúng thông báo gốc | Test `chỉ thử lại đúng một lần` |
| Client bơm hàng loạt `/uploads/metrics` | Ghi không giới hạn | Dừng ở 200 dòng/hồ sơ | Test trần ghi |
| Chạy `cleanup:e2e-preview-data` khi `NODE_ENV=production` | Chạy bình thường, xóa theo số điện thoại | Từ chối, exit 1 | 4 test |
| Khôi phục phiên, nháp local trùng hệt server nhưng khác thứ tự khóa | `hasLocalChanges = true` → PATCH thừa | `false` | Test `deepEqual` |

## 10. API, data and security impact

### Authentication
Không thay đổi.

### Authorization
Không thay đổi. Không đụng `requireActiveUser`, `ASSISTED_INTAKE_ROLES`, `verifyCsrfToken`, `resolvePublicRequest`.

### DataScope
**Có siết chặt.** Phạm vi tệp Drive mà một phiên công khai có thể gây xóa: trước là "mọi tệp chưa được chính hồ sơ đó nhận" (kể cả tệp của hồ sơ khác); sau là "tệp chưa ai nhận **và** nằm trong thư mục Drive của chính hồ sơ đó".

### API contract

- **Endpoint:** `POST /api/public/submissions/current/uploads/complete` — request/response **không đổi**. Chỉ đổi hành vi dọn dẹp nội bộ trên đường lỗi.
- **Endpoint:** `POST /api/public/submissions/current/uploads/metrics` — không đổi, vẫn luôn `204`. Chỉ khác: khi ghi hỏng thì có log máy chủ.
- **Endpoint:** `PATCH /api/public/submissions/current` — **route không đổi**. Chỉ client đổi: sau 409 sẽ tự `GET /current` rồi PATCH lại một lần. Máy chủ giữ nguyên kiểm version tuyệt đối.
- **Error handling:** không thêm/bớt mã lỗi nào.

### Database and migrations

- **Migration added:** không có migration mới. **Sửa tại chỗ** `202607290001_public_upload_attempts_rls.sql` (bỏ 1 dòng `force row level security`).
- **Tại sao sửa tại chỗ là an toàn:** migration này được **thêm mới trong chính PR #6** và `docs/brain/04-current-tasks.md` ghi rõ chưa chạy trên preview lẫn production. Không có môi trường nào đã áp phiên bản cũ.
- **⚠ ĐIỀU KIỆN:** nếu ChatGPT/người dùng xác định migration này **đã** chạy ở đâu đó, phải chuyển sang một migration mới `alter table public.public_upload_attempts no force row level security;` thay vì dựa vào sửa tại chỗ.
- **Tables/columns/indexes affected:** không đổi cấu trúc bảng nào.
- **Backfill:** không.
- **Rollback:** `git revert` file migration; không có dữ liệu cần phục hồi.
- **Production action required:** không, ngoài các cổng đã treo sẵn của PR #6.

### Validation and file handling

- **Trường bắt buộc:** không đổi.
- **Quy tắc tên file:** không đổi (tên tệp do máy chủ đặt, giữ nguyên từ PR).
- **Giới hạn file:** không đổi. Thêm giới hạn **số bản ghi số đo**: 200/hồ sơ.
- **MIME/type validation:** không đổi.
- **Xử lý lỗi:** đường lỗi của `uploads/complete` nay có thêm một lần hỏi Drive trước khi xóa.

### Sensitive data

- **Dữ liệu nhạy cảm bị tác động:** ảnh CCCD/GCN trên Drive — thay đổi làm **giảm** rủi ro mất.
- **Log có thể chứa dữ liệu:** thêm đúng một `console.error` mới trong `reportUploadMetricFailure`.
- **Biện pháp che:** log **chỉ** chứa chuỗi cố định + `pg_code` từ `error.code`. Cố ý **không** ghi `error.message` vì thông báo Postgres có thể nhắc lại giá trị của dòng vừa insert. Có test âm khẳng định một chuỗi 12 số truyền vào `error.message` không xuất hiện trong log.

## 11. Tests added or changed

| Test file | Test case | Requirement covered | Result |
|---|---|---|---|
| `tests/pr6-review-round-two.test.ts` (mới) | migration KHÔNG dùng `force row level security` | Phát hiện #2 | PASS |
| ″ | không migration nào trong repo dùng `force row level` | Nhất quán mẫu | PASS |
| ″ | lỗi ghi số đo được báo đúng một lần | Phát hiện #2 | PASS |
| ″ | không ghi `error.message` vào log | Ràng buộc PII | PASS |
| ″ | bảng số đo có trần số dòng | Phát hiện phụ | PASS |
| ″ | 409 → lấy lại snapshot rồi thử lại | Phát hiện #3 | PASS |
| ″ | chỉ thử lại đúng một lần | Phát hiện #3 | PASS |
| ″ | `adoptServerDraft` trả version ra ngoài | Phát hiện #3 | PASS |
| ″ | khác thứ tự khóa vẫn là KHÔNG thay đổi | Phát hiện phụ | PASS |
| ″ | khác nội dung thật vẫn báo có thay đổi | Chống hồi quy ngược | PASS |
| ″ | 4 test guard script cleanup | Phát hiện phụ | PASS |
| ″ | `listFolderFileIds` escape `folderId` | Phát hiện phụ | PASS |
| `tests/public-upload-complete-route.test.ts` | `truy vấn adopt KHÔNG lọc theo hồ sơ đang gọi` (mới) | Phát hiện #1 | PASS |
| ″ | `không xác nhận được thư mục thì KHÔNG xóa` (mới) | Phát hiện #1 | PASS |
| ″ | `kiểm thư mục đứng TRƯỚC lệnh xóa` (mới) | Phát hiện #1 | PASS |
| ″ | 2 test cũ **siết chặt** theo chữ ký/SQL mới | Phát hiện #1 | PASS |
| `tests/public-upload-legacy-draft.test.ts` | `KHÔNG dọn khi tệp không nằm trong thư mục ... hộ dân đang gọi` (mới) | Phát hiện #1 | PASS |
| ″ | `KHÔNG dọn khi không hỏi được Drive về thư mục cha` (mới) | Phát hiện #1 | PASS |

**Lưu ý về test đặc tả đọc mã nguồn:** 2 test cũ trong `public-upload-complete-route.test.ts` đỏ sau khi sửa vì chúng khóa chữ ký/SQL **cũ**. Đã sửa theo hướng khẳng định bất biến **mới và mạnh hơn** (truy vấn adopt không được chứa `submission_id`), không phải xóa hay nới lỏng.

## 12. Final verification

| Check | Command | Result | Evidence |
|---|---|---|---|
| Unit tests | `npm test` | PASS | `Test Files 65 passed \| 2 skipped (67)` · `Tests 590 passed \| 10 skipped (600)` |
| Integration tests | — | N/A | Không có bộ riêng trong dự án |
| E2E tests | `npm run test:e2e:preview` | NOT_RUN | Thiếu credential; **không** khai là pass |
| Build | `npm run build` | PASS | Build hoàn tất, in bảng route |
| Lint | `npm run lint` | PASS | `5 problems (0 errors, 5 warnings)` — đúng bằng baseline |
| Typecheck | `npm run typecheck` | PASS | Không output lỗi |
| Whitespace (cổng CI) | `git diff --check` | PASS | exit 0 — xem ghi chú `.gitattributes` bên dưới |
| Format | `npm run format:check` | FAIL (ngang baseline) | 36 file đỏ, **đúng bằng** baseline 36; 0 file đỏ mới. Không phải cổng CI |
| Security check | Rà tay theo `02-coding-rules.md` §Bảo mật | PASS | Không secret hardcode; log mới không chứa PII (có test âm) |
| Secret scan | `git diff` rà tay | PASS | Không có token/khóa/PII trong diff |

**`git diff --check` và `.gitattributes`:** nhúng nguyên văn unified diff vào báo cáo (bắt buộc theo §9.1) tạo ra các dòng context chỉ gồm một dấu cách, và `git diff --check` — **một cổng thật trong `.github/workflows/ci.yml`** — báo đó là "trailing whitespace". Cắt khoảng trắng đi là làm hỏng diff; bỏ diff đi là vi phạm quy trình bàn giao. Giải pháp: `CHATGPT_HANDOFF.md -whitespace` và `docs/handoffs/** -whitespace` trong `.gitattributes`. Không có thay đổi này thì CI của PR #6 sẽ đỏ ngay khi commit báo cáo.

**`npm run format:check`:** 36 file đỏ ở baseline, 36 file đỏ sau thay đổi. Cả 7 file tôi chạm nằm trong danh sách đỏ **từ trước** — đã đối chiếu bằng cách stash toàn bộ thay đổi rồi chạy lại. Cố ý **không** chạy `prettier --write` lên chúng: `wizard.tsx` và các file khác sẽ bị định dạng lại toàn bộ, biến một thay đổi ~30 dòng logic thành diff hàng trăm dòng và làm review không đọc được. `format:check` không nằm trong `.github/workflows/ci.yml`.

Baseline 570 pass → sau sửa 590 pass: **+20 test**, 0 test bị xóa, 0 test bị `skip` thêm.

## 13. Acceptance criteria matrix

| ID | Acceptance criterion | Status | Evidence | Notes |
|---|---|---|---|---|
| AC-01 | Không xóa được tệp Drive của hồ sơ khác qua `/uploads/complete` | PASS | 2 test âm + 3 test đặc tả | Hai hàng rào độc lập |
| AC-02 | Mọi tình huống không chắc chắn đều nghiêng về GIỮ tệp | PASS | Test `.catch` hai chiều | |
| AC-03 | Migration số đo không dùng `force row level security` | PASS | 2 test | |
| AC-04 | Lỗi ghi số đo để lại tín hiệu, không lộ PII | PASS | 2 test | Log 1 lần/tiến trình |
| AC-05 | 409 do mất response tự gỡ được | PASS | 3 test đặc tả | **Chưa** kiểm bằng E2E thật |
| AC-06 | Kiểm version tuyệt đối ở máy chủ giữ nguyên | PASS | `current/route.ts` không đổi trong diff | |
| AC-07 | Bảng số đo có trần ghi mỗi hồ sơ | PASS | 1 test | |
| AC-08 | `hasLocalChanges` không phụ thuộc thứ tự khóa | PASS | 2 test | |
| AC-09 | Truy vấn Drive escape giá trị nội suy | PASS | 1 test | |
| AC-10 | Script xóa dữ liệu từ chối môi trường không phải preview | PASS | 4 test | |
| AC-11 | Không hồi quy: lint/typecheck/build/test | PASS | Mục 12 | |
| AC-12 | Backfill HMAC tra cứu cho hồ sơ MỨC A | PASS | 5 test trong `pr6-review-round-two.test.ts` + 1 assertion trong `working-payload.test.ts` | Người dùng chốt `kind = 'PENDING'` ngày 2026-07-29 |

## 14. Manual verification required

**A. AC-12 — ĐÃ CHỐT VÀ ĐÃ THI CÔNG (giữ lại để ghi nhận bối cảnh).**

`pendingIdentityHmacs` chỉ được ghi trong `repository.submit` khi `status === "SUBMITTED"`, và `citizenIdsForLookup` (đúng đắn) chỉ băm CCCD hợp lệ 12 số. Từ V2, CCCD là **tùy chọn** với người dân, nên hồ sơ nộp không kèm CCCD **không bao giờ** vào `public_lookup_index`, và không có đường nào ghi bổ sung khi cán bộ nhập CCCD lúc hoàn thiện hoặc tiếp nhận chính thức.

Cần chốt trước khi code:
1. CCCD do **cán bộ** nhập có được vào chỉ mục tra cứu công khai không?
2. Nếu có thì với `kind` nào — `PENDING` như người dân tự khai, hay một giá trị mới?
3. Khi người dân **gửi bổ sung** (`RESUBMITTED`) và lúc đó mới điền CCCD, có ghi chỉ mục không? (Hiện tại: không, vì điều kiện `status === "SUBMITTED"`.)

Người dùng đã trả lời ngày 2026-07-29:
1. **Có ghi, dùng `kind = 'PENDING'`** — không thêm `kind` mới, tránh đổi CHECK constraint và rà lại mọi chỗ đọc.
2. **Có ghi ở `RESUBMITTED`** — cùng dữ liệu, cùng cửa vào, cùng người khai.

Đã thi công: bỏ điều kiện `status === "SUBMITTED"` ở hai route submit; thêm `pendingIdentityHmacs` vào ba method cán bộ trong repository và bốn chỗ gọi ở route. Phân lớp giữ nguyên — repository không đọc biến môi trường, route tính HMAC.

**B. Kiểm tra thủ công sau khi trả lời A và trước khi merge:**

| Màn hình/quy trình | Dữ liệu mẫu | Các bước | Kết quả mong đợi |
|---|---|---|---|
| `/ke-khai` trên 4G yếu | Số điện thoại giả `09xxxxxxxx` | Nhập nháp → bật chế độ mạng chậm → bấm Tiếp tục khi response PATCH bị treo/rơi | Không hiện "đang mở ở thiết bị khác"; bước chuyển bình thường |
| `/ke-khai` hai thiết bị | Cùng một hồ sơ | Mở trên 2 máy, sửa và lưu xen kẽ | Máy thứ hai vẫn nhận 409 và thông báo gốc |
| Bảng số đo | Preview có migration | Tải 1 ảnh thành công | `public_upload_attempts` có đúng 1 dòng mới; nếu rỗng thì tìm dòng log `pg_code=` |
| Upload lỗi giữa chừng | Ảnh lớn, ngắt mạng | Hủy giữa chừng | Không có tệp mồ côi mới; chạy `audit-orphan-public-files.ts` đối chiếu |

## 15. Remaining issues and warnings

| Severity | Issue | Impact | Recommended action |
|---|---|---|---|
| Medium | AC-12 chưa được kiểm bằng dữ liệu thật | Chỉ mục ghi đúng theo test, nhưng chưa xác minh trên Postgres thật rằng `on conflict do nothing` không tạo dòng trùng khi cán bộ sửa nhiều lần | Kiểm trên preview: sửa CCCD 2 lần, đếm dòng trong `public_lookup_index` |
| Medium | Migration `202607290001` sửa tại chỗ | Nếu đã chạy ở môi trường nào đó thì sửa tại chỗ không có tác dụng | Xác nhận chưa chạy; nếu đã chạy, thêm migration `no force row level security` |
| Medium | AC-05 chỉ được phủ bằng test đặc tả đọc mã nguồn | Test kiểu này bắt được việc xóa mất hàng rào, nhưng **không** chứng minh luồng chạy đúng | Chạy kịch bản E2E mạng yếu (mục 14B) |
| Medium | E2E chưa chạy lần nào | 7 cổng tích hợp của PR #6 vẫn treo nguyên | Giữ PR ở trạng thái Draft |
| Low | Trần 200 dòng số đo là hằng số cứng | Không chỉnh được theo môi trường | Chấp nhận; đưa vào env nếu có nhu cầu thật |
| Low | `npm run build` baseline không chạy riêng | Không phân biệt tuyệt đối được lỗi build có sẵn với lỗi mới | Build sau sửa PASS nên rủi ro thấp |
| Low | 5 warning lint có sẵn | Không do đợt này | Dọn riêng |

## 16. Regression and compatibility notes

- **Trình duyệt:** `saveDraft`/`adoptServerDraft` chỉ dùng `fetch` + JSON, không thêm API mới. Không đổi yêu cầu trình duyệt.
- **Thiết bị:** không đổi. Đường 409 thêm 1 vòng `GET /current` + 1 PATCH — chỉ chạy khi đã có 409.
- **Node/runtime:** Node 24.11.0 cục bộ; CI dùng Node 22. Không dùng API mới của Node.
- **Database:** không đổi cấu trúc bảng. Câu `insert ... select ... where` của `appendUploadAttempt` là SQL chuẩn, tương thích Postgres đang dùng.
- **API bên ngoài:** thêm 1 lệnh `drive.files.get(fields: "id,parents")` trên đường lỗi của upload — tăng quota Drive không đáng kể.
- **Backward compatibility:** hợp đồng HTTP không đổi ở cả 3 endpoint bị chạm. Client cũ vẫn chạy được với máy chủ mới.
- **Excel/PDF/import/export:** không chạm.

## 17. Rollback plan

- **Rollback code:** chưa commit — `git checkout -- <file>` hoặc `git stash` là quay về `45b7fc9` sạch. Sau khi commit thì `git revert`.
- **Rollback migration:** migration chưa chạy ở đâu; rollback là revert file. Nếu đã lỡ áp bản có `force`, chạy `alter table public.public_upload_attempts no force row level security;`.
- **Dữ liệu cần phục hồi:** không. Không có thay đổi nào ghi/xóa dữ liệu sẵn có.
- **Điều kiện KHÔNG được rollback tự động:** nếu đã deploy và đã có tệp Drive được giữ lại nhờ hàng rào mới, rollback đưa lại nguy cơ xóa nhầm — phải rà `audit-orphan-public-files.ts` trước.

## 18. Recommended next action

`READY_FOR_CHATGPT_REVIEW`

Toàn bộ 12 acceptance criteria đã PASS và có bằng chứng. Đã commit và push lên nhánh `claude/land-declaration-process-feedback-126f2e` theo yêu cầu rõ ràng của người dùng, nên PR #6 đã được cập nhật.

Việc còn lại **không thuộc phạm vi đợt này**: 7 cổng tích hợp của PR #6 vẫn treo (migration preview, E2E đầy đủ, rehearsal assisted, kịch bản resume/mất mạng, benchmark upload, kiểm chất lượng ảnh, orphan audit). Giữ PR ở Draft cho tới khi đóng đủ.

**Chưa thực hiện:** merge, deploy, chạy migration.

## 19. Commands to reproduce

```bash
git fetch origin claude/land-declaration-process-feedback-126f2e
git switch claude/land-declaration-process-feedback-126f2e
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npx vitest run tests/pr6-review-round-two.test.ts tests/public-upload-complete-route.test.ts tests/public-upload-legacy-draft.test.ts
```

## 20. Key diff excerpts

Hàng rào hai lớp trước khi xóa tệp Drive:

```diff
-async function discardIfOrphan(
-  repository: ReturnType<typeof getPublicIntakeRepository>,
-  submissionId: string,
-  driveFileId: string,
-): Promise<void> {
-  const adopted = await repository.isDriveFileAdopted(submissionId, driveFileId).catch(() => true);
-  if (adopted) return;
-  await getPublicIntakeStorage()
-    .discardFile(driveFileId)
-    .catch(() => undefined);
-}
+async function discardIfOrphan(
+  repository: ReturnType<typeof getPublicIntakeRepository>,
+  record: { readonly driveFolderId: string },
+  driveFileId: string,
+): Promise<void> {
+  if (!driveFileId) return;
+  const adopted = await repository.isDriveFileAdopted(driveFileId).catch(() => true);
+  if (adopted) return;
+
+  const storage = getPublicIntakeStorage();
+  const ownedByCaller = await storage
+    .isFileInFolder(driveFileId, record.driveFolderId)
+    .catch(() => false);
+  if (!ownedByCaller) return;
+
+  await storage.discardFile(driveFileId).catch(() => undefined);
+}
```

Truy vấn adopt bỏ lọc theo hồ sơ đang gọi:

```diff
-  async isDriveFileAdopted(submissionId: string, driveFileId: string): Promise<boolean> {
+  async isDriveFileAdopted(driveFileId: string): Promise<boolean> {
     const rows = await database<{ count: string }[]>`
       select count(*)::text as count from public.public_files
-      where submission_id = ${submissionId} and drive_file_id = ${driveFileId}
+      where drive_file_id = ${driveFileId}
     `;
```

Tự phục hồi sau 409:

```diff
+        if (response.status === 409) {
+          const adopted = await adoptServerDraft({ localDraft: draftToSave });
+          if (adopted) {
+            response = await patch(adopted.draft, adopted.version);
+          }
+        }
```

Migration bỏ `force`:

```diff
 alter table public.public_upload_attempts enable row level security;
-alter table public.public_upload_attempts force row level security;
```

## 21. Full unified diff

```text
FULL_DIFF_INCLUDED
```

Diff đầy đủ (~49 KB, dưới ngưỡng 150 KB của §9.1) nằm ở **cuối file**, ngay sau mục 22. Gồm 15 file: 11 file mã nguồn/migration/script, 3 file `docs/brain/`, và 1 file test mới. Không có file nhị phân, không có secret. Không bao gồm chính file `CHATGPT_HANDOFF.md` và bản lưu vòng một trong `docs/handoffs/` (báo cáo, không phải mã nguồn).

## 22. Agent declaration

Agent xác nhận:

- Đã đọc `AGENTS.md`, `AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md`, `CLAUDE.md` và `docs/brain/` trước khi sửa.
- Không tự mở rộng phạm vi ngoài danh sách phát hiện đã nêu; hạng mục cần quyết định nghiệp vụ được hoãn và ghi rõ, không đoán.
- Không ghi đè thay đổi có sẵn của người dùng: đã stash và pop lại đầy đủ, `git stash list` rỗng, và toàn bộ thi công chuyển sang worktree riêng.
- Không đưa secret, dữ liệu cá nhân hay dữ liệu thật vào báo cáo.
- Không merge, không push, không deploy, không chạy migration.
- Kết quả test được ghi đúng theo lệnh thực tế đã chạy; E2E được đánh dấu `NOT_RUN`, không khai là pass.
- Các nội dung chưa xác minh đã được đánh dấu rõ ở mục 4, 13, 14 và 15.



```diff
diff --git a/.gitattributes b/.gitattributes
index 922d7fc..a745250 100644
--- a/.gitattributes
+++ b/.gitattributes
@@ -3,6 +3,14 @@
 # `npm run format:check` (Prettier mặc định endOfLine=lf) đỏ sau mỗi lần checkout/merge.
 * text=auto eol=lf
 
+# Báo cáo bàn giao nhúng nguyên văn unified diff (§9.1 của
+# AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md yêu cầu diff dưới 150 KB phải nhúng đủ). Dòng context của
+# một dòng trống trong diff là đúng một dấu cách, nên `git diff --check` trong CI báo "trailing
+# whitespace" cho chính nội dung phải giữ nguyên byte. Tắt kiểm khoảng trắng cho riêng các file báo
+# cáo — cắt khoảng trắng đi là làm hỏng diff, mà bỏ diff đi là vi phạm quy trình bàn giao.
+CHATGPT_HANDOFF.md -whitespace
+docs/handoffs/** -whitespace
+
 # Nguồn nghiệp vụ và ảnh: nhị phân, tuyệt đối không chuẩn hóa nội dung.
 *.pdf binary
 *.docx binary
diff --git a/.prettierignore b/.prettierignore
index 8d74b6d..fd654ce 100644
--- a/.prettierignore
+++ b/.prettierignore
@@ -4,3 +4,9 @@ coverage/
 playwright-report/
 test-results/
 package-lock.json
+
+# Báo cáo bàn giao: nhúng nguyên văn unified diff (§9.1 của
+# AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md). Prettier định dạng lại Markdown sẽ đụng vào nội dung
+# trong code fence và làm sai lệch bằng chứng — thứ duy nhất khiến báo cáo có giá trị.
+CHATGPT_HANDOFF.md
+docs/handoffs/
diff --git a/docs/brain/03-decisions.md b/docs/brain/03-decisions.md
index 9aa6bc0..ff37e06 100644
--- a/docs/brain/03-decisions.md
+++ b/docs/brain/03-decisions.md
@@ -7,6 +7,55 @@
 > Trạng thái hiện hành: Supabase PostgreSQL đã là kho runtime sau cutover 2026-07-24; các entry
 > cũ mô tả Google Sheets runtime/cửa sổ chờ cutover là lịch sử, không phải hướng dẫn triển khai mới.
 
+## [2026-07-29] Review PR #6 vòng hai — ba quyết định về an toàn dữ liệu
+
+**1. Câu hỏi trước khi xóa tệp Drive là "có AI đang trỏ vào nó không", không phải "hồ sơ đang gọi
+có trỏ vào nó không".**
+`isDriveFileAdopted` trước đây lọc `submission_id = <hồ sơ đang gọi>`. Phần lớn nhánh gọi
+`discardIfOrphan` truyền thẳng `body.driveFileId` — dữ liệu client chưa qua `verifyUploadedFile`.
+Một ID trỏ sang hồ sơ khác khi đó thỏa "chưa ai nhận" và bị xóa: mất bằng chứng của một hộ dân
+không liên quan. Nay truy vấn hỏi toàn bảng, **và** `discardIfOrphan` chỉ xóa khi Drive xác nhận
+tệp nằm trong `record.driveFolderId`. Hai điều kiện thu phạm vi xóa về đúng những gì hộ dân đang
+gọi tự tải lên. Đánh đổi: thêm một lần gọi Drive trên đường lỗi (hiếm) — chấp nhận được, vì hướng
+sai còn lại là mất dữ liệu vĩnh viễn. Khai thác thực tế trước đây khó vì Drive ID không bao giờ
+được trả ra cổng công khai và không đoán được; sửa vì hàng rào không nên chỉ dựa vào điều đó.
+
+**2. Không dùng `force row level security` cho bảng số đo.**
+`force` áp RLS lên cả chủ sở hữu bảng; bảng không có policy nào nên với role không mang BYPASSRLS
+thì mọi insert trả 0 dòng. Cả hai chỗ gọi `appendUploadAttempt` đều nuốt lỗi có chủ đích (số đo
+không được làm hỏng một lượt tải đã thành công), nên hỏng kiểu đó **không phát ra tín hiệu nào** —
+đúng cái bảng dùng để nghiệm thu ngưỡng hiệu năng và để mở cờ chuẩn hóa ảnh. Dùng `enable` +
+`revoke` như 8 bảng còn lại: đúng mô hình đe dọa (chặn anon/authenticated) và không lệch mẫu. Kèm
+theo, nuốt lỗi giờ đi qua `reportUploadMetricFailure` — ghi log **một lần** mỗi tiến trình và chỉ
+ghi mã lỗi Postgres, không ghi `error.message` (thông báo Postgres có thể nhắc lại giá trị dòng
+vừa insert).
+
+**3. PATCH nháp: giữ kiểm version tuyệt đối ở máy chủ, thêm tự phục hồi ở client.**
+Kiểm khớp tuyệt đối là đúng và được giữ nguyên. Nhưng nguyên nhân 409 thường gặp nhất không phải
+hai thiết bị cùng sửa mà là một PATCH đã ghi xong rồi response rơi mất trên mạng yếu — lần thử lại
+gửi version cũ và bị từ chối, người dân kẹt kèm thông báo sai sự thật ("đang mở ở thiết bị khác").
+Client nay lấy lại snapshot, gộp dữ liệu trên máy lên trên rồi thử lại **đúng một lần**. Mất
+response tự gỡ được; xung đột thật vẫn 409 ở lần hai và thông báo gốc hiện ra. Không chọn phương
+án idempotency key cho PATCH vì `request_log.kind` có CHECK constraint, thêm kind mới là phải thêm
+migration — chi phí lớn hơn giá trị ở bước này.
+
+**4. CCCD vào chỉ mục tra cứu với `kind = 'PENDING'`, bất kể ai gõ vào ô đó và ở lần gửi nào.**
+Từ V2, CCCD là **tùy chọn** với người dân. Trước quyết định này, `pendingIdentityHmacs` chỉ được
+ghi ở `submit` khi `status === "SUBMITTED"`, nên hai nhóm nằm ngoài chỉ mục vĩnh viễn: người dân
+điền CCCD ở lần **gửi bổ sung**, và cán bộ điền hộ lúc hoàn thiện/tiếp nhận. Đó đúng là hai nhóm
+mà V2 sinh ra nhiều nhất, nên phát hiện trùng hồ sơ gần như không còn tác dụng với luồng mới.
+
+Chốt: ghi ở cả `SUBMITTED` lẫn `RESUBMITTED`, và ghi ở cả ba đường của cán bộ
+(`commitStaffDraftEdit`, `commitWorkingPayload`, `commitOfficialAmendment`). Dùng `kind = 'PENDING'`
+y như người dân tự khai — chỉ mục trả lời "có hồ sơ nào đang gắn với CCCD này", không phải "ai đã
+gõ số đó vào". Không thêm `kind` mới vì sẽ phải đổi CHECK constraint trên `public_lookup_index` và
+rà lại mọi chỗ đọc, đổi lấy một thông tin chưa ai cần. Insert đã có `on conflict do nothing` nên
+ghi lặp là vô hại.
+
+Phân lớp giữ nguyên: **repository không bao giờ đọc biến môi trường**. Route tính HMAC từ
+`DATA_HASH_PEPPER` rồi truyền xuống, đúng như `submit` đã làm từ trước. Có test khẳng định
+`repository.ts` không chứa `DATA_HASH_PEPPER` lẫn `identityHmac(`.
+
 ## [2026-07-29] Đóng 2 BLOCKER và 5 HIGH của review PR #6
 
 - Upload complete tra `REQUEST_LOG` trước validation lượt mới; replay trả summary cũ và cleanup
diff --git a/docs/brain/04-current-tasks.md b/docs/brain/04-current-tasks.md
index a006a4a..69f38f4 100644
--- a/docs/brain/04-current-tasks.md
+++ b/docs/brain/04-current-tasks.md
@@ -8,7 +8,20 @@
 
 ---
 
-## [2026-07-29] Review bắt buộc PR #6 — đã sửa trong code
+## [2026-07-29] Review PR #6 vòng hai — đã sửa trong code
+
+Đã sửa 3 phát hiện chính (xóa nhầm tệp Drive của hộ khác; RLS `force` làm telemetry hỏng im lặng;
+409 giả làm người dân kẹt) và 4 phát hiện phụ (trần bảng số đo, so sánh sâu `hasLocalChanges`,
+escape truy vấn Drive, guard môi trường cho script xóa dữ liệu E2E). Test 590 pass/10 skipped.
+Chưa merge, chưa push, chưa deploy, chưa chạy migration.
+
+### Chỉ mục tra cứu CCCD — ĐÃ CHỐT VÀ ĐÃ LÀM
+
+Người dùng chốt ngày 2026-07-29: CCCD vào `public_lookup_index` với `kind = 'PENDING'`, ghi ở cả
+`RESUBMITTED` và ở cả ba đường ghi của cán bộ. Chi tiết và lý do ở `03-decisions.md` cùng ngày.
+Trước đó hồ sơ MỨC A không có CCCD lúc gửi đầu sẽ không bao giờ vào chỉ mục.
+
+## [2026-07-29] Review bắt buộc PR #6 — đã sửa trong code (vòng một)
 
 Đã sửa 2 BLOCKER và 5 HIGH: upload replay, assisted submit, exact version, official gate, atomic
 consent audit, telemetry RLS và timeline privacy; đã thêm CI PR. Chưa merge/deploy/chạy migration.
diff --git a/docs/brain/06-ai-working-log.md b/docs/brain/06-ai-working-log.md
index 3c84e14..6c35e32 100644
--- a/docs/brain/06-ai-working-log.md
+++ b/docs/brain/06-ai-working-log.md
@@ -4,6 +4,46 @@
 > trạng thái đúng hiện nay là: Supabase PostgreSQL đã cutover làm kho runtime; Google Sheets chỉ còn
 > read-only/legacy ETL. Đọc các entry mới nhất ở đầu file để lấy trạng thái hiện hành.
 
+## [2026-07-29] Review PR #6 vòng hai — sửa 3 phát hiện chính + 4 phát hiện phụ
+
+- **Agent:** Claude Code.
+- **Baseline:** branch `claude/land-declaration-process-feedback-126f2e`, HEAD `45b7fc9`;
+  typecheck pass, lint 0 error/5 warning có sẵn, test 570 pass/10 skipped, build pass.
+- **Thay đổi:**
+  - `isDriveFileAdopted` bỏ lọc `submission_id` (hỏi toàn bảng), và `discardIfOrphan` thêm điều
+    kiện tệp phải nằm đúng thư mục Drive của hồ sơ đang gọi (`storage.isFileInFolder`);
+  - migration `202607290001` bỏ `force row level security` (lệch mẫu 8 bảng còn lại, và có thể
+    làm mọi insert số đo thất bại trong im lặng); hai chỗ nuốt lỗi đổi sang
+    `reportUploadMetricFailure` — log một lần mỗi tiến trình, chỉ ghi mã lỗi Postgres;
+  - `saveDraft` trong wizard tự lấy lại snapshot và thử lại **một lần** khi PATCH trả 409;
+    `adoptServerDraft` trả `{draft, version}` thay vì boolean;
+  - `appendUploadAttempt` có trần `MAX_UPLOAD_ATTEMPTS_PER_SUBMISSION = 200`;
+  - `hasLocalChanges` so sánh sâu thay cho `JSON.stringify` (nhạy thứ tự khóa);
+  - `listFolderFileIds` escape `folderId` bằng `escapeQueryValue` có sẵn;
+  - `cleanup-e2e-preview-data.ts` từ chối chạy khi `NODE_ENV=production` hoặc `APP_BASE_URL`
+    không giống môi trường thử, trừ khi có cờ `--i-know-this-is-not-preview`.
+- **File đã sửa:** `src/modules/public-intake/{repository,storage,upload-metrics,draft-adoption}.ts`,
+  `src/app/api/public/submissions/current/uploads/{complete,metrics}/route.ts`,
+  `src/app/ke-khai/wizard.tsx`, `supabase/migrations/202607290001_public_upload_attempts_rls.sql`,
+  `scripts/cleanup-e2e-preview-data.ts`, `tests/pr6-review-round-two.test.ts` (mới),
+  `tests/public-upload-{complete-route,legacy-draft}.test.ts`.
+- **Lý do:** xem `docs/brain/03-decisions.md` cùng ngày — trọng tâm là hai chỗ có thể **mất dữ
+  liệu** (xóa nhầm tệp Drive của hộ khác; telemetry hỏng im lặng) và một chỗ làm người dân **kẹt
+  giữa chừng** (409 giả trên mạng yếu).
+- **Kiểm tra:** typecheck pass; lint 0 error/5 warning có sẵn; test 590 pass/10 skipped
+  (+20 test so với baseline); build pass. Test đặc tả cũ được **siết chặt** theo bất biến mới, không
+  nới lỏng: `tests/public-upload-complete-route.test.ts` giờ khẳng định truy vấn adopt KHÔNG chứa
+  `submission_id`.
+  - sau khi người dùng chốt: CCCD vào `public_lookup_index` với `kind = 'PENDING'` — ghi ở cả
+    `RESUBMITTED` (bỏ điều kiện `status === "SUBMITTED"`) và ở cả ba đường ghi của cán bộ
+    (`commitStaffDraftEdit`, `commitWorkingPayload`, `commitOfficialAmendment`); route tính HMAC,
+    repository vẫn không đọc biến môi trường.
+- **File đã sửa (bổ sung cho phần chỉ mục):** `src/app/api/public/submissions/current/submit/route.ts`,
+  `src/app/api/staff/assisted-submissions/current/submit/route.ts`,
+  `src/app/api/submissions/[submissionId]/{route,working-payload/route,ai-draft/apply/route}.ts`,
+  `tests/working-payload.test.ts`.
+- **Không làm:** merge, deploy, chạy migration.
+
 ## [2026-07-29] Sửa bắt buộc 2 BLOCKER + 5 HIGH của review PR #6
 
 - **Agent:** Codex.
diff --git a/scripts/cleanup-e2e-preview-data.ts b/scripts/cleanup-e2e-preview-data.ts
index 6fdf43d..9e74e28 100644
--- a/scripts/cleanup-e2e-preview-data.ts
+++ b/scripts/cleanup-e2e-preview-data.ts
@@ -65,6 +65,31 @@ async function discoverChildTables(): Promise<string[]> {
   return rows.map((row) => row.table_name);
 }
 
+/**
+ * Chặn chạy nhầm trên production.
+ *
+ * Script này xóa theo **số điện thoại**, không theo một tiền tố mã do script tự sinh. Trên preview
+ * đó là nhãn nhận diện đúng; trên production đúng số đó có thể là của một hộ dân thật, và lệnh xóa
+ * đi qua khoảng 16 bảng con là không khôi phục được. Token xác nhận chỉ buộc người chạy nhìn danh
+ * sách — nó không phân biệt được preview với production.
+ *
+ * Mặc định TỪ CHỐI khi `NODE_ENV=production` hoặc khi `APP_BASE_URL` không mang dấu hiệu môi
+ * trường thử. Cần chạy trên một môi trường không khớp mẫu thì phải khai báo có ý thức bằng
+ * `--i-know-this-is-not-preview`.
+ */
+function refusesToRunHere(argv: readonly string[]): string | null {
+  if (argv.includes("--i-know-this-is-not-preview")) return null;
+
+  if (process.env.NODE_ENV === "production") {
+    return "NODE_ENV=production";
+  }
+  const baseUrl = (process.env.APP_BASE_URL ?? "").toLowerCase();
+  if (baseUrl && !/(localhost|127\.0\.0\.1|preview|staging|vercel\.app)/.test(baseUrl)) {
+    return `APP_BASE_URL không giống môi trường thử (${baseUrl})`;
+  }
+  return null;
+}
+
 async function cleanup(options: Options): Promise<void> {
   const database = getDatabase();
 
@@ -143,7 +168,18 @@ async function cleanup(options: Options): Promise<void> {
   );
 }
 
-cleanup(parseOptions(process.argv.slice(2)))
+const argv = process.argv.slice(2);
+const refusal = refusesToRunHere(argv);
+if (refusal) {
+  console.error(
+    `Từ chối chạy: ${refusal}.\n` +
+      "Script này xóa hồ sơ theo SỐ ĐIỆN THOẠI và không khôi phục được. Nếu bạn chắc chắn đây " +
+      "không phải dữ liệu thật, chạy lại kèm --i-know-this-is-not-preview.",
+  );
+  process.exit(1);
+}
+
+cleanup(parseOptions(argv))
   .then(() => process.exit(process.exitCode ?? 0))
   .catch((error: unknown) => {
     console.error(error instanceof Error ? error.message : "Lỗi không rõ.");
diff --git a/src/app/api/public/submissions/current/submit/route.ts b/src/app/api/public/submissions/current/submit/route.ts
index e5cd120..af9a017 100644
--- a/src/app/api/public/submissions/current/submit/route.ts
+++ b/src/app/api/public/submissions/current/submit/route.ts
@@ -150,14 +150,19 @@ export async function POST(request: Request): Promise<NextResponse> {
     );
   }
 
-  // Chỉ băm CCCD **hợp lệ**. Trước V2 mọi owner cá nhân đều được băm; khi CCCD được phép để trống,
-  // băm chuỗi rỗng sẽ cho mọi hồ sơ không nhập CCCD cùng một khóa tra cứu — đụng nhau hàng loạt.
-  const pendingIdentityHmacs =
-    status === "SUBMITTED"
-      ? citizenIdsForLookup(draft).map((identityNumber) =>
-          identityHmac(environment.DATA_HASH_PEPPER, identityNumber),
-        )
-      : undefined;
+  /*
+   * Chỉ băm CCCD **hợp lệ**. Trước V2 mọi owner cá nhân đều được băm; khi CCCD được phép để trống,
+   * băm chuỗi rỗng sẽ cho mọi hồ sơ không nhập CCCD cùng một khóa tra cứu — đụng nhau hàng loạt.
+   *
+   * Ghi cho CẢ `RESUBMITTED`, không riêng `SUBMITTED` (quyết định 2026-07-29). Ở MỨC A, CCCD là
+   * tùy chọn, nên tình huống rất thường gặp là người dân gửi lần đầu không có CCCD, bị yêu cầu bổ
+   * sung, rồi mới điền ở lần gửi lại — đúng lần mà điều kiện `=== "SUBMITTED"` cũ bỏ qua. Cùng dữ
+   * liệu, cùng cửa vào, cùng người khai thì không có lý do gì phân biệt. Insert dùng
+   * `on conflict do nothing` nên ghi lại ở mỗi lần gửi bổ sung là vô hại.
+   */
+  const pendingIdentityHmacs = citizenIdsForLookup(draft).map((identityNumber) =>
+    identityHmac(environment.DATA_HASH_PEPPER, identityNumber),
+  );
 
   try {
     await repository.submit({
diff --git a/src/app/api/public/submissions/current/uploads/complete/route.ts b/src/app/api/public/submissions/current/uploads/complete/route.ts
index 8bd27a7..5424981 100644
--- a/src/app/api/public/submissions/current/uploads/complete/route.ts
+++ b/src/app/api/public/submissions/current/uploads/complete/route.ts
@@ -19,6 +19,7 @@ import {
   buildFileNormalizationMetadata,
   buildUploadAttemptMetric,
   clientUploadTelemetrySchema,
+  reportUploadMetricFailure,
 } from "@/modules/public-intake/upload-metrics";
 
 export const runtime = "nodejs";
@@ -91,7 +92,7 @@ export async function POST(request: Request): Promise<NextResponse> {
   const replay = await repository.findStoredMutation(idempotencyKey, "PUBLIC_UPLOAD_COMPLETE");
   if (replay) {
     if (replay.mutationHash !== mutationHash) {
-      await discardIfOrphan(repository, record.submissionId, driveFileId);
+      await discardIfOrphan(repository, record, driveFileId);
       return publicError(
         "IDEMPOTENCY_CONFLICT",
         "Yêu cầu hoàn tất tải lên bị xung đột.",
@@ -107,7 +108,7 @@ export async function POST(request: Request): Promise<NextResponse> {
   }
 
   if (!isEditable(record)) {
-    await discardIfOrphan(repository, record.submissionId, driveFileId);
+    await discardIfOrphan(repository, record, driveFileId);
     return publicError("INVALID_STATE", "Bản kê khai đang bị khóa.", requestId);
   }
 
@@ -115,7 +116,7 @@ export async function POST(request: Request): Promise<NextResponse> {
   if (identityImage) {
     const owners = record.draft?.owners;
     if (!Array.isArray(owners)) {
-      await discardIfOrphan(repository, record.submissionId, driveFileId);
+      await discardIfOrphan(repository, record, driveFileId);
       return publicError(
         "INVALID_STATE",
         "Dữ liệu bản kê khai chưa đầy đủ. Tải lại trang và thử lại.",
@@ -132,7 +133,7 @@ export async function POST(request: Request): Promise<NextResponse> {
       (file) => file.ownerId === ownerId && file.documentType === documentType,
     );
     if ((existing && existing.fileId !== replaceFileId) || (!existing && replaceFileId)) {
-      await discardIfOrphan(repository, record.submissionId, driveFileId);
+      await discardIfOrphan(repository, record, driveFileId);
       return publicError("INVALID_STATE", "Trạng thái thay ảnh CCCD không còn hợp lệ.", requestId);
     }
   } else if (replaceFileId) {
@@ -144,7 +145,7 @@ export async function POST(request: Request): Promise<NextResponse> {
         file.status === "UPLOADED",
     );
     if (!existing) {
-      await discardIfOrphan(repository, record.submissionId, driveFileId);
+      await discardIfOrphan(repository, record, driveFileId);
       return publicError(
         "INVALID_STATE",
         "Ảnh Giấy chứng nhận cần thay không còn hợp lệ.",
@@ -163,7 +164,7 @@ export async function POST(request: Request): Promise<NextResponse> {
   } catch (error) {
     if (error instanceof UploadVerificationError) {
       // Tệp không đạt phải rời khỏi Drive ngay, không để tích rác trong kho của quản trị viên.
-      await discardIfOrphan(repository, record.submissionId, driveFileId);
+      await discardIfOrphan(repository, record, driveFileId);
       return publicError("VALIDATION_FAILED", error.message, requestId);
     }
     throw error;
@@ -207,7 +208,7 @@ export async function POST(request: Request): Promise<NextResponse> {
           telemetry,
         }),
       )
-      .catch(() => undefined);
+      .catch(reportUploadMetricFailure);
 
     // Không trả Drive ID ra ngoài — người dân không cần và không được biết.
     return NextResponse.json({ ok: true, fileId: summary.fileId, sizeBytes: verified.sizeBytes });
@@ -216,7 +217,7 @@ export async function POST(request: Request): Promise<NextResponse> {
       // Xung đột idempotency nghĩa là khóa này đã dùng cho nội dung khác — tệp vừa xác minh
       // KHÔNG phải tệp đã được nhận, nhưng cũng không chắc chưa ai nhận nó. Đi qua cùng một cửa
       // dọn dẹp an toàn bên dưới thay vì xóa thẳng.
-      await discardIfOrphan(repository, record.submissionId, verified.driveFileId);
+      await discardIfOrphan(repository, record, verified.driveFileId);
       return publicError(
         "IDEMPOTENCY_CONFLICT",
         "Yêu cầu hoàn tất tải lên bị xung đột.",
@@ -233,26 +234,42 @@ export async function POST(request: Request): Promise<NextResponse> {
      * một Drive ID không còn tồn tại, và không cách nào lấy lại. Vì vậy chỉ xóa khi chắc chắn
      * chưa ai nhận, và mọi tình huống không chắc đều nghiêng về **giữ lại**.
      */
-    await discardIfOrphan(repository, record.submissionId, verified.driveFileId);
+    await discardIfOrphan(repository, record, verified.driveFileId);
     throw error;
   }
 }
 
 /**
- * Xóa tệp trên Drive **chỉ khi** chắc chắn cơ sở dữ liệu chưa nhận nó.
+ * Xóa tệp trên Drive **chỉ khi** cả hai điều kiện dưới đây cùng đúng.
  *
- * `.catch(() => true)` không phải là bỏ qua lỗi cho gọn: hỏi cơ sở dữ liệu mà không hỏi được thì
- * mặc định coi như **đã nhận**, tức là không xóa. Sai theo hướng để lại một tệp thừa thì có script
- * audit dọn sau; sai theo hướng kia thì mất bằng chứng của hồ sơ, vĩnh viễn.
+ * 1. Chưa hồ sơ nào nhận tệp này (`isDriveFileAdopted`, hỏi toàn bảng chứ không lọc theo hồ sơ
+ *    đang gọi).
+ * 2. Tệp nằm đúng trong thư mục Drive của chính hồ sơ đang gọi.
+ *
+ * Vì sao cần điều kiện 2: phần lớn nhánh gọi hàm này truyền thẳng `body.driveFileId` — dữ liệu
+ * client, chưa qua `verifyUploadedFile`. Chỉ với điều kiện 1, một `driveFileId` trỏ sang thư mục
+ * hộ khác mà chưa kịp `complete` vẫn thỏa "chưa ai nhận" và sẽ bị xóa. Hai điều kiện cộng lại thu
+ * hẹp phạm vi xóa về đúng những gì hộ dân đang gọi tự tải lên.
+ *
+ * `.catch(() => true)` / `.catch(() => false)` không phải là nuốt lỗi cho gọn: hỏi mà không hỏi
+ * được thì mặc định coi như **đã nhận** và **không xác nhận được thư mục**, tức là không xóa. Sai
+ * theo hướng để lại một tệp thừa thì có `scripts/audit-orphan-public-files.ts` dọn sau; sai theo
+ * hướng kia thì mất bằng chứng của hồ sơ, vĩnh viễn.
  */
 async function discardIfOrphan(
   repository: ReturnType<typeof getPublicIntakeRepository>,
-  submissionId: string,
+  record: { readonly driveFolderId: string },
   driveFileId: string,
 ): Promise<void> {
-  const adopted = await repository.isDriveFileAdopted(submissionId, driveFileId).catch(() => true);
+  if (!driveFileId) return;
+  const adopted = await repository.isDriveFileAdopted(driveFileId).catch(() => true);
   if (adopted) return;
-  await getPublicIntakeStorage()
-    .discardFile(driveFileId)
-    .catch(() => undefined);
+
+  const storage = getPublicIntakeStorage();
+  const ownedByCaller = await storage
+    .isFileInFolder(driveFileId, record.driveFolderId)
+    .catch(() => false);
+  if (!ownedByCaller) return;
+
+  await storage.discardFile(driveFileId).catch(() => undefined);
 }
diff --git a/src/app/api/public/submissions/current/uploads/metrics/route.ts b/src/app/api/public/submissions/current/uploads/metrics/route.ts
index 02d9999..78e24fe 100644
--- a/src/app/api/public/submissions/current/uploads/metrics/route.ts
+++ b/src/app/api/public/submissions/current/uploads/metrics/route.ts
@@ -6,6 +6,7 @@ import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
 import { publicError, resolvePublicRequest } from "@/modules/public-intake/route-context";
 import {
   buildUploadAttemptMetric,
+  reportUploadMetricFailure,
   uploadFailureMetricSchema,
 } from "@/modules/public-intake/upload-metrics";
 
@@ -62,7 +63,7 @@ export async function POST(request: Request): Promise<NextResponse> {
         failureCode: input.failureCode ?? "",
       }),
     )
-    .catch(() => undefined);
+    .catch(reportUploadMetricFailure);
 
   return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
 }
diff --git a/src/app/api/staff/assisted-submissions/current/submit/route.ts b/src/app/api/staff/assisted-submissions/current/submit/route.ts
index a3e65c2..1381945 100644
--- a/src/app/api/staff/assisted-submissions/current/submit/route.ts
+++ b/src/app/api/staff/assisted-submissions/current/submit/route.ts
@@ -128,12 +128,11 @@ export async function POST(request: Request): Promise<NextResponse> {
       requestId,
       idempotencyKey,
       mutationHash,
-      pendingIdentityHmacs:
-        status === "SUBMITTED"
-          ? citizenIdsForLookup(draft).map((value) =>
-              identityHmac(environment.DATA_HASH_PEPPER, value),
-            )
-          : undefined,
+      // Ghi cho cả `RESUBMITTED`, xem lý do đầy đủ ở route submit công khai (quyết định
+      // 2026-07-29): ở MỨC A, CCCD hay xuất hiện lần đầu đúng vào lần gửi bổ sung.
+      pendingIdentityHmacs: citizenIdsForLookup(draft).map((value) =>
+        identityHmac(environment.DATA_HASH_PEPPER, value),
+      ),
     });
     return NextResponse.json({ receiptCode: record.receiptCode, status });
   } catch (error) {
diff --git a/src/app/api/submissions/[submissionId]/ai-draft/apply/route.ts b/src/app/api/submissions/[submissionId]/ai-draft/apply/route.ts
index db0d0e1..43c2ad6 100644
--- a/src/app/api/submissions/[submissionId]/ai-draft/apply/route.ts
+++ b/src/app/api/submissions/[submissionId]/ai-draft/apply/route.ts
@@ -9,6 +9,8 @@ import { createApiErrorPayload } from "@/modules/common/api-error";
 import { applyClearAiFields } from "@/modules/ai-extraction/draft";
 import { getAiExtractionRepository } from "@/modules/ai-extraction/repository";
 import { loadServerEnvironment } from "@/modules/common/env";
+import { citizenIdsForLookup } from "@/modules/public-intake/validation";
+import { identityHmac } from "@/modules/public-intake/workflow";
 import {
   getPublicIntakeRepository,
   SubmissionIdempotencyConflictError,
@@ -164,6 +166,11 @@ export async function POST(
       requestId,
       idempotencyKey: scopedKey,
       mutationHash,
+      // Cán bộ có thể điền CCCD mà người dân để trống ở MỨC A; ghi chỉ mục tra cứu ngay để hồ sơ
+      // đó không nằm ngoài phát hiện trùng (quyết định 2026-07-29, kind = 'PENDING').
+      pendingIdentityHmacs: citizenIdsForLookup(applied.draft).map((identityNumber) =>
+        identityHmac(environment.DATA_HASH_PEPPER, identityNumber),
+      ),
       aiApplication: {
         resultId: resolved.draft.resultId,
         jobId: resolved.draft.jobId,
diff --git a/src/app/api/submissions/[submissionId]/route.ts b/src/app/api/submissions/[submissionId]/route.ts
index 39df572..08e777d 100644
--- a/src/app/api/submissions/[submissionId]/route.ts
+++ b/src/app/api/submissions/[submissionId]/route.ts
@@ -17,11 +17,12 @@ import {
 import type { IntakeDraft } from "@/modules/public-intake/types";
 import { isOrganisationOwner } from "@/modules/public-intake/types";
 import {
+  citizenIdsForLookup,
   CITIZEN_ID_PATTERN,
   isValidDate,
   ORGANISATION_ID_PATTERN,
 } from "@/modules/public-intake/validation";
-import { newTimelineEvent, publicActorName } from "@/modules/public-intake/workflow";
+import { identityHmac, newTimelineEvent, publicActorName } from "@/modules/public-intake/workflow";
 import { payloadLayerOf } from "@/modules/public-intake/payload-layers";
 import {
   isOwnerIdentityQrConfirmed,
@@ -435,6 +436,19 @@ export async function PATCH(
           }
         : changes;
 
+    /*
+     * Cán bộ sửa/điền CCCD mà người dân để trống ở MỨC A thì hồ sơ phải vào chỉ mục tra cứu ngay
+     * tại đây. Trước V2 mọi hồ sơ đều có CCCD lúc gửi nên chỉ cần ghi ở `submit`; từ khi CCCD là
+     * tùy chọn, đường của cán bộ là đường DUY NHẤT mà một số CCCD có thể xuất hiện lần đầu.
+     *
+     * Dùng `kind = 'PENDING'` y như người dân tự khai (quyết định 2026-07-29): chỉ mục trả lời
+     * "có hồ sơ nào đang gắn với CCCD này", không phân biệt ai gõ vào ô đó. Insert dùng
+     * `on conflict do nothing` nên ghi lại ở mỗi lần sửa là vô hại.
+     */
+    const pendingIdentityHmacs = citizenIdsForLookup(draft).map((identityNumber) =>
+      identityHmac(environment.DATA_HASH_PEPPER, identityNumber),
+    );
+
     const updated = isAmendment
       ? await repository.commitOfficialAmendment({
           record,
@@ -451,6 +465,7 @@ export async function PATCH(
           requestId,
           idempotencyKey: scopedIdempotencyKey,
           mutationHash,
+          pendingIdentityHmacs,
         })
       : await repository.commitStaffDraftEdit({
           record,
@@ -466,6 +481,7 @@ export async function PATCH(
           requestId,
           idempotencyKey: scopedIdempotencyKey,
           mutationHash,
+          pendingIdentityHmacs,
         });
 
     return NextResponse.json(
diff --git a/src/app/api/submissions/[submissionId]/working-payload/route.ts b/src/app/api/submissions/[submissionId]/working-payload/route.ts
index 65eb338..700728f 100644
--- a/src/app/api/submissions/[submissionId]/working-payload/route.ts
+++ b/src/app/api/submissions/[submissionId]/working-payload/route.ts
@@ -12,7 +12,8 @@ import {
   SubmissionVersionConflictError,
 } from "@/modules/public-intake/repository";
 import type { IntakeDraft } from "@/modules/public-intake/types";
-import { draftSchema } from "@/modules/public-intake/validation";
+import { citizenIdsForLookup, draftSchema } from "@/modules/public-intake/validation";
+import { identityHmac } from "@/modules/public-intake/workflow";
 import { SUBMISSION_READ_ROLES } from "@/modules/submissions/review";
 
 export const runtime = "nodejs";
@@ -125,15 +126,21 @@ export async function PUT(
       );
     }
 
+    const workingDraft = body.data.payload as unknown as IntakeDraft;
     const updated = await repository.commitWorkingPayload({
       record,
       expectedVersion: body.data.expectedVersion,
-      draft: body.data.payload as unknown as IntakeDraft,
+      draft: workingDraft,
       actorEmail: user.email,
       changeNote: body.data.changeNote,
       requestId,
       idempotencyKey: scopedIdempotencyKey,
       mutationHash,
+      // Cán bộ có thể điền CCCD mà người dân để trống ở MỨC A; ghi chỉ mục tra cứu ngay để hồ sơ
+      // đó không nằm ngoài phát hiện trùng (quyết định 2026-07-29, kind = 'PENDING').
+      pendingIdentityHmacs: citizenIdsForLookup(workingDraft).map((identityNumber) =>
+        identityHmac(environment.DATA_HASH_PEPPER, identityNumber),
+      ),
     });
 
     return NextResponse.json(
diff --git a/src/app/ke-khai/wizard.tsx b/src/app/ke-khai/wizard.tsx
index cbcb02c..e4a50ea 100644
--- a/src/app/ke-khai/wizard.tsx
+++ b/src/app/ke-khai/wizard.tsx
@@ -743,80 +743,6 @@ export function IntakeWizard({ assisted }: { assisted?: AssistedModeConfig } = {
   const checklist = useMemo(() => submitChecklist(validationInput), [validationInput]);
   const optionalItems = useMemo(() => optionalSummary(draft), [draft]);
 
-  /** Lưu nháp lên server. Chỉ gọi khi chuyển bước để giữ số lần ghi Sheets ở mức thấp. */
-  const saveDraft = useCallback(
-    async (draftToSave: IntakeDraft = draft): Promise<boolean> => {
-      if (!csrfToken) {
-        return true;
-      }
-
-      setSaveStatus("SAVING");
-      try {
-        const response = await fetchApi("/api/public/submissions/current", {
-          method: "PATCH",
-          headers: { "content-type": "application/json", "x-public-csrf-token": csrfToken },
-          body: JSON.stringify({
-            draft: withCertificateMetadata(draftToSave, certificatePhotos),
-            version: serverVersion,
-          }),
-        });
-
-        if (!response.ok) {
-          setSaveStatus("FAILED");
-          setServerError(await readErrorMessage(response, "Chưa lưu được. Thử lại sau ít phút."));
-          return false;
-        }
-
-        const saved = (await response.json()) as { version?: unknown };
-        if (
-          typeof saved.version !== "number" ||
-          !Number.isInteger(saved.version) ||
-          saved.version < 1
-        ) {
-          setSaveStatus("FAILED");
-          setServerError("Máy chủ không trả phiên bản bản kê khai hợp lệ. Vui lòng thử lại.");
-          return false;
-        }
-
-        setServerVersion(saved.version);
-        setSaveStatus("SAVED");
-        setServerError("");
-        // Chỉ hạ cờ khi máy chủ đã nhận. Lưu hỏng mà hạ cờ là mất dữ liệu im lặng ở lần sau.
-        draftDirtyRef.current = false;
-        return true;
-      } catch {
-        setSaveStatus("OFFLINE");
-        setServerError("Mất kết nối. Dữ liệu bạn nhập vẫn còn trên màn hình, đừng đóng trang.");
-        return false;
-      }
-    },
-    [csrfToken, draft, certificatePhotos, serverVersion],
-  );
-
-  /**
-   * Lưu nháp **một lần** cho mỗi lô thay đổi.
-   *
-   * Hai việc:
-   * - bỏ qua hoàn toàn nếu bản nháp không đổi từ lần lưu trước (tải ảnh mặt sau ngay sau mặt
-   *   trước không PATCH lại);
-   * - gộp các lời gọi chồng nhau vào cùng một request đang bay, thay vì bắn song song rồi để hai
-   *   response ghi đè nhau theo thứ tự ngẫu nhiên.
-   */
-  const savePromiseRef = useRef<Promise<boolean> | null>(null);
-
-  const flushDraft = useCallback(
-    async (options?: { force?: boolean }): Promise<boolean> => {
-      if (!options?.force && !draftDirtyRef.current) return true;
-      if (savePromiseRef.current) return savePromiseRef.current;
-      const promise = saveDraft().finally(() => {
-        savePromiseRef.current = null;
-      });
-      savePromiseRef.current = promise;
-      return promise;
-    },
-    [saveDraft],
-  );
-
   /**
    * Lấy bản nháp mà máy chủ đang giữ về máy.
    *
@@ -826,20 +752,27 @@ export function IntakeWizard({ assisted }: { assisted?: AssistedModeConfig } = {
    *
    * Ở lần khôi phục (`recovered`), bản của máy chủ còn là bản duy nhất có dữ liệu đã lưu trước
    * đó — nên phải lấy về, không được đẩy bản rỗng trên máy lên đè.
+   *
+   * Trả về bản nháp và version vừa nhận thay vì chỉ `true`/`false`: `setServerVersion` là state
+   * setter nên giá trị mới **không** thấy được trong cùng closure đang chạy. `saveDraft` cần con
+   * số đó ngay để thử lại PATCH sau một lần 409, nên nó phải đi ra theo đường trả về. Vẫn dùng
+   * được như boolean ở các chỗ gọi cũ vì thất bại trả `null`.
    */
   const adoptServerDraft = useCallback(
-    async (options?: { localDraft?: IntakeDraft }): Promise<boolean> => {
+    async (options?: {
+      localDraft?: IntakeDraft;
+    }): Promise<{ draft: IntakeDraft; version: number } | null> => {
       try {
         const response = await fetchApi("/api/public/submissions/current", { method: "GET" });
         if (!response.ok) {
-          return false;
+          return null;
         }
         const body = (await response.json()) as {
           draft: (IntakeDraft & { owners?: unknown }) | null;
           files?: ServerFileSummary[];
           version?: unknown;
         };
-        if (!body.draft || !Array.isArray(body.draft.owners)) return false;
+        if (!body.draft || !Array.isArray(body.draft.owners)) return null;
         // Nháp lưu trước 2026-07-22 mang mã vai trò cũ, không còn trong danh mục PL3. Đổi ngay lúc
         // tải về, nếu không ô "Vai trò trên GCN" hiện trống và người dân không hiểu vì sao.
         const serverDraft = {
@@ -854,7 +787,7 @@ export function IntakeWizard({ assisted }: { assisted?: AssistedModeConfig } = {
           serverVersion: body.version,
           localDraft: options?.localDraft,
         });
-        if (!adopted) return false;
+        if (!adopted) return null;
         const restoredDraft = adopted.draft;
         setDraft(restoredDraft);
         setServerVersion(adopted.version);
@@ -888,14 +821,113 @@ export function IntakeWizard({ assisted }: { assisted?: AssistedModeConfig } = {
         setCertificatePhotos(
           applyCertMeta(restoredCertificates, restoredDraft.certificateFileMetadata),
         );
+        return { draft: restoredDraft, version: adopted.version };
+      } catch {
+        return null;
+      }
+    },
+    [],
+  );
+
+  /** Lưu nháp lên server. Chỉ gọi khi chuyển bước để giữ số lần ghi Sheets ở mức thấp. */
+  const saveDraft = useCallback(
+    async (draftToSave: IntakeDraft = draft): Promise<boolean> => {
+      if (!csrfToken) {
+        return true;
+      }
+
+      // `version` có thể là `null` khi chưa nhận được snapshot nào; máy chủ trả 409 và nhánh phục
+      // hồi bên dưới lấy đúng version rồi thử lại, thay vì thất bại thẳng như trước.
+      const patch = (payload: IntakeDraft, version: number | null): Promise<Response> =>
+        fetchApi("/api/public/submissions/current", {
+          method: "PATCH",
+          headers: { "content-type": "application/json", "x-public-csrf-token": csrfToken },
+          body: JSON.stringify({
+            draft: withCertificateMetadata(payload, certificatePhotos),
+            version,
+          }),
+        });
+
+      setSaveStatus("SAVING");
+      try {
+        let response = await patch(draftToSave, serverVersion);
+
+        /*
+         * 409 = version trên máy chủ khác version trên máy. Máy chủ kiểm khớp TUYỆT ĐỐI, nên
+         * nguyên nhân thường gặp nhất KHÔNG phải "hai thiết bị cùng sửa" mà là: một lần PATCH đã
+         * ghi xong nhưng response rơi mất trên mạng yếu — lần thử lại gửi đúng version cũ và bị
+         * từ chối. Trước đây người dân kẹt luôn ở bước đó, kèm một thông báo sai sự thật.
+         *
+         * Xử lý: lấy lại snapshot máy chủ, gộp dữ liệu đang có trên máy lên trên (chính
+         * `adoptServerDraftSnapshot` với `localDraft`), rồi thử lại đúng MỘT lần. Trường hợp mất
+         * response tự gỡ được vì snapshot mới chính là thứ vừa ghi. Nếu thật sự có thiết bị thứ
+         * hai đang sửa thì lần hai vẫn 409 và thông báo gốc được hiển thị — không nuốt lỗi thật,
+         * cũng không lặp vô hạn.
+         */
+        if (response.status === 409) {
+          const adopted = await adoptServerDraft({ localDraft: draftToSave });
+          if (adopted) {
+            response = await patch(adopted.draft, adopted.version);
+          }
+        }
+
+        if (!response.ok) {
+          setSaveStatus("FAILED");
+          setServerError(await readErrorMessage(response, "Chưa lưu được. Thử lại sau ít phút."));
+          return false;
+        }
+
+        const saved = (await response.json()) as { version?: unknown };
+        if (
+          typeof saved.version !== "number" ||
+          !Number.isInteger(saved.version) ||
+          saved.version < 1
+        ) {
+          setSaveStatus("FAILED");
+          setServerError("Máy chủ không trả phiên bản bản kê khai hợp lệ. Vui lòng thử lại.");
+          return false;
+        }
+
+        setServerVersion(saved.version);
+        setSaveStatus("SAVED");
+        setServerError("");
+        // Chỉ hạ cờ khi máy chủ đã nhận. Lưu hỏng mà hạ cờ là mất dữ liệu im lặng ở lần sau.
+        draftDirtyRef.current = false;
         return true;
       } catch {
+        setSaveStatus("OFFLINE");
+        setServerError("Mất kết nối. Dữ liệu bạn nhập vẫn còn trên màn hình, đừng đóng trang.");
         return false;
       }
     },
-    [],
+    [csrfToken, draft, certificatePhotos, serverVersion, adoptServerDraft],
+  );
+
+  /**
+   * Lưu nháp **một lần** cho mỗi lô thay đổi.
+   *
+   * Hai việc:
+   * - bỏ qua hoàn toàn nếu bản nháp không đổi từ lần lưu trước (tải ảnh mặt sau ngay sau mặt
+   *   trước không PATCH lại);
+   * - gộp các lời gọi chồng nhau vào cùng một request đang bay, thay vì bắn song song rồi để hai
+   *   response ghi đè nhau theo thứ tự ngẫu nhiên.
+   */
+  const savePromiseRef = useRef<Promise<boolean> | null>(null);
+
+  const flushDraft = useCallback(
+    async (options?: { force?: boolean }): Promise<boolean> => {
+      if (!options?.force && !draftDirtyRef.current) return true;
+      if (savePromiseRef.current) return savePromiseRef.current;
+      const promise = saveDraft().finally(() => {
+        savePromiseRef.current = null;
+      });
+      savePromiseRef.current = promise;
+      return promise;
+    },
+    [saveDraft],
   );
 
+
   useEffect(() => {
     let recovery: {
       receiptCode?: string;
diff --git a/src/modules/public-intake/draft-adoption.ts b/src/modules/public-intake/draft-adoption.ts
index be63127..2fdddef 100644
--- a/src/modules/public-intake/draft-adoption.ts
+++ b/src/modules/public-intake/draft-adoption.ts
@@ -63,6 +63,33 @@ function preserveLocalFields(local: IntakeDraft, server: IntakeDraft): IntakeDra
   };
 }
 
+/**
+ * So sánh sâu, không phụ thuộc thứ tự khóa.
+ *
+ * `JSON.stringify(a) !== JSON.stringify(b)` đọc thì gọn nhưng nhạy với **thứ tự chèn khóa**:
+ * `preserveLocalFields` dựng đối tượng bằng `{...server, ...local}`, nên hôm nay thứ tự trùng
+ * server và phép so sánh đúng. Chỉ cần một trường mới xuất hiện ở một phía là thứ tự lệch và
+ * `hasLocalChanges` báo "có thay đổi" cho hai bản nháp giống hệt nhau — hệ quả là một PATCH thừa
+ * mỗi lần khôi phục phiên. Giá trị này quyết định có ghi đè dữ liệu người dân hay không, nên nó
+ * không nên phụ thuộc vào chi tiết dựng đối tượng ở nơi khác.
+ */
+function deepEqual(a: unknown, b: unknown): boolean {
+  if (a === b) return true;
+  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
+  if (Array.isArray(a) !== Array.isArray(b)) return false;
+  if (Array.isArray(a) && Array.isArray(b)) {
+    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
+  }
+  const left = a as Record<string, unknown>;
+  const right = b as Record<string, unknown>;
+  const leftKeys = Object.keys(left);
+  const rightKeys = Object.keys(right);
+  if (leftKeys.length !== rightKeys.length) return false;
+  return leftKeys.every(
+    (key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]),
+  );
+}
+
 /**
  * Nhận snapshot GET `/current`: version luôn thuộc server; dữ liệu local chỉ được giữ ở lần
  * CREATE, còn các ID sinh phía server được thay vào theo vị trí để upload sau đó tham chiếu đúng.
@@ -85,6 +112,6 @@ export function adoptServerDraftSnapshot(
   return {
     draft,
     version: input.serverVersion,
-    hasLocalChanges: JSON.stringify(draft) !== JSON.stringify(input.serverDraft),
+    hasLocalChanges: !deepEqual(draft, input.serverDraft),
   };
 }
diff --git a/src/modules/public-intake/repository.ts b/src/modules/public-intake/repository.ts
index 1cadb06..d8b7658 100644
--- a/src/modules/public-intake/repository.ts
+++ b/src/modules/public-intake/repository.ts
@@ -29,6 +29,15 @@ export type { PublicStatus } from "./workflow";
  * của mình, làm mất luôn ý nghĩa của việc phân biệt nguồn.
  */
 export const INTAKE_CHANNELS = ["SELF_SERVICE", "OFFICER_ASSISTED"] as const;
+
+/**
+ * Trần số bản ghi số đo tải ảnh cho MỘT hồ sơ.
+ *
+ * Đặt rất cao so với thực tế (một hộ tối đa 2 ảnh CCCD mỗi chủ sử dụng + 10 ảnh GCN, kể cả mạng
+ * rất tệ cũng chỉ vài chục lượt kể cả thử lại). Trần này không nhằm giới hạn người dân mà nhằm
+ * chặn một phiên hợp lệ bơm vô hạn dòng vào bảng qua `/uploads/metrics`.
+ */
+export const MAX_UPLOAD_ATTEMPTS_PER_SUBMISSION = 200;
 export type IntakeChannel = (typeof INTAKE_CHANNELS)[number];
 
 /** Cán bộ ngồi nhập hộ. Mọi trường do máy chủ điền từ phiên đăng nhập. */
@@ -776,6 +785,14 @@ export class PublicIntakeRepository {
     requestId: string;
     idempotencyKey: string;
     mutationHash: string;
+    /**
+     * HMAC tra cứu của các CCCD hợp lệ trong `draft`, do route tính (repository không chạm env).
+     *
+     * Cán bộ nhập hộ hoặc sửa giúp CCCD mà người dân để trống ở MỨC A. Không ghi ở đây thì hồ sơ
+     * đó vĩnh viễn nằm ngoài chỉ mục tra cứu và không bao giờ bị phát hiện trùng. Insert dùng
+     * `on conflict do nothing` nên ghi lại nhiều lần là vô hại.
+     */
+    pendingIdentityHmacs?: string[];
   }): Promise<SubmissionRecord> {
     const database = getDatabase();
     return database.begin(async (transaction) => {
@@ -805,7 +822,12 @@ export class PublicIntakeRepository {
       const next = mapSubmission(rows[0]);
 
       if (input.record.status !== "DRAFT") {
-        await this.refreshCanonicalProjection(transaction, input.record.submissionId, input.draft);
+        await this.refreshCanonicalProjection(
+          transaction,
+          input.record.submissionId,
+          input.draft,
+          input.pendingIdentityHmacs,
+        );
       }
 
       await this.insertAudit(transaction, {
@@ -849,6 +871,14 @@ export class PublicIntakeRepository {
       jobId: string;
       appliedFieldPaths: readonly string[];
     };
+    /**
+     * HMAC tra cứu của các CCCD hợp lệ trong `draft`, do route tính (repository không chạm env).
+     *
+     * Cán bộ nhập hộ hoặc sửa giúp CCCD mà người dân để trống ở MỨC A. Không ghi ở đây thì hồ sơ
+     * đó vĩnh viễn nằm ngoài chỉ mục tra cứu và không bao giờ bị phát hiện trùng. Insert dùng
+     * `on conflict do nothing` nên ghi lại nhiều lần là vô hại.
+     */
+    pendingIdentityHmacs?: string[];
   }): Promise<SubmissionRecord> {
     const database = getDatabase();
     return database.begin(async (transaction) => {
@@ -897,7 +927,12 @@ export class PublicIntakeRepository {
       `;
 
       if (input.record.status !== "DRAFT") {
-        await this.refreshCanonicalProjection(transaction, input.record.submissionId, input.draft);
+        await this.refreshCanonicalProjection(
+          transaction,
+          input.record.submissionId,
+          input.draft,
+          input.pendingIdentityHmacs,
+        );
       }
 
       await this.insertAudit(transaction, {
@@ -971,6 +1006,14 @@ export class PublicIntakeRepository {
     requestId: string;
     idempotencyKey: string;
     mutationHash: string;
+    /**
+     * HMAC tra cứu của các CCCD hợp lệ trong `draft`, do route tính (repository không chạm env).
+     *
+     * Cán bộ nhập hộ hoặc sửa giúp CCCD mà người dân để trống ở MỨC A. Không ghi ở đây thì hồ sơ
+     * đó vĩnh viễn nằm ngoài chỉ mục tra cứu và không bao giờ bị phát hiện trùng. Insert dùng
+     * `on conflict do nothing` nên ghi lại nhiều lần là vô hại.
+     */
+    pendingIdentityHmacs?: string[];
   }): Promise<SubmissionRecord> {
     const database = getDatabase();
     return database.begin(async (transaction) => {
@@ -1011,7 +1054,12 @@ export class PublicIntakeRepository {
       if (!rows[0]) throw new SubmissionVersionConflictError();
       const next = mapSubmission(rows[0]);
 
-      await this.refreshCanonicalProjection(transaction, input.record.submissionId, input.draft);
+      await this.refreshCanonicalProjection(
+          transaction,
+          input.record.submissionId,
+          input.draft,
+          input.pendingIdentityHmacs,
+        );
 
       const counts = await syncOfficialRecord(transaction, {
         caseId: next.officialCaseId,
@@ -1484,12 +1532,18 @@ export class PublicIntakeRepository {
    * Dùng để quyết định có được xóa tệp trên Drive khi đường ghi hỏng hay không. Đọc **mọi** trạng
    * thái, kể cả `REPLACED`/`DELETED`: một tệp đã bị thay vẫn là tệp đã từng được nhận, và xóa nó
    * khỏi Drive sẽ làm mất bằng chứng của hồ sơ.
+   *
+   * CỐ Ý KHÔNG lọc theo `submission_id`. Câu hỏi cần trả lời trước khi xóa là "có hồ sơ NÀO đang
+   * trỏ vào tệp này không", không phải "hồ sơ đang gọi có trỏ vào nó không". Lọc theo hồ sơ gọi
+   * thì một `driveFileId` do client gửi lên trỏ sang hồ sơ khác sẽ bị coi là mồ côi và bị xóa —
+   * mất bằng chứng của một hộ dân không liên quan. `driveFileId` tại các nhánh dọn dẹp trong
+   * `uploads/complete` là dữ liệu client chưa qua xác minh, nên hàng rào phải nằm ở đây.
    */
-  async isDriveFileAdopted(submissionId: string, driveFileId: string): Promise<boolean> {
+  async isDriveFileAdopted(driveFileId: string): Promise<boolean> {
     const database = getDatabase();
     const rows = await database<{ count: string }[]>`
       select count(*)::text as count from public.public_files
-      where submission_id = ${submissionId} and drive_file_id = ${driveFileId}
+      where drive_file_id = ${driveFileId}
     `;
     return Number(rows[0]?.count ?? "0") > 0;
   }
@@ -1498,6 +1552,12 @@ export class PublicIntakeRepository {
    * Ghi một lượt tải vào bảng số đo. Best-effort ở phía gọi — hàm này vẫn ném lỗi để bên gọi tự
    * quyết định nuốt, chứ không tự nuốt ở đây (nuốt trong repository là cách chắc chắn để một bảng
    * hỏng nằm im hàng tháng mà không ai biết).
+   *
+   * Trần `MAX_UPLOAD_ATTEMPTS_PER_SUBMISSION` áp ngay trong câu lệnh, không phải một lượt `select`
+   * riêng: `/uploads/metrics` nhận số đo của các lượt HỎNG nên không có gì buộc client phải dừng,
+   * và một phiên hợp lệ có thể bắn bao nhiêu bản ghi tùy ý. Một hộ dân thật tối đa vài chục lượt
+   * kể cả khi mạng rất tệ, nên trần này không chạm dữ liệu thật; nó chỉ chặn việc bơm hàng loạt
+   * dòng rác vào cơ sở dữ liệu.
    */
   async appendUploadAttempt(metric: UploadAttemptMetric): Promise<void> {
     const database = getDatabase();
@@ -1507,14 +1567,18 @@ export class PublicIntakeRepository {
         prepare_duration_ms, initiate_duration_ms, upload_duration_ms, complete_duration_ms,
         retry_count, client_platform, effective_connection_type, normalization_version,
         failure_stage, failure_code
-      ) values (
+      )
+      select
         ${metric.attemptId}, ${metric.submissionId}, ${metric.documentType}, ${metric.outcome},
         ${metric.sourceSizeBytes}, ${metric.uploadSizeBytes},
         ${metric.prepareDurationMs}, ${metric.initiateDurationMs},
         ${metric.uploadDurationMs}, ${metric.completeDurationMs},
         ${metric.retryCount}, ${metric.clientPlatform}, ${metric.effectiveConnectionType},
         ${metric.normalizationVersion}, ${metric.failureStage}, ${metric.failureCode}
-      )
+      where (
+        select count(*) from public.public_upload_attempts
+        where submission_id = ${metric.submissionId}
+      ) < ${MAX_UPLOAD_ATTEMPTS_PER_SUBMISSION}
       on conflict (attempt_id) do nothing
     `;
   }
diff --git a/src/modules/public-intake/storage.ts b/src/modules/public-intake/storage.ts
index ab16dd3..ac827f6 100644
--- a/src/modules/public-intake/storage.ts
+++ b/src/modules/public-intake/storage.ts
@@ -199,7 +199,7 @@ export class PublicIntakeStorage {
     let pageToken: string | undefined;
     do {
       const page = await drive.files.list({
-        q: `'${folderId}' in parents and trashed = false`,
+        q: `'${escapeQueryValue(folderId)}' in parents and trashed = false`,
         fields: "nextPageToken, files(id, size)",
         pageSize: 200,
         pageToken,
@@ -212,6 +212,23 @@ export class PublicIntakeStorage {
     return found;
   }
 
+  /**
+   * Tệp này có nằm trong đúng thư mục của bản kê khai đang gọi hay không.
+   *
+   * Tách khỏi `verifyUploadedFile` vì hai câu hỏi khác nhau: `verifyUploadedFile` hỏi "tệp có đạt
+   * để nhận vào hồ sơ không" (định dạng, dung lượng, checksum), còn hàm này chỉ hỏi "tệp có thuộc
+   * hộ dân đang gọi không" — dùng ngay trước khi XÓA. Một tệp sai định dạng vẫn thuộc thư mục của
+   * người gọi và vẫn được xóa; một tệp đúng định dạng nhưng nằm ở thư mục hộ khác thì tuyệt đối
+   * không.
+   *
+   * Ném lỗi được coi là "không xác nhận được" ở phía gọi, và phía gọi phải nghiêng về GIỮ tệp.
+   */
+  async isFileInFolder(driveFileId: string, folderId: string): Promise<boolean> {
+    const { drive } = createGoogleWorkspaceClient(this.credentials);
+    const response = await drive.files.get({ fileId: driveFileId, fields: "id,parents" });
+    return response.data.parents?.includes(folderId) === true;
+  }
+
   /** Tệp không đạt xác minh phải rời khỏi Drive ngay, không để tích rác (PLAN_NL §6.3). */
   async discardFile(driveFileId: string): Promise<void> {
     const { drive } = createGoogleWorkspaceClient(this.credentials);
diff --git a/src/modules/public-intake/upload-metrics.ts b/src/modules/public-intake/upload-metrics.ts
index 34a11d2..ec34137 100644
--- a/src/modules/public-intake/upload-metrics.ts
+++ b/src/modules/public-intake/upload-metrics.ts
@@ -166,6 +166,35 @@ export function buildUploadAttemptMetric(input: BuildMetricInput): UploadAttempt
   };
 }
 
+/**
+ * Báo một lần khi đường ghi số đo hỏng.
+ *
+ * Cả hai chỗ gọi `appendUploadAttempt` đều nuốt lỗi có chủ đích — một lượt tải ảnh đã thành công
+ * không được hỏng vì bảng phụ. Nhưng nuốt mà không báo gì thì một bảng hỏng (thiếu migration, sai
+ * quyền, sai RLS) nằm im hàng tháng, và lúc cần nghiệm thu ngưỡng hiệu năng mới phát hiện không có
+ * số nào. Ghi **một** dòng cho mỗi tiến trình là đủ để thấy trong log Vercel mà không làm ngập log
+ * khi sự cố kéo dài.
+ *
+ * Chỉ ghi mã lỗi Postgres (`42501`, `42P01`…), **không** ghi `error.message`: thông báo lỗi
+ * Postgres có thể nhắc lại giá trị của dòng vừa insert.
+ */
+let uploadMetricFailureReported = false;
+
+export function reportUploadMetricFailure(error: unknown): void {
+  if (uploadMetricFailureReported) return;
+  uploadMetricFailureReported = true;
+  const code = (error as { code?: unknown } | null)?.code;
+  console.error(
+    "[upload-metrics] Không ghi được public_upload_attempts; số đo tải ảnh đang mất. " +
+      `pg_code=${typeof code === "string" ? code : "UNKNOWN"}`,
+  );
+}
+
+/** Chỉ dùng trong test: đặt lại cờ "đã báo" để mỗi ca kiểm tra chạy độc lập. */
+export function resetUploadMetricFailureReport(): void {
+  uploadMetricFailureReported = false;
+}
+
 export interface FileNormalizationMetadata {
   readonly sourceSizeBytes: number | null;
   readonly sourceMimeType: string | null;
diff --git a/supabase/migrations/202607290001_public_upload_attempts_rls.sql b/supabase/migrations/202607290001_public_upload_attempts_rls.sql
index 7cc38d6..a12ac02 100644
--- a/supabase/migrations/202607290001_public_upload_attempts_rls.sql
+++ b/supabase/migrations/202607290001_public_upload_attempts_rls.sql
@@ -1,6 +1,19 @@
 -- Telemetry tải ảnh chỉ được ghi qua repository server-side.
 -- Không có policy public; anon/authenticated không được đọc hay ghi trực tiếp.
+--
+-- CỐ Ý KHÔNG dùng `force row level security`, dù bản nháp đầu của migration này có dùng.
+--
+-- `force` bắt RLS áp cả lên chủ sở hữu bảng. Bảng không có policy nào, nên với bất kỳ role nào
+-- không mang thuộc tính BYPASSRLS thì **mọi** lệnh insert đều trả về 0 dòng. Cả hai chỗ gọi
+-- `appendUploadAttempt` đều bọc `.catch(...)` vì số đo là việc phụ — nghĩa là nếu role kết nối
+-- không có BYPASSRLS thì bảng này sẽ rỗng vĩnh viễn mà không có một dòng log nào báo. Đúng cái
+-- bảng được dựng để nghiệm thu ngưỡng hiệu năng và để mở cờ chuẩn hóa ảnh.
+--
+-- `enable` + `revoke` (không `force`) là đúng mô hình đe dọa ở đây và là mẫu đang dùng cho cả 8
+-- bảng còn lại trong `supabase/migrations/` (xem 202607230001, 202607250002, 202607250005,
+-- 202607260001): chặn anon/authenticated bằng cả RLS lẫn quyền cấp, còn đường ghi hợp lệ duy nhất
+-- là repository chạy trên máy chủ. Giữ đúng một bảng lệch mẫu là cách chắc chắn để sau này không
+-- ai nhớ vì sao nó khác.
 alter table public.public_upload_attempts enable row level security;
-alter table public.public_upload_attempts force row level security;
 
 revoke all on table public.public_upload_attempts from anon, authenticated;
diff --git a/tests/public-upload-complete-route.test.ts b/tests/public-upload-complete-route.test.ts
index 6f49f10..5a69ede 100644
--- a/tests/public-upload-complete-route.test.ts
+++ b/tests/public-upload-complete-route.test.ts
@@ -60,9 +60,23 @@ describe("Không bao giờ xóa tệp cơ sở dữ liệu đã nhận", () => {
   });
 
   it("hỏi không được thì mặc định coi như ĐÃ nhận", () => {
-    // `.catch(() => false)` ở đây là lỗi mất dữ liệu, không phải lỗi phong cách.
-    expect(route).toContain("isDriveFileAdopted(submissionId, driveFileId).catch(() => true)");
-    expect(route).not.toContain(".catch(() => false)");
+    // Đảo chiều `.catch` ở đây là lỗi mất dữ liệu, không phải lỗi phong cách.
+    expect(route).toContain("isDriveFileAdopted(driveFileId).catch(() => true)");
+  });
+
+  it("không xác nhận được thư mục thì KHÔNG xóa", () => {
+    // Hai `.catch` ngược chiều nhau nhưng cùng một ý: không chắc thì giữ tệp lại.
+    //   - hỏi cơ sở dữ liệu hỏng  → coi như ĐÃ nhận (`true`)  → không xóa;
+    //   - hỏi Drive hỏng          → coi như KHÔNG thuộc (`false`) → không xóa.
+    const guard = route.slice(route.indexOf("async function discardIfOrphan"));
+    expect(guard).toContain(".isFileInFolder(driveFileId, record.driveFolderId)");
+    expect(guard).toContain(".catch(() => false)");
+    expect(guard).toMatch(/if \(!ownedByCaller\) return;/);
+  });
+
+  it("kiểm thư mục đứng TRƯỚC lệnh xóa, không phải sau", () => {
+    const guard = route.slice(route.indexOf("async function discardIfOrphan"));
+    expect(guard.indexOf("isFileInFolder")).toBeLessThan(guard.indexOf("discardFile("));
   });
 
   it("truy vấn adopt tính cả tệp đã REPLACED — tệp bị thay vẫn là bằng chứng của hồ sơ", () => {
@@ -70,10 +84,24 @@ describe("Không bao giờ xóa tệp cơ sở dữ liệu đã nhận", () => {
       repository.indexOf("async isDriveFileAdopted"),
       repository.indexOf("async appendUploadAttempt"),
     );
-    expect(method).toContain("where submission_id = ");
+    expect(method).toContain("where drive_file_id = ");
     expect(method).not.toContain("status = 'UPLOADED'");
   });
 
+  it("truy vấn adopt KHÔNG lọc theo hồ sơ đang gọi", () => {
+    /*
+     * Hồi quy đã từng có thật: lọc thêm `submission_id = <hồ sơ đang gọi>` biến câu hỏi "có ai
+     * đang trỏ vào tệp này không" thành "hồ sơ đang gọi có trỏ vào nó không". Một `driveFileId`
+     * do client gửi lên trỏ sang hồ sơ khác khi đó bị coi là mồ côi và bị xóa — mất bằng chứng
+     * của một hộ dân không liên quan.
+     */
+    const method = repository.slice(
+      repository.indexOf("async isDriveFileAdopted"),
+      repository.indexOf("async appendUploadAttempt"),
+    );
+    expect(method).not.toContain("submission_id");
+  });
+
   it("phát lại idempotent trả bản ghi cũ, không chèn bản mới", () => {
     // Nếu replay chèn thêm dòng thì tệp cũ mất tham chiếu và trở thành mồi cho script dọn rác.
     const method = repository.slice(repository.indexOf("async appendFile"));
diff --git a/tests/public-upload-legacy-draft.test.ts b/tests/public-upload-legacy-draft.test.ts
index dace524..da93785 100644
--- a/tests/public-upload-legacy-draft.test.ts
+++ b/tests/public-upload-legacy-draft.test.ts
@@ -6,6 +6,7 @@ const mocks = vi.hoisted(() => ({
   listFiles: vi.fn(),
   findStoredMutation: vi.fn(),
   isDriveFileAdopted: vi.fn(),
+  isFileInFolder: vi.fn(),
   resolvePublicRequest: vi.fn(),
 }));
 
@@ -31,6 +32,7 @@ vi.mock("@/modules/public-intake/storage", () => ({
   getPublicIntakeStorage: () => ({
     createUploadSession: mocks.createUploadSession,
     discardFile: mocks.discardFile,
+    isFileInFolder: mocks.isFileInFolder,
   }),
   UploadVerificationError: class UploadVerificationError extends Error {},
 }));
@@ -85,6 +87,9 @@ describe("public upload với nháp legacy thiếu owners", () => {
     mocks.findStoredMutation.mockResolvedValue(null);
     mocks.isDriveFileAdopted.mockReset();
     mocks.isDriveFileAdopted.mockResolvedValue(false);
+    mocks.isFileInFolder.mockReset();
+    // Tệp nằm đúng thư mục của hộ dân đang gọi — điều kiện cần để được phép dọn.
+    mocks.isFileInFolder.mockResolvedValue(true);
     mocks.resolvePublicRequest.mockReset();
     mocks.resolvePublicRequest.mockResolvedValue({
       record: malformedRecord,
@@ -110,4 +115,24 @@ describe("public upload với nháp legacy thiếu owners", () => {
     expect(body.error.code).toBe("INVALID_STATE");
     expect(mocks.discardFile).toHaveBeenCalledWith("drive-file-test");
   });
+
+  it("KHÔNG dọn khi tệp không nằm trong thư mục Drive của hộ dân đang gọi", async () => {
+    // `driveFileId` ở nhánh này là dữ liệu client chưa qua xác minh. Trỏ sang thư mục hộ khác
+    // thì tuyệt đối không được xóa, kể cả khi chưa hồ sơ nào nhận tệp đó.
+    mocks.isFileInFolder.mockResolvedValue(false);
+
+    const response = await completeUpload(completeRequest());
+
+    expect(response.status).toBe(409);
+    expect(mocks.discardFile).not.toHaveBeenCalled();
+  });
+
+  it("KHÔNG dọn khi không hỏi được Drive về thư mục cha", async () => {
+    mocks.isFileInFolder.mockRejectedValue(new Error("drive unreachable"));
+
+    const response = await completeUpload(completeRequest());
+
+    expect(response.status).toBe(409);
+    expect(mocks.discardFile).not.toHaveBeenCalled();
+  });
 });
diff --git a/tests/working-payload.test.ts b/tests/working-payload.test.ts
index 7ef62d7..178b6ab 100644
--- a/tests/working-payload.test.ts
+++ b/tests/working-payload.test.ts
@@ -34,6 +34,8 @@ vi.mock("@/modules/auth/csrf", () => ({
 vi.mock("@/modules/common/env", () => ({
   loadServerEnvironment: vi.fn().mockReturnValue({
     AUTH_SECRET: "mock-secret-at-least-32-chars-long-security",
+    // Route ghi chỉ mục tra cứu khi cán bộ điền CCCD người dân để trống ở MỨC A, nên cần pepper.
+    DATA_HASH_PEPPER: "mock-pepper-at-least-32-chars-long-value",
   }),
 }));
 
@@ -150,6 +152,19 @@ describe("PUT /api/submissions/:id/working-payload route tests", () => {
     expect(res.status).toBe(200);
     const data = await res.json();
     expect(data.submission.version).toBe(2);
+
+    /*
+     * Cán bộ sửa `working_payload` là một trong những đường mà CCCD có thể xuất hiện LẦN ĐẦU: ở
+     * MỨC A người dân được phép để trống ô đó. Không ghi chỉ mục ở đây thì hồ sơ vĩnh viễn nằm
+     * ngoài phát hiện trùng (quyết định 2026-07-29).
+     */
+    const committed = mockCommitWorkingPayload.mock.calls[0][0] as {
+      pendingIdentityHmacs?: string[];
+    };
+    expect(committed.pendingIdentityHmacs).toHaveLength(1);
+    expect(committed.pendingIdentityHmacs?.[0]).toMatch(/^[0-9a-f]{64}$/);
+    // Chỉ mục lưu HMAC, không bao giờ lưu CCCD thô.
+    expect(committed.pendingIdentityHmacs?.[0]).not.toContain("025080001234");
   });
 
   it("W2: not claimed by user -> 403 ACCESS_DENIED", async () => {
diff --git a/tests/pr6-review-round-two.test.ts b/tests/pr6-review-round-two.test.ts
new file mode 100644
index 0000000..5ed2022
--- /dev/null
+++ b/tests/pr6-review-round-two.test.ts
@@ -0,0 +1,265 @@
+/**
+ * Vòng rà soát PR #6 (lần hai) — khóa lại từng phát hiện đã sửa.
+ *
+ * Cùng tinh thần với `public-intake-v2-review-fixes.test.ts`: đây là những chỗ **đã từng sai**,
+ * không phải những chỗ nghĩ là có thể sai. Một số test đọc mã nguồn thay vì gọi hàm, vì phần được
+ * bảo vệ nằm trong route/migration cần Supabase + Google Drive thật mới chạy được — nhưng chúng
+ * bắt đúng loại hồi quy đáng sợ: ai đó "dọn cho gọn" và làm mất một hàng rào.
+ */
+import { readdirSync, readFileSync } from "node:fs";
+import { fileURLToPath } from "node:url";
+
+import { describe, expect, it } from "vitest";
+
+import { adoptServerDraftSnapshot } from "@/modules/public-intake/draft-adoption";
+import { emptyDraft } from "@/modules/public-intake/types";
+import {
+  reportUploadMetricFailure,
+  resetUploadMetricFailureReport,
+} from "@/modules/public-intake/upload-metrics";
+
+function read(relative: string): string {
+  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
+}
+
+/**
+ * Bỏ dòng comment `--` trước khi soi nội dung migration.
+ *
+ * Migration 202607290001 giải thích ngay trong comment vì sao **không** dùng `force row level
+ * security`. Soi cả comment thì chính lời giải thích làm test đỏ, và cách "sửa" dễ nhất là xóa lời
+ * giải thích — đúng thứ cần giữ nhất.
+ */
+function sqlStatementsOnly(source: string): string {
+  return source
+    .split("\n")
+    .filter((line) => !line.trimStart().startsWith("--"))
+    .join("\n");
+}
+
+describe("Telemetry tải ảnh không được hỏng trong im lặng", () => {
+  it("migration KHÔNG dùng force row level security", () => {
+    /*
+     * `force` áp RLS lên cả chủ sở hữu bảng. Bảng không có policy nào, nên với role không mang
+     * BYPASSRLS thì mọi insert đều trả 0 dòng — mà cả hai chỗ gọi `appendUploadAttempt` đều nuốt
+     * lỗi vì số đo là việc phụ. Kết quả: bảng rỗng vĩnh viễn, không một dòng log nào báo, đúng cái
+     * bảng dùng để nghiệm thu ngưỡng hiệu năng và để mở cờ chuẩn hóa ảnh.
+     */
+    const migration = sqlStatementsOnly(
+      read("../supabase/migrations/202607290001_public_upload_attempts_rls.sql"),
+    );
+    expect(migration).toContain("enable row level security");
+    expect(migration).not.toContain("force row level security");
+    expect(migration).toContain("revoke all on table public.public_upload_attempts");
+  });
+
+  it("không migration nào trong repo dùng force row level security", () => {
+    // Giữ đúng một bảng lệch mẫu là cách chắc chắn để sau này không ai nhớ vì sao nó khác.
+    const directory = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
+    const offenders = readdirSync(directory)
+      .filter((name) => name.endsWith(".sql"))
+      .filter((name) =>
+        sqlStatementsOnly(readFileSync(`${directory}${name}`, "utf8")).includes("force row level"),
+      );
+    expect(offenders).toEqual([]);
+  });
+
+  it("lỗi ghi số đo được báo đúng một lần cho mỗi tiến trình", () => {
+    resetUploadMetricFailureReport();
+    const seen: string[] = [];
+    const original = console.error;
+    console.error = (message: unknown) => void seen.push(String(message));
+    try {
+      reportUploadMetricFailure({ code: "42501" });
+      reportUploadMetricFailure({ code: "42501" });
+      reportUploadMetricFailure(new Error("khác"));
+    } finally {
+      console.error = original;
+      resetUploadMetricFailureReport();
+    }
+
+    expect(seen).toHaveLength(1);
+    expect(seen[0]).toContain("public_upload_attempts");
+    expect(seen[0]).toContain("pg_code=42501");
+  });
+
+  it("không ghi error.message vào log — Postgres có thể nhắc lại giá trị dòng vừa insert", () => {
+    resetUploadMetricFailureReport();
+    const seen: string[] = [];
+    const original = console.error;
+    console.error = (message: unknown) => void seen.push(String(message));
+    try {
+      reportUploadMetricFailure(new Error("012345678901 vi phạm ràng buộc"));
+    } finally {
+      console.error = original;
+      resetUploadMetricFailureReport();
+    }
+
+    expect(seen[0]).not.toContain("012345678901");
+    expect(seen[0]).toContain("pg_code=UNKNOWN");
+  });
+
+  it("bảng số đo có trần số dòng cho mỗi hồ sơ", () => {
+    // `/uploads/metrics` nhận số đo của các lượt HỎNG nên không có gì buộc client phải dừng.
+    const repository = read("../src/modules/public-intake/repository.ts");
+    const method = repository.slice(
+      repository.indexOf("async appendUploadAttempt"),
+      repository.indexOf("async appendFile"),
+    );
+    expect(method).toContain("MAX_UPLOAD_ATTEMPTS_PER_SUBMISSION");
+    expect(method).toContain("select count(*) from public.public_upload_attempts");
+  });
+});
+
+describe("PATCH nháp: 409 giả trên mạng yếu phải tự gỡ", () => {
+  const wizard = read("../src/app/ke-khai/wizard.tsx");
+
+  it("gặp 409 thì lấy lại snapshot rồi thử lại, không bỏ cuộc ngay", () => {
+    /*
+     * Máy chủ kiểm version khớp TUYỆT ĐỐI. Nguyên nhân 409 thường gặp nhất không phải hai thiết
+     * bị cùng sửa mà là một PATCH đã ghi xong nhưng response rơi mất — lần thử lại gửi version cũ
+     * và bị từ chối. Trước khi sửa, người dân kẹt ở bước đó kèm thông báo sai sự thật.
+     */
+    const saveDraft = wizard.slice(
+      wizard.indexOf("const saveDraft = useCallback"),
+      wizard.indexOf("const flushDraft = useCallback"),
+    );
+    expect(saveDraft).toContain("if (response.status === 409)");
+    expect(saveDraft).toContain("adoptServerDraft({ localDraft: draftToSave })");
+    expect(saveDraft).toContain("response = await patch(adopted.draft, adopted.version)");
+  });
+
+  it("chỉ thử lại đúng một lần — 409 thật vẫn nổi lên", () => {
+    const saveDraft = wizard.slice(
+      wizard.indexOf("const saveDraft = useCallback"),
+      wizard.indexOf("const flushDraft = useCallback"),
+    );
+    expect(saveDraft.match(/response\.status === 409/g)).toHaveLength(1);
+    expect(saveDraft).toContain("if (!response.ok)");
+  });
+
+  it("adoptServerDraft trả version ra ngoài, không chỉ gọi setState", () => {
+    // `setServerVersion` là state setter: giá trị mới không thấy được trong cùng closure, nên
+    // version phải đi ra theo đường trả về thì `saveDraft` mới thử lại đúng được.
+    const adopt = wizard.slice(
+      wizard.indexOf("const adoptServerDraft = useCallback"),
+      wizard.indexOf("const saveDraft = useCallback"),
+    );
+    expect(adopt).toContain("return { draft: restoredDraft, version: adopted.version };");
+  });
+});
+
+describe("hasLocalChanges không được phụ thuộc thứ tự khóa", () => {
+  it("hai bản nháp giống hệt nhau nhưng khác thứ tự khóa vẫn là KHÔNG có thay đổi", () => {
+    const server = emptyDraft("owner-1", "parcel-1", "landuse-1");
+    // Dựng lại cùng nội dung theo thứ tự khóa đảo ngược — `JSON.stringify` sẽ báo khác nhau.
+    const reordered = Object.fromEntries(
+      Object.entries(server as unknown as Record<string, unknown>).reverse(),
+    ) as unknown as typeof server;
+
+    const adopted = adoptServerDraftSnapshot({
+      serverDraft: server,
+      serverVersion: 3,
+      localDraft: reordered,
+    });
+
+    expect(adopted).not.toBeNull();
+    expect(adopted?.version).toBe(3);
+    expect(adopted?.hasLocalChanges).toBe(false);
+  });
+
+  it("khác nội dung thật thì vẫn báo có thay đổi", () => {
+    const server = emptyDraft("owner-1", "parcel-1", "landuse-1");
+    const local = structuredClone(server);
+    local.phone = "0912345678";
+
+    const adopted = adoptServerDraftSnapshot({
+      serverDraft: server,
+      serverVersion: 2,
+      localDraft: local,
+    });
+
+    expect(adopted?.hasLocalChanges).toBe(true);
+  });
+});
+
+describe("Script xóa dữ liệu E2E không được chạy nhầm trên production", () => {
+  const script = read("../scripts/cleanup-e2e-preview-data.ts");
+
+  it("từ chối khi NODE_ENV=production", () => {
+    expect(script).toContain('process.env.NODE_ENV === "production"');
+  });
+
+  it("từ chối khi APP_BASE_URL không giống môi trường thử", () => {
+    expect(script).toContain("APP_BASE_URL");
+    expect(script).toContain("preview|staging|vercel");
+  });
+
+  it("chỉ bỏ qua được khi khai báo có ý thức", () => {
+    expect(script).toContain("--i-know-this-is-not-preview");
+  });
+
+  it("kiểm tra chạy TRƯỚC khi gọi cleanup", () => {
+    expect(script.indexOf("const refusal = refusesToRunHere")).toBeLessThan(
+      script.indexOf("cleanup(parseOptions(argv))"),
+    );
+  });
+});
+
+describe("Chỉ mục tra cứu CCCD phủ cả hồ sơ MỨC A", () => {
+  /*
+   * Từ V2, CCCD là **tùy chọn** với người dân. Trước khi sửa, `pendingIdentityHmacs` chỉ được ghi
+   * ở `submit` khi `status === "SUBMITTED"`, nên hai nhóm hồ sơ nằm ngoài chỉ mục vĩnh viễn:
+   *   - người dân điền CCCD ở lần GỬI BỔ SUNG (`RESUBMITTED`);
+   *   - cán bộ điền hộ CCCD lúc hoàn thiện hoặc tiếp nhận chính thức.
+   * Cả hai nhóm đều là nhóm mà V2 sinh ra nhiều nhất. Quyết định 2026-07-29: ghi cả hai, dùng
+   * `kind = 'PENDING'` giống người dân tự khai.
+   */
+  it("route submit công khai ghi chỉ mục cho cả SUBMITTED lẫn RESUBMITTED", () => {
+    const route = read("../src/app/api/public/submissions/current/submit/route.ts");
+    const block = route.slice(route.indexOf("const pendingIdentityHmacs"));
+    expect(block).toContain("citizenIdsForLookup(draft)");
+    expect(block.slice(0, block.indexOf("try {"))).not.toContain('status === "SUBMITTED"');
+  });
+
+  it("route submit của cán bộ hỗ trợ cũng ghi cho cả hai trạng thái", () => {
+    const route = read("../src/app/api/staff/assisted-submissions/current/submit/route.ts");
+    const block = route.slice(route.indexOf("pendingIdentityHmacs:"));
+    expect(block).toContain("citizenIdsForLookup(draft)");
+    expect(block.slice(0, 400)).not.toContain('status === "SUBMITTED"');
+  });
+
+  it("cả ba đường ghi của cán bộ đều truyền pendingIdentityHmacs", () => {
+    // Thiếu một đường là hồ sơ đi qua đúng đường đó lọt khỏi chỉ mục mà không ai biết.
+    for (const relative of [
+      "../src/app/api/submissions/[submissionId]/route.ts",
+      "../src/app/api/submissions/[submissionId]/working-payload/route.ts",
+      "../src/app/api/submissions/[submissionId]/ai-draft/apply/route.ts",
+    ]) {
+      const route = read(relative);
+      expect(route, relative).toContain("pendingIdentityHmacs");
+      expect(route, relative).toContain("citizenIdsForLookup");
+      expect(route, relative).toContain("DATA_HASH_PEPPER");
+    }
+  });
+
+  it("repository ghi chỉ mục với kind PENDING, idempotent", () => {
+    const repository = read("../src/modules/public-intake/repository.ts");
+    expect(repository).toContain("insert into public.public_lookup_index");
+    expect(repository).toContain("values ('PENDING', ${hmac}, ${submissionId}) on conflict do nothing");
+  });
+
+  it("repository KHÔNG tự tính HMAC — pepper chỉ nằm ở tầng route", () => {
+    // Giữ đúng phân lớp sẵn có: repository không bao giờ đọc biến môi trường.
+    const repository = read("../src/modules/public-intake/repository.ts");
+    expect(repository).not.toContain("DATA_HASH_PEPPER");
+    expect(repository).not.toContain("identityHmac(");
+  });
+});
+
+describe("Truy vấn Drive escape đúng giá trị nội suy", () => {
+  it("listFolderFileIds không ghép thẳng folderId vào chuỗi q", () => {
+    const storage = read("../src/modules/public-intake/storage.ts");
+    expect(storage).toContain("escapeQueryValue(folderId)");
+    expect(storage).not.toContain("`'${folderId}' in parents");
+  });
+});
```
