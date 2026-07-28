# CHATGPT HANDOFF REPORT

## 1. Metadata

- Project: Hệ thống thu thập và kiểm tra nhanh hồ sơ đất đai Phường Phong Châu
- Branch: `claude/land-declaration-process-feedback-126f2e`
- Base trước Codex: `de65501a0474e21b11d83d76e63070a73253110a`
- Task: Review và sửa consent create contract, owner-ID adoption, server version; test rehearsal;
  chia ba commit chọn lọc.
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
3. `docs(public-intake): record owner-id and consent rehearsal findings`
   - Commit chứa chính báo cáo này; hash được báo trong final chat sau khi commit.

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

`tests/e2e/public-intake-v2.spec.ts` có thay đổi từ trước và được stage bằng `git add -p`, không
dùng `git add .`.

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
| Focused regression | PASS — 3 files, 18/18 tests |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS — 0 error, 5 warning có sẵn |
| `npm.cmd run test` | PASS — 61 files passed, 2 skipped; 557 passed, 10 skipped |
| `npm.cmd run build` | PASS — Next.js compiled, typechecked và generated 21/21 pages |
| `git diff --check` | PASS; chỉ cảnh báo CRLF→LF |
| Rehearsal minimal submit | PASS — đến `KÊ KHAI THÀNH CÔNG` |

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
| Request thiếu consent có regression test | PASS |
| Typecheck/lint/unit/build/diff check | PASS |
| Không push/deploy/migration/cleanup | PASS |

## 8. Remaining working-tree changes

- `playwright.config.ts`: thay đổi có trước của người dùng; không stage vì chưa chứng minh hunk thuộc
  nhiệm vụ.
- `evidence/BUG_OWNER_ID_RACE_HANDOFF.md`: file untracked có trước của người dùng; không stage.
- `next-env.d.ts`: không stage; sau build hiện không còn diff.

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
- Không stage `playwright.config.ts`, `next-env.d.ts` hoặc evidence có sẵn.
- Không push, merge, deploy, migration hoặc cleanup dữ liệu.
- Không đưa secret, token, Drive ID, QR raw hoặc PII vào source/report.
