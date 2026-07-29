# CHATGPT HANDOFF REPORT

## 1. Report metadata

- Project: Hệ thống thu thập và kiểm tra nhanh hồ sơ đất đai Phường Phong Châu (`land-ocr-180`)
- Repository path: `D:\04. Github\capphongchau`
- Generated at: 2026-07-29 13:35 +07:00
- Agent: Claude Code
- Task: Thi hành 4 quyết định nghiệp vụ người dùng chốt cho PR #7, kiểm thử tự động + kiểm tra giao diện 4 tình huống
- Status: `READY_FOR_REVIEW`
- Source plan: 4 quyết định người dùng chốt trực tiếp trong hội thoại (nguyên văn tóm tắt ở §6)
- Source acceptance criteria: từng quyết định phải có bằng chứng đã thi hành; AC-10 của đợt trước phải hết trạng thái `NOT_TESTED`
- Source security constraints: `CLAUDE.md` §Quy tắc cứng (đặc biệt số 6 — PII trong log); `docs/brain/02-coding-rules.md`

**Quan hệ với đợt trước:** đây là đợt thi công thứ hai trên cùng nhánh. Đợt một (commit `532c369`,
đã push) vá 6 phát hiện review và để lại 3 mục "CHƯA quyết" + AC-10 chưa xác minh. Đợt này chốt và
thi hành cả 4, đồng thời lấp khoảng trống AC-10. Báo cáo đợt một lưu tại
`docs/handoffs/2026-07-29_pr7-full-pl3-editor_CHATGPT_HANDOFF.md` (bản Codex) — báo cáo đợt một của
Claude Code nằm trong lịch sử git tại `532c369`.

## 2. Git identity

- Current branch: `docs/agent-handoff-protocol`
- Remote: `origin https://github.com/vi-phuong-158/capphongchau.git`
- Base commit before work: `532c36935ff89d679c6b7b2d66413cec866e8168`
- Head commit after work: xem §2.1 (commit tạo ở cuối đợt)
- Working tree state trước khi bắt đầu: **sạch** (`git status --short` trống)
- User changes detected before work: không có
- User changes preserved: không áp dụng

### Git status (đã stage toàn bộ trước khi commit)

```text
M  docs/brain/01-architecture.md
M  docs/brain/03-decisions.md
M  docs/brain/06-ai-working-log.md
M  evidence/PUBLIC_INTAKE_V2_RELEASE_CHECKLIST.md
M  scripts/preflight-public-intake-v2-migrations.ts
M  src/components/admin/editable-parcel-table.tsx
M  src/components/admin/working-payload-editor.tsx
M  src/modules/public-intake/repository.ts
M  src/modules/public-intake/validation.ts
M  src/modules/submissions/completion-checks.ts
A  supabase/migrations/202607290003_drop_working_payload_override_columns.sql
M  tests/completion-checks.test.ts
M  tests/full-pl3-editor.test.ts
```

**Không có file rác nào lọt vào:** trang harness kiểm tra giao diện
(`src/app/dev-harness/page.tsx`) và file test tạm (`tests/__scenario4.tmp.test.ts`) đã bị xóa;
`.claude/launch.json` (gitignored) đã khôi phục nguyên trạng; `next-env.d.ts` do dev server sinh lại
đã hoàn nguyên.

### Diff statistics

```text
 docs/brain/01-architecture.md                      | 16 +++--
 docs/brain/03-decisions.md                         | 46 ++++++++++---
 docs/brain/06-ai-working-log.md                    | 34 ++++++++++
 evidence/PUBLIC_INTAKE_V2_RELEASE_CHECKLIST.md     | 78 ++++++++++++++++++++++
 scripts/preflight-public-intake-v2-migrations.ts   | 26 ++++++--
 src/components/admin/editable-parcel-table.tsx     |  2 +-
 src/components/admin/working-payload-editor.tsx    |  4 +-
 src/modules/public-intake/repository.ts            | 16 -----
 src/modules/public-intake/validation.ts            | 31 +++++++++
 src/modules/submissions/completion-checks.ts       | 31 ++++++++-
 ...90003_drop_working_payload_override_columns.sql | 17 +++++
 tests/completion-checks.test.ts                    | 39 +++++++++++
 tests/full-pl3-editor.test.ts                      | 46 ++++++++++++-
 13 files changed, 346 insertions(+), 40 deletions(-)
```

## 3. Executive summary

**Vấn đề:** đợt trước để lại 3 quyết định nghiệp vụ agent cố ý không tự quyết, cộng một tiêu chí
(AC-10 — hành vi giao diện) chưa có bằng chứng. Người dùng đã chốt cả 4 quyết định.

**Đã thực hiện:**

1. **PII** — ô lý do ghi đè bị từ chối lưu khi chứa mẫu CCCD, chặn ở hai cửa, dùng chung định nghĩa
   "giống CCCD" với đường AI extraction. Hint trên giao diện hướng dẫn ghi lý do nghiệp vụ ngắn.
2. **Tài sản chưa gắn thửa** — giữ "lưu được, chặn khi tiếp nhận"; thông báo nay gọi đúng tên tài sản.
3. **Một nguồn sự thật** — gỡ hẳn 4 cột ghi đè song song khỏi `public_submissions`; migration mới
   idempotent, không sửa migration đã chạy; preflight kiểm hai chiều.
4. **Người đại diện tổ chức** — giữ nguyên yêu cầu, viết release note 6 mục.

**Lấp khoảng trống AC-10:** dựng trang harness tạm render đúng `WorkingPayloadEditor` thật, thao tác
bằng chuột/bàn phím qua trình duyệt. **4/4 tình huống PASS**, có số liệu trạng thái thật ở §14.
Harness đã xóa, không nằm trong commit.

**Kết quả:** test 637 → 642 pass, typecheck/lint/build đạt.

**Trạng thái đề xuất:** `READY_FOR_REVIEW`.

## 4. Baseline before changes

Đo tại commit `532c369`, working tree sạch.

| Check             | Command             | Result                         | Evidence                                                                        |
| ----------------- | ------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| Unit tests        | `npm test`          | PASS — 637 pass / 10 skip      | `Test Files 67 passed \| 2 skipped (69)`; `Tests 637 passed \| 10 skipped (647)` |
| Integration tests | —                   | Nằm trong bộ Vitest ở trên     | —                                                                               |
| E2E tests         | `npm run test:e2e`  | **NOT_RUN**                    | Cần preview deployment + secret                                                  |
| Build             | `npm run build`     | PASS                           | exit 0                                                                          |
| Lint              | `npm run lint`      | PASS — 0 error / 5 warning     | 5 warning có sẵn ở file ngoài phạm vi                                            |
| Typecheck         | `npm run typecheck` | PASS                           | exit 0                                                                          |

**Lỗi tồn tại từ trước:** 5 warning `no-unused-vars` ở `scripts/add-system-admins.ts` và
`tests/staging-rehearsal-scenarios.test.ts` — không thuộc phạm vi, giữ nguyên có chủ ý.

## 5. Scope

### In scope

- 4 quyết định nghiệp vụ người dùng chốt.
- Test hồi quy cho quyết định 1 và 2.
- Kiểm tra giao diện 4 tình huống (§14).
- Cập nhật `docs/brain/{01,03,06}` và release note trong `evidence/`.

### Out of scope

- Không sửa `202607290002_full_pl3_editor.sql` (có thể đã chạy ở local/preview).
- Không đổi hành vi `checkOwner` với hồ sơ tổ chức (quyết định 4 là GIỮ NGUYÊN).
- Không sửa 5 warning lint có sẵn.
- Không chạy E2E, không áp migration lên môi trường nào.

### Deviations from approved plan

- **Không có sai lệch về phạm vi.** Một lựa chọn cần nêu rõ: quyết định 1 được thi hành ở **hai**
  cửa (lưu + tiếp nhận) thay vì chỉ "từ chối lưu" như câu chữ yêu cầu. Lý do ở §8 Phase 1 — chỉ chặn
  lúc lưu thì bản ghi đã lưu trước khi có luật vẫn đưa chuỗi PII vào audit của lần tiếp nhận. Không
  tạo thế bí vì đường lưu đã sạch nên cán bộ luôn sửa được.

## 6. Decisions implemented

| Quyết định (người dùng chốt)                                                                                              | Implementation                                                                                                                     | Evidence                                                              |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| "Ô lý do ghi đè không được chứa CCCD… bổ sung kiểm tra và từ chối lưu… hướng dẫn cán bộ chỉ ghi lý do nghiệp vụ ngắn"        | `overrideReasonsWithCitizenIdLike()` + chặn ở `validateWorkingPayloadForSave` và `checkAutomaticOverrides`; hint mới trên 3 ô lý do   | §8 Phase 1; test PII; §14 tình huống 5; `03-decisions.md`             |
| "Tài sản chưa gắn thửa được phép lưu… nhưng phải bị chặn khi tiếp nhận, kèm thông báo rõ tài sản nào"                        | Hành vi lưu giữ nguyên; thêm `assetLabel()` để thông báo gọi tên tài sản và chỉ ra ô cần sửa                                          | §8 Phase 2; test `CC-ASSET`; §14 tình huống 3                        |
| "Dùng working_payload làm nguồn sự thật duy nhất… không duy trì hai nguồn song song… không sửa migration đã chạy"            | Gỡ 2 khối UPDATE khỏi `repository.ts`; migration mới `202607290003` `drop column if exists`; preflight kiểm hai chiều                 | §8 Phase 3; `03-decisions.md`; nội dung migration ở §20               |
| "Giữ yêu cầu người đại diện tổ chức phải đủ họ tên, ngày sinh, giới tính và địa chỉ… bổ sung release note"                   | Không sửa code (hành vi đã đúng); release note 6 mục ở `evidence/PUBLIC_INTAKE_V2_RELEASE_CHECKLIST.md` §7                            | §8 Phase 4; `03-decisions.md`                                        |

## 7. Changed files

| File                                                              | Change type | Symbols/routes/components affected                                                        | Purpose                                                                | Risk                                                                    |
| ----------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/modules/public-intake/validation.ts`                         | Modified    | **thêm** `overrideReasonsWithCitizenIdLike()`; `validateWorkingPayloadForSave()`           | Chặn PII lúc lưu                                                       | Thấp. Chỉ siết thêm, không nới bất kỳ luật nào                          |
| `src/modules/submissions/completion-checks.ts`                    | Modified    | **thêm** `assetLabel()`; `checkAssets()`, `checkAutomaticOverrides()`                      | Chặn PII lúc tiếp nhận + thông báo tài sản rõ ràng                     | **Trung bình.** Thêm một mã chặn mới ở cửa tiếp nhận                     |
| `src/modules/public-intake/repository.ts`                         | Modified    | `commitWorkingPayload()`, `commitOfficialAmendment()` — gỡ 2 khối `UPDATE`                 | Bỏ nguồn dữ liệu song song                                             | Thấp. Gỡ ghi vào cột không ai đọc; ít hơn 2 statement mỗi lần lưu        |
| `supabase/migrations/202607290003_...sql`                         | **Added**   | `public_submissions` — drop 4 cột                                                          | Thi hành "một nguồn sự thật" ở tầng schema                             | **Trung bình.** DDL huỷ cột — xem phân tích an toàn dữ liệu ở §10        |
| `scripts/preflight-public-intake-v2-migrations.ts`                | Modified    | `runChecks()` — bỏ 4 cột khỏi danh sách bắt buộc, thêm khối kiểm tra ngược                 | Preflight phải phản ánh trạng thái schema mới                          | Thấp                                                                    |
| `src/components/admin/working-payload-editor.tsx`                 | Modified    | hint của 2 ô lý do (cột B, cột AX)                                                         | Hướng dẫn cán bộ ghi lý do ngắn, cảnh báo trước khi bị từ chối          | Không                                                                   |
| `src/components/admin/editable-parcel-table.tsx`                  | Modified    | hint của ô lý do cột V                                                                     | Như trên                                                               | Không                                                                   |
| `tests/full-pl3-editor.test.ts`                                   | Modified    | +3 test PII                                                                                | Hồi quy quyết định 1                                                   | Không                                                                   |
| `tests/completion-checks.test.ts`                                 | Modified    | +2 test (`CC-ASSET`, `CC-PII`)                                                             | Hồi quy quyết định 1 và 2 ở cửa tiếp nhận                              | Không                                                                   |
| `evidence/PUBLIC_INTAKE_V2_RELEASE_CHECKLIST.md`                  | Modified    | **thêm §7** — release note 6 mục                                                           | Thi hành quyết định 4                                                  | Không                                                                   |
| `docs/brain/01-architecture.md`                                   | Modified    | Code Graph: nhánh `commitWorkingPayload`, danh sách migration                              | Code Graph lỗi thời nguy hiểm hơn không có                             | Không                                                                   |
| `docs/brain/03-decisions.md`                                      | Modified    | **gỡ** mục "CHƯA quyết", **thêm** 3 quyết định đã chốt                                     | Không để tài liệu còn treo câu hỏi đã có đáp án                        | Không                                                                   |
| `docs/brain/06-ai-working-log.md`                                 | Modified    | +1 entry                                                                                   | Bắt buộc theo `CLAUDE.md`                                              | Không                                                                   |

## 8. Detailed implementation by phase

### Phase 1 — Ô lý do ghi đè không được chứa CCCD (quyết định 1)

- **Mục tiêu:** không có đường nào đưa số định danh cá nhân vào `audit_logs.metadata` qua ô lý do.
- **File:** `src/modules/public-intake/validation.ts`, `src/modules/submissions/completion-checks.ts`,
  `src/components/admin/{working-payload-editor,editable-parcel-table}.tsx`.
- **Đã làm:**
  - `overrideReasonsWithCitizenIdLike(draft)` trả về **tên các ô** vi phạm (không trả giá trị), quét
    cả ba ô lý do: cột B, cột AX, và cột V của **từng** thửa.
  - Tái dùng `scanForCitizenIdLikeValues` từ `src/modules/ai-extraction/pii-safety.ts` thay vì viết
    regex mới. Đây là điểm quan trọng: hệ thống chỉ nên có **một** định nghĩa "trông giống CCCD".
    Pattern đó là `/(?<!\d)(?:\d[ .-]?){11}\d(?!\d)/` — bắt cả `0123 4567 8901` và `012.345.678.901`.
  - Chặn ở `validateWorkingPayloadForSave` (lúc lưu) **và** `checkAutomaticOverrides` (lúc tiếp nhận).
  - Hint trên cả ba ô lý do đổi thành hướng dẫn cụ thể kèm ví dụ, và nói rõ hệ thống sẽ từ chối lưu.
- **Vì sao hai cửa, dù yêu cầu chỉ nói "từ chối lưu":** bản ghi lưu **trước** khi có luật này vẫn nằm
  trong kho, và audit của lần tiếp nhận sẽ chép lại chính chuỗi đó — chặn lúc lưu không với tới được
  chúng. Không tạo thế bí: đường lưu đã sạch nên cán bộ luôn sửa rồi lưu lại được.
- **Không làm:** không đặt luật này vào `draftSchema`. Đường công khai của người dân không có ô lý do
  ghi đè, và đặt vào schema sẽ biến thông báo rõ ràng thành một lỗi cấu trúc chung.
- **Test:** 3 test ở `full-pl3-editor.test.ts` (cả ba ô; biến thể có dấu cách; lý do hợp lệ có số
  không bị báo nhầm) + 1 test ở `completion-checks.test.ts`.
- **Kết quả:** pass. Đã xác minh thêm trên giao diện thật — §14 tình huống 5.
- **Rủi ro:** fail-closed. Một chuỗi 12 số hợp lệ về nghiệp vụ sẽ bị từ chối oan; đánh đổi đã ghi ở
  `03-decisions.md`. Đã kiểm lý do có số bình thường (`"tờ 105 lập năm 2024"`) KHÔNG bị báo nhầm.

### Phase 2 — Tài sản chưa gắn thửa (quyết định 2)

- **Mục tiêu:** lưu được, chặn khi tiếp nhận, thông báo chỉ rõ tài sản nào.
- **File:** `src/modules/submissions/completion-checks.ts`.
- **Hiện trạng trước:** hành vi lưu/chặn **đã đúng** từ đợt trước (`draftSchema` chỉ từ chối
  `parcelId` trỏ vào thửa không tồn tại, không từ chối chuỗi rỗng; `checkAssets` chặn lúc tiếp nhận).
  Phần còn thiếu duy nhất là thông báo — `"Tài sản thứ N"` không giúp cán bộ tìm đúng thẻ nào.
- **Đã làm:** `assetLabel(asset, index)` ghép số thứ tự + nhãn loại tài sản + mô tả nội bộ, cho ra
  `"Tài sản 2 (Công trình xây dựng khác — Nhà kho sau vườn)"`. Thông điệp nói rõ ô cần sửa:
  *"chọn thửa ở ô \"Thửa đất liên quan\" của tài sản này rồi lưu lại"*.
- **An toàn dữ liệu trong thông báo:** loại tài sản là mã danh mục **đóng** (`ASSET_TYPE_OPTIONS`),
  mô tả là ô nội bộ do chính cán bộ ghi. Không có trường nào của người dân lọt vào thông báo lỗi.
- **Không làm:** không đổi luật lưu, không xóa tài sản khi xóa thửa (giữ dữ liệu, để cán bộ gán lại).
- **Test:** `CC-ASSET` — khẳng định cả chiều dương (tài sản mồ côi bị chặn, đúng nhãn) lẫn chiều âm
  (tài sản đã gắn thửa KHÔNG bị báo).
- **Kết quả:** pass. Đã xác minh trên giao diện — §14 tình huống 3.

### Phase 3 — Một nguồn sự thật cho ghi đè cột B và AX (quyết định 3)

- **Mục tiêu:** `working_payload_json` là nơi duy nhất giữ giá trị ghi đè; không còn cột song song.
- **File:** `src/modules/public-intake/repository.ts`,
  `supabase/migrations/202607290003_drop_working_payload_override_columns.sql` (mới),
  `scripts/preflight-public-intake-v2-migrations.ts`.
- **Đã làm:**
  - Gỡ hai khối `update public.public_submissions set ward_admin_code_override…` trong
    `commitWorkingPayload` và `commitOfficialAmendment`.
  - Migration mới dùng `drop column if exists` cho cả 4 cột.
  - Preflight: bỏ 4 cột khỏi danh sách bắt buộc của `202607290002`, thêm khối kiểm tra **ngược** —
    4 cột đó phải KHÔNG còn tồn tại, còn cột nghĩa là migration chưa chạy.
- **Xử lý migration theo trạng thái môi trường, không sửa migration đã chạy:** `202607290002` được
  giữ **nguyên vẹn** vì nó có thể đã áp ở local/preview — sửa file đã chạy thì môi trường đã áp sẽ
  không bao giờ nhận thay đổi, còn checksum thì lệch. Migration mới `drop column if exists` đúng
  trong **cả hai** trạng thái: môi trường đã áp `202607290002` thì cột bị gỡ; môi trường chưa áp thì
  lệnh không làm gì và cũng không lỗi.
- **An toàn dữ liệu (đã kiểm chứng bằng đọc code, không suy đoán):** mọi giá trị từng ghi vào 4 cột
  đều được sao chép từ `input.draft` trong **cùng** transaction ghi `working_payload_json`. Không có
  đường nào ghi vào cột mà không ghi vào JSON. Vì vậy không có dữ liệu nào chỉ tồn tại ở 4 cột đó và
  **không cần backfill** trước khi gỡ. Đã grep toàn `src/`: không có `SELECT` nào đọc chúng.
- **Test:** không thêm test mới — không có logic mới nào để test; thay đổi là **gỡ bỏ**. Bộ test sẵn
  có (round-trip save/reload, export dùng override) vẫn pass, chứng minh đường JSON tự đủ.
- **Rủi ro:** DDL huỷ cột. Rollback ở §17.

### Phase 4 — Giữ yêu cầu người đại diện tổ chức + release note (quyết định 4)

- **Mục tiêu:** giữ nguyên hành vi, làm cho nó không còn là bất ngờ với cán bộ.
- **File:** `evidence/PUBLIC_INTAKE_V2_RELEASE_CHECKLIST.md`, `docs/brain/03-decisions.md`.
- **Đã làm:** **không sửa code** — hành vi hiện tại đã đúng yêu cầu. Viết release note §7 gồm 6 mục:
  bảng cột bắt buộc mới cho hồ sơ tổ chức và tác động lên hồ sơ đang chờ (§7.1), cơ chế tự di trú bản
  ghi tổ chức cũ (§7.2), luật PII (§7.3), tài sản chưa gắn thửa (§7.4), thay đổi thấy được trong file
  PL3 xuất ra (§7.5), thứ tự áp hai migration + lệnh preflight (§7.6).
- **Điểm cần lãnh đạo biết, đã ghi vào §7.1:** mọi hồ sơ tổ chức **đang chờ tiếp nhận** sẽ bị chặn
  cho tới khi bổ sung thông tin người đại diện. Cần rà danh sách và báo trước cho cán bộ.

### Phase 5 — Kiểm tra giao diện (lấp AC-10)

Xem §14 — có số liệu trạng thái thật, không phải mô tả.

## 9. Behavior before and after

| Scenario                                                              | Before                                                     | After                                                                                  | Verification                          |
| --------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------- |
| Cán bộ ghi CCCD vào ô lý do ghi đè rồi bấm Lưu                         | Lưu thành công, chuỗi CCCD vào `audit_logs.metadata`        | Từ chối lưu, báo đúng tên ô, không chép lại số                                          | §14 tình huống 5 (đo trên trình duyệt) |
| Hồ sơ đã lưu từ trước có CCCD trong ô lý do, bấm Tiếp nhận             | Tiếp nhận được, audit chép lại chuỗi                        | Bị chặn với mã `OVERRIDE_REASON_CONTAINS_CITIZEN_ID`                                    | Test `CC-PII`                         |
| Lý do nghiệp vụ hợp lệ có chứa số (`tờ 105 lập năm 2024`)              | Lưu được                                                    | Lưu được — **không** báo nhầm                                                           | Test + §14 tình huống 5               |
| Tài sản chưa gắn thửa, bấm Tiếp nhận                                   | `"Tài sản thứ 2 phải được gắn với một thửa đất…"`           | `"Tài sản 2 (Công trình xây dựng khác — Nhà kho sau vườn) chưa chọn thửa đất"` + chỉ ô  | Test `CC-ASSET`                       |
| Lưu bản làm việc                                                       | 2 câu `UPDATE` thừa ghi vào cột không ai đọc                | Không còn; `working_payload_json` là nguồn duy nhất                                     | Diff `repository.ts`; test round-trip |
| Hồ sơ tổ chức thiếu ngày sinh/giới tính người đại diện                 | (PR #7 đã chặn) — nhưng chưa ai được báo trước               | Vẫn chặn, **và** đã có release note giải thích                                          | `RELEASE_CHECKLIST.md` §7.1           |

## 10. API, data and security impact

### Authentication / Authorization / DataScope

- **Không thay đổi** ở cả ba. Không đụng `requireActiveUser`, `SUBMISSION_READ_ROLES`, điều kiện
  `claimedBy === actor`, hay phạm vi bản ghi cán bộ đọc/ghi được.

### API contract

- Endpoint: `PUT /api/submissions/:submissionId/working-payload` — request/response **không đổi**.
  Thêm một lý do khiến trả `400 VALIDATION_FAILED`: ô lý do chứa mẫu CCCD. `message` nêu tên ô, tuyệt
  đối không chứa chuỗi PII (có test khóa).
- Endpoint: `POST /api/submissions/:submissionId/accept` — thêm một mã trong
  `error.details.issues[]`: `OVERRIDE_REASON_CONTAINS_CITIZEN_ID`. Nhãn `ASSET_*_PARCEL_INVALID` đổi
  nội dung (chi tiết hơn), **mã giữ nguyên** nên client không vỡ.

### Database and migrations

- **Migration added:** `202607290003_drop_working_payload_override_columns.sql`
- **Tables/columns affected:** `public_submissions` — drop `ward_admin_code_override`,
  `ward_admin_code_override_reason`, `scanned_file_names_override`,
  `scanned_file_names_override_reason`.
- **Backfill:** **không cần.** Mọi giá trị từng ghi vào 4 cột đều được sao chép từ payload trong cùng
  transaction; không có dữ liệu nào chỉ tồn tại ở đây. Đã grep xác nhận không có `SELECT` nào đọc.
- **Idempotent:** `drop column if exists` — chạy đúng dù `202607290002` đã áp hay chưa.
- **Production action required:** áp `202607290002` rồi `202607290003`, sau đó chạy
  `npm run preflight:public-intake-v2` (script kiểm cả hai chiều).

### Validation and file handling

- Trường bắt buộc: **không nới** bất kỳ luật nào; chỉ **siết thêm** luật PII.
- Quy tắc tên file / giới hạn / MIME: không đụng.

### Sensitive data

- **Đây là đợt làm GIẢM bề mặt PII**, không tăng. Ô lý do ghi đè trước đây là đường duy nhất đưa
  free text của cán bộ vào `audit_logs.metadata`; nay đã có bộ lọc fail-closed ở hai cửa.
- Thông báo lỗi ở **cả hai** cửa chỉ nêu tên ô, không chép lại giá trị. Có test khẳng định chuỗi
  `012345678901` không xuất hiện trong lỗi trả về.
- Nhãn tài sản trong thông báo dùng mã danh mục đóng + ô mô tả nội bộ của cán bộ — không có trường
  nào của người dân.

## 11. Tests added or changed

| Test file                       | Test case                                                                       | Requirement covered                       | Result |
| ------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- | ------ |
| `tests/full-pl3-editor.test.ts` | "từ chối lưu khi ô lý do ghi đè chứa CCCD, ở cả ba ô lý do"                      | QĐ 1 — phủ cả 3 ô, và lỗi không chứa PII  | PASS   |
| `tests/full-pl3-editor.test.ts` | "bắt cả CCCD viết có dấu cách/chấm/gạch, nhưng không bắt lý do nghiệp vụ bình thường" | QĐ 1 — chống né và chống báo nhầm    | PASS   |
| `tests/full-pl3-editor.test.ts` | "completionChecks chặn tiếp nhận với dữ liệu đã lưu trước khi có luật PII"       | QĐ 1 — cửa thứ hai                        | PASS   |
| `tests/completion-checks.test.ts` | `CC-ASSET` — tài sản chưa chọn thửa bị chặn, thông báo chỉ rõ tài sản nào      | QĐ 2                                      | PASS   |
| `tests/completion-checks.test.ts` | `CC-PII` — lý do ghi đè chứa CCCD bị chặn tiếp nhận                            | QĐ 1 ở cửa tiếp nhận                      | PASS   |

**Giới hạn đã biết:**

- Quyết định 3 (gỡ cột) **không có test mới** — thay đổi là gỡ bỏ, không có logic mới để test. Bằng
  chứng thay thế: bộ test round-trip save/reload và test export dùng override vẫn pass, chứng minh
  đường JSON tự đủ mà không cần 4 cột.
- Quyết định 4 không có test mới vì **không sửa code** — hành vi đã được test sẵn từ PR #7.
- Vẫn **không có** hạ tầng test React trong repo. Hành vi giao diện được xác minh bằng thao tác thật
  trên trình duyệt (§14), không phải bằng test tự động — nghĩa là nó **không** được bảo vệ khỏi hồi
  quy trong CI. Đây là món nợ kỹ thuật còn nguyên, xem §15.

## 12. Final verification

| Check             | Command                       | Result                                 | Evidence                                                                        |
| ----------------- | ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| Unit tests        | `npm test`                    | **PASS** — 642 pass / 10 skip / 0 fail | `Test Files 67 passed \| 2 skipped (69)`; `Tests 642 passed \| 10 skipped (652)` |
| Integration tests | —                             | Nằm trong bộ Vitest ở trên             | —                                                                               |
| E2E tests         | `npm run test:e2e`            | **NOT_RUN**                            | Cần preview deployment + secret                                                  |
| Build             | `npm run build`               | **PASS**                               | exit 0, in đủ bảng route                                                         |
| Lint              | `npm run lint`                | **PASS** — 0 error / 5 warning         | 5 warning có sẵn ở file ngoài phạm vi                                            |
| Typecheck         | `npm run typecheck`           | **PASS**                               | exit 0                                                                          |
| UI verification   | trình duyệt, harness tạm      | **PASS 4/4 (+1)**                      | §14 — có số liệu trạng thái thật                                                 |
| Security check    | `npm run security-review`     | **NOT_RUN**                            | Không có script này trong `package.json`                                         |
| Secret scan       | `git diff --check` + đọc diff | **PASS**                               | Không có key/token/connection string; không có dữ liệu thật                      |

**Một sự cố trong quá trình kiểm tra, đã xử lý và nêu ở đây để không giấu:** lần chạy `npm run build`
đầu tiên sau khi xóa trang harness đã **FAIL** với
`Cannot find module '../../../src/app/dev-harness/page.js'`. Nguyên nhân: `.next/dev/types/validator.ts`
là file **sinh tự động** bởi dev server, còn giữ tham chiếu tới trang đã xóa. Đã xác nhận không còn
tham chiếu `dev-harness` nào trong `src/`, `tests/`, `scripts/`, `supabase/`; xóa `.next` và build
lại → PASS. Không phải lỗi mã nguồn, nhưng nếu không dọn thì CI có `.next` cũ sẽ đỏ.

## 13. Acceptance criteria matrix

| ID    | Acceptance criterion                                                                          | Status   | Evidence                                                     | Notes                                                              |
| ----- | --------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| AC-20 | Ô lý do chứa CCCD bị từ chối lưu, ở cả ba ô                                                    | **PASS** | Test + §14 tình huống 5                                      | Bắt cả biến thể có dấu cách/chấm/gạch                              |
| AC-21 | Lý do nghiệp vụ hợp lệ có chứa số không bị báo nhầm                                            | **PASS** | Test + §14 tình huống 5                                      | —                                                                  |
| AC-22 | Thông báo lỗi PII không chép lại chuỗi CCCD                                                    | **PASS** | Test khẳng định `not.toContain("012345678901")`              | Áp dụng cả hai cửa                                                 |
| AC-23 | Dữ liệu đã lưu trước luật PII bị chặn ở bước tiếp nhận                                         | **PASS** | Test `CC-PII`                                                | —                                                                  |
| AC-24 | Tài sản chưa gắn thửa: lưu được                                                                | **PASS** | §14 tình huống 3 (`validation=null`, lưu thành công)         | —                                                                  |
| AC-25 | Tài sản chưa gắn thửa: chặn khi tiếp nhận, thông báo gọi tên đúng tài sản                      | **PASS** | Test `CC-ASSET`                                              | Có cả khẳng định chiều âm                                          |
| AC-26 | Không còn đường ghi nào vào 4 cột ghi đè song song                                             | **PASS** | Diff `repository.ts`; grep không còn tham chiếu               | —                                                                  |
| AC-27 | Migration gỡ cột idempotent, không sửa migration đã chạy                                       | **PASS** | Nội dung migration ở §20; `202607290002` không nằm trong diff | —                                                                  |
| AC-28 | Preflight kiểm cả hai chiều                                                                    | **PASS** | Diff `preflight-...ts`                                       | **Chưa chạy thật** — cần database, xem §15                         |
| AC-29 | Yêu cầu người đại diện tổ chức giữ nguyên                                                      | **PASS** | `checkOwner` không nằm trong diff                            | —                                                                  |
| AC-30 | Có release note cho thay đổi hành vi                                                           | **PASS** | `RELEASE_CHECKLIST.md` §7, 6 mục                             | —                                                                  |
| AC-10 | (nợ từ đợt trước) Hành vi UI được xác minh trên trình duyệt thật                               | **PASS** | §14 — 4/4 tình huống, có số liệu trạng thái                  | Xác minh **thủ công**, chưa có test tự động bảo vệ khỏi hồi quy    |
| AC-31 | Không có file tạm/harness lọt vào commit                                                       | **PASS** | `git status` ở §2; không còn tham chiếu `dev-harness`         | —                                                                  |

## 14. UI verification — 4 tình huống (+1)

**Cách làm và vì sao:** `SUPABASE_DATABASE_URL` trong `.env.local` trỏ tới database **thật**, nên
tôi **không** tạo hồ sơ giả trong đó. Thay vào đó dựng một trang harness **tạm** render đúng
component `WorkingPayloadEditor` thật với dữ liệu dựng sẵn, kèm một khối `<pre id="probe">` in ra
**trạng thái thật của draft** (không phải giá trị hiển thị trên ô nhập — hai thứ này khác nhau, và
chính chỗ khác nhau đó là nơi lỗi mất tên tổ chức từng ẩn). Thao tác bằng click/gõ thật qua trình
duyệt để đi qua đúng vòng sự kiện React. Harness đã xóa sau khi đo.

Server dev chạy ở port 60777 (port 3000 đang bị process khác của người dùng chiếm — **không** tắt).

### Tình huống 1 — dòng tổ chức legacy, gõ vào ô H TRƯỚC khi chạm ô F

Đây chính là kịch bản làm mất tên tổ chức trước bản vá.

```
TRƯỚC:  ownerType=TO_CHUC
        fullName="Công ty TNHH Thử Nghiệm"     <- tên tổ chức nằm ở ô họ tên
        organisationName=""
        organisationIdentityNumber=""

thao tác: click ô "H — Họ tên người đại diện tổ chức", gõ "Trần Thị Đại Diện"

SAU:    ownerType=TO_CHUC
        fullName="Trần Thị Đại Diện"           <- tên người đại diện vừa gõ
        identityNumber=""                       <- giải phóng cho CCCD người đại diện
        organisationName="Công ty TNHH Thử Nghiệm"        <- ĐÃ DI TRÚ, không mất
        organisationIdentityNumber="0100109106"           <- ĐÃ DI TRÚ
```

**PASS.**

### Tình huống 2 — dòng tổ chức legacy, đổi pháp nhân sang "Cá nhân"

```
thao tác: đổi ô "M — Pháp nhân trên GCN" từ Tổ chức -> Cá nhân

SAU:    ownerType=CA_NHAN
        fullName="Công ty TNHH Thử Nghiệm"     <- GIỮ NGUYÊN TẠI CHỖ, đúng chủ ý
        organisationName=""                     <- không bị đẩy sang ô tên tổ chức
```

**PASS** — khớp quyết định "đổi pháp nhân KHÔNG di trú".

### Tình huống 3 — xóa thửa đang có tài sản gắn vào

```
TRƯỚC:  parcelCount=2, assetParcelId="parcel-2", validation=null

thao tác: bấm "Xóa thửa" trên thẻ thửa số 20 (parcel-2)

SAU:    parcelCount=1
        thửa còn lại = "10"                     <- xóa đúng thửa
        assetParcelId=""                        <- tham chiếu đã gỡ
        ô "Thửa đất liên quan" = "-- Chọn thửa --"
        validation=null                          <- payload hợp lệ

thao tác: bấm "Lưu toàn bộ bản làm việc"
kết quả:  errors=[]  success="Đã lưu bản làm việc. Tải lại hồ sơ sẽ dùng đúng dữ liệu vừa lưu."
```

**PASS** — lưu được, không lỗi đỏ.

### Tình huống 4 — xuất PL3 với 2 tài sản cùng thửa

Không đi qua giao diện (là hàm thuần phía server), nên đo trực tiếp trên `buildSubmissionRows` với
2 tài sản **trùng** diện tích xây dựng và tài sản thứ hai **thiếu** diện tích sàn — đúng hai trường
hợp mà bỏ trùng/bỏ ô rỗng sẽ làm lệch cột:

```
AO (loại tài sản)       = "Nhà ở; Công trình xây dựng khác"
AS (diện tích xây dựng) = "100; 100"      <- KHÔNG gộp trùng thành một
AT (diện tích sàn)      = "180; -"        <- giữ chỗ, vị trí 2 vẫn là của tài sản 2
AW (cấp hạng)           = "-; -"
Số phần tử mỗi cột AO–AW = [2,2,2,2,2,2,2,2,2]    <- bất biến quan trọng nhất

Cảnh báo: "Hồ sơ PC-KK-2026-0001 thửa 1: thửa có 2 tài sản nhưng PL3 chỉ có một bộ cột AO–AW;
           các giá trị được gộp bằng "; " theo đúng thứ tự tài sản, ô trống ghi "-"."
```

**PASS.**

### Tình huống 5 (bổ sung) — luật PII mới, đo trên giao diện

```
thao tác: ô B = "07999"; ô "Lý do ghi đè cột B" = "Theo ho so cua ong A 012345678901 da nop"
          bấm Lưu
kết quả:  successShown=false
          error="Lý do ghi đè cột B (mã ĐVHC): không được chứa số định danh cá nhân/CCCD.
                 Chỉ ghi lý do nghiệp vụ ngắn, ví dụ "Theo bản đồ địa chính đã đối chiếu"."
          -> thông báo KHÔNG chép lại số CCCD

thao tác: sửa lý do thành "Theo ban do dia chinh to 105 lap nam 2024", bấm Lưu
kết quả:  error=null
          success="Đã lưu bản làm việc..."
          -> lý do nghiệp vụ có số KHÔNG bị báo nhầm
```

**PASS.**

### Điều KHÔNG được xác minh ở đây

- Đường lưu thật qua `PUT /api/submissions/:id/working-payload` (harness gọi trực tiếp hàm
  validation, không qua HTTP). Phân quyền, version conflict và ghi audit **chưa** được đo trên
  trình duyệt — chúng có test đơn vị riêng nhưng chưa có kiểm tra đầu-cuối.
- Bước tiếp nhận chính thức (`POST .../accept`) — chỉ có test đơn vị, không đo qua giao diện.
- Hành vi với dữ liệu thật của phường.

## 15. Remaining issues and warnings

| Severity   | Issue                                                                                                       | Impact                                                                                          | Recommended action                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **High**   | Hồ sơ tổ chức đang chờ tiếp nhận sẽ bị chặn cho tới khi bổ sung thông tin người đại diện                     | Cán bộ có thể bất ngờ ngay ngày đầu bật                                                          | Rà danh sách hồ sơ tổ chức đang chờ **trước** khi deploy; phổ biến `RELEASE_CHECKLIST.md` §7.1                  |
| **Medium** | `preflight:public-intake-v2` đã sửa nhưng **chưa chạy thật** — cần kết nối database                          | Nếu tôi viết sai câu kiểm tra, preflight sẽ báo sai ở đúng lúc cần tin nó nhất                   | Chạy trên Supabase Preview ngay sau khi áp `202607290003`, trước khi tin kết quả                                |
| **Medium** | Hành vi UI chỉ được xác minh **thủ công**, không có test tự động bảo vệ khỏi hồi quy                          | Một thay đổi sau này có thể phá lại lỗi mất tên tổ chức mà CI không phát hiện                    | Thêm `@testing-library/react` + `jsdom` trong một PR riêng, rồi chuyển §14 thành test                            |
| **Medium** | Fail-closed của luật PII có thể từ chối oan chuỗi 12 số hợp lệ về nghiệp vụ                                  | Cán bộ phải viết lại câu lý do                                                                  | Đã ghi là đánh đổi có chủ ý ở `03-decisions.md`. Theo dõi phản hồi thực tế; nếu phiền, nới bằng danh sách trắng |
| **Low**    | Migration `202607290003` là DDL huỷ cột                                                                      | Không mất dữ liệu (§10), nhưng không tự hoàn tác được                                            | Áp trên Preview trước; xem §17                                                                                 |
| **Low**    | 5 warning `no-unused-vars` có sẵn                                                                            | Không ảnh hưởng chạy                                                                            | PR vệ sinh riêng                                                                                               |
| **Low**    | E2E chưa chạy lần nào (nợ từ trước, không thuộc đợt này)                                                     | —                                                                                               | Theo `PUBLIC_INTAKE_V2_E2E_CHECKLIST.md`                                                                       |

## 16. Regression and compatibility notes

- **Trình duyệt / thiết bị:** không đổi. Chỉ đổi chuỗi hint và thêm nhánh validation.
- **Node/runtime:** không đổi. Node v24.11.0.
- **Database:** **có đổi** — `202607290003` gỡ 4 cột. Xem §10 và §17.
- **API bên ngoài:** không đụng Drive/Turnstile/Supabase client.
- **Backward compatibility — payload:** hoàn toàn tương thích. Không đổi shape `IntakeDraft`; luật
  PII chỉ đọc, không ghi.
- **Backward compatibility — audit:** không đổi khóa nào của metadata.
- **Backward compatibility — API:** mã lỗi `ASSET_*_PARCEL_INVALID` **giữ nguyên**, chỉ đổi nội dung
  `label`/`message`. Client nào bám vào `code` không vỡ; client nào bám vào chuỗi `label` sẽ lệch —
  đã kiểm: không có client nào trong repo làm vậy.
- **Excel/PDF/export:** đợt này **không** đổi gì trong file PL3 xuất ra. (Thay đổi ở đợt trước —
  gộp nhiều tài sản — vẫn nguyên, đã ghi ở `RELEASE_CHECKLIST.md` §7.5.)

## 17. Rollback plan

- **Rollback code:** revert commit. Không có bước nào khác.
- **Rollback migration `202607290003`:** thêm lại 4 cột bằng
  `alter table public.public_submissions add column if not exists … text not null default ''`.
  **Dữ liệu không cần phục hồi** — 4 cột đó chưa bao giờ là nguồn sự thật; giá trị nằm nguyên trong
  `working_payload_json`. Cột thêm lại sẽ rỗng và vô hại cho tới khi có code ghi vào (mà nay không có).
- **Thứ tự rollback:** revert **code trước**, migration sau. Ngược lại thì code mới (không ghi cột)
  chạy cùng schema cũ — vẫn đúng, chỉ để lại cột rỗng.
- **Điều kiện không được rollback tự động:** nếu đã deploy và cán bộ đã sửa dòng tổ chức legacy,
  dữ liệu đã ở dạng F/G. Revert code **không** làm hỏng dữ liệu đó, nhưng mở lại lỗ hổng mất tên tổ
  chức cho các dòng legacy chưa sửa.

## 18. Recommended next action

`READY_FOR_CHATGPT_REVIEW`

Cả 4 quyết định đã thi hành với bằng chứng; AC-10 nợ từ đợt trước đã hết. Trước khi merge:
(1) áp `202607290002` rồi `202607290003` trên Supabase Preview và **chạy** `preflight` — AC-28 hiện
mới chỉ là code chưa chạy; (2) rà danh sách hồ sơ tổ chức đang chờ tiếp nhận theo §15 High;
(3) cập nhật phần mô tả PR (hiện vẫn là bản Codex, chưa nhắc gì tới hai đợt vá).

## 19. Commands to reproduce

```bash
npm ci
npm run typecheck
npm test
npm run lint
rm -rf .next && npm run build
git diff --check
npx vitest run tests/full-pl3-editor.test.ts tests/completion-checks.test.ts
```

## 20. Key diff excerpts

Luật PII — dùng chung định nghĩa "giống CCCD" với đường AI, trả về **tên ô** chứ không phải giá trị:

```diff
+export function overrideReasonsWithCitizenIdLike(draft: IntakeDraft): string[] {
+  const labelled: { label: string; reason: string | undefined }[] = [
+    { label: "Lý do ghi đè cột B (mã ĐVHC)", reason: draft.wardAdministrativeCodeOverrideReason },
+    { label: "Lý do ghi đè cột AX (tên file quét)", reason: draft.scannedFileNamesOverrideReason },
+    ...draft.parcels.map((parcel, index) => ({
+      label: `Lý do ghi đè cột V của thửa ${index + 1}`,
+      reason: parcel.cadastralMapSheetOverrideReason,
+    })),
+  ];
+  return labelled
+    .filter(({ reason }) => reason?.trim() && scanForCitizenIdLikeValues(reason).length > 0)
+    .map(({ label }) => label);
+}
```

Gỡ nguồn dữ liệu song song (lặp lại ở cả `commitWorkingPayload` và `commitOfficialAmendment`):

```diff
       const next = mapSubmission(rows[0]);
-      await transaction`
-        update public.public_submissions set
-          ward_admin_code_override = ${input.draft.wardAdministrativeCodeOverride ?? ""},
-          ...
-        where submission_id = ${input.record.submissionId}
-      `;
```

Migration mới — toàn văn:

```sql
alter table public.public_submissions
  drop column if exists ward_admin_code_override,
  drop column if exists ward_admin_code_override_reason,
  drop column if exists scanned_file_names_override,
  drop column if exists scanned_file_names_override_reason;
```

Preflight kiểm chiều ngược lại:

```diff
+    const stillPresent: string[] = [];
+    for (const column of droppedColumns) {
+      const { exists } = await columnExists("public_submissions", column);
+      if (exists) stillPresent.push(`public_submissions.${column}`);
+    }
+    check(
+      "Đã gỡ cột ghi đè song song trên public_submissions (202607290003)",
+      stillPresent.length === 0,
+      stillPresent.length === 0 ? "OK" : `CÒN CỘT SONG SONG: ${stillPresent.join(", ")}`,
+    );
```

## 21. Full unified diff

```text
FULL_DIFF_INCLUDED
```

Base: `532c36935ff89d679c6b7b2d66413cec866e8168`.
Phạm vi nhúng: `src/`, `tests/`, `scripts/`, `supabase/`. Bốn file tài liệu
(`docs/brain/{01,03,06}`, `evidence/PUBLIC_INTAKE_V2_RELEASE_CHECKLIST.md`) là văn bản thuần, tóm
tắt ở §8, không nhúng để giữ báo cáo đọc được.

```diff
diff --git a/scripts/preflight-public-intake-v2-migrations.ts b/scripts/preflight-public-intake-v2-migrations.ts
index db7a3a3..f9653d7 100644
--- a/scripts/preflight-public-intake-v2-migrations.ts
+++ b/scripts/preflight-public-intake-v2-migrations.ts
@@ -250,10 +250,6 @@ async function runChecks(): Promise<CheckResult[]> {
   // 202607290002 — toàn bộ cột lưu bền vững cho Bàn biên tập đầy đủ và PL3 B–AX.
   {
     const requiredColumns: ReadonlyArray<readonly [table: string, column: string]> = [
-      ["public_submissions", "ward_admin_code_override"],
-      ["public_submissions", "ward_admin_code_override_reason"],
-      ["public_submissions", "scanned_file_names_override"],
-      ["public_submissions", "scanned_file_names_override_reason"],
       ["public_owners", "organisation_name"],
       ["public_owners", "organisation_identity_number"],
       ["public_parcels", "cadastral_map_sheet_number"],
@@ -300,6 +296,28 @@ async function runChecks(): Promise<CheckResult[]> {
     );
   }
 
+  // 202607290003 — `working_payload_json` là nguồn sự thật duy nhất cho ghi đè cột B và AX.
+  // Bốn cột song song phải KHÔNG còn tồn tại; còn cột nghĩa là migration chưa chạy và nguy cơ
+  // ai đó ghi lại vào đó vẫn còn.
+  {
+    const droppedColumns = [
+      "ward_admin_code_override",
+      "ward_admin_code_override_reason",
+      "scanned_file_names_override",
+      "scanned_file_names_override_reason",
+    ];
+    const stillPresent: string[] = [];
+    for (const column of droppedColumns) {
+      const { exists } = await columnExists("public_submissions", column);
+      if (exists) stillPresent.push(`public_submissions.${column}`);
+    }
+    check(
+      "Đã gỡ cột ghi đè song song trên public_submissions (202607290003)",
+      stillPresent.length === 0,
+      stillPresent.length === 0 ? "OK" : `CÒN CỘT SONG SONG: ${stillPresent.join(", ")}`,
+    );
+  }
+
   // Kiểm tra dữ liệu — hồ sơ cũ phải nhất quán, không phải chỉ schema đúng.
   {
     const database = getDatabase();
diff --git a/src/components/admin/editable-parcel-table.tsx b/src/components/admin/editable-parcel-table.tsx
index 45fba46..522deca 100644
--- a/src/components/admin/editable-parcel-table.tsx
+++ b/src/components/admin/editable-parcel-table.tsx
@@ -264,7 +264,7 @@ export function EditableParcelTable({
               </Field>
               <Field
                 label="Lý do ghi đè cột V"
-                hint="Bắt buộc tối thiểu 10 ký tự khi nhập giá trị ghi đè."
+                hint="Tối thiểu 10 ký tự. Chỉ ghi lý do nghiệp vụ ngắn (ví dụ: Theo bản đồ địa chính đã đối chiếu). KHÔNG ghi CCCD hay thông tin định danh cá nhân — hệ thống sẽ từ chối lưu."
               >
                 <input
                   disabled={readOnly || !(parcel.cadastralMapSheetNumber ?? "").trim()}
diff --git a/src/components/admin/working-payload-editor.tsx b/src/components/admin/working-payload-editor.tsx
index 0005432..60c6bf1 100644
--- a/src/components/admin/working-payload-editor.tsx
+++ b/src/components/admin/working-payload-editor.tsx
@@ -181,7 +181,7 @@ export function WorkingPayloadEditor({
             <div className="mt-3">
               <Field
                 label="Lý do ghi đè cột B"
-                hint="Bắt buộc tối thiểu 10 ký tự khi nhập giá trị ghi đè."
+                hint="Tối thiểu 10 ký tự. Chỉ ghi lý do nghiệp vụ ngắn (ví dụ: Theo bản đồ địa chính đã đối chiếu). KHÔNG ghi CCCD hay thông tin định danh cá nhân — hệ thống sẽ từ chối lưu."
               >
                 <input
                   disabled={readOnly || !(draft.wardAdministrativeCodeOverride ?? "").trim()}
@@ -215,7 +215,7 @@ export function WorkingPayloadEditor({
             <div className="mt-3">
               <Field
                 label="Lý do ghi đè cột AX"
-                hint="Bắt buộc tối thiểu 10 ký tự khi nhập giá trị ghi đè."
+                hint="Tối thiểu 10 ký tự. Chỉ ghi lý do nghiệp vụ ngắn (ví dụ: Theo bản đồ địa chính đã đối chiếu). KHÔNG ghi CCCD hay thông tin định danh cá nhân — hệ thống sẽ từ chối lưu."
               >
                 <input
                   disabled={readOnly || !(draft.scannedFileNamesOverride ?? "").trim()}
diff --git a/src/modules/public-intake/repository.ts b/src/modules/public-intake/repository.ts
index 8793c9c..8e82812 100644
--- a/src/modules/public-intake/repository.ts
+++ b/src/modules/public-intake/repository.ts
@@ -1015,14 +1015,6 @@ export class PublicIntakeRepository {
       );
       if (!rows[0]) throw new SubmissionVersionConflictError();
       const next = mapSubmission(rows[0]);
-      await transaction`
-        update public.public_submissions set
-          ward_admin_code_override = ${input.draft.wardAdministrativeCodeOverride ?? ""},
-          ward_admin_code_override_reason = ${input.draft.wardAdministrativeCodeOverrideReason ?? ""},
-          scanned_file_names_override = ${input.draft.scannedFileNamesOverride ?? ""},
-          scanned_file_names_override_reason = ${input.draft.scannedFileNamesOverrideReason ?? ""}
-        where submission_id = ${input.record.submissionId}
-      `;
 
       await transaction`
         insert into public.public_submission_payload_history
@@ -1174,14 +1166,6 @@ export class PublicIntakeRepository {
       );
       if (!rows[0]) throw new SubmissionVersionConflictError();
       const next = mapSubmission(rows[0]);
-      await transaction`
-        update public.public_submissions set
-          ward_admin_code_override = ${input.draft.wardAdministrativeCodeOverride ?? ""},
-          ward_admin_code_override_reason = ${input.draft.wardAdministrativeCodeOverrideReason ?? ""},
-          scanned_file_names_override = ${input.draft.scannedFileNamesOverride ?? ""},
-          scanned_file_names_override_reason = ${input.draft.scannedFileNamesOverrideReason ?? ""}
-        where submission_id = ${input.record.submissionId}
-      `;
 
       await this.refreshCanonicalProjection(
           transaction,
diff --git a/src/modules/public-intake/validation.ts b/src/modules/public-intake/validation.ts
index 0679691..76a51ed 100644
--- a/src/modules/public-intake/validation.ts
+++ b/src/modules/public-intake/validation.ts
@@ -1,3 +1,5 @@
+import { scanForCitizenIdLikeValues } from "@/modules/ai-extraction/pii-safety";
+
 import {
   CERTIFICATE_ROLE_CODES,
   CHANGE_REASON_CODES,
@@ -256,6 +258,30 @@ export function validateDraftForSave(draft: IntakeDraft): string | null {
   return null;
 }
 
+/**
+ * Ô lý do ghi đè là trường tự do DUY NHẤT của bản làm việc đi thẳng vào `audit_logs.metadata`.
+ * Audit là nơi lưu lâu, đọc rộng và không được chứa định danh cá nhân (quy tắc cứng số 6), nên
+ * mọi ô lý do phải được quét trước khi lưu.
+ *
+ * Dùng chung `scanForCitizenIdLikeValues` với đường AI: một định nghĩa duy nhất cho "trông giống
+ * CCCD" (12 số, cho phép dấu cách/chấm/gạch xen giữa). Fail-closed như bên AI — chuỗi 12 số có
+ * thể là dữ liệu khác, nhưng đổi lại cán bộ chỉ cần viết lại câu lý do, còn PII lọt vào audit thì
+ * không gỡ ra được.
+ */
+export function overrideReasonsWithCitizenIdLike(draft: IntakeDraft): string[] {
+  const labelled: { label: string; reason: string | undefined }[] = [
+    { label: "Lý do ghi đè cột B (mã ĐVHC)", reason: draft.wardAdministrativeCodeOverrideReason },
+    { label: "Lý do ghi đè cột AX (tên file quét)", reason: draft.scannedFileNamesOverrideReason },
+    ...draft.parcels.map((parcel, index) => ({
+      label: `Lý do ghi đè cột V của thửa ${index + 1}`,
+      reason: parcel.cadastralMapSheetOverrideReason,
+    })),
+  ];
+  return labelled
+    .filter(({ reason }) => reason?.trim() && scanForCitizenIdLikeValues(reason).length > 0)
+    .map(({ label }) => label);
+}
+
 /**
  * Bàn biên tập cán bộ dùng cùng schema payload nhưng phải chặn giới hạn PL3 ngay khi lưu.
  *
@@ -269,6 +295,11 @@ export function validateWorkingPayloadForSave(draft: IntakeDraft): string | null
   if (draft.parcels.some((parcel) => parcel.landUses.length > MAX_LAND_USES_PER_PARCEL)) {
     return `Mỗi thửa chỉ ghi tối đa ${MAX_LAND_USES_PER_PARCEL} dòng mục đích sử dụng.`;
   }
+
+  const piiReasons = overrideReasonsWithCitizenIdLike(draft);
+  if (piiReasons.length > 0) {
+    return `${piiReasons.join("; ")}: không được chứa số định danh cá nhân/CCCD. Chỉ ghi lý do nghiệp vụ ngắn, ví dụ "Theo bản đồ địa chính đã đối chiếu".`;
+  }
   return null;
 }
 
diff --git a/src/modules/submissions/completion-checks.ts b/src/modules/submissions/completion-checks.ts
index 3aeb37c..691f68f 100644
--- a/src/modules/submissions/completion-checks.ts
+++ b/src/modules/submissions/completion-checks.ts
@@ -17,6 +17,7 @@ import {
   LAND_USE_AREA_TOLERANCE_M2,
   ORGANISATION_ID_PATTERN,
   isValidDate,
+  overrideReasonsWithCitizenIdLike,
 } from "@/modules/public-intake/validation";
 import {
   isOrganisationOwner,
@@ -256,17 +257,29 @@ function checkOwner(owner: Owner, index: number, block: Blocker): void {
   }
 }
 
+/**
+ * Tên gọi tài sản cho thông báo lỗi: đủ để cán bộ tìm đúng thẻ tài sản trên màn hình mà không lộ
+ * gì nhạy cảm (loại tài sản là mã danh mục đóng, mô tả do chính cán bộ ghi).
+ */
+function assetLabel(asset: Asset, index: number): string {
+  const typeLabel = ASSET_TYPE_OPTIONS.find((option) => option.code === asset.assetType)?.label;
+  const description = asset.description.trim();
+  const detail = [typeLabel, description].filter(Boolean).join(" — ");
+  return detail ? `Tài sản ${index + 1} (${detail})` : `Tài sản ${index + 1}`;
+}
+
 function checkAssets(payload: IntakeDraft, block: Blocker): void {
   const parcelIds = new Set(payload.parcels.map((parcel) => parcel.id));
   const assetTypeCodes = new Set(ASSET_TYPE_OPTIONS.map((option) => option.code));
   payload.assets.forEach((asset: Asset, index) => {
     const nth = index + 1;
     const prefix = `ASSET_${index}`;
+    const name = assetLabel(asset, index);
     if (!asset.parcelId || !parcelIds.has(asset.parcelId)) {
       block(
         `${prefix}_PARCEL_INVALID`,
-        `Tài sản ${nth} chưa gắn với thửa`,
-        `Tài sản thứ ${nth} phải được gắn với một thửa đất đang có trong hồ sơ.`,
+        `${name} chưa chọn thửa đất`,
+        `${name} chưa được gắn với thửa nào. Mở bàn làm việc, chọn thửa ở ô "Thửa đất liên quan" của tài sản này rồi lưu lại.`,
       );
     }
     if (!assetTypeCodes.has(asset.assetType)) {
@@ -295,6 +308,20 @@ function checkAssets(payload: IntakeDraft, block: Blocker): void {
 }
 
 function checkAutomaticOverrides(payload: IntakeDraft, block: Blocker): void {
+  /*
+   * Gác cổng thứ hai cho quy tắc "ô lý do không chứa CCCD". `validateWorkingPayloadForSave` đã
+   * chặn lúc lưu, nhưng bản ghi lưu TRƯỚC khi có luật này vẫn còn trong kho — và audit của lần
+   * tiếp nhận sẽ chép lại chính chuỗi đó. Chặn ở đây thì cán bộ buộc phải sửa rồi lưu lại, mà
+   * đường lưu đã sạch nên không có thế bí.
+   */
+  for (const label of overrideReasonsWithCitizenIdLike(payload)) {
+    block(
+      "OVERRIDE_REASON_CONTAINS_CITIZEN_ID",
+      `${label} chứa số định danh cá nhân`,
+      `${label} không được chứa CCCD. Sửa thành lý do nghiệp vụ ngắn rồi lưu lại bản làm việc.`,
+    );
+  }
+
   const check = (value: string | undefined, reason: string | undefined, code: string, label: string) => {
     if (value?.trim() && (reason?.trim().length ?? 0) < 10) {
       block(code, label, `${label} phải có lý do ghi đè từ 10 ký tự.`);
diff --git a/supabase/migrations/202607290003_drop_working_payload_override_columns.sql b/supabase/migrations/202607290003_drop_working_payload_override_columns.sql
new file mode 100644
index 0000000..b8c4bfe
--- /dev/null
+++ b/supabase/migrations/202607290003_drop_working_payload_override_columns.sql
@@ -0,0 +1,17 @@
+-- `working_payload_json` là nguồn sự thật DUY NHẤT cho mã ĐVHC ghi đè (cột B) và tên file quét
+-- ghi đè (cột AX). Bốn cột dưới đây do 202607290002 thêm vào chỉ từng được GHI, không có đường đọc
+-- nào — giữ lại là duy trì hai nguồn dữ liệu song song có thể lệch nhau.
+--
+-- KHÔNG sửa 202607290002: file đó có thể đã chạy ở môi trường local/preview. Migration này
+-- idempotent (`drop column if exists`) nên đúng trong cả hai trạng thái: môi trường đã áp
+-- 202607290002 thì cột bị gỡ, môi trường chưa áp thì lệnh không làm gì.
+--
+-- An toàn dữ liệu: mọi giá trị từng ghi vào bốn cột này đều được sao chép nguyên vẹn từ
+-- `working_payload_json`/`draft_json` trong cùng transaction, nên không có dữ liệu nào chỉ tồn tại
+-- ở đây. Không cần backfill trước khi gỡ.
+
+alter table public.public_submissions
+  drop column if exists ward_admin_code_override,
+  drop column if exists ward_admin_code_override_reason,
+  drop column if exists scanned_file_names_override,
+  drop column if exists scanned_file_names_override_reason;
diff --git a/tests/completion-checks.test.ts b/tests/completion-checks.test.ts
index 0788ba1..73cc1b7 100644
--- a/tests/completion-checks.test.ts
+++ b/tests/completion-checks.test.ts
@@ -5,6 +5,7 @@ import {
 } from "@/modules/submissions/completion-checks";
 import type { SubmissionRecord } from "@/modules/public-intake/repository";
 import {
+  emptyAsset,
   emptyLandUse,
   emptyOwner,
   emptyParcel,
@@ -172,4 +173,42 @@ describe("Completion checks validation rules", () => {
     const checks = completionChecks(rec, draft);
     expect(checks.some((c) => c.code === "PARCEL_0_LAND_USES_EXCEEDED")).toBe(true);
   });
+
+  it("CC-ASSET: tài sản chưa chọn thửa bị chặn, thông báo chỉ rõ tài sản nào", () => {
+    const rec = makeRecord();
+    const draft = makeDraft({
+      assets: [
+        { ...emptyAsset("a1", "p1"), assetType: "NHA_O" },
+        // Tài sản mồ côi sau khi cán bộ xóa thửa — lưu được, nhưng không tiếp nhận được.
+        { ...emptyAsset("a2", ""), assetType: "CONG_TRINH", description: "Nhà kho sau vườn" },
+      ],
+    });
+
+    const detail = blockingCompletionIssueDetails(completionChecks(rec, draft)).find(
+      (issue) => issue.code === "ASSET_1_PARCEL_INVALID",
+    );
+    expect(detail).toBeDefined();
+    // Phải gọi tên đúng tài sản thứ 2, không phải một câu chung chung.
+    expect(detail?.label).toBe("Tài sản 2 (Công trình xây dựng khác — Nhà kho sau vườn) chưa chọn thửa đất");
+    expect(detail?.message).toContain("Thửa đất liên quan");
+    // Tài sản đã gắn thửa không bị báo.
+    expect(
+      completionChecks(rec, draft).some((check) => check.code === "ASSET_0_PARCEL_INVALID"),
+    ).toBe(false);
+  });
+
+  it("CC-PII: lý do ghi đè chứa CCCD bị chặn tiếp nhận", () => {
+    const rec = makeRecord();
+    const draft = makeDraft({
+      wardAdministrativeCodeOverride: "07999",
+      wardAdministrativeCodeOverrideReason: "Theo hồ sơ của ông A 012345678901 đã nộp",
+    });
+
+    const detail = blockingCompletionIssueDetails(completionChecks(rec, draft)).find(
+      (issue) => issue.code === "OVERRIDE_REASON_CONTAINS_CITIZEN_ID",
+    );
+    expect(detail).toBeDefined();
+    // Thông báo trả ra màn hình cán bộ không được chép lại chính số CCCD.
+    expect(JSON.stringify(detail)).not.toContain("012345678901");
+  });
 });
diff --git a/tests/full-pl3-editor.test.ts b/tests/full-pl3-editor.test.ts
index 125c369..4704788 100644
--- a/tests/full-pl3-editor.test.ts
+++ b/tests/full-pl3-editor.test.ts
@@ -3,7 +3,11 @@ import path from "node:path";
 
 import { describe, expect, it } from "vitest";
 
-import { draftSchema, validateWorkingPayloadForSave } from "@/modules/public-intake/validation";
+import {
+  draftSchema,
+  overrideReasonsWithCitizenIdLike,
+  validateWorkingPayloadForSave,
+} from "@/modules/public-intake/validation";
 import {
   MAX_AUDIT_FIELD_PATHS,
   summarizeWorkingPayloadChanges,
@@ -149,6 +153,46 @@ describe("full PL3 working payload", () => {
     expect(reconciled.assets[1].parcelId).toBe("");
   });
 
+  it("từ chối lưu khi ô lý do ghi đè chứa CCCD, ở cả ba ô lý do", () => {
+    for (const mutate of [
+      (draft: IntakeDraft) => {
+        draft.wardAdministrativeCodeOverrideReason = "Đối chiếu hồ sơ CCCD 012345678901 đã nộp";
+      },
+      (draft: IntakeDraft) => {
+        draft.scannedFileNamesOverrideReason = "Theo giấy tờ của 012345678901 tại kho";
+      },
+      (draft: IntakeDraft) => {
+        draft.parcels[0].cadastralMapSheetOverrideReason = "Chủ hộ 012345678901 xác nhận tại chỗ";
+      },
+    ]) {
+      const draft = fullDraft();
+      mutate(draft);
+      const error = validateWorkingPayloadForSave(draft);
+      expect(error).toContain("không được chứa số định danh cá nhân");
+      // Thông báo không được chép lại chính chuỗi PII vào lỗi trả cho client.
+      expect(error).not.toContain("012345678901");
+    }
+  });
+
+  it("bắt cả CCCD viết có dấu cách/chấm/gạch, nhưng không bắt lý do nghiệp vụ bình thường", () => {
+    const spaced = fullDraft();
+    spaced.wardAdministrativeCodeOverrideReason = "Theo hồ sơ 0123 4567 8901 đã lưu";
+    expect(validateWorkingPayloadForSave(spaced)).toContain("không được chứa");
+
+    // Lý do hợp lệ có số (số tờ, số thửa, năm) không được báo nhầm.
+    const clean = fullDraft();
+    clean.wardAdministrativeCodeOverrideReason = "Theo bản đồ địa chính tờ 105 lập năm 2024";
+    expect(validateWorkingPayloadForSave(clean)).toBeNull();
+  });
+
+  it("completionChecks chặn tiếp nhận với dữ liệu đã lưu trước khi có luật PII", () => {
+    const draft = fullDraft();
+    draft.scannedFileNamesOverrideReason = "Bàn giao cho ông A 012345678901 ký nhận";
+    expect(overrideReasonsWithCitizenIdLike(draft)).toEqual([
+      "Lý do ghi đè cột AX (tên file quét)",
+    ]);
+  });
+
   it("migration bổ sung đầy đủ cột normalized cho owner/parcel/asset và payload chính thức", () => {
     const migration = fs.readFileSync(
       path.join(process.cwd(), "supabase/migrations/202607290002_full_pl3_editor.sql"),
```

## 22. Agent declaration

Agent xác nhận:

- Đã đọc `CLAUDE.md`, `AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md` và các phần liên quan của
  `docs/brain/` trước khi sửa code.
- Không tự mở rộng phạm vi ngoài 4 quyết định người dùng chốt. Một lựa chọn vượt quá câu chữ yêu cầu
  (chặn PII ở hai cửa thay vì một) đã nêu rõ và giải thích tại §5 và §8 Phase 1.
- Không có thay đổi nào của người dùng để ghi đè (`git status` trống ở baseline).
- **Không chạm database thật.** Không tạo, sửa, xóa bản ghi nào; không áp migration lên môi trường nào.
- Trang harness kiểm tra giao diện và file test tạm đã bị xóa; `.claude/launch.json` đã khôi phục;
  đã kiểm `git status` để chắc không có file rác trong commit.
- Không đưa secret, dữ liệu cá nhân hay dữ liệu nghiệp vụ thật vào báo cáo. Chuỗi `012345678901` xuất
  hiện trong báo cáo là **số dựng để test**, không phải CCCD của ai.
- Không tự merge, không tự deploy.
- Kết quả test/build/lint/typecheck tại §4 và §12 ghi đúng theo lệnh thực tế đã chạy, gồm cả lần
  build FAIL và cách xử lý.
- Các nội dung chưa xác minh được đánh dấu rõ: E2E `NOT_RUN`, security-review `NOT_RUN`, AC-28
  (preflight) chưa chạy thật, và giới hạn của kiểm tra giao diện nêu ở cuối §14.
