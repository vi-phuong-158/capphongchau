# CHATGPT HANDOFF REPORT

## 1. Report metadata

- Project: `land-ocr-180` (capphongchau) — thu thập và kiểm tra hồ sơ đất đai Phường Phong Châu
- Repository path: `/home/user/capphongchau`
- Generated at: 2026-07-30
- Agent: Claude Code
- Task: **Đợt 2B** của kế hoạch redesign màn duyệt hồ sơ — bốn hạng mục hiệu năng: (a) server-priming
  trang `/submissions/[submissionId]`, (b) truy vấn một tệp `findActiveFile`, (c) tải ảnh theo yêu
  cầu trong split-screen viewer, (d) lazy-load panel AI. Người dùng yêu cầu: *"commit xong tiếp tục
  thực hiện 2B"*.
- Status: `READY_FOR_COMMIT` (đã commit local `7bb4341`; **chưa push, chưa merge, chưa deploy**)
- Source plan: hội thoại với người dùng; phạm vi 2B đã được ghi thành văn từ Đợt 2A trong
  `docs/brain/04-current-tasks.md`: *"2B — CHƯA LÀM: server-priming, lazy-load ảnh trong
  split-screen viewer, single-file query (`findActiveFile`), lazy-load AI panel."*
- Source acceptance criteria: mục 13 dưới đây. Không có tài liệu AC riêng cho 2B; tiêu chí suy ra từ
  phạm vi bốn hạng mục trên **cộng thêm** hai ràng buộc bắt buộc do chính thay đổi sinh ra: giữ
  audit `SUBMISSION_SENSITIVE_DETAIL_VIEWED` và giữ `no-store` khi PII chuyển vào HTML.
- Source security constraints: `CLAUDE.md` (không lộ PII/token trong log, không hardcode secret,
  không đổi stack, không thêm tính năng ngoài scope), `docs/brain/02-coding-rules.md`, và cam kết
  không lộ email công vụ cán bộ ra cổng công khai (`src/modules/submissions/assigned-officer.ts`).

## 2. Git identity

- Current branch: `claude/redesign-document-review-screen-tfuvov`
- Remote: `origin` → `https://github.com/vi-phuong-158/capphongchau` (remote đang ở `c17254c`)
- Base commit before work: `2d67eb2` (đầu ra Đợt 2A-3)
- Head commit after work: `7bb4341`
- Commit created: **1** — `7bb4341` *perf(submissions): Đợt 2B - nạp sẵn màn duyệt trên server, tải
  ảnh/AI theo yêu cầu*
- Working tree state: sạch (`git status --short` không ra dòng nào)
- User changes detected before work: không có; cây làm việc sạch tại `2d67eb2` khi bắt đầu
- User changes preserved: có — không ghi đè, không revert bất kỳ thay đổi nào của người dùng.
  `next-env.d.ts` do `npm run build` tự sinh lại đã được revert, không đưa vào commit.

### Git status

```text
(rỗng — cây làm việc sạch sau commit 7bb4341)
```

### Diff statistics

```text
 docs/brain/01-architecture.md                      |  46 ++++++
 docs/brain/03-decisions.md                         |  41 ++++++
 docs/brain/04-current-tasks.md                     |  14 +-
 docs/brain/06-ai-working-log.md                    |  72 ++++++++++
 .../submissions/current/files/[fileId]/route.ts    |   4 +-
 .../[submissionId]/files/[fileId]/route.ts         |   4 +-
 src/app/api/submissions/[submissionId]/route.ts    |  51 +------
 src/app/submissions/[submissionId]/page.tsx        |  37 ++++-
 src/components/admin/ai-draft-panel.tsx            | 114 ++++++++++++---
 src/components/admin/document-viewer.tsx           | 151 ++++++++++++++++----
 src/components/submission-detail.tsx               |  50 +++----
 src/modules/public-intake/repository.ts            |  19 +++
 src/modules/submissions/detail-view.ts             | 102 +++++++++++++
 src/proxy.ts                                       |  11 +-
 tests/citizen-submit-validation.test.ts            |   1 +
 tests/completion-checks.test.ts                    |   1 +
 tests/exports-route.test.ts                        |   1 +
 tests/manual-identity-confirmation-route.test.ts   |   1 +
 tests/payload-layers.test.ts                       |   1 +
 tests/pl3-export-large-certificate.test.ts         |   1 +
 tests/pl3-export.test.ts                           |   1 +
 tests/submission-acceptance.test.ts                |   1 +
 tests/submission-claim.test.ts                     |   1 +
 tests/submission-detail-view.test.ts               | 158 +++++++++++++++++++++
 tests/submission-file-single-query.test.ts         | 109 ++++++++++++++
 tests/submission-patch-staff-edit-closed.test.ts   |   1 +
 tests/submission-review.test.ts                    |   1 +
 tests/working-payload.test.ts                      |   1 +
 28 files changed, 870 insertions(+), 125 deletions(-)
```

### Name status

```text
M	docs/brain/01-architecture.md
M	docs/brain/03-decisions.md
M	docs/brain/04-current-tasks.md
M	docs/brain/06-ai-working-log.md
M	src/app/api/public/submissions/current/files/[fileId]/route.ts
M	src/app/api/submissions/[submissionId]/files/[fileId]/route.ts
M	src/app/api/submissions/[submissionId]/route.ts
M	src/app/submissions/[submissionId]/page.tsx
M	src/components/admin/ai-draft-panel.tsx
M	src/components/admin/document-viewer.tsx
M	src/components/submission-detail.tsx
M	src/modules/public-intake/repository.ts
A	src/modules/submissions/detail-view.ts
M	src/proxy.ts
M	tests/citizen-submit-validation.test.ts
M	tests/completion-checks.test.ts
M	tests/exports-route.test.ts
M	tests/manual-identity-confirmation-route.test.ts
M	tests/payload-layers.test.ts
M	tests/pl3-export-large-certificate.test.ts
M	tests/pl3-export.test.ts
M	tests/submission-acceptance.test.ts
M	tests/submission-claim.test.ts
A	tests/submission-detail-view.test.ts
A	tests/submission-file-single-query.test.ts
M	tests/submission-patch-staff-edit-closed.test.ts
M	tests/submission-review.test.ts
M	tests/working-payload.test.ts
```

## 3. Executive summary

**Vấn đề cần giải quyết.** Màn duyệt hồ sơ của cán bộ có bốn nguồn chậm đã được ghi thành văn từ Đợt
2A nhưng chưa xử lý:

1. Trang là server component rỗng, `SubmissionDetail` tự gọi `GET /api/submissions/:id` **sau khi
   hydrate** — cán bộ phải chờ chuỗi HTML → tải JS → hydrate → fetch → mới thấy dữ liệu, kèm một lần
   xác thực và một lần đọc hồ sơ trùng lặp.
2. Route phục vụ ảnh gọi `listFiles(submissionId)` rồi `.find(...)`: kéo **toàn bộ** ảnh của hồ sơ về
   chỉ để lấy một tệp.
3. Ảnh giấy tờ trả `cache-control: private, no-store` (đúng — là PII), nên mỗi lần thẻ `<img>` mount
   lại là **một lần tải lại từ Drive kèm một dòng audit**. Khung toàn màn hình render thêm một
   `<img>` cùng `src`, nên **mở toàn màn hình tải đúng ảnh đó hai lần**; chuyển qua lại giữa các tab
   ảnh cũng tải lại từ đầu.
4. Panel AI fetch ngay khi render **và** fetch lại mỗi lần `version` đổi — mỗi lần lưu bàn làm việc
   hay lưu ghi chú nội bộ cũng kéo theo một lần tải kết quả AI, dù phần lớn hồ sơ không có kết quả AI
   nào và panel render ra rỗng (`return null`).

**Phương án đã thực hiện.** Nạp sẵn hồ sơ trên server qua hàm dùng chung
`loadSubmissionDetail()`; thêm `findActiveFile()` truy vấn một ảnh; viewer fetch ảnh thành blob một
lần/ảnh rồi dùng chung object URL cho cả hai khung; panel AI thành accordion thu gọn chỉ gọi API khi
mở. Hai ràng buộc bắt buộc phát sinh từ chính thay đổi (1) đã được xử lý có chủ đích: audit
`SUBMISSION_SENSITIVE_DETAIL_VIEWED` đặt **trong** hàm dùng chung để không mất dấu vết, và
`src/proxy.ts` gắn `cache-control: private, no-store` cho toàn bộ matcher cán bộ vì PII giờ nằm
trong chính tài liệu HTML.

**Kết quả.** Typecheck 0 lỗi, lint 0 lỗi/5 warning có sẵn, test **687 pass/10 skip** (679 + 8 test
mới), build đạt. Không migration.

**Nội dung chưa hoàn thành.** (a) **Chưa có số đo P50/P95 trên Preview** — không tuyên bố đạt mục
tiêu hiệu năng nào. (b) Phần client (lazy ảnh, accordion) **không có test tự động**: repo chưa có hạ
tầng test component React (không có `@testing-library/*` hay jsdom/happy-dom) và thêm vào là đổi
stack, ngoài phạm vi task. (c) Đợt 2C chưa làm.

**Đã phát hiện và sửa một báo cáo sai của chính mình.** Báo cáo Đợt 2A-2 và 2A-3 ghi "typecheck 0
lỗi" là **sai**: `npm run typecheck` dùng `tsconfig.typecheck.json` (có `tests/`, khác
`tsconfig.json` vốn loại `tests`), và tại `2d67eb2` có **12 lỗi** do fixture test thiếu
`internalNotes` sau khi 2A-2 thêm trường bắt buộc này vào `SubmissionRecord`. Vitest không typecheck
nên test vẫn xanh và lỗi bị lọt. Đã sửa cả 12.

**Trạng thái đề xuất.** `READY_FOR_COMMIT` — chờ người dùng quyết định push/PR.

## 4. Baseline before changes

Baseline đo tại `2d67eb2` (trước mọi thay đổi của đợt này).

| Check             | Command            | Result                                    | Evidence                                                                 |
| ----------------- | ------------------ | ----------------------------------------- | ------------------------------------------------------------------------ |
| Unit tests        | `npx vitest run`   | **679 pass / 10 skip**, 78 file pass/2 skip | Chạy tại `2d67eb2`                                                       |
| Integration tests | —                  | Không có bộ riêng                         | Test tích hợp nằm chung trong `tests/` (mock repository/storage)          |
| E2E tests         | `npm run test:e2e` | **KHÔNG CHẠY**                            | Cần Preview URL + credential rehearsal; không có trong môi trường này    |
| Build             | `npm run build`    | Đạt                                       | Turbopack build                                                          |
| Lint              | `npm run lint`     | **0 lỗi / 5 warning có sẵn**              | `scripts/add-system-admins.ts` (2), `tests/staging-rehearsal-scenarios.test.ts` (3) |
| Typecheck         | `npm run typecheck`| **12 LỖI CÓ SẴN**                         | Xem bảng dưới — hồi quy từ 2A-2, đã bị báo cáo sai là "0 lỗi"            |

**12 lỗi typecheck đã tồn tại từ trước** (không phải do đợt này sinh ra) — tất cả cùng một nguyên
nhân: fixture `SubmissionRecord` trong test thiếu trường bắt buộc `internalNotes` mà Đợt 2A-2 đã
thêm:

```text
tests/citizen-submit-validation.test.ts(103,10)        TS2352
tests/completion-checks.test.ts(79,3)                  TS2741
tests/exports-route.test.ts(113,3)                     TS2322
tests/manual-identity-confirmation-route.test.ts(73,3) TS2741
tests/payload-layers.test.ts(42,3)                     TS2322
tests/pl3-export-large-certificate.test.ts(54,3)       TS2741
tests/pl3-export.test.ts(110,3)                        TS2741
tests/submission-acceptance.test.ts(12,3)              TS2322
tests/submission-claim.test.ts(7,3)                    TS2741
tests/submission-patch-staff-edit-closed.test.ts(77,3) TS2322
tests/submission-review.test.ts(16,3)                  TS2322
tests/working-payload.test.ts(86,3)                    TS2741
```

Đợt này **đã sửa hết 12 lỗi baseline đó**, nên bảng mục 12 ghi 0 lỗi. Không trộn lẫn: 2 lỗi typecheck
do đợt này sinh ra trong lúc làm (`readonly` array truyền vào `DocumentFile[]`, `IntakeChannel` import
sai module) cũng đã sửa trước khi commit.

## 5. Scope

### In scope

- Server-priming trang `/submissions/[submissionId]` + module dùng chung
  `src/modules/submissions/detail-view.ts`.
- `PublicIntakeRepository.findActiveFile()` và áp dụng vào 2 route phục vụ ảnh.
- Tải ảnh theo yêu cầu + giữ blob trong bộ nhớ trang ở `document-viewer.tsx`.
- Panel AI thành accordion lazy ở `ai-draft-panel.tsx`.
- `cache-control: private, no-store` cho matcher cán bộ trong `src/proxy.ts` — **bắt buộc đi kèm**
  server-priming, không phải hạng mục rời (xem mục 10 → Sensitive data).
- Sửa 12 lỗi typecheck baseline (fixture test thiếu `internalNotes`).
- Cập nhật `docs/brain/01-architecture.md` (Code Graph), `03-decisions.md`, `04-current-tasks.md`,
  `06-ai-working-log.md`.

### Out of scope

- Không đổi stack, không thêm dependency nào (kể cả hạ tầng test component React).
- Không đổi nghiệp vụ, phân quyền, schema, hay hợp đồng API (trừ việc `GET /api/submissions/:id` giờ
  dựng phản hồi từ hàm dùng chung — **trường và giá trị giữ nguyên**).
- Không migration.
- Không nới `cache-control` của ảnh giấy tờ — `private, no-store` giữ nguyên.
- Không làm Đợt 2C (cán bộ tự tải ảnh bổ sung).
- Không chạy migration `202607290005_submission_internal_notes.sql` (còn nợ từ 2A-2).
- Không push, không merge, không deploy.

### Deviations from approved plan

- **Thêm ngoài bốn hạng mục đã nêu: header `no-store` trong `src/proxy.ts`.** Lý do: server-priming
  chuyển PII của hộ dân từ phản hồi JSON (đã có `no-store`) vào **chính tài liệu HTML**. Làm (a) mà
  không làm việc này là tự tạo lỗ hổng cache. Tác động: 5 nhóm đường dẫn cán bộ trong matcher đều
  nhận thêm header; tất cả đều là bề mặt cần đăng nhập và không có trang nào trong đó nên được cache.
- **Thêm ngoài phạm vi: sửa 12 lỗi typecheck baseline.** Lý do: đây là hồi quy của chính tôi từ 2A-2
  và đã bị tôi báo cáo sai là "0 lỗi"; để lại thì mọi lần chạy typecheck sau đều đỏ và không phân
  biệt được lỗi mới. Tác động: chỉ thêm một dòng `internalNotes: ""` vào fixture, không đổi khẳng
  định test nào.
- **Gộp kiểu dữ liệu (`type Submission = SubmissionDetailView`) thay vì giữ hai bản khai.** Lý do:
  server-priming buộc trang server và component client dùng cùng một hình dạng dữ liệu; giữ hai bản
  khai là tái tạo đúng lớp lỗi mà 2A-2 đã gặp (phải thêm `internalNotes` ở hai nơi). Tác động: kiểu
  chặt hơn (`status` là `PublicStatus` thay vì `string`), đã lộ ra 2 điểm cần sửa và đã sửa.

## 6. Decisions implemented

| Decision | Implementation | Evidence |
| -------- | -------------- | -------- |
| Nạp sẵn hồ sơ trên server, client chỉ fetch khi nạp sẵn lỗi | `page.tsx` gọi `loadSubmissionDetail` → prop `initialSubmission`; `useState(initialSubmission)`; effect `if (initialSubmission) return;` | `src/app/submissions/[submissionId]/page.tsx`, `src/components/submission-detail.tsx` |
| Audit không được mất khi bỏ vòng fetch của client | `appendAudit` đặt **trong** `loadSubmissionDetail`, không ở route | `tests/submission-detail-view.test.ts` — "ghi đúng MỘT dòng audit" |
| PII trong HTML phải có `no-store` | `response.headers.set("cache-control", "private, no-store")` cho toàn matcher cán bộ | `src/proxy.ts` |
| Một truy vấn cho một ảnh, giữ nguyên ngữ nghĩa `status = 'UPLOADED'` | `findActiveFile()` + áp dụng 2 route | `tests/submission-file-single-query.test.ts` — "dùng findActiveFile, không gọi listFiles" |
| Không nới `no-store` của ảnh; thay vào đó giữ blob trong bộ nhớ trang | `usePreviewImages` + `URL.createObjectURL` + `revokeObjectURL` khi unmount | `tests/submission-file-single-query.test.ts` — "giữ no-store" |
| Panel AI chỉ gọi API khi mở, vẫn tải lại theo `version` nếu đang mở | effect có điều kiện `if (!open \|\| loadedVersion === version) return;` | `src/components/admin/ai-draft-panel.tsx` |
| Hình dạng dữ liệu màn duyệt về một nguồn | `SubmissionDetailView` export từ `detail-view.ts`; component dùng `type Submission = SubmissionDetailView` | `src/modules/submissions/detail-view.ts` |

## 7. Changed files

| File | Change type | Symbols/routes/components affected | Purpose | Risk |
| ---- | ----------- | ---------------------------------- | ------- | ---- |
| `src/modules/submissions/detail-view.ts` | Added | `SubmissionDetailView`, `loadSubmissionDetail()` | Đường đọc duy nhất của màn duyệt, có ghi audit; kiểu dữ liệu nguồn duy nhất | **Trung bình** — mọi lần đọc hồ sơ của cán bộ đi qua đây; sửa sai là ảnh hưởng cả API và trang |
| `src/app/submissions/[submissionId]/page.tsx` | Modified | `SubmissionDetailPage` | Nạp sẵn hồ sơ trên server, `notFound()` khi không có, chịu lỗi tạm để client tự fetch | Trung bình — đổi thời điểm đọc dữ liệu và thêm nhánh `notFound()` |
| `src/app/api/submissions/[submissionId]/route.ts` | Modified | `GET` (PATCH **không đổi**) | GET dựng phản hồi từ `loadSubmissionDetail`; bỏ 40 dòng dựng DTO trùng lặp; bỏ import `payloadLayerOf` không còn dùng | Thấp — trường và giá trị phản hồi giữ nguyên |
| `src/app/api/submissions/[submissionId]/files/[fileId]/route.ts` | Modified | `GET` | Dùng `findActiveFile` thay `listFiles` + `.find` | Thấp |
| `src/app/api/public/submissions/current/files/[fileId]/route.ts` | Modified | `GET` (nhánh dự phòng; `DELETE` **không đổi**) | Dùng `findActiveFile` ở nhánh dự phòng; nhánh nhanh `record.fileSummaries` giữ nguyên | Thấp — `DELETE` cố ý không đổi vì cần cả trạng thái `DELETED` |
| `src/modules/public-intake/repository.ts` | Modified | `findActiveFile()` (mới) | Truy vấn một ảnh theo `(submission_id, file_id, status='UPLOADED')` | Thấp — hàm mới, không sửa hàm cũ |
| `src/components/submission-detail.tsx` | Modified | `SubmissionDetail`, `type Submission` | Nhận `initialSubmission`; bỏ bản khai lại kiểu; siết `status` thành `PublicStatus` ở 2 kiểu phản hồi cục bộ; bỏ import `IntakeDraft` không còn dùng | Trung bình — component lớn nhất của màn duyệt |
| `src/components/admin/document-viewer.tsx` | Modified | `usePreviewImages` (mới), `DocumentViewerState`, `DocumentViewerProps.files` → `readonly` | Tải ảnh theo yêu cầu, một fetch/ảnh, trạng thái tải + nút thử lại | Trung bình — đổi cách ảnh được nạp |
| `src/components/admin/ai-draft-panel.tsx` | Modified | `AiDraftPanel`, `renderBody()`, `renderDraft()` (mới) | Accordion lazy; `loading` thành giá trị suy ra | Thấp — panel phụ trợ, không phải đường ghi |
| `src/proxy.ts` | Modified | proxy `auth()` handler | `cache-control: private, no-store` cho matcher cán bộ. **Matcher KHÔNG đổi** | Thấp — chỉ thêm header |
| `docs/brain/01-architecture.md` | Modified | Code Graph | 4 khối mới: `detail-view.ts`, `page.tsx` priming, `document-viewer.tsx`, `ai-draft-panel.tsx`; thêm `findActiveFile` vào cây repository | — |
| `docs/brain/03-decisions.md` | Modified | — | Entry `[2026-07-30] Đợt 2B` ở đầu file (mới nhất trước) | — |
| `docs/brain/04-current-tasks.md` | Modified | — | 2B chuyển sang ĐÃ LÀM kèm giới hạn xác minh; ghi rõ 12 lỗi typecheck đã sửa | — |
| `docs/brain/06-ai-working-log.md` | Modified | — | Entry bắt buộc theo `CLAUDE.md` | — |
| `tests/submission-detail-view.test.ts` | Added | 5 ca | Khóa hành vi audit + DTO của `loadSubmissionDetail` | — |
| `tests/submission-file-single-query.test.ts` | Added | 3 ca | Khóa `findActiveFile` + `no-store` + 404 không đọc Drive | — |
| 12 file test khác | Modified | fixture `SubmissionRecord` | Thêm `internalNotes: ""` — sửa 12 lỗi typecheck baseline | — |

## 8. Detailed implementation by phase

### Phase 1 — Server-priming + gộp đường đọc về một hàm

- **Mục tiêu:** bỏ vòng chờ fetch-sau-hydrate, **không** làm mất audit, **không** để PII vào cache.
- **Các file liên quan:** `src/modules/submissions/detail-view.ts` (mới),
  `src/app/submissions/[submissionId]/page.tsx`, `src/app/api/submissions/[submissionId]/route.ts`,
  `src/components/submission-detail.tsx`, `src/proxy.ts`.
- **Nội dung đã thực hiện:**
  - `loadSubmissionDetail(submissionId, viewer, requestId)`: `findById` → `appendAudit` → `listFiles`
    → DTO. Trả `null` khi không có hồ sơ, và khi đó **không** ghi audit, **không** gọi `listFiles`.
  - `page.tsx` gọi hàm này; `null` → `notFound()`; ngoại lệ (lỗi DB tạm) → vẫn render với
    `initialSubmission = null` để client tự fetch và tự báo lỗi, không làm cán bộ mất trang.
  - `SubmissionDetail` seed state từ `initialSubmission`; effect fetch có `if (initialSubmission)
    return;`.
  - `GET /api/submissions/:id` dùng chung hàm đó — bỏ ~40 dòng dựng DTO trùng lặp.
  - `SubmissionDetailView` thành kiểu nguồn duy nhất; component bỏ bản khai lại.
  - `src/proxy.ts` gắn `cache-control: private, no-store`.
- **Nội dung không thực hiện:** không đổi `PATCH` của route đó; không đổi matcher của proxy; không
  thêm `revalidate`/`fetchCache` (trang đã `dynamic = "force-dynamic"`).
- **Test đã chạy:** `npx vitest run tests/submission-detail-view.test.ts` → 5 pass. Toàn bộ suite →
  687 pass/10 skip.
- **Kết quả:** đạt.
- **Rủi ro:** kiểu chặt hơn đã lộ 2 chỗ `status: string` trong kiểu phản hồi cục bộ của
  `action`/`accept`; đã siết thành `PublicStatus`. Nếu server trả một status ngoài union thì TS không
  bắt được — nhưng điều đó vốn đã đúng từ trước, không phải hồi quy mới.

### Phase 2 — Truy vấn một tệp (`findActiveFile`)

- **Mục tiêu:** bỏ việc kéo toàn bộ ảnh của hồ sơ về để lấy một tệp.
- **Các file liên quan:** `src/modules/public-intake/repository.ts`,
  `src/app/api/submissions/[submissionId]/files/[fileId]/route.ts`,
  `src/app/api/public/submissions/current/files/[fileId]/route.ts`.
- **Nội dung đã thực hiện:** thêm `findActiveFile` với `where submission_id = $1 and file_id = $2 and
  status = 'UPLOADED' limit 1`; áp dụng vào route ảnh của cán bộ và nhánh **dự phòng** của route ảnh
  công khai (nhánh nhanh `record.fileSummaries` giữ nguyên).
- **Nội dung không thực hiện:** **cố ý không** áp dụng cho `DELETE` của route ảnh công khai — route
  đó lọc `status === "UPLOADED" || status === "DELETED"` để trả về idempotent khi xóa lại; dùng
  `findActiveFile` sẽ làm lần xóa thứ hai trả 404 thay vì 200.
- **Test đã chạy:** `npx vitest run tests/submission-file-single-query.test.ts` → 3 pass.
- **Kết quả:** đạt.
- **Rủi ro:** **SQL của `findActiveFile` chưa chạy trên Postgres thật trong đợt này** — test dùng
  repository mock. Điều kiện `(submission_id, file_id)` là khóa tra cứu tự nhiên nên rủi ro thấp,
  nhưng cần xác nhận bằng thao tác thủ công ở mục 14.

### Phase 3 — Tải ảnh theo yêu cầu trong viewer

- **Mục tiêu:** bỏ tải trùng, chỉ tải ảnh cán bộ thực sự xem, **không** nới `no-store`.
- **Các file liên quan:** `src/components/admin/document-viewer.tsx`.
- **Nội dung đã thực hiện:** `usePreviewImages(submissionId)` giữ `Map<fileId, objectURL>` trong ref;
  fetch một lần/ảnh (`pending` set chặn gọi trùng); dùng chung object URL cho khung nhỏ và khung toàn
  màn hình; `revokeObjectURL` toàn bộ khi unmount; thêm "Đang tải ảnh…", thông báo lỗi lấy từ
  `error.message` của API, và nút "Thử lại"; `DocumentViewerProps.files` thành `readonly`.
- **Nội dung không thực hiện:** không prefetch các ảnh chưa chọn (sẽ ngược lại mục tiêu lazy); không
  đổi header của route ảnh.
- **Test đã chạy:** không có test tự động cho component (xem mục 15). Xác minh bằng typecheck, lint,
  build và đọc code.
- **Kết quả:** đạt về mặt biên dịch/lint/build; **hành vi runtime chưa được xác minh tự động**.
- **Rủi ro:** đây là hạng mục rủi ro cao nhất của đợt — thay đổi cách ảnh được nạp mà không có test
  tự động. Bắt buộc kiểm tra thủ công theo mục 14.

### Phase 4 — Panel AI thành accordion lazy

- **Mục tiêu:** bỏ fetch lúc render và bỏ fetch theo mỗi lần `version` đổi khi panel đang đóng.
- **Các file liên quan:** `src/components/admin/ai-draft-panel.tsx`.
- **Nội dung đã thực hiện:** thêm state `open` + `loadedVersion`; effect chỉ chạy khi `open` và
  `loadedVersion !== version`; `loading` là **giá trị suy ra** (`open && loadedVersion !== version`)
  chứ không phải state — bắt buộc, vì quy tắc `react-hooks/set-state-in-effect` báo **lỗi** (không
  phải warning) với `setState` đồng bộ trong thân effect; tách render thành `renderBody()` /
  `renderDraft()`; thêm nút "Thử lại" (đặt `loadedVersion = null`).
- **Nội dung không thực hiện:** không đổi `POST .../ai-draft/apply`; không đổi điều kiện `mayApply`.
- **Test đã chạy:** không có test tự động cho component (xem mục 15).
- **Kết quả:** đạt về biên dịch/lint/build.
- **Rủi ro:** thay đổi giao diện thấy được — xem mục 9.

## 9. Behavior before and after

| Scenario | Before | After | Verification |
| -------- | ------ | ----- | ------------ |
| Mở `/submissions/:id` | HTML rỗng → tải JS → hydrate → fetch `GET /api/submissions/:id` → mới hiện dữ liệu. 2 lần xác thực, 2 lần đọc hồ sơ | Dữ liệu có ngay trong HTML lần đầu; client **không** fetch. 1 lần xác thực, 1 lần đọc | Đọc code + build; **cần kiểm tra thủ công** (mục 14) |
| Audit khi mở hồ sơ | 1 dòng `SUBMISSION_SENSITIVE_DETAIL_VIEWED` (do client fetch) | 1 dòng (do server nạp sẵn) — **không tăng, không mất** | `tests/submission-detail-view.test.ts` |
| Nạp sẵn thất bại (DB lỗi tạm) | Không có tình huống này | Trang vẫn render, client tự fetch, lỗi hiện "Không thể tải hồ sơ." | Đọc code (nhánh `catch`) |
| Hồ sơ không tồn tại | Client fetch → 404 → hiện "Không thể tải hồ sơ." | `notFound()` của Next ngay trên server | Đọc code |
| Header trang cán bộ | Phụ thuộc mặc định của Next | `cache-control: private, no-store` | `src/proxy.ts`; **cần xác nhận thủ công bằng DevTools** |
| Lấy một ảnh xem trước | `listFiles` trả N dòng → `.find` lấy 1 | 1 truy vấn trả đúng 1 dòng | `tests/submission-file-single-query.test.ts` |
| Mở ảnh toàn màn hình | Tải lại **cùng** ảnh lần thứ hai từ Drive (+1 dòng audit) | Dùng lại object URL — **0** request mới | Đọc code; **cần kiểm tra thủ công** |
| Chuyển tab ảnh rồi quay lại | Tải lại từ đầu mỗi lần | Hiện ngay từ blob đã có | Đọc code; **cần kiểm tra thủ công** |
| Ảnh lỗi/chưa có preview | `<img>` hiện icon hỏng, không rõ lý do | Hiện thông báo lỗi từ API + nút "Thử lại" | Đọc code |
| Mở trang khi hồ sơ **không** có kết quả AI | Fetch `ai-draft`, panel render rỗng (ẩn hoàn toàn) | **Không** fetch; hiện một dòng thu gọn "Đối chiếu AI — bản nháp / Bấm để tải…" | Đọc code — **thay đổi giao diện thấy được** |
| Lưu bàn làm việc hoặc ghi chú nội bộ | `version` đổi → fetch lại `ai-draft` dù panel đóng | Chỉ fetch lại nếu panel **đang mở** | Đọc code |
| Nạp nháp AI (`apply`) | `onApplied` → reload → refetch `ai-draft` | Giữ nguyên (panel đang mở nên `version` đổi vẫn refetch) | Đọc code |

## 10. API, data and security impact

### Authentication

- Không thay đổi. Trang vẫn `requireActiveUser(SUBMISSION_READ_ROLES)` trước mọi thao tác đọc; proxy
  vẫn kiểm tra session ở biên và redirect `/` khi thiếu. `loadSubmissionDetail` **không** tự xác
  thực — nhận `viewer` đã xác thực từ người gọi, đúng như route cũ.

### Authorization

- Không thay đổi. `SUBMISSION_READ_ROLES` giữ nguyên ở cả trang và route.
  `canResetAccessSecret` vẫn chỉ bật cho `SYSTEM_ADMIN`/`WARD_ADMIN` — logic chuyển nguyên văn vào
  `loadSubmissionDetail` và **có test khóa lại** (`canResetAccessSecret chỉ bật cho quản trị viên`).

### DataScope

- Không thay đổi phạm vi dữ liệu. `loadSubmissionDetail` đọc đúng một hồ sơ theo `submissionId` do
  người gọi cung cấp, giống hành vi cũ của route. `findActiveFile` **luôn** kèm điều kiện
  `submission_id = $1`, nên không thể lấy ảnh của hồ sơ khác bằng cách đoán `file_id`.

### API contract

- Endpoint: `GET /api/submissions/:submissionId`
- Method: `GET`
- Request before / after: **không đổi** (không có body, không thêm tham số)
- Response before: `{ submission: {...19 trường...}, requestId }`
- Response after: **giống hệt** — cùng tên trường, cùng kiểu, cùng thứ tự nguồn dữ liệu; chỉ đổi chỗ
  dựng DTO (từ inline trong route sang `loadSubmissionDetail`)
- Error handling: **không đổi** — 404 `NOT_FOUND`, 401 `UNAUTHENTICATED`, 403 `ACCESS_DENIED`, 500
  `INTERNAL_ERROR`; header `cache-control: no-store` giữ nguyên
- Endpoint: `GET /api/submissions/:submissionId/files/:fileId` — **không đổi hợp đồng**; chỉ đổi cách
  truy vấn nội bộ. Vẫn 404 khi không có tệp, vẫn `private, no-store` + `nosniff`
- Endpoint: `GET /api/public/submissions/current/files/:fileId` — **không đổi hợp đồng**; chỉ đổi
  nhánh dự phòng. `DELETE` **không đổi một dòng nào**
- **Không có endpoint mới, không có endpoint bị xóa, không có trường nào bị thêm/bớt.**

### Database and migrations

- Migration added: **không có**
- Tables/columns/indexes affected: không có thay đổi schema. `findActiveFile` **đọc**
  `public.public_files` theo `(submission_id, file_id, status)`
- Backfill: không
- Rollback: revert commit `7bb4341` là đủ; không có trạng thái DB nào cần hoàn tác
- Production action required: **không có cho đợt này.** Tuy nhiên vẫn còn **nợ từ 2A-2**: migration
  `202607290005_submission_internal_notes.sql` chưa chạy trên Preview/Production và **bắt buộc chạy
  trước khi deploy** (cùng các migration đang chờ khác), rồi xác nhận bằng
  `npx tsx scripts/preflight-public-intake-v2-migrations.ts`

### Validation and file handling

- Trường bắt buộc: không đổi
- Quy tắc tên file: không đổi
- Giới hạn file: không đổi
- MIME/type validation: không đổi. `content-type` của ảnh xem trước vẫn lấy từ
  `storage.readPreview()`; `x-content-type-options: nosniff` giữ nguyên và **có test khóa lại**
- Xử lý lỗi: **cải thiện ở client** — viewer giờ đọc `error.message` của API và hiện cho cán bộ kèm
  nút "Thử lại", thay vì để `<img>` hiện icon hỏng không rõ lý do

### Sensitive data

- **Dữ liệu nhạy cảm bị tác động:**
  1. **PII trong HTML (mới).** Server-priming đưa số điện thoại, CCCD, ngày sinh, địa chỉ, ghi chú
     nội bộ vào chính tài liệu HTML của `/submissions/:id`. Trước đây chỉ nằm trong phản hồi JSON.
  2. **Ảnh giấy tờ trong bộ nhớ trang (mới).** Blob ảnh CCCD/GCN được giữ trong `Map` cho tới khi
     rời trang.
- **Log có thể chứa dữ liệu:** **không**. Không thêm bất kỳ lệnh log nào trong đợt này. Audit của
  `loadSubmissionDetail` chỉ ghi `actorEmail`, `action`, `entityId` (là `submissionId`), `requestId`
  — **không** ghi nội dung hồ sơ. `findActiveFile` không log.
- **Biện pháp che hoặc loại bỏ:**
  1. `src/proxy.ts` gắn `cache-control: private, no-store` cho **toàn bộ** matcher cán bộ
     (`/profile`, `/users`, `/submissions`, `/ke-khai-ho`, `/api/staff`) — không phụ thuộc mặc định
     của Next hay của proxy đứng trước.
  2. `revokeObjectURL` cho mọi object URL khi component unmount, không giữ ảnh PII lâu hơn mức cần.
  3. **Không nới `no-store` của route ảnh** — cache đĩa của trình duyệt vẫn không được giữ ảnh giấy
     tờ; việc giữ blob chỉ trong bộ nhớ của trang đang mở.
  4. `loadSubmissionDetail` chỉ trả 3 trường cho mỗi ảnh (`fileId`, `documentType`, `ownerId`) —
     **không** lộ `driveFileId`/`checksum` ra màn duyệt; **có test khóa lại** bằng
     `expect(Object.keys(...)).toHaveLength(3)`.
  5. Không lộ email công vụ cán bộ ra cổng công khai: đợt này **không chạm** bất kỳ route công khai
     nào trả thông tin cán bộ.

## 11. Tests added or changed

| Test file | Test case | Requirement covered | Result |
| --------- | --------- | ------------------- | ------ |
| `tests/submission-detail-view.test.ts` | trả `null` và KHÔNG ghi audit khi không có hồ sơ | Không ghi audit cho hồ sơ không tồn tại; không gọi `listFiles` vô ích | PASS |
| `tests/submission-detail-view.test.ts` | ghi đúng MỘT dòng audit `SUBMISSION_SENSITIVE_DETAIL_VIEWED` | **Server-priming không làm mất dấu vết "ai đã xem hồ sơ nào"** | PASS |
| `tests/submission-detail-view.test.ts` | working payload che draft của người dân | `effectivePayload`/`payloadLayerOf` chuyển sang hàm dùng chung không đổi hành vi | PASS |
| `tests/submission-detail-view.test.ts` | giữ `internalNotes` và ánh xạ ảnh gọn về 3 trường | Không lộ `driveFileId`/`checksum`; không mất trường 2A-2 | PASS |
| `tests/submission-detail-view.test.ts` | `canResetAccessSecret` chỉ bật cho quản trị viên | Phân quyền chuyển vào hàm dùng chung không bị nới | PASS |
| `tests/submission-file-single-query.test.ts` | dùng `findActiveFile`, không gọi `listFiles` | Truy vấn một tệp; khóa lại để không quay về cách cũ | PASS |
| `tests/submission-file-single-query.test.ts` | giữ `private, no-store` + `nosniff` | **Không nới cache của ảnh PII** | PASS |
| `tests/submission-file-single-query.test.ts` | 404 khi không có tệp, không đọc Drive, không ghi audit | Không gọi Drive/audit vô ích trên đường lỗi | PASS |
| 12 file test hiện có | (không đổi khẳng định nào) | Thêm `internalNotes: ""` vào fixture — sửa 12 lỗi typecheck baseline | PASS |

**Chưa có test cho:** hành vi client của `usePreviewImages` (một fetch/ảnh, dùng chung object URL,
revoke khi unmount) và của accordion AI (không fetch khi đóng). Lý do ở mục 15.

## 12. Final verification

| Check             | Command | Result | Evidence |
| ----------------- | ------- | ------ | -------- |
| Unit tests        | `npm test` (`vitest run`) | **687 pass / 10 skip / 0 fail**; 80 file pass / 2 skip | Tăng từ 679 → 687 (+8 test mới); không test cũ nào fail hay mới skip |
| Integration tests | `npm test` | Nằm chung bộ trên | Không có bộ riêng trong repo |
| E2E tests         | `npm run test:e2e` | **NOT_RUN** | Cần Preview URL + credential rehearsal, không có trong môi trường này |
| Build             | `npm run build` | Đạt | Turbopack build; `/submissions/[submissionId]` vẫn `ƒ (Dynamic)`; `next-env.d.ts` do build tự đổi đã revert |
| Lint              | `npm run lint` | **0 lỗi / 5 warning** | Đúng baseline; 5 warning đều có sẵn từ trước ở `scripts/add-system-admins.ts` và `tests/staging-rehearsal-scenarios.test.ts` |
| Typecheck         | `npm run typecheck` | **0 lỗi** (exit 0) | Từ 12 lỗi baseline về 0 |
| Security check    | — | **NOT_RUN** | Repo không có script security tự động; rà soát thủ công ghi ở mục 10 |
| Secret scan       | rà soát thủ công diff | Không có secret | Không thêm biến môi trường, không thêm chuỗi bí mật; không thêm lệnh log nào |

## 13. Acceptance criteria matrix

| ID    | Acceptance criterion | Status | Evidence | Notes |
| ----- | -------------------- | ------ | -------- | ----- |
| AC-01 | Trang `/submissions/:id` nạp sẵn hồ sơ trên server; client không fetch khi đã có dữ liệu | PASS | Đọc code + build; `if (initialSubmission) return;` trong effect | Chưa đo thời gian thật — xem AC-09 |
| AC-02 | Audit `SUBMISSION_SENSITIVE_DETAIL_VIEWED` vẫn được ghi **đúng một lần** mỗi lần đọc | PASS | `tests/submission-detail-view.test.ts` (2 ca) | |
| AC-03 | HTML chứa PII không được cache | PASS (code) / NOT_TESTED (runtime) | `src/proxy.ts` gắn `private, no-store` | Cần xác nhận bằng DevTools — mục 14 |
| AC-04 | `GET /api/submissions/:id` giữ nguyên hợp đồng | PASS | Toàn bộ test cũ liên quan vẫn xanh; DTO chuyển nguyên văn | |
| AC-05 | Route ảnh chỉ truy vấn một tệp, không kéo cả danh sách | PASS | `tests/submission-file-single-query.test.ts` | SQL chưa chạy trên Postgres thật — mục 14 |
| AC-06 | Ảnh giấy tờ vẫn `private, no-store` + `nosniff` | PASS | `tests/submission-file-single-query.test.ts` | |
| AC-07 | Mở toàn màn hình không tải lại ảnh; chuyển tab quay lại không tải lại | NOT_TESTED | Đọc code (dùng chung object URL) | **Không có test tự động** — mục 14, 15 |
| AC-08 | Panel AI không gọi API khi đóng; gọi khi mở; tải lại theo `version` nếu đang mở | NOT_TESTED | Đọc code (`if (!open \|\| loadedVersion === version) return;`) | **Không có test tự động** — mục 14, 15 |
| AC-09 | Đạt mục tiêu hiệu năng đo được | NOT_TESTED | — | **Chưa có số đo P50/P95 trên Preview.** Không tuyên bố đạt |
| AC-10 | Không migration, không đổi schema | PASS | `git diff --name-status` không có file nào trong `supabase/migrations/` | |
| AC-11 | Typecheck/lint không tệ hơn baseline | PASS | Typecheck 12 → **0**; lint giữ 0 lỗi/5 warning | |

## 14. Manual verification required

- **Màn hình hoặc quy trình cần người dùng kiểm tra:** `/submissions/{submissionId}` với tài khoản
  cán bộ (`REVIEW_OFFICER` trở lên).
- **Dữ liệu mẫu cần dùng:** một hồ sơ có **ít nhất 3 ảnh** (CCCD trước, CCCD sau, GCN) — cần nhiều
  ảnh để thấy hiệu quả của việc chuyển tab; và một hồ sơ **không** có kết quả AI.
- **Các bước kiểm tra:**
  1. Mở DevTools → tab Network, bật "Disable cache = OFF", tải `/submissions/{id}`.
  2. Xem response header của **chính tài liệu HTML** → phải có `cache-control: private, no-store`
     (AC-03).
  3. Xác nhận **không** có request `GET /api/submissions/{id}` nào sau khi trang tải (AC-01).
  4. Đếm request tới `/api/submissions/{id}/files/...`: phải có **đúng 1** (ảnh đầu tiên), không phải
     3.
  5. Bấm nút "Xem toàn màn hình" → **không** phát sinh request ảnh mới (AC-07).
  6. Đóng toàn màn hình, chuyển sang tab ảnh 2 → **1** request mới; quay lại tab ảnh 1 → **0**
     request mới (AC-07).
  7. Kiểm tra zoom/xoay/đặt lại vẫn hoạt động trên cả khung nhỏ và khung toàn màn hình.
  8. Panel "Đối chiếu AI — bản nháp" phải **thu gọn** và **chưa** có request `ai-draft` nào; bấm mở →
     đúng 1 request; đóng/mở lại → **không** thêm request (AC-08).
  9. Với panel AI đang **đóng**: lưu ghi chú nội bộ → **không** phát sinh request `ai-draft`. Với
     panel đang **mở**: lưu ghi chú → **có** 1 request `ai-draft` (cột "Hiện có" phải cập nhật).
  10. Mở một hồ sơ **không** có kết quả AI → mở panel → phải hiện "Hồ sơ này chưa có kết quả đọc tự
      động…", không phải lỗi.
  11. Mở một hồ sơ **không tồn tại** (`/submissions/sub_khong_co`) → trang 404 của Next.
  12. Kiểm tra `audit_logs`: mỗi lần mở trang phải sinh **đúng một** dòng
      `SUBMISSION_SENSITIVE_DETAIL_VIEWED`, không phải hai (AC-02).
  13. **Xác nhận `findActiveFile` chạy đúng trên Postgres thật** (AC-05): ảnh hiện được bình thường
      ở bước 4–6 là bằng chứng đủ; nếu 404 thì SQL sai.
- **Kết quả mong đợi:** như ghi trong từng bước. Bất kỳ sai lệch nào ở bước 2, 3, 5, 6, 8, 12 là hồi
  quy của đợt này.

## 15. Remaining issues and warnings

| Severity | Issue | Impact | Recommended action |
| -------- | ----- | ------ | ------------------ |
| Medium | Phần client (lazy ảnh, accordion AI) **không có test tự động** | Hồi quy về sau sẽ không bị bắt bởi CI; hạng mục Phase 3 là rủi ro cao nhất của đợt | Kiểm tra thủ công theo mục 14 trước khi deploy. Muốn có test thì phải thêm hạ tầng test component React (`@testing-library/react` + jsdom) — **đổi stack**, cần quyết định của người dùng và một entry trong `03-decisions.md` |
| Medium | **Chưa có số đo P50/P95** cho màn duyệt | Không chứng minh được đợt 2B thật sự nhanh hơn bao nhiêu | Đo trên Preview sau khi chạy migration đang chờ; ghi số vào `04-current-tasks.md` |
| Medium | Migration `202607290005_submission_internal_notes.sql` (nợ từ 2A-2) **chưa chạy** | Deploy code hiện tại mà chưa chạy migration sẽ làm `GET /api/submissions/:id` lỗi vì thiếu cột `internal_notes` | Chạy migration trên Preview rồi Production **trước** khi deploy; xác nhận bằng `npx tsx scripts/preflight-public-intake-v2-migrations.ts` |
| Low | Panel AI giờ **luôn hiện một dòng thu gọn**, kể cả hồ sơ không có kết quả AI (trước ẩn hoàn toàn) | Thay đổi giao diện thấy được; thêm một dòng vào màn hình | Chấp nhận có chủ đích (không fetch thì không biết có kết quả hay không). Nếu người dùng không muốn, phương án là để server trả sẵn cờ "có kết quả AI hay không" trong `SubmissionDetailView` |
| Low | `SQL của findActiveFile` chưa chạy trên Postgres thật | Nếu sai điều kiện thì ảnh trả 404 | Mục 14 bước 4–6, 13 |
| Low | 5 lint warning có sẵn từ trước vẫn còn | Không ảnh hưởng chức năng | Ngoài phạm vi đợt này; dọn trong một đợt riêng |
| Low | Commit hiển thị "Unverified" trên GitHub | Chỉ ảnh hưởng nhãn xác minh, không ảnh hưởng nội dung | Đã chẩn đoán: commit **có** chữ ký SSH và author/committer **đúng** `noreply@anthropic.com`; git báo `N` vì không xác minh được cục bộ (`gpg.ssh.allowedSignersFile` chưa cấu hình, file khóa công khai 0 byte, không có ssh-agent). Chạy lại `--reset-author`/rebase **không** đổi được kết quả (đã thử một lần, chỉ viết lại hash) |

## 16. Regression and compatibility notes

- **Trình duyệt:** `URL.createObjectURL`/`revokeObjectURL` và `fetch` là API tiêu chuẩn, hỗ trợ ở mọi
  trình duyệt hiện đại và trên iOS/Android Safari/Chrome — không dùng API thử nghiệm nào. Không dùng
  `loading="lazy"` cho ảnh đang xem (không có tác dụng khi ảnh nằm trong khung nhìn); chỉ thêm
  `decoding="async"`, thoái hóa an toàn nếu không hỗ trợ.
- **Thiết bị:** ảnh vẫn tải theo yêu cầu nên máy yếu/mạng chậm được lợi (1 ảnh thay vì 3). Bộ nhớ:
  giữ tối đa N blob ảnh của **một** hồ sơ đang mở, giải phóng khi rời trang.
- **Node/runtime:** không đổi. Route ảnh vẫn `runtime = "nodejs"`; trang vẫn `dynamic =
  "force-dynamic"`.
- **Database:** không đổi schema; `findActiveFile` chỉ đọc. Không đổi cấu hình pooler.
- **API bên ngoài:** Google Drive — **giảm** số lần gọi `readPreview` (bỏ tải trùng khi mở toàn màn
  hình và khi chuyển tab quay lại). Không đổi cách gọi.
- **Backward compatibility:** hợp đồng API **không đổi** — client cũ (nếu có) vẫn dùng được
  `GET /api/submissions/:id` y nguyên. Không có trường bị bỏ.
- **Excel/PDF/import/export compatibility:** không chạm. Không sửa PL3 export, official record, hay
  acceptance saga.
- **Khác:** proxy giờ set `cache-control` cho `/api/staff/*` — các route đó vốn tự set `no-store`
  riêng, giá trị trùng nhau nên không có xung đột hành vi.

## 17. Rollback plan

- **Cách rollback code:** `git revert 7bb4341` (một commit duy nhất, không phụ thuộc commit khác
  trong đợt). Hoặc `git reset --hard 2d67eb2` nếu chưa push.
- **Cách rollback migration:** không cần — đợt này **không có** migration.
- **Dữ liệu có cần phục hồi:** không. Không có thao tác ghi dữ liệu mới; audit chỉ thêm dòng đọc như
  trước.
- **Điều kiện không được rollback tự động:** không có. Tuy nhiên nếu revert **sau khi** đã deploy,
  lưu ý: revert sẽ **gỡ bỏ** header `cache-control: private, no-store` khỏi trang cán bộ. Vì bản
  revert cũng gỡ luôn server-priming (HTML trở lại khung rỗng, không còn PII), điều này an toàn —
  **nhưng không được revert lẻ riêng `src/proxy.ts` mà giữ server-priming.**

## 18. Recommended next action

`READY_FOR_COMMIT`

Code đã commit local (`7bb4341`), toàn bộ kiểm tra tự động chạy được đều xanh và tốt hơn baseline
(typecheck 12 → 0 lỗi). Chưa đề nghị deploy vì ba việc còn thiếu, không phải vì code có vấn đề đã
biết: (1) chưa kiểm tra thủ công phần client theo mục 14 — đây là hạng mục không có test tự động;
(2) chưa có số đo hiệu năng nào để nói đợt này đạt mục tiêu; (3) migration `202607290005` nợ từ 2A-2
vẫn chưa chạy, deploy trước migration sẽ làm màn duyệt lỗi vì thiếu cột `internal_notes`.

Chờ người dùng quyết định push và mở PR — **chưa push, chưa merge, chưa deploy.**

## 19. Commands to reproduce

```bash
# Cài đặt
npm ci

# Kiểm tra (đúng các lệnh đã chạy cho báo cáo này)
npm run typecheck                                  # 0 lỗi
npm run lint                                       # 0 lỗi / 5 warning có sẵn
npm test                                           # 687 pass / 10 skip
npm run build                                      # đạt
git checkout -- next-env.d.ts                      # build tự sinh lại, không đưa vào commit

# Chạy riêng test của đợt này
npx vitest run tests/submission-detail-view.test.ts        # 5 pass
npx vitest run tests/submission-file-single-query.test.ts  # 3 pass

# Xem baseline trước thay đổi
git stash -u && npm run typecheck ; git stash pop   # 12 lỗi tại 2d67eb2

# Trước khi deploy (CHƯA CHẠY — nợ từ 2A-2)
# 1) áp các migration đang chờ theo đúng thứ tự, gồm 202607290005_submission_internal_notes.sql
npx tsx scripts/preflight-public-intake-v2-migrations.ts

# Chạy dev để kiểm tra thủ công theo mục 14
npm run dev
```

## 20. Key diff excerpts

**Audit đặt trong hàm dùng chung — điều kiện then chốt để server-priming không mất dấu vết:**

```diff
+++ b/src/modules/submissions/detail-view.ts
+/**
+ * Đọc hồ sơ cho màn duyệt, **có ghi audit**.
+ *
+ * Mỗi lần gọi ghi một dòng `SUBMISSION_SENSITIVE_DETAIL_VIEWED`: hàm này là đường xem dữ liệu
+ * nhạy cảm (số điện thoại, CCCD, địa chỉ) nên dấu vết "ai đã xem hồ sơ nào" là bắt buộc. Khi
+ * chuyển sang server-priming, việc dựng dữ liệu ngay trên server **không được** làm mất dòng
+ * audit này — vì thế audit nằm trong hàm dùng chung chứ không nằm ở route.
+ */
+export async function loadSubmissionDetail(
+  submissionId: string,
+  viewer: { readonly email: string; readonly roles: readonly string[] },
+  requestId: string,
+): Promise<SubmissionDetailView | null> {
+  const repository = getPublicIntakeRepository();
+  const record = await repository.findById(submissionId);
+  if (!record) return null;
+  await repository.appendAudit({
+    actorEmail: viewer.email,
+    action: "SUBMISSION_SENSITIVE_DETAIL_VIEWED",
+    entityId: record.submissionId,
+    requestId,
+  });
```

**Bảo mật — PII chuyển vào HTML nên phải gắn `no-store` (điều kiện bắt buộc thứ hai):**

```diff
--- a/src/proxy.ts
+++ b/src/proxy.ts
 export default auth((request) => {
   if (request.auth?.user?.email) {
-    return NextResponse.next();
+    const response = NextResponse.next();
+    /*
+     * Mọi đường dẫn trong `matcher` bên dưới đều là bề mặt của cán bộ và đều mang PII (số điện
+     * thoại, CCCD, địa chỉ hộ dân). Từ khi trang `/submissions/[submissionId]` nạp sẵn hồ sơ trên
+     * server, PII nằm ngay trong HTML chứ không còn chỉ trong phản hồi JSON (các route JSON tự gắn
+     * `no-store` riêng). Gắn ở đây để không phụ thuộc vào mặc định của Next hay của proxy đứng
+     * trước — không có trang nào trong danh sách này được phép nằm lại trong bất kỳ cache nào.
+     */
+    response.headers.set("cache-control", "private, no-store");
+    return response;
   }
```

**Client chỉ fetch khi nạp sẵn thất bại — nếu fetch cả khi đã có dữ liệu thì mất lợi ích VÀ ghi thêm
một dòng audit:**

```diff
--- a/src/components/submission-detail.tsx
+++ b/src/components/submission-detail.tsx
+  useEffect(() => {
+    if (initialSubmission) return;
     loadSubmission(submissionId)
       .then(setSubmission)
       .catch(() => setMessage("Không thể tải hồ sơ."));
   }, [submissionId]);
```

**Truy vấn một tệp thay cho kéo cả danh sách:**

```diff
--- a/src/app/api/submissions/[submissionId]/files/[fileId]/route.ts
+++ b/src/app/api/submissions/[submissionId]/files/[fileId]/route.ts
-    const file = (await repository.listFiles(submissionId)).find(
-      (candidate) => candidate.fileId === fileId,
-    );
+    const file = await repository.findActiveFile(submissionId, fileId);
```

```diff
+++ b/src/modules/public-intake/repository.ts
+  async findActiveFile(submissionId: string, fileId: string): Promise<StoredFile | null> {
+    const database = getDatabase();
+    const rows = await database<FileRow[]>`
+      select file_id, submission_id, owner_id, document_type, drive_file_id, mime_type,
+        size_bytes, checksum_sha256, file_name, status, created_at, updated_at
+      from public.public_files
+      where submission_id = ${submissionId}
+        and file_id = ${fileId}
+        and status = 'UPLOADED'
+      limit 1
+    `;
+    return rows[0] ? mapFile(rows[0]) : null;
+  }
```

**Không nới `no-store`; thay vào đó giữ blob trong bộ nhớ trang và thu hồi khi rời trang:**

```diff
+++ b/src/components/admin/document-viewer.tsx
+function usePreviewImages(submissionId: string) {
+  const cache = useRef(new Map<string, string>());
+  const pending = useRef(new Set<string>());
+
+  useEffect(() => {
+    const cached = cache.current;
+    return () => {
+      for (const url of cached.values()) URL.revokeObjectURL(url);
+      cached.clear();
+    };
+  }, []);
+
+  const request = useCallback(
+    (fileId: string) => {
+      if (cache.current.has(fileId) || pending.current.has(fileId)) return;
+      pending.current.add(fileId);
```

**Panel AI chỉ gọi API khi mở; `loading` là giá trị suy ra (quy tắc eslint cấm setState đồng bộ trong
thân effect):**

```diff
+++ b/src/components/admin/ai-draft-panel.tsx
+  /** Suy ra, không lưu state: đang mở mà dữ liệu chưa khớp phiên bản hồ sơ tức là đang tải. */
+  const loading = open && loadedVersion !== version;
...
+    if (!open || loadedVersion === version) return;
     let active = true;
     fetch(`/api/submissions/${submissionId}/ai-draft`, { cache: "no-store" })
```

**Test khóa cam kết audit:**

```diff
+++ b/tests/submission-detail-view.test.ts
+  it("ghi đúng MỘT dòng audit SUBMISSION_SENSITIVE_DETAIL_VIEWED cho mỗi lần đọc", async () => {
+    mockFindById.mockResolvedValue(makeRecord());
+
+    await loadSubmissionDetail("sub_1", officer, "req-2");
+
+    expect(mockAppendAudit).toHaveBeenCalledTimes(1);
```

## 21. Full unified diff

```text
FULL_DIFF_OMITTED_DUE_TO_SIZE
Reason: diff của commit 7bb4341 là 870 dòng thêm / 125 dòng xóa trên 28 file, trong đó 231 dòng là
tài liệu (docs/brain/*) và 267 dòng là test mới. Xem toàn bộ bằng: git show 7bb4341
Files requiring deeper review:
  - src/modules/submissions/detail-view.ts  (MỚI — đường đọc dùng chung, có ghi audit; kiểm tra
    audit không bị mất và DTO không lộ driveFileId/checksum)
  - src/proxy.ts                            (bảo mật — header no-store cho bề mặt cán bộ)
  - src/app/submissions/[submissionId]/page.tsx (đổi thời điểm đọc dữ liệu; nhánh notFound và nhánh
    chịu lỗi tạm)
  - src/components/admin/document-viewer.tsx (rủi ro cao nhất của đợt — đổi cách nạp ảnh, KHÔNG có
    test tự động; kiểm tra vòng đời object URL và việc thu hồi khi unmount)
  - src/modules/public-intake/repository.ts  (SQL mới, chưa chạy trên Postgres thật)
```

## 22. Agent declaration

Agent xác nhận:

- **Đã đọc các tài liệu nguồn sự thật:** `CLAUDE.md`, toàn bộ `docs/brain/` (00→06, đặc biệt Code
  Graph trong `01-architecture.md`), `AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md`, và các file mã liên
  quan trước khi sửa.
- **Không tự mở rộng phạm vi ngoài phần đã nêu:** ba điểm vượt ra ngoài bốn hạng mục 2B đã được khai
  báo rõ ở mục 5 → *Deviations* kèm lý do và tác động (header `no-store`, sửa 12 lỗi typecheck
  baseline, gộp kiểu dữ liệu). Không thêm OCR, đối soát dân cư, Shared Drive hay bất kỳ tính năng
  nào ngoài scope.
- **Không ghi đè thay đổi có sẵn của người dùng:** cây làm việc sạch khi bắt đầu; chỉ revert
  `next-env.d.ts` do `npm run build` tự sinh.
- **Không đưa secret vào báo cáo:** không thêm biến môi trường, không hardcode khóa, không thêm lệnh
  log nào; báo cáo không chứa CCCD, số điện thoại thật, token hay URL upload session.
- **Không tự merge.**
- **Không tự deploy** — và không chạy migration.
- **Kết quả test được ghi đúng theo lệnh thực tế:** các số 687/10, 0 lỗi typecheck, 0 lỗi + 5 warning
  lint đều lấy từ đầu ra thật của `npm test`, `npm run typecheck`, `npm run lint` trong phiên này.
- **Các nội dung chưa xác minh đã được đánh dấu rõ:** AC-07, AC-08, AC-09 ghi `NOT_TESTED`; E2E và
  security check ghi `NOT_RUN`; SQL `findActiveFile` ghi rõ chưa chạy trên Postgres thật; đã nêu là
  **không có** số đo hiệu năng nào.
- **Đã tự đính chính một báo cáo sai trước đó:** báo cáo Đợt 2A-2 và 2A-3 ghi "typecheck 0 lỗi" là
  sai (thực tế 12 lỗi tại `2d67eb2`); nguyên nhân, bằng chứng và cách sửa ghi ở mục 3 và mục 4.
