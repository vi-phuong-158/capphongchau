# CHATGPT HANDOFF REPORT

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
