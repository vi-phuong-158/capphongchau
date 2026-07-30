# CHATGPT HANDOFF REPORT

> Báo cáo này **thay thế** báo cáo Đợt 2A–2C của PR #11. Nội dung các đợt trước được giữ nguyên ở
> `docs/brain/06-ai-working-log.md` và trong lịch sử commit của nhánh
> `claude/redesign-document-review-screen-tfuvov` — không mất gì.

## 1. Report metadata

- **Project:** Hệ thống thu thập và kiểm tra nhanh hồ sơ đất đai Phường Phong Châu (`land-ocr-180`)
- **Repository:** `vi-phuong-158/capphongchau`
- **Generated at:** 2026-07-30
- **Agent:** Claude Code (`claude-opus-5`)
- **Task:** Xử lý toàn bộ 7 phát hiện của vòng review PR #11 (`REQUEST CHANGES`), gồm việc gộp `main`
  vào nội dung PR và giải xung đột.
- **Status:** `READY_FOR_REVIEW`
- **Source plan:** Kết luận review PR #11 do người dùng cung cấp (7 phát hiện + 7 điều kiện duyệt).
- **Source acceptance criteria:** mục "Điều kiện để PR được duyệt" trong kết luận review đó.
- **Source security constraints:** `docs/brain/02-coding-rules.md`, `AGENTS.md`, `CLAUDE.md`.

---

## 2. Git identity

- **Current branch:** `claude/pr-11-review-issues-e1qykd`
- **Remote:** `origin` → `vi-phuong-158/capphongchau`
- **Base commit before work:** `bdd3610eb0795c8af230e0333bdab60bacd852cd` (= `origin/main` lúc bắt
  đầu)
- **Nội dung PR #11 được merge vào:** `e34dc83b646d777f18cbbad3ce562516d2ac325e`
  (`origin/claude/redesign-document-review-screen-tfuvov`, 15 commit)
- **Head commit after work:** commit của đợt này trên `claude/pr-11-review-issues-e1qykd` (một merge
  commit mang nội dung PR + phần sửa theo review).
- **Working tree state:** sạch sau commit.
- **User changes detected before work:** không có (`git status --short` rỗng lúc bắt đầu).
- **User changes preserved:** không có gì bị ghi đè.

### Vì sao làm trên nhánh mới thay vì đẩy tiếp lên nhánh PR

GitHub báo PR #11 `mergeable_state: dirty`; nhánh PR chậm `main` 8 commit và xung đột ở 12 tệp lõi.
Nhánh này dựng từ `main` mới nhất rồi **merge nội dung PR vào**, nên `main` là nền: mọi thứ vừa merge
vào `main` (lazy Drive folder Phase 3, hiệu năng chi tiết Phase 2, benchmark Phase 4) được giữ nguyên
chứ không bị bản cũ hơn của PR ghi đè — đúng cảnh báo ở phát hiện #5 của review.

### Git status

```text
On branch claude/pr-11-review-issues-e1qykd
nothing to commit, working tree clean
```

### Diff statistics

`git diff --stat origin/main...HEAD` — **63 tệp, +7990 / −996**:

```text
 AGENTS.md                                          |    8 +-
 CHATGPT_HANDOFF.md                                 | 1083 +++++++++++---------
 docs/brain/01-architecture.md                      |  276 ++++-
 docs/brain/03-decisions.md                         |  363 +++++++
 docs/brain/04-current-tasks.md                     |  100 ++
 docs/brain/06-ai-working-log.md                    |  497 +++++++++
 .../PUBLIC_INTAKE_V2_MIGRATIONS_002_006_RUNBOOK.md |  342 +++++++
 scripts/preflight-public-intake-v2-migrations.ts   |   14 +
 .../submissions/current/files/[fileId]/route.ts    |    4 +-
 src/app/api/public/submissions/current/route.ts    |    4 +
 .../api/public/submissions/current/submit/route.ts |   11 +
 .../submissions/current/uploads/complete/route.ts  |   36 +-
 .../submissions/current/uploads/initiate/route.ts  |    8 +-
 .../api/submissions/[submissionId]/action/route.ts |   67 +-
 .../[submissionId]/files/[fileId]/route.ts         |  216 +++-
 .../[submissionId]/internal-notes/route.ts         |  149 +++
 src/app/api/submissions/[submissionId]/route.ts    |   79 +-
 .../[submissionId]/uploads/complete/route.ts       |  262 +++++
 .../[submissionId]/uploads/initiate/route.ts       |  286 ++++++
 src/app/submissions/[submissionId]/page.tsx        |   52 +-
 src/app/tra-cuu/public-lookup.tsx                  |   11 +-
 src/components/admin/ai-draft-panel.tsx            |  114 ++-
 src/components/admin/document-viewer.tsx           |  349 ++++++-
 src/components/admin/officer-file-upload.tsx       |  278 +++++
 src/components/admin/submission-claim-banner.tsx   |   80 +-
 src/components/submission-detail.tsx               |  561 +++++-----
 src/components/submissions-queue.tsx               |   15 +-
 src/modules/public-intake/repository.ts            |  515 +++++++++-
 src/modules/public-intake/route-context.ts         |   27 +-
 src/modules/public-intake/upload-commit.ts         |   57 ++
 src/modules/submissions/detail-types.ts            |   18 +-
 src/modules/submissions/detail.ts                  |   16 +
 src/modules/submissions/review.ts                  |   39 +-
 src/proxy.ts                                       |   11 +-
 .../202607290006_submission_internal_notes.sql     |    7 +
 tests/citizen-submit-validation.test.ts            |    1 +
 tests/completion-checks.test.ts                    |    1 +
 tests/exports-route.test.ts                        |    1 +
 tests/manual-identity-confirmation-route.test.ts   |    1 +
 tests/officer-file-delete.test.ts                  |  233 +++++
 tests/officer-file-mutations.integration.test.ts   |  516 ++++++++++
 tests/officer-file-reassign-owner.test.ts          |  250 +++++
 tests/officer-file-upload.test.ts                  |  655 ++++++++++++
 tests/payload-layers.test.ts                       |    1 +
 tests/pl3-export-large-certificate.test.ts         |    1 +
 tests/pl3-export.test.ts                           |    1 +
 tests/proxy-no-store.test.ts                       |   72 ++
 tests/public-resubmit-blocked-when-claimed.test.ts |   96 ++
 tests/public-submit-officer-priority-route.test.ts |  136 +++
 tests/public-upload-complete-route.test.ts         |   19 +-
 ...g-rehearsal-acceptance-saga.integration.test.ts |   21 +
 tests/submission-acceptance.test.ts                |    1 +
 ...sion-action-request-supplement-disabled.test.ts |  131 +++
 tests/submission-claim.test.ts                     |    7 +-
 tests/submission-detail-load.test.ts               |  203 ++++
 tests/submission-detail-page.test.ts               |  134 +++
 tests/submission-detail-performance.test.ts        |   55 +-
 tests/submission-file-single-query.test.ts         |  109 ++
 tests/submission-internal-notes.test.ts            |  185 ++++
 tests/submission-patch-staff-edit-closed.test.ts   |  174 ++++
 tests/submission-review.test.ts                    |    4 +-
 tests/upload-metrics.test.ts                       |   22 +-
 tests/working-payload.test.ts                      |    1 +
 63 files changed, 7990 insertions(+), 996 deletions(-)
```

### Name status

```text
M	AGENTS.md
M	CHATGPT_HANDOFF.md
M	docs/brain/01-architecture.md
M	docs/brain/03-decisions.md
M	docs/brain/04-current-tasks.md
M	docs/brain/06-ai-working-log.md
A	evidence/PUBLIC_INTAKE_V2_MIGRATIONS_002_006_RUNBOOK.md
M	scripts/preflight-public-intake-v2-migrations.ts
M	src/app/api/public/submissions/current/files/[fileId]/route.ts
M	src/app/api/public/submissions/current/route.ts
M	src/app/api/public/submissions/current/submit/route.ts
M	src/app/api/public/submissions/current/uploads/complete/route.ts
M	src/app/api/public/submissions/current/uploads/initiate/route.ts
M	src/app/api/submissions/[submissionId]/action/route.ts
M	src/app/api/submissions/[submissionId]/files/[fileId]/route.ts
A	src/app/api/submissions/[submissionId]/internal-notes/route.ts
M	src/app/api/submissions/[submissionId]/route.ts
A	src/app/api/submissions/[submissionId]/uploads/complete/route.ts
A	src/app/api/submissions/[submissionId]/uploads/initiate/route.ts
M	src/app/submissions/[submissionId]/page.tsx
M	src/app/tra-cuu/public-lookup.tsx
M	src/components/admin/ai-draft-panel.tsx
M	src/components/admin/document-viewer.tsx
A	src/components/admin/officer-file-upload.tsx
M	src/components/admin/submission-claim-banner.tsx
M	src/components/submission-detail.tsx
M	src/components/submissions-queue.tsx
M	src/modules/public-intake/repository.ts
M	src/modules/public-intake/route-context.ts
A	src/modules/public-intake/upload-commit.ts
M	src/modules/submissions/detail-types.ts
M	src/modules/submissions/detail.ts
M	src/modules/submissions/review.ts
M	src/proxy.ts
A	supabase/migrations/202607290006_submission_internal_notes.sql
A	tests/officer-file-delete.test.ts
A	tests/officer-file-mutations.integration.test.ts
A	tests/officer-file-reassign-owner.test.ts
A	tests/officer-file-upload.test.ts
A	tests/proxy-no-store.test.ts
A	tests/public-resubmit-blocked-when-claimed.test.ts
A	tests/public-submit-officer-priority-route.test.ts
M	tests/staging-rehearsal-acceptance-saga.integration.test.ts
A	tests/submission-action-request-supplement-disabled.test.ts
A	tests/submission-detail-load.test.ts
A	tests/submission-detail-page.test.ts
M	tests/submission-detail-performance.test.ts
A	tests/submission-file-single-query.test.ts
A	tests/submission-internal-notes.test.ts
A	tests/submission-patch-staff-edit-closed.test.ts
M	tests/citizen-submit-validation.test.ts
M	tests/completion-checks.test.ts
M	tests/exports-route.test.ts
M	tests/manual-identity-confirmation-route.test.ts
M	tests/payload-layers.test.ts
M	tests/pl3-export-large-certificate.test.ts
M	tests/pl3-export.test.ts
M	tests/public-upload-complete-route.test.ts
M	tests/submission-acceptance.test.ts
M	tests/submission-claim.test.ts
M	tests/submission-review.test.ts
M	tests/upload-metrics.test.ts
M	tests/working-payload.test.ts
```

**Không có trong diff vì đã bị gỡ khỏi nội dung PR:**
`src/modules/submissions/detail-view.ts` và
`supabase/migrations/202607290005_submission_internal_notes.sql` (đổi tên thành `...290006_...`).

---

## 3. Executive summary

**Vấn đề:** Review PR #11 kết luận `REQUEST CHANGES` với 7 phát hiện, hai cái nghiêm trọng nhất là
(a) hai nhánh cấp **cùng số hiệu migration `202607290005`** cho hai nội dung khác nhau, và (b) thao
tác ảnh của cán bộ **không nguyên tử** — dữ liệu commit trước, audit ghi sau, quyền kiểm ở route rồi
mới mở transaction.

**Phương án đã thực hiện:**

1. Dựng nhánh từ `main` mới nhất, merge nội dung PR vào, giải 12 tệp xung đột theo hướng "giữ tối ưu
   của `main`, giữ chức năng của PR".
2. `202607290005` giữ cho lazy Drive folder của `main`; ghi chú nội bộ đổi sang `202607290006`.
   Preflight kiểm cả hai; runbook đổi tên và phủ `002`–`006`, kèm quy trình sửa lịch sử migration cho
   database đã áp số cũ.
3. Ba **repository method nghiệp vụ** mới gói quyền + trạng thái + trần + cập nhật ảnh +
   `file_summary_json` + audit + `request_log` vào **một** transaction, khóa hàng
   `public_submissions` `FOR UPDATE` trước tiên.
4. Đường cán bộ đi qua `ensureSubmissionFolderReady` (lazy Drive folder), trả 503 + `Retry-After`.
5. Gỡ `detail-view.ts`; giữ `detail.ts`/`detail-types.ts` của `main` và bổ sung `internalNotes`.
6. Ba bộ test route Đợt 2C viết lại thành **test hành vi**; thêm integration test Postgres thật cho
   tính nguyên tử.
7. "Từ chối" chuyển vào menu `⋯ Thao tác khác`.

**Kết quả:** typecheck 0 lỗi; lint 0 error (5 warning baseline của `main`); `npx vitest run`
**800 pass / 24 skip / 0 fail**; `npm run build` thành công.

**Nội dung chưa hoàn thành:** integration test transaction **chưa chạy** (thiếu Postgres thử nghiệm);
migration `202607290002`–`006` **chưa áp** lên database nào; **chưa** smoke test Preview có đăng nhập;
**chưa** chạy `npm run test:e2e:preview`.

**Trạng thái đề xuất:** `READY_FOR_CHATGPT_REVIEW`.

---

## 4. Baseline before changes

Baseline lấy trên `origin/main` (`bdd3610`) — nền của nhánh này. Nội dung PR #11 merge vào sau, nên
"lỗi baseline" và "lỗi do merge" phân biệt được.

| Check | Command | Result | Evidence |
| --- | --- | --- | --- |
| Unit tests | `npx vitest run` | Không chạy riêng trên `main` trước merge | Thay vào đó dùng typecheck ngay sau merge làm ranh giới an toàn — xem bảng dưới |
| Integration tests | `npx vitest run tests/*.integration.test.ts` | SKIP (thiếu `ACCEPTANCE_SAGA_TEST_DATABASE_URL`) | Cơ chế skip có sẵn trong repo |
| E2E tests | `npm run test:e2e:preview` | KHÔNG CHẠY | Cần Preview + Supabase + Drive + tài khoản cán bộ thật |
| Build | `npm run build` | Không chạy riêng trước merge | — |
| Lint | `npm run lint` | 0 error, 5 warning | 5 warning ở `scripts/add-system-admins.ts` và `tests/staging-rehearsal-scenarios.test.ts`, **không** liên quan đợt này; giữ y nguyên sau khi sửa |
| Typecheck | `npx tsc -p tsconfig.typecheck.json --noEmit` | **4 lỗi ngay sau merge** | Bảng dưới — đây là bằng chứng trực tiếp cho phát hiện #4 và #5 của review |

### 4 lỗi typecheck ngay sau khi merge, trước khi sửa

```text
src/app/api/submissions/[submissionId]/uploads/complete/route.ts(182,9): error TS2322:
  Type 'string | null' is not assignable to type 'string'.
src/app/api/submissions/[submissionId]/uploads/initiate/route.ts(223,7): error TS2322:
  Type 'string | null' is not assignable to type 'string'.
tests/submission-detail-page.test.ts(4,43): error TS2307:
  Cannot find module '@/modules/submissions/detail-view'
tests/submission-detail-view.test.ts(19,47): error TS2307:
  Cannot find module '@/modules/submissions/detail-view'
```

Hai lỗi đầu **xác nhận phát hiện P1 số 4**: `record.driveFolderId` đã là `string | null` trên `main`
và đường cán bộ truyền thẳng nó vào Drive. Hai lỗi sau là hệ quả của việc gỡ `detail-view.ts` theo
phát hiện P2 số 5.

Ngoài ra `tests/migration-versions.test.ts` (đã có sẵn trong repo) **đỏ** trên bản merge chưa sửa —
đúng trip-wire cho phát hiện P0 số 1.

---

## 5. Scope

### In scope

- 7 phát hiện của review PR #11 và 7 "Điều kiện để PR được duyệt".
- Giải xung đột merge giữa `main` và nội dung PR #11.
- Cập nhật `docs/brain/01,03,04,06`, `AGENTS.md`, runbook migration.

### Out of scope

- **Đường tải ảnh công khai của người dân.** Trần ảnh/dung lượng vẫn chỉ kiểm ở `initiate`;
  `appendFile` không khóa hàng hồ sơ. Lỗi này **có từ trước** PR #11 (tồn tại trên `main` hôm nay) và
  nằm ngoài phạm vi PR — ghi rõ ở `03-decisions.md` và mục 15 để không bị coi là đã đóng.
- Mở thao tác ảnh cho hồ sơ `ACCEPTED` (cần chính sách riêng qua `mayAmendOfficialRecord`).
- Test render UI cho `OfficerFileUpload`/`DocumentViewer` (cần devDependency
  `@testing-library/react` + `jsdom` — thay đổi stack, phải duyệt riêng).
- Thực thi migration, deploy, merge PR.

### Deviations from approved plan

- **Phát hiện #5 được mở rộng sang `document-viewer.tsx`.** Review chỉ nói về service đọc chi tiết.
  Nhưng khi so hai bản viewer thì bản PR **bỏ mất** cửa "bấm Xem ảnh mới tải" của `main` (thay bằng tự
  tải ảnh đang chọn khi mở hồ sơ) — đúng loại mất tối ưu mà review cảnh báo. Bản đã gộp giữ **cả
  hai**: cache blob của PR (một object URL cho khung nhỏ + toàn màn hình, không tải hai lần) và cửa
  click-để-tải của `main` (mở hồ sơ không kéo byte ảnh nào).
- **Phát hiện #6 không xóa hết test đọc chuỗi mã nguồn.** Ba bộ test route đã thành test hành vi.
  Nhưng hai hợp đồng **liên tệp** (`submission-detail-performance`, vị trí nút Từ chối) vẫn đọc mã
  nguồn: đó là quan hệ giữa nhiều tệp, không quan sát được qua API. Lý do ghi ở `03-decisions.md`.
- **Menu `⋯ Thao tác khác` mở rộng điều kiện hiển thị.** Trước chỉ hiện ở `ACCEPTED`; nay hiện cả ở
  `UNDER_REVIEW` để chứa nút "Từ chối". Đây là hệ quả bắt buộc của phát hiện #7.

---

## 6. Decisions implemented

| Decision | Implementation | Evidence |
| --- | --- | --- |
| `202607290005` giữ cho lazy Drive folder; internal notes → `202607290006` | `git mv` migration + comment lý do; preflight kiểm cả hai; runbook đổi tên + phủ `002`–`006` | `supabase/migrations/202607290006_submission_internal_notes.sql`; `scripts/preflight-public-intake-v2-migrations.ts`; `evidence/PUBLIC_INTAKE_V2_MIGRATIONS_002_006_RUNBOOK.md` |
| Runbook phải xử lý được database đã ghi `005` cho nội dung cũ | Mục 0 thêm truy vấn `supabase_migrations.schema_migrations` + hai truy vấn phân biệt schema + SQL sửa lịch sử **không xóa cột** | Runbook mục 0 |
| Mutation ảnh + audit + idempotency cùng transaction | 3 method mới trong repository | `repository.ts`: `commitOfficerFileUpload`, `commitOfficerFileDelete`, `commitOfficerFileOwnerReassign` |
| Kiểm lại quyền/trạng thái trong transaction, sau khi khóa hồ sơ | `lockSubmissionForStaffEdit` (`for update` + `mayStaffEditState`) | `repository.ts`; `review.ts` |
| Trần ảnh/dung lượng kiểm lại bằng dữ liệu thật trong transaction | `lockActiveFiles` + đếm lại; dung lượng dùng `verified.sizeBytes` | `repository.ts` (`commitOfficerFileUpload`) |
| Một định nghĩa duy nhất cho luật "được sửa hồ sơ" | `mayStaffEdit` chỉ gọi lại `mayStaffEditState` | `review.ts` |
| Đường cán bộ tương thích lazy Drive folder | `ensureSubmissionFolderReady` + 503 + `Retry-After` ở cả `initiate` và `complete` | hai route `uploads/*` |
| Không dọn tệp khi chưa xác nhận được thư mục hồ sơ | Nhánh 503 của `complete` **không** gọi `discardIfOrphan` | `uploads/complete/route.ts`; test tương ứng |
| Một service đọc chi tiết, giữ `Promise.all` + `Server-Timing` | Gỡ `detail-view.ts`; `internalNotes` vào `StaffSubmissionDetail` | `detail.ts`, `detail-types.ts`; `submission-detail-load.test.ts` |
| Ảnh chỉ tải khi cán bộ bấm | `revealedFileIds` + nút "Xem ảnh"; nút toàn màn hình `disabled` khi chưa tải | `document-viewer.tsx` |
| Test hành vi thay test đọc chuỗi | 3 bộ test viết lại + 1 integration test | `tests/officer-file-*.test.ts` |
| "Từ chối" vào menu phụ, giữ xác nhận | Menu `⋯ Thao tác khác` hiện cả ở `UNDER_REVIEW` | `submission-detail.tsx`; test placement |

---

## 7. Changed files

Chỉ liệt kê tệp **do đợt review này sửa**. Các tệp còn lại trong diff là nội dung PR #11 được merge
nguyên trạng (đã review ở vòng trước).

| File | Change type | Symbols/routes/components affected | Purpose | Risk |
| --- | --- | --- | --- | --- |
| `supabase/migrations/202607290006_submission_internal_notes.sql` | Added (rename từ `...290005_...`) | cột `public_submissions.internal_notes` | Giải xung đột số hiệu migration | **Trung bình** — database đã áp bản `005` cũ cần sửa lịch sử theo runbook mục 0 |
| `scripts/preflight-public-intake-v2-migrations.ts` | Modified | thêm block kiểm `internal_notes` (`006`), giữ block `drive_folder_*` (`005`) | Gate deploy kiểm cả hai migration | Thấp |
| `evidence/PUBLIC_INTAKE_V2_MIGRATIONS_002_006_RUNBOOK.md` | Added (rename từ `..._002_005_...`) | — | Runbook 5 migration + xử lý lịch sử số hiệu | Thấp (tài liệu) |
| `src/modules/submissions/review.ts` | Modified | **thêm** `mayStaffEditState`; `mayStaffEdit` gọi lại nó | Một định nghĩa quyền cho route + repository | Thấp — `mayStaffEdit` giữ nguyên hành vi |
| `src/modules/public-intake/repository.ts` | Modified | **thêm** `lockSubmissionForStaffEdit`, `lockActiveFiles`, `commitOfficerFileUpload`, `commitOfficerFileDelete`, `commitOfficerFileOwnerReassign`, `OfficerFileMutationRejectedError`, `OfficerFileRejectionReason`; **gỡ** `reassignFileOwner` và tham số `kind` của `appendFile` | Nguyên tử hóa 3 thao tác ảnh | **Cao** — đường ghi dữ liệu thật; trọng tâm cần review |
| `src/app/api/submissions/[submissionId]/uploads/initiate/route.ts` | Modified | `POST`; thêm `ensureSubmissionFolderReady`, `SERVICE_UNAVAILABLE`, `Retry-After` | Tương thích lazy Drive folder | Trung bình |
| `src/app/api/submissions/[submissionId]/uploads/complete/route.ts` | Modified | `POST`; dùng `commitOfficerFileUpload`, bảng `REJECTION_HTTP`, lazy folder trước `verifyUploadedFile`; **gỡ** nhánh `findStoredMutation` ngoài transaction | Nguyên tử + lazy folder | **Cao** |
| `src/app/api/submissions/[submissionId]/files/[fileId]/route.ts` | Modified | `DELETE`, `PATCH` dùng 2 method transaction mới; `GET` giữ `findActiveFile` + `Server-Timing` của `main` | Nguyên tử + giữ tối ưu `main` | **Cao** |
| `src/modules/public-intake/upload-commit.ts` | Modified (tệp mới của PR) | `discardIfOrphan` nhận `driveFolderId: string \| null` | Lazy Drive folder | Thấp — thêm guard, nghiêng về **không xóa** |
| `src/modules/submissions/detail-types.ts` | Modified | `StaffSubmissionDetail` + `internalNotes`, siết `PublicStatus`/`IntakeChannel`/`PayloadLayer` | Một kiểu dữ liệu duy nhất cho màn duyệt | Thấp |
| `src/modules/submissions/detail.ts` | Modified | `loadStaffSubmissionDetail` trả thêm `internalNotes` | Giữ service của `main`, thêm trường của PR | Thấp |
| `src/modules/submissions/detail-view.ts` | **Deleted** | `SubmissionDetailView`, `loadSubmissionDetail` | Bỏ service đọc chi tiết thứ hai (đọc nối tiếp) | Trung bình — mọi bên gọi đã chuyển sang `detail.ts` |
| `src/app/submissions/[submissionId]/page.tsx` | Modified | dùng `loadStaffSubmissionDetail`; giữ nhánh "lỗi tạm không thành 404"; truyền `submissionId` + `initialSubmission` | Gộp hai bản page | Trung bình |
| `src/components/submission-detail.tsx` | Modified | `type Submission = StaffSubmissionDetail`; "Từ chối" vào menu phụ; giữ thông điệp tiến trình khi Hoàn thành xử lý | Kiểu về một nguồn + UI theo yêu cầu | Trung bình (UI) |
| `src/components/admin/document-viewer.tsx` | Modified | thêm `revealedFileIds` + `reveal()`; nút "Xem ảnh"; nút toàn màn hình `disabled` khi chưa tải | Giữ cả cache blob của PR và click-để-tải của `main` | Trung bình (UI) |
| `AGENTS.md` | Modified | thêm `PUT .../internal-notes`; thêm quy tắc "kiểm lại quyền trong transaction" | Đồng bộ tài liệu nguồn chi tiết nhất | Thấp |
| `docs/brain/01-architecture.md` | Modified | Code Graph mới cho thao tác ảnh nguyên tử; sửa mục `detail-view` → `detail.ts`; danh sách migration thêm `005`/`006` | Code Graph không được lỗi thời | Thấp |
| `docs/brain/03-decisions.md` | Modified | entry `[2026-07-30] Review PR #11` (7 mục); sửa 4 tham chiếu lỗi thời | Quyết định kỹ thuật | Thấp |
| `docs/brain/04-current-tasks.md` | Modified | entry mới + điều kiện trước deploy + việc còn lại | Trạng thái task | Thấp |
| `docs/brain/06-ai-working-log.md` | Modified | entry nhật ký đợt này | Bắt buộc theo `CLAUDE.md` | Thấp |
| `tests/officer-file-upload.test.ts` | Rewritten | 33 ca hành vi | Thay test đọc chuỗi | Thấp |
| `tests/officer-file-delete.test.ts` | Rewritten | 12 ca hành vi | Thay test đọc chuỗi | Thấp |
| `tests/officer-file-reassign-owner.test.ts` | Rewritten | 12 ca hành vi | Thay test đọc chuỗi | Thấp |
| `tests/officer-file-mutations.integration.test.ts` | Added | 11 ca, Postgres thật, tự SKIP | Chứng minh tính nguyên tử | Thấp |
| `tests/submission-detail-load.test.ts` | Added (rename từ `submission-detail-view.test.ts`) | nhắm `detail.ts`; thêm ca "đọc song song" | Retarget sau khi gỡ `detail-view.ts` | Thấp |
| `tests/submission-detail-page.test.ts` | Modified | mock `@/modules/submissions/detail` | Retarget | Thấp |
| `tests/submission-detail-performance.test.ts` | Modified | cập nhật theo implementation đã gộp + ca "chỉ MỘT service đọc chi tiết" | Giữ hợp đồng hiệu năng của `main` | Thấp |
| `tests/submission-action-request-supplement-disabled.test.ts` | Modified | thêm 3 ca khóa vị trí nút "Từ chối" | Chống hồi quy UI | Thấp |
| `tests/staging-rehearsal-acceptance-saga.integration.test.ts` | Modified | bootstrap catch-up migration `006` | `internal_notes` nằm trong `SUBMISSION_SELECT`, thiếu là suite này lỗi | Thấp |

---

## 8. Detailed implementation by phase

### Phase 1 — Gộp `main` và giải xung đột

- **Mục tiêu:** nền là `main` mới nhất, giữ mọi tối ưu vừa merge vào `main`.
- **File liên quan:** 12 tệp xung đột — `CHATGPT_HANDOFF.md`, `docs/brain/03,04,06`,
  `scripts/preflight-*`, `src/app/api/public/.../uploads/complete/route.ts`,
  `src/app/api/submissions/[submissionId]/files/[fileId]/route.ts`,
  `src/app/api/submissions/[submissionId]/route.ts`, `src/app/submissions/[submissionId]/page.tsx`,
  `src/components/admin/document-viewer.tsx`, `src/components/submission-detail.tsx`,
  `src/modules/public-intake/repository.ts`.
- **Đã thực hiện:**
  - `GET /api/submissions/:id` và `GET .../files/:fileId`: giữ bản `main` (`Server-Timing`,
    `findActiveFile` một truy vấn). Nhánh `findById` thừa mà PR thêm vào `GET` ảnh đã bỏ.
  - `public/.../uploads/complete`: giữ bản dùng `discardIfOrphan` dùng chung của PR, bỏ bản sao cục
    bộ, rồi widen tham số cho lazy folder.
  - `submission-detail.tsx`, `document-viewer.tsx`: lấy bản PR làm nền rồi ghép lại phần của `main`.
  - Tài liệu brain: giữ **cả hai** phía (tệp append-only).
- **Không thực hiện:** không rebase hay force-push nhánh PR gốc.
- **Test đã chạy:** `npx tsc -p tsconfig.typecheck.json --noEmit` → 4 lỗi (mục 4).
- **Kết quả:** 4 lỗi đó chính là hai phát hiện #4 và #5 của review, xử lý ở Phase 3/4/5.
- **Rủi ro:** `main` có một `import` không dùng (`assignedOfficerAccount`) — bỏ theo bản PR; đã kiểm
  không có bên nào khác dùng.

### Phase 2 — Giải xung đột migration `202607290005` (P0)

- **Mục tiêu:** một số hiệu, một nội dung; deploy không phụ thuộc thứ tự merge.
- **File:** `supabase/migrations/202607290006_submission_internal_notes.sql`,
  `scripts/preflight-public-intake-v2-migrations.ts`,
  `evidence/PUBLIC_INTAKE_V2_MIGRATIONS_002_006_RUNBOOK.md`.
- **Đã thực hiện:** `git mv` migration + comment giải thích lý do đổi số. Preflight kiểm **cả**
  `drive_folder_id` nullable + 3 cột `drive_folder_*` + CHECK + index (`005`) **và** `internal_notes`
  (`006`). Runbook đổi tên, phủ 5 migration, thêm ở mục 0: truy vấn `schema_migrations`, hai truy vấn
  phân biệt schema (`drive_folder_state` vs `internal_notes`), và SQL sửa lịch sử — câu `delete` chỉ
  gỡ dòng `005` khi schema **chưa** có cột lazy Drive folder, nên không bao giờ xóa dòng đúng. Thêm
  một hàng "dấu hiệu phải rollback" cho ca `schema_migrations` có `005` nhưng schema không có
  `drive_folder_state`.
- **Không thực hiện:** không áp migration lên database nào.
- **Test đã chạy:** `npx vitest run tests/migration-versions.test.ts` — **PASS** (trip-wire này
  **đỏ** trên bản merge chưa sửa).
- **Rủi ro:** database rehearsal có thể đã ghi `005` cho nội dung cũ → phải làm mục 0 của runbook
  trước `db push`. Đây là rủi ro vận hành, không đóng được bằng code.

### Phase 3 — Nguyên tử hóa 3 thao tác ảnh + kiểm lại quyền/trạng thái/trần (P1 số 2 và 3)

- **Mục tiêu:** không còn "dữ liệu đã đổi mà audit không ghi", và không còn khoảng trống giữa lúc
  kiểm quyền và lúc ghi.
- **File:** `repository.ts`, `review.ts`, ba route (`uploads/complete`, `files/[fileId]`
  `DELETE`/`PATCH`).
- **Đã thực hiện:**
  - `mayStaffEditState({status, claimedBy}, email)` — phần thuần của `mayStaffEdit`.
  - `lockSubmissionForStaffEdit(tx, submissionId, actorEmail)`: `select ... for update` trên
    `public_submissions` → `mayStaffEditState` → ném `OfficerFileMutationRejectedError("FORBIDDEN")`.
  - `lockActiveFiles(tx, submissionId)`: ảnh `status='UPLOADED'` `for update`.
  - `commitOfficerFileUpload`: advisory lock idempotency → replay `request_log` (trả nguyên summary
    cũ) → lock hồ sơ + quyền → lock ảnh → kiểm `replaceFileId` / ô CCCD / trần 10 ảnh GCN / trần
    150 MB bằng `file.sizeBytes` **đã xác minh trên Drive** → `REPLACED` ảnh cũ →
    `insert public_files` → `refreshFileSummaries` → `insertAudit` → `insert request_log` kind
    `OFFICER_UPLOAD_COMPLETE`.
  - `commitOfficerFileDelete`: lock hồ sơ + quyền → lock ảnh → chỉ `CERTIFICATE` → `REPLACED` bị từ
    chối → no-op khi đã `DELETED` → `status='DELETED'` → `refreshFileSummaries` → audit.
  - `commitOfficerFileOwnerReassign`: lock hồ sơ + quyền → lock ảnh nguồn → chủ đích từ
    `effectivePayload(record)` + `requiresCitizenId` → lock ô đích → `update owner_id` →
    `refreshFileSummaries` → audit.
  - Route dịch `reason` → HTTP bằng `REJECTION_HTTP`. **Ném** lỗi (không trả kết quả) là cố ý: mọi
    nhánh từ chối làm transaction rollback.
  - Gỡ `reassignFileOwner` và tham số `kind` của `appendFile` (không còn ai dùng).
- **Không thực hiện:** không thêm khóa hồ sơ vào `appendFile` (đường công khai) — ngoài phạm vi, ghi
  ở mục 5 và 15.
- **Test đã chạy:** `officer-file-upload` (33), `officer-file-delete` (12),
  `officer-file-reassign-owner` (12) — **PASS**. `officer-file-mutations.integration` — **SKIP**.
- **Rủi ro:** thứ tự khóa hồ sơ→ảnh khác đường công khai (`appendFile` khóa ảnh trước qua `UPDATE`,
  rồi hồ sơ qua `refreshFileSummaries`) nên **có thể deadlock** khi một lượt của dân và một lượt của
  cán bộ chạy đồng thời trên cùng hồ sơ. Postgres phát hiện và abort một bên: route cán bộ trả 500 và
  dọn tệp mồ côi — mất một lượt tải, **không** hỏng dữ liệu. Đã ghi vào Code Graph.

### Phase 4 — Tương thích lazy Drive folder (P1 số 4)

- **Mục tiêu:** đường cán bộ chạy được trên hồ sơ chưa có thư mục Drive.
- **File:** hai route `uploads/*`, `upload-commit.ts`.
- **Đã thực hiện:** `ensureSubmissionFolderReady(record)` ở cả `initiate` và `complete`;
  `SubmissionFolderBusyError`/`SubmissionFolderUnavailableError` → `503 SERVICE_UNAVAILABLE` +
  `Retry-After` (3 hoặc 2 giây, cùng giá trị đường công khai); `discardIfOrphan` nhận
  `driveFolderId: string | null`, không làm gì khi `null`.
- **Điểm quan trọng:** ở `complete`, `ensureSubmissionFolderReady` đặt **trước**
  `verifyUploadedFile`, và nhánh 503 **không** dọn tệp nào — chưa xác nhận được thư mục của hồ sơ thì
  không có căn cứ để xóa.
- **Test đã chạy:** 4 ca lazy folder trong `officer-file-upload.test.ts` — **PASS** (gồm ca "503 thì
  KHÔNG gọi `discardIfOrphan`").

### Phase 5 — Một service đọc chi tiết, giữ tối ưu của `main` (P2 số 5)

- **Mục tiêu:** không có hai đường đọc cùng chức năng.
- **File:** `detail.ts`, `detail-types.ts`, `detail-view.ts` (xóa), `page.tsx`,
  `submission-detail.tsx`, `document-viewer.tsx`, `ai-draft-panel.tsx`.
- **Đã thực hiện:** gỡ `detail-view.ts`; `StaffSubmissionDetail` thêm `internalNotes` và siết kiểu;
  `page.tsx` dùng `loadStaffSubmissionDetail` **và** giữ nhánh "lỗi tạm không thành 404" của PR;
  component dùng `type Submission = StaffSubmissionDetail`; viewer giữ cache blob của PR **và** cửa
  click-để-tải của `main`; panel AI giữ bản của PR (lazy nằm trong chính panel với state `open`), bỏ
  wrapper accordion của `main` trong `submission-detail.tsx` để không gating hai lớp.
- **Test đã chạy:** `submission-detail-load` (7), `submission-detail-page` (7),
  `submission-detail-performance` (4), `submission-detail-service` (2) — **PASS**.

### Phase 6 — Test hành vi + integration test (P2 số 6)

- **Mục tiêu:** test bắt được lỗi thật, không chỉ bắt "có gọi hàm hay không".
- **Đã thực hiện:** ba bộ test route viết lại (mock `authorization`/`csrf`/`env`/`repository`/
  `storage`/`submission-folder`/`upload-commit`, gọi thật handler, kiểm status + có/không ghi + dọn
  tệp mồ côi); thêm `tests/officer-file-mutations.integration.test.ts` 11 ca trên Postgres thật.
- **Cách mô phỏng "audit lỗi":** trigger tạm `BEFORE INSERT ON public.audit_logs` raise exception cho
  đúng một `action`. Nếu ghi ảnh và ghi audit không cùng transaction, ảnh vẫn nằm lại trong
  `public_files` sau khi trigger nổ — đó chính là điều ca OF-01 kiểm.
- **Không thực hiện:** chưa chạy integration test (thiếu database thử nghiệm).

### Phase 7 — "Từ chối" vào "Thao tác khác" (phát hiện #7)

- **Đã thực hiện:** nút chuyển vào `<details>` `⋯ Thao tác khác`; menu này giờ hiện cả ở
  `UNDER_REVIEW` (trước chỉ `ACCEPTED`); giữ `window.confirm`. **Không xóa** chức năng — quyết định
  [2026-07-29] Đợt 2A-1 đã chốt giữ nút này cho ca hồ sơ trùng/nộp sai địa bàn.
- **Test đã chạy:** 3 ca mới trong `submission-action-request-supplement-disabled.test.ts` — **PASS**.

---

## 9. Behavior before and after

| Scenario | Before (bản PR #11) | After | Verification |
| --- | --- | --- | --- |
| Cán bộ tải ảnh, ghi `audit_logs` lỗi | Ảnh **đã** vào hồ sơ, API trả 500; gọi lại → replay trả thành công, audit thiếu vĩnh viễn | Cả ảnh lẫn `request_log` đều rollback; gọi lại ghi đủ ảnh + audit | OF-01 (**chưa chạy**) |
| Hai lượt tải ảnh GCN đồng thời khi hồ sơ còn 1 chỗ | Cả hai qua `initiate`, `complete` không đếm lại → có thể thành 11 ảnh | Lượt thứ hai chờ khóa hồ sơ, đếm lại → `CERTIFICATE_LIMIT` (409) | OF-03 (**chưa chạy**) |
| Hồ sơ được tiếp nhận chính thức trong lúc cán bộ bấm "Gỡ ảnh" | Lượt gỡ đã qua `mayStaffEdit` cũ vẫn ghi được sau khi hồ sơ `ACCEPTED` | Transaction kiểm lại → `FORBIDDEN` (403), ảnh còn nguyên | OF-05 (**chưa chạy**) |
| Hồ sơ chuyển cho cán bộ khác trong lúc đang gán lại chủ ảnh CCCD | Ghi được | `FORBIDDEN` (403), `owner_id` không đổi | OF-06 (**chưa chạy**) |
| Hồ sơ chưa có thư mục Drive (lazy), cán bộ tải ảnh | Lỗi TypeScript; nếu ép kiểu thì tạo phiên upload không có thư mục đích | `ensureSubmissionFolderReady`; đang tạo → 503 + `Retry-After` | `officer-file-upload.test.ts` (4 ca) — **PASS** |
| Thư mục Drive chưa sẵn sàng ở `complete` | — (không có nhánh này) | 503, **không** xác minh, **không** dọn tệp nào | `officer-file-upload.test.ts` — **PASS** |
| Client khai `sizeBytes` nhỏ ở `initiate`, tệp thật lớn | Trần dung lượng chỉ kiểm số client khai | Kiểm lại bằng `verified.sizeBytes` trong transaction | `officer-file-upload.test.ts` — **PASS**; OF-04 (chưa chạy) |
| Mở màn duyệt hồ sơ | Tự tải ảnh đang chọn (1 lượt Drive + 1 dòng audit cho **mọi** lần mở) | Không tải byte ảnh nào tới khi bấm "Xem ảnh" | `submission-detail-performance.test.ts` — **PASS** |
| Mở ảnh toàn màn hình | Dùng lại object URL, không tải lại (giữ của PR) | Không đổi, **và** nút bị vô hiệu hóa khi ảnh chưa tải | `submission-detail-performance.test.ts` — **PASS** |
| Đọc chi tiết hồ sơ | Hai service: `detail.ts` (song song) và `detail-view.ts` (nối tiếp) | Một service, `Promise.all` + `Server-Timing` | `submission-detail-load.test.ts` ca "đọc song song" — **PASS** |
| Cán bộ bấm cạnh "Hoàn thành xử lý" | "Từ chối" nằm ngay cạnh | "Từ chối" trong menu `⋯ Thao tác khác` | test placement — **PASS** |
| Deploy code trước migration `internal_notes` | Mọi truy vấn đọc hồ sơ lỗi (cột nằm trong `SUBMISSION_SELECT`) | **Không đổi** — vẫn vậy; preflight + runbook + 3 tài liệu brain nêu rõ đây là điều kiện chặn deploy | Runbook mục 5 và 7 |

---

## 10. API, data and security impact

### Authentication

Không thay đổi. `requireActiveUser(SUBMISSION_DECISION_ROLES)` như trước.

### Authorization

- **Không mở rộng quyền.** Cùng luật `mayStaffEdit` (đang giữ hồ sơ + `UNDER_REVIEW`).
- **Siết chặt hơn ở tầng thực thi:** luật được kiểm **lại** trong transaction sau khi khóa hàng
  `public_submissions`. Hệ quả quan sát được: một lượt ghi từng "đi qua" trong khoảng tranh chấp thì
  nay bị từ chối 403.
- Luật nằm ở đúng một hàm (`mayStaffEditState`), route và repository đọc cùng hàm đó.

### DataScope

- `lockActiveFiles` và mọi câu SQL trong ba method đều lọc theo `submission_id` — không có đường nào
  chạm ảnh của hồ sơ khác.
- `discardIfOrphan` giữ nguyên hai điều kiện (chưa hồ sơ nào nhận **và** tệp nằm trong thư mục của hồ
  sơ đang gọi), thêm guard `driveFolderId === null` → không xóa.

### API contract

| Endpoint | Method | Trước | Sau |
| --- | --- | --- | --- |
| `/api/submissions/:id/uploads/initiate` | POST | Request không đổi; response `{uploadUrl, mimeType, requestId}` | **Thêm** `503 SERVICE_UNAVAILABLE` + header `Retry-After` khi thư mục Drive đang được tạo |
| `/api/submissions/:id/uploads/complete` | POST | Request không đổi; response `{ok, fileId, requestId}` | **Thêm** `503` + `Retry-After`. Các mã 400/403/404/409 giữ nguyên nghĩa nhưng lý do từ chối do transaction quyết định (bảng `REJECTION_HTTP`) |
| `/api/submissions/:id/files/:fileId` | DELETE | `{fileId, status:"DELETED", requestId}` | Không đổi. **Thêm** `409 VERSION_CONFLICT` cho ảnh `REPLACED` (trước trả 404) |
| `/api/submissions/:id/files/:fileId` | PATCH | `{fileId, ownerId, requestId}` | Không đổi |
| `/api/submissions/:id` | GET | — | Giữ bản `main`: `Server-Timing: detail_db, detail_total`; DTO có `internalNotes` |
| `/api/submissions/:id/files/:fileId` | GET | — | Giữ bản `main`: một truy vấn `findActiveFile`, `Server-Timing: preview_db/preview_drive/preview_total` |

**Error handling:** giữ cấu trúc `{ error: { code, message, requestId, details } }`. Không mã lỗi mới
nào được thêm vào `API_ERROR_CODES` — `SERVICE_UNAVAILABLE` đã có sẵn.

### Database and migrations

- **Migration added:** `supabase/migrations/202607290006_submission_internal_notes.sql`
  (`add column if not exists internal_notes text not null default ''`).
- **Migration renamed:** `202607290005_submission_internal_notes.sql` → `...290006_...`. Số `005`
  thuộc `202607290005_lazy_drive_folder_creation.sql` của `main`.
- **Tables/columns/indexes affected:** chỉ `public.public_submissions.internal_notes`. Không index,
  không constraint mới.
- **Backfill:** không cần (`default ''`).
- **Rollback:** `alter table public.public_submissions drop column if exists internal_notes;` — **mất
  toàn bộ ghi chú nội bộ cán bộ đã nhập**, không có bản sao ở đâu khác.
- **Production action required:** **CÓ.** Chạy `202607290002`–`202607290006` theo đúng thứ tự, Preview
  trước, **trước khi deploy code**, rồi `npx tsx scripts/preflight-public-intake-v2-migrations.ts`
  PASS. Nếu database đã ghi `005` cho nội dung cũ, làm mục 0 của runbook trước.
- **Đợt review này không thêm schema change nào khác** — ba method mới chỉ đọc/ghi cột đã có.

### Validation and file handling

- **Trường bắt buộc:** không đổi (`documentType`, `ownerId` cho CCCD, `driveFileId`,
  `idempotency-key` ở `complete`).
- **Quy tắc tên file:** không đổi — máy chủ đặt `OFFICER-{documentType}-{ts}-{8 hex}.{ext}`, không
  ghép mảnh nào của tên client. Có test khẳng định tên không chứa CCCD/họ tên mẫu.
- **Giới hạn file:** `MAX_UPLOAD_MB` mỗi ảnh (kiểm ở `initiate`); `MAX_CERTIFICATE_PHOTOS = 10`;
  `SUBMISSION_BYTE_BUDGET = 150 MB`. **Thay đổi:** hai trần sau giờ được kiểm **lại** trong
  transaction bằng dữ liệu thật.
- **MIME/type validation:** không đổi (`canonicalImageMimeType` ở `initiate`, `verifyUploadedFile`
  trên Drive ở `complete`).
- **Xử lý lỗi:** mọi nhánh thất bại sau khi tệp đã lên Drive đều đi qua `discardIfOrphan`, trừ nhánh
  503 "thư mục chưa sẵn sàng" (cố ý — chưa có căn cứ để xóa).

### Sensitive data

- **Dữ liệu nhạy cảm bị tác động:** ảnh giấy tờ (CCCD/GCN), `internal_notes` (ô tự do cán bộ có thể
  gõ PII vào).
- **Log có thể chứa dữ liệu:** audit metadata của ba thao tác chỉ gồm `documentType` (danh mục đóng),
  `fileId`, `sizeBytes`, `replaced` — **không** `driveFileId`, **không** tên tệp, **không** `ownerId`.
  Audit ghi chú nội bộ chỉ lưu `noteLength`.
- **Biện pháp che/loại bỏ:** thông điệp lỗi 500 dùng câu chung, không chép thông điệp nội bộ — có
  test khẳng định (không lộ `"public_files"`, không lộ `"deadlock"`). Response `complete` không chứa
  `driveFileId` hay folder ID — có test.
- **`cache-control`:** mọi phản hồi của các route này `no-store`; trang duyệt và toàn bộ matcher cán
  bộ có `private, no-store` từ `src/proxy.ts` (giữ nguyên của PR).

---

## 11. Tests added or changed

| Test file | Test case | Requirement covered | Result |
| --- | --- | --- | --- |
| `tests/officer-file-upload.test.ts` | 33 ca: cửa quyền (5), lazy Drive folder (4), một transaction (6), bảng mã HTTP (7), validation `initiate` + PII tên tệp + no-store (11) | Review #2, #3, #4, #6 | **33 PASS** |
| `tests/officer-file-delete.test.ts` | 12 ca: xóa mềm không chạm Drive, một đường ghi transaction, idempotent, cửa quyền, bảng mã HTTP, no-store, không lộ chi tiết nội bộ | Review #2, #3, #6 | **12 PASS** |
| `tests/officer-file-reassign-owner.test.ts` | 12 ca: một transaction, `NOOP` idempotent, không gỡ/xóa ảnh, validation, cửa quyền, bảng mã HTTP, 409 ô đích đã có ảnh | Review #2, #3, #6 | **12 PASS** |
| `tests/officer-file-mutations.integration.test.ts` | OF-01 audit lỗi ⇒ ảnh không vào + không để lại `request_log`; OF-02 replay không ghi audit lần hai; OF-03 hai upload đồng thời không vượt trần; OF-04 trần dung lượng theo byte thật; OF-05 tiếp nhận đồng thời ⇒ gỡ ảnh bị từ chối; OF-06 chuyển hồ sơ đồng thời ⇒ gán lại bị từ chối; OF-07 xóa mềm + audit cùng transaction; OF-08 audit lỗi khi gỡ ⇒ ảnh còn hiệu lực; OF-09 hai gán lại đồng thời khác mặt; OF-10 409 ô đích đã có ảnh; OF-11 `file_summary_json` cùng transaction | Review #2, #3, #6 (điều kiện duyệt số 5) | **11 SKIP** — thiếu `ACCEPTANCE_SAGA_TEST_DATABASE_URL` |
| `tests/submission-detail-load.test.ts` | 7 ca: `null` không ghi audit; đúng một dòng audit; không audit khi `auditDetailView: false`; lớp dữ liệu hiệu lực; `internalNotes` + đúng 3 trường ảnh; `canResetAccessSecret`; **đọc song song không nối tiếp** | Review #5 | **7 PASS** |
| `tests/submission-detail-page.test.ts` | 7 ca (retarget sang `detail.ts`): `null` → 404; lỗi tạm → vẫn render; truyền thẳng hồ sơ; đi qua hàm dùng chung để giữ audit; redirect khi thiếu quyền; lỗi hạ tầng không thành redirect; suy ra `isAdministrator` | Review #5 | **7 PASS** |
| `tests/submission-detail-performance.test.ts` | 4 ca: server-priming + không fetch lại; đọc song song + chỉ MỘT service; lazy AI + lazy ảnh; một truy vấn ảnh + `Server-Timing` | Review #5 | **4 PASS** |
| `tests/submission-action-request-supplement-disabled.test.ts` | +3 ca: "Từ chối" trong menu phụ; giữ `window.confirm`; "Hoàn thành xử lý" vẫn ở thanh chính | Review #7 | **4 PASS** (1 cũ + 3 mới) |
| `tests/migration-versions.test.ts` | (có sẵn) trùng số hiệu migration | Review #1 | **PASS** (đỏ trên bản merge chưa sửa) |
| `tests/staging-rehearsal-acceptance-saga.integration.test.ts` | bootstrap catch-up `202607290006` | `internal_notes` trong `SUBMISSION_SELECT` | **SKIP** (thiếu database) |

---

## 12. Final verification

| Check | Command | Result | Evidence |
| --- | --- | --- | --- |
| Unit tests | `npx vitest run` | **800 pass / 24 skip / 0 fail** (93 tệp pass, 3 skip) | `Duration 11.27s`, exit 0 |
| Integration tests | `ACCEPTANCE_SAGA_TEST_DATABASE_URL=... npx vitest run tests/officer-file-mutations.integration.test.ts` | **KHÔNG CHẠY** — 11 ca SKIP vì không có database thử nghiệm | Output: `1 skipped (1)` / `11 skipped (11)` |
| E2E tests | `npm run test:e2e:preview` | **KHÔNG CHẠY** | Cần Preview + Supabase + Drive + tài khoản cán bộ thật |
| Build | `npm run build` | **PASS** | Liệt kê đủ route mới: `/api/submissions/[submissionId]/uploads/complete`, `.../initiate`, `.../internal-notes` |
| Lint | `npm run lint` | **PASS** — 0 error, 5 warning | 5 warning y nguyên baseline `main` (`scripts/add-system-admins.ts`, `tests/staging-rehearsal-scenarios.test.ts`) |
| Typecheck | `npx tsc -p tsconfig.typecheck.json --noEmit` | **PASS** — 0 lỗi | Bao gồm cả `tests/` |
| Security check | Đọc lại toàn bộ audit metadata + response body của ba route | **PASS** | Có test khẳng định: metadata không chứa `driveFileId`/`fileName`/`ownerId`; response không chứa Drive ID/folder ID; thông điệp 500 không chép chi tiết nội bộ |
| Secret scan | Rà `git diff` toàn bộ; kiểm không tệp `.env*` nào bị sửa | **PASS** | Không secret/token/connection string trong diff |

---

## 13. Acceptance criteria matrix

Đối chiếu với 7 "Điều kiện để PR được duyệt" trong kết luận review.

| ID | Acceptance criterion | Status | Evidence | Notes |
| --- | --- | --- | --- | --- |
| AC-01 | Rebase/merge `main` vào nhánh PR và xử lý toàn bộ conflict | **PASS** | Nhánh dựng từ `bdd3610` + merge `e34dc83`; 12 tệp xung đột đã giải; typecheck/lint/test/build xanh | Làm trên nhánh mới `claude/pr-11-review-issues-e1qykd` thay vì force-push nhánh PR cũ |
| AC-02 | Giải quyết migration `005`, cập nhật runbook và preflight | **PASS** | `202607290006_...sql`; preflight kiểm cả `005` và `006`; `..._002_006_RUNBOOK.md` với mục 0 xử lý lịch sử | Việc **kiểm lịch sử trên từng database thật** là hành động vận hành, không kiểm được bằng code |
| AC-03 | Giữ kiến trúc lazy Drive folder và detail performance mới nhất của `main` | **PASS** | `ensureSubmissionFolderReady` ở hai route cán bộ; `detail.ts` + `Promise.all` + `Server-Timing` giữ nguyên; `detail-view.ts` đã gỡ; viewer giữ click-để-tải | Khóa bằng `officer-file-upload`, `submission-detail-load`, `submission-detail-performance` |
| AC-04 | Đưa quyền, trạng thái, giới hạn, cập nhật file, audit và idempotency vào cùng transaction | **PASS (code) / NOT_TESTED (database)** | 3 method trong `repository.ts`; 57 ca test hành vi PASS | Tính nguyên tử **thật sự** chỉ được chứng minh khi `officer-file-mutations.integration.test.ts` chạy trên Postgres — xem AC-05 |
| AC-05 | Thêm test cho audit failure, concurrent upload/delete/accept và lazy folder | **PASS (đã viết) / NOT_TESTED (chưa chạy)** | 11 ca OF-01…OF-11; riêng lazy folder có 4 ca **đã chạy PASS** trong test hành vi | 11 ca integration SKIP vì thiếu `ACCEPTANCE_SAGA_TEST_DATABASE_URL`. **Không coi AC-04 là nghiệm thu tới khi 11 ca này xanh.** |
| AC-06 | Chạy lại `typecheck`, `lint`, toàn bộ Vitest, build và smoke test Preview có đăng nhập | **PARTIAL** | typecheck 0 lỗi; lint 0 error; Vitest 800 pass/24 skip/0 fail; build PASS | **Smoke test Preview có đăng nhập: CHƯA CHẠY** — cần Preview deployment + Supabase + Drive + tài khoản cán bộ |
| AC-07 | Chỉ deploy code sau khi database đã có `internal_notes` | **BLOCKED (hành động vận hành)** | Preflight có bước kiểm; runbook mục 5 và 7; `03-decisions.md`/`04-current-tasks.md`/`01-architecture.md` đều cảnh báo | Không kiểm được bằng code — là điều kiện của quy trình deploy |

---

## 14. Manual verification required

- **Màn hình/quy trình cần người dùng kiểm tra** (trên Preview, **sau khi** đã chạy migration
  `202607290002`–`006` và preflight PASS):
  1. `/submissions` — tìm kiếm theo tên chủ / số GCN / mã tiếp nhận, không trang nào 500.
  2. `/submissions/:id` của một hồ sơ `UNDER_REVIEW` do chính mình nhận xử lý.
- **Dữ liệu mẫu cần dùng:** một hồ sơ giả có ≥ 2 chủ sử dụng **cá nhân** (để thử gán lại chủ ảnh
  CCCD), ≥ 2 ảnh GCN, đủ B–AX để tiếp nhận được.
- **Các bước kiểm tra:**
  1. Mở hồ sơ → **khung ảnh phải hiện nút "Xem ảnh", chưa tải ảnh nào** (kiểm tab Network). Bấm →
     ảnh hiện. Bấm toàn màn hình → **không tải lại** (chỉ một request cho mỗi ảnh).
  2. Mở "Đối chiếu AI" → chỉ khi đó mới có request `ai-draft`.
  3. Gõ và lưu **ghi chú nội bộ** → lưu được; tải lại trang thấy nội dung.
  4. **Tải thêm một ảnh GCN** → xuất hiện trong khung ảnh.
  5. **Gỡ ảnh vừa tải** (xác nhận hai bước) → biến mất khỏi khung; kiểm trên Drive tệp **vẫn còn**.
  6. **Gán lại chủ** cho một ảnh CCCD sang chủ khác chưa có ảnh cùng mặt → nhãn ảnh đổi đúng.
  7. Thử gán lại vào ô đích **đã có** ảnh cùng mặt → phải báo lỗi 409, **không** ghi đè.
  8. Mở menu `⋯ Thao tác khác` → thấy "Từ chối"; **thanh thao tác chính không còn nút đó**.
  9. Bấm **Hoàn thành xử lý** → thấy "Đang chuyển ảnh và ghi dữ liệu hồ sơ…", rồi có mã hồ sơ chính
     thức.
  10. Kiểm `select action, metadata from public.audit_logs where entity_id = '<submissionId>'` — phải
      có `SUBMISSION_OFFICER_FILE_UPLOADED`, `..._DELETED`, `..._OWNER_REASSIGNED`,
      `SUBMISSION_INTERNAL_NOTE_UPDATED`; metadata **không** chứa tên tệp, Drive ID hay `ownerId`.
- **Kết quả mong đợi:** tất cả các bước thành công, và **không có dòng audit nào thiếu** so với thao
  tác đã làm.

---

## 15. Remaining issues and warnings

| Severity | Issue | Impact | Recommended action |
| --- | --- | --- | --- |
| **High** | `tests/officer-file-mutations.integration.test.ts` chưa chạy lần nào | Tính nguyên tử của ba transaction **chưa được chứng minh bằng thực nghiệm** — đúng là điều kiện AC-05 của review | Chạy trên một Postgres thử nghiệm trước khi merge: `ACCEPTANCE_SAGA_TEST_DATABASE_URL=... npx vitest run tests/officer-file-mutations.integration.test.ts` |
| **High** | Migration `202607290002`–`202607290006` chưa áp lên database nào | Deploy code trước migration `006` làm **mọi** truy vấn đọc hồ sơ lỗi (`internal_notes` nằm trong `SUBMISSION_SELECT`) | Theo `evidence/PUBLIC_INTAKE_V2_MIGRATIONS_002_006_RUNBOOK.md`, bắt đầu từ mục 0 |
| **High** | Database rehearsal có thể đã ghi `202607290005` cho nội dung **ghi chú nội bộ** (bản cũ của nhánh PR) | `db push` sẽ bỏ qua `005` (tưởng đã áp) → **thiếu toàn bộ cột lazy Drive folder** | Chạy hai truy vấn phân biệt ở mục 0 của runbook **trước** khi push; sửa `schema_migrations` theo SQL đã cho, **không xóa cột** |
| **Medium** | Chưa smoke test Preview có đăng nhập | Toàn bộ phần UI (nút "Xem ảnh", tải/gỡ/gán lại ảnh, vị trí nút Từ chối) chưa ai bấm thật | Làm mục 14 |
| **Medium** | Đường tải ảnh **công khai** vẫn chỉ kiểm trần ở `initiate` | Hai lượt tải của người dân đồng thời vẫn có thể làm hồ sơ vượt trần 10 ảnh/150 MB. **Có từ trước PR #11** | Task riêng: cho `appendFile` khóa hàng hồ sơ và đếm lại, hoặc chuyển đường công khai sang một `commitPublicFileUpload` tương tự |
| **Medium** | Thứ tự khóa khác nhau giữa đường cán bộ (hồ sơ→ảnh) và đường công khai (ảnh→hồ sơ) | Có thể deadlock khi một lượt của dân và một lượt của cán bộ chạy đồng thời trên **cùng** hồ sơ. Postgres abort một bên → route cán bộ trả 500 + dọn tệp mồ côi; **không** hỏng dữ liệu | Đóng cùng lúc với mục trên (thống nhất thứ tự khóa) |
| **Low** | Không có test render UI cho `OfficerFileUpload`/`DocumentViewer` | Lỗi render/trạng thái nút chỉ phát hiện bằng tay | Thêm `@testing-library/react` + `jsdom` — **thay đổi stack, phải duyệt riêng** |
| **Low** | Hai hợp đồng liên tệp vẫn dùng test đọc chuỗi mã nguồn | Đổi cách viết cùng nghĩa có thể làm test đỏ oan | Chấp nhận có chủ ý; lý do ghi ở `03-decisions.md` mục 6 |
| **Low** | Rollback `202607290006` làm mất toàn bộ ghi chú nội bộ | Không có bản sao ở đâu khác | Runbook đã ghi rõ trong mục "Mất gì khi rollback" |

---

## 16. Regression and compatibility notes

- **Trình duyệt:** không dùng API mới nào. `URL.createObjectURL`/`revokeObjectURL`,
  `<details>/<summary>`, `window.confirm` — đều đã dùng trước đó trong repo.
- **Thiết bị:** thay đổi UI ở màn **cán bộ** (desktop-first). Cổng công khai `/ke-khai` không bị
  chạm.
- **Node/runtime:** không đổi. Cả hai route `uploads/*` giữ `runtime = "nodejs"`.
- **Database:** thêm một cột `text not null default ''`. Không index, không constraint mới, không đổi
  kiểu cột nào. Ba method mới chỉ dùng `select ... for update`, `update`, `insert` trên bảng đã có.
- **API bên ngoài:** Google Drive — không thêm lời gọi mới; đường cán bộ giờ đi qua
  `ensureSubmissionFolderReady` (đã dùng ở đường công khai từ Phase 3).
- **Backward compatibility:**
  - `mayStaffEdit(record, email)` giữ nguyên signature và hành vi.
  - `appendFile` **mất tham số `kind`** — thay đổi phá vỡ về kiểu, nhưng không còn bên gọi nào truyền
    nó (đã kiểm bằng grep toàn repo + typecheck).
  - `reassignFileOwner` **đã gỡ** — bên gọi duy nhất là route `PATCH`, đã chuyển sang
    `commitOfficerFileOwnerReassign`.
  - `DELETE .../files/:fileId` trả `409` (trước `404`) cho ảnh `REPLACED`. Client hiện chỉ hiển thị
    `error.message`, không `switch` theo mã.
- **Excel/PDF/import/export:** không chạm `pl3-export.ts` hay đường xuất nào.
- **Khác:** `next-env.d.ts` bị `npm run build` sửa (đường dẫn types của Next) — **đã revert**, không
  nằm trong diff.

---

## 17. Rollback plan

- **Cách rollback code:** `git revert` commit của nhánh này, hoặc đơn giản là không merge PR. Nhánh
  không chạm `main`.
- **Cách rollback migration:** theo mục 6 của
  `evidence/PUBLIC_INTAKE_V2_MIGRATIONS_002_006_RUNBOOK.md`, **thứ tự ngược `06 → 02`**:
  ```sql
  -- 202607290006
  alter table public.public_submissions drop column if exists internal_notes;
  ```
  Rollback `005` (lazy Drive folder) **có điều kiện** — chỉ được khi
  `LAZY_DRIVE_FOLDER_CREATION_ENABLED = false` **và** không còn hồ sơ nào `drive_folder_id is null`;
  xem runbook.
- **Dữ liệu có cần phục hồi:** rollback `006` **mất thật** toàn bộ `internal_notes` cán bộ đã nhập.
  Nếu Preview/Production đã có ghi chú thật, dump cột đó trước khi rollback.
- **Điều kiện KHÔNG được rollback tự động:**
  - Không rollback `005` khi còn hồ sơ `drive_folder_id is null` — ép `NOT NULL` bằng cách điền bừa
    `drive_folder_id` là mất đường tìm lại ảnh.
  - Không rollback migration **trước** khi rollback code: code còn `internal_notes` trong
    `SUBMISSION_SELECT` thì gỡ cột làm mọi truy vấn hồ sơ lỗi.

---

## 18. Recommended next action

```text
READY_FOR_CHATGPT_REVIEW
```

Bảy phát hiện của review đã xử lý trong code, với typecheck/lint/800 test/build đều xanh. **Chưa đủ
để merge** vì ba điều kiện nghiệm thu còn lại cần môi trường thật, và một trong ba là điều kiện AC-05
do chính review đặt ra:

1. Chạy `tests/officer-file-mutations.integration.test.ts` trên một Postgres thử nghiệm — đây là bộ
   test duy nhất chứng minh tính nguyên tử.
2. Áp `202607290002`–`202607290006` trên Preview (bắt đầu từ mục 0 của runbook — kiểm lịch sử số
   hiệu), rồi preflight PASS.
3. Smoke test Preview có đăng nhập theo mục 14.

---

## 19. Commands to reproduce

```bash
# Cài đặt
npm ci

# Dựng lại nhánh này từ đầu
git fetch origin main claude/redesign-document-review-screen-tfuvov
git checkout -B claude/pr-11-review-issues-e1qykd origin/main
git merge origin/claude/redesign-document-review-screen-tfuvov   # 12 tệp xung đột

# Kiểm tra tĩnh
npx tsc -p tsconfig.typecheck.json --noEmit
npm run lint

# Toàn bộ unit test
npx vitest run

# Chỉ các bộ test của đợt này
npx vitest run tests/officer-file-upload.test.ts \
               tests/officer-file-delete.test.ts \
               tests/officer-file-reassign-owner.test.ts \
               tests/submission-detail-load.test.ts \
               tests/submission-detail-page.test.ts \
               tests/submission-detail-performance.test.ts \
               tests/submission-action-request-supplement-disabled.test.ts \
               tests/migration-versions.test.ts

# Integration test tính nguyên tử — CẦN Postgres THỬ NGHIỆM (không phải production)
ACCEPTANCE_SAGA_TEST_DATABASE_URL='postgresql://...' \
  npx vitest run tests/officer-file-mutations.integration.test.ts

# Build
npm run build

# Preflight migration (chỉ đọc) — chạy SAU khi áp migration, TRƯỚC khi deploy code
npx tsx scripts/preflight-public-intake-v2-migrations.ts
```

---

## 20. Key diff excerpts

### 20.1. Luật quyền về một nguồn, dùng chung route + repository

```diff
--- a/src/modules/submissions/review.ts
+++ b/src/modules/submissions/review.ts
+/**
+ * Phần thuần của `mayStaffEdit`: chỉ cần trạng thái hồ sơ và email cán bộ đang giữ.
+ *
+ * Tách ra để **repository kiểm lại đúng luật này ngay trong transaction**, sau khi đã khóa hàng
+ * `public_submissions` (`for update`). Kiểm ở route rồi mới mở transaction để lượt ghi là một
+ * khoảng trống thật: trong khoảng đó hồ sơ có thể đã được tiếp nhận chính thức, chuyển cho cán bộ
+ * khác hay trả về hàng chờ, mà lượt ghi đã qua cửa cũ vẫn đi tiếp.
+ *
+ * Đừng chép lại điều kiện này ở nơi khác — sửa luật thì sửa đúng ở đây.
+ */
+export function mayStaffEditState(
+  state: { readonly status: string; readonly claimedBy: string },
+  email: string,
+): boolean {
+  return (
+    state.claimedBy.trim().toLowerCase() === email.trim().toLowerCase() &&
+    state.status === "UNDER_REVIEW"
+  );
+}
+
 export function mayStaffEdit(record: SubmissionRecord, email: string): boolean {
-  return isClaimedBy(record, email) && record.status === "UNDER_REVIEW";
+  return mayStaffEditState(record, email);
 }
```

### 20.2. Khóa hồ sơ + kiểm lại quyền bên trong transaction

```ts
// src/modules/public-intake/repository.ts
private async lockSubmissionForStaffEdit(
  transaction: Sql,
  submissionId: string,
  actorEmail: string,
): Promise<SubmissionRecord> {
  const rows = await transaction.unsafe<SubmissionRow[]>(
    `select ${SUBMISSION_SELECT} from public.public_submissions
     where submission_id = $1 for update`,
    [submissionId],
  );
  if (!rows[0]) {
    throw new OfficerFileMutationRejectedError("NOT_FOUND", "Không tìm thấy bản kê khai.");
  }
  const record = mapSubmission(rows[0]);
  if (!mayStaffEditState(record, actorEmail)) {
    throw new OfficerFileMutationRejectedError(
      "FORBIDDEN",
      "Hồ sơ không còn do bạn nhận xử lý ở trạng thái Đang kiểm tra. Hãy tải lại trang.",
    );
  }
  return record;
}
```

### 20.3. Upload: replay + quyền + trần + ghi + audit + request_log trong MỘT transaction

```ts
// src/modules/public-intake/repository.ts — commitOfficerFileUpload (rút gọn)
return database.begin(async (transaction) => {
  await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
  const cached = await transaction<{ mutation_hash: string; response_json: unknown }[]>`
    select mutation_hash, response_json from public.request_log
    where idempotency_key = ${input.idempotencyKey}
  `;
  if (cached[0]) {
    if (cached[0].mutation_hash !== input.mutationHash) {
      throw new SubmissionIdempotencyConflictError();
    }
    return { summary: cached[0].response_json as PublicFileSummary, replayed: true };
  }

  const record = await this.lockSubmissionForStaffEdit(
    transaction, input.submissionId, input.actorEmail,
  );
  const files = await this.lockActiveFiles(transaction, input.submissionId);

  // ... kiểm replaceFileId / ô CCCD / trần MAX_CERTIFICATE_PHOTOS ...

  const usedBytes =
    files.reduce((sum, file) => sum + file.sizeBytes, 0) - (replaceTarget?.sizeBytes ?? 0);
  if (usedBytes + input.file.sizeBytes > SUBMISSION_BYTE_BUDGET) {
    throw new OfficerFileMutationRejectedError(
      "BYTE_BUDGET", "Tổng dung lượng hồ sơ đã vượt giới hạn.",
    );
  }

  // ... REPLACED ảnh cũ, insert public_files ...
  await this.refreshFileSummaries(transaction, input.submissionId);
  const summary = this.fileSummary(mapFile(rows[0]));

  await this.insertAudit(transaction, {
    actorEmail: input.actorEmail,
    action: "SUBMISSION_OFFICER_FILE_UPLOADED",
    entityId: input.submissionId,
    requestId: input.requestId,
    metadata: {
      documentType: input.documentType,
      fileId: summary.fileId,
      sizeBytes: input.file.sizeBytes,
      replaced: Boolean(input.replaceFileId),
    },
  });

  await transaction`
    insert into public.request_log (
      idempotency_key, kind, request_id, mutation_hash, response_json, expires_at
    ) values (
      ${input.idempotencyKey}, 'OFFICER_UPLOAD_COMPLETE', ${input.requestId},
      ${input.mutationHash}, ${JSON.stringify(summary)}::jsonb, now() + interval '24 hours'
    )
  `;

  return { summary, replayed: false };
});
```

### 20.4. Route `complete`: lazy Drive folder trước khi xác minh, không dọn tệp ở nhánh 503

```ts
// src/app/api/submissions/[submissionId]/uploads/complete/route.ts (rút gọn)
let expectedFolderId: string;
try {
  expectedFolderId = await ensureSubmissionFolderReady(record);
} catch (error) {
  if (
    error instanceof SubmissionFolderBusyError ||
    error instanceof SubmissionFolderUnavailableError
  ) {
    return fail(
      "SERVICE_UNAVAILABLE",
      "Kho ảnh đang được chuẩn bị. Vui lòng thử lại sau ít giây.",
      requestId, 503,
      { "Retry-After": String(
          error instanceof SubmissionFolderBusyError ? error.retryAfterSeconds : 2) },
    );
  }
  throw error;
}
const folderScope = { driveFolderId: expectedFolderId };

let verified;
try {
  verified = await getPublicIntakeStorage().verifyUploadedFile({
    driveFileId, expectedFolderId,
    maxBytes: loadPublicIntakeEnvironment().MAX_UPLOAD_MB * 1024 * 1024,
  });
} catch (error) {
  if (error instanceof UploadVerificationError) {
    await discardIfOrphan(repository, folderScope, driveFileId);
    return fail("VALIDATION_FAILED", error.message, requestId, 400);
  }
  throw error;
}

try {
  const { summary } = await repository.commitOfficerFileUpload({ /* ... */ });
  return NextResponse.json({ ok: true, fileId: summary.fileId, requestId },
    { headers: { "cache-control": "no-store" } });
} catch (error) {
  if (error instanceof OfficerFileMutationRejectedError) {
    await discardIfOrphan(repository, folderScope, verified.driveFileId);
    const { code, status } = REJECTION_HTTP[error.reason];
    return fail(code, error.message, requestId, status);
  }
  // ... IDEMPOTENCY_CONFLICT + nhánh lỗi hạ tầng, đều qua discardIfOrphan ...
}
```

### 20.5. `discardIfOrphan` chịu được `driveFolderId === null`

```diff
--- a/src/modules/public-intake/upload-commit.ts
+++ b/src/modules/public-intake/upload-commit.ts
+ * `driveFolderId` là `null` khi hồ sơ tạo theo Phase lazy Drive folder mà chưa kịp có thư mục —
+ * lúc đó không có thư mục nào để đối chiếu điều kiện 2, nên không xóa gì cả.
  */
 export async function discardIfOrphan(
   repository: { isDriveFileAdopted(driveFileId: string): Promise<boolean> },
-  record: { readonly driveFolderId: string },
+  record: { readonly driveFolderId: string | null },
   driveFileId: string,
 ): Promise<void> {
-  if (!driveFileId) return;
+  if (!driveFileId || !record.driveFolderId) return;
```

### 20.6. Migration đổi số hiệu

```sql
-- supabase/migrations/202607290006_submission_internal_notes.sql
-- Đợt 2A-2: một ô ghi chú nội bộ cho cán bộ, không hiển thị cho người dân.
--
-- Số hiệu 202607290005 đã bị migration `lazy_drive_folder_creation` chiếm trên `main` (hai nhánh
-- cấp cùng số cho hai nội dung khác nhau). Migration này đổi sang 202607290006 — số lớn hơn toàn
-- bộ migration hiện có nên thứ tự áp dụng không phụ thuộc nhánh nào merge trước.
alter table public.public_submissions
  add column if not exists internal_notes text not null default '';
```

### 20.7. Preflight kiểm cả hai migration

```diff
--- a/scripts/preflight-public-intake-v2-migrations.ts
+++ b/scripts/preflight-public-intake-v2-migrations.ts
       leaseIndex ? "OK" : "THIẾU INDEX",
     );
   }
+
+  // 202607290006 — cột ghi chú nội bộ cán bộ (Đợt 2A-2).
+  //
+  // Cột này nằm trong `SUBMISSION_SELECT` dùng chung, nên thiếu nó KHÔNG chỉ làm mất chức năng ghi
+  // chú: mọi truy vấn đọc hồ sơ đều lỗi. Đây là điều kiện chặn deploy, không phải kiểm tra phụ.
+  {
+    const column = await columnExists("public_submissions", "internal_notes");
+    check(
+      "public_submissions.internal_notes tồn tại (202607290006)",
+      column.exists,
+      column.exists ? "OK" : "THIẾU CỘT — migration 202607290006 chưa chạy",
+    );
+  }
```

### 20.8. `StaffSubmissionDetail` là kiểu duy nhất, thêm `internalNotes`

```diff
--- a/src/modules/submissions/detail-types.ts
+++ b/src/modules/submissions/detail-types.ts
+import type { PayloadLayer } from "@/modules/public-intake/payload-layers";
+import type { IntakeChannel, PublicStatus } from "@/modules/public-intake/repository";
 import type { IntakeDraft } from "@/modules/public-intake/types";

 export interface StaffSubmissionDetail {
-  readonly status: string;
+  readonly status: PublicStatus;
-  readonly intakeChannel: string | null;
+  readonly intakeChannel: IntakeChannel;
+  /** Ghi chú nội bộ của cán bộ — không hiển thị cho người dân (migration `202607290006`). */
+  readonly internalNotes: string;
-  readonly payloadLayer: string;
+  readonly payloadLayer: PayloadLayer | "DRAFT";
 }
```

### 20.9. Ảnh chỉ tải khi bấm "Xem ảnh" (giữ tối ưu Phase 2 của `main`)

```diff
--- a/src/components/admin/document-viewer.tsx
+++ b/src/components/admin/document-viewer.tsx
-  /** Chỉ tải ảnh đang được chọn — các ảnh còn lại chờ cán bộ bấm sang tab của nó. */
-  const activeFileId = (files[selectedIndex] || files[0])?.fileId ?? null;
-  useEffect(() => {
-    if (activeFileId) requestPreview(activeFileId);
-  }, [activeFileId, requestPreview]);
+  /**
+   * Ảnh chỉ được tải khi cán bộ **bấm "Xem ảnh"** cho đúng tệp đó.
+   *
+   * Mở hồ sơ không kéo theo bất kỳ byte ảnh nào: phần lớn lượt mở màn duyệt là để đọc/sửa dữ liệu
+   * chứ không phải soi ảnh, mà mỗi ảnh giấy tờ là một lượt gọi Drive cộng một dòng audit.
+   */
+  const [revealedFileIds, setRevealedFileIds] = useState<readonly string[]>([]);
+  const reveal = (fileId: string) => {
+    setRevealedFileIds((current) => (current.includes(fileId) ? current : [...current, fileId]));
+    requestPreview(fileId);
+  };
...
-  const imageSrc = sourceFor(activeFile.fileId);
-  const imageError = errorFor(activeFile.fileId);
+  const revealed = revealedFileIds.includes(activeFile.fileId);
+  const imageSrc = revealed ? sourceFor(activeFile.fileId) : null;
+  const imageError = revealed ? errorFor(activeFile.fileId) : null;
```

### 20.10. Integration test — cách chứng minh "audit lỗi ⇒ ảnh không vào hồ sơ"

```ts
// tests/officer-file-mutations.integration.test.ts (rút gọn)
async function withFailingAudit(action: string, run: () => Promise<void>): Promise<void> {
  await sql.unsafe(`
    create or replace function public.__test_fail_audit() returns trigger as $$
    begin
      if new.action = '${action}' then
        raise exception 'test: audit insert failed';
      end if;
      return new;
    end;
    $$ language plpgsql;
    drop trigger if exists __test_fail_audit on public.audit_logs;
    create trigger __test_fail_audit before insert on public.audit_logs
    for each row execute function public.__test_fail_audit();
  `);
  try { await run(); } finally { /* drop trigger + function */ }
}

it("OF-01: audit lỗi ⇒ ảnh KHÔNG vào hồ sơ, không có request_log để replay", async () => {
  const repository = getPublicIntakeRepository();
  const input = uploadInput();

  await withFailingAudit("SUBMISSION_OFFICER_FILE_UPLOADED", async () => {
    await expect(repository.commitOfficerFileUpload(input)).rejects.toThrow(/audit insert failed/);
  });

  expect(await activeFileCount()).toBe(0);
  const replay = await sql`
    select idempotency_key from public.request_log where idempotency_key = ${input.idempotencyKey}
  `;
  // Nếu request_log còn lại thì lần gọi lại sẽ "thành công" mà ảnh chưa bao giờ được ghi.
  expect(replay.length).toBe(0);

  await repository.commitOfficerFileUpload(input);
  expect(await activeFileCount()).toBe(1);
  expect(await auditCount("SUBMISSION_OFFICER_FILE_UPLOADED")).toBe(1);
});
```

### 20.11. "Từ chối" chuyển vào menu phụ

```diff
--- a/src/components/submission-detail.tsx
+++ b/src/components/submission-detail.tsx
-            <button
-              className="rounded-lg border border-rose-700 bg-rose-50 ..."
-              disabled={busy || submission.status !== "UNDER_REVIEW"}
-              onClick={() => { if (window.confirm("Xác nhận TỪ CHỐI hồ sơ này? ...")) {
-                void action("REJECT"); } }}
-            >
-              Từ chối
-            </button>
-
-            {submission.status === "ACCEPTED" && (
+            {(submission.status === "ACCEPTED" || submission.status === "UNDER_REVIEW") && (
               <details className="ml-1">
                 <summary ...>⋯ Thao tác khác</summary>
                 <div className="mt-2 flex flex-wrap gap-2">
-                  <button ... onClick={openAmendModal}>Điều chỉnh chính thức</button>
+                  {submission.status === "ACCEPTED" && (
+                    <button ... onClick={openAmendModal}>Điều chỉnh chính thức</button>
+                  )}
+                  {submission.status === "UNDER_REVIEW" && (
+                    <button ... title="Từ chối hồ sơ — không hoàn tác được"
+                      onClick={() => { if (window.confirm(
+                        "Xác nhận TỪ CHỐI hồ sơ này? Thao tác này không thể hoàn tác.",
+                      )) { void action("REJECT"); } }}
+                    >
+                      Từ chối
+                    </button>
+                  )}
                 </div>
               </details>
             )}
```

---

## 21. Full unified diff

```text
FULL_DIFF_OMITTED_DUE_TO_SIZE
Reason: unified diff `origin/main...HEAD` khoảng 537 KB (63 tệp, +7990/−996) — vượt xa ngưỡng 150 KB
        của AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md §9.1. Phần lớn dung lượng là nội dung PR #11 đã
        được review ở vòng trước, cộng bốn tài liệu brain (append-only, ~1500 dòng thêm).
Files requiring deeper review (đề nghị ChatGPT yêu cầu riêng nếu cần audit từng dòng):
  1. src/modules/public-intake/repository.ts            — ba method transaction mới (~330 dòng thêm)
  2. src/app/api/submissions/[submissionId]/uploads/complete/route.ts
  3. src/app/api/submissions/[submissionId]/uploads/initiate/route.ts
  4. src/app/api/submissions/[submissionId]/files/[fileId]/route.ts
  5. tests/officer-file-mutations.integration.test.ts   — bộ test chứng minh tính nguyên tử
  6. evidence/PUBLIC_INTAKE_V2_MIGRATIONS_002_006_RUNBOOK.md — mục 0 (xử lý lịch sử số hiệu)
Lệnh lấy đúng phần cần: git diff origin/main...HEAD -- <đường dẫn ở trên>
```

**KHÔNG được coi báo cáo này là đủ source để kiểm toán từng dòng.** Các đoạn ở mục 20 là phần quan
trọng nhất, không phải toàn bộ.

---

## 22. Agent declaration

Agent xác nhận:

- **Đã đọc các tài liệu nguồn sự thật:** `CLAUDE.md`, `AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md`,
  `docs/brain/01-architecture.md` (gồm Code Graph), `docs/brain/04-current-tasks.md`,
  `docs/brain/03-decisions.md`, `AGENTS.md` (phần liên quan), và mã nguồn của cả hai nhánh trước khi
  giải xung đột.
- **Không tự mở rộng phạm vi ngoài phần đã nêu** ở mục 5. Ba chỗ vượt ra ngoài chữ nghĩa của review
  (viewer, test liên tệp, điều kiện hiển thị menu phụ) đã ghi rõ ở "Deviations from approved plan"
  kèm lý do.
- **Không ghi đè thay đổi có sẵn của người dùng** — working tree sạch lúc bắt đầu; `next-env.d.ts` do
  build sửa đã được revert.
- **Không đưa secret vào báo cáo.** Không tệp `.env*` nào bị sửa; không connection string, token hay
  dữ liệu cá nhân thật trong diff hay báo cáo.
- **Không tự merge.** Không thao tác gì lên `main` hay lên nhánh PR #11 gốc.
- **Không tự deploy.** Không áp migration lên bất kỳ database nào.
- **Kết quả test được ghi đúng theo lệnh thực tế:** `npx vitest run` → 800 pass / 24 skip / 0 fail;
  `npx tsc -p tsconfig.typecheck.json --noEmit` → 0 lỗi; `npm run lint` → 0 error / 5 warning;
  `npm run build` → thành công.
- **Các nội dung chưa xác minh đã được đánh dấu rõ:** integration test transaction (SKIP, chưa chạy),
  E2E Preview (chưa chạy), smoke test Preview có đăng nhập (chưa chạy), migration trên database thật
  (chưa áp). AC-04 chỉ ghi `PASS (code) / NOT_TESTED (database)`, không ghi PASS trọn.
