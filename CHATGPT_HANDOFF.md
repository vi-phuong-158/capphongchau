# CHATGPT HANDOFF REPORT

## Phase 1 performance report — SQL queue pagination/search (2026-07-29)

### 1. Report metadata

- Project: Hệ thống thu thập và kiểm tra nhanh hồ sơ đất đai Phường Phong Châu (`land-ocr-180`)
- Repository path: `D:\04. Github\capphongchau`
- Generated at: 2026-07-29 16:14 +07:00
- Agent: Codex
- Task: Triển khai Phase 1 của `docs/PERFORMANCE_REVIEW_AND_IMPLEMENTATION_PLAN_CAPPHONGCHAU.md`
- Status: `READY_FOR_REVIEW`
- Preview migration/benchmark follow-up: migration `202607290004_queue_search_performance.sql` applied on rehearsal project ref `ddiaaweuqfvutogjckwc`; 20,000 synthetic rows benchmarked inside a transaction and rolled back. Status 17.99 ms, owner trigram 4.95 ms, receipt trigram 47.22 ms, issue 62.60 ms. Full preflight is 29/32 because rehearsal lacks older migrations `202607290001`/`202607290002`; do not deploy code to that DB until dependencies are applied.
- Phase 1 acceptance follow-up: rehearsal `public` schema was reset transactionally and all 20 migrations were applied in filename order; preflight is now **32/32 PASS**. Preview deployment is Ready at `https://capphongchau-c1dsyba2h-vi-phuong-158s-projects.vercel.app` (`dpl_2bPH2zEneNfy48QE1CRZdmpVXN3o`). `GET /api/health/database` returned 200/schema ok; unauthenticated `GET /api/submissions` returned 401. Added `Server-Timing` (`auth`, `queue_db`, `total`) on successful queue responses. Authenticated end-to-end queue benchmark (P50/P95, search/cursor/phone masking) is **blocked** because Preview auth credentials/session cookie are not available; Vercel env pull redacts secrets. Phase 1 is not marked PASS.
- Source plan: `docs/PERFORMANCE_REVIEW_AND_IMPLEMENTATION_PLAN_CAPPHONGCHAU.md` §6 Phase 1
- Source acceptance criteria: tài liệu trên §6, §7, §8
- Source security constraints: `AGENTS.md` §5–§7

### 2. Git identity

- Current branch: `codex/perf-queue-sql-pagination`
- Remote: `origin https://github.com/vi-phuong-158/capphongchau.git`
- Base commit before work: `2fca1f363c8c6212692ca048c61e3929750493e8`
- Head commit after work: `2fca1f363c8c6212692ca048c61e3929750493e8` + uncommitted changes
- Commit created: Không
- Working tree state: Dirty; gồm thay đổi Phase 1 và thay đổi PR #8 xuất hiện đồng thời
- User changes detected before work: `docs/PERFORMANCE_REVIEW_AND_IMPLEMENTATION_PLAN_CAPPHONGCHAU.md`
  là file untracked
- User changes preserved: Có; không sửa tài liệu review nguồn và không ghi đè nhóm PR #8

#### Git status

```text
## codex/perf-queue-sql-pagination
 M AGENTS.md
 M CHATGPT_HANDOFF.md
 M docs/architecture.md
 M docs/brain/01-architecture.md
 M docs/brain/03-decisions.md
 M docs/brain/04-current-tasks.md
 M docs/brain/06-ai-working-log.md
 M scripts/preflight-public-intake-v2-migrations.ts
 M src/app/api/submissions/[submissionId]/route.ts                 # PR #8 đồng thời
 M src/app/api/submissions/[submissionId]/working-payload/route.ts # PR #8 đồng thời
 M src/app/api/submissions/route.ts
 M src/components/admin/document-viewer.tsx                        # PR #8 đồng thời
 M src/components/admin/working-payload-editor.tsx                 # PR #8 đồng thời
 M src/components/submission-detail.tsx                            # PR #8 đồng thời
 M src/components/submissions-queue.tsx
 M src/modules/public-intake/repository.ts
?? docs/PERFORMANCE_REVIEW_AND_IMPLEMENTATION_PLAN_CAPPHONGCHAU.md # có trước task
?? evidence/PERFORMANCE_BASELINE.md
?? src/modules/submissions/queue-pagination.ts
?? src/modules/submissions/working-identity-transitions.ts         # PR #8 đồng thời
?? supabase/migrations/202607290004_queue_search_performance.sql
?? tests/document-viewer.test.ts                                  # PR #8 đồng thời
?? tests/manual-identity-confirmation-route.test.ts                # PR #8 đồng thời
?? tests/submissions-queue-performance.test.ts
?? tests/submissions-queue-repository.test.ts
?? tests/working-identity-transitions.test.ts                      # PR #8 đồng thời
```

#### Phase 1 diff statistics

```text
10 tracked files: 349 insertions, 88 deletions
5 Phase 1 files mới: evidence, cursor module, migration, 2 test files
```

#### Phase 1 name status

```text
M AGENTS.md
M docs/architecture.md
M docs/brain/01-architecture.md
M docs/brain/03-decisions.md
M docs/brain/04-current-tasks.md
M docs/brain/06-ai-working-log.md
M scripts/preflight-public-intake-v2-migrations.ts
M src/app/api/submissions/route.ts
M src/components/submissions-queue.tsx
M src/modules/public-intake/repository.ts
A evidence/PERFORMANCE_BASELINE.md
A src/modules/submissions/queue-pagination.ts
A supabase/migrations/202607290004_queue_search_performance.sql
A tests/submissions-queue-performance.test.ts
A tests/submissions-queue-repository.test.ts
```

### 3. Executive summary

Hàng chờ trước đây đọc toàn bộ danh sách, và khi tìm kiếm còn đọc toàn bộ `draft_json`, rồi mới lọc,
sắp xếp và cắt 100 dòng trong Node. Phase 1 chuyển toàn bộ thao tác này vào PostgreSQL:

- `PublicIntakeRepository.listQueuePage()` thực hiện status/search/keyset/order/limit;
- mỗi request đọc tối đa 101 dòng kết quả chính và trả tối đa 100;
- cursor dùng cả `updated_at` và `submission_id`, không bỏ sót do timestamp trùng;
- migration thêm generated columns và index B-tree/GIN trigram;
- UI debounce 350 ms, không tìm một ký tự và giữ bảng cũ khi tải;
- auth, role, masking số điện thoại và `cache-control: no-store` giữ nguyên.

Code, unit test, typecheck, lint và build đạt. Chưa áp migration hoặc đo Preview 20.000 hồ sơ, nên chưa
tuyên bố đạt P95 ≤ 1,5 giây và chưa sẵn sàng deploy.

### 4. Baseline before changes

| Check | Command | Result | Evidence |
|---|---|---|---|
| Unit tests | `npm test` | PASS — 646 pass, 10 skip | Exit 0, 8,29 giây |
| Integration tests | Không chạy DB | NOT TESTED | Không có Preview DB được phép |
| E2E tests | Không chạy | NOT TESTED | Ngoài Phase 1 local |
| Build | `npm run build` | PASS | Exit 0 |
| Lint | `npm run lint` | PASS — 0 error, 10 warning có sẵn | Exit 0 |
| Typecheck | `npm run typecheck` | PASS | Exit 0 |

Baseline chi tiết và giới hạn đo nằm ở `evidence/PERFORMANCE_BASELINE.md`.

### 5. Scope

#### In scope

- SQL keyset pagination/search cho `GET /api/submissions`
- Cursor encode/decode/validation
- Generated columns và indexes
- Debounce UI và giữ bảng cũ khi tải
- Test, preflight migration, tài liệu và handoff

#### Out of scope

- Phase 2 server-prime detail/lazy preview
- Lazy Drive folder, pool size, acceptance batching
- Deploy, merge, migration thật, load test Production
- Sửa nhóm PR #8 xuất hiện đồng thời

#### Deviations from approved plan

- Không chạy `EXPLAIN ANALYZE`/P50/P95 vì không có database Preview tách biệt được cho phép.
- Bổ sung preflight cho migration `202607290004`; full test bắt buộc việc này và đây là đúng phạm vi
  an toàn triển khai.

### 6. Decisions implemented

| Decision | Implementation | Evidence |
|---|---|---|
| PostgreSQL phân trang | `listQueuePage`, `LIMIT pageLimit + 1` | repository test |
| Keyset ổn định | `(updated_at, submission_id)` | cursor + repository tests |
| Tìm kiếm có index | generated columns + `pg_trgm` GIN | migration/source test |
| Không tải lại theo từng phím | debounce 350 ms, min 2 ký tự | source test |
| Giữ bảo mật hiện hữu | same role check, `maskPhone`, no-store | route test/source |

### 7. Changed files

| File | Change | Symbols/components | Purpose | Risk |
|---|---|---|---|---|
| `src/modules/submissions/queue-pagination.ts` | Added | `QueueCursor`, encode/decode | Cursor opaque, validate | Low |
| `src/modules/public-intake/repository.ts` | Modified | `listQueuePage`, queue DTO | SQL page/search | Medium |
| `src/app/api/submissions/route.ts` | Modified | `GET` | Dùng repository page, validate input | Medium |
| `src/components/submissions-queue.tsx` | Modified | `SubmissionsQueue` | Debounce/giữ bảng | Low |
| `supabase/migrations/202607290004_queue_search_performance.sql` | Added | columns/indexes | Tăng tốc DB | Medium |
| `scripts/preflight-public-intake-v2-migrations.ts` | Modified | `runChecks` | Gate cột/index mới | Low |
| `tests/submissions-queue-performance.test.ts` | Added | 12 tests | Cursor/source invariants | Low |
| `tests/submissions-queue-repository.test.ts` | Added | 2 tests | SQL params/page cursor | Low |
| `evidence/PERFORMANCE_BASELINE.md` | Added | baseline/runbook | Bằng chứng và benchmark còn lại | Low |
| `AGENTS.md`, `docs/architecture.md`, `docs/brain/01/03/04/06` | Modified | docs | Đồng bộ schema/Code Graph/log | Low |
| `CHATGPT_HANDOFF.md` | Modified | report | Bàn giao chính thức | Low |

### 8. Detailed implementation by phase

#### Phase 0 — Baseline

- Ghi Git/base commit và chạy unit/typecheck/lint/build trước sửa.
- Không dùng `.env.local` để đo DB vì không chứng minh được đó là Preview.

#### Phase 1 — Queue SQL pagination/search

- Thêm projection generated từ `draft_json`.
- Tìm literal an toàn: escape `!`, `%`, `_` trước `ILIKE ... ESCAPE '!'`.
- Predicate keyset:
  `updated_at < cursor.updatedAt OR (updated_at = cursor.updatedAt AND submission_id < cursor.id)`.
- Trả cursor từ dòng thứ 100 khi có dòng thứ 101.
- Invalid status/cursor trả `400 VALIDATION_FAILED`.

### 9. Behavior before and after

| Scenario | Before | After | Verification |
|---|---|---|---|
| Mở queue | Đọc toàn bảng summary | SQL `LIMIT 101` | source/repository test |
| Tìm kiếm | Đọc toàn `draft_json` | SQL + trigram indexes | migration/source test |
| Cursor | raw submission ID + `findIndex` | base64url timestamp + ID | unit tests |
| Gõ tìm | request từng ký tự | debounce 350 ms, min 2 | source test |
| Đổi filter | Ẩn bảng thành loading | giữ bảng, trạng thái nhỏ | source test |

### 10. API, data and security impact

#### Authentication / authorization / DataScope

- Không đổi: `requireActiveUser(SUBMISSION_READ_ROLES)` vẫn chạy trước repository.
- Không thêm DataScope mới; endpoint giữ phạm vi staff queue hiện hành.

#### API contract

- Endpoint: `GET /api/submissions`
- Request: `status`, `q`, `cursor` giữ tên cũ.
- Response: cấu trúc submission giữ nguyên; `nextCursor` đổi từ raw submission ID sang opaque
  base64url. Component chỉ chuyển tiếp nên tương thích nội bộ.
- Invalid status/cursor: `400 VALIDATION_FAILED`, error envelope chuẩn.

#### Database and migrations

- Migration: `202607290004_queue_search_performance.sql`
- Additive: 2 generated columns, 2 B-tree indexes, 3 GIN trigram indexes, `pg_trgm`.
- Dữ liệu cũ được PostgreSQL sinh projection khi migration chạy; không ghi đè `draft_json`.
- Production action: áp migration trước code; chạy preflight và benchmark Preview trước.

#### Sensitive data

- Tên chủ/số GCN vốn nằm trong `draft_json`; generated columns không tạo phạm vi quyền mới.
- Không log query, tên, số GCN, phone hoặc cursor.
- Phone vẫn đi qua `maskPhone()` trước response.
- Cursor chỉ chứa timestamp và internal submission ID; không là bằng chứng quyền.

### 11. Tests added or changed

| Test file | Coverage | Result |
|---|---|---|
| `tests/submissions-queue-performance.test.ts` | 10 test cursor, route không list toàn bảng, SQL/index/UI | PASS |
| `tests/submissions-queue-repository.test.ts` | `limit+1`, cursor dòng cuối, search escaping, keyset params | PASS |
| `tests/pr6-review-round-two.test.ts` | Preflight nhắc đủ migration | PASS sau khi nối 290004 |
| `tests/migration-versions.test.ts` | Version migration duy nhất | PASS |

### 12. Final verification

| Check | Command | Result | Evidence |
|---|---|---|---|
| Focused tests | `npx vitest run ...queue... pr6... migration...` | PASS — 41/41 | Exit 0 |
| Full unit | `npm test` | PASS — 664 pass, 10 skip | Exit 0, 11,35 giây |
| QR flaky recheck | `...citizen-id-qr-decoding... --testTimeout=15000` | PASS — 8/8 | Exit 0 |
| Typecheck | `npm run typecheck` | PASS | Exit 0 |
| Build | `npm run build` | PASS | Exit 0 |
| Focused lint | `npx eslint <Phase 1 files>` | PASS — 0 warning/error | Exit 0 |
| Full lint | `npm run lint` | PASS — 0 error, 10 warning có sẵn | Exit 0 |
| Format check | `npm run format:check` | FAIL — 51 file | Nợ có sẵn + PR #8; file Phase 1 mới đã format |
| Diff whitespace | `git diff --check` | PASS | Exit 0 |
| DB migration/EXPLAIN | Không chạy | NOT TESTED | Cần Preview |
| E2E/load | Không chạy | NOT TESTED | Cần Preview/dữ liệu giả |

Lần full unit đầu trong chuỗi quality gate có hai lỗi: preflight chưa nhắc migration mới (đã sửa)
và QR test timeout dưới tải cao. Rerun QR riêng đạt 8/8; full unit sau sửa đạt 664/10. Full lint
lần đầu trùng lúc PR #8 đang sửa `DocumentViewer`; sau khi thay đổi đồng thời hoàn tất, full lint
chạy lại đạt exit 0 với đúng 10 warning baseline.

### 13. Acceptance criteria matrix

| ID | Acceptance criterion | Status | Evidence | Notes |
|---|---|---|---|---|
| AC-01 | Route không gọi `list()`/`listSummaries()` | PASS | source test | |
| AC-02 | Request đọc tối đa ~101 dòng chính | PASS_CODE | repository test | Chưa đo DB thật |
| AC-03 | SQL filter/search/order/keyset | PASS_CODE | focused tests | Chưa EXPLAIN |
| AC-04 | Timestamp trùng không lặp/bỏ do cursor | PASS | cursor/repository tests | |
| AC-05 | Quyền/masking giữ nguyên | PASS | route source test | |
| AC-06 | Debounce 350 ms, min 2 ký tự | PASS_CODE | source test | Chưa browser E2E |
| AC-07 | Migration/preflight chạy Preview | NOT_TESTED | Không có Preview DB | Bắt buộc trước deploy |
| AC-08 | P95 ≤ 1,5 giây với 20k giả | NOT_TESTED | Chưa có P50/P95 | Không tuyên bố đạt |

### 14. Manual verification required

- Áp toàn bộ migration đang chờ theo thứ tự trên Supabase Preview.
- Chạy `npm run preflight:public-intake-v2-migrations`.
- Dùng 500/5.000/20.000 hồ sơ giả và chạy EXPLAIN theo
  `evidence/PERFORMANCE_BASELINE.md`.
- Trên browser: mở queue, gõ nhanh, đổi status, tải thêm; xác nhận không duplicate và bảng không
  trắng khi tải.

### 15. Remaining issues and warnings

| Severity | Issue | Impact | Recommended action |
|---|---|---|---|
| High | Migration 290004 chưa áp | Code mới sẽ lỗi thiếu cột nếu deploy trước | Migration + preflight trước deploy |
| Medium | Chưa P50/P95/EXPLAIN 20k | Chưa chứng minh mục tiêu tốc độ | Benchmark Preview |
| Low | Format check toàn repo đỏ | Không phải hồi quy riêng Phase 1 | Xử lý theo task formatting riêng |

### 16. Regression and compatibility notes

- Browser/API client nội bộ coi cursor là opaque nên không cần đổi ngoài component hiện hữu.
- Generated columns yêu cầu PostgreSQL/Supabase hỗ trợ `pg_trgm`; migration tạo extension ở schema
  `extensions`.
- Không đổi file handling, Drive, upload, Auth.js, export hoặc PL3.

### 17. Rollback plan

- Rollback code: phục hồi route/UI/repository cũ trước.
- Rollback schema bằng migration mới: drop 5 index và 2 generated columns; giữ `pg_trgm` nếu có thể
  đang được thành phần khác dùng.
- Không cần phục hồi dữ liệu nghiệp vụ vì migration không sửa `draft_json`.
- Không rollback thủ công trên Production khi chưa chụp schema/kiểm dependency.

### 18. Recommended next action

`READY_FOR_CHATGPT_REVIEW`.

Sau review code, áp migration trên Preview và hoàn thành EXPLAIN/P95. Chưa đủ bằng chứng cho
`READY_FOR_DEPLOY_REVIEW`.

### 19. Commands to reproduce

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npx.cmd vitest run tests/submissions-queue-performance.test.ts tests/submissions-queue-repository.test.ts tests/pr6-review-round-two.test.ts tests/migration-versions.test.ts
npx.cmd eslint src/modules/submissions/queue-pagination.ts src/modules/public-intake/repository.ts src/app/api/submissions/route.ts src/components/submissions-queue.tsx scripts/preflight-public-intake-v2-migrations.ts tests/submissions-queue-performance.test.ts tests/submissions-queue-repository.test.ts
npm.cmd run preflight:public-intake-v2-migrations
git diff --check
```

### 20. Key diff excerpts

```diff
+ async listQueuePage(input) {
+   ... where ($1::text is null or status = $1)
+   ... or queue_issue_number ilike $2 escape '!'
+   ... or queue_owner_name ilike $2 escape '!'
+   ... or (updated_at = $3::timestamptz and submission_id < $4)
+   ... order by updated_at desc, submission_id desc
+   ... limit $5
+ }

- const filtered = (await repository.list()).filter(...).sort(...)
+ const page = await repository.listQueuePage({ status, query, cursor, limit: 100 })

+ add column queue_owner_name text generated always as (...) stored
+ create index public_submissions_queue_page_idx
+ create index ... using gin (... extensions.gin_trgm_ops)
```

### 21. Full unified diff

```text
FULL_DIFF_OMITTED_DUE_TO_SIZE
Reason: toàn working tree gồm tài liệu review nguồn, báo cáo cũ và nhóm PR #8 đồng thời; chèn toàn
bộ sẽ trộn quyền sở hữu thay đổi và vượt ngưỡng báo cáo sau khi tính cả file untracked/handoff.
Files requiring deeper review:
- src/modules/public-intake/repository.ts
- src/app/api/submissions/route.ts
- src/components/submissions-queue.tsx
- src/modules/submissions/queue-pagination.ts
- supabase/migrations/202607290004_queue_search_performance.sql
- scripts/preflight-public-intake-v2-migrations.ts
- tests/submissions-queue-performance.test.ts
- tests/submissions-queue-repository.test.ts
```

### 22. Agent declaration

- Đã đọc tài liệu nguồn sự thật và Code Graph trước khi code.
- Không tự mở rộng sang Phase 2–6, không thao tác Production, merge hoặc deploy.
- Không ghi đè file review có trước hoặc nhóm PR #8 xuất hiện đồng thời.
- Không đưa secret/PII vào code, test, evidence hoặc handoff.
- Kết quả chưa đo được đã ghi `NOT_TESTED`, không tuyên bố tốc độ cảm tính.

---

## PR #8 update — tương thích luồng xác nhận định danh (2026-07-29)

### Outcome

- Hoàn thiện tab **Chủ sử dụng** của `WorkingPayloadEditor` thành luồng sửa/xác nhận chính thức khi
  hồ sơ `UNDER_REVIEW`; nút trên chi tiết chỉ điều hướng đến tab này. Modal cũ không còn được mở từ
  luồng `UNDER_REVIEW`, chỉ dùng cho điều chỉnh hồ sơ `ACCEPTED`.
- `PUT /api/submissions/:submissionId/working-payload` so sánh payload ứng viên với payload hiệu lực:
  sửa họ tên/CCCD/ngày sinh/giới tính sau `QR_CONFIRMED` cần lý do và server đặt
  `QR_OVERRIDE_PENDING_REVIEW`; sửa sau `MANUAL_COMPLETE` trả về `PENDING_CONFIRMATION`. API từ chối
  trạng thái, nguồn hoặc thời điểm xác nhận do client tự gửi.
- `PATCH /api/submissions/:submissionId` vẫn là lối duy nhất đặt `MANUAL_COMPLETE`; test xác minh
  request log kind `MANUAL_IDENTITY_CONFIRMATION`, payload đã cập nhật và retry cùng key không commit
  lần hai. Audit repository chỉ chứa đường dẫn/số lượng, không có PII.
- GET detail thêm `files[].ownerId` nội bộ; `DocumentViewer` hiển thị CCCD theo chủ, đánh số GCN độc
  lập, reset khi tập file đổi, Esc đóng lightbox và dialog có nhãn truy cập được.

### Baseline, Git và phạm vi

- Branch hiện tại: `codex/perf-queue-sql-pagination`; HEAD: `2fca1f363c8c6212692ca048c61e3929750493e8`.
  Không commit, push, merge hay deploy.
- Baseline trước phần PR #8: source PR #8 hiện hữu và một tệp tài liệu hiệu năng chưa theo dõi được
  giữ nguyên. Trong lúc thực hiện xuất hiện nhóm thay đổi hàng đợi/SQL/preflight ngoài phạm vi này
  (`queue-pagination`, migration `202607290004`, `src/app/api/submissions/route.ts`, benchmark và
  test tương ứng); không chỉnh logic hay gộp commit của nhóm đó.
- Không migration cho phần PR #8; không đổi quyền hay nới `completionChecks`.

### Files/symbols PR #8

- `src/modules/submissions/working-identity-transitions.ts` —
  `normalizeWorkingIdentityTransitions`.
- `src/app/api/submissions/[submissionId]/working-payload/route.ts` — gác cổng transition server.
- `src/app/api/submissions/[submissionId]/route.ts` — `files[].ownerId` staff detail.
- `src/components/admin/{working-payload-editor,document-viewer}.tsx` và
  `src/components/submission-detail.tsx` — tab Chủ sử dụng, xác nhận thủ công, nhãn/tương tác ảnh.
- `tests/{working-identity-transitions,manual-identity-confirmation-route,document-viewer}.test.ts`
  — transition, replay và label đa chủ/GCN.
- `AGENTS.md`, `docs/architecture.md`, `docs/brain/{01-architecture,03-decisions,06-ai-working-log}.md`
  — đồng bộ contract/Code Graph/quyết định/nhật ký.

### Verification

| Check | Result |
|---|---|
| Focused Vitest | PASS — 5 files, 15/15 |
| Full Vitest | PASS — 73 files, 664 passed, 10 skipped |
| Typecheck | PASS — `npm run typecheck` |
| Lint | PASS — 0 error; 10 warning có sẵn |
| Prettier (file PR #8) | PASS — 9 file TypeScript đã format/check |
| Prettier (toàn repo) | NOT_CLEAN — 50 file lịch sử/ngoài phạm vi báo style; không format hàng loạt workspace |
| Production build | PASS — Next.js 16.2.10, 23/23 static pages |
| `git diff --check` | PASS (chỉ cảnh báo line ending cũ ở working log) |
| Staff E2E claim → edit QR → confirm → accept | NOT_RUN — suite Playwright hiện không có fixture/credential cán bộ an toàn cho luồng này |

### Acceptance and remaining work

- Đạt: không giả `MANUAL_COMPLETE` qua working-payload; QR override cần lý do; sửa định danh đã
  xác nhận tay buộc xác nhận lại; nhãn ảnh đúng nhiều chủ và nhiều GCN; lỗi GCN/thửa đất vẫn do
  `completionChecks` quyết định.
- Cần trước khi mark PR ready: chạy E2E trên Preview với fixture giả và tài khoản cán bộ được cấp,
  rồi đợi GitHub `quality` và Vercel Preview pass sau khi chủ sở hữu commit/push. Không có hành động
  deploy/merge trong nhiệm vụ này.

### Diff trọng yếu

```diff
+ normalizeWorkingIdentityTransitions(effectivePayload(record), candidate)
+ QR_CONFIRMED + sửa định danh + lý do -> QR_OVERRIDE_PENDING_REVIEW
+ MANUAL_COMPLETE + sửa định danh -> PENDING_CONFIRMATION
+ GET /api/submissions/:id -> files[].ownerId
```

## 1. Report metadata

- Project: Hệ thống thu thập và kiểm tra nhanh hồ sơ đất đai Phường Phong Châu (`land-ocr-180`)
- Repository path: `D:\04. Github\capphongchau`
- Generated at: 2026-07-29 14:20 +07:00
- Agent: Codex
- Task: Bật chuẩn hóa ảnh trên Vercel Preview và Production
- Status: `READY_FOR_DEPLOY_REVIEW`
- Source plan: yêu cầu trực tiếp của chủ dự án “bật lên đi”
- Source acceptance criteria: cờ tồn tại ở hai môi trường, deployment mới `Ready`, alias và health
  production trả 200, tài liệu nguồn sự thật phản ánh đúng trạng thái/rủi ro
- Source security constraints: `AGENTS.md`, `PLAN.md`, `docs/brain/*`,
  `AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md`

## 2. Git identity

- Current branch: `docs/agent-handoff-protocol`
- Remote: `https://github.com/vi-phuong-158/capphongchau.git`
- Base commit before work: `ed03f05e2c42595de87b63fbc6c957b827342a4e`
- Head commit after work: `ed03f05e2c42595de87b63fbc6c957b827342a4e` + uncommitted documentation
- Commit created: Không
- Working tree state: 8 file tài liệu modified, không có source code/schema
- User changes detected before work: Không; `git status --short` ban đầu sạch
- User changes preserved: Có

### Git status

```text
 M AGENTS.md
 M CHATGPT_HANDOFF.md
 M docs/architecture.md
 M docs/brain/01-architecture.md
 M docs/brain/03-decisions.md
 M docs/brain/04-current-tasks.md
 M docs/brain/06-ai-working-log.md
 M evidence/PUBLIC_INTAKE_V2_UPLOAD_BENCHMARK.md
```

### Diff statistics

```text
7 source-of-truth/benchmark files: 59 insertions, 12 deletions.
CHATGPT_HANDOFF.md được thay bằng báo cáo nhiệm vụ hiện tại và không tính vào thống kê trên.
```

### Name status

```text
M  AGENTS.md
M  CHATGPT_HANDOFF.md
M  docs/architecture.md
M  docs/brain/01-architecture.md
M  docs/brain/03-decisions.md
M  docs/brain/04-current-tasks.md
M  docs/brain/06-ai-working-log.md
M  evidence/PUBLIC_INTAKE_V2_UPLOAD_BENCHMARK.md
```

## 3. Executive summary

- Đã thêm `NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED=true` vào Vercel Preview và Production.
- Đã redeploy từ deployment gần nhất của từng môi trường, không deploy source từ branch tài liệu.
- Preview deployment `dpl_CRfKZHxA8vVPi9wDJNx6fn6krP5w` và Production deployment
  `dpl_DMPPmXNzwswVJ7WRNTiseyRoqCmV` đều `Ready`.
- Alias production `https://capphongchau.vercel.app` giữ nguyên và trả HTTP 200.
- Health Google Drive và database production đều HTTP 200.
- Không sửa code, API, schema, quyền hoặc dữ liệu nghiệp vụ.
- Chưa kiểm chất lượng chữ nhỏ/QR trên điện thoại thật; không tuyên bố đã đạt mục tiêu hiệu năng.

## 4. Baseline before changes

| Check | Command | Result | Evidence |
|---|---|---|---|
| Upload unit tests | `npx vitest run tests/image-normalization.test.ts tests/upload-queue.test.ts tests/resumable-upload.test.ts tests/upload-transport.test.ts` | PASS | 4 files, 64/64 tests |
| Typecheck | `npm run typecheck` | PASS | exit 0 |
| Build | `npm run build` | PASS | Next.js 16.2.10, 23/23 static pages |
| Git state | `git status --short --branch` | PASS | clean branch trước thao tác |
| Integration/E2E | Không chạy | NOT_TESTED | Không cần ghi dữ liệu thật chỉ để bật cờ |

## 5. Scope

### In scope

- Bật biến môi trường ở Preview và Production.
- Redeploy đúng artifact gần nhất.
- Smoke test production.
- Đồng bộ tài liệu nguồn sự thật và báo cáo bàn giao.

### Out of scope

- Thay đổi profile 2400/3000 px hoặc JPEG quality 0.88.
- Sửa logic upload/resume/queue.
- Migration, thay đổi API/database.
- Upload giấy tờ thật hoặc tạo dữ liệu hồ sơ thử trên production.
- Tuyên bố mức tăng tốc trước khi benchmark.

### Deviations from approved plan

- `docs/brain/04-current-tasks.md` trước đó yêu cầu benchmark trước khi bật. Chủ dự án đã trực tiếp
  yêu cầu bật sau khi được cảnh báo về byte nguồn, nên cờ được bật trước benchmark và tài liệu ghi
  rõ ngoại lệ/rủi ro này.

## 6. Decisions implemented

| Decision | Implementation | Evidence |
|---|---|---|
| Bật chuẩn hóa ảnh | Vercel env `true` ở Preview + Production | `vercel env ls` |
| Không deploy branch tài liệu | Redeploy từ URL deployment gần nhất | hai deployment ID |
| Chấp nhận bản tiếp nhận vận hành | Đồng bộ `AGENTS.md` và tài liệu kiến trúc | diff tài liệu |
| Giữ rollback đơn giản | Source default vẫn `false`; không migration | `.env.example` không đổi |

## 7. Changed files

| File | Change | Purpose | Risk |
|---|---|---|---|
| `AGENTS.md` | Modified | Ghi ngoại lệ bản tiếp nhận vận hành khi cờ bật | Chính sách byte nguồn |
| `docs/architecture.md` | Modified | Ghi trạng thái cấu hình và profile production | Thấp |
| `docs/brain/01-architecture.md` | Modified | Đồng bộ Code Graph | Thấp |
| `docs/brain/03-decisions.md` | Modified | Ghi quyết định, deployment, rollback | Thấp |
| `docs/brain/04-current-tasks.md` | Modified | Ghi cờ đã bật nhưng benchmark còn thiếu | Thấp |
| `docs/brain/06-ai-working-log.md` | Modified | Nhật ký bắt buộc | Thấp |
| `evidence/PUBLIC_INTAKE_V2_UPLOAD_BENCHMARK.md` | Modified | Phân biệt “đã bật” với “đã nghiệm thu” | Thấp |
| `CHATGPT_HANDOFF.md` | Modified | Báo cáo bàn giao nhiệm vụ hiện tại | Không ảnh hưởng runtime |

Không có symbol, route, component hoặc migration nào bị sửa.

## 8. Detailed implementation

### Phase 1 — Baseline

- Xác nhận Git sạch, project Vercel liên kết đúng `capphongchau`.
- Chạy 64 test tập trung, typecheck và build; tất cả đạt.

### Phase 2 — Cấu hình và deploy

- Thêm cờ bằng Vercel CLI cho Preview và Production.
- Redeploy Preview từ deployment gần nhất; trạng thái `Ready`.
- Redeploy Production từ deployment gần nhất; trạng thái `Ready` và alias chính thức đã chuyển.

### Phase 3 — Smoke test và tài liệu

- GET `/ke-khai`, `/api/health/google`, `/api/health/database` trên production: cả ba HTTP 200.
- Đồng bộ policy, Code Graph, decision log, current task, benchmark và working log.

## 9. Behavior before and after

| Scenario | Before | After | Verification |
|---|---|---|---|
| JPEG/PNG/WebP lớn | Tải nguyên tệp nếu không phải HEIC | Có thể resize/re-encode theo profile | Cờ production đã bật |
| CCCD | Tối đa 30 MB | Chuẩn hóa tối đa 2400 px khi cần | Code hiện hữu + env |
| GCN | Tối đa 30 MB | Chuẩn hóa tối đa 3000 px khi cần | Code hiện hữu + env |
| Ảnh nhỏ dưới 4 MiB, trong max edge | Giữ nguyên | Vẫn giữ nguyên | Unit tests |
| HEIC | Chuyển JPEG | Không đổi | Unit tests |
| Drive upload | Browser → Drive | Không đổi | Không sửa code |

## 10. API, data and security impact

- Authentication/authorization/DataScope: Không thay đổi.
- API contract: Không thay đổi.
- Database/migration: Không có.
- File handling: Với ảnh cần chuẩn hóa, Drive lưu bản tiếp nhận vận hành thay vì byte camera.
- Sensitive data: Không đọc/in secret; Vercel chỉ hiển thị giá trị env dạng `Encrypted`.
- Tên file, CCCD, điện thoại, Drive URL/ID không được thêm vào telemetry hoặc tài liệu.

## 11. Tests added or changed

Không sửa test. Test hiện hữu đã chạy:

| Test group | Result |
|---|---|
| Image normalization | PASS |
| Upload queue | PASS |
| Resumable upload | PASS |
| XHR/fetch transport | PASS |
| Tổng | 64/64 PASS |

## 12. Final verification

| Check | Command | Result |
|---|---|---|
| Upload tests | `npx vitest run ...` | 64/64 PASS |
| Typecheck | `npm run typecheck` | PASS |
| Build | `npm run build` | PASS |
| Preview deployment | `vercel inspect ...ey5vvnn4e...` | Ready |
| Production deployment | `vercel inspect ...5l76ysikn...` | Ready |
| Production page | GET `/ke-khai` | 200 |
| Google health | GET `/api/health/google` | 200 |
| Database health | GET `/api/health/database` | 200 |
| Env presence | `vercel env ls` | Preview + Production present |
| Diff check | `git diff --check` | PASS; chỉ cảnh báo CRLF→LF đã có ở working log |

## 13. Acceptance criteria matrix

| ID | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| AC-01 | Preview env = true | PASS | Vercel env list |
| AC-02 | Production env = true | PASS | Vercel env list |
| AC-03 | Preview redeploy Ready | PASS | `dpl_CRfKZHxA8vVPi9wDJNx6fn6krP5w` |
| AC-04 | Production redeploy Ready | PASS | `dpl_DMPPmXNzwswVJ7WRNTiseyRoqCmV` |
| AC-05 | Production alias/health hoạt động | PASS | ba HTTP 200 |
| AC-06 | Unit/typecheck/build không hồi quy | PASS | 64 tests + typecheck + build |
| AC-07 | Chữ nhỏ/hướng ảnh/QR trên thiết bị thật | NOT_TESTED | cần kiểm thủ công |
| AC-08 | Giảm ≥35% thời gian, ≥50% dung lượng | NOT_TESTED | benchmark chưa có |

## 14. Manual verification required

- Dùng ảnh GCN giả lập có chữ nhỏ, không dùng giấy tờ thật.
- Thử Android Chrome và iPhone Safari.
- Kiểm ảnh dọc/ngang, đủ góc, chữ nhỏ đọc được và QR test quét được.
- Điền bảng trong `evidence/PUBLIC_INTAKE_V2_UPLOAD_BENCHMARK.md`.
- Nếu Q1–Q4 trượt, đặt cờ `false` và redeploy ngay.

## 15. Remaining issues and warnings

| Severity | Issue | Impact | Recommended action |
|---|---|---|---|
| High | Chưa kiểm chất lượng ảnh thật | Có thể giảm khả năng đọc GCN/QR | Smoke test thiết bị sớm |
| Medium | Chưa có A/B trước/sau | Chưa chứng minh mức tăng tốc | Điền benchmark |
| Medium | Không giữ byte camera với ảnh được chuẩn hóa | Khác policy “file gốc” cũ | Đã ghi rõ quyết định; rà pháp lý nếu cần |
| Low | `retryCount` telemetry hiện gán 0 | Báo cáo retry chưa đáng tin | Task riêng, không thuộc phạm vi bật cờ |

## 16. Regression and compatibility notes

- Browser: logic có fallback trả tệp nguồn nếu decode/canvas lỗi.
- Device: cần kiểm iOS Safari thực tế.
- API/database/Drive layout: không đổi.
- Backward compatibility: file đã tải trước đây không bị sửa.
- Chỉ file tải sau deployment production mới chịu cấu hình mới.

## 17. Rollback plan

1. Đặt `NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED=false` cho Preview/Production.
2. Redeploy deployment hiện hành.
3. Smoke test `/ke-khai` và hai health endpoint.
4. Không có migration hoặc dữ liệu cần phục hồi; file đã tải trước rollback giữ nguyên.

## 18. Recommended next action

`READY_FOR_CHATGPT_REVIEW`

Chức năng đã bật và deployment hoạt động. Việc tiếp theo là kiểm thủ công chất lượng ảnh/QR trên
thiết bị thật; chưa nên tuyên bố mức tăng tốc cho tới khi có số đo.

## 19. Commands to reproduce

```powershell
npx.cmd vercel env ls
npx.cmd vercel inspect https://capphongchau-ey5vvnn4e-vi-phuong-158s-projects.vercel.app
npx.cmd vercel inspect https://capphongchau-5l76ysikn-vi-phuong-158s-projects.vercel.app
npx.cmd vitest run tests/image-normalization.test.ts tests/upload-queue.test.ts tests/resumable-upload.test.ts tests/upload-transport.test.ts
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

## 20. Key diff excerpts

```diff
- Giữ nguyên file gốc.
+ Mặc định giữ nguyên file nguồn. Ngoại lệ khi cờ bật: Drive lưu bản tiếp nhận vận hành đã
+ chuẩn hóa trên thiết bị; không cam kết byte trùng tệp camera.

- NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED, mặc định FALSE
+ Source default FALSE; Vercel Preview + Production TRUE từ 2026-07-29
```

## 21. Full unified diff

```text
FULL_DIFF_OMITTED_DUE_TO_SIZE
Reason: CHATGPT_HANDOFF.md được thay toàn bộ từ báo cáo nhiệm vụ trước; task diff nghiệp vụ chỉ là
59 dòng thêm/12 dòng xóa trong bảy file tài liệu và được mô tả đầy đủ ở trên.
Files requiring deeper review: AGENTS.md, docs/brain/03-decisions.md,
evidence/PUBLIC_INTAKE_V2_UPLOAD_BENCHMARK.md.
```

## 22. Agent declaration

- Đã đọc tài liệu nguồn sự thật và quy trình bàn giao.
- Không sửa source code, schema, auth hoặc dữ liệu nghiệp vụ.
- Không ghi đè thay đổi có sẵn của người dùng.
- Không đưa secret hoặc PII vào báo cáo.
- Không merge, commit hoặc push.
- Deployment chỉ được thực hiện sau yêu cầu trực tiếp của người dùng.
- Kết quả chưa kiểm trên thiết bị thật được đánh dấu `NOT_TESTED`.

## 23. Handoff update — xác nhận định danh thủ công (2026-07-29)

### Outcome

- Đã thêm luồng để cán bộ đang giữ hồ sơ `UNDER_REVIEW` xác nhận rằng đã đối chiếu CCCD/bản giấy tờ.
- Checkbox trên **Chỉnh sửa thông tin** gửi một request tách biệt; server tự đặt
  `identityStatus = MANUAL_COMPLETE`, `identitySource = MANUAL` và `identityConfirmedAt`.
- Không nới `completionChecks`: các lỗi GCN, thửa đất, file và mọi chủ chưa được xác nhận vẫn chặn
  tiếp nhận chính thức.

### Baseline and scope

- Baseline trước thay đổi mã: branch `docs/agent-handoff-protocol`, HEAD
  `ed03f05e2c42595de87b63fbc6c957b827342a4e`; đã có 8 thay đổi tài liệu chưa commit của nhiệm vụ
  bật chuẩn hóa ảnh, được giữ nguyên.
- Thay đổi mã của nhiệm vụ này: `src/app/api/submissions/[submissionId]/route.ts`,
  `src/components/submission-detail.tsx`, `src/modules/public-intake/repository.ts`,
  `src/modules/submissions/manual-identity-confirmation.ts` và test tương ứng.
- Không có migration, không deploy, không đọc/ghi hồ sơ thật hay secret.

### API, audit and security

- `PATCH /api/submissions/:submissionId` nhận thêm
  `manualIdentityConfirmation: { ownerIds: string[] }`. Request phải có CSRF, idempotency key và
  version hiện tại; không được kèm chỉnh sửa trường khác.
- Chỉ cán bộ đang claim đúng hồ sơ `UNDER_REVIEW` được gọi. Server kiểm CCCD 12 số, ngày sinh,
  giới tính, địa chỉ; từ chối owner tổ chức, người dùng hiện tại tách biệt hoặc đã xác nhận.
- Thay đổi đi qua `commitWorkingPayload` trong cùng transaction: cập nhật lớp có hiệu lực,
  projection, request log kind `MANUAL_IDENTITY_CONFIRMATION` và audit action
  `SUBMISSION_IDENTITY_MANUALLY_CONFIRMED`. Audit chỉ có số lượng owner, không có CCCD/PII.
- GET staff trả payload hiệu lực để giao diện không hiển thị `draft_json` cũ sau claim.

### Verification

| Check | Result |
|---|---|
| Focused Vitest | PASS — 11/11 (`manual-identity-confirmation`, `completion-checks`) |
| Full Vitest | PASS — 646 passed, 10 skipped |
| Typecheck | PASS |
| Production build | PASS — 23/23 static pages |
| Changed-file ESLint | PASS — 0 error; 5 warning có sẵn ở `submission-detail.tsx` |
| Prettier test mới | PASS — `tests/manual-identity-confirmation.test.ts` |
| `git diff --check` | BLOCKED by pre-existing/unrelated `src/components/submissions-queue.tsx:231` blank line at EOF |

### Remaining risks and handoff notes

- Cần thử tay với một hồ sơ giả đã claim: mở **Chỉnh sửa thông tin**, tích xác nhận, bấm **Xác nhận
  đã đối chiếu CCCD**, tải lại rồi bấm tiếp nhận để chắc lỗi định danh biến mất; các lỗi thửa đất/GCN
  trong ảnh chụp vẫn phải còn.
- Workspace hiện có thay đổi source/untracked ngoài phạm vi nhiệm vụ: `working-payload-editor.tsx`,
  `submissions-queue.tsx`, `document-viewer.tsx`. Không chỉnh sửa, không stage, không commit chúng.
- Prettier còn báo các file source đang thay đổi (`route.ts`, `submission-detail.tsx`, `repository.ts`);
  không chạy format hàng loạt để tránh làm nhiễu/ghi đè thay đổi ngoài phạm vi. Typecheck, test, ESLint
  và build vẫn đạt.
- Chưa commit: cần người sở hữu quyết định gộp các thay đổi tài liệu tồn đọng và các thay đổi source
  ngoài phạm vi trước khi tạo commit.

## E2E Preview update — fixture cán bộ (2026-07-29)

- Preview được thử: `https://capphongchau-87rwc5g4n-vi-phuong-158s-projects.vercel.app`.
- Dùng fixture PNG tại `tests/fixtures/`, tài khoản active `SYSTEM_ADMIN` làm cán bộ và
  `REVIEW_OFFICER` cho kiểm tra quyền. Kết quả Playwright: 15 test, 1 pass (E2E-07), 14 fail trước
  khi app render vì Vercel Deployment Protection chuyển hướng tới `vercel.com/login`; đây không phải
  lỗi fixture hay lỗi luồng PR #8.
- Đã chạy cleanup đúng nhãn E2E `0912345678`: xóa 2 hồ sơ E2E và bảng con. Audit Drive chỉ báo 9 file
  mồ côi thuộc nhiều hồ sơ; không xóa tự động vì cần đối chiếu thủ công.
- Để chạy lại cần cung cấp `x-vercel-protection-bypass` hợp lệ/bật quyền Preview cho runner, sau đó
  chạy lại cùng lệnh. Chưa commit, push, merge hoặc deploy.
