# CHATGPT HANDOFF REPORT

## 1. Report metadata

- Project: Hệ thống thu thập và kiểm tra nhanh hồ sơ đất đai Phường Phong Châu (`land-ocr-180`)
- Repository path: `D:\04. Github\capphongchau`
- Generated at: 2026-07-29 12:25 +07:00
- Agent: Claude Code
- Task: Review PR #7 ("feat: hoàn thiện bàn biên tập PL3 và hợp nhất tài liệu") và vá các phát hiện được người dùng chấp thuận
- Status: `READY_FOR_REVIEW`
- Source plan: yêu cầu trực tiếp của người dùng trong hội thoại ("review lại PR 7" → "có vá hết cho tôi" → "sửa luôn đi rồi commit"); phạm vi vá = 5 mục review + 1 mục phát sinh do chính bản vá mục 2 (xem §8 Phase 7)
- Source acceptance criteria: từng phát hiện trong review phải có bằng chứng đã hết, cộng Definition of Done trong `AGENTS.md`
- Source security constraints: `CLAUDE.md` §Quy tắc cứng; `docs/brain/02-coding-rules.md`; `AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md` §5

**Lưu ý về file này:** bản `CHATGPT_HANDOFF.md` trước đó (đợt thi công của Codex cho PR #7) đã được
lưu nguyên vẹn tại `docs/handoffs/2026-07-29_pr7-full-pl3-editor_CHATGPT_HANDOFF.md` trước khi ghi
đè, vì PR #7 chưa merge và báo cáo đó vẫn còn giá trị nghiệm thu.

## 2. Git identity

- Current branch: `docs/agent-handoff-protocol`
- Remote: `origin https://github.com/vi-phuong-158/capphongchau.git`
- Base commit before work: `05f09c35f6a278f6229bce1ecfd3683487c3fb09`
- Head commit after work: `05f09c35f6a278f6229bce1ecfd3683487c3fb09`
- Commit created: **KHÔNG**. Toàn bộ thay đổi đang ở working tree, chưa commit, chưa push.
- Working tree state: dirty (11 file modified, 1 file added)
- User changes detected before work: **không có** — `git status --short` trống hoàn toàn trước khi bắt đầu
- User changes preserved: không áp dụng (không có thay đổi nào của người dùng để bảo toàn)

### Git status

```text
 M docs/brain/01-architecture.md
 M docs/brain/03-decisions.md
 M docs/brain/06-ai-working-log.md
 M eslint.config.mjs
 M src/components/admin/working-payload-editor.tsx
 M src/modules/public-intake/pl3-export.ts
 M src/modules/public-intake/repository.ts
 M src/modules/public-intake/types.ts
 M src/modules/public-intake/working-payload-audit.ts
 M tests/full-pl3-editor.test.ts
 M tests/pl3-export.test.ts
?? docs/handoffs/2026-07-29_pr7-full-pl3-editor_CHATGPT_HANDOFF.md
   (CHATGPT_HANDOFF.md bị ghi đè bởi chính báo cáo này)
```

### Diff statistics

```text
 eslint.config.mjs                                  | 12 ++-
 src/components/admin/working-payload-editor.tsx    | 51 ++++++-------
 src/modules/public-intake/pl3-export.ts            | 63 +++++++++++-----
 src/modules/public-intake/repository.ts            |  8 +-
 src/modules/public-intake/types.ts                 | 39 ++++++++++
 src/modules/public-intake/working-payload-audit.ts | 13 +++-
 tests/full-pl3-editor.test.ts                      | 70 +++++++++++++++++-
 tests/pl3-export.test.ts                           | 85 ++++++++++++++++++++++
 8 files changed, 288 insertions(+), 53 deletions(-)
```

(Chưa tính 3 file tài liệu `docs/brain/*` và file handoff lưu trữ.)

### Name status

```text
M	docs/brain/01-architecture.md
M	docs/brain/03-decisions.md
M	docs/brain/06-ai-working-log.md
M	eslint.config.mjs
M	src/components/admin/working-payload-editor.tsx
M	src/modules/public-intake/pl3-export.ts
M	src/modules/public-intake/repository.ts
M	src/modules/public-intake/types.ts
M	src/modules/public-intake/working-payload-audit.ts
M	tests/full-pl3-editor.test.ts
M	tests/pl3-export.test.ts
```

## 3. Executive summary

**Vấn đề:** PR #7 mở rộng bàn biên tập PL3 lên đủ 49 cột B–AX. Review phát hiện 8 vấn đề; người
dùng yêu cầu vá 5 vấn đề có thể sửa bằng code (3 vấn đề còn lại cần quyết định nghiệp vụ).

**Kiểm chứng độc lập đã làm trước khi kết luận:** đọc trực tiếp `Tai lieu/PL3.xlsx` (sheet
`Phong Châu`) bằng `exceljs` và đối chiếu từng nhãn ở row 3 cùng số hiệu trường ở row 4. Kết quả:
49 nhãn trong `PL3_COLUMNS` khớp **byte-exact** với nguồn, kể cả các chi tiết trông như lỗi
(`"Hình thức sử dụng "` thừa space ×3, `"địa chỉ thường trú (2 cấp)"` viết thường, `\n` trong nhãn
cột H). PR #7 còn sửa đúng một lỗi lệch cột có thật ở nhóm tài sản (bản cũ đánh 41=Khu chung cư,
42=Số căn hộ; nguồn là AP=41 Khu nhà chung cư, AQ=42 Nhà chung cư, AR=43 Số căn hộ). Phần ánh xạ
PL3 của PR #7 được xác nhận là đúng — các mục vá dưới đây nằm ở chỗ khác.

**Đã thực hiện — 6 bản vá:**

1. Chặn mất tên tổ chức trên bản ghi lưu trước migration `202607290002`.
2. Chặn mất tương ứng giữa 9 cột tài sản AO–AW khi một thửa có nhiều tài sản.
3. Sửa `changedFieldCount` trong audit vốn luôn bị chặn ở 250.
4. Chặn tình trạng xóa thửa làm hỏng nút Lưu bằng một lỗi không giải thích được.
5. Mở lại lint gate: ESLint đang **chết vì hết heap**, không phải fail có thông báo.
6. (Phát sinh) Cảnh báo thuộc về một thửa bị lặp đúng bằng số đồng sở hữu — do `buildRow` chạy mỗi
   cặp (thửa × chủ). Bản vá mục 2 thêm một cảnh báo mới vào đúng chỗ đó nên agent tự phát hiện khi
   rà lại, người dùng chấp thuận sửa luôn.

**Kết quả:** test 631 → 637 pass (thêm 6 test hồi quy), typecheck đạt, build đạt, lint từ trạng
thái crash chuyển sang 0 error.

**Chưa hoàn thành (cố ý — cần quyết định nghiệp vụ, không phải code):** 3 mục ở §15.

**Trạng thái đề xuất:** `READY_FOR_REVIEW`, chưa commit theo mặc định "không tự commit/push".

## 4. Baseline before changes

Đo tại commit `05f09c3`, working tree sạch, **trước** mọi thay đổi.

| Check             | Command             | Result                 | Evidence                                                                                                                                             |
| ----------------- | ------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests        | `npm test`          | PASS                   | `Test Files 67 passed \| 2 skipped (69)`; `Tests 631 passed \| 10 skipped (641)`                                                                       |
| Integration tests | —                   | KHÔNG CÓ BỘ RIÊNG      | Nằm trong cùng bộ Vitest ở trên                                                                                                                        |
| E2E tests         | `npm run test:e2e`  | **NOT_RUN**            | Cần preview deployment + secret; không có trong môi trường này. Không khai pass.                                                                       |
| Build             | `npm run build`     | **NOT_RUN Ở BASELINE** | Chỉ chạy sau thay đổi (§12). Không có số liệu baseline để so sánh.                                                                                     |
| Lint              | `npm run lint`      | **FAIL — CRASH**       | `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`. Không hoàn thành, không báo được lỗi nào. |
| Typecheck         | `npm run typecheck` | PASS                   | `tsc --noEmit -p tsconfig.typecheck.json`, exit 0, không output                                                                                        |

**Lỗi đã tồn tại từ trước (không do thay đổi này):**

- Lint crash vì OOM — chính là mục 5 được vá.
- 5 warning `@typescript-eslint/no-unused-vars` trong `scripts/add-system-admins.ts` và
  `tests/staging-rehearsal-scenarios.test.ts`. Hai file này **không** thuộc phạm vi vá, warning
  được giữ nguyên có chủ ý.

## 5. Scope

### In scope

- 5 phát hiện review được người dùng chấp thuận vá (chi tiết §8).
- 1 phát hiện phát sinh trong lúc rà lại bản vá mục 2, người dùng chấp thuận sửa (§8 Phase 7).
- Test hồi quy cho từng phát hiện.
- Cập nhật `docs/brain/01-architecture.md` (Code Graph), `03-decisions.md`, `06-ai-working-log.md`
  theo quy tắc bắt buộc trong `CLAUDE.md`.

### Out of scope

- Không sửa mã ánh xạ PL3 (đã xác minh đúng so với `Tai lieu/PL3.xlsx`).
- Không đụng migration `202607290002_full_pl3_editor.sql` — không thêm/xóa/đổi cột nào.
- Không đụng `completion-checks.ts`, `official-record.ts`, `validation.ts`, route working-payload.
- Không sửa 5 warning lint có sẵn ở file ngoài phạm vi.
- Không commit, không push, không merge, không deploy.

### Deviations from approved plan

- **Có một sai lệch, làm tăng chất lượng chứ không mở rộng hành vi:** hai đoạn logic vá ở mục 1 và
  mục 4 ban đầu viết thẳng trong component React. Repo **không có hạ tầng test React** (không
  `@testing-library/*`, không `jsdom`/`happy-dom` trong dependencies), nên logic đó sẽ không thể
  test được. Đã tách thành hai hàm thuần `migrateLegacyOrganisationOwner()` và
  `detachAssetsFromMissingParcels()` đặt trong `src/modules/public-intake/types.ts` cạnh các helper
  owner/asset sẵn có, đúng theo mẫu đã dùng ở `payload-layers.ts` và `working-payload-audit.ts`.
  Hành vi runtime không đổi; chỉ vị trí code đổi để test được.

## 6. Decisions implemented

| Decision                                                                     | Implementation                                                                                             | Evidence                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Gộp nhiều tài sản trên cùng thửa phải giữ vị trí, không bỏ trùng/bỏ ô rỗng    | `assetColumn()` thay `joined()`; ô rỗng ghi `ASSET_EMPTY_PLACEHOLDER = "-"`; >1 tài sản sinh warning        | `docs/brain/03-decisions.md` mục `[2026-07-29]`; test `pl3-export.test.ts` |
| Di trú dòng tổ chức legacy trước mọi thao tác ghi; đổi pháp nhân KHÔNG di trú | `migrateLegacyOrganisationOwner()` gọi trong `updateOwner`; `updateOwnerType` tách riêng và cố ý không gọi  | `types.ts`; test "dòng tổ chức cũ được di trú F/G…"                        |
| Audit đếm số trường thay đổi trước khi cắt danh sách                         | `changedFieldCount` + `changedFieldPathsTruncated` trong `WorkingPayloadAuditSummary`                       | `working-payload-audit.ts`; test "changedFieldCount đếm trước khi cắt bớt…" |
| Xóa thửa gỡ tham chiếu tài sản thay vì để payload không lưu được             | `detachAssetsFromMissingParcels()` gọi trong `updateParcels`                                                | `types.ts`; test "xóa thửa thì gỡ tham chiếu tài sản…"                     |
| ESLint bỏ qua `**/.next/**` và `.claude/**`                                  | `eslint.config.mjs` đổi ignore                                                                             | `docs/brain/03-decisions.md`; `npm run lint` exit 0                        |
| Ghi nhận 3 vấn đề CHƯA quyết thay vì âm thầm bỏ qua                          | Mục "CHƯA quyết" trong `03-decisions.md` + §15 báo cáo này                                                  | `docs/brain/03-decisions.md`                                              |

## 7. Changed files

| File                                                 | Change type | Symbols/routes/components affected                                                                                                | Purpose                                                               | Risk                                                                 |
| ---------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `eslint.config.mjs`                                  | Modified    | mảng `ignores`                                                                                                                    | Ngừng quét bản build sinh tự động trong worktree agent                 | Thấp. Chỉ mở rộng phạm vi bỏ qua ngoài cây mã nguồn                   |
| `src/modules/public-intake/types.ts`                 | Modified    | **thêm** `migrateLegacyOrganisationOwner()`, `detachAssetsFromMissingParcels()`                                                    | Hai helper thuần, test được, cho bàn biên tập gọi                      | Thấp. Chỉ thêm export, không đổi type hay hàm sẵn có                  |
| `src/components/admin/working-payload-editor.tsx`    | Modified    | `updateOwner` (viết lại), **thêm** `updateOwnerType`/`updateParcels`, **xóa** `updateOrganisation`; ô M/F/G, `EditableParcelTable` | Chặn mất tên tổ chức và chặn payload không lưu được sau khi xóa thửa   | **Trung bình.** Đường ghi của form chủ sử dụng; cần kiểm thủ công §14 |
| `src/modules/public-intake/pl3-export.ts`            | Modified    | **xóa** `joined()`, **thêm** `assetColumn()` + `ASSET_EMPTY_PLACEHOLDER`; `assetCells()` nhận thêm `context`; `buildRow`; `buildSubmissionRows` dedupe warnings | Giữ tương ứng giữa 9 cột AO–AW; bỏ cảnh báo lặp theo số đồng sở hữu | **Trung bình.** Đổi nội dung ô xuất PL3 khi thửa có >1 tài sản; sheet "Canh bao" ít dòng hơn |
| `src/modules/public-intake/working-payload-audit.ts` | Modified    | `WorkingPayloadAuditSummary` (+2 field), `summarizeWorkingPayloadChanges()`, **thêm** `MAX_AUDIT_FIELD_PATHS`                      | Đếm đúng số trường thay đổi                                           | Thấp. Chỉ thêm trường vào summary                                     |
| `src/modules/public-intake/repository.ts`            | Modified    | `commitWorkingPayload()`, `commitOfficialAmendment()` — chỉ phần `metadata` của `insertAudit`                                      | Dùng count đúng + ghi cờ truncated                                    | Thấp. Không đụng SQL, transaction hay điều kiện version               |
| `tests/full-pl3-editor.test.ts`                      | Modified    | +3 test, +1 assertion nối dây                                                                                                     | Hồi quy mục 1, 3, 4                                                   | Không                                                                 |
| `tests/pl3-export.test.ts`                           | Modified    | +2 test                                                                                                                           | Hồi quy mục 2                                                         | Không                                                                 |
| `docs/brain/01-architecture.md`                      | Modified    | Code Graph: nhánh `commitWorkingPayload` và `pl3-export.ts`                                                                       | Code Graph lỗi thời nguy hiểm hơn không có                            | Không                                                                 |
| `docs/brain/03-decisions.md`                         | Modified    | +3 mục quyết định                                                                                                                 | Ghi lý do và phần chưa chốt                                           | Không                                                                 |
| `docs/brain/06-ai-working-log.md`                    | Modified    | +1 entry                                                                                                                          | Bắt buộc theo `CLAUDE.md`                                             | Không                                                                 |

## 8. Detailed implementation by phase

### Phase 1 — Mở lại lint gate (mục 5)

- **Mục tiêu:** `npm run lint` chạy tới cùng thay vì chết vì hết heap.
- **File:** `eslint.config.mjs`.
- **Đã làm:** `ignores` đổi từ `[".next/**", …]` sang `["**/.next/**", ".claude/**", …]`.
  Nguyên nhân gốc: `.next/**` là glob neo ở gốc repo nên chỉ khớp bản build gốc; các worktree agent
  dưới `.claude/worktrees/*/` có `.next/` riêng và bị quét.
- **Không làm:** không sửa 5 warning có sẵn ở `scripts/add-system-admins.ts` và
  `tests/staging-rehearsal-scenarios.test.ts` (ngoài phạm vi).
- **Test:** `npm run lint`.
- **Kết quả:** từ `FATAL ERROR … heap out of memory` → `✖ 5 problems (0 errors, 5 warnings)`, exit 0.
- **Rủi ro:** không đáng kể; `.claude/` vốn đã trong `.gitignore`.

### Phase 2 — Audit đếm đúng số trường thay đổi (mục 3)

- **Mục tiêu:** `changedFieldCount` phản ánh số trường thật, kể cả khi danh sách bị cắt.
- **File:** `src/modules/public-intake/working-payload-audit.ts`, `src/modules/public-intake/repository.ts`.
- **Đã làm:** hằng số `MAX_AUDIT_FIELD_PATHS = 250` được đặt tên và export.
  `WorkingPayloadAuditSummary` thêm `changedFieldCount` (đếm **trước** khi `slice`) và
  `changedFieldPathsTruncated`. Hai chỗ trong `repository.ts` chuyển từ
  `auditSummary.changedFieldPaths.length` (mảng đã cắt → luôn ≤250) sang
  `auditSummary.changedFieldCount`, đồng thời ghi cờ truncated vào metadata. Nhánh
  `AI_DRAFT_APPLIED` trước đây thiếu hẳn `changedFieldCount`, nay được bổ sung cho đồng nhất.
- **Không làm:** không đổi giá trị 250, không đổi thuật toán `collectChangedPaths`.
- **Test:** test mới "changedFieldCount đếm trước khi cắt bớt, kèm cờ truncated".
- **Kết quả:** pass.
- **Rủi ro:** thấp — chỉ thêm khóa vào `audit_logs.metadata` (kiểu JSON tự do, không có schema cứng).

### Phase 3 — Giữ tương ứng 9 cột tài sản AO–AW (mục 2)

- **Mục tiêu:** khi một thửa có nhiều tài sản, người đọc PL3 phải ghép lại được giá trị nào thuộc
  tài sản nào.
- **File:** `src/modules/public-intake/pl3-export.ts`.
- **Đã làm:** bỏ `joined()` (dedup `Set` + `filter(Boolean)`, áp dụng độc lập từng cột). Thêm
  `assetColumn(assets, pick)`: 0 tài sản → `""`; 1 tài sản → giá trị trần (không có ký tự giữ chỗ);
  ≥2 tài sản → nối `"; "` theo đúng thứ tự tài sản, ô rỗng thay bằng
  `ASSET_EMPTY_PLACEHOLDER = "-"`. `assetCells()` nhận thêm `context` và đẩy một warning khi thửa có
  >1 tài sản. Bộ lọc tài sản legacy thiếu `parcelId` giữ nguyên không đổi.
- **Không làm:** không đổi mô hình dòng xuất (vẫn là thửa × chủ, không tách theo tài sản).
- **Test:** 2 test mới trong `pl3-export.test.ts`.
- **Kết quả:** pass.
- **Rủi ro:** **thay đổi nội dung ô xuất PL3** với hồ sơ có >1 tài sản trên cùng thửa. Xem §9.

### Phase 4 — Chặn mất tên tổ chức trên bản ghi legacy (mục 1)

- **Mục tiêu:** không có thứ tự thao tác nào của cán bộ làm mất tên/mã số tổ chức.
- **File:** `src/modules/public-intake/types.ts`, `src/components/admin/working-payload-editor.tsx`.
- **Bối cảnh lỗi:** dòng tổ chức lưu trước `202607290002` giữ tên tổ chức trong `fullName`. Form mới
  dùng ô H/K cho **người đại diện** và render rỗng cho dòng legacy
  (`value={legacyOrganisation ? "" : owner.fullName}`), nhưng `onChange` lại gọi thẳng
  `updateOwner(index, "fullName", …)`. Gõ vào H trước khi chạm F ⇒ `fullName` bị ghi đè,
  `organisationName` vẫn rỗng ⇒ tên tổ chức mất, không cảnh báo, không khôi phục được. Đường di trú
  cũ (`updateOrganisation`) chỉ chạy khi cán bộ tình cờ chạm F/G trước.
- **Đã làm:** thêm `migrateLegacyOrganisationOwner(owner)` — idempotent, chỉ tác động dòng tổ chức
  chưa có F/G, chuyển `fullName`→`organisationName` và `identityNumber`→`organisationIdentityNumber`
  rồi giải phóng H/K. `updateOwner` gọi nó ở **mọi** trường. Xóa hẳn `updateOrganisation`; ô F/G
  giờ dùng chung `updateOwner`. Thêm `updateOwnerType` **cố ý không di trú**: chuyển tổ chức → cá
  nhân nghĩa là cán bộ khẳng định `fullName` vốn là tên người, phải giữ nguyên tại chỗ.
- **Không làm:** không đổi logic hiển thị (`legacyOrganisation ? "" : …`) — chỉ đường **ghi** hỏng,
  đường **đọc** vốn đúng.
- **Test:** test mới bao gồm cả trường hợp idempotent và dòng cá nhân không bị đụng.
- **Kết quả:** pass.
- **Rủi ro:** trung bình — cần kiểm thủ công (§14), nhất là nhánh `updateOwnerType`.

### Phase 5 — Xóa thửa không làm hỏng nút Lưu (mục 4)

- **Mục tiêu:** xóa thửa xong vẫn lưu được bản làm việc.
- **File:** `src/modules/public-intake/types.ts`, `src/components/admin/working-payload-editor.tsx`.
- **Bối cảnh lỗi:** `EditableParcelTable.deleteParcel` chỉ lọc mảng `parcels`; component không nhận
  `draft` nên không dọn được `draft.assets`. Sau đó `draftSchema.superRefine` từ chối
  `asset.parcelId` mồ côi, và vì lỗi phát sinh trong schema nên route trả về thông báo cấu trúc
  chung không chỉ ra ô nào.
- **Đã làm:** thêm `detachAssetsFromMissingParcels(assets, parcels)` đặt `parcelId = ""` cho tài sản
  mồ côi. `WorkingPayloadEditor.updateParcels` gọi nó và truyền `onChange` cho `EditableParcelTable`.
  Không đổi signature của component con — hai callback cùng ghi lên một `draft` sẽ giẫm lên nhau.
- **Quyết định có chủ ý:** để `parcelId = ""` (lưu được) thay vì xóa luôn tài sản (mất dữ liệu).
  `completionChecks.checkAssets` vẫn chặn lúc tiếp nhận kèm thông báo đúng chỗ
  ("Tài sản thứ N chưa gắn với thửa"), nên không có đường nào để dữ liệu thiếu lọt vào hồ sơ chính thức.
- **Test:** test mới xác nhận cả ba trạng thái — hợp lệ trước khi xóa, **không hợp lệ** nếu bỏ bước
  gỡ tham chiếu, hợp lệ trở lại sau khi gỡ.
- **Kết quả:** pass.
- **Rủi ro:** thấp.

### Phase 7 — Cảnh báo của một thửa không lặp theo số đồng sở hữu (mục 6, phát sinh)

- **Mục tiêu:** sheet "Canh bao" không lặp lại cùng một câu N lần cho một thửa có N đồng sở hữu.
- **File:** `src/modules/public-intake/pl3-export.ts`.
- **Bối cảnh lỗi:** `buildSubmissionRows` gọi `buildRow` mỗi cặp (thửa × chủ), mà `buildRow` là nơi
  sinh cảnh báo về **thửa** — `field19` (ghi đè/mập mờ), `landUseCells` (>3 mục đích), `labelOf`
  (mã lạ), và cảnh báo nhiều tài sản vừa thêm ở Phase 3. Hồ sơ 3 đồng sở hữu ra 3 dòng giống hệt.
- **Đã làm:** `buildSubmissionRows` trả `Array.from(new Set(warnings))`.
- **Vì sao dedupe ở đây thay vì đẩy riêng cảnh báo tài sản ra ngoài vòng lặp:** dedupe dọn luôn cả
  ba loại cảnh báo có sẵn từ PR #7 vốn đã trùng, diff nhỏ hơn, và **không mất thông tin** — các
  chuỗi bị loại là chuỗi trùng khít nhau, đã mang sẵn ngữ cảnh `Hồ sơ {label} thửa {n}` nên hai
  thửa khác nhau không bao giờ gộp nhầm. Ràng buộc mới phát sinh: cảnh báo phải là chuỗi tất định.
- **Không làm:** không đổi thứ tự cảnh báo (giữ lần xuất hiện đầu tiên), không đụng nội dung câu.
- **Test:** test mới "cảnh báo của một thửa không lặp theo số đồng sở hữu" — 3 chủ × 1 thửa = 3 dòng
  nhưng đúng 1 cảnh báo.
- **Kết quả:** pass. Đã xác nhận không vacuous bằng cách tạm gỡ dedupe: test fail với
  `expected [ …(3) ] to have a length of 1 but got 3`, sau đó khôi phục.
- **Rủi ro:** thấp. Ảnh hưởng duy nhất là nội dung sheet "Canh bao" (ít dòng hơn, không mất câu nào).

### Phase 6 — Tài liệu

- Cập nhật Code Graph trong `docs/brain/01-architecture.md` tại đúng hai nhánh bị ảnh hưởng
  (`commitWorkingPayload` và `pl3-export.ts`), kèm cảnh báo ⚠️ cho bất biến mới.
- `docs/brain/03-decisions.md`: 2 quyết định đã chốt + 1 mục **CHƯA quyết** (PII trong lý do override).
- `docs/brain/06-ai-working-log.md`: entry theo mẫu bắt buộc.

## 9. Behavior before and after

| Scenario                                                                        | Before                                                                   | After                                                                               | Verification                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Dòng tổ chức legacy, cán bộ gõ tên người đại diện vào ô H **trước** khi chạm ô F | Tên tổ chức bị ghi đè mất, không cảnh báo                                | Tên tổ chức tự chuyển sang ô F, ô H nhận tên người đại diện                          | Test "dòng tổ chức cũ được di trú F/G…" + kiểm thủ công §14       |
| Dòng tổ chức legacy, cán bộ đổi pháp nhân sang "Cá nhân"                         | `fullName` giữ nguyên                                                    | `fullName` giữ nguyên (không đổi — `updateOwnerType` cố ý không di trú)              | Đọc code; kiểm thủ công §14                                      |
| Thửa có 2 tài sản, cùng `constructionArea = "100"`, khác loại                    | AO = `"Nhà ở; Công trình xây dựng khác"` (2), AS = `"100"` (1) → lệch cột | AO = 2 phần tử, AS = `"100; 100"` (2) → mọi cột 2 phần tử                            | Test "nhiều tài sản cùng thửa: 9 cột AO–AW giữ đúng số phần tử…" |
| Thửa có 2 tài sản, tài sản thứ 2 để trống `floorArea`                            | AT = `"180"` (1 phần tử) → không biết thuộc tài sản nào                   | AT = `"180; -"` (2 phần tử, đúng vị trí)                                             | cùng test trên                                                   |
| Thửa có **1** tài sản                                                            | Giá trị trần                                                             | Giá trị trần — **không đổi**, không có ký tự giữ chỗ                                 | Test "một tài sản trên thửa: không chèn ký tự giữ chỗ"           |
| Cán bộ sửa >250 trường trong một lần lưu                                         | `changedFieldCount = 250`, không cờ                                      | `changedFieldCount` = số thật, `changedFieldPathsTruncated = true`                   | Test "changedFieldCount đếm trước khi cắt bớt…"                  |
| Cán bộ xóa một thửa đang có tài sản gắn vào                                      | Nút Lưu trả lỗi cấu trúc chung, không chỉ ra ô nào                       | Lưu được; tài sản về trạng thái chưa gắn thửa; `completionChecks` nhắc lúc tiếp nhận | Test "xóa thửa thì gỡ tham chiếu tài sản…"                       |
| `npm run lint`                                                                   | Chết vì hết heap, không báo được lỗi nào                                 | Hoàn thành, 0 error / 5 warning có sẵn                                               | §12                                                              |

## 10. API, data and security impact

### Authentication

- Không thay đổi.

### Authorization

- Không thay đổi. `PUT /api/submissions/:id/working-payload` giữ nguyên điều kiện
  `claimedBy === actor` + status `UNDER_REVIEW`; không đụng `SUBMISSION_READ_ROLES`.

### DataScope

- Không thay đổi. Không thêm/bớt truy vấn nào; không đổi phạm vi bản ghi mà cán bộ đọc/ghi được.

### API contract

- Endpoint: `PUT /api/submissions/:submissionId/working-payload`
- Method: PUT
- Request before / after: **không đổi** (`{ payload: IntakeDraft, expectedVersion, changeNote }`).
- Response before / after: **không đổi**.
- Error handling: **không đổi**. Lưu ý: bản vá mục 4 làm giảm tần suất lỗi
  `VALIDATION_FAILED` do `parcelId` mồ côi, chứ không đổi định dạng lỗi.
- Thay đổi duy nhất có thể quan sát từ ngoài: `audit_logs.metadata` có thêm khóa
  `changedFieldPathsTruncated`, và `changedFieldCount` nay có thể >250. Không có consumer nào trong
  repo đọc hai khóa này (đã grep) nên không phá vỡ hợp đồng nào.

### Database and migrations

- **Migration added: KHÔNG CÓ.** Đợt này không thêm, sửa hay xóa migration nào.
- Tables/columns/indexes affected: không.
- Backfill: không.
- Rollback: chỉ cần revert code.
- **Production action required:** không có thêm ngoài yêu cầu đã có sẵn của PR #7 (áp
  `202607290002_full_pl3_editor.sql` trước khi deploy code).

### Validation and file handling

- Trường bắt buộc: **không đổi**. Không nới, không siết `draftSchema`, `validateWorkingPayloadForSave`
  hay `completionChecks`.
- Quy tắc tên file / giới hạn file / MIME: không đụng.
- Xử lý lỗi: không đổi.

### Sensitive data

- Dữ liệu nhạy cảm bị tác động: **không có dữ liệu mới nào được ghi vào log/audit.**
- `changedFieldPathsTruncated` là boolean, `changedFieldCount` là số nguyên — không phải PII.
- Test hồi quy sẵn có "audit chỉ chứa đường dẫn và lý do, không chứa giá trị CCCD" vẫn pass sau
  thay đổi.
- **Rủi ro PII còn tồn đọng, KHÔNG do đợt này gây ra và CHƯA vá:** ô lý do ghi đè là free text và đi
  thẳng vào `audit_logs.metadata`. Xem §15.

## 11. Tests added or changed

| Test file                       | Test case                                                                | Requirement covered                                | Result |
| ------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- | ------ |
| `tests/pl3-export.test.ts`      | "nhiều tài sản cùng thửa: 9 cột AO–AW giữ đúng số phần tử và đúng thứ tự" | Mục 2 — không bỏ trùng, không bỏ ô rỗng, có warning | PASS   |
| `tests/pl3-export.test.ts`      | "một tài sản trên thửa: không chèn ký tự giữ chỗ"                         | Mục 2 — không hồi quy trường hợp phổ biến nhất      | PASS   |
| `tests/pl3-export.test.ts`      | "cảnh báo của một thửa không lặp theo số đồng sở hữu"                     | Mục 6                                              | PASS   |
| `tests/full-pl3-editor.test.ts` | "changedFieldCount đếm trước khi cắt bớt, kèm cờ truncated"               | Mục 3                                              | PASS   |
| `tests/full-pl3-editor.test.ts` | "dòng tổ chức cũ được di trú F/G trước khi sửa, không mất tên tổ chức"    | Mục 1 — gồm idempotent + dòng cá nhân không bị đụng | PASS   |
| `tests/full-pl3-editor.test.ts` | "xóa thửa thì gỡ tham chiếu tài sản để payload vẫn lưu được"              | Mục 4 — khẳng định cả trạng thái hỏng ở giữa        | PASS   |
| `tests/full-pl3-editor.test.ts` | (mở rộng test UI sẵn có) 2 assertion nối dây component → helper           | Mục 1 + 4 — bù cho việc không có test React         | PASS   |

**Giới hạn đã biết của bộ test này — nêu rõ, không che:**

- Không có test React. Việc `WorkingPayloadEditor` **thật sự gọi** hai helper chỉ được chốt bằng
  assertion nội dung file (`expect(editor).toContain("migrateLegacyOrganisationOwner(owners[index])")`).
  Đây là biện pháp yếu hơn test hành vi: nó phát hiện được việc gỡ bỏ lời gọi, nhưng không phát
  hiện được lỗi logic mới trong component. Kiểm thủ công §14 là bắt buộc.
- 6 test mới đã được xác nhận là test hồi quy thật, không vacuous: với mã trước khi vá, hai test
  của mục 2 sẽ fail (`joined()` cho `"100"` thay vì `"100; 100"`), và test mục 3 sẽ fail typecheck
  vì `changedFieldCount` chưa tồn tại. Test mục 6 đã được kiểm **bằng cách chạy thật**: tạm gỡ
  dedupe → `AssertionError: expected [ …(3) ] to have a length of 1 but got 3`, rồi khôi phục.

## 12. Final verification

| Check             | Command                       | Result                                 | Evidence                                                                          |
| ----------------- | ----------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| Unit tests        | `npm test`                    | **PASS** — 637 pass / 10 skip / 0 fail | `Test Files 67 passed \| 2 skipped (69)`; `Tests 637 passed \| 10 skipped (647)`   |
| Integration tests | —                             | Nằm trong bộ Vitest ở trên             | —                                                                                 |
| E2E tests         | `npm run test:e2e`            | **NOT_RUN**                            | Cần preview deployment + secret; không có trong môi trường này                     |
| Build             | `npm run build`               | **PASS**                               | Next.js build hoàn tất, in đủ bảng route, exit 0                                   |
| Lint              | `npm run lint`                | **PASS** — 0 error / 5 warning         | `✖ 5 problems (0 errors, 5 warnings)`, cả 5 là warning có sẵn ở file ngoài phạm vi |
| Typecheck         | `npm run typecheck`           | **PASS**                               | `tsc --noEmit -p tsconfig.typecheck.json`, exit 0                                  |
| Security check    | `npm run security-review`     | **NOT_RUN**                            | Không có script này trong `package.json`                                           |
| Secret scan       | `git diff --check` + đọc diff | **PASS**                               | Whitespace sạch; diff không chứa key, token, connection string hay dữ liệu thật    |

**So với baseline:** test 631 → 637 (+6, đều là test mới của đợt này, 0 test cũ bị hỏng);
typecheck giữ nguyên PASS; lint từ **crash** → PASS; build không có số liệu baseline để so sánh.

## 13. Acceptance criteria matrix

| ID    | Acceptance criterion                                                                           | Status         | Evidence                                                                      | Notes                                                              |
| ----- | ---------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| AC-01 | Không thứ tự thao tác nào trên dòng tổ chức legacy làm mất tên/mã số tổ chức                    | **PASS**       | Test "dòng tổ chức cũ được di trú F/G…"; `updateOwner` gọi helper ở mọi trường | Đường ghi đã phủ; đường hiển thị không đổi                         |
| AC-02 | Mọi cột trong 9 cột AO–AW có cùng số phần tử theo cùng thứ tự khi thửa có nhiều tài sản         | **PASS**       | Test kiểm trực tiếp bất biến `new Set(assetColumns) === Set([2])`             | Trường hợp 1 tài sản được test riêng để chắc không hồi quy          |
| AC-03 | `changedFieldCount` bằng số trường thật kể cả khi vượt hạn mức, có cờ truncated                 | **PASS**       | Test "changedFieldCount đếm trước khi cắt bớt…"                               | Áp dụng cho cả 2 điểm gọi trong `repository.ts`                     |
| AC-04 | Xóa thửa xong vẫn lưu được bản làm việc                                                         | **PASS**       | Test "xóa thửa thì gỡ tham chiếu tài sản…"                                    | Dữ liệu thiếu vẫn bị `completionChecks` chặn lúc tiếp nhận          |
| AC-05 | `npm run lint` chạy tới cùng và không có error                                                  | **PASS**       | §12                                                                           | 5 warning có sẵn được giữ nguyên có chủ ý                           |
| AC-06 | Không hồi quy: toàn bộ test/typecheck/build sẵn có vẫn đạt                                      | **PASS**       | §12                                                                           | 631 test cũ vẫn pass                                               |
| AC-07 | Không nới lỏng validation, phân quyền hay kiểm tra bảo mật nào                                  | **PASS**       | §10; diff không chạm `validation.ts`, `completion-checks.ts`, route            | —                                                                  |
| AC-08 | Không đụng migration                                                                            | **PASS**       | `git diff --name-status` không có file `supabase/migrations/*`                 | —                                                                  |
| AC-09 | Tài liệu bắt buộc được cập nhật đồng bộ                                                         | **PASS**       | `docs/brain/01-architecture.md`, `03-decisions.md`, `06-ai-working-log.md`     | Theo quy tắc trong `CLAUDE.md`                                      |
| AC-10 | Hành vi UI được xác minh trên trình duyệt thật                                                  | **NOT_TESTED** | —                                                                             | Không có hạ tầng test React; xem §14. **Người dùng phải kiểm tay** |
| AC-11 | Cảnh báo thuộc về một thửa chỉ xuất hiện một lần bất kể số đồng sở hữu                          | **PASS**       | Test "cảnh báo của một thửa không lặp theo số đồng sở hữu"                     | Đã kiểm không vacuous bằng cách tạm gỡ dedupe (§11)                |

## 14. Manual verification required

Đây là phần bắt buộc — AC-10 chưa có bằng chứng.

**Màn hình:** `/submissions/[submissionId]` → tab bàn làm việc biên tập, với hồ sơ đang ở trạng thái
`UNDER_REVIEW` và do chính tài khoản đang đăng nhập giữ (claim).

**Dữ liệu mẫu cần dùng — dùng dữ liệu giả, không dùng hồ sơ dân thật:**

- Một hồ sơ có owner `ownerType = "TO_CHUC"` với `organisationName` và `organisationIdentityNumber`
  **rỗng**, `fullName = "Công ty TNHH Thử Nghiệm"`, `identityNumber = "0100109106"` (mô phỏng bản
  ghi lưu trước migration `202607290002`).
- Một hồ sơ có ≥2 thửa và ≥2 tài sản gắn vào các thửa khác nhau.

**Các bước và kết quả mong đợi:**

1. **Mục 1 — thứ tự thao tác nguy hiểm.** Mở hồ sơ tổ chức legacy. Gõ ngay vào ô
   **"H — Họ tên người đại diện tổ chức"** (chưa chạm F/G).
   → Mong đợi: ô **"F — Tên tổ chức"** lập tức hiện `Công ty TNHH Thử Nghiệm`, ô G hiện
   `0100109106`, ô H chứa đúng ký tự vừa gõ. Lưu → refresh → cả ba ô giữ nguyên.
   → **Đây là kịch bản trước bản vá gây mất dữ liệu.**
2. **Mục 1 — nhánh không di trú.** Vẫn hồ sơ legacy đó (một bản ghi khác, chưa chạm gì), đổi ô
   **"M — Pháp nhân trên GCN"** từ tổ chức sang **Cá nhân**.
   → Mong đợi: `Công ty TNHH Thử Nghiệm` **vẫn nằm ở ô họ tên**, không nhảy sang ô tên tổ chức
   (ô F/G lúc này cũng không còn hiển thị).
3. **Mục 4 — xóa thửa.** Ở hồ sơ nhiều thửa, gán một tài sản vào "Thửa 2", rồi xóa Thửa 2.
   → Mong đợi: ô "Thửa đất liên quan" của tài sản đó về `-- Chọn thửa --`; bấm **Lưu** thành công,
   **không** hiện lỗi đỏ. Sau đó bấm Tiếp nhận → mong đợi bị chặn với thông báo
   "Tài sản thứ N chưa gắn với thửa" (đúng chỗ, đúng lúc).
4. **Mục 2 — xuất PL3.** Gán 2 tài sản vào cùng một thửa, đặt `Diện tích xây dựng` **giống nhau**
   cho cả hai và để trống `Diện tích sàn` của tài sản thứ hai. Lưu, tiếp nhận, rồi
   `POST /api/exports`.
   → Mong đợi trong file xuất: cột AO có 2 phần tử, cột AS là `"100; 100"` (không gộp thành một),
   cột AT là `"180; -"`. Sheet **"Canh bao"** có dòng nhắc thửa có 2 tài sản.

## 15. Remaining issues and warnings

| Severity   | Issue                                                                                                                                                                          | Impact                                                                                                                | Recommended action                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **High**   | Ô lý do ghi đè là free text và đi thẳng vào `audit_logs.metadata` qua `automaticOverrideReasons`. Docstring module lại khẳng định audit không chứa PII.                          | Va chạm quy tắc cứng số 6 trong `CLAUDE.md`. Cán bộ hoàn toàn có thể gõ `"sửa theo GCN của Nguyễn Văn A, CCCD 001…"`.  | **Cần người dùng chốt:** (a) quét `CITIZEN_ID_PATTERN` và từ chối fail-closed, hay (b) chấp nhận là kênh PII có kiểm soát + sửa docstring. Đã ghi vào `03-decisions.md` mục "CHƯA quyết".  |
| **Medium** | `checkAssets` chặn cứng tài sản thiếu `parcelId`, trong khi `pl3-export` cố ý khoan dung với tài sản legacy — hai module lệch giả định.                                          | Bản ghi cũ có tài sản (nếu tồn tại) không tiếp nhận được cho tới khi cán bộ mở bàn biên tập gán lại thửa.              | Rủi ro thực tế thấp: wizard công dân chưa từng thu tài sản nên `draft.assets` gần như luôn rỗng ở dữ liệu cũ. Cần xác nhận trên dữ liệu Preview trước khi deploy.                          |
| **Medium** | 4 cột `ward_admin_code_override*` / `scanned_file_names_override*` trên `public_submissions` được ghi bằng một `UPDATE` riêng nhưng **không có nơi nào SELECT**.                 | Hai statement thừa mỗi lần lưu; hai nguồn sự thật (cột vs JSON payload) có thể lệch nhau về sau.                       | **Cần người dùng chốt:** gộp vào `UPDATE` chính + cho `mapSubmission` đọc ra, hay bỏ khỏi migration. Không tự quyết vì đụng migration đã có preflight.                                     |
| **Medium** | Bỏ `return` ở nhánh tổ chức trong `checkOwner` (thuộc PR #7, không thuộc đợt vá này) khiến owner tổ chức nay phải có đủ họ tên người đại diện + ngày sinh + giới tính + địa chỉ. | Điều kiện tiếp nhận chặt hơn hẳn cho mọi hồ sơ tổ chức đang chờ duyệt. PR body của #7 không nhắc.                      | Đúng theo mô hình mới (H–L là người đại diện) nên không phải bug. Cần đưa vào release note của PR #7.                                                                                      |
| **Low**    | FK `public_assets.parcel_id … on delete set null` cộng thứ tự xóa trong `refreshCanonicalProjection` (parcels trước assets) khiến mỗi lần refresh phải UPDATE toàn bộ hàng asset về NULL rồi mới xóa. | Lãng phí I/O, không sai kết quả.                                                                                      | Đảo thứ tự hai câu lệnh. Không làm trong đợt này để giữ diff hẹp.                                                                                                                         |
| **Low**    | 5 warning `no-unused-vars` có sẵn ở `scripts/add-system-admins.ts`, `tests/staging-rehearsal-scenarios.test.ts`.                                                                | Không ảnh hưởng chạy.                                                                                                 | Dọn trong một PR vệ sinh riêng.                                                                                                                                                          |
| **Low**    | AC-10 chưa có bằng chứng — không có hạ tầng test React trong repo.                                                                                                              | Hành vi UI của mục 1 và 4 chỉ được chốt bằng test hàm thuần + assertion nối dây.                                       | Chạy §14. Cân nhắc thêm `@testing-library/react` + `jsdom` trong một PR riêng.                                                                                                            |

## 16. Regression and compatibility notes

- **Trình duyệt / thiết bị:** không đổi. Không thêm API trình duyệt nào; chỉ đổi hàm xử lý sự kiện.
- **Node/runtime:** không đổi. Node v24.11.0 tại máy kiểm thử.
- **Database:** không đổi — không có migration trong đợt này.
- **API bên ngoài:** không đụng Google Drive, Turnstile hay Supabase client.
- **Backward compatibility — payload:** hoàn toàn tương thích. `migrateLegacyOrganisationOwner` là
  idempotent và chỉ tác động dòng tổ chức chưa có F/G; payload đã ở dạng mới đi qua không đổi.
  `detachAssetsFromMissingParcels` chỉ đụng tài sản có `parcelId` trỏ vào thửa không tồn tại.
- **Backward compatibility — audit:** `audit_logs.metadata` là JSON tự do; thêm khóa không phá vỡ
  bản ghi cũ. Bản ghi audit cũ không có `changedFieldPathsTruncated` — người đọc phải coi thiếu
  khóa là `false`.
- **Excel/PDF/import/export compatibility:** **có thay đổi có thể quan sát.** File PL3 xuất ra của
  hồ sơ có >1 tài sản trên cùng thửa sẽ khác bản trước: nhiều phần tử hơn và có ký tự giữ chỗ `-`.
  Số cột, thứ tự cột và 49 nhãn **không đổi** — `PL3_DATA_COLUMN_COUNT` vẫn được assert trong test.
  Hồ sơ có 0 hoặc 1 tài sản trên mỗi thửa (trường hợp áp đảo) xuất ra **giống hệt** bản trước.

## 17. Rollback plan

- **Cách rollback code:** `git checkout -- .` (chưa commit) hoặc revert commit nếu đã tạo. Không có
  bước nào khác.
- **Cách rollback migration:** không áp dụng — đợt này không có migration.
- **Dữ liệu có cần phục hồi:** không. Không có thao tác ghi dữ liệu nào được thực hiện; không chạy
  script nào chạm database hay Drive.
- **Điều kiện không được rollback tự động:** nếu đã deploy và cán bộ đã sửa dòng tổ chức legacy qua
  giao diện mới, dữ liệu đã ở dạng F/G. Revert code không làm hỏng dữ liệu đó (bản cũ vẫn đọc được
  F/G), nhưng sẽ **mở lại lỗ hổng mất tên tổ chức** cho các dòng legacy chưa được sửa.

## 18. Recommended next action

`READY_FOR_CHATGPT_REVIEW`

Cả 6 mục trong phạm vi đã vá, có test hồi quy và có bằng chứng lệnh chạy thật. Trước khi merge cần:
(1) chạy kiểm thủ công §14 vì AC-10 chưa có bằng chứng; (2) chốt 3 vấn đề ở §15 mà agent cố ý không
tự quyết. Chưa commit và chưa push theo mặc định của repo.

## 19. Commands to reproduce

```bash
npm ci
npm run typecheck
npm test
npm run lint
npm run build
git diff --check
npx vitest run tests/pl3-export.test.ts tests/full-pl3-editor.test.ts
```

## 20. Key diff excerpts

Lỗi mất tên tổ chức (mục 1) — đường ghi trước đây bỏ qua di trú:

```diff
+export function migrateLegacyOrganisationOwner(owner: Owner): Owner {
+  if (!isOrganisationOwner(owner.ownerType)) return owner;
+  if (owner.organisationName?.trim() || owner.organisationIdentityNumber?.trim()) return owner;
+  return {
+    ...owner,
+    organisationName: owner.fullName,
+    organisationIdentityNumber: owner.identityNumber,
+    fullName: "",
+    identityNumber: "",
+  };
+}
```

```diff
   const updateOwner = <TField extends keyof Owner>(index, field, value) => {
     const owners = [...draft.owners];
-    owners[index] = { ...owners[index], [field]: value };
+    owners[index] = { ...migrateLegacyOrganisationOwner(owners[index]), [field]: value };
     onChange({ ...draft, owners });
   };
```

Lệch cột tài sản (mục 2) — bỏ dedup, giữ vị trí:

```diff
-function joined(values: readonly string[]): string {
-  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join("; ");
-}
+export const ASSET_EMPTY_PLACEHOLDER = "-";
+
+function assetColumn(assets: readonly Asset[], pick: (asset: Asset) => string): string {
+  if (assets.length === 0) return "";
+  if (assets.length === 1) return pick(assets[0]).trim();
+  return assets.map((asset) => pick(asset).trim() || ASSET_EMPTY_PLACEHOLDER).join("; ");
+}
```

Audit đếm sai (mục 3):

```diff
   return {
-    changedFieldPaths: changedFieldPaths.slice(0, 250),
+    changedFieldPaths: changedFieldPaths.slice(0, MAX_AUDIT_FIELD_PATHS),
+    changedFieldCount: changedFieldPaths.length,
+    changedFieldPathsTruncated: changedFieldPaths.length > MAX_AUDIT_FIELD_PATHS,
     automaticOverrideReasons,
   };
```

Lint gate (mục 5):

```diff
-  { ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**"] },
+  {
+    ignores: [
+      "**/.next/**",
+      ".claude/**",
+      "node_modules/**",
+      "playwright-report/**",
+      "test-results/**",
+    ],
+  },
```

## 21. Full unified diff

```text
FULL_DIFF_INCLUDED
```

Base: `05f09c35f6a278f6229bce1ecfd3683487c3fb09` (working tree, chưa commit).
Phạm vi: `src/`, `tests/`, `eslint.config.mjs`. Ba file `docs/brain/*` là tài liệu thuần, tóm tắt
ở §8 Phase 6, không nhúng để giữ báo cáo đọc được.

```diff
diff --git a/eslint.config.mjs b/eslint.config.mjs
index 59fb035..8103f3c 100644
--- a/eslint.config.mjs
+++ b/eslint.config.mjs
@@ -4,7 +4,17 @@ import nextTypeScript from "eslint-config-next/typescript";
 const eslintConfig = [
   ...nextCoreWebVitals,
   ...nextTypeScript,
-  { ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**"] },
+  {
+    // `.next/**` chỉ khớp bản build ở gốc repo. Các worktree agent dưới `.claude/` cũng có
+    // `.next/` riêng; quét chúng làm ESLint ăn hết heap và chết trước khi báo được lỗi nào.
+    ignores: [
+      "**/.next/**",
+      ".claude/**",
+      "node_modules/**",
+      "playwright-report/**",
+      "test-results/**",
+    ],
+  },
 ];
 
 export default eslintConfig;
diff --git a/src/components/admin/working-payload-editor.tsx b/src/components/admin/working-payload-editor.tsx
index c2dd5b0..0005432 100644
--- a/src/components/admin/working-payload-editor.tsx
+++ b/src/components/admin/working-payload-editor.tsx
@@ -9,9 +9,11 @@ import {
   WARD_ADMIN_CODE,
 } from "@/modules/public-intake/reference";
 import {
+  detachAssetsFromMissingParcels,
   emptyAsset,
   emptyOwner,
   isOrganisationOwner,
+  migrateLegacyOrganisationOwner,
   OWNER_TYPE_LABELS,
   OWNER_TYPES,
   type Asset,
@@ -110,40 +112,35 @@ export function WorkingPayloadEditor({
 }: WorkingPayloadEditorProps) {
   const [changeNote, setChangeNote] = useState("");
 
+  /**
+   * Mọi thao tác sửa trên một dòng tổ chức cũ phải di trú F/G trước — xem
+   * `migrateLegacyOrganisationOwner`.
+   */
   const updateOwner = <TField extends keyof Owner>(
     index: number,
     field: TField,
     value: Owner[TField],
   ) => {
     const owners = [...draft.owners];
-    owners[index] = { ...owners[index], [field]: value };
+    owners[index] = { ...migrateLegacyOrganisationOwner(owners[index]), [field]: value };
     onChange({ ...draft, owners });
   };
 
-  const updateOrganisation = (
-    index: number,
-    field: "organisationName" | "organisationIdentityNumber",
-    value: string,
-  ) => {
+  /**
+   * Đổi pháp nhân KHÔNG di trú: chuyển một dòng tổ chức cũ về cá nhân nghĩa là cán bộ khẳng định
+   * `fullName` vốn là tên người, nên phải giữ nguyên tại chỗ thay vì đẩy sang ô tên tổ chức.
+   */
+  const updateOwnerType = (index: number, ownerType: Owner["ownerType"]) => {
     const owners = [...draft.owners];
-    const current = owners[index];
-    const legacy = !current.organisationName?.trim() && !current.organisationIdentityNumber?.trim();
-    owners[index] = {
-      ...current,
-      organisationName:
-        field === "organisationName"
-          ? value
-          : current.organisationName || (legacy ? current.fullName : ""),
-      organisationIdentityNumber:
-        field === "organisationIdentityNumber"
-          ? value
-          : current.organisationIdentityNumber || (legacy ? current.identityNumber : ""),
-      fullName: legacy ? "" : current.fullName,
-      identityNumber: legacy ? "" : current.identityNumber,
-    };
+    owners[index] = { ...owners[index], ownerType };
     onChange({ ...draft, owners });
   };
 
+  /** Xóa thửa phải gỡ tham chiếu tài sản — xem `detachAssetsFromMissingParcels`. */
+  const updateParcels = (parcels: Parcel[]) => {
+    onChange({ ...draft, parcels, assets: detachAssetsFromMissingParcels(draft.assets, parcels) });
+  };
+
   const updateAsset = <TField extends keyof Asset>(
     index: number,
     field: TField,
@@ -331,7 +328,7 @@ export function WorkingPayloadEditor({
                       disabled={readOnly}
                       value={owner.ownerType}
                       onChange={(event) =>
-                        updateOwner(index, "ownerType", event.target.value as Owner["ownerType"])
+                        updateOwnerType(index, event.target.value as Owner["ownerType"])
                       }
                       className={inputClass}
                     >
@@ -359,7 +356,7 @@ export function WorkingPayloadEditor({
                             owner.organisationName || (legacyOrganisation ? owner.fullName : "")
                           }
                           onChange={(event) =>
-                            updateOrganisation(index, "organisationName", event.target.value)
+                            updateOwner(index, "organisationName", event.target.value)
                           }
                           className={inputClass}
                         />
@@ -372,11 +369,7 @@ export function WorkingPayloadEditor({
                             (legacyOrganisation ? owner.identityNumber : "")
                           }
                           onChange={(event) =>
-                            updateOrganisation(
-                              index,
-                              "organisationIdentityNumber",
-                              event.target.value,
-                            )
+                            updateOwner(index, "organisationIdentityNumber", event.target.value)
                           }
                           className={inputClass}
                         />
@@ -505,7 +498,7 @@ export function WorkingPayloadEditor({
       <EditableParcelTable
         parcels={draft.parcels}
         readOnly={readOnly}
-        onChange={(parcels: Parcel[]) => onChange({ ...draft, parcels })}
+        onChange={updateParcels}
       />
 
       <Section
diff --git a/src/modules/public-intake/pl3-export.ts b/src/modules/public-intake/pl3-export.ts
index de4822e..c68f59f 100644
--- a/src/modules/public-intake/pl3-export.ts
+++ b/src/modules/public-intake/pl3-export.ts
@@ -33,6 +33,7 @@ import type { SubmissionRecord } from "./repository";
 import {
   isOrganisationOwner,
   OWNER_TYPE_LABELS,
+  type Asset,
   type LandUse,
   type Owner,
   type Parcel,
@@ -244,31 +245,52 @@ function landUseCells(parcel: Parcel, context: string, warnings: string[]): stri
   return cells;
 }
 
-function joined(values: readonly string[]): string {
-  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join("; ");
+/** Ô trống của một tài sản khi thửa có nhiều tài sản — giữ chỗ để 9 cột không lệch nhau. */
+export const ASSET_EMPTY_PLACEHOLDER = "-";
+
+/**
+ * Một cột tài sản của thửa.
+ *
+ * PL3 chỉ có MỘT bộ 9 cột cho mỗi thửa, nên nhiều tài sản trên cùng thửa buộc phải gộp. Gộp thì
+ * bắt buộc mọi cột phải có **cùng số phần tử theo cùng thứ tự**: bỏ trùng hay bỏ ô rỗng sẽ làm
+ * cột này còn 1 giá trị trong khi cột kia còn 2, và người đọc PL3 không còn ghép lại được giá trị
+ * nào thuộc tài sản nào.
+ */
+function assetColumn(assets: readonly Asset[], pick: (asset: Asset) => string): string {
+  if (assets.length === 0) return "";
+  if (assets.length === 1) return pick(assets[0]).trim();
+  return assets.map((asset) => pick(asset).trim() || ASSET_EMPTY_PLACEHOLDER).join("; ");
 }
 
 /** Cột AO–AW. Tài sản legacy chưa có `parcelId` được giữ cho mọi thửa để không mất dữ liệu. */
-function assetCells(record: SubmissionRecord, parcel: Parcel, warnings: string[]): string[] {
+function assetCells(
+  record: SubmissionRecord,
+  parcel: Parcel,
+  context: string,
+  warnings: string[],
+): string[] {
   const assets = (record.draft?.assets ?? []).filter(
     (asset) => !asset.parcelId || asset.parcelId === parcel.id,
   );
+  if (assets.length > 1) {
+    warnings.push(
+      `${context}: thửa có ${assets.length} tài sản nhưng PL3 chỉ có một bộ cột AO–AW; các giá trị được gộp bằng "; " theo đúng thứ tự tài sản, ô trống ghi "${ASSET_EMPTY_PLACEHOLDER}".`,
+    );
+  }
   return [
-    joined(
-      assets.map((asset) =>
-        asset.assetType.trim()
-          ? labelOf(ASSET_TYPE_OPTIONS, asset.assetType, "Tài sản", warnings)
-          : "",
-      ),
+    assetColumn(assets, (asset) =>
+      asset.assetType.trim()
+        ? labelOf(ASSET_TYPE_OPTIONS, asset.assetType, "Tài sản", warnings)
+        : "",
     ),
-    joined(assets.map((asset) => asset.mixedUseBuildingName ?? "")),
-    joined(assets.map((asset) => asset.apartmentBuildingName ?? "")),
-    joined(assets.map((asset) => asset.apartmentNumber ?? "")),
-    joined(assets.map((asset) => asset.constructionArea ?? "")),
-    joined(assets.map((asset) => asset.floorArea ?? "")),
-    joined(assets.map((asset) => asset.ownershipForm ?? "")),
-    joined(assets.map((asset) => asset.ownershipTerm ?? "")),
-    joined(assets.map((asset) => asset.grade ?? "")),
+    assetColumn(assets, (asset) => asset.mixedUseBuildingName ?? ""),
+    assetColumn(assets, (asset) => asset.apartmentBuildingName ?? ""),
+    assetColumn(assets, (asset) => asset.apartmentNumber ?? ""),
+    assetColumn(assets, (asset) => asset.constructionArea ?? ""),
+    assetColumn(assets, (asset) => asset.floorArea ?? ""),
+    assetColumn(assets, (asset) => asset.ownershipForm ?? ""),
+    assetColumn(assets, (asset) => asset.ownershipTerm ?? ""),
+    assetColumn(assets, (asset) => asset.grade ?? ""),
   ];
 }
 
@@ -337,7 +359,7 @@ function buildRow(
     parcel.addressOnCertificate.trim(), // 23 địa chỉ thửa
     parcel.area.trim(), // 24 diện tích thửa
     ...landUseCells(parcel, parcelContext, warnings), // 25–39
-    ...assetCells(record, parcel, warnings), // AO–AW / trường 40–48
+    ...assetCells(record, parcel, parcelContext, warnings), // AO–AW / trường 40–48
     record.draft?.scannedFileNamesOverride?.trim() ||
       scannedFileNames(certificate.issueNumber, record.fileSummaries), // AX / trường 49
   ];
@@ -367,7 +389,10 @@ export function buildSubmissionRows(record: SubmissionRecord): Pl3BuildResult {
       rows.push(row);
     });
   });
-  return { rows, warnings };
+  // `buildRow` chạy mỗi cặp (thửa × chủ), nên cảnh báo thuộc về *thửa* — mã lạ, ghi đè trường
+  // tự động, thừa mục đích sử dụng, nhiều tài sản — bị lặp đúng bằng số đồng sở hữu. Chuỗi trùng
+  // khít nhau không mang thêm thông tin gì; giữ thứ tự xuất hiện đầu tiên.
+  return { rows, warnings: Array.from(new Set(warnings)) };
 }
 
 export interface Pl3ExportContent {
diff --git a/src/modules/public-intake/repository.ts b/src/modules/public-intake/repository.ts
index f01db7d..8793c9c 100644
--- a/src/modules/public-intake/repository.ts
+++ b/src/modules/public-intake/repository.ts
@@ -1058,12 +1058,15 @@ export class PublicIntakeRepository {
               appliedFieldPaths: input.aiApplication.appliedFieldPaths.join(","),
               changeNote: input.changeNote || "",
               changedFieldPaths: auditSummary.changedFieldPaths.join(","),
+              changedFieldCount: auditSummary.changedFieldCount,
+              changedFieldPathsTruncated: auditSummary.changedFieldPathsTruncated,
               automaticOverrideReasons: JSON.stringify(auditSummary.automaticOverrideReasons),
             }
           : {
               changeNote: input.changeNote || "",
               changedFieldPaths: auditSummary.changedFieldPaths.join(","),
-              changedFieldCount: auditSummary.changedFieldPaths.length,
+              changedFieldCount: auditSummary.changedFieldCount,
+              changedFieldPathsTruncated: auditSummary.changedFieldPathsTruncated,
               automaticOverrideReasons: JSON.stringify(auditSummary.automaticOverrideReasons),
             },
       });
@@ -1207,7 +1210,8 @@ export class PublicIntakeRepository {
           officialCaseId: next.officialCaseId,
           amendmentReason: input.amendmentReason,
           changedFieldPaths: auditSummary.changedFieldPaths.join(","),
-          changedFieldCount: auditSummary.changedFieldPaths.length,
+          changedFieldCount: auditSummary.changedFieldCount,
+          changedFieldPathsTruncated: auditSummary.changedFieldPathsTruncated,
           automaticOverrideReasons: JSON.stringify(auditSummary.automaticOverrideReasons),
           ownerCount: counts.ownerCount,
           parcelCount: counts.parcelCount,
diff --git a/src/modules/public-intake/types.ts b/src/modules/public-intake/types.ts
index 09e7d77..3d389a5 100644
--- a/src/modules/public-intake/types.ts
+++ b/src/modules/public-intake/types.ts
@@ -285,6 +285,45 @@ export function emptyAsset(id: string, parcelId = ""): Asset {
   };
 }
 
+/**
+ * Dòng tổ chức lưu trước migration 202607290002 giữ tên và mã số tổ chức trong `fullName`/
+ * `identityNumber`. Bàn biên tập đầy đủ dùng đúng hai ô đó cho **người đại diện** (cột H/K), nên
+ * dữ liệu cũ phải được chuyển sang `organisationName`/`organisationIdentityNumber` (cột F/G)
+ * trước lần sửa đầu tiên — bỏ bước này thì cán bộ gõ tên người đại diện vào ô H sẽ ghi đè mất tên
+ * tổ chức, không có cảnh báo và không khôi phục được.
+ *
+ * Hàm này idempotent: dòng đã có F/G, hoặc dòng cá nhân, đều trả về nguyên trạng.
+ */
+export function migrateLegacyOrganisationOwner(owner: Owner): Owner {
+  if (!isOrganisationOwner(owner.ownerType)) return owner;
+  if (owner.organisationName?.trim() || owner.organisationIdentityNumber?.trim()) return owner;
+  return {
+    ...owner,
+    organisationName: owner.fullName,
+    organisationIdentityNumber: owner.identityNumber,
+    fullName: "",
+    identityNumber: "",
+  };
+}
+
+/**
+ * Gỡ `parcelId` của tài sản trỏ tới thửa không còn tồn tại.
+ *
+ * `draftSchema` từ chối payload có `asset.parcelId` mồ côi, và lỗi đó tới cán bộ dưới dạng lỗi cấu
+ * trúc chung không chỉ ra được ô nào — nên xóa thửa mà không gỡ tham chiếu sẽ làm nút Lưu hỏng
+ * theo cách không giải thích được. Để rỗng thì lưu được, còn `completionChecks` vẫn chặn lúc tiếp
+ * nhận kèm thông báo đúng chỗ.
+ */
+export function detachAssetsFromMissingParcels(
+  assets: readonly Asset[],
+  parcels: readonly Parcel[],
+): Asset[] {
+  const parcelIds = new Set(parcels.map((parcel) => parcel.id));
+  return assets.map((asset) =>
+    asset.parcelId && !parcelIds.has(asset.parcelId) ? { ...asset, parcelId: "" } : asset,
+  );
+}
+
 export function emptyDraft(ownerId: string, parcelId: string, landUseId: string): IntakeDraft {
   return {
     certificate: { issueNumber: "", issueDate: "", registryNumber: "" },
diff --git a/src/modules/public-intake/working-payload-audit.ts b/src/modules/public-intake/working-payload-audit.ts
index efce5a1..953d212 100644
--- a/src/modules/public-intake/working-payload-audit.ts
+++ b/src/modules/public-intake/working-payload-audit.ts
@@ -1,7 +1,16 @@
 import type { IntakeDraft } from "./types";
 
+/**
+ * Audit không cần liệt kê hết đường dẫn khi cán bộ sửa cả hồ sơ, nhưng *số lượng* thì phải đúng —
+ * đó là con số duy nhất cho biết một lần lưu chạm vào bao nhiêu trường.
+ */
+export const MAX_AUDIT_FIELD_PATHS = 250;
+
 export interface WorkingPayloadAuditSummary {
   readonly changedFieldPaths: readonly string[];
+  /** Tổng số trường đã đổi, đếm TRƯỚC khi cắt bớt `changedFieldPaths`. */
+  readonly changedFieldCount: number;
+  readonly changedFieldPathsTruncated: boolean;
   readonly automaticOverrideReasons: readonly {
     fieldPath: string;
     reason: string;
@@ -76,7 +85,9 @@ export function summarizeWorkingPayloadChanges(
   });
 
   return {
-    changedFieldPaths: changedFieldPaths.slice(0, 250),
+    changedFieldPaths: changedFieldPaths.slice(0, MAX_AUDIT_FIELD_PATHS),
+    changedFieldCount: changedFieldPaths.length,
+    changedFieldPathsTruncated: changedFieldPaths.length > MAX_AUDIT_FIELD_PATHS,
     automaticOverrideReasons,
   };
 }
diff --git a/tests/full-pl3-editor.test.ts b/tests/full-pl3-editor.test.ts
index e56fb73..125c369 100644
--- a/tests/full-pl3-editor.test.ts
+++ b/tests/full-pl3-editor.test.ts
@@ -4,11 +4,17 @@ import path from "node:path";
 import { describe, expect, it } from "vitest";
 
 import { draftSchema, validateWorkingPayloadForSave } from "@/modules/public-intake/validation";
-import { summarizeWorkingPayloadChanges } from "@/modules/public-intake/working-payload-audit";
 import {
+  MAX_AUDIT_FIELD_PATHS,
+  summarizeWorkingPayloadChanges,
+} from "@/modules/public-intake/working-payload-audit";
+import {
+  detachAssetsFromMissingParcels,
   emptyAsset,
   emptyDraft,
   emptyOwner,
+  emptyParcel,
+  migrateLegacyOrganisationOwner,
   type IntakeDraft,
 } from "@/modules/public-intake/types";
 
@@ -85,6 +91,64 @@ describe("full PL3 working payload", () => {
     expect(summary.automaticOverrideReasons).toHaveLength(3);
   });
 
+  it("changedFieldCount đếm trước khi cắt bớt, kèm cờ truncated", () => {
+    const previous = fullDraft();
+    const next = structuredClone(previous);
+    // Nhiều trường hơn hạn mức audit để buộc nhánh cắt bớt chạy.
+    next.parcels = Array.from({ length: MAX_AUDIT_FIELD_PATHS + 20 }, (_, index) => ({
+      ...emptyParcel(`parcel-extra-${index}`, `land-use-extra-${index}`),
+      parcelNumber: String(index),
+    }));
+
+    const summary = summarizeWorkingPayloadChanges(previous, next);
+    expect(summary.changedFieldPaths).toHaveLength(MAX_AUDIT_FIELD_PATHS);
+    expect(summary.changedFieldCount).toBeGreaterThan(MAX_AUDIT_FIELD_PATHS);
+    expect(summary.changedFieldPathsTruncated).toBe(true);
+  });
+
+  it("dòng tổ chức cũ được di trú F/G trước khi sửa, không mất tên tổ chức", () => {
+    // Bản ghi lưu trước migration 202607290002: tên tổ chức nằm trong fullName.
+    const legacy = {
+      ...emptyOwner("owner-legacy"),
+      ownerType: "TO_CHUC" as const,
+      fullName: "Công ty Phong Châu",
+      identityNumber: "0100109106",
+    };
+
+    const migrated = migrateLegacyOrganisationOwner(legacy);
+    expect(migrated.organisationName).toBe("Công ty Phong Châu");
+    expect(migrated.organisationIdentityNumber).toBe("0100109106");
+    // Ô H/K được giải phóng cho người đại diện, tên tổ chức không bị ghi đè.
+    expect(migrated.fullName).toBe("");
+    expect(migrated.identityNumber).toBe("");
+
+    // Idempotent: chạy lại trên dòng đã di trú không làm mất F/G.
+    expect(migrateLegacyOrganisationOwner(migrated)).toEqual(migrated);
+    // Dòng cá nhân không bị đụng tới.
+    const person = { ...emptyOwner("owner-person"), fullName: "Trần Thị B" };
+    expect(migrateLegacyOrganisationOwner(person)).toEqual(person);
+  });
+
+  it("xóa thửa thì gỡ tham chiếu tài sản để payload vẫn lưu được", () => {
+    const draft = fullDraft();
+    draft.assets.push({ ...emptyAsset("asset-2", "parcel-2"), assetType: "CONG_TRINH" });
+    draft.parcels.push(emptyParcel("parcel-2", "land-use-2"));
+    expect(draftSchema.safeParse(draft).success).toBe(true);
+
+    const remaining = draft.parcels.filter((parcel) => parcel.id !== "parcel-2");
+    const orphaned = { ...draft, parcels: remaining };
+    expect(draftSchema.safeParse(orphaned).success).toBe(false);
+
+    const reconciled = {
+      ...draft,
+      parcels: remaining,
+      assets: detachAssetsFromMissingParcels(draft.assets, remaining),
+    };
+    expect(draftSchema.safeParse(reconciled).success).toBe(true);
+    expect(reconciled.assets[0].parcelId).toBe("parcel-1");
+    expect(reconciled.assets[1].parcelId).toBe("");
+  });
+
   it("migration bổ sung đầy đủ cột normalized cho owner/parcel/asset và payload chính thức", () => {
     const migration = fs.readFileSync(
       path.join(process.cwd(), "supabase/migrations/202607290002_full_pl3_editor.sql"),
@@ -126,6 +190,10 @@ describe("full PL3 working payload", () => {
       "+ Thêm tài sản",
       "AO — Loại tài sản gắn liền với đất",
       "AW — Cấp hạng",
+      // Hai đường dẫn ghi phải đi qua helper thuần, nếu không dòng tổ chức cũ mất tên tổ chức và
+      // xóa thửa làm hỏng nút Lưu. Không có hạ tầng test React nên chốt bằng nối dây.
+      "migrateLegacyOrganisationOwner(owners[index])",
+      "detachAssetsFromMissingParcels(draft.assets, parcels)",
     ]) {
       expect(editor).toContain(text);
     }
diff --git a/tests/pl3-export.test.ts b/tests/pl3-export.test.ts
index 5c5fd43..dad31ee 100644
--- a/tests/pl3-export.test.ts
+++ b/tests/pl3-export.test.ts
@@ -1,6 +1,7 @@
 import { describe, expect, it } from "vitest";
 
 import {
+  ASSET_EMPTY_PLACEHOLDER,
   buildPl3Content,
   buildSubmissionRows,
   formatExportDate,
@@ -610,6 +611,90 @@ describe("buildSubmissionRows — nổ dòng và ánh xạ nhãn", () => {
     expect(built.warnings.some((w) => w.includes("đối chiếu"))).toBe(true);
   });
 
+  it("nhiều tài sản cùng thửa: 9 cột AO–AW giữ đúng số phần tử và đúng thứ tự", () => {
+    const target = parcel({ id: "par_multi" });
+    // Hai tài sản trùng diện tích xây dựng và trùng ô rỗng — đúng các trường hợp mà bỏ trùng hoặc
+    // bỏ ô rỗng sẽ làm cột này còn 1 giá trị trong khi cột kia còn 2.
+    const first = {
+      ...emptyAsset("asset_a", target.id),
+      assetType: "NHA_O",
+      constructionArea: "100",
+      floorArea: "180",
+      grade: "Cấp II",
+    };
+    const second = {
+      ...emptyAsset("asset_b", target.id),
+      assetType: "CONG_TRINH",
+      constructionArea: "100",
+      floorArea: "",
+      grade: "",
+    };
+
+    const built = buildSubmissionRows(
+      record("ACCEPTED", draft({ parcels: [target], assets: [first, second] })),
+    );
+    const [row] = built.rows;
+
+    expect(row[COL.assetType]).toBe("Nhà ở; Công trình xây dựng khác");
+    // Trùng giá trị KHÔNG bị gộp lại thành một phần tử.
+    expect(row[COL.constructionArea]).toBe("100; 100");
+    // Ô rỗng giữ chỗ nên vị trí thứ 2 vẫn là của asset_b.
+    expect(row[COL.floorArea]).toBe(`180; ${ASSET_EMPTY_PLACEHOLDER}`);
+    expect(row[COL.grade]).toBe(`Cấp II; ${ASSET_EMPTY_PLACEHOLDER}`);
+
+    // Bất biến thật sự cần giữ: mọi cột tài sản có cùng số phần tử để ghép lại được.
+    const assetColumns = [
+      COL.assetType,
+      COL.mixedUseBuilding,
+      COL.apartmentBuilding,
+      COL.apartmentNumber,
+      COL.constructionArea,
+      COL.floorArea,
+      COL.ownershipForm,
+      COL.ownershipTerm,
+      COL.grade,
+    ].map((index) => row[index].split("; ").length);
+    expect(new Set(assetColumns)).toEqual(new Set([2]));
+
+    expect(built.warnings.some((warning) => warning.includes("2 tài sản"))).toBe(true);
+  });
+
+  it("cảnh báo của một thửa không lặp theo số đồng sở hữu", () => {
+    const target = parcel({ id: "par_shared" });
+    const assets = [
+      { ...emptyAsset("asset_x", target.id), assetType: "NHA_O" },
+      { ...emptyAsset("asset_y", target.id), assetType: "CONG_TRINH" },
+    ];
+    const owners = [
+      owner({ id: "own_a", fullName: "Nguyễn Văn A" }),
+      owner({ id: "own_b", fullName: "Trần Thị B" }),
+      owner({ id: "own_c", fullName: "Lê Văn C" }),
+    ];
+
+    const built = buildSubmissionRows(
+      record("ACCEPTED", draft({ owners, parcels: [target], assets })),
+    );
+    // 3 chủ × 1 thửa = 3 dòng, nhưng cảnh báo về thửa chỉ được nói một lần.
+    expect(built.rows).toHaveLength(3);
+    expect(built.warnings.filter((warning) => warning.includes("2 tài sản"))).toHaveLength(1);
+    expect(new Set(built.warnings).size).toBe(built.warnings.length);
+  });
+
+  it("một tài sản trên thửa: không chèn ký tự giữ chỗ", () => {
+    const target = parcel({ id: "par_single" });
+    const [row] = buildSubmissionRows(
+      record(
+        "ACCEPTED",
+        draft({
+          parcels: [target],
+          assets: [{ ...emptyAsset("asset_only", target.id), assetType: "NHA_O" }],
+        }),
+      ),
+    ).rows;
+    expect(row[COL.assetType]).toBe("Nhà ở");
+    expect(row[COL.floorArea]).toBe("");
+  });
+
   it("thiếu thửa hoặc chủ sử dụng: không sinh dòng, có cảnh báo", () => {
     expect(buildSubmissionRows(record("ACCEPTED", draft({ parcels: [] }))).rows).toHaveLength(0);
     expect(buildSubmissionRows(record("ACCEPTED", null)).warnings.length).toBeGreaterThan(0);
```

## 22. Agent declaration

Agent xác nhận:

- Đã đọc `CLAUDE.md`, `AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md`, `docs/brain/01-architecture.md` và
  các phần liên quan của `docs/brain/` trước khi sửa code.
- Không tự mở rộng phạm vi ngoài 6 mục người dùng chấp thuận (5 mục review + 1 mục phát sinh được người dùng đồng ý sửa). Sai lệch duy nhất — tách hai hàm
  thuần để test được — đã nêu tại §5.
- Không có thay đổi nào của người dùng để ghi đè (`git status` trống ở baseline). Bản
  `CHATGPT_HANDOFF.md` cũ đã được lưu sang `docs/handoffs/` trước khi ghi đè.
- Không đưa secret, dữ liệu cá nhân hay dữ liệu nghiệp vụ thật vào báo cáo.
- Không commit, không merge, không push, không deploy.
- Kết quả test/build/lint/typecheck tại §4 và §12 được ghi đúng theo lệnh thực tế đã chạy trong
  phiên này, kèm output thật.
- Các nội dung chưa xác minh được đánh dấu rõ: E2E `NOT_RUN`, security-review `NOT_RUN` (không có
  script), AC-10 `NOT_TESTED`, và giới hạn của assertion nối dây nêu tại §11.
