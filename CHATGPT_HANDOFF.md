# CHATGPT HANDOFF REPORT

## Cập nhật 2026-07-29 — review bắt buộc PR #6

- Branch: `claude/land-declaration-process-feedback-126f2e`
- Base PR: `main` tại `79f4ae67448625c9e92fb20c356c889008a27940`
- Baseline HEAD: `48f232d73b180acc7f4159ca0d7c95f0e6fc7c3d`
- Commits mới: `5d8c73c`, `60be5ab`, `69c86ee`, `06f2e52`, `84178ad`, `0d470ed`;
  commit chốt handoff/final HEAD báo sau push.
- Đã đóng 2 BLOCKER + 5 HIGH; migration mới
  `202607290001_public_upload_attempts_rls.sql` chưa chạy.
- Final verification: lint 0 error/5 warning có sẵn; typecheck pass; 570 pass/10 skipped; build
  pass; `git diff --check` và full PR diff check pass.
- Regression tập trung sau sửa: 53/53 pass, gồm route simulation DB commit/response mất/retry.
- E2E assisted đầy đủ đã thêm; chỉ chạy thật khi có rehearsal credential, không ghi pass nếu skip.
- Lần chạy thực tế: Playwright E2E-06b báo `1 skipped` do thiếu rehearsal credential/kill switch.
- CI lần đầu dừng ở `npm ci` do lockfile thiếu ba gói `@emnapi/*`; đã chạy
  `npm install --package-lock-only`, xác minh lại `npm ci` local và commit lockfile, không bỏ gate.
- Runner Node 22/npm 10 vẫn yêu cầu một optional package Linux mà npm 11 lock không materialize
  trên Windows; workflow dùng Node 24/npm 11, đúng runtime local đã chạy `npm ci` thành công.
- Không merge, deploy, chạy migration hoặc thay đổi `main`.
- Giữ nguyên, không stage `evidence/BUG_OWNER_ID_RACE_HANDOFF.md`.

## 1. Metadata

- Project: Hệ thống thu thập và kiểm tra nhanh hồ sơ đất đai Phường Phong Châu
- Branch: `claude/land-declaration-process-feedback-126f2e`
- Base trước Codex: `de65501a0474e21b11d83d76e63070a73253110a`
- Task: Review và sửa consent create contract, owner-ID adoption, server version; test rehearsal;
  chia commit chọn lọc; xác minh lại từ clean worktree tại `a378fa6`.
- Status: COMPLETED
- Không thực hiện: push, merge, deploy, migration, cleanup dữ liệu.

## 2. Baseline và phát hiện

- Public create route chỉ parse `phone`; không nhận/kiểm consent.
- Assisted create route cũng chỉ parse `phone`.
- Shared service tự đặt `draft.consentAccepted = true`, nên server tạo bằng chứng consent dù
  request không khai báo.
- Assisted repository đã lưu `consent_version`, `assisted_by_*`, `assisted_at` và audit create,
  nhưng audit chưa ghi metadata chứng minh route đã validate consent.
- `adoptServerDraft()` thay toàn bộ local draft bằng server draft, có thể làm mất phone, consent và
  trường vừa nhập; đồng thời bỏ qua `version` dù GET `/current` đã trả version.
- E2E trước sửa từng tái hiện owner ID race và consent bị ghi đè; rehearsal sau vòng trước đã pass
  khi service tự đặt consent, nhưng cách sửa đó không đạt yêu cầu trust boundary phía server.

## 3. Implementation

### Consent contract

- Body dùng chung cho public và assisted create:

~~~json
{
  "phone": "0xxxxxxxxx",
  "consent": {
    "accepted": true
  }
}
~~~

- `validateCreateSubmissionRequest()` kiểm phone và `consent.accepted === true`.
- Public route từ chối trước Turnstile, Drive và database nếu thiếu consent.
- Assisted route từ chối trước create/audit nếu thiếu consent.
- `CONSENT_NOTICE_VERSION` vẫn do server chọn; client không được tự gán version, channel hoặc
  assistedBy.
- Shared service chỉ nhận `consentAccepted: true` sau route validation.
- Assisted audit ghi `consentAccepted`, `consentVersion`, `intakeChannel`; repository tiếp tục lưu
  officer identity và assisted timestamp.

### Draft adoption và version

- `adoptServerDraftSnapshot()`:
  - thay owner/parcel/land-use ID local bằng ID server theo vị trí;
  - giữ phone, consent, certificate, owner fields, parcel fields, assets và file metadata local;
  - recovery không trộn local draft rỗng, dùng nguyên server draft;
  - từ chối snapshot thiếu server version hợp lệ.
- Wizard lưu version nhận từ GET/PATCH, gửi version trong PATCH tiếp theo và cập nhật từ response.
- Receipt chỉ render sau khi adoption hoàn tất, đóng race upload với owner ID tạm.
- QR bitmap decode lỗi vẫn fail-soft thành `null`, không chặn nhập tay.

## 4. Commits

1. `1fa3c25` — `fix(public-intake): preserve consent and synchronize owner identity`
2. `5fc836a` — `test(public-intake): cover consent adoption and rehearsal flows`
3. `a378fa6` — `docs(public-intake): record owner-id and consent rehearsal findings`
4. `d83a23f` — `test(e2e): make public intake rehearsal reproducible`
5. `7618c15` — `test(public-intake): cover adoption edge cases`
6. `docs(public-intake): record clean rehearsal verification`
   - Commit chứa phần cập nhật cuối của báo cáo này; hash được báo trong final chat.

## 5. Files theo commit

### Fix commit

- `src/app/api/public/submissions/route.ts`
- `src/app/api/staff/assisted-submissions/route.ts`
- `src/app/ke-khai/wizard.tsx`
- `src/modules/public-intake/citizen-id-qr.client.ts`
- `src/modules/public-intake/create-request.ts`
- `src/modules/public-intake/create-submission.ts`
- `src/modules/public-intake/draft-adoption.ts`

### Test commit

- `tests/assisted-submissions-route.test.ts`
- `tests/draft-adoption.test.ts`
- `tests/e2e/public-intake-v2.spec.ts`
- `tests/public-submission-create.test.ts`
- `tests/public-current-route.test.ts`

`tests/e2e/public-intake-v2.spec.ts` có thay đổi từ trước và được stage bằng `git add -p`, không
dùng `git add .`.

### Rehearsal config commit

- `playwright.config.ts`
  - local base URL và web-server URL dùng `localhost`, đồng nhất origin resumable Drive;
  - timeout 90 giây vì rehearsal tối thiểu đo được 36,3 giây, vượt mặc định 30 giây;
  - toàn bộ hunk được stage bằng `git add -p` sau phép thử đối chứng.

### Docs commit

- `AGENTS.md`
- `docs/brain/01-architecture.md`
- `docs/brain/03-decisions.md`
- `docs/brain/04-current-tasks.md`
- `docs/brain/06-ai-working-log.md`
- `CHATGPT_HANDOFF.md`

## 6. Verification

| Check | Result |
|---|---|
| Focused regression | PASS — 4 files, 19/19 tests |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS — 0 error, 5 warning có sẵn |
| `npm.cmd run test` | PASS — 62 files passed, 2 skipped; 558 passed, 10 skipped |
| `npm.cmd run build` | PASS — Next.js compiled, typechecked và generated 21/21 pages |
| `git diff --check` | PASS |
| Clean worktree `a378fa6` | PASS — typecheck/lint/unit/build; 557 passed, 10 skipped |
| Clean rehearsal | BLOCKED — không sao chép `.env.local`; fail ở environment validation |
| Rehearsal với `127.0.0.1` | FAIL — timeout 90 giây tại upload, không có `/uploads/complete` |
| Rehearsal với `localhost` | PASS — 1/1 trong 36,3 giây |

Rehearsal dùng fixture không PII và cấu hình rehearsal hiện có. Không cleanup dữ liệu sau test theo
yêu cầu.

## 7. Acceptance matrix

| Criterion | Status |
|---|---|
| Public request có tín hiệu consent | PASS |
| Server kiểm consent trước create | PASS |
| Assisted consent có request validation + server version + officer/audit metadata | PASS |
| Adoption đồng bộ owner ID server | PASS |
| Adoption giữ phone và consent | PASS |
| Adoption không mất trường local | PASS |
| Adoption/PATCH cập nhật đúng server version | PASS |
| Adoption nhiều owner/parcel/land-use | PASS |
| Stale public PATCH trả 409 và không gọi `saveDraft` | PASS |
| Recovery dùng nguyên object snapshot server | PASS |
| Request thiếu consent có regression test | PASS |
| Typecheck/lint/unit/build/diff check | PASS |
| Không push/deploy/migration/cleanup | PASS |

## 8. Remaining working-tree changes

- `evidence/BUG_OWNER_ID_RACE_HANDOFF.md`: file untracked có trước của người dùng; không stage.
- `next-env.d.ts`: file sinh bởi `next dev/build` đã được trả về baseline; không stage.

## 9. Important diff

~~~diff
- body: JSON.stringify({ phone: draft.phone })
+ body: JSON.stringify({
+   phone: draft.phone,
+   consent: { accepted: draft.consentAccepted },
+ })
~~~

~~~diff
- draft.consentAccepted = true;
+ draft.consentAccepted = input.consentAccepted;
~~~

~~~diff
+ const adopted = adoptServerDraftSnapshot({
+   serverDraft,
+   serverVersion: body.version,
+   localDraft: options?.localDraft,
+ });
+ setServerVersion(adopted.version);
~~~

## 10. Declaration

- Đã đọc và tuân thủ AGENTS, workflow handoff, PLAN và docs/brain.
- Không dùng `git add .`.
- E2E file có thay đổi từ trước được stage bằng `git add -p`.
- `playwright.config.ts` chỉ được stage bằng `git add -p` sau khi đối chứng chứng minh cả origin và
  timeout đều cần thiết.
- Không stage `next-env.d.ts` hoặc evidence có sẵn.
- Không push, merge, deploy, migration hoặc cleanup dữ liệu.
- Không đưa secret, token, Drive ID, QR raw hoặc PII vào source/report.
