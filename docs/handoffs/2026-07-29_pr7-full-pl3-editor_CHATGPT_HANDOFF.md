# CHATGPT HANDOFF REPORT

## 1. Report metadata

- Project: Hệ thống thu thập và kiểm tra nhanh hồ sơ đất đai Phường Phong Châu
- Repository path: `D:\04. Github\capphongchau`
- Generated at: 2026-07-29 11:22:45 +07:00
- Agent: Codex
- Task: Nâng cấp “Bàn làm việc biên tập đầy đủ” để nhập, lưu, tải lại và xuất đúng toàn bộ cột B–AX của `Tai lieu/PL3.xlsx`
- Status: `READY_FOR_REVIEW`
- Source plan: yêu cầu trực tiếp của người dùng; `PLAN.md`; `docs/brain/04-current-tasks.md`
- Source acceptance criteria: yêu cầu trực tiếp của người dùng và Definition of Done trong `AGENTS.md`
- Source security constraints: `AGENTS.md` §4–§7; `docs/brain/02-security.md`; `AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md`

## 2. Git identity

- Current branch: `docs/agent-handoff-protocol`
- Remote: `origin https://github.com/vi-phuong-158/capphongchau.git`
- Base commit before work: `40d46879869fc107edc925a61174373c81d693d1`
- Head commit after work: `40d46879869fc107edc925a61174373c81d693d1`
- Commit created: không; thay đổi đang uncommitted theo đúng phạm vi người dùng chưa yêu cầu commit
- Working tree state: dirty từ trước khi bắt đầu và vẫn dirty
- User changes detected before work: có; nhiều tài liệu, source, test và file xóa/chưa track đã tồn tại
- User changes preserved: có; không reset, checkout, xóa hoặc commit thay đổi có sẵn. Một số file chồng lấn được sửa theo hunk nhỏ.

Root `CHATGPT_HANDOFF.md` được thay bằng báo cáo này vì quy trình bắt buộc file ở root luôn đại diện cho đợt thi công gần nhất.

### Git status

```text
 M AGENTS.md
 M CHATGPT_HANDOFF.md
 D CLAUDE_IMPLEMENTATION_PLAN_PUBLIC_INTAKE_V2.md
 D GEMINI/GEMINI_REVIEW_NOTES.md
 D GEMINI/HANDOFF_TO_ANTIGRAVITY_2026-07-25.md
 D GEMINI/IMPLEMENTATION_PLAN_ANTIGRAVITY.md
 D GEMINI/REVIEW_CLAUDE_OPUS.md
 M PLAN.md
 D PLAN2.md
 D PLAN_NL.md
 M README.md
 M docs/architecture.md
 M docs/brain/00-project-overview.md
 M docs/brain/01-architecture.md
 M docs/brain/03-decisions.md
 M docs/brain/04-current-tasks.md
 M docs/brain/05-testing-and-deploy.md
 M docs/brain/06-ai-working-log.md
 M evidence/PUBLIC_INTAKE_V2_BASELINE.md
 M evidence/PUBLIC_INTAKE_V2_DIFF_REVIEW.md
 M evidence/PUBLIC_INTAKE_V2_RELEASE_CHECKLIST.md
 M evidence/PUBLIC_INTAKE_V2_SECURITY_REVIEW.md
 M scripts/preflight-public-intake-v2-migrations.ts
 M src/app/api/submissions/[submissionId]/accept/route.ts
 M src/app/api/submissions/[submissionId]/working-payload/route.ts
 M src/components/admin/editable-parcel-table.tsx
 M src/components/admin/working-payload-editor.tsx
 M src/components/submission-detail.tsx
 M src/modules/public-intake/pl3-export.ts
 M src/modules/public-intake/reference.ts
 M src/modules/public-intake/repository.ts
 M src/modules/public-intake/types.ts
 M src/modules/public-intake/validation.ts
 M src/modules/submissions/completion-checks.ts
 M src/modules/submissions/official-record.ts
 M tests/completion-checks.test.ts
 M tests/e2e/public-intake-v2.spec.ts
 M tests/pl3-export.test.ts
 M tests/working-payload.test.ts
?? docs/README.md
?? docs/archive/
?? docs/handoffs/2026-07-29_certificate-lookup-v2-continuation_CHATGPT_HANDOFF.md
?? evidence/README.md
?? src/modules/public-intake/working-payload-audit.ts
?? supabase/migrations/202607290002_full_pl3_editor.sql
?? tests/full-pl3-editor.test.ts
```

Các file ngoài phạm vi PL3 ở trên là thay đổi đã tồn tại trong worktree. Không được xem toàn bộ danh sách này là diff do hạng mục hiện tại tạo ra.

### Diff statistics

```text
Toàn working tree so với HEAD:
39 tracked files changed, 2148 insertions(+), 8024 deletions(-)
Ngoài ra có các file untracked nêu trong git status.

Task-scoped tracked files (numstat; một số file chồng lấn với baseline):
48   0   scripts/preflight-public-intake-v2-migrations.ts
11   2   src/app/api/submissions/[submissionId]/working-payload/route.ts
382 149   src/components/admin/editable-parcel-table.tsx
620 121   src/components/admin/working-payload-editor.tsx
51   3   src/components/submission-detail.tsx
94  62   src/modules/public-intake/pl3-export.ts
3    0   src/modules/public-intake/reference.ts
58   6   src/modules/public-intake/repository.ts
59   5   src/modules/public-intake/types.ts
76   1   src/modules/public-intake/validation.ts
104 24   src/modules/submissions/completion-checks.ts
27   9   src/modules/submissions/official-record.ts
233 12   tests/pl3-export.test.ts
30   0   tests/working-payload.test.ts

Task-scoped untracked:
src/modules/public-intake/working-payload-audit.ts
supabase/migrations/202607290002_full_pl3_editor.sql
tests/full-pl3-editor.test.ts
```

### Name status

```text
Task-scoped:
M AGENTS.md
M docs/architecture.md
M docs/brain/01-architecture.md
M docs/brain/03-decisions.md
M docs/brain/04-current-tasks.md
M docs/brain/06-ai-working-log.md
M scripts/preflight-public-intake-v2-migrations.ts
M src/app/api/submissions/[submissionId]/working-payload/route.ts
M src/components/admin/editable-parcel-table.tsx
M src/components/admin/working-payload-editor.tsx
M src/components/submission-detail.tsx
M src/modules/public-intake/pl3-export.ts
M src/modules/public-intake/reference.ts
M src/modules/public-intake/repository.ts
M src/modules/public-intake/types.ts
M src/modules/public-intake/validation.ts
A src/modules/public-intake/working-payload-audit.ts
M src/modules/submissions/completion-checks.ts
M src/modules/submissions/official-record.ts
A supabase/migrations/202607290002_full_pl3_editor.sql
A tests/full-pl3-editor.test.ts
M tests/pl3-export.test.ts
M tests/working-payload.test.ts
```

## 3. Executive summary

Trước thay đổi, bàn làm việc cán bộ chỉ sửa một phần dữ liệu và PL3 export không khớp đủ 49 cột B–AX. Hạng mục đã:

- Đọc và render trực tiếp `Tai lieu/PL3.xlsx`, sheet `Phong Châu`, vùng A1:AX10.
- Khóa đúng 49 nhãn và ánh xạ B–AX, không dịch hoặc tự đổi tên cột.
- Bổ sung CRUD đầy đủ cho chủ sử dụng, tổ chức/người đại diện, người sử dụng hiện tại, thửa đất, tối đa ba mục đích/thửa và tài sản gắn liền với từng thửa.
- Bổ sung payload, Zod validation, repository transaction, projection, official sync, audit an toàn và migration additive.
- Bổ sung hiển thị nguồn cho B, V, AX và ghi đè bắt buộc lý do tối thiểu 10 ký tự.
- Sửa export để xuất đúng tổ chức và người đại diện riêng biệt, cột W, ba nhóm Z–AN và tài sản AO–AW.
- Chứng minh round-trip JSON/schema, route save, audit không chứa giá trị PII và hàng export đủ 49 giá trị bằng test tự động.

Mã nguồn sẵn sàng review. Chưa áp migration lên Preview/Production và chưa chạy thao tác UI có đăng nhập với database thật.

## 4. Baseline before changes

| Check | Command | Result | Evidence |
| --- | --- | --- | --- |
| Unit/integration | `npm.cmd test` | PASS | 621 pass, 10 skip |
| E2E | nằm trong full Vitest baseline | PASS/SKIP theo cấu hình | Không có browser thật |
| Build | `npm.cmd run build` | PASS | Next.js production build hoàn tất |
| Lint | `npm.cmd run lint` | FAIL/OOM | Quét `.claude/worktrees/**/.next`; lỗi ngoài source hạng mục |
| Typecheck | `npm.cmd run typecheck` | PASS | `tsc --noEmit` exit 0 |
| Format | `npm.cmd run format:check` | FAIL | 40 file đã có cảnh báo định dạng trước thay đổi |

Baseline đã dirty. Đặc biệt `submission-detail.tsx`, `completion-checks.ts`, các test completion/E2E và nhiều tài liệu có thay đổi sẵn; các hunk ngoài nhiệm vụ được giữ nguyên.

## 5. Scope

### In scope

- Đối chiếu chính xác B–AX của `PL3.xlsx`.
- Full editor cho mọi trường nhập thủ công tương ứng.
- Trường tự động có nguồn, override và lý do.
- Persist qua `draft_json`, projection và official records.
- Validation, audit, migration, preflight, export và test.
- Cập nhật tài liệu kiến trúc/decision/current task/working log và handoff.

### Out of scope

- Áp migration lên Supabase Preview/Production.
- Deploy Vercel hoặc bật `OFFICIAL_ACCEPTANCE_ENABLED`.
- Thay đổi auth, vai trò, DataScope hoặc Drive.
- Nhập dữ liệu thật hay tạo hồ sơ production.
- Chỉnh cấu hình ESLint để bỏ qua `.claude/worktrees`.

### Deviations from approved plan

- Không có thay đổi nghiệp vụ ngoài yêu cầu.
- Giới hạn ba mục đích không đặt trực tiếp trên `draftSchema`, mà kiểm ở `validateWorkingPayloadForSave` và các validator submit. Cách này giữ nguyên mã lỗi nghiệp vụ chi tiết của luồng công khai.

## 6. Decisions implemented

| Decision | Implementation | Evidence |
| --- | --- | --- |
| PL3 là nguồn tên cột | `PL3_COLUMN_NAMES` chứa đúng 49 nhãn B–AX | `tests/pl3-export.test.ts` so khớp toàn mảng |
| Tổ chức khác người đại diện | `organisationName`/`organisationIdentityNumber` tách khỏi H–L | types, migration, editor, export test |
| Tối đa ba mục đích/thửa | UI chặn thêm mục thứ tư; route/submit validator chặn payload vượt giới hạn | validation + route tests |
| Tài sản gắn theo thửa | `Asset.parcelId` và FK projection | migration, editor, export |
| Trường tự động có nguồn | B từ danh mục, V từ ánh xạ địa chính, AX từ file metadata | editor + export |
| Override phải truy nguyên | Giá trị override cần lý do ≥10 ký tự; audit ghi path/reason, không ghi old/new value | Zod superRefine + audit tests |
| Không mất payload cũ | Trường mới optional/default rỗng; tài sản legacy chưa gắn thửa vẫn được xuất để tránh mất dữ liệu | schema/export compatibility logic |

## 7. Changed files

| File | Type | Symbols/routes/components | Purpose | Risk |
| --- | --- | --- | --- | --- |
| `src/modules/public-intake/types.ts` | Modified | `Owner`, `Parcel`, `Asset`, `IntakeDraft`, empty factories | Mô hình toàn bộ trường PL3 | Medium |
| `src/modules/public-intake/validation.ts` | Modified | `draftSchema`, `validateWorkingPayloadForSave` | Validate field, reference, override, giới hạn 3 | Medium |
| `src/modules/public-intake/working-payload-audit.ts` | Added | `summarizeWorkingPayloadChanges` | Audit field paths/reasons không chứa giá trị PII | Low |
| `src/modules/public-intake/repository.ts` | Modified | `commitWorkingPayload`, `commitOfficialAmendment`, `refreshCanonicalProjection` | Lưu JSON + projection + history + audit cùng transaction | High |
| `src/modules/submissions/official-record.ts` | Modified | official record sync | Giữ trường mới khi tiếp nhận chính thức | High |
| `supabase/migrations/202607290002_full_pl3_editor.sql` | Added | additive columns/FK/index | Lưu bền vững projection/official fields | High |
| `scripts/preflight-public-intake-v2-migrations.ts` | Modified | `runChecks` | Chặn deploy nếu thiếu cột/index migration mới | Medium |
| `src/modules/public-intake/pl3-export.ts` | Modified | `PL3_COLUMN_NAMES`, row mapping, `assetCells` | Xuất đúng B–AX | High |
| `src/modules/public-intake/reference.ts` | Modified | `WARD_ADMIN_CODE` | Nguồn tự động cho cột B | Low |
| `src/components/admin/working-payload-editor.tsx` | Modified | `WorkingPayloadEditor` | CRUD B–R, AO–AW, nguồn/override | Medium |
| `src/components/admin/editable-parcel-table.tsx` | Modified | `EditableParcelTable` | CRUD S–AN và giới hạn 3 mục đích | Medium |
| `src/components/submission-detail.tsx` | Modified | mô tả editor | Không còn mô tả đây là bản tóm tắt | Low |
| `src/modules/submissions/completion-checks.ts` | Modified | `completionChecks` | Chặn thiếu dữ liệu tổ chức/đại diện, asset, override | Medium |
| `src/app/api/submissions/[submissionId]/working-payload/route.ts` | Modified | `PUT` | Validate full payload trước commit | Medium |
| `tests/pl3-export.test.ts` | Modified | PL3 header/row tests | So khớp 49 nhãn và 49 giá trị | Low |
| `tests/full-pl3-editor.test.ts` | Added | round-trip/audit/migration/UI contract tests | Bao phủ yêu cầu mới | Low |
| `tests/working-payload.test.ts` | Modified | route validation tests | Chặn override thiếu lý do và >3 mục đích | Low |
| `AGENTS.md`, `docs/architecture.md`, `docs/brain/01-architecture.md`, `03-decisions.md`, `04-current-tasks.md`, `06-ai-working-log.md` | Modified | tài liệu | Đồng bộ kiến trúc, quyết định, việc vận hành và log | Low |

## 8. Detailed implementation by phase

### Phase 1 — Inventory PL3

- Mục tiêu: xác nhận tên và thứ tự cột thật.
- Nội dung: import/render workbook bằng runtime spreadsheet; kiểm sheet `Phong Châu`, A1:AX10; ghi nhận B–AX có 49 cột.
- Kết quả: phát hiện export cũ sai phần tài sản, thiếu “Nhà chung cư” và dùng “Hạng nhà/Cấp nhà”.
- Rủi ro: không chỉnh file nguồn `PL3.xlsx`.

### Phase 2 — Payload, validation và UI

- Mục tiêu: cho cán bộ xem/thêm/sửa/xóa mọi dữ liệu thủ công.
- Nội dung: mở rộng types/Zod; viết lại hai component editor theo nhóm cột; liên kết asset với parcel; giới hạn ba land-use row; source/override B/V/AX.
- Test: `tests/full-pl3-editor.test.ts`, `tests/working-payload.test.ts`.
- Kết quả: payload serialize/parse round-trip giữ nguyên trường mới.

### Phase 3 — Persistence, audit và official sync

- Mục tiêu: lưu/tải lại không mất dữ liệu và chuyển sang bản chính thức đầy đủ.
- Nội dung: repository cập nhật `draft_json`, override columns, history, canonical projection và audit trong transaction; official tables nhận data JSON/cột mới.
- Test: repository/route/full suite hiện hữu và test migration contract.
- Rủi ro: migration phải được áp trước khi deploy code.

### Phase 4 — PL3 export

- Mục tiêu: một hàng export khớp đúng B–AX.
- Nội dung: khóa header; map từng cột; tách tổ chức/đại diện; thêm W, ba nhóm land use, AO–AW; warning nếu payload bất thường vượt ba mục đích.
- Test: exact 49-column header và exact 49-cell row.
- Kết quả: không còn silent blank đối với field đã có trong payload.

### Phase 5 — Verification và docs

- Nội dung: preflight migration, focused/full tests, typecheck, build, scoped lint, diff check; cập nhật tài liệu bắt buộc.
- Kết quả: mã nguồn task sạch; full repo lint còn lỗi generated `.next` đã tồn tại.

## 9. Behavior before and after

| Scenario | Before | After | Verification |
| --- | --- | --- | --- |
| Sửa chủ/tổ chức/đại diện | Chỉ tập con/tóm tắt | CRUD đầy đủ F–N | UI contract + round-trip test |
| Người sử dụng hiện tại | Không có editor đầy đủ | O–R trên từng owner | UI + export exact row |
| Thửa đất | Thiếu V/W và CRUD đầy đủ | S–Y, V có source/override, W nhập tay | UI + export test |
| Mục đích sử dụng | Không map đủ 3 nhóm | Tối đa 3 nhóm Z–AN mỗi thửa | validation/route/export tests |
| Tài sản | Thiếu nhiều trường và header sai | AO–AW, gắn theo parcel | schema/UI/export tests |
| Trường tự động | Không rõ nguồn/override | Hiện nguồn và bắt lý do khi override | validation/audit/UI tests |
| Save/reload | Trường mới không tồn tại | JSON/schema/repository giữ trường mới | round-trip + repository build/tests |
| PL3 export | Không đủ/không đúng B–AX | 49 nhãn + 49 giá trị đúng thứ tự | exact export test |

## 10. API, data and security impact

### Authentication

- Không thay đổi. Route vẫn yêu cầu `requireActiveUser`.

### Authorization

- Không nới quyền. Chỉ cán bộ có vai trò trong `SUBMISSION_READ_ROLES`, đã claim hồ sơ và hồ sơ ở `UNDER_REVIEW` mới lưu working payload.

### DataScope

- Không thay đổi. `submissionId` được lookup server-side; route xác minh `record.claimedBy === user.email`.

### API contract

- Endpoint: `PUT /api/submissions/:submissionId/working-payload`
- Request vẫn gồm `expectedVersion`, `payload`, `changeNote`; payload nay chấp nhận các trường PL3 mới.
- Header vẫn bắt buộc CSRF và `idempotency-key`.
- Thêm lỗi 400 an toàn khi payload vượt ba mục đích/thửa hoặc vi phạm schema/override.
- Response vẫn trả `version`, `updatedAt`, `requestId`.
- Idempotency và version conflict giữ nguyên.

### Database and migrations

- Migration: `202607290002_full_pl3_editor.sql`.
- `public_submissions`: override B/AX và reasons.
- `public_owners`: tên/mã tổ chức.
- `public_parcels`: V, lý do override V, W.
- `public_assets`: `parcel_id` và AP–AW; thêm index theo submission/parcel.
- `owners`: `data_json`.
- `official_parcels`: các cột PL3 mới.
- `official_land_uses`: `purpose_free_text`.
- Backfill: không bắt buộc; cột mới nullable/default phù hợp payload cũ.
- Rollback: không tự động drop cột vì trái chính sách không xóa schema/dữ liệu; rollback code trước, giữ cột additive.
- Production action: chạy migration theo thứ tự và chạy preflight trước deploy.

### Validation and file handling

- Override B/V/AX cần reason tối thiểu 10 ký tự.
- Asset có `parcelId` phải tham chiếu parcel trong cùng payload.
- Working payload và submit đều chặn hơn ba land uses/thửa.
- File upload/MIME/size không thay đổi.
- AX mặc định lấy danh sách tên file đã xác minh; override được audit.

### Sensitive data

- Payload có tên, CCCD và địa chỉ.
- Audit mới không ghi giá trị trước/sau; chỉ ghi tối đa 250 field paths và lý do override.
- Không ghi Drive ID, link, token hoặc QR raw.
- Export PL3 vẫn là thao tác nhạy cảm theo cơ chế authorization/audit sẵn có.

## 11. Tests added or changed

| Test file | Test case | Requirement | Result |
| --- | --- | --- | --- |
| `tests/full-pl3-editor.test.ts` | JSON/Zod round-trip | Save/reload giữ mọi trường | PASS |
| `tests/full-pl3-editor.test.ts` | max 3 land uses | Giới hạn mỗi thửa | PASS |
| `tests/full-pl3-editor.test.ts` | override reason | Không override âm thầm | PASS |
| `tests/full-pl3-editor.test.ts` | audit summary no PII values | Audit an toàn | PASS |
| `tests/full-pl3-editor.test.ts` | migration/UI markers | Schema và full editor tồn tại | PASS |
| `tests/pl3-export.test.ts` | exact B–AX names | Không đổi tên/dịch cột | PASS |
| `tests/pl3-export.test.ts` | exact 49-cell row | Xuất đúng tổ chức, đại diện, parcel/use/asset | PASS |
| `tests/pl3-export.test.ts` | >3 use warning | Không để trống âm thầm | PASS |
| `tests/working-payload.test.ts` | invalid override and fourth use | Route chặn payload không hợp lệ | PASS |

## 12. Final verification

| Check | Command | Result | Evidence |
| --- | --- | --- | --- |
| Focused tests | `npm.cmd test -- --run tests/citizen-submit-validation.test.ts tests/public-intake-validation.test.ts tests/full-pl3-editor.test.ts tests/working-payload.test.ts tests/pr6-review-round-two.test.ts` | PASS | 106/106 |
| Full tests | `npm.cmd test` | PASS | 67 files pass, 2 skipped; 631 tests pass, 10 skipped; exit 0 |
| Build | `npm.cmd run build` | PASS | Next.js 16.2.10 compiled, typed and generated 23/23 pages; exit 0 |
| Typecheck | `npm.cmd run typecheck` | PASS | `tsc --noEmit`; exit 0 |
| Scoped lint | `npx.cmd eslint <task files>` | PASS | Không có ESLint output; command chain tiếp tục |
| Full lint | `$env:NODE_OPTIONS='--max-old-space-size=8192'; npm.cmd run lint` | FAIL, pre-existing scope | 5345 lines từ `.claude/worktrees/**/.next`; không báo file task |
| Scoped format | `npx.cmd prettier --check <task files>` | WARN | Hai file chồng lấn `repository.ts`, `completion-checks.ts`; baseline format đã fail 40 files |
| Diff whitespace | `git diff --check` | PASS | exit 0 |
| Security | audit and route tests + code review | PASS for automated scope | Không log PII values; auth/CSRF/claim checks giữ nguyên |
| Secret scan | Không chạy tool secret-scan chuyên dụng | NOT_TESTED | Không thêm secret/fixture thật |

## 13. Acceptance criteria matrix

| ID | Acceptance criterion | Status | Evidence | Notes |
| --- | --- | --- | --- | --- |
| AC-01 | Không chỉ hiển thị tóm tắt | PASS | Hai editor đầy đủ theo nhóm B–AW | Cần QA trực quan có đăng nhập |
| AC-02 | CRUD chủ sử dụng | PASS | `WorkingPayloadEditor`; tests | |
| AC-03 | Tổ chức và người đại diện riêng | PASS | types/schema/editor/export exact row | |
| AC-04 | Người sử dụng hiện tại O–R | PASS | editor/export tests | |
| AC-05 | CRUD thửa S–Y | PASS | `EditableParcelTable` | |
| AC-06 | Tối đa 3 mục đích/thửa Z–AN | PASS | UI + route + semantic tests | |
| AC-07 | Tài sản AO–AW | PASS | schema/editor/migration/export tests | |
| AC-08 | Schema/validation/repository/working payload/audit | PASS | migration, repository, validators, audit tests | Chưa apply DB thật |
| AC-09 | Exact B–AX, không đổi tên | PASS | exact 49-header test từ workbook | |
| AC-10 | Không để trống âm thầm | PASS | mọi field payload có mapping; cảnh báo >3 | Giá trị thực sự chưa nhập vẫn được phép trống theo nghiệp vụ |
| AC-11 | Trường tự động hiện nguồn/override reason | PASS | UI labels + Zod + audit | |
| AC-12 | Save/reload giữ thay đổi | PASS for code/test | JSON round-trip + repository commit path | Live DB/UI manual test còn cần |
| AC-13 | Export đúng PL3 | PASS for automated mapping | exact 49-cell row | Nên mở file export thật sau migration |
| AC-14 | Full regression/build | PASS | 631 pass/10 skip; build/typecheck pass | Full lint infrastructure vẫn fail |

## 14. Manual verification required

- Áp migration trên Supabase Preview.
- Chạy `npm run preflight:public-intake-v2`.
- Đăng nhập bằng cán bộ allowlisted, claim một hồ sơ giả ở `UNDER_REVIEW`.
- Thêm hai owner, một organization + representative, current user, hai parcels, ba land uses cho một parcel và hai assets.
- Override B, V hoặc AX với lý do từ 10 ký tự.
- Lưu, refresh trang, xác nhận tất cả giá trị còn nguyên.
- Xuất PL3, mở sheet và so từng ô B–AX với giá trị đã nhập.
- Thử thêm mục đích thứ tư và override thiếu lý do; mong đợi UI/route từ chối.
- Chỉ dùng dữ liệu giả/ẩn danh.

## 15. Remaining issues and warnings

| Severity | Issue | Impact | Recommended action |
| --- | --- | --- | --- |
| High | Migration mới chưa áp ngoài local | Deploy code trước migration sẽ lỗi repository | Apply Preview → preflight → QA → Production |
| Medium | Chưa QA UI/save/reload/export trên DB thật | Automated test chưa chứng minh rendering/browser và SQL live | Thực hiện checklist §14 |
| Low | Full lint quét generated `.next` trong `.claude/worktrees` | `npm run lint` toàn repo exit 1 dù source task sạch | Tách quyết định cấu hình ignore ở hạng mục riêng |
| Low | Hai file chồng lấn còn cảnh báo Prettier | Không ảnh hưởng typecheck/build/tests | Format có kiểm soát sau khi hợp nhất thay đổi người dùng |
| Low | Worktree có rất nhiều thay đổi ngoài task | Review/commit nhầm phạm vi | Stage chọn lọc task files, review trước commit |

## 16. Regression and compatibility notes

- Browser/device: chưa kiểm Android/iPhone thật.
- Node/runtime: build thành công với runtime hiện tại.
- Database: migration additive; payload cũ dùng default/optional.
- API external: không thay.
- Backward compatibility: owner organization legacy vẫn có fallback khi export; asset legacy chưa có `parcelId` được áp cho mỗi parcel để không mất dữ liệu.
- Excel: header lấy nguyên văn workbook; không sửa `PL3.xlsx`.
- Trường vượt giới hạn: validator chặn save/submit; export vẫn phát warning phòng payload lịch sử bất thường.

## 17. Rollback plan

- Code: revert chọn lọc các file task sau khi tách khỏi thay đổi có sẵn.
- Migration: không drop cột hoặc dữ liệu tự động. Vì migration additive, rollback code có thể giữ schema mới.
- Dữ liệu: không cần phục hồi nếu chỉ rollback code; payload JSON mới vẫn còn nguyên.
- Không rollback tự động nếu đã có dữ liệu thật trong cột mới.

## 18. Recommended next action

`READY_FOR_CHATGPT_REVIEW`

Review diff task-scoped, đặc biệt migration/repository/export; sau đó áp migration lên Preview và thực hiện QA thủ công §14 trước khi commit/deploy.

## 19. Commands to reproduce

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test -- --run tests/citizen-submit-validation.test.ts tests/public-intake-validation.test.ts tests/full-pl3-editor.test.ts tests/working-payload.test.ts tests/pr6-review-round-two.test.ts
npm.cmd test
npm.cmd run build
npx.cmd eslint "src/app/api/submissions/[submissionId]/working-payload/route.ts" "src/components/admin/editable-parcel-table.tsx" "src/components/admin/working-payload-editor.tsx" "src/modules/public-intake/pl3-export.ts" "src/modules/public-intake/repository.ts" "src/modules/public-intake/types.ts" "src/modules/public-intake/validation.ts" "src/modules/public-intake/working-payload-audit.ts" "src/modules/submissions/completion-checks.ts" "src/modules/submissions/official-record.ts" "scripts/preflight-public-intake-v2-migrations.ts" "tests/full-pl3-editor.test.ts" "tests/pl3-export.test.ts" "tests/working-payload.test.ts"
git diff --check

# Sau khi áp migration trên Preview:
npm.cmd run preflight:public-intake-v2
```

## 20. Key diff excerpts

### Working payload validation

```diff
+export function validateWorkingPayloadForSave(draft: IntakeDraft): string | null {
+  const saveError = validateDraftForSave(draft);
+  if (saveError) return saveError;
+  if (draft.parcels.some((parcel) => parcel.landUses.length > MAX_LAND_USES_PER_PARCEL)) {
+    return `Mỗi thửa chỉ ghi tối đa ${MAX_LAND_USES_PER_PARCEL} dòng mục đích sử dụng.`;
+  }
+  return null;
+}
```

### Audit without before/after PII values

```diff
+export function summarizeWorkingPayloadChanges(previous, next) {
+  const changedFieldPaths = [];
+  collectChangedPaths(previous ?? {}, next, "", changedFieldPaths);
+  return {
+    changedFieldPaths: changedFieldPaths.slice(0, 250),
+    automaticOverrideReasons,
+  };
+}
```

### Additive persistence

```diff
+alter table public.public_owners
+  add column if not exists organisation_name text,
+  add column if not exists organisation_identity_number text;
+
+alter table public.public_assets
+  add column if not exists parcel_id text,
+  add column if not exists mixed_use_building_name text,
+  add column if not exists apartment_building_name text,
+  add column if not exists apartment_number text,
+  add column if not exists construction_area text,
+  add column if not exists floor_area text,
+  add column if not exists ownership_form text,
+  add column if not exists ownership_term text,
+  add column if not exists grade text;
```

### Exact PL3 contract

```diff
+export const PL3_COLUMN_NAMES = [
+  "Mã đơn vị hành chính cấp xã",
+  "Số phát hành GCN",
+  ...
+  "Nhà hỗn hợp/Chung cư",
+  "Nhà chung cư",
+  "Số căn hộ",
+  "Diện tích xây dựng (m2)",
+  "Diện tích sàn (m2)",
+  "Hình thức sở hữu",
+  "Thời hạn sở hữu",
+  "Cấp công trình",
+  "Tên tệp tin quét (scan) GCN",
+] as const;
```

## 21. Full unified diff

```text
FULL_DIFF_OMITTED_DUE_TO_SIZE
Reason: toàn worktree vượt xa 150 KB và trộn nhiều thay đổi có sẵn của người dùng; nhúng toàn bộ sẽ
không phân biệt được phạm vi task và bao gồm hàng nghìn dòng xóa ngoài hạng mục.
Files requiring deeper review:
- supabase/migrations/202607290002_full_pl3_editor.sql
- src/modules/public-intake/repository.ts
- src/modules/public-intake/pl3-export.ts
- src/modules/public-intake/validation.ts
- src/components/admin/working-payload-editor.tsx
- src/components/admin/editable-parcel-table.tsx
- src/modules/submissions/official-record.ts
- tests/pl3-export.test.ts
- tests/full-pl3-editor.test.ts
```

## 22. Agent declaration

- Đã đọc `AGENTS.md`, `PLAN.md`, toàn bộ `docs/brain/` liên quan, `AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md` và nguồn `PL3.xlsx`.
- Đã dùng Code Graph trước khi sửa để xác định luồng và blast radius.
- Không tự mở rộng phạm vi, không reset/ghi đè thay đổi có sẵn ngoài các hunk cần thiết.
- Không đưa secret, dữ liệu cá nhân thật, Drive ID/link hoặc QR raw vào code/test/báo cáo.
- Không tự merge, commit, push hoặc deploy.
- Kết quả test/build/lint được ghi theo lệnh thực tế; full lint và manual QA chưa đạt/ chưa chạy được đánh dấu rõ.
