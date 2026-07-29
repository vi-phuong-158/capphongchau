# CHATGPT HANDOFF REPORT

## 1. Report metadata

- Project: `land-ocr-180` (capphongchau) — thu thập và kiểm tra hồ sơ đất đai Phường Phong Châu
- Repository path: `/home/user/capphongchau`
- Generated at: 2026-07-29
- Agent: Claude Code (Sonnet 5)
- Task: Đợt 2A-2 của kế hoạch redesign màn duyệt hồ sơ (`/submissions/[submissionId]`) — thêm đúng
  một ô ghi chú nội bộ tự do cho cán bộ, theo yêu cầu người dùng "ghi chú nội bộ thì không cần
  thiết lắm để thì cũng được, để 1 ô thôi", sau khi 2A-1 (bỏ luồng yêu cầu bổ sung, gộp một đường
  ghi PL3) đã hoàn tất ở commit `8d5b512`. Người dùng yêu cầu rõ: "Thế bắt đầu với 2A-1 thôi" trước
  đó, rồi tiếp tục "Làm tiếp 2A2" ở lượt này.
- Status: `READY_FOR_COMMIT` (đã commit local, **chưa push, chưa merge, chưa deploy, chưa chạy
  migration** trên môi trường thật)
- Source plan: hội thoại trực tiếp với người dùng (không có file kế hoạch riêng cho 2A-2; quyết
  định gốc "để 1 ô ghi chú nội bộ" nằm trong tin nhắn người dùng, được ghi lại thành quyết định kỹ
  thuật ở `docs/brain/03-decisions.md` mục `[2026-07-29] Đợt 2A-2`)
- Source acceptance criteria: không có file riêng; tiêu chí ngầm định là "cán bộ ghi/sửa được một
  ghi chú tự do trên hồ sơ, người dân không thấy" — xem mục 13 bên dưới để đối chiếu chi tiết
- Source security constraints: `CLAUDE.md` (gốc repo) — không hardcode secret, không log PII/CCCD
  đầy đủ/QR thô/token, không tự merge/deploy, phải cập nhật `docs/brain/` khi đổi kiến trúc/API

## 2. Git identity

- Current branch: `claude/redesign-document-review-screen-tfuvov`
- Remote: `origin` (proxy nội bộ tới `vi-phuong-158/capphongchau`)
- Base commit before work: `8d5b512` (feat(submissions): Đợt 2A-1 …)
- Head commit after work: `2379310` (feat(submissions): Đợt 2A-2 - thêm ô ghi chú nội bộ cho cán bộ)
- Commit created: có, 1 commit local (`2379310`), chưa push
- Working tree state: sạch sau commit (đã revert `next-env.d.ts` tự sinh bởi `npm run build` trước
  khi commit — không liên quan task)
- User changes detected before work: không — `git status --short` ở đầu phiên rỗng, nhánh đứng
  đúng tại `8d5b512` (đầu ra 2A-1), không có gì chưa commit của người dùng
- User changes preserved: có (không có gì phải bảo toàn ngoài lịch sử commit sẵn có)

### Git status

```text
# Trước khi bắt đầu (đầu phiên)
$ git status --short && git log --oneline -5
8d5b512 feat(submissions): Đợt 2A-1 - dọn giao diện duyệt hồ sơ, bỏ yêu cầu bổ sung, gộp một đường ghi
c17254c Merge remote-tracking branch 'origin/main'
8ce3756 merge: optimize submissions queue performance
4062f7c perf(submissions): optimize queue pagination and search
2fca1f3 feat(submissions): nâng cấp UI/UX duyệt và biên tập hồ sơ cán bộ (Split-Screen, DocumentViewer, Tabs)
(không có dòng thay đổi nào — working tree sạch)

# Sau khi commit (cuối phiên)
$ git status --short
(rỗng)
$ git log --oneline -3
2379310 feat(submissions): Đợt 2A-2 - thêm ô ghi chú nội bộ cho cán bộ
8d5b512 feat(submissions): Đợt 2A-1 - dọn giao diện duyệt hồ sơ, bỏ yêu cầu bổ sung, gộp một đường ghi
c17254c Merge remote-tracking branch 'origin/main'
```

### Diff statistics

```text
$ git diff --stat 8d5b512 2379310
 docs/brain/01-architecture.md                      |  13 ++
 docs/brain/03-decisions.md                         |  25 +++
 docs/brain/04-current-tasks.md                     |  23 +++
 docs/brain/06-ai-working-log.md                    |  60 +++++++
 scripts/preflight-public-intake-v2-migrations.ts   |  11 ++
 .../[submissionId]/internal-notes/route.ts         | 149 +++++++++++++++++
 src/app/api/submissions/[submissionId]/route.ts    |   1 +
 src/components/submission-detail.tsx               |  74 ++++++++-
 src/modules/public-intake/repository.ts            |  71 +++++++-
 .../202607290005_submission_internal_notes.sql     |   3 +
 tests/submission-internal-notes.test.ts            | 185 +++++++++++++++++++++
 11 files changed, 611 insertions(+), 4 deletions(-)
```

### Name status

```text
$ git diff --name-status 8d5b512 2379310
M	docs/brain/01-architecture.md
M	docs/brain/03-decisions.md
M	docs/brain/04-current-tasks.md
M	docs/brain/06-ai-working-log.md
M	scripts/preflight-public-intake-v2-migrations.ts
A	src/app/api/submissions/[submissionId]/internal-notes/route.ts
M	src/app/api/submissions/[submissionId]/route.ts
M	src/components/submission-detail.tsx
M	src/modules/public-intake/repository.ts
A	supabase/migrations/202607290005_submission_internal_notes.sql
A	tests/submission-internal-notes.test.ts
```

## 3. Executive summary

- **Vấn đề cần giải quyết:** Cán bộ cần một chỗ ghi chú tự do trên hồ sơ (ví dụ: lý do hồ sơ từng
  nộp trùng, ghi chú bàn giao giữa các ca trực) mà không lẫn vào dữ liệu kê khai chính thức
  (`draft_json`/PL3) và không hiển thị cho người dân.
- **Phương án đã thực hiện:** Thêm một cột `internal_notes` (text, mặc định rỗng) trên
  `public_submissions`, một endpoint `PUT /api/submissions/:id/internal-notes` độc lập theo mẫu
  version-guard + idempotency-key sẵn có của `PUT /working-payload`, và một ô `<textarea>` + nút
  "Lưu ghi chú" trong `submission-detail.tsx`. Endpoint **không** phụ thuộc trạng thái hồ sơ hay ai
  đang claim — bất kỳ cán bộ có vai trò quyết định (`SUBMISSION_DECISION_ROLES`) cũng ghi được.
- **Kết quả:** Code hoàn chỉnh, đã tự kiểm bằng test/typecheck/lint/build — tất cả đạt, không có
  regression. Đã commit local (`2379310`).
- **Nội dung chưa hoàn thành:** Migration `202607290005_submission_internal_notes.sql` **chưa chạy**
  trên Preview/Production (không có quyền truy cập Supabase thật trong phiên này). Chưa push, chưa
  merge, chưa deploy — đúng theo yêu cầu không tự thực hiện các thao tác đó khi chưa được yêu cầu rõ.
- **Trạng thái đề xuất:** `READY_FOR_COMMIT` — sẵn sàng để người dùng xem lại diff và quyết định
  push/tạo PR; migration phải chạy trên Preview trước khi deploy code này.

## 4. Baseline before changes

Baseline được đo tại `8d5b512` (đầu ra hoàn chỉnh của Đợt 2A-1, đã có trong log trước đó):

| Check             | Command                | Result                          | Evidence |
| ------------------ | ---------------------- | -------------------------------- | -------- |
| Unit tests         | `npx vitest run`       | 667 pass / 10 skip (78 file)     | Kế thừa từ log 2A-1 (`docs/brain/06-ai-working-log.md`); không chạy lại vì không có thay đổi trung gian giữa hai đợt |
| Integration tests  | (nằm trong `vitest run`, gated) | 2 skip (cần `ACCEPTANCE_SAGA_TEST_DATABASE_URL`) | như trên |
| E2E tests          | không chạy             | N/A — không có Preview thật trong phiên này | — |
| Build              | `npm run build`        | Thành công (Next.js 16.2.10, Turbopack) | log 2A-1 |
| Lint               | `npm run lint`         | 0 lỗi / 5 warning có sẵn (không liên quan task) | log 2A-1 |
| Typecheck          | `npx tsc --noEmit`     | 0 lỗi                            | log 2A-1 |

Không có lỗi baseline nào bị trộn lẫn vào phần dưới — mọi con số "sau khi sửa" ở mục 12 đều so
sánh trực tiếp với các con số trên.

## 5. Scope

### In scope

- Thêm cột `internal_notes` (migration additive).
- Thêm hàm repository `commitInternalNotes` (version guard, idempotency, audit không PII).
- Thêm endpoint `PUT /api/submissions/:submissionId/internal-notes`.
- Trả `internalNotes` trong `GET /api/submissions/:submissionId`.
- Thêm UI ô ghi chú + nút lưu trong `submission-detail.tsx`, gộp vào cảnh báo `beforeunload` sẵn có.
- Cập nhật `scripts/preflight-public-intake-v2-migrations.ts` để kiểm cột mới (bắt buộc, do test
  hiện có `tests/pr6-review-round-two.test.ts` quét toàn bộ migration `202607280*`/`202607290*`).
- Test mới cho endpoint.
- Cập nhật tài liệu `docs/brain/{01-architecture,03-decisions,04-current-tasks,06-ai-working-log}.md`.

### Out of scope (đã báo người dùng, chưa làm trong đợt này)

- 2A-3: chặn người dân gửi lại khi cán bộ đang giữ hồ sơ (race condition); cho claim được hồ sơ cũ
  `NEEDS_SUPPLEMENT`/`RESUBMITTED`.
- 2B: server-priming, lazy-load ảnh, single-file query, lazy AI panel.
- 2C: cán bộ tự tải ảnh giấy tờ cá nhân/GCN bổ sung (tính năng mới, cần endpoint riêng).
- Chạy migration trên Preview/Production thật.
- Push/merge/deploy.

### Deviations from approved plan

- Không có sai lệch so với yêu cầu người dùng ("để 1 ô thôi"). Một quyết định thiết kế cần nêu rõ:
  người dùng không nói rõ ai được sửa ghi chú hay ở trạng thái nào — agent chọn "bất kỳ
  `SUBMISSION_DECISION_ROLES` nào, ở bất kỳ trạng thái hồ sơ nào" (xem lý do ở mục 6). Đây là suy
  luận hợp lý từ ngữ cảnh, không phải quyết định đã chốt bằng văn bản của người dùng — nêu rõ để
  người dùng xác nhận lại nếu muốn giới hạn chặt hơn (ví dụ chỉ người đang claim mới sửa được).

## 6. Decisions implemented

| Decision | Implementation | Evidence |
| -------- | --------------- | -------- |
| Ghi chú tách khỏi `PATCH /:id` chính, không gộp vào nhánh amendment | Endpoint riêng `PUT /internal-notes`, không đụng `draft_json`/canonical projection | `src/app/api/submissions/[submissionId]/internal-notes/route.ts` |
| Không sinh timeline (người dân không thấy) | `commitInternalNotes` không gọi `insertTimeline` | `repository.ts` hàm `commitInternalNotes` |
| Không log nội dung ghi chú vào audit (PII risk) | Audit metadata chỉ chứa `noteLength`, không chứa `internalNotes` | `repository.ts` dòng gọi `this.insertAudit(...)` trong `commitInternalNotes` |
| Bất kỳ cán bộ quyết định nào cũng sửa được, không cần đang claim | Route dùng `requireActiveUser(SUBMISSION_DECISION_ROLES)`, không kiểm `record.claimedBy` | `route.ts` (internal-notes) |
| Giới hạn độ dài để tránh lạm dụng thành trường dữ liệu lớn | `z.string().trim().max(4000)` | schema trong `route.ts` |
| Migration mới phải được preflight script biết tới | Thêm block kiểm `internal_notes` vào `preflight-public-intake-v2-migrations.ts` | test `tests/pr6-review-round-two.test.ts` xanh sau khi thêm |

## 7. Changed files

| File | Change type | Symbols/routes/components affected | Purpose | Risk |
| ---- | ------------ | ----------------------------------- | ------- | ---- |
| `supabase/migrations/202607290005_submission_internal_notes.sql` | Added | `public_submissions.internal_notes` | Thêm cột lưu ghi chú | Thấp — additive, có default, `if not exists` |
| `src/modules/public-intake/repository.ts` | Modified | `SubmissionRecord.internalNotes`, `SubmissionRow.internal_notes`, `SUBMISSION_SELECT`, `mapSubmission`, hàm mới `commitInternalNotes` | Đọc/ghi cột mới với version guard + idempotency | Thấp — theo đúng mẫu các hàm `commit*` sẵn có |
| `src/app/api/submissions/[submissionId]/internal-notes/route.ts` | Added | `PUT` handler | Endpoint ghi ghi chú | Trung bình — endpoint mới, đã có test bao phủ 5 kịch bản |
| `src/app/api/submissions/[submissionId]/route.ts` | Modified | `GET` handler, thêm field `internalNotes` trong response | Trả ghi chú hiện tại cho UI | Thấp — chỉ thêm field, không đổi field cũ |
| `src/components/submission-detail.tsx` | Modified | `Submission` type, state `notesDraft`/`syncedNotes`/`notesSaving`/`notesSaveError`, hàm `saveInternalNotes`, UI `<textarea>` mới, effect `beforeunload` mở rộng | Giao diện sửa/lưu ghi chú | Thấp — UI thuần, không đổi luồng nghiệp vụ khác |
| `scripts/preflight-public-intake-v2-migrations.ts` | Modified | thêm block kiểm `internal_notes` | Đảm bảo script gate deploy biết migration mới | Thấp — chỉ thêm kiểm tra, không đổi kiểm tra cũ |
| `tests/submission-internal-notes.test.ts` | Added | 5 test case cho route mới | Bao phủ hành vi endpoint | — |
| `docs/brain/01-architecture.md` | Modified | Code Graph — thêm `commitInternalNotes`, thêm dòng API mới | Đồng bộ tài liệu kiến trúc | — |
| `docs/brain/03-decisions.md` | Modified | thêm mục quyết định `[2026-07-29] Đợt 2A-2` | Ghi lại lý do quyết định | — |
| `docs/brain/04-current-tasks.md` | Modified | thêm mục theo dõi tiến độ Đợt 2A | Theo dõi task đang làm/chưa làm | — |
| `docs/brain/06-ai-working-log.md` | Modified | thêm entry log theo mẫu bắt buộc | Nhật ký thay đổi | — |

Không có file nào bị xóa. Không đổi symbol/route nào ngoài phạm vi nêu trên.

## 8. Detailed implementation by phase

### Phase 1 — Schema + repository

- Mục tiêu: có chỗ lưu bền vững cho ghi chú, đọc/ghi an toàn với optimistic concurrency.
- Các file liên quan: `supabase/migrations/202607290005_submission_internal_notes.sql`,
  `src/modules/public-intake/repository.ts`.
- Nội dung đã thực hiện: thêm cột `internal_notes text not null default ''`; mở rộng
  `SubmissionRecord`/`SubmissionRow`/`SUBMISSION_SELECT`/`mapSubmission`; thêm hàm
  `commitInternalNotes` dùng `pg_advisory_xact_lock` theo idempotency key (giống mọi hàm `commit*`
  khác trong file), UPDATE có điều kiện `version = $2` để phát hiện xung đột, ghi `request_log` kind
  `INTERNAL_NOTES_EDIT` để hỗ trợ replay idempotent, ghi audit `SUBMISSION_INTERNAL_NOTE_UPDATED`
  chỉ với `noteLength`.
- Nội dung không thực hiện: không chạm `draft_json`, không gọi `refreshCanonicalProjection`, không
  gọi `insertTimeline`.
- Test đã chạy: `npx tsc --noEmit` (gián tiếp qua toàn repo), các test trong Phase 2.
- Kết quả: biên dịch sạch, không ảnh hưởng các hàm `commit*` khác (chỉ thêm, không sửa).
- Rủi ro: migration chưa chạy trên Preview/Production — nếu deploy code trước migration,
  `commitInternalNotes` sẽ lỗi SQL do thiếu cột `internal_notes` (giống rủi ro đã biết với mọi
  migration khác trong dự án — xem `docs/brain/04-current-tasks.md`).

### Phase 2 — API endpoint

- Mục tiêu: cho phép cán bộ ghi/sửa ghi chú qua HTTP, độc lập với `PATCH /:submissionId`.
- Các file liên quan: `src/app/api/submissions/[submissionId]/internal-notes/route.ts`,
  `src/app/api/submissions/[submissionId]/route.ts`.
- Nội dung đã thực hiện: `PUT` handler với schema Zod (`expectedVersion`, `internalNotes` ≤ 4000 ký
  tự), xác thực CSRF, phân quyền `SUBMISSION_DECISION_ROLES`, replay idempotency-key theo scope
  `INTERNAL_NOTES_EDIT:{submissionId}:{key}`, kiểm version trước khi gọi repository, xử lý lỗi
  `AuthorizationError`/`SubmissionVersionConflictError`/`SubmissionIdempotencyConflictError`. `GET`
  handler thêm field `internalNotes` vào response.
- Nội dung không thực hiện: không kiểm `record.claimedBy`, không giới hạn `record.status` (quyết
  định thiết kế — xem mục 5 "Deviations").
- Test đã chạy: `npx vitest run tests/submission-internal-notes.test.ts` — 5/5 pass.
- Kết quả: endpoint hoạt động đúng theo 5 kịch bản test (xem mục 11).
- Rủi ro: vì không kiểm claim/status, một cán bộ bất kỳ có vai trò quyết định có thể sửa ghi chú
  của hồ sơ đang do người khác xử lý — được coi là hành vi mong muốn (ghi chú là kênh trao đổi giữa
  các cán bộ), nhưng cần người dùng xác nhận lại nếu muốn thắt chặt hơn.

### Phase 3 — UI

- Mục tiêu: cán bộ xem/sửa/lưu ghi chú ngay trong màn duyệt hồ sơ.
- Các file liên quan: `src/components/submission-detail.tsx`.
- Nội dung đã thực hiện: thêm `<section>` mới ngay trên Bàn làm việc PL3 với `<textarea maxLength
  ={4000}>` + nút "Lưu ghi chú"; đồng bộ state theo đúng idiom của `useWorkingPayload` (so sánh
  giá trị server ngay trong lúc render, không dùng `useEffect`, tránh một lượt render thừa); gộp
  `notesDirty` vào điều kiện cảnh báo `beforeunload` đã có cho bàn làm việc.
- Nội dung không thực hiện: không thêm debounce/auto-save (yêu cầu người dùng là "1 ô thôi" — giữ
  đơn giản, lưu thủ công bằng nút bấm).
- Test đã chạy: không có test render riêng cho `submission-detail.tsx` (dự án hiện không có test
  React Testing Library cho component này — kiểm bằng `npx tsc --noEmit` + đọc code thủ công).
  **Chưa mở trình duyệt thật để bấm thử** — xem mục 14 "Manual verification required".
- Kết quả: build production thành công, route mới xuất hiện đúng trong danh sách route của
  `npm run build`.
- Rủi ro: chưa xác minh trực quan trên trình duyệt (không có Preview/dev server thật khởi động
  trong phiên này để click-test).

## 9. Behavior before and after

| Scenario | Before | After | Verification |
| -------- | ------ | ----- | ------------ |
| Cán bộ muốn ghi chú nội bộ về hồ sơ | Không có chỗ nào để ghi — chỉ có `draft_json`/PL3 (dữ liệu chính thức, không phải ghi chú tự do) | Có ô `<textarea>` trong màn duyệt, lưu qua `PUT /internal-notes`, đọc lại qua `GET /:id` | `tests/submission-internal-notes.test.ts` ca 1; đọc code UI |
| Sửa ghi chú khi hồ sơ đã `ACCEPTED` và người khác đang/đã giữ | N/A (chưa tồn tại tính năng) | Vẫn sửa được (không kiểm claim/status) | `tests/submission-internal-notes.test.ts` ca 2 |
| Hai tab cùng sửa ghi chú, version lệch | N/A | Trả `409 VERSION_CONFLICT`, không ghi đè âm thầm | `tests/submission-internal-notes.test.ts` ca 3 |
| Ghi chú quá dài | N/A | Trả `400 VALIDATION_FAILED` ở tầng Zod, không chạm DB | `tests/submission-internal-notes.test.ts` ca 5 |
| Rời trang khi ghi chú chưa lưu | Chỉ cảnh báo khi bàn làm việc PL3 dirty | Cảnh báo cả khi ghi chú dirty | đọc code `submission-detail.tsx` (`notesDirty` gộp vào `beforeunload`) |

## 10. API, data and security impact

### Authentication

- Không thay đổi — vẫn qua `requireActiveUser` (session Auth.js hiện có).

### Authorization

- Endpoint mới yêu cầu `SUBMISSION_DECISION_ROLES` (`REVIEW_OFFICER`/`WARD_ADMIN`/`SYSTEM_ADMIN`) —
  cùng danh sách vai trò với `PATCH /:submissionId` hiện có, không tạo vai trò mới.
- **Khác với `PUT /working-payload` và `PATCH` (amendment):** endpoint này **không** kiểm
  `record.claimedBy === user.email` và **không** giới hạn `record.status`. Đây là điểm khác biệt
  có chủ đích cần người dùng xác nhận (xem mục 5, 8 Phase 2).

### DataScope

- Không thay đổi cách xác định phạm vi dữ liệu — vẫn thao tác trên đúng `submissionId` trong URL,
  vẫn kiểm `record.version` trước khi ghi.

### API contract

- Endpoint: `PUT /api/submissions/:submissionId/internal-notes` (mới)
- Method: PUT
- Request before: N/A (endpoint chưa tồn tại)
- Request after: headers `x-csrf-token`, `idempotency-key`, `x-request-id` (tùy chọn); body
  `{ expectedVersion: number, internalNotes: string (≤4000 ký tự) }`
- Response before: N/A
- Response after: `{ submission: { version: number }, requestId: string }` (200); lỗi theo cấu trúc
  chuẩn `{ error: { code, message, requestId } }` (400/403/404/409/500)
- Error handling: `VALIDATION_FAILED` (400 — schema/idempotency-key thiếu hoặc sai), `ACCESS_DENIED`
  (403 — CSRF sai hoặc thiếu vai trò), `NOT_FOUND` (404), `VERSION_CONFLICT` (409),
  `IDEMPOTENCY_CONFLICT` (409), `INTERNAL_ERROR` (500)

- Endpoint: `GET /api/submissions/:submissionId` (đã có từ trước)
- Method: GET
- Request before/after: không đổi
- Response before: không có field `internalNotes`
- Response after: thêm `submission.internalNotes: string` vào response JSON

### Database and migrations

- Migration added: `supabase/migrations/202607290005_submission_internal_notes.sql`
- Tables/columns/indexes affected: `public_submissions.internal_notes` (cột mới, `text not null
  default ''`) — không có index mới, không đổi cột/bảng khác
- Backfill: không cần — cột có default, hồ sơ cũ tự động có `internal_notes = ''`
- Rollback: `alter table public.public_submissions drop column internal_notes;` (an toàn, không có
  dữ liệu phụ thuộc ngược)
- Production action required: **phải chạy migration trên Preview trước, Production sau, TRƯỚC khi
  deploy code này**, rồi xác nhận bằng `npx tsx scripts/preflight-public-intake-v2-migrations.ts`
  (đã thêm bước kiểm cột mới vào script này)

### Validation and file handling

- Trường bắt buộc: `expectedVersion` (số nguyên dương), `internalNotes` (chuỗi, có thể rỗng, đã
  `trim()`, tối đa 4000 ký tự)
- Quy tắc tên file: không áp dụng (không liên quan file)
- Giới hạn file: không áp dụng
- MIME/type validation: không áp dụng
- Xử lý lỗi: Zod `safeParse` trả `400` nếu sai schema; không có xử lý lỗi đặc biệt khác ngoài các
  lỗi chuẩn đã liệt kê ở "API contract"

### Sensitive data

- Dữ liệu nhạy cảm bị tác động: nội dung ghi chú (`internal_notes`) là trường tự do — cán bộ có thể
  vô tình gõ CCCD, số điện thoại, tên người dân vào đây khi diễn giải bối cảnh.
- Log có thể chứa dữ liệu: **audit_logs không lưu nội dung ghi chú** — metadata chỉ có `noteLength`
  (số nguyên). Bản thân cột `internal_notes` trong `public_submissions` là kho lưu chính thức duy
  nhất của nội dung này (không nhân bản sang bảng/log khác).
- Biện pháp che hoặc loại bỏ: giới hạn hiển thị chỉ trong màn cán bộ (route yêu cầu
  `SUBMISSION_DECISION_ROLES`), không có API công khai nào trả trường này; response luôn kèm
  `cache-control: no-store`.

## 11. Tests added or changed

| Test file | Test case | Requirement covered | Result |
| --------- | --------- | -------------------- | ------ |
| `tests/submission-internal-notes.test.ts` | "lưu ghi chú hợp lệ -> 200, gọi commitInternalNotes đúng một lần" | Happy path, đúng field truyền xuống repository | PASS |
| `tests/submission-internal-notes.test.ts` | "cho phép ghi chú ngay cả khi hồ sơ ACCEPTED và người khác đang giữ" | Xác nhận thiết kế "không kiểm claim/status" | PASS |
| `tests/submission-internal-notes.test.ts` | "version lệch -> 409, không gọi commitInternalNotes" | Optimistic concurrency | PASS |
| `tests/submission-internal-notes.test.ts` | "thiếu idempotency-key -> 400" | Validation tầng route | PASS |
| `tests/submission-internal-notes.test.ts` | "ghi chú vượt 4000 ký tự -> 400" | Giới hạn độ dài | PASS |

Không sửa test nào có sẵn. Không có test nào bị xóa hoặc bị bỏ qua (skip) mới.

## 12. Final verification

| Check             | Command                          | Result                        | Evidence |
| ------------------ | --------------------------------- | ------------------------------ | -------- |
| Unit tests         | `npx vitest run`                 | 672 pass / 10 skip (78 file, 76 file pass + 2 skip) | output terminal đã chạy trong phiên |
| Integration tests  | (nằm trong `vitest run`, gated)   | 2 skip (cần `ACCEPTANCE_SAGA_TEST_DATABASE_URL`, không đổi so với baseline) | như trên |
| E2E tests          | không chạy                        | N/A — không có Preview thật    | — |
| Build              | `npm run build`                  | Thành công; route mới `/api/submissions/[submissionId]/internal-notes` xuất hiện đúng trong danh sách route | output terminal |
| Lint               | `npm run lint`                   | 0 lỗi, 5 warning (giống hệt baseline, không phát sinh warning mới) | output terminal |
| Typecheck          | `npx tsc --noEmit -p tsconfig.json` | 0 lỗi                        | output terminal |
| Security check     | không có scanner riêng trong dự án | Đọc thủ công: không log PII/nội dung ghi chú vào audit; CSRF + role check giữ nguyên mẫu sẵn có | mục 10 "Sensitive data" |
| Secret scan        | không chạy công cụ riêng          | Đọc thủ công diff — không có secret/API key nào được thêm | mục 21 (full diff) |

Số liệu test tăng từ 667 pass (baseline 2A-1) lên 672 pass (2A-1 + 5 test mới của 2A-2), không có
test nào chuyển từ pass sang fail/skip.

## 13. Acceptance criteria matrix

| ID | Acceptance criterion | Status | Evidence | Notes |
| --- | --------------------- | ------ | -------- | ----- |
| AC-01 | Cán bộ có một ô ghi chú tự do trên màn duyệt hồ sơ | PASS | `submission-detail.tsx` phần "Ghi chú nội bộ"; build thành công | — |
| AC-02 | Ghi chú không hiển thị cho người dân | PASS | Không có API công khai (`/api/public/*`) nào trả `internalNotes`; không có timeline event nào sinh ra | Đã grep xác nhận `internalNotes` chỉ xuất hiện ở API cán bộ |
| AC-03 | Ghi chú lưu bền vững, đọc lại đúng sau khi tải lại trang | PASS (theo test đơn vị) | `tests/submission-internal-notes.test.ts` ca 1; `GET` route trả `internalNotes` | **Chưa xác minh bằng tay trên trình duyệt thật** — xem mục 14 |
| AC-04 | Không phá vỡ luồng nghiệp vụ khác (2A-1) | PASS | `npx vitest run` toàn bộ 672 pass, không có test cũ nào fail | — |
| AC-05 | Migration chạy an toàn trên dữ liệu hồ sơ cũ | NOT_TESTED | Migration chỉ `add column ... default ''`, không cần backfill về lý thuyết | **Chưa chạy thật trên Preview/Production** — không có quyền truy cập DB thật trong phiên này |
| AC-06 | Không lộ PII mới vào audit log | PASS | Đọc code `commitInternalNotes` — audit chỉ ghi `noteLength` | — |

Không có tiêu chí nào bị đánh dấu FAIL. AC-03 chỉ được xác minh ở tầng test đơn vị (mock
repository), chưa xác minh bằng luồng thật qua trình duyệt + database thật.

## 14. Manual verification required

- Màn hình hoặc quy trình cần người dùng kiểm tra: mở `/submissions/[submissionId]` trên Preview
  (sau khi đã chạy migration), gõ ghi chú, bấm "Lưu ghi chú", tải lại trang, xác nhận ghi chú còn
  nguyên. Thử với hai tab cùng lúc để xác nhận `409 VERSION_CONFLICT` hiển thị đúng thông báo.
- Dữ liệu mẫu cần dùng: một hồ sơ thử (không phải hồ sơ thật của dân) ở bất kỳ trạng thái nào
  (kể cả `ACCEPTED`) để xác nhận ghi chú sửa được không phụ thuộc trạng thái.
- Các bước kiểm tra:
  1. Chạy migration `202607290005` trên Preview.
  2. Chạy `npx tsx scripts/preflight-public-intake-v2-migrations.ts` — xác nhận PASS.
  3. Mở một hồ sơ, gõ ghi chú, lưu, tải lại, xác nhận nội dung còn nguyên.
  4. Thử rời trang khi ghi chú đang dở (chưa lưu) — xác nhận trình duyệt cảnh báo.
  5. Kiểm `audit_logs` — xác nhận action `SUBMISSION_INTERNAL_NOTE_UPDATED` chỉ có `noteLength`,
     không có nội dung ghi chú.
- Kết quả mong đợi: ghi chú lưu/đọc đúng, không lộ nội dung vào audit, không ảnh hưởng các nút
  Tiếp nhận/Hoàn thành xử lý/Từ chối/Bàn làm việc PL3 đã có từ 2A-1.

## 15. Remaining issues and warnings

| Severity | Issue | Impact | Recommended action |
| -------- | ----- | ------ | -------------------- |
| Medium | Migration chưa chạy trên Preview/Production | Deploy code trước migration sẽ làm mọi request `PUT /internal-notes` và `GET /:id` lỗi 500 (thiếu cột) | Chạy migration trước, xác nhận bằng preflight script, rồi mới deploy |
| Low | Chưa xác minh UI bằng tay trên trình duyệt thật | Rủi ro lỗi hiển thị nhỏ (CSS, focus, v.v.) không bắt được bằng test đơn vị | Người dùng/QA mở Preview sau khi migration chạy, làm theo mục 14 |
| Low | Endpoint không kiểm `claimedBy`/`status` (quyết định thiết kế, chưa phải văn bản chốt của người dùng) | Bất kỳ cán bộ quyết định nào cũng sửa ghi chú của hồ sơ người khác đang giữ | Người dùng xác nhận lại có muốn giữ như vậy không; nếu không, thêm điều kiện `isClaimedBy` tương tự `mayStaffEdit` |
| Low | 5 warning ESLint có sẵn từ trước (không liên quan 2A-2) | Không ảnh hưởng chức năng | Không cần xử lý trong đợt này (ngoài phạm vi) |

## 16. Regression and compatibility notes

- Trình duyệt: không đổi — component dùng React/Tailwind sẵn có trong dự án, không thêm dependency.
- Thiết bị: không đổi — không có CSS/behavior riêng cho mobile trong phần thêm mới.
- Node/runtime: route mới khai báo `export const runtime = "nodejs"` và `export const dynamic =
  "force-dynamic"`, giống mọi route submissions khác.
- Database: PostgreSQL qua Supabase (Supavisor pooler) — dùng đúng cơ chế transaction/advisory lock
  đã có, không có driver/query mới lạ.
- API bên ngoài: không đổi — không gọi Google Drive/Gemini/Antigravity.
- Backward compatibility: `GET /:submissionId` chỉ **thêm** field `internalNotes`, không đổi/xóa
  field cũ nào — client cũ (nếu có) vẫn hoạt động bình thường vì bỏ qua field lạ.
- Excel/PDF/import/export compatibility: không ảnh hưởng — `internal_notes` không nằm trong 49 cột
  PL3, không xuất ra file export.
- Khác: không có.

## 17. Rollback plan

- Cách rollback code: `git revert 2379310` (hoặc reset về `8d5b512` nếu chưa push đi đâu) —
  commit độc lập, không đan xen với các thay đổi khác.
- Cách rollback migration: `alter table public.public_submissions drop column internal_notes;`
  (an toàn — không có cột/bảng nào tham chiếu tới `internal_notes`).
- Dữ liệu có cần phục hồi: không — nếu rollback, chỉ mất nội dung ghi chú đã lưu (không phải dữ
  liệu kê khai chính thức của người dân).
- Điều kiện không được rollback tự động: nếu đã deploy code và cán bộ đã lưu ghi chú thật, rollback
  migration sẽ xóa vĩnh viễn các ghi chú đó — cần xác nhận với người dùng trước khi drop column
  trên Production nếu đã có dữ liệu thật.

## 18. Recommended next action

`READY_FOR_COMMIT`

Code đã hoàn chỉnh, tự kiểm tra đầy đủ (test/lint/typecheck/build đều đạt), đã commit local. Bước
tiếp theo là người dùng xem lại diff (mục 21) và quyết định có muốn: (a) điều chỉnh quy tắc quyền
sửa ghi chú (mục 15, Low), (b) chạy migration trên Preview rồi xác minh thủ công theo mục 14, (c)
push nhánh / tạo PR (agent không tự thực hiện các bước này nếu chưa được yêu cầu rõ).

## 19. Commands to reproduce

```bash
npm ci
npm run typecheck
npm run lint
npx vitest run
npx vitest run tests/submission-internal-notes.test.ts
npm run build
# Sau khi có DB Preview với migration đã chạy:
npx tsx scripts/preflight-public-intake-v2-migrations.ts
```

## 20. Key diff excerpts

Endpoint mới — quyền và version guard (không kiểm `claimedBy`/`status`, xem mục 5/15):

```diff
+export async function PUT(
+  request: NextRequest,
+  context: { params: Promise<{ submissionId: string }> },
+): Promise<NextResponse> {
+  ...
+    const user = await requireActiveUser(SUBMISSION_DECISION_ROLES);
+    ...
+    const record = await repository.findById(submissionId);
+    if (!record) return fail("NOT_FOUND", "Không tìm thấy bản kê khai.", requestId, 404);
+    if (record.version !== body.data.expectedVersion) {
+      return fail("VERSION_CONFLICT", "Hồ sơ đã thay đổi. Hãy tải lại trang.", requestId, 409);
+    }
+
+    const updated = await repository.commitInternalNotes({ ... });
```

Repository — audit không lưu nội dung ghi chú (chỉ độ dài):

```diff
+      await this.insertAudit(transaction, {
+        actorEmail: input.actorEmail,
+        action: "SUBMISSION_INTERNAL_NOTE_UPDATED",
+        entityId: input.record.submissionId,
+        requestId: input.requestId,
+        metadata: { noteLength: input.internalNotes.length },
+      });
```

Migration:

```diff
+alter table public.public_submissions
+  add column if not exists internal_notes text not null default '';
```

## 21. Full unified diff

```text
FULL_DIFF_INCLUDED
```

Base: `8d5b512` — Head: `2379310`

```diff
diff --git a/docs/brain/01-architecture.md b/docs/brain/01-architecture.md
index 0eaeee6..785a283 100644
--- a/docs/brain/01-architecture.md
+++ b/docs/brain/01-architecture.md
@@ -290,6 +290,13 @@ src/app/submissions/page.tsx / [submissionId]
     │       land_uses → parcels → owners → certificates → assets
     │       (thứ tự code đã đúng; migration 202607250007 thêm `on delete cascade` làm lưới an toàn
     │        tầng DB — đã CHẠY THẬT và PASS trên Postgres rehearsal, xem 03-decisions.md)
+    ├── commitInternalNotes (transaction) — PUT /api/submissions/:id/internal-notes (2026-07-29, Đợt 2A-2)
+    │   ├── Không kiểm tra claimedBy/status — bất kỳ SUBMISSION_DECISION_ROLES nào cũng ghi được,
+    │   │   ở bất kỳ trạng thái nào (kể cả ACCEPTED/REJECTED) — ghi chú không phải dữ liệu PL3
+    │   ├── Chỉ update internal_notes + version + updated_at, KHÔNG chạm draft_json/canonical
+    │   │   projection, KHÔNG sinh timeline (người dân không bao giờ thấy trường này)
+    │   └── audit SUBMISSION_INTERNAL_NOTE_UPDATED chỉ ghi noteLength, không ghi nội dung ghi chú
+    │       (ô tự do — cán bộ có thể gõ SĐT/tên người dân vào đây)
     ├── commitAccessSecretReset (transaction)
     └── appendAudit / appendExportJob
 
@@ -468,6 +475,12 @@ PATCH /api/submissions/:submissionId                         (2026-07-29, Đợt
                                                         che khuất)
 PUT /api/submissions/:submissionId/working-payload   (2026-07-25, Phase 6 — sửa đầy đủ bản làm
                                                         việc: thửa đất, mục đích sử dụng)
+PUT /api/submissions/:submissionId/internal-notes     (2026-07-29, Đợt 2A-2 — ô ghi chú nội bộ tự
+                                                        do ≤ 4000 ký tự, tách khỏi PATCH chính vì
+                                                        sửa được ở BẤT KỲ trạng thái nào, không cần
+                                                        đang claim. Quyền SUBMISSION_DECISION_ROLES,
+                                                        không sinh timeline, audit chỉ ghi độ dài
+                                                        không ghi nội dung)
 POST /api/submissions/:submissionId/action            (CLAIM/FORCE_CLAIM/RELEASE/TRANSFER/REJECT.
                                                         `REQUEST_SUPPLEMENT` đã bị chặn server-side
                                                         2026-07-29, Đợt 2A-1 — luồng mới không còn
diff --git a/docs/brain/03-decisions.md b/docs/brain/03-decisions.md
index 46a5071..ba4a8d0 100644
--- a/docs/brain/03-decisions.md
+++ b/docs/brain/03-decisions.md
@@ -1,5 +1,30 @@
 # 03 — Technical Decisions
 
+## [2026-07-29] Đợt 2A-2: một ô ghi chú nội bộ, tách khỏi PATCH chính
+
+- **Quyết định:** Thêm đúng một trường ghi chú nội bộ tự do (`internal_notes`, tối đa 4000 ký tự)
+  theo yêu cầu người dùng "không cần thiết lắm, để 1 ô thôi". Không gộp vào
+  `PATCH /api/submissions/:id` — route đó vừa đóng nhánh `STAFF_DRAFT_EDIT` ở 2A-1 và chỉ còn nhận
+  `manualIdentityConfirmation`/`amendmentReason` (yêu cầu hồ sơ `ACCEPTED`); ghi chú nội bộ phải sửa
+  được ở **bất kỳ trạng thái nào** kể cả trước khi claim hoặc sau khi đã `ACCEPTED`/`REJECTED`, nên
+  gộp vào sẽ tái tạo đúng bug staleness vừa đóng. Endpoint mới `PUT
+  /api/submissions/:id/internal-notes` theo mẫu `PUT /working-payload` (version guard +
+  idempotency-key, không canonical projection vì không chạm dữ liệu PL3, không sinh timeline vì
+  người dân không bao giờ thấy trường này).
+- **Quyền:** `SUBMISSION_DECISION_ROLES` (không bắt buộc đang claim hồ sơ) — ghi chú là kênh trao
+  đổi giữa các cán bộ (ví dụ "hồ sơ này từng nộp trùng do..."), khác với sửa `draft`/PL3 vốn chỉ
+  người đang giữ hồ sơ mới được sửa.
+- **Bảo mật/PII:** Audit log `SUBMISSION_INTERNAL_NOTE_UPDATED` chỉ ghi `noteLength`, không lưu lại
+  nội dung ghi chú — cán bộ có thể gõ số điện thoại/tên người dân vào ô tự do này, không cần thêm
+  một bản sao PII nữa nằm ngoài `public_submissions.internal_notes`.
+- **Migration:** `202607290005_submission_internal_notes.sql` — additive
+  (`add column ... default ''`), rollback là `drop column`. **Chưa chạy trên Preview/Production.**
+  Đã thêm bước kiểm cột này vào `scripts/preflight-public-intake-v2-migrations.ts` (bị
+  `tests/pr6-review-round-two.test.ts` bắt lỗi ngay khi thiếu — test đó quét mọi migration
+  `202607280*`/`202607290*` và đòi preflight phải nhắc tới từng migration).
+- **Chưa làm:** 2A-3 (chặn dân gửi lại khi cán bộ đang giữ hồ sơ), 2B (hiệu năng), 2C (cán bộ tự
+  tải ảnh bổ sung).
+
 ## [2026-07-29] Đợt 2A-1: bỏ luồng yêu cầu bổ sung, gộp về một đường ghi PL3
 
 - **Quyết định:** Chốt sau góp ý người dùng — coi mỗi hồ sơ là một bản nộp hoàn chỉnh; cán bộ đối
diff --git a/docs/brain/04-current-tasks.md b/docs/brain/04-current-tasks.md
index 02c4de4..85b6019 100644
--- a/docs/brain/04-current-tasks.md
+++ b/docs/brain/04-current-tasks.md
@@ -9,6 +9,29 @@
 
 ---
 
+## [2026-07-29] Redesign màn duyệt hồ sơ — Đợt 2A (đang làm theo yêu cầu người dùng)
+
+Kế hoạch chốt: coi mỗi hồ sơ là một bản nộp hoàn chỉnh, bỏ luồng "yêu cầu bổ sung"/"gửi lại", chỉ
+giữ 3-4 nút chính (Tiếp nhận/Lưu/Hoàn thành xử lý/Từ chối). Chi tiết quyết định ở `03-decisions.md`
+cùng ngày; Code Graph ở `01-architecture.md`.
+
+- **2A-1 — ĐÃ LÀM (code, chưa merge/push/deploy):** bỏ nút/luồng "yêu cầu bổ sung"
+  (`action: REQUEST_SUPPLEMENT` bị chặn 400), đóng nhánh `STAFF_DRAFT_EDIT` của
+  `PATCH /api/submissions/:id` (chỉ còn `manualIdentityConfirmation`/`amendmentReason`), gộp UI
+  toolbar còn 4 nút chính + `<details>` "Thao tác khác" cho Release/Transfer/ForceClaim/Amend.
+- **2A-2 — ĐÃ LÀM (code, chưa merge/push/deploy):** thêm một ô ghi chú nội bộ tự do
+  (`internal_notes`, endpoint riêng `PUT /internal-notes`, không thuộc PL3/draft, không timeline).
+  **Chưa chạy migration** `202607290005_submission_internal_notes.sql` trên Preview/Production —
+  bắt buộc chạy trước khi deploy, xác nhận bằng
+  `npx tsx scripts/preflight-public-intake-v2-migrations.ts`.
+- **2A-3 — CHƯA LÀM:** chặn người dân gửi lại khi cán bộ đang giữ hồ sơ (race condition), cho
+  claim được hồ sơ cũ `NEEDS_SUPPLEMENT`/`RESUBMITTED`.
+- **2B — CHƯA LÀM:** server-priming, lazy-load ảnh trong split-screen viewer, single-file query
+  (`findActiveFile`), lazy-load AI panel.
+- **2C — CHƯA LÀM (tính năng mới, người dùng yêu cầu thêm):** cán bộ tự tải ảnh giấy tờ
+  cá nhân/GCN bổ sung khi hồ sơ nộp thiếu — cần endpoint mới vì API upload hiện tại của người dân
+  bị khóa theo session cookie + trạng thái hồ sơ, cán bộ không dùng lại được trực tiếp.
+
 ## [2026-07-29] Phase 1 hiệu năng hàng chờ — đã triển khai trong code
 
 - `GET /api/submissions` đã chuyển lọc/tìm/phân trang sang
diff --git a/docs/brain/06-ai-working-log.md b/docs/brain/06-ai-working-log.md
index 44eefd2..7e21031 100644
--- a/docs/brain/06-ai-working-log.md
+++ b/docs/brain/06-ai-working-log.md
@@ -2657,3 +2657,63 @@ repository,storage,route-context,validation}.ts`, `src/app/api/public/submission
   không tự sinh `next-env.d.ts` vào commit (đã revert file này vì build tự đổi
   `.next/dev/types` → `.next/types`, không liên quan task).
 - **Chưa merge, chưa push, chưa deploy.**
+
+## [2026-07-29] Đợt 2A-2 — thêm một ô ghi chú nội bộ cho cán bộ
+
+- **Agent:** Claude Code
+- **Bối cảnh:** Người dùng chốt "ghi chú nội bộ thì không cần thiết lắm, để 1 ô thôi" và yêu cầu
+  làm sau 2A-1. Ghi chú này **không** thuộc `draft_json`/PL3, không sinh timeline (người dân không
+  bao giờ thấy), không phụ thuộc trạng thái hồ sơ hay ai đang nhận xử lý — nên tách hẳn khỏi
+  `PATCH /:submissionId` (route đó vừa đóng nhánh `STAFF_DRAFT_EDIT` ở 2A-1) thành một endpoint
+  riêng, theo đúng mẫu `PUT /working-payload` (version guard + idempotency-key, không canonical
+  projection vì không chạm dữ liệu PL3).
+- **Thay đổi:**
+  1. **Migration mới** `202607290005_submission_internal_notes.sql`: thêm cột
+     `public_submissions.internal_notes text not null default ''`.
+  2. **`repository.ts`:** thêm `internalNotes` vào `SubmissionRecord`/`SubmissionRow`, nối vào
+     `SUBMISSION_SELECT` và `mapSubmission`. Thêm hàm `commitInternalNotes` (version guard +
+     `pg_advisory_xact_lock` theo idempotency key + `request_log` kind `INTERNAL_NOTES_EDIT`) —
+     ghi audit `SUBMISSION_INTERNAL_NOTE_UPDATED` nhưng **không** lưu nội dung ghi chú vào
+     metadata audit, chỉ lưu `noteLength` (cán bộ có thể gõ SĐT/tên người dân vào ô tự do này,
+     không cần thêm một bản sao PII nữa trong audit).
+  3. **Endpoint mới** `PUT /api/submissions/:submissionId/internal-notes` — schema
+     `{ expectedVersion, internalNotes (≤ 4000 ký tự) }`, quyền `SUBMISSION_DECISION_ROLES`
+     (không yêu cầu đang claim hồ sơ, không giới hạn trạng thái — bất kỳ cán bộ có quyền quyết
+     định nào cũng ghi được, kể cả hồ sơ đã `ACCEPTED`/`REJECTED`).
+  4. **`GET /api/submissions/:submissionId`:** thêm `internalNotes` vào response.
+  5. **`submission-detail.tsx`:** thêm state đồng bộ ghi chú theo đúng idiom của
+     `useWorkingPayload` (so `submission.internalNotes` với bản đã đồng bộ ngay trong lúc render,
+     không dùng `useEffect` để tránh một lượt render thừa); thêm ô `<textarea>` + nút "Lưu ghi chú"
+     trong cột phải, phía trên Bàn làm việc PL3; gộp `notesDirty` vào cảnh báo `beforeunload` sẵn
+     có của bàn làm việc.
+  6. **`scripts/preflight-public-intake-v2-migrations.ts`:** thêm kiểm tra cột `internal_notes`
+     (bắt buộc — `tests/pr6-review-round-two.test.ts` quét mọi migration `202607280*`/`202607290*`
+     và đòi preflight phải nhắc tới từng migration, phát hiện ngay migration mới của tôi ban đầu
+     bị bỏ sót).
+- **File đã sửa:**
+  - `supabase/migrations/202607290005_submission_internal_notes.sql` (mới)
+  - `src/modules/public-intake/repository.ts`
+  - `src/app/api/submissions/[submissionId]/internal-notes/route.ts` (mới)
+  - `src/app/api/submissions/[submissionId]/route.ts`
+  - `src/components/submission-detail.tsx`
+  - `scripts/preflight-public-intake-v2-migrations.ts`
+- **Test mới:** `tests/submission-internal-notes.test.ts` — 5 ca: lưu hợp lệ gọi
+  `commitInternalNotes` đúng một lần; cho phép ghi kể cả hồ sơ `ACCEPTED` và người khác đang giữ;
+  version lệch trả 409 không gọi commit; thiếu idempotency-key trả 400; ghi chú > 4000 ký tự trả
+  400.
+- **Chưa làm (nằm ở đợt sau):** 2A-3 (chặn dân gửi lại khi cán bộ đang giữ + cho tiếp nhận hồ sơ
+  cũ `NEEDS_SUPPLEMENT`), 2B (server-prime, lazy ảnh, single-file query, lazy AI panel), 2C (cán bộ
+  tự tải ảnh bổ sung).
+- **Migration:** `202607290005_submission_internal_notes.sql` — additive thuần túy (`add column …
+  default ''`), không cần backfill, rollback là `drop column`. **Chưa chạy trên Preview/Production**
+  — phải chạy trước khi deploy code này, rồi xác nhận bằng
+  `npx tsx scripts/preflight-public-intake-v2-migrations.ts`.
+- **Kiểm tra:** baseline trước khi sửa — `npm run typecheck` 0 lỗi, `npm run lint` 0 lỗi/5 warning
+  có sẵn, `npm test` 667 pass/10 skip (kế thừa từ 2A-1). Sau khi sửa —
+  `npm run typecheck` 0 lỗi, `npm run lint` 0 lỗi/5 warning (không đổi so với baseline),
+  `npm test` 672 pass/10 skip (667 + 5 test mới, không có test nào fail/mới skip),
+  `npm run build` (Next.js 16.2.10, Turbopack) đạt và liệt kê đúng route mới
+  `/api/submissions/[submissionId]/internal-notes`. `next-env.d.ts` bị build tự đổi lại đã revert,
+  không đưa vào commit.
+- **Chưa merge, chưa push, chưa deploy.**
diff --git a/scripts/preflight-public-intake-v2-migrations.ts b/scripts/preflight-public-intake-v2-migrations.ts
index 79d9d3f..775853e 100644
--- a/scripts/preflight-public-intake-v2-migrations.ts
+++ b/scripts/preflight-public-intake-v2-migrations.ts
@@ -18,6 +18,7 @@
  *   202607290002_full_pl3_editor.sql
  *   202607290003_drop_working_payload_override_columns.sql
  *   202607290004_queue_search_performance.sql
+ *   202607290005_submission_internal_notes.sql
  */
 
 import { loadEnvConfig } from "@next/env";
@@ -367,6 +368,16 @@ async function runChecks(): Promise<CheckResult[]> {
     }
   }
 
+  // 202607290005 — cột ghi chú nội bộ cán bộ (Đợt 2A-2).
+  {
+    const column = await columnExists("public_submissions", "internal_notes");
+    check(
+      "public_submissions.internal_notes tồn tại (202607290005)",
+      column.exists,
+      column.exists ? "OK" : "THIẾU CỘT — migration 202607290005 chưa chạy",
+    );
+  }
+
   // Kiểm tra dữ liệu — hồ sơ cũ phải nhất quán, không phải chỉ schema đúng.
   {
     const database = getDatabase();
diff --git a/src/app/api/submissions/[submissionId]/internal-notes/route.ts b/src/app/api/submissions/[submissionId]/internal-notes/route.ts
new file mode 100644
index 0000000..d697687
--- /dev/null
+++ b/src/app/api/submissions/[submissionId]/internal-notes/route.ts
@@ -0,0 +1,149 @@
+import { createHash, randomUUID } from "node:crypto";
+
+import { NextRequest, NextResponse } from "next/server";
+import { z } from "zod";
+
+import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
+import { verifyCsrfToken } from "@/modules/auth/csrf";
+import { createApiErrorPayload } from "@/modules/common/api-error";
+import { loadServerEnvironment } from "@/modules/common/env";
+import {
+  getPublicIntakeRepository,
+  SubmissionIdempotencyConflictError,
+  SubmissionVersionConflictError,
+} from "@/modules/public-intake/repository";
+import { SUBMISSION_DECISION_ROLES } from "@/modules/submissions/review";
+
+export const runtime = "nodejs";
+export const dynamic = "force-dynamic";
+
+const schema = z.object({
+  expectedVersion: z.number().int().positive(),
+  internalNotes: z.string().trim().max(4000),
+});
+
+function fail(
+  code:
+    | "ACCESS_DENIED"
+    | "UNAUTHENTICATED"
+    | "VALIDATION_FAILED"
+    | "NOT_FOUND"
+    | "VERSION_CONFLICT"
+    | "IDEMPOTENCY_CONFLICT"
+    | "INTERNAL_ERROR",
+  message: string,
+  requestId: string,
+  status: number,
+): NextResponse {
+  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
+    status,
+    headers: { "cache-control": "no-store" },
+  });
+}
+
+/**
+ * Ghi chú nội bộ (Đợt 2A-2) — một ô tự do cho cán bộ, tách hẳn khỏi `PATCH /:submissionId` vì
+ * không thuộc `draft_json`/PL3 và không phụ thuộc trạng thái hồ sơ hay ai đang nhận xử lý. Bất kỳ
+ * cán bộ nào có quyền quyết định hồ sơ đều sửa được, ở bất kỳ trạng thái nào.
+ */
+export async function PUT(
+  request: NextRequest,
+  context: { params: Promise<{ submissionId: string }> },
+): Promise<NextResponse> {
+  const requestId = request.headers.get("x-request-id") ?? randomUUID();
+  try {
+    const body = schema.safeParse(await request.json());
+    const idempotencyKey = request.headers.get("idempotency-key");
+    if (!body.success || !idempotencyKey || idempotencyKey.length > 256) {
+      return fail(
+        "VALIDATION_FAILED",
+        "Dữ liệu ghi chú hoặc idempotency key không hợp lệ.",
+        requestId,
+        400,
+      );
+    }
+    const user = await requireActiveUser(SUBMISSION_DECISION_ROLES);
+    const environment = loadServerEnvironment();
+    if (
+      !verifyCsrfToken(environment.AUTH_SECRET, user.email, request.headers.get("x-csrf-token"))
+    ) {
+      return fail("ACCESS_DENIED", "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.", requestId, 403);
+    }
+
+    const { submissionId } = await context.params;
+    const repository = getPublicIntakeRepository();
+    const scopedIdempotencyKey = `INTERNAL_NOTES_EDIT:${submissionId}:${idempotencyKey}`;
+    const mutationHash = createHash("sha256")
+      .update(
+        JSON.stringify({
+          submissionId,
+          actorEmail: user.email,
+          expectedVersion: body.data.expectedVersion,
+          internalNotes: body.data.internalNotes,
+        }),
+      )
+      .digest("hex");
+
+    const replay = await repository.findStoredMutation(scopedIdempotencyKey, "INTERNAL_NOTES_EDIT");
+    if (replay) {
+      if (replay.mutationHash !== mutationHash) {
+        return fail(
+          "IDEMPOTENCY_CONFLICT",
+          "Khóa chống gửi trùng đã dùng cho thao tác khác.",
+          requestId,
+          409,
+        );
+      }
+      const version = replay.response.version;
+      if (typeof version !== "number") {
+        return fail(
+          "INTERNAL_ERROR",
+          "Không thể khôi phục kết quả thao tác trước.",
+          requestId,
+          500,
+        );
+      }
+      return NextResponse.json(
+        { submission: { version }, requestId },
+        { headers: { "cache-control": "no-store" } },
+      );
+    }
+
+    const record = await repository.findById(submissionId);
+    if (!record) return fail("NOT_FOUND", "Không tìm thấy bản kê khai.", requestId, 404);
+    if (record.version !== body.data.expectedVersion) {
+      return fail("VERSION_CONFLICT", "Hồ sơ đã thay đổi. Hãy tải lại trang.", requestId, 409);
+    }
+
+    const updated = await repository.commitInternalNotes({
+      record,
+      expectedVersion: body.data.expectedVersion,
+      internalNotes: body.data.internalNotes,
+      actorEmail: user.email,
+      requestId,
+      idempotencyKey: scopedIdempotencyKey,
+      mutationHash,
+    });
+
+    return NextResponse.json(
+      { submission: { version: updated.version }, requestId },
+      { headers: { "cache-control": "no-store" } },
+    );
+  } catch (error) {
+    if (error instanceof AuthorizationError) {
+      return fail(
+        error.kind,
+        error.message,
+        requestId,
+        error.kind === "UNAUTHENTICATED" ? 401 : 403,
+      );
+    }
+    if (error instanceof SubmissionVersionConflictError) {
+      return fail("VERSION_CONFLICT", error.message, requestId, 409);
+    }
+    if (error instanceof SubmissionIdempotencyConflictError) {
+      return fail("IDEMPOTENCY_CONFLICT", error.message, requestId, 409);
+    }
+    return fail("INTERNAL_ERROR", "Không thể lưu ghi chú nội bộ.", requestId, 500);
+  }
+}
diff --git a/src/app/api/submissions/[submissionId]/route.ts b/src/app/api/submissions/[submissionId]/route.ts
index 28e6b68..f0adf37 100644
--- a/src/app/api/submissions/[submissionId]/route.ts
+++ b/src/app/api/submissions/[submissionId]/route.ts
@@ -138,6 +138,7 @@ export async function GET(
           updatedAt: record.updatedAt,
           officialCaseId: record.officialCaseId || null,
           acceptStep: record.acceptStep || null,
+          internalNotes: record.internalNotes,
           // Màn cán bộ luôn sửa/xem lớp dữ liệu đang có hiệu lực. Khi đã nhận xử lý thì đó là
           // `working_payload`, không phải `draft_json` cũ của người dân.
           draft: effectivePayload(record),
diff --git a/src/components/submission-detail.tsx b/src/components/submission-detail.tsx
index e99adf5..a097fac 100644
--- a/src/components/submission-detail.tsx
+++ b/src/components/submission-detail.tsx
@@ -34,6 +34,7 @@ type Submission = {
   officialCaseId: string | null;
   acceptStep: string | null;
   canResetAccessSecret: boolean;
+  internalNotes: string;
   draft: IntakeDraft | null;
   files: {
     fileId: string;
@@ -164,20 +165,31 @@ export function SubmissionDetail({
     submission?.version ?? 0,
     isClaimedByMe,
   );
+  /** Ghi chú nội bộ (Đợt 2A-2) — một ô tự do, đồng bộ lại khi hồ sơ tải/tải lại (như bàn làm việc). */
+  const [notesDraft, setNotesDraft] = useState("");
+  const [syncedNotes, setSyncedNotes] = useState<string | null>(null);
+  const [notesSaving, setNotesSaving] = useState(false);
+  const [notesSaveError, setNotesSaveError] = useState<string | null>(null);
+  const currentNotes = submission?.internalNotes ?? null;
+  if (currentNotes !== null && currentNotes !== syncedNotes) {
+    setSyncedNotes(currentNotes);
+    setNotesDraft(currentNotes);
+  }
+  const notesDirty = submission !== null && notesDraft !== submission.internalNotes;
   useEffect(() => {
     loadSubmission(submissionId)
       .then(setSubmission)
       .catch(() => setMessage("Không thể tải hồ sơ."));
   }, [submissionId]);
-  /** Cảnh báo rời trang khi bàn làm việc còn thay đổi chưa lưu (§3.2). */
+  /** Cảnh báo rời trang khi bàn làm việc hoặc ghi chú nội bộ còn thay đổi chưa lưu (§3.2). */
   useEffect(() => {
-    if (!workingPayload.isDirty) return;
+    if (!workingPayload.isDirty && !notesDirty) return;
     const handleBeforeUnload = (event: BeforeUnloadEvent) => {
       event.preventDefault();
     };
     window.addEventListener("beforeunload", handleBeforeUnload);
     return () => window.removeEventListener("beforeunload", handleBeforeUnload);
-  }, [workingPayload.isDirty]);
+  }, [workingPayload.isDirty, notesDirty]);
   function openAmendModal() {
     if (!submission?.draft) return;
     setAmendmentReason("");
@@ -345,6 +357,35 @@ export function SubmissionDetail({
       setBusy(false);
     }
   }
+  async function saveInternalNotes() {
+    if (!submission) return;
+    setNotesSaving(true);
+    setNotesSaveError(null);
+    try {
+      const token = await csrfToken();
+      const response = await fetch(`/api/submissions/${submission.submissionId}/internal-notes`, {
+        method: "PUT",
+        headers: {
+          "content-type": "application/json",
+          "x-csrf-token": token,
+          "idempotency-key": crypto.randomUUID(),
+        },
+        body: JSON.stringify({ expectedVersion: submission.version, internalNotes: notesDraft }),
+      });
+      const data = (await response.json()) as {
+        submission?: { version: number };
+        error?: { message: string };
+      };
+      if (!response.ok || !data.submission) {
+        throw new Error(data.error?.message ?? "Không thể lưu ghi chú.");
+      }
+      setSubmission(await loadSubmission(submission.submissionId));
+    } catch (error) {
+      setNotesSaveError(error instanceof Error ? error.message : "Không thể lưu ghi chú.");
+    } finally {
+      setNotesSaving(false);
+    }
+  }
   /**
    * Tiếp nhận chính thức: sinh mã hồ sơ, chuyển file sang `02_CASES`, ghi CASES/OWNERS/
    * CERTIFICATES/PARCELS/ASSETS/FILES. Saga có checkpoint nên bấm lại sau khi lỗi mạng là an toàn —
@@ -668,6 +709,33 @@ export function SubmissionDetail({
             </div>
           </div>
 
+          {/* Ghi chú nội bộ (Đợt 2A-2) — chỉ cán bộ thấy, không thuộc hồ sơ kê khai. */}
+          <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
+            <h2 className="text-sm font-bold text-stone-900">Ghi chú nội bộ</h2>
+            <p className="mt-0.5 text-xs text-stone-500">
+              Chỉ cán bộ nhìn thấy, không hiển thị cho người dân.
+            </p>
+            <textarea
+              className="pc-textarea mt-2"
+              maxLength={4000}
+              onChange={(event) => setNotesDraft(event.target.value)}
+              placeholder="Ví dụ: hồ sơ này từng nộp trùng do thiếu ảnh GCN mặt sau."
+              rows={3}
+              value={notesDraft}
+            />
+            <div className="mt-2 flex items-center gap-2">
+              <button
+                className="pc-button-quiet text-xs"
+                disabled={notesSaving || !notesDirty}
+                onClick={() => void saveInternalNotes()}
+                type="button"
+              >
+                {notesSaving ? "Đang lưu…" : "Lưu ghi chú"}
+              </button>
+              {notesSaveError && <span className="text-xs text-rose-700">{notesSaveError}</span>}
+            </div>
+          </section>
+
           {/* Working Payload Editor (Full 49 PL3 columns tabbed) */}
           {submission.status === "UNDER_REVIEW" && workingPayload.draft ? (
             <section
diff --git a/src/modules/public-intake/repository.ts b/src/modules/public-intake/repository.ts
index 46578de..d350e1e 100644
--- a/src/modules/public-intake/repository.ts
+++ b/src/modules/public-intake/repository.ts
@@ -105,6 +105,8 @@ export interface SubmissionRecord {
   readonly fileSummaries: readonly PublicFileSummary[];
   /** Locator ổn định, giữ tên cũ để cookie phiên v2 tiếp tục tương thích sau migration. */
   readonly rowIndex: number;
+  /** Ghi chú nội bộ của cán bộ. Chỉ hiển thị trong màn duyệt hồ sơ, không lộ ra cổng công khai. */
+  readonly internalNotes: string;
 }
 
 export interface SubmissionSummary {
@@ -231,6 +233,7 @@ interface SubmissionRow {
   readonly access_version: number;
   readonly file_summary_json: PublicFileSummary[] | null;
   readonly legacy_row_index: string | number;
+  readonly internal_notes: string | null;
 }
 
 interface FileRow {
@@ -256,7 +259,8 @@ const SUBMISSION_SELECT = `
   created_at, updated_at, draft_json, access_version, file_summary_json, legacy_row_index,
   citizen_payload_json, citizen_payload_version, citizen_payload_at,
   working_payload_json, working_payload_at, working_payload_by,
-  official_payload_json, official_payload_at, official_payload_by
+  official_payload_json, official_payload_at, official_payload_by,
+  internal_notes
 `;
 
 function asIso(value: Date | null | undefined): string {
@@ -336,6 +340,7 @@ function mapSubmission(row: SubmissionRow): SubmissionRecord {
     accessVersion: row.access_version,
     fileSummaries: decodeFileSummaries(row.file_summary_json),
     rowIndex: Number(row.legacy_row_index),
+    internalNotes: row.internal_notes ?? "",
   };
 }
 
@@ -979,6 +984,70 @@ export class PublicIntakeRepository {
     });
   }
 
+  /**
+   * Ghi chú nội bộ của cán bộ — một ô tự do, không thuộc `draft_json`/PL3, không sinh timeline
+   * (người dân không bao giờ thấy). Tách khỏi `commitStaffDraftEdit`/`commitOfficialAmendment` vì
+   * không gắn với trạng thái hồ sơ hay quyền "đang nhận xử lý": bất kỳ cán bộ nào có quyền quyết
+   * định hồ sơ cũng ghi được, ở bất kỳ trạng thái nào (kể cả đã `ACCEPTED`/`REJECTED`).
+   */
+  async commitInternalNotes(input: {
+    record: SubmissionRecord;
+    expectedVersion: number;
+    internalNotes: string;
+    actorEmail: string;
+    requestId: string;
+    idempotencyKey: string;
+    mutationHash: string;
+  }): Promise<SubmissionRecord> {
+    const database = getDatabase();
+    return database.begin(async (transaction) => {
+      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
+      const cached = await transaction<{ mutation_hash: string }[]>`
+        select mutation_hash from public.request_log where idempotency_key = ${input.idempotencyKey}
+      `;
+      if (cached[0]) {
+        if (cached[0].mutation_hash !== input.mutationHash)
+          throw new SubmissionIdempotencyConflictError();
+        const replayRows = await transaction.unsafe<SubmissionRow[]>(
+          `select ${SUBMISSION_SELECT} from public.public_submissions where submission_id = $1`,
+          [input.record.submissionId],
+        );
+        if (!replayRows[0]) throw new Error("Không tìm thấy bản kê khai khi phát lại thao tác.");
+        return mapSubmission(replayRows[0]);
+      }
+
+      const rows = await transaction.unsafe<SubmissionRow[]>(
+        `update public.public_submissions set
+           internal_notes = $3, version = version + 1, updated_at = now()
+         where submission_id = $1 and version = $2
+         returning ${SUBMISSION_SELECT}`,
+        [input.record.submissionId, input.expectedVersion, input.internalNotes],
+      );
+      if (!rows[0]) throw new SubmissionVersionConflictError();
+      const next = mapSubmission(rows[0]);
+
+      // Không lưu nội dung ghi chú vào audit — đây là chỗ cán bộ có thể gõ số điện thoại, tên
+      // người dân khi diễn giải; audit chỉ cần biết AI đã sửa và độ dài, không cần bản sao PII.
+      await this.insertAudit(transaction, {
+        actorEmail: input.actorEmail,
+        action: "SUBMISSION_INTERNAL_NOTE_UPDATED",
+        entityId: input.record.submissionId,
+        requestId: input.requestId,
+        metadata: { noteLength: input.internalNotes.length },
+      });
+      await transaction`
+        insert into public.request_log
+          (idempotency_key, request_id, kind, mutation_hash, response_json, expires_at)
+        values (
+          ${input.idempotencyKey}, ${input.requestId}, 'INTERNAL_NOTES_EDIT', ${input.mutationHash},
+          ${JSON.stringify({ version: next.version })}::jsonb,
+          now() + interval '24 hours'
+        )
+      `;
+      return next;
+    });
+  }
+
   async commitWorkingPayload(input: {
     record: SubmissionRecord;
     expectedVersion: number;
diff --git a/supabase/migrations/202607290005_submission_internal_notes.sql b/supabase/migrations/202607290005_submission_internal_notes.sql
new file mode 100644
index 0000000..56eef01
--- /dev/null
+++ b/supabase/migrations/202607290005_submission_internal_notes.sql
@@ -0,0 +1,3 @@
+-- Đợt 2A-2: một ô ghi chú nội bộ cho cán bộ, không hiển thị cho người dân.
+alter table public.public_submissions
+  add column if not exists internal_notes text not null default '';
diff --git a/tests/submission-internal-notes.test.ts b/tests/submission-internal-notes.test.ts
new file mode 100644
index 0000000..12ab413
--- /dev/null
+++ b/tests/submission-internal-notes.test.ts
@@ -0,0 +1,185 @@
+import { NextRequest } from "next/server";
+import { beforeEach, describe, expect, it, vi } from "vitest";
+
+import { PUT } from "@/app/api/submissions/[submissionId]/internal-notes/route";
+import { UserRole } from "@/modules/common/domain";
+import type { SubmissionRecord } from "@/modules/public-intake/repository";
+import { emptyOwner, type IntakeDraft } from "@/modules/public-intake/types";
+
+const mockUser = {
+  email: "officer@phongchau.gov.vn",
+  displayName: "Cán bộ Test",
+  roles: [UserRole.REVIEW_OFFICER],
+  id: "user_1",
+};
+
+vi.mock("@/modules/auth/authorization", () => ({
+  requireActiveUser: vi.fn().mockImplementation(async () => mockUser),
+  AuthorizationError: class AuthorizationError extends Error {
+    kind: "ACCESS_DENIED" | "UNAUTHENTICATED";
+    constructor(kind: "ACCESS_DENIED" | "UNAUTHENTICATED", message: string) {
+      super(message);
+      this.kind = kind;
+    }
+  },
+}));
+
+vi.mock("@/modules/auth/csrf", () => ({
+  verifyCsrfToken: vi.fn().mockReturnValue(true),
+}));
+
+vi.mock("@/modules/common/env", () => ({
+  loadServerEnvironment: vi.fn().mockReturnValue({
+    AUTH_SECRET: "mock-secret-at-least-32-chars-long-security",
+    DATA_HASH_PEPPER: "mock-pepper-at-least-32-chars-long-value",
+  }),
+}));
+
+const mockFindById = vi.fn();
+const mockFindStoredMutation = vi.fn();
+const mockCommitInternalNotes = vi.fn();
+
+vi.mock("@/modules/public-intake/repository", () => ({
+  getPublicIntakeRepository: vi.fn().mockReturnValue({
+    findById: (...args: unknown[]) => mockFindById(...args),
+    findStoredMutation: (...args: unknown[]) => mockFindStoredMutation(...args),
+    commitInternalNotes: (...args: unknown[]) => mockCommitInternalNotes(...args),
+  }),
+  SubmissionIdempotencyConflictError: class SubmissionIdempotencyConflictError extends Error {},
+  SubmissionVersionConflictError: class SubmissionVersionConflictError extends Error {},
+}));
+
+function makeDraft(): IntakeDraft {
+  return {
+    certificate: { issueNumber: "AD 123456", issueDate: "2020-01-01", registryNumber: "CH001" },
+    owners: [{ ...emptyOwner("owner_1"), fullName: "Nguyen Van A" }],
+    parcels: [],
+    assets: [],
+    phone: "0912345678",
+    consentAccepted: true,
+  };
+}
+
+function makeRecord(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
+  return {
+    submissionId: "sub_1",
+    receiptCode: "PC-KK-2026-0001",
+    status: "UNDER_REVIEW",
+    phone: "0912345678",
+    version: 1,
+    accessCodeHash: "hash",
+    failedAttempts: 0,
+    lockedUntil: "",
+    consentVersion: "v1",
+    consentedAt: "2026-07-29T08:00:00.000Z",
+    retentionUntil: "",
+    driveFolderId: "folder_1",
+    officialCaseId: "",
+    acceptStep: "",
+    claimedBy: "officer@phongchau.gov.vn",
+    claimedByDisplayName: "Cán bộ Test",
+    intakeChannel: "SELF_SERVICE",
+    assistedByEmail: "",
+    assistedByDisplayName: "",
+    assistedAt: "",
+    claimedAt: "2026-07-29T08:00:00.000Z",
+    createdAt: "2026-07-29T08:00:00.000Z",
+    updatedAt: "2026-07-29T08:00:00.000Z",
+    draft: makeDraft(),
+    accessVersion: 1,
+    fileSummaries: [],
+    rowIndex: 1,
+    internalNotes: "",
+    ...overrides,
+  };
+}
+
+function makeRequest(body: Record<string, unknown>): NextRequest {
+  return new NextRequest("http://localhost:3000/api/submissions/sub_1/internal-notes", {
+    method: "PUT",
+    headers: {
+      "x-csrf-token": "valid-csrf",
+      "idempotency-key": "test-key",
+      "x-request-id": "req-test",
+    },
+    body: JSON.stringify(body),
+  });
+}
+
+describe("PUT /api/submissions/:id/internal-notes", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockFindStoredMutation.mockResolvedValue(null);
+  });
+
+  it("lưu ghi chú hợp lệ -> 200, gọi commitInternalNotes đúng một lần", async () => {
+    const record = makeRecord();
+    mockFindById.mockResolvedValue(record);
+    mockCommitInternalNotes.mockResolvedValue({ ...record, version: 2 });
+
+    const response = await PUT(
+      makeRequest({ expectedVersion: 1, internalNotes: "Hồ sơ nộp trùng, đã xác nhận với dân." }),
+      { params: Promise.resolve({ submissionId: "sub_1" }) },
+    );
+
+    expect(response.status).toBe(200);
+    const data = (await response.json()) as { submission: { version: number } };
+    expect(data.submission.version).toBe(2);
+    expect(mockCommitInternalNotes).toHaveBeenCalledTimes(1);
+    expect(mockCommitInternalNotes.mock.calls[0][0]).toMatchObject({
+      expectedVersion: 1,
+      internalNotes: "Hồ sơ nộp trùng, đã xác nhận với dân.",
+    });
+  });
+
+  it("cho phép ghi chú ngay cả khi hồ sơ ACCEPTED và người khác đang giữ", async () => {
+    const record = makeRecord({
+      status: "ACCEPTED",
+      officialCaseId: "PHONGCHAU-2026-000001",
+      claimedBy: "other_officer@phongchau.gov.vn",
+    });
+    mockFindById.mockResolvedValue(record);
+    mockCommitInternalNotes.mockResolvedValue({ ...record, version: 2 });
+
+    const response = await PUT(makeRequest({ expectedVersion: 1, internalNotes: "OK" }), {
+      params: Promise.resolve({ submissionId: "sub_1" }),
+    });
+
+    expect(response.status).toBe(200);
+    expect(mockCommitInternalNotes).toHaveBeenCalledTimes(1);
+  });
+
+  it("version lệch -> 409, không gọi commitInternalNotes", async () => {
+    mockFindById.mockResolvedValue(makeRecord({ version: 5 }));
+
+    const response = await PUT(makeRequest({ expectedVersion: 1, internalNotes: "abc" }), {
+      params: Promise.resolve({ submissionId: "sub_1" }),
+    });
+
+    expect(response.status).toBe(409);
+    expect(mockCommitInternalNotes).not.toHaveBeenCalled();
+  });
+
+  it("thiếu idempotency-key -> 400", async () => {
+    const request = new NextRequest("http://localhost:3000/api/submissions/sub_1/internal-notes", {
+      method: "PUT",
+      headers: { "x-csrf-token": "valid-csrf", "x-request-id": "req-test" },
+      body: JSON.stringify({ expectedVersion: 1, internalNotes: "abc" }),
+    });
+
+    const response = await PUT(request, { params: Promise.resolve({ submissionId: "sub_1" }) });
+
+    expect(response.status).toBe(400);
+    expect(mockFindById).not.toHaveBeenCalled();
+  });
+
+  it("ghi chú vượt 4000 ký tự -> 400", async () => {
+    const response = await PUT(
+      makeRequest({ expectedVersion: 1, internalNotes: "a".repeat(4001) }),
+      { params: Promise.resolve({ submissionId: "sub_1" }) },
+    );
+
+    expect(response.status).toBe(400);
+    expect(mockFindById).not.toHaveBeenCalled();
+  });
+});
```

## 22. Agent declaration

Agent xác nhận:

- Đã đọc `AGENTS.md`, `AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md` và `docs/brain/*` trước khi sửa code.
- Không tự mở rộng phạm vi ngoài phần đã nêu (chỉ làm Đợt 2A-2, không đụng 2A-3/2B/2C).
- Không ghi đè thay đổi có sẵn của người dùng (working tree sạch trước khi bắt đầu).
- Không đưa secret vào báo cáo (đã kiểm diff ở mục 21 — không có key/token nào).
- Không tự merge.
- Không tự push, không tự deploy (nhánh vẫn ở local, chưa `git push`).
- Kết quả test được ghi đúng theo lệnh thực tế đã chạy trong phiên này (mục 4, 12) — không có số
  liệu bịa.
- Nội dung chưa xác minh đã được đánh dấu rõ: migration chưa chạy thật (mục 15, AC-05), UI chưa
  click-test trên trình duyệt thật (mục 8 Phase 3, mục 14), quy tắc quyền sửa ghi chú là suy luận
  của agent chứ không phải quyết định bằng văn bản của người dùng (mục 5, 15).
