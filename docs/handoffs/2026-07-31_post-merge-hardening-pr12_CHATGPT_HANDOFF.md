# CHATGPT HANDOFF REPORT

## 1. Report metadata

- Project: Hệ thống thu thập và kiểm tra nhanh hồ sơ đất đai Phường Phong Châu
- Repository path: `D:\04. Github\capphongchau`
- Generated at: 2026-07-31 15:36 ICT
- Agent: Codex
- Task: Post-merge hardening sau PR #12
- Status: `READY_FOR_COMMIT` — code/test/docs hoàn tất; Git stage/commit/push/PR bị chặn bởi hạn mức
  phê duyệt công cụ, không phải lỗi repository
- Source plan: yêu cầu đính kèm “POST-MERGE HARDENING SAU PR #12”
- Source acceptance criteria: mục 13–15 của yêu cầu
- Source security constraints: `AGENTS.md`, `docs/brain/02-coding-rules.md`

## 2. Git identity

- Current branch: `codex/post-merge-hardening-pr12`
- Remote: `https://github.com/vi-phuong-158/capphongchau.git`
- Base commit before work: `d898b7d1206e98d85bb469a5026ca73e0e09f453`
- Head commit after work: chưa có commit mới; HEAD vẫn `d898b7d`
- Commit created: không
- Working tree state: có thay đổi đúng phạm vi, chưa stage
- User changes detected before work: không; baseline sạch
- User changes preserved: có

### Git status

```text
M .env.example
M AGENTS.md
M docs/architecture.md
M docs/brain/01-architecture.md
M docs/brain/03-decisions.md
M docs/brain/04-current-tasks.md
M docs/brain/06-ai-working-log.md
M evidence/PUBLIC_INTAKE_V2_MIGRATIONS_002_006_RUNBOOK.md
M evidence/PUBLIC_INTAKE_V2_RELEASE_CHECKLIST.md
M evidence/PUBLIC_INTAKE_V2_SKIPPED_TESTS.md
M package-lock.json
M package.json
M src/app/api/public/submissions/current/certificate-duplicate-check/route.ts
M src/app/api/public/submissions/current/existing-records/check/route.ts
M src/app/api/public/submissions/current/existing-records/link/route.ts
M src/app/api/public/submissions/current/files/[fileId]/route.ts
M src/app/api/public/submissions/current/no-action/route.ts
M src/app/api/public/submissions/current/route.ts
M src/app/api/public/submissions/current/submit/route.ts
M src/app/api/public/submissions/current/uploads/complete/route.ts
M src/app/api/public/submissions/current/uploads/initiate/route.ts
M src/app/api/public/submissions/recover/route.ts
M src/app/api/public/submissions/route.ts
M src/app/api/submissions/[submissionId]/uploads/complete/route.ts
M src/modules/public-intake/repository.ts
M src/modules/public-intake/route-context.ts
M tests/officer-file-upload.test.ts
M tests/public-current-route.test.ts
M tests/public-upload-complete-replay-route.test.ts
M tests/public-upload-legacy-draft.test.ts
?? .nvmrc
?? tests/public-route-context-cache.test.ts
?? tests/upload-replay-repository.test.ts
```

### Diff statistics trước khi tạo handoff

```text
30 tracked files changed, 617 insertions(+), 210 deletions(-)
3 untracked files: .nvmrc và 2 test mới
```

## 3. Executive summary

- Officer upload-complete trước đây chỉ nhận replay trong transaction, sau khi đã đọc hồ sơ, chuẩn
  bị lazy folder và xác minh Drive. Retry sau khi commit/mất response có thể chạm lại external state.
- Helper replay public cũ không lọc `kind` và ép kiểu `response_json` thành `PublicFileSummary`.
- Conflict ở early public replay có thể thoát thành 500; cleanup trước trust boundary có nguy cơ xóa
  tệp client tự khai.
- API công khai chứa hồ sơ/session chưa có một helper no-store thống nhất.
- Tài liệu còn mô tả PR #12 là chưa merge và trộn Repository/Preview/Production.

Kết quả:

- Hai route upload dùng replay sớm có validate + filter `kind`; replay trong transaction vẫn giữ.
- Early conflict trả 409, không gọi Drive/cleanup.
- Response hồ sơ công khai dùng `private, no-store`, kể cả lỗi.
- Node runtime khóa 22.x; `.env.example` dùng email placeholder.
- 18 regression test mới pass; full suite 805 pass / 28 skip / 0 fail.
- Không migration, không database/Drive thật, không deploy.

## 4. Baseline before changes

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm.cmd ci` | PASS; 688 package; 22 advisory (1 moderate, 21 high) |
| Lint | `npm.cmd run lint` | PASS, 0 error / 5 warning |
| Typecheck | `npm.cmd run typecheck` | PASS |
| Unit/route/integration discovery | `npm.cmd test` | 787 pass / 28 skip / 0 fail |
| Build | `npm.cmd run build` | PASS |
| Diff check | `git diff --check` | PASS |

`npm.ps1` bị PowerShell execution policy chặn; dùng `npm.cmd` tương đương. `npm ci` ban đầu gặp
EPERM trong `node_modules`, chạy ngoài sandbox thì đạt.

## 5. Scope

### In scope

- Upload replay officer/public.
- Runtime validation cached response.
- Cache-Control API hồ sơ công khai.
- Node 22, `.nvmrc`, `@types/node` 22, email placeholder.
- Regression/mutation tests.
- Đồng bộ tài liệu sau PR #12.

### Out of scope

- Wizard 4 bước, request supplement, role/DataScope, `mayStaffEditState`.
- Trần ảnh/dung lượng, lazy folder algorithm, acceptance saga, PL3, AI.
- Migration/deploy/Production.

## 6. Decisions implemented

| Decision | Implementation | Evidence |
| --- | --- | --- |
| Replay hoàn tất trước Drive | `findCompletedFileUploadReplay` gọi ngay sau parse/auth/CSRF/hash | Route tests A-01/A-04 |
| Phân miền replay | Closed union `PUBLIC_UPLOAD_COMPLETE | OFFICER_UPLOAD_COMPLETE`; SQL lọc key + kind | `upload-replay-repository.test.ts` |
| Validate cache | `parseStoredUploadReplaySummary`; lỗi riêng `StoredUploadReplayInvalidError` | 6 invalid-shape tests |
| Giữ replay transaction | Không xóa nhánh cached trong hai commit method; thêm filter kind | Source + integration suite hiện hữu |
| Không cleanup early conflict | Catch 409 trước folder/Drive | Officer/public route tests |
| No-store fail-closed | `publicPrivateJson`, `publicError` dùng chung | Cache tests |

## 7. Changed files

| File/group | Symbols/behavior |
| --- | --- |
| `src/modules/public-intake/repository.ts` | replay kind union, parser/error, helper replay, filter kind trong hai transaction |
| Officer upload-complete route | early replay trước `findById`/folder/Drive; 409 không cleanup |
| Public upload-complete route | early replay trước folder/Drive; conflict 409; invalid cache 500; no metric on replay |
| `route-context.ts` | `publicPrivateJson`; `publicError` no-store |
| Public create/recover/current routes | success response chuyển sang helper private/no-store |
| `package.json`, `package-lock.json`, `.nvmrc` | Node 22.x và `@types/node@22.20.1` |
| `.env.example` | `SYSTEM_ADMIN_EMAIL=admin@example.gov.vn` |
| 4 test hiện hữu + 2 test mới | A-01 đến A-06, cache headers, parser/kind |
| `AGENTS.md`, architecture/brain docs | contract replay/cache và trạng thái PR #12 |
| 3 evidence files | tách Repo/Preview/Production; số test 805/28 |
| `docs/brain/06-ai-working-log.md` | entry mới; chuẩn hóa đuôi mixed UTF-16LE về UTF-8 |

## 8. Detailed implementation

### Phase A — Idempotent replay

- Tính scoped key/hash xong thì đọc request log.
- Match hash + valid JSON: trả fileId cũ, không đọc hồ sơ/Drive/commit/audit/metric.
- Hash khác: 409.
- JSON hỏng: safe 500, không lộ payload.
- Cache miss: tiếp tục luồng hiện hữu.
- Advisory lock + replay transaction vẫn tồn tại cho race đồng thời.

### Phase B — Cache-Control

- Header: `Cache-Control: private, no-store`, `Pragma: no-cache`, `Expires: 0`.
- Áp cho public create/recover, GET/PATCH current, upload initiate/complete, submit, no-action,
  certificate duplicate/existing record, delete JSON và toàn bộ `publicError`.
- Preview ảnh nhị phân đã có `private, no-store`; metrics 204 đã có `no-store`.
- Certificate lookup không dùng session, không trả PII và đã có `no-store`; không đổi contract.

### Phase C — Runtime/repository public

- Node engine 22.x, `.nvmrc` 22.
- `@types/node` từ 26 xuống 22 bằng npm install, không chỉnh lockfile tay.
- Máy chạy kiểm thử hiện tại là Node `v24.11.0`, nên npm phát EBADENGINE đúng kỳ vọng; CI/local theo
  `.nvmrc` cần Node 22.
- Chỉ thay placeholder trong `.env.example`; không chạm Vercel env.

## 9. Behavior before and after

| Scenario | Before | After | Verification |
| --- | --- | --- | --- |
| Officer retry sau commit | Chạm hồ sơ/folder/Drive trước replay | Trả cache ngay | A-01 |
| Early key conflict | Có thể đi sâu/cleanup hoặc 500 | 409, không Drive/cleanup | A-02/A-05 |
| Corrupt response_json | Blind cast | Runtime reject + safe 500 | A-03 |
| Same key, wrong kind | Helper chỉ lọc key | Không replay cross-domain | A-06 |
| Public current response | Dựa mặc định Next/Vercel | Explicit private/no-store | Cache tests |

## 10. API, data and security impact

- Authentication/session/CSRF/origin guard: không đổi.
- Authorization/DataScope: không đổi.
- Database/schema: không đổi; không migration.
- Request format: không đổi.
- Success payload: không đổi.
- Error mapping: early replay conflict nay chắc chắn `409 IDEMPOTENCY_CONFLICT`.
- Sensitive data: không log payload, CCCD, QR, upload URL hoặc Drive ID; corrupt JSON không trả client.
- Cache: authenticated/public-session response không được CDN/shared cache lưu.

## 11. Tests added or changed

| Test file | Coverage |
| --- | --- |
| `officer-file-upload.test.ts` | replay success/conflict/corrupt; no find/folder/Drive/commit/cleanup |
| `public-upload-complete-replay-route.test.ts` | success/conflict/corrupt; no Drive/commit/metric/cleanup; headers |
| `upload-replay-repository.test.ts` | parser valid/invalid; SQL key+kind; cross-kind isolation |
| `public-current-route.test.ts` | GET/PATCH/session-error cache headers |
| `public-route-context-cache.test.ts` | helper + publicError contract/headers |
| `public-upload-legacy-draft.test.ts` | mock contract đổi tên helper |

## 12. Final verification

| Check | Command | Result |
| --- | --- | --- |
| Focused | `npx.cmd vitest run ...6 files...` | 59/59 pass |
| Full Vitest | `npm.cmd test` | 805 pass / 28 skip / 0 fail |
| Integration explicit | 3 files | 27 skip, thiếu test DB |
| Lint | `npm.cmd run lint` | 0 error / 5 baseline warning |
| Typecheck | `npm.cmd run typecheck` | PASS |
| Build | `npm.cmd run build` | PASS, 23 static pages/routes table complete |
| Diff check | `git diff --check` | PASS |
| Changed code format | explicit `prettier --check` | PASS |
| Whole-repo format | `npm.cmd run format:check` | FAIL ở 39 file, phần lớn baseline/out-of-scope |

Build hai lần thay `next-env.d.ts` từ `.next/dev/types` sang `.next/types`; cả hai lần đã hoàn nguyên.

## 13. Acceptance criteria matrix

| ID | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| AC-A01 | Officer replay trước Drive | PASS | route test + mutation red |
| AC-A02 | Public conflict 409 | PASS | route test |
| AC-A03 | Filter kind | PASS | repository test + mutation red |
| AC-A04 | Validate JSON | PASS | parser tests + mutation red |
| AC-A05 | Early conflict không cleanup | PASS | officer/public tests |
| AC-A06 | Replay transaction giữ nguyên | PASS (code); integration SKIP | source + 28 skip report |
| AC-B01 | Public private/no-store | PASS | GET/PATCH/helper tests |
| AC-B02 | publicError no-store | PASS | direct test |
| AC-D01 | Node 22 | PASS | package/.nvmrc/@types |
| AC-D02 | Env placeholder | PASS | `.env.example` |
| AC-C01 | Docs phân biệt môi trường | PASS | brain/evidence |
| AC-GIT01 | Draft PR | BLOCKED | Git write approval quota exhausted |
| AC-GIT02 | PR #11 comment/close | BLOCKED | phải làm sau khi Draft PR mới tồn tại |

## 14. Manual verification required

- Chạy 4 integration files trên Postgres rehearsal đã xác minh.
- Preview smoke test có đăng nhập; không dùng Production.
- Xác nhận chính sách thông tin hỗ trợ trong Apps Script public repository.

## 15. Remaining issues and warnings

| Severity | Issue | Impact | Recommended action |
| --- | --- | --- | --- |
| Blocker | Không thể stage/commit/push vì approval tool quota hết | Chưa có Draft PR | Chạy lệnh mục 19 hoặc mở phiên có Git write |
| High | 28 integration test skip | Chưa có bằng chứng Postgres thật cho concurrency | Chạy trên rehearsal DB |
| Medium | Node thực thi hiện tại v24, project khóa v22 | Build vừa chạy không đúng exact runtime | CI/maintainer chạy lại trên Node 22 |
| Medium | Whole-repo Prettier fail 39 file | Debt có sẵn | Task format riêng; không bulk-fix trong PR này |
| Low | 22 npm advisory baseline | Dependency risk chưa triage | Task audit riêng; không `audit fix --force` |
| Out of scope | `06-ai-working-log.md` từng mixed encoding và nhắc script đã mất | Tài liệu lịch sử khó đọc | Encoding đã chuẩn hóa; script không được phục hồi |

## 16. Regression and compatibility notes

- Không đổi UI, role, state machine, schema, file limits hoặc Drive delete.
- Optional cached fields chấp nhận `null`/missing đúng serializer hiện tại.
- Route officer vẫn dùng `cache-control: no-store` như trước, không đổi thành private.
- API public thêm header chặt hơn; payload giữ nguyên.

## 17. Rollback plan

- Revert commit upload replay, cache, runtime, docs theo từng phạm vi sau khi chúng được tạo.
- Không rollback migration vì task không có migration.
- Không có dữ liệu cần phục hồi.

## 18. Recommended next action

`READY_FOR_COMMIT`

Chạy bốn commit scoped, push branch, mở Draft PR, sau đó comment/close PR #11. Không merge và không
deploy.

## 19. Commands to reproduce / continue

```powershell
git add -- <upload files>
git commit -m "fix(upload): return validated replay before Drive checks"

git add -- <public cache files>
git commit -m "fix(public-api): prevent caching of authenticated intake responses"

git add -- package.json package-lock.json .nvmrc .env.example
git commit -m "chore(runtime): align Node 22 development and CI runtime"

git add -- AGENTS.md docs evidence CHATGPT_HANDOFF.md
git commit -m "docs: reconcile repository state after PR #12"

git push -u origin codex/post-merge-hardening-pr12
gh pr create --draft --base main --head codex/post-merge-hardening-pr12 `
  --title "fix(public-intake): harden upload replay, private caching and post-merge state" `
  --body-file <pr-body.md>
```

Sau khi Draft PR mới tạo thành công:

```powershell
gh pr comment 11 --body "PR này đã được thay thế bởi PR #12. Không merge nhánh này vì migration internal_notes và các thao tác ảnh đã được sửa lại theo hướng nguyên tử trong PR #12. Công việc gia cố sau merge được thực hiện ở PR mới."
gh pr close 11
```

Không xóa branch PR #11.

## 20. Key diff excerpts / symbol summary

```text
PublicIntakeRepository
  + COMPLETED_FILE_UPLOAD_REPLAY_KINDS
  + CompletedFileUploadReplayKind
  + findCompletedFileUploadReplay({idempotencyKey, mutationHash, kind})
  + StoredUploadReplayInvalidError
  + parseStoredUploadReplaySummary
  ~ transaction replay query adds kind filter

Officer POST uploads/complete
  + early replay before findById/ensure folder/verify Drive
  + early conflict 409 without discardIfOrphan

Public POST uploads/complete
  + validated/kind-scoped early replay before folder/Drive
  + conflict 409 and invalid-cache safe 500
  + no metric on replay

route-context
  + publicPrivateJson
  ~ publicError -> publicPrivateJson
```

## 21. Full unified diff

```text
FULL_DIFF_OMITTED
Reason: yêu cầu cuối cho phép “unified diff hoặc tóm tắt diff theo symbol”; báo cáo dùng symbol
summary ở mục 20. Working tree chưa commit nên reviewer có thể lấy diff chính xác bằng:
  git diff -- .
  git diff --no-index -- NUL .nvmrc
  git diff --no-index -- NUL tests/public-route-context-cache.test.ts
  git diff --no-index -- NUL tests/upload-replay-repository.test.ts
```

## 22. Agent declaration

- Đã đọc nguồn chỉ dẫn bắt buộc và Code Graph trước khi sửa.
- Không mở rộng nghiệp vụ, không ghi đè thay đổi người dùng.
- Không dùng secret/PII thật.
- Không dùng database hoặc Drive thật.
- Không migration, không deploy, không merge.
- Kết quả test/skip được ghi đúng từ lệnh thực tế.
- Không tuyên bố đã tạo Draft PR hoặc đóng PR #11.
