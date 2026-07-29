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

**Đính chính so với báo cáo trước:** bản sửa 409 đầu tiên (commit `ad81c35`) **luôn** thử lại sau khi lấy snapshot. Vì lần thử lại dùng version vừa fetch nên nó luôn thành công — kể cả khi 409 đến từ một thiết bị khác đang sửa thật, tức là ghi đè mất dữ liệu của thiết bị kia trong im lặng. Câu "lần hai vẫn 409" trong báo cáo trước là **sai**. Đã sửa: chỉ thử lại khi `hasLocalChanges === false`.

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
| Hai thiết bị thật cùng sửa | 409 → kẹt | KHÔNG thử lại (`hasLocalChanges === true`) → 409 nổi lên, hiện đúng thông báo gốc, không ghi đè | Test `TÌNH HUỐNG 2` + `TÌNH HUỐNG 2b` (dữ liệu thật, không đọc mã nguồn) |
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
| AC-05 | 409 do mất response tự gỡ được | PASS | 4 test đặc tả | **Chưa** kiểm bằng E2E thật |
| AC-13 | 409 do thiết bị khác sửa **không** bị ghi đè im lặng | PASS | 3 test hành vi trên `adoptServerDraftSnapshot` (TÌNH HUỐNG 1 / 2 / 2b) | Phát hiện ở vòng phản hồi; xem mục 15 |
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
| Medium | Sau khi báo xung đột, lần lưu KẾ TIẾP vẫn ghi đè | `adoptServerDraft` đã cập nhật `serverVersion`, nên nếu người dân bấm lưu lại thì thay đổi của thiết bị kia mất. Là hành động có ý thức sau cảnh báo, nhưng không có giao diện hợp nhất | Chấp nhận ở vòng này; cần UI merge nếu nghiệp vụ yêu cầu |
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
diff --git a/docs/brain/03-decisions.md b/docs/brain/03-decisions.md
index ff37e06..4daa880 100644
--- a/docs/brain/03-decisions.md
+++ b/docs/brain/03-decisions.md
@@ -34,10 +34,31 @@ vừa insert).
 Kiểm khớp tuyệt đối là đúng và được giữ nguyên. Nhưng nguyên nhân 409 thường gặp nhất không phải
 hai thiết bị cùng sửa mà là một PATCH đã ghi xong rồi response rơi mất trên mạng yếu — lần thử lại
 gửi version cũ và bị từ chối, người dân kẹt kèm thông báo sai sự thật ("đang mở ở thiết bị khác").
-Client nay lấy lại snapshot, gộp dữ liệu trên máy lên trên rồi thử lại **đúng một lần**. Mất
-response tự gỡ được; xung đột thật vẫn 409 ở lần hai và thông báo gốc hiện ra. Không chọn phương
-án idempotency key cho PATCH vì `request_log.kind` có CHECK constraint, thêm kind mới là phải thêm
-migration — chi phí lớn hơn giá trị ở bước này.
+Client lấy lại snapshot rồi thử lại — nhưng **chỉ khi phân biệt được** đó là lần ghi của chính
+mình bị mất response, chứ không phải thiết bị khác đã sửa. Căn cứ là `hasLocalChanges` của snapshot
+vừa lấy về (so sánh sâu bản gộp local-đè-server với chính bản server):
+
+- `false` → gộp xong không khác gì server → server **đã có** đúng thứ ta định ghi → chỉ mất
+  response → thử lại vô hại;
+- `true` → server đang giữ nội dung ta chưa từng thấy → không phân biệt được → coi như xung đột
+  thật, **không** thử lại, để 409 nổi lên và người dân đọc đúng thông báo.
+
+Bản sửa đầu tiên của vòng này **thiếu điều kiện đó** và luôn thử lại: vì lần thử lại dùng version
+vừa fetch nên nó LUÔN thành công, kể cả khi 409 đến từ một thiết bị khác — tức là ghi đè mất dữ
+liệu của thiết bị kia trong im lặng. Ghi lại đây vì đó đúng là loại lỗi mà "tự phục hồi cho tiện"
+hay tạo ra.
+
+Điều kiện bắt buộc đi kèm: payload gửi đi và payload đem so sánh phải là **cùng một object** (đã
+qua `withCertificateMetadata`). So bản chưa gắn metadata với snapshot đã có sẽ luôn ra "khác nhau"
+và nhánh tự phục hồi không bao giờ chạy.
+
+Hạn chế còn lại, chấp nhận có ý thức: sau khi báo xung đột, `adoptServerDraft` đã cập nhật
+`serverVersion`, nên nếu người dân bấm lưu lần nữa thì lần đó **sẽ** ghi đè. Đây là hành động có ý
+thức sau khi đã được cảnh báo, khác hẳn với ghi đè tự động. Muốn chặn hẳn thì phải có giao diện
+hợp nhất thay đổi — ngoài phạm vi vòng này.
+
+Không chọn phương án idempotency key cho PATCH vì `request_log.kind` có CHECK constraint, thêm kind
+mới là phải thêm migration — chi phí lớn hơn giá trị ở bước này.
 
 **4. CCCD vào chỉ mục tra cứu với `kind = 'PENDING'`, bất kể ai gõ vào ô đó và ở lần gửi nào.**
 Từ V2, CCCD là **tùy chọn** với người dân. Trước quyết định này, `pendingIdentityHmacs` chỉ được
diff --git a/docs/brain/06-ai-working-log.md b/docs/brain/06-ai-working-log.md
index 6c35e32..6252381 100644
--- a/docs/brain/06-ai-working-log.md
+++ b/docs/brain/06-ai-working-log.md
@@ -15,8 +15,10 @@
   - migration `202607290001` bỏ `force row level security` (lệch mẫu 8 bảng còn lại, và có thể
     làm mọi insert số đo thất bại trong im lặng); hai chỗ nuốt lỗi đổi sang
     `reportUploadMetricFailure` — log một lần mỗi tiến trình, chỉ ghi mã lỗi Postgres;
-  - `saveDraft` trong wizard tự lấy lại snapshot và thử lại **một lần** khi PATCH trả 409;
-    `adoptServerDraft` trả `{draft, version}` thay vì boolean;
+  - `saveDraft` trong wizard tự lấy lại snapshot và thử lại khi PATCH trả 409, **chỉ khi**
+    `hasLocalChanges === false` (server đã có đúng nội dung định ghi). Bản sửa đầu thiếu điều kiện
+    này nên xung đột thật bị ghi đè im lặng — phát hiện ở vòng phản hồi của người dùng;
+    `adoptServerDraft` trả `{draft, version, hasLocalChanges}` thay vì boolean;
   - `appendUploadAttempt` có trần `MAX_UPLOAD_ATTEMPTS_PER_SUBMISSION = 200`;
   - `hasLocalChanges` so sánh sâu thay cho `JSON.stringify` (nhạy thứ tự khóa);
   - `listFolderFileIds` escape `folderId` bằng `escapeQueryValue` có sẵn;
diff --git a/src/app/ke-khai/wizard.tsx b/src/app/ke-khai/wizard.tsx
index e4a50ea..03cce3e 100644
--- a/src/app/ke-khai/wizard.tsx
+++ b/src/app/ke-khai/wizard.tsx
@@ -761,7 +761,7 @@ export function IntakeWizard({ assisted }: { assisted?: AssistedModeConfig } = {
   const adoptServerDraft = useCallback(
     async (options?: {
       localDraft?: IntakeDraft;
-    }): Promise<{ draft: IntakeDraft; version: number } | null> => {
+    }): Promise<{ draft: IntakeDraft; version: number; hasLocalChanges: boolean } | null> => {
       try {
         const response = await fetchApi("/api/public/submissions/current", { method: "GET" });
         if (!response.ok) {
@@ -821,7 +821,11 @@ export function IntakeWizard({ assisted }: { assisted?: AssistedModeConfig } = {
         setCertificatePhotos(
           applyCertMeta(restoredCertificates, restoredDraft.certificateFileMetadata),
         );
-        return { draft: restoredDraft, version: adopted.version };
+        return {
+          draft: restoredDraft,
+          version: adopted.version,
+          hasLocalChanges: adopted.hasLocalChanges,
+        };
       } catch {
         return null;
       }
@@ -836,38 +840,44 @@ export function IntakeWizard({ assisted }: { assisted?: AssistedModeConfig } = {
         return true;
       }
 
+      // Tính đúng MỘT lần: payload này vừa là thứ gửi đi, vừa là thứ đem so với snapshot máy chủ
+      // ở nhánh 409 bên dưới. Hai bên phải là cùng một object, nếu không phép so sánh vô nghĩa.
+      const payload = withCertificateMetadata(draftToSave, certificatePhotos);
+
       // `version` có thể là `null` khi chưa nhận được snapshot nào; máy chủ trả 409 và nhánh phục
       // hồi bên dưới lấy đúng version rồi thử lại, thay vì thất bại thẳng như trước.
-      const patch = (payload: IntakeDraft, version: number | null): Promise<Response> =>
+      const patch = (version: number | null): Promise<Response> =>
         fetchApi("/api/public/submissions/current", {
           method: "PATCH",
           headers: { "content-type": "application/json", "x-public-csrf-token": csrfToken },
-          body: JSON.stringify({
-            draft: withCertificateMetadata(payload, certificatePhotos),
-            version,
-          }),
+          body: JSON.stringify({ draft: payload, version }),
         });
 
       setSaveStatus("SAVING");
       try {
-        let response = await patch(draftToSave, serverVersion);
+        let response = await patch(serverVersion);
 
         /*
-         * 409 = version trên máy chủ khác version trên máy. Máy chủ kiểm khớp TUYỆT ĐỐI, nên
-         * nguyên nhân thường gặp nhất KHÔNG phải "hai thiết bị cùng sửa" mà là: một lần PATCH đã
-         * ghi xong nhưng response rơi mất trên mạng yếu — lần thử lại gửi đúng version cũ và bị
-         * từ chối. Trước đây người dân kẹt luôn ở bước đó, kèm một thông báo sai sự thật.
+         * 409 = version trên máy chủ khác version trên máy. Có ĐÚNG HAI nguyên nhân, và chúng đòi
+         * hai cách xử lý ngược nhau — gộp chung là ghi đè mất dữ liệu:
+         *
+         *   (1) Lần PATCH trước đã ghi xong nhưng response rơi mất trên mạng yếu. Máy chủ đang giữ
+         *       CHÍNH nội dung ta định ghi, chỉ khác mỗi số version. Thử lại là vô hại.
+         *   (2) Một thiết bị khác đã sửa thật. Máy chủ đang giữ dữ liệu ta CHƯA từng thấy. Thử lại
+         *       với version mới sẽ **ghi đè mất** thay đổi của thiết bị kia, im lặng.
+         *
+         * Phân biệt bằng `hasLocalChanges` của snapshot vừa lấy về: nó so sánh sâu bản gộp
+         * (local đè lên server) với chính bản server.
+         *   - `false` → gộp xong không khác gì server → server đã có đúng thứ ta muốn ghi → (1).
+         *   - `true`  → server đang giữ thứ khác → không phân biệt được (1) với (2) → coi như (2).
          *
-         * Xử lý: lấy lại snapshot máy chủ, gộp dữ liệu đang có trên máy lên trên (chính
-         * `adoptServerDraftSnapshot` với `localDraft`), rồi thử lại đúng MỘT lần. Trường hợp mất
-         * response tự gỡ được vì snapshot mới chính là thứ vừa ghi. Nếu thật sự có thiết bị thứ
-         * hai đang sửa thì lần hai vẫn 409 và thông báo gốc được hiển thị — không nuốt lỗi thật,
-         * cũng không lặp vô hạn.
+         * Chỉ thử lại ở nhánh (1). Nhánh (2) để nguyên 409 rơi xuống dưới và người dân đọc đúng
+         * thông báo "đang mở ở một thiết bị khác" — thà bắt họ tải lại còn hơn ghi đè âm thầm.
          */
         if (response.status === 409) {
-          const adopted = await adoptServerDraft({ localDraft: draftToSave });
-          if (adopted) {
-            response = await patch(adopted.draft, adopted.version);
+          const adopted = await adoptServerDraft({ localDraft: payload });
+          if (adopted && !adopted.hasLocalChanges) {
+            response = await patch(adopted.version);
           }
         }
 
diff --git a/tests/pr6-review-round-two.test.ts b/tests/pr6-review-round-two.test.ts
index 5ed2022..c07b92c 100644
--- a/tests/pr6-review-round-two.test.ts
+++ b/tests/pr6-review-round-two.test.ts
@@ -12,6 +12,7 @@ import { fileURLToPath } from "node:url";
 import { describe, expect, it } from "vitest";
 
 import { adoptServerDraftSnapshot } from "@/modules/public-intake/draft-adoption";
+import type { IntakeDraft } from "@/modules/public-intake/types";
 import { emptyDraft } from "@/modules/public-intake/types";
 import {
   reportUploadMetricFailure,
@@ -124,19 +125,37 @@ describe("PATCH nháp: 409 giả trên mạng yếu phải tự gỡ", () => {
       wizard.indexOf("const flushDraft = useCallback"),
     );
     expect(saveDraft).toContain("if (response.status === 409)");
-    expect(saveDraft).toContain("adoptServerDraft({ localDraft: draftToSave })");
-    expect(saveDraft).toContain("response = await patch(adopted.draft, adopted.version)");
+    expect(saveDraft).toContain("adoptServerDraft({ localDraft: payload })");
+    expect(saveDraft).toContain("response = await patch(adopted.version)");
   });
 
-  it("chỉ thử lại đúng một lần — 409 thật vẫn nổi lên", () => {
+  it("chỉ thử lại khi máy chủ ĐÃ có đúng nội dung định ghi", () => {
+    /*
+     * Đây là hàng rào chống ghi đè. Bỏ điều kiện `!adopted.hasLocalChanges` thì lần thử lại dùng
+     * version vừa fetch nên LUÔN thành công — kể cả khi 409 đến từ một thiết bị khác đang sửa
+     * thật, và thay đổi của thiết bị kia biến mất im lặng.
+     */
     const saveDraft = wizard.slice(
       wizard.indexOf("const saveDraft = useCallback"),
       wizard.indexOf("const flushDraft = useCallback"),
     );
+    expect(saveDraft).toContain("if (adopted && !adopted.hasLocalChanges)");
     expect(saveDraft.match(/response\.status === 409/g)).toHaveLength(1);
     expect(saveDraft).toContain("if (!response.ok)");
   });
 
+  it("payload gửi đi và payload đem so sánh là cùng một object", () => {
+    // So `draftToSave` (chưa gắn metadata ảnh GCN) với snapshot máy chủ (đã có) sẽ luôn ra
+    // "khác nhau", làm nhánh tự phục hồi không bao giờ chạy.
+    const saveDraft = wizard.slice(
+      wizard.indexOf("const saveDraft = useCallback"),
+      wizard.indexOf("const flushDraft = useCallback"),
+    );
+    expect(saveDraft).toContain("const payload = withCertificateMetadata(draftToSave");
+    expect(saveDraft).toContain("adoptServerDraft({ localDraft: payload })");
+    expect(saveDraft).toContain("body: JSON.stringify({ draft: payload, version })");
+  });
+
   it("adoptServerDraft trả version ra ngoài, không chỉ gọi setState", () => {
     // `setServerVersion` là state setter: giá trị mới không thấy được trong cùng closure, nên
     // version phải đi ra theo đường trả về thì `saveDraft` mới thử lại đúng được.
@@ -144,7 +163,69 @@ describe("PATCH nháp: 409 giả trên mạng yếu phải tự gỡ", () => {
       wizard.indexOf("const adoptServerDraft = useCallback"),
       wizard.indexOf("const saveDraft = useCallback"),
     );
-    expect(adopt).toContain("return { draft: restoredDraft, version: adopted.version };");
+    expect(adopt).toContain("version: adopted.version,");
+    expect(adopt).toContain("hasLocalChanges: adopted.hasLocalChanges,");
+  });
+});
+
+describe("Quy tắc quyết định của nhánh 409 — hai tình huống, hai kết quả ngược nhau", () => {
+  /*
+   * `hasLocalChanges` là TOÀN BỘ căn cứ để wizard quyết định có thử lại PATCH hay không. Hai test
+   * dưới đây kiểm chính quy tắc đó bằng dữ liệu thật, không đọc mã nguồn — vì đây là chỗ mà một
+   * lỗi sẽ làm mất dữ liệu của người dân chứ không chỉ làm đỏ CI.
+   */
+  const seed = (): IntakeDraft => {
+    const draft = emptyDraft("owner-1", "parcel-1", "landuse-1");
+    draft.phone = "0912345678";
+    draft.owners[0].fullName = "Nguyễn Văn A";
+    return draft;
+  };
+
+  it("TÌNH HUỐNG 1 — PATCH đã commit, response rơi mất: cho phép thử lại", () => {
+    // Máy chủ đang giữ CHÍNH nội dung ta vừa gửi; chỉ số version là khác.
+    const sent = seed();
+    const serverDraft = structuredClone(sent);
+
+    const adopted = adoptServerDraftSnapshot({
+      serverDraft,
+      serverVersion: 7,
+      localDraft: sent,
+    });
+
+    expect(adopted?.hasLocalChanges).toBe(false);
+    expect(adopted?.version).toBe(7);
+  });
+
+  it("TÌNH HUỐNG 2 — thiết bị khác đã sửa: KHÔNG được thử lại", () => {
+    // Máy chủ giữ tên do thiết bị B nhập; máy ta giữ tên khác. Thử lại là xóa mất dữ liệu của B.
+    const local = seed();
+    local.owners[0].fullName = "Nguyễn Văn A";
+    const serverDraft = seed();
+    serverDraft.owners[0].fullName = "Trần Thị B";
+
+    const adopted = adoptServerDraftSnapshot({
+      serverDraft,
+      serverVersion: 9,
+      localDraft: local,
+    });
+
+    expect(adopted?.hasLocalChanges).toBe(true);
+  });
+
+  it("TÌNH HUỐNG 2b — thiết bị khác thêm dữ liệu ở trường ta để trống: vẫn là xung đột", () => {
+    // Trường hợp dễ lọt nhất: `{...server, ...local}` giữ chuỗi rỗng của local đè lên dữ liệu của
+    // server. Nếu quy tắc báo "không có thay đổi" ở đây thì ta sẽ xóa trắng ô cán bộ vừa điền.
+    const local = seed();
+    const serverDraft = seed();
+    serverDraft.certificate.issueNumber = "CG 123456";
+
+    const adopted = adoptServerDraftSnapshot({
+      serverDraft,
+      serverVersion: 4,
+      localDraft: local,
+    });
+
+    expect(adopted?.hasLocalChanges).toBe(true);
   });
 });
 
diff --git a/tests/pr6-review-round-two.test.ts b/tests/pr6-review-round-two.test.ts
new file mode 100644
index 0000000..c07b92c
--- /dev/null
+++ b/tests/pr6-review-round-two.test.ts
@@ -0,0 +1,346 @@
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
+import type { IntakeDraft } from "@/modules/public-intake/types";
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
+    expect(saveDraft).toContain("adoptServerDraft({ localDraft: payload })");
+    expect(saveDraft).toContain("response = await patch(adopted.version)");
+  });
+
+  it("chỉ thử lại khi máy chủ ĐÃ có đúng nội dung định ghi", () => {
+    /*
+     * Đây là hàng rào chống ghi đè. Bỏ điều kiện `!adopted.hasLocalChanges` thì lần thử lại dùng
+     * version vừa fetch nên LUÔN thành công — kể cả khi 409 đến từ một thiết bị khác đang sửa
+     * thật, và thay đổi của thiết bị kia biến mất im lặng.
+     */
+    const saveDraft = wizard.slice(
+      wizard.indexOf("const saveDraft = useCallback"),
+      wizard.indexOf("const flushDraft = useCallback"),
+    );
+    expect(saveDraft).toContain("if (adopted && !adopted.hasLocalChanges)");
+    expect(saveDraft.match(/response\.status === 409/g)).toHaveLength(1);
+    expect(saveDraft).toContain("if (!response.ok)");
+  });
+
+  it("payload gửi đi và payload đem so sánh là cùng một object", () => {
+    // So `draftToSave` (chưa gắn metadata ảnh GCN) với snapshot máy chủ (đã có) sẽ luôn ra
+    // "khác nhau", làm nhánh tự phục hồi không bao giờ chạy.
+    const saveDraft = wizard.slice(
+      wizard.indexOf("const saveDraft = useCallback"),
+      wizard.indexOf("const flushDraft = useCallback"),
+    );
+    expect(saveDraft).toContain("const payload = withCertificateMetadata(draftToSave");
+    expect(saveDraft).toContain("adoptServerDraft({ localDraft: payload })");
+    expect(saveDraft).toContain("body: JSON.stringify({ draft: payload, version })");
+  });
+
+  it("adoptServerDraft trả version ra ngoài, không chỉ gọi setState", () => {
+    // `setServerVersion` là state setter: giá trị mới không thấy được trong cùng closure, nên
+    // version phải đi ra theo đường trả về thì `saveDraft` mới thử lại đúng được.
+    const adopt = wizard.slice(
+      wizard.indexOf("const adoptServerDraft = useCallback"),
+      wizard.indexOf("const saveDraft = useCallback"),
+    );
+    expect(adopt).toContain("version: adopted.version,");
+    expect(adopt).toContain("hasLocalChanges: adopted.hasLocalChanges,");
+  });
+});
+
+describe("Quy tắc quyết định của nhánh 409 — hai tình huống, hai kết quả ngược nhau", () => {
+  /*
+   * `hasLocalChanges` là TOÀN BỘ căn cứ để wizard quyết định có thử lại PATCH hay không. Hai test
+   * dưới đây kiểm chính quy tắc đó bằng dữ liệu thật, không đọc mã nguồn — vì đây là chỗ mà một
+   * lỗi sẽ làm mất dữ liệu của người dân chứ không chỉ làm đỏ CI.
+   */
+  const seed = (): IntakeDraft => {
+    const draft = emptyDraft("owner-1", "parcel-1", "landuse-1");
+    draft.phone = "0912345678";
+    draft.owners[0].fullName = "Nguyễn Văn A";
+    return draft;
+  };
+
+  it("TÌNH HUỐNG 1 — PATCH đã commit, response rơi mất: cho phép thử lại", () => {
+    // Máy chủ đang giữ CHÍNH nội dung ta vừa gửi; chỉ số version là khác.
+    const sent = seed();
+    const serverDraft = structuredClone(sent);
+
+    const adopted = adoptServerDraftSnapshot({
+      serverDraft,
+      serverVersion: 7,
+      localDraft: sent,
+    });
+
+    expect(adopted?.hasLocalChanges).toBe(false);
+    expect(adopted?.version).toBe(7);
+  });
+
+  it("TÌNH HUỐNG 2 — thiết bị khác đã sửa: KHÔNG được thử lại", () => {
+    // Máy chủ giữ tên do thiết bị B nhập; máy ta giữ tên khác. Thử lại là xóa mất dữ liệu của B.
+    const local = seed();
+    local.owners[0].fullName = "Nguyễn Văn A";
+    const serverDraft = seed();
+    serverDraft.owners[0].fullName = "Trần Thị B";
+
+    const adopted = adoptServerDraftSnapshot({
+      serverDraft,
+      serverVersion: 9,
+      localDraft: local,
+    });
+
+    expect(adopted?.hasLocalChanges).toBe(true);
+  });
+
+  it("TÌNH HUỐNG 2b — thiết bị khác thêm dữ liệu ở trường ta để trống: vẫn là xung đột", () => {
+    // Trường hợp dễ lọt nhất: `{...server, ...local}` giữ chuỗi rỗng của local đè lên dữ liệu của
+    // server. Nếu quy tắc báo "không có thay đổi" ở đây thì ta sẽ xóa trắng ô cán bộ vừa điền.
+    const local = seed();
+    const serverDraft = seed();
+    serverDraft.certificate.issueNumber = "CG 123456";
+
+    const adopted = adoptServerDraftSnapshot({
+      serverDraft,
+      serverVersion: 4,
+      localDraft: local,
+    });
+
+    expect(adopted?.hasLocalChanges).toBe(true);
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
