# CHATGPT HANDOFF REPORT

## 1. Report metadata

- Project: `capphongchau` / `land-ocr-180`
- Repository path: `D:/04. Github/capphongchau`
- Generated at: 2026-07-29 (Asia/Ho_Chi_Minh)
- Agent: Codex
- Task: Add public GCN-number lookup alongside existing CCCD QR lookup.
- Status: `READY_FOR_REVIEW`
- Source acceptance criteria: user request on 2026-07-29.
- Security constraints: AGENTS.md §§3–7; no PII/raw GCN in public response or audit.

## 2. Git identity and baseline

- Branch: `docs/agent-handoff-protocol`
- Base commit: `4cb07b09c99b0fd9173e8264547d2e55f0c4ce5a`
- Commit created: current `HEAD` — `feat(public-intake): add GCN lookup and streamline wizard`.
- User changes before this work: six modified files, all preserved: Turnstile route/call-site changes and `tests/turnstile.test.ts`.
- Additional parallel/unowned modifications are now also present in `CLAUDE_IMPLEMENTATION_PLAN_PUBLIC_INTAKE_V2.md`, `public-wizard-validation.ts`, `public-intake-v2.spec.ts`, and `public-wizard-validation.test.ts`; this task did not alter their feature intent.

### Git status

```text
Modified: AGENTS.md; docs/architecture.md; docs/brain/01-architecture.md;
docs/brain/03-decisions.md; docs/brain/06-ai-working-log.md;
src/app/api/public/certificate-lookup/route.ts;
src/app/ke-khai/wizard.tsx; src/components/certificate-lookup.tsx;
src/modules/public-intake/repository.ts; tests/certificate-lookup.test.ts.
Added: src/app/api/public/submissions/current/certificate-duplicate-check/route.ts;
src/modules/public-intake/certificate-lookup.ts;
src/modules/public-intake/certificate-normalization.ts;
tests/certificate-lookup-core.test.ts.
Also modified/unowned: `CLAUDE_IMPLEMENTATION_PLAN_PUBLIC_INTAKE_V2.md`, Turnstile call-sites/module/tests and wizard-step/E2E validation files listed above.
```

### Diff statistics

```text
20 tracked files changed, 1200 insertions, 1543 deletions; 4 new files.
```

## 3. Executive summary

- The home lookup now lets residents choose QR CCCD or GCN issue number plus issue date.
- GCN matching removes whitespace/hyphens and uppercases before checking active submissions, official certificates, and latest verified legacy certificates.
- The public DTO contains only `found`, `status`, and fixed `guidance`; it does not expose certificate numbers, identifiers, PII, or files.
- A DB-backed HMAC rate limit allows 8 successful number lookups per 10 minutes. Audit writes HMAC keys/fingerprints only.
- The declaration wizard automatically warns when both GCN fields form a valid match; it excludes the current draft and does not treat `REJECTED`/`EXPIRED` records as active.
- No migration or new environment variable is required.

## 4. Changed files and symbols

| File | Symbols/routes | Purpose |
| --- | --- | --- |
| `src/modules/public-intake/certificate-normalization.ts` | `normalizeCertificateIssueNumber`, validation | Shared normalization/format validation. |
| `src/modules/public-intake/certificate-lookup.ts` | DTO, rate policy, HMAC audit metadata | Fixed public results and raw-data-free audit metadata. |
| `src/modules/public-intake/repository.ts` | `lookupCertificateByIssue` | Transactional lookup, advisory lock, rate count, source queries and audit. |
| `src/app/api/public/certificate-lookup/route.ts` | `POST` | Discriminates QR vs GCN lookup; Turnstile and minimal response. |
| `src/app/api/public/submissions/current/certificate-duplicate-check/route.ts` | `POST` | Session+CSRF wizard duplicate check. |
| `src/components/certificate-lookup.tsx` | `CertificateLookup` | Two-method public UI and Turnstile. |
| `src/app/ke-khai/wizard.tsx` | duplicate-check effect | 500 ms automatic, non-blocking warning. |
| `tests/certificate-lookup*.test.ts` | route/core cases | Match, no match, invalid input, normalization, rate limit and audit safety. |
| `AGENTS.md`, `docs/architecture.md`, `docs/brain/{01,03,06}*.md` | API/decision/log docs | Architecture/API and working-log updates. |

## 5. Behavior, API and security

| Scenario | Result |
| --- | --- |
| `POST /api/public/certificate-lookup` with `method: CERTIFICATE_NUMBER` | Requires Turnstile, valid issue number/date; returns only `{found,status,guidance,requestId}`. |
| Existing active `public_submission` match | `IN_PROCESSING` and non-duplicate guidance. |
| Official/verified legacy match | `OFFICIALLY_RECEIVED` and non-duplicate guidance. |
| `REJECTED` or `EXPIRED` submission | Not an active match, so it does not block/recommend against a new declaration. |
| Repeated GCN probing | 9th successful-window attempt returns `429 RATE_LIMITED`; lock prevents concurrent bypass for one HMAC source. |
| Wizard input | Calls the new session+CSRF endpoint after 500 ms only when both fields are valid; result warns only. |

- Authentication/authorization: public route remains edge-guard + Turnstile; wizard route uses signed public session, CSRF and UUID idempotency header.
- Data scope: the wizard route excludes the caller's own `submissionId`; no record ID is returned.
- Audit: no raw GCN, issue date, IP, CCCD or name. It stores HMAC source/fingerprint, fixed source/status and boolean match only.
- Database: no migration. Existing `issue_number`/`issue_date` fields are queried with SQL normalization.

## 6. Tests and verification

| Check | Command | Result |
| --- | --- | --- |
| Baseline focused tests | `npm.cmd test -- --run tests/certificate-lookup.test.ts tests/turnstile.test.ts` | 22 passed. |
| Focused feature tests | `npm.cmd test -- --run tests/certificate-lookup.test.ts tests/certificate-lookup-core.test.ts tests/turnstile.test.ts` | 31 passed. |
| All unit/integration Vitest | `npm.cmd test` | 619 passed, 10 skipped. |
| Typecheck | `npm.cmd run typecheck` | pass. |
| Changed-file lint | `npx.cmd eslint …` on all task files | pass. |
| Production build | `npm.cmd run build` | pass; both new/changed API routes listed. |
| Diff whitespace | `git diff --check` | pass. |

`npm.cmd run lint` was attempted twice but the desktop shell imposed a 60-second timeout before output. Run it once again before commit/deploy; targeted lint passed.

## 7. Acceptance criteria matrix

| ID | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| AC-01 | Choose QR or GCN lookup | PASS | `CertificateLookup` UI, production build. |
| AC-02 | GCN requires number/date and Turnstile | PASS | route validation + component; route tests. |
| AC-03 | Normalize spaces/hyphens/case | PASS | core + route tests. |
| AC-04 | Check active and official data | PASS | repository query structure; build/typecheck. |
| AC-05 | Minimal public response/no PII | PASS | DTO and route tests assert no certificate number. |
| AC-06 | Wizard warns active duplicate, ignores rejected/expired | PASS | query status allowlist and wizard effect. |
| AC-07 | QR retained | PASS | QR branch retained; route tests. |
| AC-08 | Lookup rate limit and audit without raw GCN | PASS | advisory lock/count/audit helper tests. |
| AC-09 | Full test/build/typecheck | PASS | commands above. |

## 8. Risks, manual checks and rollback

- Full-repo lint is still required because of the shell timeout noted above.
- Run a preview manual test with an actual Turnstile site key and seeded records: both GCN modes, 9 rapid GCN lookups, a rejected submission, and the wizard warning.
- No migration rollback is needed. Code rollback removes the two new routes/modules and restores the previous component/route; audit rows are append-only and intentionally retained.
- No commit, push, deployment, database migration, or data cleanup was performed.

## 9. Key diff excerpts

```diff
+ const normalizedIssueNumber = normalizeCertificateIssueNumber(issueNumber);
+ const result = await repository.lookupCertificateByIssue({
+   normalizedIssueNumber, issueDate, rateLimitKey, lookupFingerprint, source: "PUBLIC", requestId,
+ });
+ return NextResponse.json({ ...result, requestId });

+ and submission.status in ('DRAFT','SUBMITTED','UNDER_REVIEW','NEEDS_SUPPLEMENT','RESUBMITTED','ACCEPTING')
+ // official `certificates` and latest VERIFIED `existing_certificates` return OFFICIALLY_RECEIVED

+ await transaction`select pg_advisory_xact_lock(hashtextextended(${`CERTIFICATE_LOOKUP:${input.rateLimitKey}`}, 0))`;
+ // audit metadata: HMAC rateLimitKey + lookupFingerprint; no raw number/date
```

## 10. Full unified diff

```text
FULL_DIFF_OMITTED_DUE_TO_SIZE
Reason: the current worktree contains substantial pre-existing/parallel changes outside this feature;
embedding the combined diff would make ownership ambiguous. Review the task files listed in section 4
plus their exact `git diff -- <path>` output before committing.
```

## 11. Recommended next action

`READY_FOR_CHATGPT_REVIEW` — review the listed feature files, rerun full lint, then separate the
pre-existing Turnstile/wizard-step changes from this feature before creating an intentional commit.

## 12. Agent declaration

I read the required repository instructions and brain architecture materials, preserved existing
changes, did not add secrets or real PII, did not deploy/merge/push, and recorded unverified work
explicitly above.

## Addendum — 2026-07-29 local validation hotfix

- Fixed `isValidCertificateLookupInput`: it now accepts Unicode letters after normalization, so
  `AĐ 266864` normalizes to `AĐ266864` instead of failing before lookup. Punctuation remains
  rejected.
- Added the regression test with issue date `2006-02-20`.
- Verification: focused lookup tests 14/14 pass, `npm.cmd run typecheck` pass, local homepage HTTP
  200. No migration, commit or deployment.

---

## 13. Continuation — wizard E2E order and consent invariant (2026-07-29)

### Scope and baseline

- Task: continue the existing dirty tree without redoing completed work; finish E2E migration to
  `Ảnh GCN → Người kê khai và CCCD → Thông tin thửa đất → Kiểm tra và gửi`; retain consent before
  CREATE and Drive upload.
- Baseline: inspected `git status`, full diff, changed files and available test history. The lookup,
  Turnstile and wizard implementation changes were inherited and preserved. No current test log was
  stored in the worktree; earlier handoff claims were rerun where relevant.
- Commit: none. Current branch/HEAD: `docs/agent-handoff-protocol` / `4cb07b0`.

### Files/symbols changed in this continuation

| File | Symbols/content | Change |
| --- | --- | --- |
| `tests/e2e/public-intake-v2.spec.ts` | `createMinimalSubmission`, `fillMinimalStepOne`, `fillMinimalStepTwo`, E2E-01/02/03/04/06b/08/10 | All paths now follow the new steps; E2E-01 observes CREATE payload/order and ensures no upload precedes it. |
| `docs/brain/01-architecture.md` | Public Intake Code Graph | Replaces stale old order; documents the two phases of step 1. |
| `CLAUDE_IMPLEMENTATION_PLAN_PUBLIC_INTAKE_V2.md` | §2.2 | Moves GCN/upload to step 1 after phone/consent CREATE; identity/CCCD to step 2. |
| `docs/brain/06-ai-working-log.md` | top 2026-07-29 entry | Records the completed E2E/doc synchronisation and result. |
| `CHATGPT_HANDOFF.md` | this continuation | Required formal handoff update. |

### Security and behaviour evidence

- Before CREATE, the new E2E assertion sees a visible, unchecked consent checkbox and no GCN file
  input. After it checks consent and performs CREATE, it sees the request body
  `consent.accepted === true`, sees no upload request before CREATE, then sees the GCN input.
- This adds no API/schema/auth change. The existing server contract still validates consent before
  Turnstile, Drive and database; no PII, token, Drive link/ID or raw request data is logged by test.

### Verification after continuation

| Check | Command | Result |
| --- | --- | --- |
| Focused unit | `npm.cmd test -- --run tests/public-wizard-validation.test.ts tests/certificate-lookup.test.ts tests/certificate-lookup-core.test.ts tests/turnstile.test.ts` | 86 passed. |
| All Vitest | `npm.cmd test` | 619 passed, 10 skipped. |
| E2E discovery | `npx.cmd playwright test --list tests/e2e/public-intake-v2.spec.ts` | 15 scenarios listed; exit 0. |
| Localhost E2E | `$env:E2E_BASE_URL='http://localhost:3000'; npm.cmd run test:e2e` | 1 passed (`/ke-khai-ho` unauthenticated), 14 skipped (missing real intake credentials), 1 unrelated home smoke failed. |
| Changed-file lint | `npx.cmd eslint src/app/ke-khai/wizard.tsx src/modules/public-intake/public-wizard-validation.ts tests/e2e/public-intake-v2.spec.ts tests/public-wizard-validation.test.ts` | pass. |
| Typecheck | `npm.cmd run typecheck` | pass. |
| Production build | `npm.cmd run build` | pass. |
| Diff whitespace | `git diff --check` | pass. |

### Acceptance / remaining work

| Criterion | Status | Evidence / note |
| --- | --- | --- |
| E2E no longer assumes old step order | PASS | Helpers/scenarios and Playwright list. |
| Consent is before CREATE/upload | PASS | New explicit E2E-01 assertion; contract unchanged. |
| Active stale documentation removed | PASS | Code Graph and V2 plan updated; historical decision entries retained. |
| Related tests/typecheck/build | PASS | Commands/results above. |
| Preview E2E with real Supabase/Drive/Turnstile | NOT_TESTED | Requires non-production credentials and E2E officer/reviewer accounts. |
| Localhost smoke home | FAIL (pre-existing/out of scope) | Test expects the former full heading/online-only wording; UI now renders `CSDL Đất đai`. |

- Full-repository lint was intentionally not run: user limited lint to files affected by this work and
  the known repository-wide lint debt is unrelated.
- Localhost server was already active on port 3000. The suite initially could not start a second
  Next dev server on 3001 because of Next's workspace lock, so it ran against that existing server.
- Recommended status: `READY_FOR_COMMIT`; first run `npm.cmd run test:e2e:preview` on preview before
  any deployment review. Do not mix unrelated inherited lookup/Turnstile hunks into a commit without
  an intentional scope decision.

### Key diff excerpt

```diff
+ await expect(consent).not.toBeChecked();
+ await expect(certificatePhotoInput(page)).toHaveCount(0);
+ await createMinimalSubmission(page);
+ expect(createBodies[0]?.consent?.accepted).toBe(true);
+ expect(serverEvents).toEqual(["create"]);

- STEPS = [identity-first order] | ...
+ STEPS = Ảnh GCN | Người kê khai và CCCD | ...
+ Bước 1 có hai pha: phone + consent trước CREATE; chỉ sau CREATE mới upload GCN.
```

`FULL_DIFF_OMITTED_DUE_TO_SIZE`: the combined working tree contains substantial inherited lookup and
Turnstile work. Review the five continuation files above with their exact `git diff -- <path>` output
before an intentional commit.

---

## 15. Commit created for preview (2026-07-29)

- Commit: current `HEAD` (`feat(public-intake): add GCN lookup and streamline wizard`).
- Scope: all 25 staged files, including public GCN lookup, Turnstile hardening, reordered public
  intake wizard, E2E/documentation updates and this handoff.
- Verification before commit: local Playwright 2 pass/14 skip, focused Vitest 86/86, full Vitest
  619 pass/10 skip, changed-file ESLint, typecheck, production build and `git diff --check` pass.
- Git state after amend: clean. No push, merge, deploy, migration or data cleanup was performed.
- Next action: push this branch to create a Vercel preview, then run the credentialed preview E2E
  suite before considering a merge to `main`.

---

## 14. Continuation — localhost smoke repair (2026-07-29)

- **File:** `tests/e2e/home.spec.ts`.
- **Change:** Replace obsolete homepage assertions with the current `CSDL Đất đai` heading, campaign
  description and public declaration link. This tests visible, user-facing content without coupling
  to obsolete wording.
- **Cause:** Localhost rendered the current page successfully; the test alone expected a former
  long heading and online-only message that no longer exist.
- **Verification:** `$env:E2E_BASE_URL='http://localhost:3000'; npm.cmd run test:e2e` → 2 passed,
  14 skipped; focused Vitest 86/86, typecheck và `git diff --check` đều pass.

---

## 15. Addendum — Hiển thị rõ điều kiện chặn tiếp nhận (2026-07-29)

- **Task/status:** `READY_FOR_REVIEW` — thay thông báo chung khi tiếp nhận chính thức bị chặn bằng
  danh sách từng mục cần hoàn thiện. Không migration, deploy, push hoặc thao tác dữ liệu thật.
- **Files/symbols:** `blockingCompletionIssueDetails()` trong
  `src/modules/submissions/completion-checks.ts`; route
  `POST /api/submissions/:submissionId/accept`; component `SubmissionDetail`; test unit completion
  và assertion E2E hàng rào tiếp nhận; tài liệu `AGENTS.md`, kiến trúc, decision log và working log.
- **Behavior/API:** Khi còn `BLOCKING`, route vẫn trả HTTP 400 và không mở saga, nhưng bổ sung
  `error.details.issues[]` chỉ gồm `code`, `label`, `message`. UI kiểm kiểu mảng này, hiện tiêu đề
  và từng hướng dẫn ngay dưới thông báo; không gắn nhầm hướng dẫn retry mạng cho lỗi dữ liệu.
- **Security:** Route nội bộ vẫn kiểm authorization + CSRF trước khi trả chi tiết. DTO allowlist
  không chứa PII, CCCD, token, Drive ID/link, metadata tệp; validation, schema và saga không đổi.
- **Verification:** focused Vitest 8/8, `npm run typecheck`, ESLint tệp tác động,
  `npx playwright test --list` (16 test), `npm test` (621 pass/10 skip), `npm run lint`,
  `npm run build` và `git diff --check` đều pass. E2E thật chưa chạy vì cần credential/phiên preview.
- **Acceptance:** lỗi BLOCKING vẫn chặn saga; cán bộ thấy từng nhãn/hướng dẫn; không lộ dữ liệu
  nhạy cảm; không regression typecheck/unit/build. Cần deploy và thử một hồ sơ thiếu dữ liệu để
  xác nhận bố cục trực quan.
