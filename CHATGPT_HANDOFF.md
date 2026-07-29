# CHATGPT HANDOFF REPORT

## 1. Report metadata

- Project: `land-ocr-180` (capphongchau) — thu thập và kiểm tra hồ sơ đất đai Phường Phong Châu
- Repository path: `/home/user/capphongchau`
- Generated at: 2026-07-29
- Agent: Claude Code (`claude-opus-5`)
- Task: **Đợt 2A-3** của kế hoạch redesign màn duyệt hồ sơ — (a) chặn người dân gửi lại khi cán bộ
  đang giữ hồ sơ ("cán bộ ưu tiên", phương án người dùng đã chọn qua AskUserQuestion), (b) cho
  tiếp nhận hồ sơ cũ ở trạng thái `NEEDS_SUPPLEMENT`. Người dùng yêu cầu: "tiếp tục 2A-3".
- Status: `READY_FOR_COMMIT` (đã commit local `109b00c`; **chưa push, chưa merge, chưa deploy**)
- Source plan: hội thoại với người dùng. Rủi ro gốc đã được ghi thành văn từ vòng rà soát 2A-1
  (mục "Đánh đổi/rủi ro còn lại" trong `docs/brain/03-decisions.md` entry Đợt 2A-1: *"Chưa chặn
  được race 'cán bộ đang xử lý mà dân bấm gửi lại xóa mất claim' (2A-3, chưa làm)"*). Quyết định
  của đợt này ghi tại `docs/brain/03-decisions.md` mục `[2026-07-29] Đợt 2A-3`.
- Source acceptance criteria: không có file riêng — đối chiếu ở mục 13.
- Source security constraints: `CLAUDE.md` — không hardcode secret, không log/lộ PII (CCCD, QR thô,
  token, **email công vụ của cán bộ ra cổng công khai**), không tự merge/deploy, phải cập nhật
  `docs/brain/` khi đổi kiến trúc/API.

## 2. Git identity

- Current branch: `claude/redesign-document-review-screen-tfuvov`
- Remote: `origin` → `vi-phuong-158/capphongchau` (remote đang ở `c17254c`, nhánh chưa từng push)
- Base commit before work: `ba38d99` (docs: cập nhật CHATGPT_HANDOFF.md cho Đợt 2A-2)
- Head commit after work: `109b00c` (feat(submissions): Đợt 2A-3 …)
- Commit created: có, 1 commit (`109b00c`)
- Working tree state: sạch sau commit (đã revert `next-env.d.ts` do `npm run build` tự sinh)
- User changes detected before work: không — working tree sạch, nhánh đứng đúng tại `ba38d99`
- User changes preserved: có (không có thay đổi nào của người dùng cần bảo toàn)

> **Ghi chú về hash:** trong phiên này hook kiểm tra Git đã yêu cầu ký lại toàn bộ commit của nhánh
> (`git rebase --exec "git commit --amend --no-edit --reset-author"`). Ba commit trước đó đổi hash
> **nhưng không đổi một byte nội dung nào** (`git diff 8150d65 ba38d99` rỗng):
> `9a00657`→`8d5b512`→`4816542` (2A-1), `2379310`→`5c1df6d` (2A-2), `8150d65`→`ba38d99` (handoff
> 2A-2). Báo cáo 2A-2 cũ có nhắc các hash cũ — đó là cùng nội dung, không phải commit khác.

### Git status

```text
# Trước khi bắt đầu
$ git status --short
(rỗng)
$ git log --oneline -3
ba38d99 docs: cập nhật CHATGPT_HANDOFF.md cho Đợt 2A-2
5c1df6d feat(submissions): Đợt 2A-2 - thêm ô ghi chú nội bộ cho cán bộ
4816542 feat(submissions): Đợt 2A-1 - dọn giao diện duyệt hồ sơ, bỏ yêu cầu bổ sung, gộp một đường ghi

# Sau khi commit
$ git status --short
(rỗng)
$ git log --oneline -4
109b00c feat(submissions): Đợt 2A-3 - cán bộ ưu tiên khi tranh chấp hồ sơ
ba38d99 docs: cập nhật CHATGPT_HANDOFF.md cho Đợt 2A-2
5c1df6d feat(submissions): Đợt 2A-2 - thêm ô ghi chú nội bộ cho cán bộ
4816542 feat(submissions): Đợt 2A-1 - dọn giao diện duyệt hồ sơ, bỏ yêu cầu bổ sung, gộp một đường ghi
```

### Diff statistics

```text
$ git diff --stat ba38d99 109b00c
 docs/brain/01-architecture.md                      |  31 +++-
 docs/brain/03-decisions.md                         |  33 +++++
 docs/brain/04-current-tasks.md                     |   8 +-
 docs/brain/06-ai-working-log.md                    |  60 ++++++++
 src/app/api/public/submissions/current/route.ts    |   4 +
 .../api/public/submissions/current/submit/route.ts |  11 ++
 src/app/tra-cuu/public-lookup.tsx                  |  11 +-
 src/components/submissions-queue.tsx               |  15 ++-
 src/modules/public-intake/route-context.ts         |  27 +++-
 src/modules/submissions/review.ts                  |  16 ++-
 tests/public-resubmit-blocked-when-claimed.test.ts |  96 +++++++++++++
 tests/public-submit-officer-priority-route.test.ts | 136 +++++++++++++++++++
 tests/submission-claim.test.ts                     |   6 +-
 tests/submission-review.test.ts                    |   3 +-
```

### Name status

```text
$ git diff --name-status ba38d99 109b00c
M	docs/brain/01-architecture.md
M	docs/brain/03-decisions.md
M	docs/brain/04-current-tasks.md
M	docs/brain/06-ai-working-log.md
M	src/app/api/public/submissions/current/route.ts
M	src/app/api/public/submissions/current/submit/route.ts
M	src/app/tra-cuu/public-lookup.tsx
M	src/components/submissions-queue.tsx
M	src/modules/public-intake/route-context.ts
M	src/modules/submissions/review.ts
A	tests/public-resubmit-blocked-when-claimed.test.ts
A	tests/public-submit-officer-priority-route.test.ts
M	tests/submission-claim.test.ts
M	tests/submission-review.test.ts
```

## 3. Executive summary

- **Vấn đề cần giải quyết — một lỗi mất quyền xử lý thật, không phải chuyện thẩm mỹ:**
  `PublicIntakeRepository.submit()` đặt `claimed_by = null, claimed_by_display_name = null,
  claimed_at = null` **mỗi lần người dân gửi lại**. Trong khi đó luồng "yêu cầu bổ sung" cũ (đã bỏ
  ở 2A-1) chuyển hồ sơ sang `NEEDS_SUPPLEMENT` mà **giữ nguyên** `claimed_by`. Kết quả: một lần
  bấm "Bổ sung hồ sơ" của người dân **âm thầm cướp hồ sơ khỏi tay cán bộ đang xử lý**. Khóa phiên
  bản (`version`) không cứu được — nó chỉ bắt va chạm *đồng thời*, còn đây là hai thao tác đều hợp
  lệ mà một bên xoá quyền của bên kia, `version` vẫn khớp nên không có xung đột nào để báo.
- **Phương án đã thực hiện:** cài chốt "cán bộ ưu tiên" vào `isEditable()` trong
  `route-context.ts` — hàm này là **cửa duy nhất** mà cả bảy route `/api/public/submissions/
  current/*` và route nhập hộ của cán bộ đều đi qua, nên không route nào có thể quên. Thêm
  `isHeldByOfficer()` để route `submit` trả đúng lý do và chặn **trước** bước Turnstile.
  `mayClaim` mở thêm `NEEDS_SUPPLEMENT` (bắt buộc đi kèm, xem mục 6). Giao diện `/tra-cuu` và hàng
  chờ cán bộ được sửa để khớp máy chủ.
- **Kết quả:** typecheck 0 lỗi, lint 0 lỗi (5 warning có sẵn, không đổi), **679 test pass / 10
  skip** (baseline 672/10, +7 test mới, không test cũ nào fail hay mới skip), build production
  thành công.
- **Nội dung chưa hoàn thành:** chưa xác minh bằng tay trên Preview (mục 14); 2B và 2C chưa làm.
- **Trạng thái đề xuất:** `READY_FOR_COMMIT`.

## 4. Baseline before changes

Đo tại `ba38d99` (đầu ra hoàn chỉnh của Đợt 2A-2). Các lệnh dưới đây được chạy thật trong phiên
trước khi sửa code của đợt này:

| Check             | Command                              | Result                        | Evidence |
| ------------------ | ------------------------------------- | ------------------------------ | -------- |
| Unit tests         | `npx vitest run`                      | **672 pass / 10 skip** (76 file pass + 2 skip) | output terminal phiên 2A-2 |
| Integration tests  | (trong `vitest run`, gated)           | 2 file skip (cần `ACCEPTANCE_SAGA_TEST_DATABASE_URL`) | như trên |
| E2E tests          | không chạy                            | N/A — không có Preview thật trong phiên | — |
| Build              | `npm run build`                       | Thành công (Next.js 16.2.10, Turbopack) | output terminal phiên 2A-2 |
| Lint               | `npm run lint`                        | 0 lỗi / **5 warning có sẵn** (2 ở `scripts/add-system-admins.ts`, 3 ở `tests/staging-rehearsal-scenarios.test.ts` — đều là biến/import không dùng, không liên quan task) | output terminal |
| Typecheck          | `npx tsc --noEmit -p tsconfig.json`   | 0 lỗi                          | output terminal |

5 warning lint nói trên **đã tồn tại từ trước**, không do đợt này sinh ra và không được sửa (ngoài
phạm vi). Mọi con số ở mục 12 so trực tiếp với bảng này.

## 5. Scope

### In scope

- Chặn mọi đường ghi công khai của người dân khi hồ sơ đã có cán bộ cầm (`isEditable`).
- Thông báo lỗi chính xác + chặn trước Turnstile ở route `submit`.
- `mayClaim` nhận thêm `NEEDS_SUPPLEMENT`.
- `GET /api/public/submissions/current` trả thêm cờ boolean `hasAssignedOfficer`.
- `/tra-cuu` ẩn nút "Bổ sung hồ sơ" + hiện câu giải thích khi cán bộ đang giữ.
- Hàng chờ cán bộ: ô đếm "Chờ tiếp nhận" gọi thẳng `mayClaim`; nhãn badge `NEEDS_SUPPLEMENT` thêm
  "(hồ sơ cũ)".
- Test mới cho cả hai tầng (hàm thuần + HTTP route).
- Sửa tiêu đề 2 test cũ đã trở nên sai sự thật sau thay đổi.
- Cập nhật `docs/brain/{01-architecture,03-decisions,04-current-tasks,06-ai-working-log}.md`.

### Out of scope

- 2B: server-priming, lazy-load ảnh, single-file query, lazy AI panel.
- 2C: cán bộ tự tải ảnh giấy tờ cá nhân/GCN bổ sung.
- Đổi từ vựng trạng thái của màn hàng chờ (bộ lọc vẫn dùng mã trạng thái kỹ thuật) — cân nhắc và
  cố ý **không** làm, xem "Deviations" ngay dưới.
- Xoá `NEEDS_SUPPLEMENT` khỏi `PUBLIC_STATUSES` hay dọn dữ liệu hồ sơ cũ.
- Push/merge/deploy. Không có migration nào trong đợt này.

### Deviations from approved plan

- **Không đổi nhãn `NEEDS_SUPPLEMENT` thành "Chờ tiếp nhận" ở màn hàng chờ.** Sau khi ô đếm "Chờ
  tiếp nhận" tính cả trạng thái này, đổi nhãn badge cho "nhất quán" nghe hợp lý, nhưng `labels`
  còn là nguồn cho **dropdown bộ lọc** — hai mục cùng tên "Chờ tiếp nhận" trong một dropdown sẽ
  làm cán bộ không lọc được nữa. Chọn cách nhỏ hơn: giữ nhãn kỹ thuật, thêm hậu tố "(hồ sơ cũ)" để
  cán bộ hiểu vì sao trạng thái này còn tồn tại mà vẫn bấm Tiếp nhận được.
- **Chốt đặt ở `isEditable` chứ không đặt riêng từng route.** Đánh đổi: một hàm ảnh hưởng cả bảy
  route (kể cả luồng nhập hộ của cán bộ, xem mục 15). Chọn vậy vì nếu đặt lẻ từng route thì route
  công khai thêm sau này sẽ mặc định **không** được bảo vệ — đúng loại lỗi đã xảy ra ở dự án này
  (đã thêm cảnh báo "chốt chặn duy nhất" vào Code Graph để agent sau biết).

## 6. Decisions implemented

| Decision | Implementation | Evidence |
| -------- | --------------- | -------- |
| Cán bộ ưu tiên: dân không ghi được khi hồ sơ có người cầm | `isEditable()` trả `false` khi `isHeldByOfficer(record)` | `src/modules/public-intake/route-context.ts` |
| Chốt phải nằm ở chỗ không route nào quên được | Đặt trong `isEditable` — cửa chung của 7 route công khai + nhập hộ | Code Graph mới trong `01-architecture.md` |
| Người dân phải nhận đúng lý do, và không bị đốt lượt Turnstile | `isHeldByOfficer` kiểm **trước** `isEditable` và **trước** `verifyTurnstileToken` | `submit/route.ts`; test khẳng định `verifyTurnstileToken` không được gọi |
| Không lộ email công vụ cán bộ ra cổng công khai | Thông báo lỗi không chứa email; `GET /current` chỉ trả **boolean** `hasAssignedOfficer` (dùng `publicHasAssignedOfficer` sẵn có) | `current/route.ts`; test khẳng định message không chứa email |
| Hồ sơ `NEEDS_SUPPLEMENT` cũ không được kẹt vĩnh viễn | `mayClaim` nhận thêm `NEEDS_SUPPLEMENT` | `src/modules/submissions/review.ts` |
| Mở claim không được tạo lối cướp hồ sơ mới | Không sửa route CLAIM — nó đã có sẵn 403 `Hồ sơ đang do cán bộ khác nhận xử lý` và điều kiện atomic trong SQL của `commitStaffAction` | `action/route.ts` dòng 200-202 (không đổi) |
| Giao diện không được đoán luật, phải khớp máy chủ | `/tra-cuu` dùng `hasAssignedOfficer` từ máy chủ; hàng chờ gọi thẳng `mayClaim` thay vì liệt kê lại trạng thái | `public-lookup.tsx`, `submissions-queue.tsx` |

## 7. Changed files

| File | Change type | Symbols/routes/components affected | Purpose | Risk |
| ---- | ------------ | ----------------------------------- | ------- | ---- |
| `src/modules/public-intake/route-context.ts` | Modified | `isHeldByOfficer` (mới, export), `isEditable` | Chốt chặn cán bộ ưu tiên cho toàn bộ bề mặt ghi công khai | **Trung bình-cao** — một hàm ảnh hưởng 7 route; đã có test và toàn bộ suite xanh |
| `src/modules/submissions/review.ts` | Modified | `mayClaim` | Cho tiếp nhận hồ sơ `NEEDS_SUPPLEMENT` cũ | Thấp — chỉ mở rộng tập trạng thái; các chốt quyền khác không đổi |
| `src/app/api/public/submissions/current/submit/route.ts` | Modified | `POST` handler | Thông báo đúng lý do + chặn trước Turnstile | Thấp |
| `src/app/api/public/submissions/current/route.ts` | Modified | `GET` handler — thêm field `hasAssignedOfficer` | Cấp dữ liệu cho UI, chỉ boolean | Thấp — thêm field, không đổi/xoá field cũ |
| `src/app/tra-cuu/public-lookup.tsx` | Modified | `LookupData`, biến `editable`, khối nút/thông báo | Ẩn nút người dân không dùng được, giải thích lý do | Thấp — UI thuần |
| `src/components/submissions-queue.tsx` | Modified | `statusStyles.NEEDS_SUPPLEMENT`, `countPending` | Ô đếm khớp `mayClaim`; nhãn nói rõ hồ sơ cũ | Thấp — UI thuần |
| `tests/public-resubmit-blocked-when-claimed.test.ts` | Added | 5 test tầng hàm thuần | Khoá hành vi `isEditable`/`isHeldByOfficer` | — |
| `tests/public-submit-officer-priority-route.test.ts` | Added | 2 test tầng HTTP | Khoá hành vi route thật (không mock chốt chặn) | — |
| `tests/submission-claim.test.ts` | Modified | test `C1` | Tiêu đề cũ ghi "ONLY for SUBMITTED and RESUBMITTED" — đã sai sự thật; thêm khẳng định `NEEDS_SUPPLEMENT` và `DRAFT` | — |
| `tests/submission-review.test.ts` | Modified | test claim | Như trên | — |
| `docs/brain/01-architecture.md` | Modified | Code Graph (`route-context.ts`, `submit`, `mayClaim`) + danh sách API | Đồng bộ tài liệu kiến trúc | — |
| `docs/brain/03-decisions.md` | Modified | entry mới `[2026-07-29] Đợt 2A-3` | Ghi quyết định + đánh đổi | — |
| `docs/brain/04-current-tasks.md` | Modified | mục Đợt 2A: 2A-3 chuyển sang ĐÃ LÀM | Theo dõi tiến độ | — |
| `docs/brain/06-ai-working-log.md` | Modified | entry log mới | Nhật ký bắt buộc theo `CLAUDE.md` | — |

Không file nào bị xoá. Không có migration.

## 8. Detailed implementation by phase

### Phase 1 — Chốt chặn máy chủ (cán bộ ưu tiên)

- Mục tiêu: người dân không thể ghi đè/cướp hồ sơ đang có cán bộ xử lý, ở **mọi** đường ghi.
- File: `src/modules/public-intake/route-context.ts`,
  `src/app/api/public/submissions/current/submit/route.ts`.
- Đã thực hiện: thêm `isHeldByOfficer(record)` (`claimedBy.trim().length > 0`); `isEditable()`
  trả `false` ngay khi có người cầm hồ sơ. Route `submit` kiểm `isHeldByOfficer` trước, trả
  `409 INVALID_STATE` với câu giải thích cho người dân, đặt **trước** `verifyTurnstileToken` để
  không đốt lượt xác minh.
- Không thực hiện: **không** sửa `repository.submit()` để thôi xoá `claimed_by`. Cân nhắc rồi bỏ:
  khi hồ sơ được gửi lại hợp lệ (không ai cầm) thì xoá claim cũ vẫn đúng nghiệp vụ; sửa ở tầng
  repository sẽ đổi hành vi của cả những đường gọi khác mà không cần thiết. Chặn ở cửa vào là thay
  đổi nhỏ hơn và đúng chỗ hơn.
- Test đã chạy: `npx vitest run tests/public-resubmit-blocked-when-claimed.test.ts
  tests/public-submit-officer-priority-route.test.ts` → 7/7 pass.
- Rủi ro: xem mục 15 (ảnh hưởng luồng nhập hộ của cán bộ).

### Phase 2 — Mở claim cho hồ sơ `NEEDS_SUPPLEMENT` cũ

- Mục tiêu: hồ sơ cũ không bị kẹt sau khi Phase 1 đóng đường thoát cuối cùng của chúng.
- File: `src/modules/submissions/review.ts`.
- Đã thực hiện: `mayClaim` nhận thêm `NEEDS_SUPPLEMENT`, kèm chú thích giải thích vì sao đây là
  phần **bắt buộc** của Phase 1 chứ không phải tính năng rời.
- Không thực hiện: không nới `mayStaffEdit`, không nới `mayReject`, không đụng route CLAIM.
- Kiểm chứng an toàn: route CLAIM (`action/route.ts`) đã có sẵn hai lớp — kiểm
  `record.claimedBy && !isClaimedBy(...)` → 403, và điều kiện atomic trong SQL của
  `commitStaffAction` (`claimed_by is null or claimed_by = '' or claimed_by = $actor` trừ khi
  `force`). Mở thêm một trạng thái **không** mở thêm lối vào nào.
- Test đã chạy: `tests/submission-claim.test.ts`, `tests/submission-review.test.ts` → pass.

### Phase 3 — Giao diện khớp máy chủ

- Mục tiêu: không hiện nút mà máy chủ chắc chắn từ chối; ô đếm không nói sai.
- File: `src/app/api/public/submissions/current/route.ts`, `src/app/tra-cuu/public-lookup.tsx`,
  `src/components/submissions-queue.tsx`.
- Đã thực hiện: `GET /current` trả `hasAssignedOfficer` (boolean, qua `publicHasAssignedOfficer`
  sẵn có — không viết luật mới); `/tra-cuu` ẩn nút và hiện câu giải thích; hàng chờ gọi `mayClaim`.
- Test đã chạy: không có test render cho hai component này (dự án chưa có React Testing Library
  cho chúng) — kiểm bằng typecheck + build + đọc code. **Chưa click-test trên trình duyệt thật**,
  xem mục 14.

## 9. Behavior before and after

| Scenario | Before | After | Verification |
| -------- | ------ | ----- | ------------ |
| Hồ sơ `NEEDS_SUPPLEMENT` còn `claimed_by` của cán bộ A; người dân bấm "Bổ sung hồ sơ" rồi gửi | Gửi thành công; `claimed_by`/`claimed_at` bị **xoá sạch**, cán bộ A mất hồ sơ mà không được báo | `409 INVALID_STATE` + câu "Hồ sơ đang được cán bộ phường xử lý…"; không ghi gì; không gọi Turnstile | `tests/public-submit-officer-priority-route.test.ts` ca 1 |
| Hồ sơ `NEEDS_SUPPLEMENT` **không** ai giữ; người dân gửi lại | Thành công | Thành công (không đổi) | `…officer-priority-route` ca 2; `…blocked-when-claimed` ca 2 |
| Bản nháp `DRAFT` của người dân | Sửa/gửi được | Sửa/gửi được (không đổi — `DRAFT` không bao giờ bị claim) | `…blocked-when-claimed` ca 3 |
| Cán bộ mở hồ sơ `NEEDS_SUPPLEMENT` cũ | Không bấm Tiếp nhận được (`mayClaim` từ chối) → kẹt: không claim, không sửa được | Tiếp nhận được → `UNDER_REVIEW` → sửa ở Bàn làm việc → Hoàn thành xử lý | `tests/submission-claim.test.ts` C1 |
| Cán bộ B tiếp nhận hồ sơ cán bộ A đang giữ | 403 | 403 (không đổi) | route CLAIM không sửa; `action/route.ts:200-202` |
| Người dân xem `/tra-cuu` khi cán bộ đang giữ hồ sơ | Thấy nút "Bổ sung hồ sơ", bấm vào thì lỗi | Không thấy nút; thấy câu "Cán bộ phường đang xử lý hồ sơ này…" | đọc code `public-lookup.tsx` (chưa click-test) |
| Ô đếm "Chờ tiếp nhận" ở hàng chờ | Bỏ sót hồ sơ `NEEDS_SUPPLEMENT` dù giờ đã tiếp nhận được | Đếm đúng theo `mayClaim` | đọc code `submissions-queue.tsx` (chưa click-test) |

## 10. API, data and security impact

### Authentication

- Không thay đổi. Cổng công khai vẫn dùng phiên cookie đã ký qua `resolvePublicRequest`; màn cán bộ
  vẫn dùng `requireActiveUser`.

### Authorization

- **Cổng công khai (siết lại):** người dân mất quyền ghi trên hồ sơ đang có cán bộ cầm. Áp dụng cho
  cả 7 route `/api/public/submissions/current/*` (submit, PATCH nháp, uploads initiate/complete,
  xoá file, no-action) vì tất cả đi qua `isEditable`.
- **Màn cán bộ (nới ra đúng một điểm):** `mayClaim` nhận thêm `NEEDS_SUPPLEMENT`. Các chốt khác
  (`mayStaffEdit`, `mayReject`, `mayAmendOfficialRecord`, `mayForceClaim`, `SUBMISSION_*_ROLES`)
  **không đổi**.
- **Luồng nhập hộ của cán bộ (`/ke-khai-ho`)** cũng đi qua `isEditable` nên bị chặn nếu hồ sơ do
  cán bộ khác giữ — thay đổi hành vi có chủ đích, xem mục 15.

### DataScope

- Không thay đổi. Hồ sơ vẫn được xác định từ cookie phiên đã ký (không nhận `submission_id` từ
  URL/body); màn cán bộ vẫn thao tác đúng `submissionId` trong URL.

### API contract

- Endpoint: `POST /api/public/submissions/current/submit`
- Method: POST
- Request before/after: **không đổi**
- Response before: `200 { receiptCode, status }`; hoặc `409 INVALID_STATE` với message
  `"Bản kê khai này đã được gửi."` khi trạng thái không cho sửa
- Response after: thêm một nhánh `409 INVALID_STATE` với message `"Hồ sơ đang được cán bộ phường xử
  lý nên không gửi lại được. Cán bộ sẽ liên hệ nếu cần thêm thông tin."` khi hồ sơ đang có cán bộ
  cầm. **Mã lỗi không mới** (`INVALID_STATE` đã có, vẫn 409) nên client cũ không cần sửa gì.
- Error handling: không thêm mã lỗi mới vào `PublicErrorCode`.

- Endpoint: `GET /api/public/submissions/current`
- Method: GET
- Request before/after: không đổi
- Response before: không có `hasAssignedOfficer`
- Response after: thêm `hasAssignedOfficer: boolean`. **Chỉ boolean** — không kèm tên, không kèm
  email cán bộ.

- Endpoint: `POST /api/submissions/:submissionId/action` (`CLAIM`)
- Request/response: **không đổi**. Chỉ tập trạng thái được chấp nhận rộng thêm `NEEDS_SUPPLEMENT`;
  trước đây trả `400 VALIDATION_FAILED "Hồ sơ không ở trạng thái có thể nhận xử lý."`.

### Database and migrations

- **Không có migration.** Không thêm/sửa/xoá cột, bảng, index nào.
- Không có backfill, không có thao tác dữ liệu.
- Dữ liệu hồ sơ `NEEDS_SUPPLEMENT` cũ **không bị sửa** — chỉ thay đổi cách hệ thống cho phép thao
  tác lên chúng.
- Rollback: thuần code, `git revert 109b00c`.

### Validation and file handling

- Trường bắt buộc: không đổi.
- Quy tắc tên file / giới hạn file / MIME validation: **không đụng tới**.
- Xử lý lỗi: nhánh chặn mới trả `409` qua `publicError` như các nhánh sẵn có, kèm `requestId`.

### Sensitive data

- **Không log thêm gì.** Nhánh chặn mới không gọi `console.*`, không ghi audit, không ghi
  `request_log` (chặn xảy ra trước mọi thao tác ghi).
- **Rủi ro đã chủ động chặn:** thông báo lỗi cho người dân **không** chứa email/tên cán bộ, và
  `GET /current` chỉ trả boolean. Đây là cam kết sẵn có của dự án (`assigned-officer.ts`: email
  công vụ là địa chỉ thật, lộ ra cổng công khai sẽ bị thu thập để lừa đảo nhân danh phường). Có
  test khẳng định message không chứa email — nếu agent sau đổi câu thông báo thành "Cán bộ
  {email} đang xử lý" thì test đỏ ngay.
- Không chạm CCCD, QR payload, token, Drive ID/link.

## 11. Tests added or changed

| Test file | Test case | Requirement covered | Result |
| --------- | --------- | -------------------- | ------ |
| `tests/public-resubmit-blocked-when-claimed.test.ts` | "hồ sơ NEEDS_SUPPLEMENT còn cán bộ giữ thì KHÔNG cho người dân sửa/gửi lại" | Lỗi gốc | PASS |
| `tests/public-resubmit-blocked-when-claimed.test.ts` | "hồ sơ NEEDS_SUPPLEMENT không còn ai giữ thì vẫn cho người dân bổ sung như cũ" | Không siết quá tay | PASS |
| `tests/public-resubmit-blocked-when-claimed.test.ts` | "bản nháp không bị ảnh hưởng — DRAFT không bao giờ bị claim" | Không hồi quy luồng nháp | PASS |
| `tests/public-resubmit-blocked-when-claimed.test.ts` | "chuỗi rỗng có khoảng trắng vẫn tính là chưa ai giữ" | Biên `trim()` | PASS |
| `tests/public-resubmit-blocked-when-claimed.test.ts` | "trạng thái đã gửi vẫn bị khóa dù không ai giữ" | Không nới lỏng luật cũ | PASS |
| `tests/public-submit-officer-priority-route.test.ts` | "chặn gửi lại khi cán bộ đang giữ hồ sơ, không gọi submit và không tốn lượt Turnstile" | 409 đúng mã + không ghi + thứ tự chặn + **không lộ email** | PASS |
| `tests/public-submit-officer-priority-route.test.ts` | "vẫn cho gửi lại bình thường khi không còn cán bộ nào giữ" | Đường thành công không bị chặn nhầm | PASS |
| `tests/submission-claim.test.ts` | `C1` (sửa) | `mayClaim` nhận `NEEDS_SUPPLEMENT`, từ chối `DRAFT`/`UNDER_REVIEW`/`ACCEPTED`/`REJECTED` | PASS |
| `tests/submission-review.test.ts` | test claim (sửa) | như trên | PASS |

**Ghi chú về chất lượng test:** `tests/public-submit-officer-priority-route.test.ts` cố ý **không
mock** `isEditable`/`isHeldByOfficer` (chỉ mock `resolvePublicRequest`, repository, Turnstile, env)
— các test route công khai sẵn có trong repo đều mock `isEditable: () => true`, nên nếu bài test
mới cũng mock thì nó sẽ không kiểm được gì. Đây là lý do có hai tầng test thay vì một.

## 12. Final verification

| Check             | Command                              | Result                        | Evidence |
| ------------------ | ------------------------------------- | ------------------------------ | -------- |
| Unit tests         | `npx vitest run`                      | **679 pass / 10 skip** (78 file pass + 2 skip) | output terminal |
| Integration tests  | (trong `vitest run`, gated)           | 2 file skip — **không đổi** so với baseline | như trên |
| E2E tests          | không chạy                            | N/A — không có Preview thật    | — |
| Build              | `npm run build`                       | Thành công (Next.js 16.2.10, Turbopack) | output terminal |
| Lint               | `npm run lint`                        | 0 lỗi / 5 warning — **giống hệt baseline**, không phát sinh warning mới | output terminal |
| Typecheck          | `npx tsc --noEmit -p tsconfig.json`   | 0 lỗi                          | output terminal |
| Security check     | không có scanner riêng trong dự án     | Đọc thủ công: không log mới, không lộ email cán bộ (có test khẳng định), không chạm PII | mục 10 |
| Secret scan        | không chạy công cụ riêng               | Đọc thủ công toàn bộ diff — không có key/token/secret nào được thêm | mục 21 |

672 → 679 pass (+7 test mới), 10 skip không đổi, **không test nào chuyển từ pass sang fail hoặc
sang skip**.

## 13. Acceptance criteria matrix

| ID | Acceptance criterion | Status | Evidence | Notes |
| --- | --------------------- | ------ | -------- | ----- |
| AC-01 | Người dân không gửi lại được khi cán bộ đang giữ hồ sơ | PASS | `…officer-priority-route` ca 1; `…blocked-when-claimed` ca 1 | — |
| AC-02 | Chặn áp dụng cho **mọi** đường ghi công khai, không riêng submit | PASS | Chốt nằm trong `isEditable`, được cả 7 route gọi — xác nhận bằng grep (`isEditable` xuất hiện ở 7 route công khai + 1 route nhập hộ) | Test trực tiếp mới chỉ có cho `submit`; các route khác dựa vào việc dùng chung hàm |
| AC-03 | Người dân nhận thông báo đúng lý do, không phải "đã gửi rồi" | PASS | test khẳng định message khớp `/cán bộ phường xử lý/i` | — |
| AC-04 | Không lộ email/tên cán bộ ra cổng công khai | PASS | test khẳng định message không chứa email; `GET /current` chỉ trả boolean | — |
| AC-05 | Hồ sơ `NEEDS_SUPPLEMENT` cũ tiếp nhận được, không kẹt | PASS | `submission-claim.test.ts` C1 | Chưa thử trên dữ liệu thật (mục 14) |
| AC-06 | Không tạo lối cướp hồ sơ mới cho cán bộ khác | PASS | route CLAIM không sửa; 403 sẵn có + điều kiện atomic trong SQL | — |
| AC-07 | Không hồi quy luồng nháp/gửi lần đầu | PASS | `…blocked-when-claimed` ca 2, 3, 4; toàn bộ 679 test xanh | — |
| AC-08 | Giao diện không hiện nút máy chủ sẽ từ chối | PASS (theo code) | `public-lookup.tsx` dùng `hasAssignedOfficer` từ máy chủ | **Chưa click-test trên trình duyệt thật** |
| AC-09 | Không có migration, không đụng dữ liệu | PASS | `git diff --name-status` không có file nào trong `supabase/migrations/` | — |

Không tiêu chí nào FAIL. AC-02 và AC-08 có ghi chú giới hạn bằng chứng — đọc kỹ trước khi nghiệm thu.

## 14. Manual verification required

- **Kịch bản chính (cần dữ liệu thật/giả trên Preview):**
  1. Tìm (hoặc tạo) một hồ sơ `NEEDS_SUPPLEMENT` còn `claimed_by` — đây là hình dạng dữ liệu cũ mà
     đợt này nhắm tới. Kiểm bằng SQL: `select submission_id, status, claimed_by from
     public.public_submissions where status = 'NEEDS_SUPPLEMENT' and coalesce(claimed_by,'') <> '';`
  2. Ở màn cán bộ: mở hồ sơ đó → nút **Tiếp nhận** phải hiện và bấm được → hồ sơ chuyển
     "Đang xử lý" → sửa được ở Bàn làm việc PL3.
  3. Ở `/tra-cuu` với mã tiếp nhận + mã bí mật của chính hồ sơ đó (trong lúc cán bộ đang giữ):
     **không** được thấy nút "Bổ sung hồ sơ"; phải thấy câu "Cán bộ phường đang xử lý hồ sơ này…".
  4. Nếu đã lỡ vào được wizard (tab cũ chẳng hạn) và bấm gửi: phải nhận 409 với đúng câu thông báo,
     và `claimed_by` trong CSDL **không đổi**.
  5. Hàng chờ: ô đếm "Chờ tiếp nhận" phải bao gồm hồ sơ đó; badge hiện "Cần bổ sung (hồ sơ cũ)";
     dropdown lọc trạng thái vẫn lọc đúng.
- **Kịch bản không được hỏng (hồi quy):** người dân tạo nháp mới → gửi lần đầu bình thường; hồ sơ
  `NEEDS_SUPPLEMENT` **không** ai giữ vẫn bổ sung được.
- **Đếm số hồ sơ bị ảnh hưởng trước khi deploy** (quyết định vận hành, không phải kỹ thuật):
  `select count(*) from public.public_submissions where status = 'NEEDS_SUPPLEMENT';` — nếu con số
  lớn, cần dặn cán bộ rằng nhóm hồ sơ này giờ phải xử lý bằng Tiếp nhận + sửa trực tiếp.

## 15. Remaining issues and warnings

| Severity | Issue | Impact | Recommended action |
| -------- | ----- | ------ | -------------------- |
| Medium | **Luồng nhập hộ của cán bộ (`/ke-khai-ho`) cũng bị chặn** nếu hồ sơ do cán bộ khác giữ — do dùng chung `isEditable` | Cán bộ B ngồi nhập hộ dân trên một hồ sơ cán bộ A đang giữ sẽ bị từ chối với thông báo dành cho *người dân* ("Cán bộ sẽ liên hệ nếu cần…"), hơi lạc ngữ cảnh | Đúng ý đồ (không ai cướp hồ sơ của ai) — lối đi đúng là Chuyển giao/FORCE_CLAIM. Nếu người dùng thấy phiền, đợt sau cho route nhập hộ một thông báo riêng |
| Medium | Chưa xác minh trên Preview với dữ liệu thật | Không biết thực tế còn bao nhiêu hồ sơ `NEEDS_SUPPLEMENT` và bao nhiêu trong số đó còn `claimed_by` | Chạy hai câu SQL ở mục 14 trước khi deploy |
| Low | AC-02 chỉ có test trực tiếp cho route `submit` | Sáu route công khai còn lại dựa vào việc dùng chung `isEditable` (đã xác nhận bằng đọc code + grep), không có test riêng | Chấp nhận được — chốt là hàm chung; nếu muốn chắc hơn thì thêm test cho `PATCH /current` và `uploads/initiate` ở đợt sau |
| Low | Chưa click-test giao diện `/tra-cuu` và hàng chờ | Rủi ro lỗi hiển thị nhỏ | Làm theo mục 14 |
| Low | 5 warning ESLint có sẵn từ trước | Không ảnh hưởng chức năng | Ngoài phạm vi |

## 16. Regression and compatibility notes

- Trình duyệt / thiết bị: không đổi — không thêm dependency, không thêm API trình duyệt mới.
- Node/runtime: không đổi (`runtime = "nodejs"` giữ nguyên ở các route liên quan).
- Database: **không đụng** — không migration, không đổi query nào.
- API bên ngoài: không đổi (Drive/Gemini/Turnstile không bị sửa; chỉ đổi **thứ tự** gọi Turnstile
  trong route submit — chặn trước, nên gọi ít đi chứ không gọi khác đi).
- Backward compatibility: `GET /current` chỉ **thêm** field; `POST submit` chỉ thêm một nhánh lỗi
  dùng mã `INVALID_STATE`/409 đã có. Client cũ không cần sửa.
- Excel/PDF/import/export: không ảnh hưởng — không đụng `PL3_COLUMNS` hay đường xuất.
- Khác: `mayClaim` là hàm dùng chung giữa API và UI; đã kiểm mọi nơi gọi (`action/route.ts`,
  `submission-detail.tsx`, `submissions-queue.tsx`) đều đúng ngữ nghĩa mới.

## 17. Rollback plan

- Rollback code: `git revert 109b00c` — commit độc lập, không đan xen với 2A-1/2A-2.
- Rollback migration: **không áp dụng** (đợt này không có migration).
- Dữ liệu có cần phục hồi: **không** — không ghi/sửa/xoá bản ghi nào.
- Điều kiện không được rollback tự động: nếu revert, lỗi "người dân gửi lại xoá mất claim của cán
  bộ" **quay lại**, và hồ sơ `NEEDS_SUPPLEMENT` lại không tiếp nhận được. Nếu buộc phải tách: bỏ
  riêng Phase 1 mà giữ Phase 2 thì an toàn; giữ Phase 1 mà bỏ Phase 2 sẽ làm hồ sơ cũ kẹt vĩnh
  viễn — **không được** làm chiều đó.

## 18. Recommended next action

`READY_FOR_COMMIT`

Code hoàn chỉnh, kiểm tra đầy đủ, đã commit local (`109b00c`). Bước tiếp theo do người dùng quyết:
(a) đọc lại diff mục 21, (b) chạy hai câu SQL ở mục 14 để biết quy mô hồ sơ `NEEDS_SUPPLEMENT` thật
trước khi deploy, (c) xác minh thủ công trên Preview, (d) push nhánh / tạo PR. Agent **không** tự
push, merge hay deploy khi chưa được yêu cầu rõ. Còn lại trong kế hoạch: 2B (hiệu năng) và 2C (cán
bộ tự tải ảnh bổ sung).

## 19. Commands to reproduce

```bash
npm ci
npx tsc --noEmit -p tsconfig.json
npm run lint
npx vitest run
npx vitest run tests/public-resubmit-blocked-when-claimed.test.ts \
               tests/public-submit-officer-priority-route.test.ts \
               tests/submission-claim.test.ts tests/submission-review.test.ts
npm run build
```

## 20. Key diff excerpts

Chốt chặn — một hàm bảo vệ toàn bộ bề mặt ghi công khai:

```diff
+export function isHeldByOfficer(record: SubmissionRecord): boolean {
+  return record.claimedBy.trim().length > 0;
+}
+
 export function isEditable(record: SubmissionRecord): boolean {
+  if (isHeldByOfficer(record)) return false;
   return record.status === "DRAFT" || record.status === "NEEDS_SUPPLEMENT";
 }
```

Chặn **trước** Turnstile, thông báo đúng lý do, không lộ email cán bộ:

```diff
+  if (isHeldByOfficer(record)) {
+    return publicError(
+      "INVALID_STATE",
+      "Hồ sơ đang được cán bộ phường xử lý nên không gửi lại được. Cán bộ sẽ liên hệ nếu cần " +
+        "thêm thông tin.",
+      requestId,
+    );
+  }
   if (!isEditable(record)) {
     return publicError("INVALID_STATE", "Bản kê khai này đã được gửi.", requestId);
   }
```

Mở claim cho hồ sơ cũ (bắt buộc đi kèm, nếu không sẽ kẹt vĩnh viễn):

```diff
 export function mayClaim(status: PublicStatus): boolean {
-  return status === "SUBMITTED" || status === "RESUBMITTED";
+  return status === "SUBMITTED" || status === "RESUBMITTED" || status === "NEEDS_SUPPLEMENT";
 }
```

Cấp dữ liệu cho UI mà không lộ danh tính cán bộ:

```diff
     checklist: completionChecklist(record.draft, storedFiles),
+    hasAssignedOfficer: publicHasAssignedOfficer(record),
     supplementRequest,
```

## 21. Full unified diff

```text
FULL_DIFF_INCLUDED cho toàn bộ src/ và tests/ — đây là phần cần review kỹ.
DOCS_DIFF_OMITTED: 4 file docs/brain/*.md là văn bản mô tả, nội dung đã được tóm tắt đầy đủ ở
mục 6, 7, 8 và 15 của báo cáo này. Yêu cầu riêng nếu cần đọc nguyên văn:
  docs/brain/01-architecture.md (Code Graph + danh sách API)
  docs/brain/03-decisions.md (entry [2026-07-29] Đợt 2A-3)
  docs/brain/04-current-tasks.md (mục Đợt 2A)
  docs/brain/06-ai-working-log.md (entry log)
```

Base: `ba38d99` — Head: `109b00c` — lệnh tái tạo: `git diff ba38d99 109b00c -- src tests`

```diff
diff --git a/src/app/api/public/submissions/current/route.ts b/src/app/api/public/submissions/current/route.ts
index 6d012a8..54019c7 100644
--- a/src/app/api/public/submissions/current/route.ts
+++ b/src/app/api/public/submissions/current/route.ts
@@ -16,6 +16,7 @@ import {
   PUBLIC_STATUS_LABELS,
   unauthorizedSupplementChanges,
 } from "@/modules/public-intake/workflow";
+import { publicHasAssignedOfficer } from "@/modules/submissions/assigned-officer";
 
 export const runtime = "nodejs";
 
@@ -74,6 +75,9 @@ export async function GET(request: Request): Promise<NextResponse> {
       uploadedAt: file.createdAt,
     })),
     checklist: completionChecklist(record.draft, storedFiles),
+    // Chỉ cờ boolean, không kèm email/tên cán bộ: giao diện dùng nó để ẩn nút "Bổ sung hồ sơ" khi
+    // cán bộ đang giữ hồ sơ, khớp với chốt chặn `isEditable` phía máy chủ (2026-07-29, Đợt 2A-3).
+    hasAssignedOfficer: publicHasAssignedOfficer(record),
     supplementRequest,
     timeline,
   });
diff --git a/src/app/api/public/submissions/current/submit/route.ts b/src/app/api/public/submissions/current/submit/route.ts
index e0af971..6391b6a 100644
--- a/src/app/api/public/submissions/current/submit/route.ts
+++ b/src/app/api/public/submissions/current/submit/route.ts
@@ -11,6 +11,7 @@ import {
 } from "@/modules/public-intake/repository";
 import {
   isEditable,
+  isHeldByOfficer,
   publicError,
   resolvePublicRequest,
 } from "@/modules/public-intake/route-context";
@@ -100,6 +101,16 @@ export async function POST(request: Request): Promise<NextResponse> {
     });
   }
 
+  // Tách khỏi `isEditable` để người dân nhận đúng lý do: hồ sơ đang có cán bộ xử lý thì bấm gửi
+  // lại không phải "đã gửi rồi" mà là "đừng gửi nữa, cán bộ đang làm" (2026-07-29, Đợt 2A-3).
+  if (isHeldByOfficer(record)) {
+    return publicError(
+      "INVALID_STATE",
+      "Hồ sơ đang được cán bộ phường xử lý nên không gửi lại được. Cán bộ sẽ liên hệ nếu cần " +
+        "thêm thông tin.",
+      requestId,
+    );
+  }
   if (!isEditable(record)) {
     return publicError("INVALID_STATE", "Bản kê khai này đã được gửi.", requestId);
   }
diff --git a/src/app/tra-cuu/public-lookup.tsx b/src/app/tra-cuu/public-lookup.tsx
index 0747f82..042e371 100644
--- a/src/app/tra-cuu/public-lookup.tsx
+++ b/src/app/tra-cuu/public-lookup.tsx
@@ -20,6 +20,7 @@ interface LookupData {
     uploadedAt: string;
   }>;
   checklist: Array<{ code: string; label: string; complete: boolean; missing: string }>;
+  hasAssignedOfficer: boolean;
   supplementRequest: null | {
     message: string;
     requestedByDisplayName: string;
@@ -133,7 +134,10 @@ export function PublicLookup() {
     );
   }
 
-  const editable = data.status === "DRAFT" || data.status === "NEEDS_SUPPLEMENT";
+  // Phải khớp `isEditable` phía máy chủ (route-context.ts): cán bộ đang giữ hồ sơ thì người dân
+  // không gửi lại được nữa, nên không hiện nút để rồi bấm vào lại báo lỗi (2026-07-29, Đợt 2A-3).
+  const editable =
+    !data.hasAssignedOfficer && (data.status === "DRAFT" || data.status === "NEEDS_SUPPLEMENT");
   return (
     <div className="space-y-5">
       <section className="pc-card">
@@ -155,6 +159,11 @@ export function PublicLookup() {
             {data.status === "DRAFT" ? "Tiếp tục bản nháp" : "Bổ sung hồ sơ"}
           </button>
         ) : null}
+        {data.hasAssignedOfficer ? (
+          <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
+            Cán bộ phường đang xử lý hồ sơ này. Cán bộ sẽ liên hệ với bạn nếu cần thêm thông tin.
+          </p>
+        ) : null}
       </section>
 
       <section className="pc-card">
diff --git a/src/components/submissions-queue.tsx b/src/components/submissions-queue.tsx
index 55143b9..aee500c 100644
--- a/src/components/submissions-queue.tsx
+++ b/src/components/submissions-queue.tsx
@@ -3,6 +3,8 @@
 import Link from "next/link";
 import { useEffect, useState } from "react";
 import { assignedOfficerLabel } from "@/modules/submissions/assigned-officer";
+import type { PublicStatus } from "@/modules/public-intake/repository";
+import { mayClaim } from "@/modules/submissions/review";
 
 type Summary = {
   submissionId: string;
@@ -31,7 +33,12 @@ const labels: Record<string, string> = {
 const statusStyles: Record<string, { label: string; bg: string }> = {
   SUBMITTED: { label: "Chờ tiếp nhận", bg: "bg-amber-50 text-amber-800 border-amber-200" },
   UNDER_REVIEW: { label: "Đang xử lý", bg: "bg-sky-50 text-sky-800 border-sky-200" },
-  NEEDS_SUPPLEMENT: { label: "Cần bổ sung", bg: "bg-orange-50 text-orange-800 border-orange-200" },
+  // "(hồ sơ cũ)": luồng yêu cầu bổ sung đã bỏ ở 2A-1 nên không hồ sơ mới nào vào trạng thái này;
+  // từ 2A-3 các hồ sơ còn lại tiếp nhận được như bình thường nên được đếm vào "Chờ tiếp nhận".
+  NEEDS_SUPPLEMENT: {
+    label: "Cần bổ sung (hồ sơ cũ)",
+    bg: "bg-orange-50 text-orange-800 border-orange-200",
+  },
   RESUBMITTED: { label: "Đã gửi lại", bg: "bg-blue-50 text-blue-800 border-blue-200" },
   REJECTED: { label: "Từ chối", bg: "bg-rose-50 text-rose-800 border-rose-200" },
   ACCEPTING: {
@@ -114,9 +121,9 @@ export function SubmissionsQueue() {
       });
   };
 
-  const countPending = items.filter(
-    (i) => i.status === "SUBMITTED" || i.status === "RESUBMITTED",
-  ).length;
+  // Đọc thẳng từ `mayClaim` thay vì liệt kê lại trạng thái: ô đếm này mang nhãn "Chờ tiếp nhận"
+  // nên phải khớp đúng định nghĩa "tiếp nhận được" của máy chủ, không được lệch (2026-07-29).
+  const countPending = items.filter((i) => mayClaim(i.status as PublicStatus)).length;
   const countReviewing = items.filter((i) => i.status === "UNDER_REVIEW").length;
   const countAccepted = items.filter((i) => i.status === "ACCEPTED").length;
 
diff --git a/src/modules/public-intake/route-context.ts b/src/modules/public-intake/route-context.ts
index 4d9dadf..8ad90b0 100644
--- a/src/modules/public-intake/route-context.ts
+++ b/src/modules/public-intake/route-context.ts
@@ -145,7 +145,32 @@ export async function resolvePublicRequest(
   return { record, requestId };
 }
 
-/** Sau khi gửi, bản khai bị khóa; chỉ mở lại khi cán bộ yêu cầu bổ sung (PLAN_NL §4.2). */
+/**
+ * Có cán bộ đang cầm hồ sơ này hay không.
+ *
+ * `claimed_by` được giữ nguyên qua nhiều trạng thái (xem `commitStaffAction`: cột chỉ bị xóa khi
+ * RELEASE hoặc khi người dân gửi lại), nên đây là câu trả lời đúng cho "hồ sơ có đang thuộc về ai
+ * không", độc lập với trạng thái.
+ */
+export function isHeldByOfficer(record: SubmissionRecord): boolean {
+  return record.claimedBy.trim().length > 0;
+}
+
+/**
+ * Sau khi gửi, bản khai bị khóa; chỉ mở lại khi cán bộ yêu cầu bổ sung (PLAN_NL §4.2).
+ *
+ * **[2026-07-29] Đợt 2A-3 — cán bộ ưu tiên.** Thêm điều kiện "chưa có cán bộ nào cầm hồ sơ".
+ * Trước đó, hồ sơ `NEEDS_SUPPLEMENT` vẫn giữ nguyên `claimed_by` của cán bộ đã yêu cầu bổ sung
+ * (luồng cũ, đã bỏ ở 2A-1), mà `repository.submit()` lại **xóa sạch** `claimed_by`/`claimed_at`
+ * khi người dân gửi lại. Nghĩa là một lần bấm "Bổ sung hồ sơ" của người dân âm thầm cướp hồ sơ
+ * khỏi tay cán bộ đang xử lý, không có xung đột phiên bản nào để chặn (version vẫn khớp). Từ đây
+ * người dân bị chặn ở TẤT CẢ đường ghi công khai — hàm này là chốt duy nhất cho cả bảy route
+ * `/api/public/submissions/current/*` nên không route nào có thể quên.
+ *
+ * `DRAFT` không bao giờ bị ảnh hưởng: `mayClaim` không cho nhận hồ sơ nháp nên `claimed_by` luôn
+ * rỗng ở trạng thái đó.
+ */
 export function isEditable(record: SubmissionRecord): boolean {
+  if (isHeldByOfficer(record)) return false;
   return record.status === "DRAFT" || record.status === "NEEDS_SUPPLEMENT";
 }
diff --git a/src/modules/submissions/review.ts b/src/modules/submissions/review.ts
index 6888c5c..64afbd1 100644
--- a/src/modules/submissions/review.ts
+++ b/src/modules/submissions/review.ts
@@ -46,8 +46,22 @@ export function isClaimedBy(record: SubmissionRecord, email: string): boolean {
   return record.claimedBy.trim().toLowerCase() === email.trim().toLowerCase();
 }
 
+/**
+ * Trạng thái nào còn nhận xử lý được.
+ *
+ * **[2026-07-29] Đợt 2A-3 — thêm `NEEDS_SUPPLEMENT`.** Luồng "yêu cầu bổ sung" đã bỏ ở 2A-1, nên
+ * không hồ sơ mới nào vào được trạng thái này nữa; nhưng hồ sơ **cũ** đang nằm đó thì trước bản
+ * sửa này bị kẹt vĩnh viễn: cán bộ không claim được (hàm này từ chối), không sửa được
+ * (`mayStaffEdit` đòi `UNDER_REVIEW`), và đường thoát duy nhất — người dân bấm gửi lại — vừa bị
+ * chặn ở `isEditable` cùng đợt. Cho claim là cách đưa chúng về đúng luồng mới: nhận xử lý → sửa
+ * trực tiếp ở Bàn làm việc → Hoàn thành xử lý.
+ *
+ * Hồ sơ `NEEDS_SUPPLEMENT` cũ thường vẫn còn `claimed_by` của cán bộ đã yêu cầu bổ sung; route
+ * CLAIM đã chặn sẵn người khác cướp hồ sơ (403 `Hồ sơ đang do cán bộ khác nhận xử lý`) và quản
+ * trị viên vẫn dùng được FORCE_CLAIM, nên mở trạng thái này không mở thêm lối vào nào.
+ */
 export function mayClaim(status: PublicStatus): boolean {
-  return status === "SUBMITTED" || status === "RESUBMITTED";
+  return status === "SUBMITTED" || status === "RESUBMITTED" || status === "NEEDS_SUPPLEMENT";
 }
 
 export function mayForceClaim(roles: readonly string[]): boolean {
diff --git a/tests/public-resubmit-blocked-when-claimed.test.ts b/tests/public-resubmit-blocked-when-claimed.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/public-resubmit-blocked-when-claimed.test.ts
@@ -0,0 +1,96 @@
+import { describe, expect, it } from "vitest";
+
+import type { SubmissionRecord } from "@/modules/public-intake/repository";
+import { isEditable, isHeldByOfficer } from "@/modules/public-intake/route-context";
+import { emptyOwner, type IntakeDraft } from "@/modules/public-intake/types";
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
+    status: "NEEDS_SUPPLEMENT",
+    phone: "0912345678",
+    version: 3,
+    accessCodeHash: "hash",
+    failedAttempts: 0,
+    lockedUntil: "",
+    consentVersion: "v1",
+    consentedAt: "2026-07-29T08:00:00.000Z",
+    retentionUntil: "",
+    driveFolderId: "folder_1",
+    officialCaseId: "",
+    acceptStep: "",
+    claimedBy: "",
+    claimedByDisplayName: "",
+    intakeChannel: "SELF_SERVICE",
+    assistedByEmail: "",
+    assistedByDisplayName: "",
+    assistedAt: "",
+    claimedAt: "",
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
+/**
+ * Lỗ hổng gốc: `repository.submit()` xóa sạch `claimed_by`/`claimed_at` khi người dân gửi lại,
+ * mà hồ sơ `NEEDS_SUPPLEMENT` cũ vẫn giữ nguyên cán bộ đã yêu cầu bổ sung. Version vẫn khớp nên
+ * KHÔNG có xung đột phiên bản nào chặn — một lần bấm "Bổ sung hồ sơ" của người dân âm thầm cướp
+ * hồ sơ khỏi tay cán bộ đang xử lý.
+ */
+describe("Đợt 2A-3 — cán bộ ưu tiên: chặn người dân ghi khi hồ sơ đang có cán bộ giữ", () => {
+  it("hồ sơ NEEDS_SUPPLEMENT còn cán bộ giữ thì KHÔNG cho người dân sửa/gửi lại", () => {
+    const record = makeRecord({
+      status: "NEEDS_SUPPLEMENT",
+      claimedBy: "officer@phongchau.gov.vn",
+      claimedByDisplayName: "Cán bộ A",
+      claimedAt: "2026-07-29T09:00:00.000Z",
+    });
+
+    expect(isHeldByOfficer(record)).toBe(true);
+    expect(isEditable(record)).toBe(false);
+  });
+
+  it("hồ sơ NEEDS_SUPPLEMENT không còn ai giữ thì vẫn cho người dân bổ sung như cũ", () => {
+    const record = makeRecord({ status: "NEEDS_SUPPLEMENT", claimedBy: "" });
+
+    expect(isHeldByOfficer(record)).toBe(false);
+    expect(isEditable(record)).toBe(true);
+  });
+
+  it("bản nháp không bị ảnh hưởng — DRAFT không bao giờ bị claim nên vẫn sửa được", () => {
+    const record = makeRecord({ status: "DRAFT", claimedBy: "" });
+
+    expect(isEditable(record)).toBe(true);
+  });
+
+  it("chuỗi rỗng có khoảng trắng vẫn tính là chưa ai giữ", () => {
+    const record = makeRecord({ status: "NEEDS_SUPPLEMENT", claimedBy: "   " });
+
+    expect(isHeldByOfficer(record)).toBe(false);
+    expect(isEditable(record)).toBe(true);
+  });
+
+  it("trạng thái đã gửi vẫn bị khóa dù không ai giữ (không nới lỏng luật cũ)", () => {
+    for (const status of ["SUBMITTED", "RESUBMITTED", "UNDER_REVIEW", "ACCEPTED"] as const) {
+      expect(isEditable(makeRecord({ status, claimedBy: "" }))).toBe(false);
+    }
+  });
+});
diff --git a/tests/public-submit-officer-priority-route.test.ts b/tests/public-submit-officer-priority-route.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/public-submit-officer-priority-route.test.ts
@@ -0,0 +1,136 @@
+import { beforeEach, describe, expect, it, vi } from "vitest";
+
+import { emptyDraft } from "@/modules/public-intake/types";
+
+const mocks = vi.hoisted(() => ({
+  resolvePublicRequest: vi.fn(),
+  findStoredMutation: vi.fn(),
+  submit: vi.fn(),
+  listFiles: vi.fn(),
+  verifyTurnstileToken: vi.fn(),
+}));
+
+// `isEditable`/`isHeldByOfficer` KHÔNG bị mock — đây chính là chốt chặn cần kiểm.
+vi.mock("@/modules/public-intake/route-context", async (importOriginal) => {
+  const actual =
+    await importOriginal<typeof import("@/modules/public-intake/route-context")>();
+  return {
+    ...actual,
+    resolvePublicRequest: (...args: unknown[]) => mocks.resolvePublicRequest(...args),
+  };
+});
+
+vi.mock("@/modules/public-intake/repository", () => ({
+  getPublicIntakeRepository: vi.fn().mockReturnValue({
+    findStoredMutation: (...args: unknown[]) => mocks.findStoredMutation(...args),
+    submit: (...args: unknown[]) => mocks.submit(...args),
+    listFiles: (...args: unknown[]) => mocks.listFiles(...args),
+  }),
+  SubmissionIdempotencyConflictError: class extends Error {},
+  SubmissionVersionConflictError: class extends Error {},
+}));
+
+vi.mock("@/modules/public-intake/turnstile", async (importOriginal) => {
+  const actual = await importOriginal<typeof import("@/modules/public-intake/turnstile")>();
+  return {
+    ...actual,
+    verifyTurnstileToken: (...args: unknown[]) => mocks.verifyTurnstileToken(...args),
+  };
+});
+
+vi.mock("@/modules/common/env", async (importOriginal) => {
+  const actual = await importOriginal<typeof import("@/modules/common/env")>();
+  return {
+    ...actual,
+    loadPublicIntakeEnvironment: vi.fn().mockReturnValue({
+      MAX_DRAFT_JSON_BYTES: 256_000,
+      TURNSTILE_SECRET_KEY: "test-secret",
+      APP_BASE_URL: "http://localhost",
+      DATA_HASH_PEPPER: "mock-pepper-at-least-32-chars-long-value",
+    }),
+  };
+});
+
+const { POST } = await import("@/app/api/public/submissions/current/submit/route");
+
+function makeRecord(overrides: Record<string, unknown> = {}) {
+  const draft = emptyDraft("owner-1", "parcel-1", "land-use-1");
+  draft.phone = "0912345678";
+  draft.consentAccepted = true;
+  draft.owners[0].fullName = "Nguyen Van A";
+  return {
+    submissionId: "submission-1",
+    receiptCode: "PC-KK-2026-0001",
+    status: "NEEDS_SUPPLEMENT",
+    version: 4,
+    draft,
+    claimedBy: "",
+    claimedByDisplayName: "",
+    ...overrides,
+  };
+}
+
+function makeRequest() {
+  return new Request("http://localhost/api/public/submissions/current/submit", {
+    method: "POST",
+    headers: {
+      "content-type": "application/json",
+      "idempotency-key": "11111111-1111-4111-8111-111111111111",
+      "x-turnstile-token": "token",
+    },
+    body: JSON.stringify({}),
+  });
+}
+
+describe("POST /api/public/submissions/current/submit — cán bộ ưu tiên (Đợt 2A-3)", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mocks.findStoredMutation.mockResolvedValue(null);
+    mocks.verifyTurnstileToken.mockResolvedValue({ ok: true });
+    // Đủ ảnh để qua `validateCitizenRequiredFiles` — bài test này kiểm chốt chặn cán bộ ưu tiên,
+    // không phải kiểm luật ảnh bắt buộc.
+    mocks.listFiles.mockResolvedValue([
+      { ownerId: "owner-1", documentType: "CITIZEN_ID_FRONT", status: "UPLOADED" },
+      { ownerId: "owner-1", documentType: "CITIZEN_ID_BACK", status: "UPLOADED" },
+      { ownerId: "owner-1", documentType: "CERTIFICATE", status: "UPLOADED" },
+    ]);
+  });
+
+  it("chặn gửi lại khi cán bộ đang giữ hồ sơ, không gọi submit và không tốn lượt Turnstile", async () => {
+    mocks.resolvePublicRequest.mockResolvedValue({
+      requestId: "req-held",
+      record: makeRecord({
+        claimedBy: "officer@phongchau.gov.vn",
+        claimedByDisplayName: "Cán bộ A",
+      }),
+    });
+
+    const response = await POST(makeRequest());
+
+    expect(response.status).toBe(409);
+    const body = (await response.json()) as { error: { code: string; message: string } };
+    expect(body.error.code).toBe("INVALID_STATE");
+    expect(body.error.message).toMatch(/cán bộ phường xử lý/i);
+    // Không được ghi gì, và chặn phải xảy ra TRƯỚC Turnstile để không đốt lượt xác minh.
+    expect(mocks.submit).not.toHaveBeenCalled();
+    expect(mocks.verifyTurnstileToken).not.toHaveBeenCalled();
+
+    // Thông báo cho người dân tuyệt đối không được lộ email công vụ của cán bộ.
+    expect(body.error.message).not.toContain("officer@phongchau.gov.vn");
+  });
+
+  it("vẫn cho gửi lại bình thường khi không còn cán bộ nào giữ hồ sơ", async () => {
+    mocks.resolvePublicRequest.mockResolvedValue({
+      requestId: "req-free",
+      record: makeRecord({ claimedBy: "" }),
+    });
+    mocks.submit.mockResolvedValue(undefined);
+
+    const response = await POST(makeRequest());
+
+    expect(response.status).toBe(200);
+    const body = (await response.json()) as { status: string };
+    expect(body.status).toBe("RESUBMITTED");
+    expect(mocks.submit).toHaveBeenCalledTimes(1);
+  });
+});
diff --git a/tests/submission-claim.test.ts b/tests/submission-claim.test.ts
--- a/tests/submission-claim.test.ts
+++ b/tests/submission-claim.test.ts
@@ -36,11 +36,15 @@
 describe("Submission claim permissions and status rules", () => {
-  it("C1: mayClaim returns true ONLY for SUBMITTED and RESUBMITTED", () => {
+  it("C1: mayClaim returns true ONLY for SUBMITTED, RESUBMITTED and NEEDS_SUPPLEMENT", () => {
     expect(mayClaim("SUBMITTED")).toBe(true);
     expect(mayClaim("RESUBMITTED")).toBe(true);
+    // Hồ sơ cũ của luồng yêu cầu bổ sung đã bỏ — phải tiếp nhận được, nếu không sẽ kẹt vĩnh viễn
+    // vì người dân cũng đã bị chặn gửi lại (2026-07-29, Đợt 2A-3).
+    expect(mayClaim("NEEDS_SUPPLEMENT")).toBe(true);
     expect(mayClaim("UNDER_REVIEW")).toBe(false);
     expect(mayClaim("ACCEPTED")).toBe(false);
     expect(mayClaim("REJECTED")).toBe(false);
+    expect(mayClaim("DRAFT")).toBe(false);
   });
diff --git a/tests/submission-review.test.ts b/tests/submission-review.test.ts
--- a/tests/submission-review.test.ts
+++ b/tests/submission-review.test.ts
@@ -57,9 +57,10 @@
-  it("allows claims only for submitted, resubmitted or currently reviewed records", () => {
+  it("allows claims for submitted, resubmitted and legacy needs-supplement records", () => {
     expect(mayClaim("SUBMITTED")).toBe(true);
     expect(mayClaim("RESUBMITTED")).toBe(true);
+    expect(mayClaim("NEEDS_SUPPLEMENT")).toBe(true);
     expect(mayClaim("UNDER_REVIEW")).toBe(false);
     expect(mayClaim("ACCEPTED")).toBe(false);
   });
```

## 22. Agent declaration

Agent xác nhận:

- Đã đọc `AGENTS.md`, `AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md` và `docs/brain/*` trước khi sửa code.
- Không tự mở rộng phạm vi ngoài phần đã nêu (chỉ làm Đợt 2A-3; 2B/2C không đụng tới). Hai thay đổi
  giao diện nhỏ (ô đếm hàng chờ, nhãn badge) là **hệ quả trực tiếp** của việc mở `mayClaim`, đã
  giải thích ở mục 5 — không phải mở rộng phạm vi tuỳ tiện.
- Không ghi đè thay đổi có sẵn của người dùng (working tree sạch trước khi bắt đầu).
- Không đưa secret vào báo cáo — đã đọc lại toàn bộ diff ở mục 21.
- Không tự merge, không tự push, không tự deploy.
- Kết quả test/lint/typecheck/build ghi đúng theo lệnh **thực tế đã chạy** trong phiên (mục 4, 12).
- Nội dung chưa xác minh đã đánh dấu rõ: chưa chạy trên Preview/dữ liệu thật (AC-05, AC-08, mục
  14, 15); AC-02 chỉ có test trực tiếp cho route `submit`, sáu route còn lại dựa vào dùng chung
  `isEditable`; hai component giao diện chưa click-test.
- Hai file test cũ bị **sửa** chứ không chỉ thêm — nêu rõ ở mục 7 và 11: tiêu đề cũ ("ONLY for
  SUBMITTED and RESUBMITTED") đã sai sự thật sau thay đổi, giữ nguyên sẽ thành tài liệu sai.
- Đoạn diff của hai file test cũ ở mục 21 được rút gọn phần ngữ cảnh không đổi cho dễ đọc; bản đầy
  đủ lấy bằng `git diff ba38d99 109b00c -- tests/submission-claim.test.ts tests/submission-review.test.ts`.
