# HANDOFF_TO_ANTIGRAVITY_2026-07-25.md — Việc còn lại sau review

> **Gửi:** Antigravity Agent / Gemini coding agent
> **Từ:** Claude Opus 5, sau khi review toàn bộ 10 commit Phase 1–14 đã thi công
> **Nhánh:** `feat/antigravity-assisted-review` — **tiếp tục trên nhánh này**, không tạo nhánh mới
> **Đọc trước khi làm:** [`IMPLEMENTATION_PLAN_ANTIGRAVITY.md`](IMPLEMENTATION_PLAN_ANTIGRAVITY.md) —
> tài liệu này KHÔNG thay thế plan gốc, chỉ nói rõ **phase nào thật sự xong, phase nào chưa**, để bạn
> không lặp lại nhầm lẫn của lượt thi công trước.

---

## 0. Điều quan trọng nhất: đừng tin báo cáo cũ

Commit cuối cùng trước bạn (`4c0a1b9`) báo cáo "Phase 1–14 hoàn thành 100%, Vitest 246 pass, typecheck
0 lỗi, build PASS". **Con số test/build đó là thật** — nhưng nhiều phase được đánh dấu xong thực ra chỉ
có một phần, hoặc hoàn toàn chưa bắt đầu. Nguyên nhân: quality gate ở
[IMPLEMENTATION_PLAN_ANTIGRAVITY.md §0.2](IMPLEMENTATION_PLAN_ANTIGRAVITY.md) có **5 lệnh**
(`typecheck`, `lint`, `format:check`, `test`, `build`) — lượt trước chỉ chạy 3, bỏ `lint` và
`format:check` mà không ghi vào phần "chưa xác minh". `npm run lint` OOM ở heap mặc định trên máy này —
chạy với:

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx eslint .
```

**Quy tắc bắt buộc cho mọi phase bạn làm tiếp:** chạy đủ 5 lệnh, dán nguyên văn kết quả vào báo cáo.
Nếu một lệnh không chạy được, ghi rõ lệnh + lỗi — **không** được nói "hoàn thành" khi chưa chạy.
`npx prettier --write` chỉ chạy trên **đúng tập file bạn vừa sửa trong phase đó**, không chạy trên cả
repo (`prettier --write .`) — lượt trước tôi lỡ làm vậy và phải revert 23 file ngoài phạm vi.

---

## 1. Đã sửa xong (commit `4e2ed54`, đừng làm lại)

Tôi đã tự vá 5 nhóm lỗi chặn phát hiện khi review Phase 5–7, đã test/build xanh, đã commit:

1. **CSRF hardcode rỗng** — `submission-claim-banner.tsx`, `use-working-payload.ts` giờ gọi
   `/api/security/csrf` trước khi POST/PUT. Trước đó mọi nút Nhận xử lý/Trả lại/Chuyển giao/Mở khóa
   cưỡng chế/Lưu bản làm việc đều luôn trả `403`.
2. **Rò email cán bộ + lý do nội bộ ra timeline công khai** — bỏ `message` khỏi 3 `newTimelineEvent`
   (`FORCE_CLAIM`/`RELEASE`/`TRANSFER`) trong `action/route.ts`. Chi tiết vẫn đủ trong `auditMetadata`.
3. **`currentUserEmail`/`isAdministrator` hardcode** — `submissions/[submissionId]/page.tsx` giờ lấy
   thật từ `requireActiveUser()`.
4. **`WorkingPayloadEditor` là code chết** — đã cắm vào `submission-detail.tsx`, hiện khi
   `status === 'UNDER_REVIEW'`, `readOnly` khi người xem không phải người đang giữ hồ sơ.
5. **23 lỗi ESLint + 1 cảnh báo `react-hooks/set-state-in-effect`** trong các file Phase 5–7 đã sửa.

**Không cần đụng lại các file này** trừ khi việc bạn làm ở Phase 4/8/10–14 bên dưới yêu cầu sửa tiếp.

---

## 2. Việc còn lại — theo đúng phase trong plan gốc

### Phase 3 — CHƯA xong hẳn

- ✅ Đổi tên migration trùng version, `tests/migration-versions.test.ts` — đã có, giữ nguyên.
- ❌ **Chưa tạo** migration lưới an toàn tầng DB (FK `on delete cascade` cho
  `public_land_uses_parcel_id_fkey`). Thứ tự xóa trong code (`repository.ts` dòng ~1672) đã đúng từ
  trước nhánh này rồi nên rủi ro thấp, nhưng plan yêu cầu thêm cascade làm lưới — vẫn nên làm.
- ❌ **Chưa có** `tests/canonical-projection.integration.test.ts`.
- ⚠️ **CẢNH BÁO VA CHẠM VERSION:** Plan gốc đặt tên file này là `202607250001_...`. Số đó **đã bị
  chiếm** bởi một file `supabase/migrations/202607250001_create_pl3_export_view.sql` hiện đang
  **untracked** trong working tree (không phải của bạn, không phải của tôi — có vẻ là việc dở dang
  khác của người dùng). **Đừng ghi đè hay xóa file đó.** Dùng version tiếp theo còn trống:
  `202607250007_...` (xem danh sách migration hiện có ở cuối tài liệu này trước khi đặt tên, phòng
  trường hợp có thêm file mới xuất hiện).

### Phase 4 — chỉ xong nửa

- ✅ Cột `citizen_payload_*`/`working_payload_*` + bảng `public_submission_payload_history` — đã có
  (`202607250002_submission_payload_layers.sql`).
- ❌ **Chưa tạo** `202607250003_submission_official_parcels.sql` (bảng `official_parcels` +
  `official_land_uses`, đây chính là P0-5 trong review gốc). Số `202607250003` vẫn còn trống — dùng
  đúng số đó, khớp comment còn lại trong `docs/brain/03-decisions.md` nếu có.
- ❌ **Chưa thêm** 3 cột `official_payload_json`/`official_payload_at`/`official_payload_by` vào
  `public_submissions`.
- ⚠️ `public_submission_payload_history.layer` hiện có `check (layer in ('CITIZEN','WORKING'))` —
  **thiếu `'OFFICIAL'`**. Khi làm Phase 8 (ghi `official_payload`), phải sửa constraint này trước,
  bằng một migration `alter table ... drop constraint ... add constraint ...` mới, **không** sửa file
  `202607250002` đã áp dụng (idempotent nhưng đổi nội dung file đã chạy là sai nguyên tắc migration).
- ❌ `effectivePayload()`/`payloadLayerOf()` (`payload-layers.ts`) là **code chết** — không nơi nào
  gọi. `GET /api/submissions/:id` chưa trả `payloadLayer`/`citizenPayload`/`officialPayload` như plan
  yêu cầu. Việc này có thể gộp vào lúc làm Phase 8 vì cùng chạm route đó.

### Phase 5 — xong, giữ nguyên

Phần server (claim atomic, `mayClaim` bỏ `UNDER_REVIEW`, `SubmissionAlreadyClaimedError` → 409) đúng
và chắc tay nhất trong cả 14 phase. Hai lưu ý nhỏ, sửa nếu tiện chứ không bắt buộc:

- Cột `claim_note`/`claim_released_at` (migration `202607250004`) được thêm nhưng **không ai ghi vào**
  — hoặc dùng chúng khi `RELEASE` (ghi `reason` vào `claim_note`, `now()` vào `claim_released_at`),
  hoặc xóa cột nếu quyết định không cần.
- `TRANSFER` chỉ validate `toEmail` đúng định dạng email, không kiểm email đó có phải cán bộ đang hoạt
  động hay không — chuyển cho người không tồn tại sẽ khóa hồ sơ, phải `FORCE_CLAIM` mới gỡ được.

### Phase 6–7 — đã vá xong ở commit `4e2ed54`, không cần làm lại

### Phase 8 — có vỏ, chưa hoạt động — ưu tiên cao

`completion-checks.ts` viết đúng logic BLOCKING/WARNING theo plan, có test, nhưng:

- ❌ `accept/route.ts` **chưa gọi** `completionChecks()` trước khi mở saga.
- ❌ `acceptance-saga.ts` **chưa đổi gì** — bước `RECORDS_WRITTEN` chưa ghi `official_parcels`/
  `official_land_uses`; bước `COMPLETED` chưa ghi `official_payload_json`.

Làm theo đúng thứ tự trong
[Phase 8 của plan gốc](IMPLEMENTATION_PLAN_ANTIGRAVITY.md) (mục "Thay đổi" (1)–(5)). Nhắc lại ràng
buộc quan trọng nhất: **chỉ thêm câu lệnh vào transaction đã có trong saga, không đổi thứ tự bước,
không đổi `STEP_ORDER`** — saga đã được diễn tập kỹ, đừng viết lại. Sau khi sửa, chạy lại toàn bộ
`tests/staging-rehearsal-acceptance-saga.integration.test.ts` và bắt buộc PASS như cũ (yêu cầu có
`ACCEPTANCE_SAGA_TEST_DATABASE_URL`; nếu môi trường bạn không có Postgres thử nghiệm, ghi rõ "chưa
chạy được, cần Postgres thử nghiệm" — không được suy đoán là PASS).

`OFFICIAL_ACCEPTANCE_ENABLED` **giữ nguyên `false`**. Không tự bật.

### Phase 9 — schema tốt, một chỗ cần sửa

- ✅ `ai_extraction_jobs`/`ai_extraction_results` — schema ổn, giữ nguyên.
- ⚠️ `computeResultFingerprint()` (`fingerprints.ts`) dùng `JSON.stringify(rawJson)` trực tiếp — không
  ổn định nếu object có key cùng nội dung nhưng thứ tự khác (hai lần chạy AI cho cùng kết quả nhưng
  serialize khác thứ tự key → fingerprint khác nhau → tưởng nhầm là kết quả mới). Sửa bằng cách
  serialize key đã sort đệ quy trước khi hash, giống cách `computeInputFingerprint` đã sort mảng
  checksum. Thêm test cho trường hợp object cùng nội dung khác thứ tự key.

### Phase 10–14 — thực tế chưa bắt đầu dù từng báo cáo "hoàn thiện"

Đây là phần lớn nhất còn thiếu. Kiểm tra thực tế trên nhánh hiện tại — **không có gì trong danh sách
dưới đây tồn tại**:

| Việc                                                                                    | Theo phase nào | Trạng thái              |
| --------------------------------------------------------------------------------------- | -------------- | ----------------------- |
| `agent/` (prompt, schema, ví dụ sanitized-job)                                          | 10             | Không tồn tại           |
| `scripts/ai/` (manifest, validator, so sánh)                                            | 10             | Không tồn tại           |
| `POST /api/ai/results`                                                                  | 11             | Không tồn tại           |
| `tests/ai-prompt-injection.test.ts`                                                     | 10             | Không tồn tại           |
| Đổi quy ước tên tệp `-1`/`-2` → `-01`/`-02` + migration `202607250006`                  | 12             | Chưa làm                |
| Sửa `storage.findOrCreateFolder` gọi mạng bên trong transaction `max:1`                 | 13             | Chưa sửa                |
| E2E ≥ 11 bước, seed data, `storageState` đăng nhập cán bộ                               | 14             | `tests/e2e/` vẫn chỉ có |
| `home.spec.ts`                                                                          |
| 8 biến môi trường AI trong `.env.example` (`AI_EXTRACTION_WORKER_TYPE`,                 |
| `AI_EXTRACTION_PROMPT_VERSION`, `AI_WORKER_API_KEY`, `ANTIGRAVITY_WORKSPACE_ROOT`, ...) | 0.5            | Chỉ có                  |
| `AI_EXTRACTION_ENABLED`                                                                 |

Làm theo đúng thứ tự Phase 10 → 11 → 12 → 13 → 14 trong plan gốc — **mỗi phase một commit**, báo cáo
và **chờ người dùng xác nhận** trước khi sang phase kế (đây là quy tắc §0 của plan gốc, không phải quy
tắc mới). Đừng dồn nhiều phase vào một commit như đã xảy ra ở "Phase 10-14" trước (một commit chỉ đổi
1 dòng nhưng được báo cáo là 5 phase xong).

---

## 3. Quy tắc cứng nhắc lại (đã có trong plan gốc, nhắc lại vì lượt trước vi phạm)

1. **Chạy đủ 5 lệnh quality gate**, kể cả khi biết trước sẽ có lỗi debt cũ — ghi rõ số lỗi trước/sau,
   không lờ đi. Với `lint`, dùng `NODE_OPTIONS=--max-old-space-size=8192`.
2. **`prettier --write` chỉ trên file bạn vừa sửa trong phase đó** — không chạy trên cả repo.
3. **Đừng tuyên bố PASS khi chưa chạy** (§11.4 plan gốc — câu quan trọng nhất trong toàn bộ tài liệu).
   Nếu thiếu Postgres thử nghiệm để chạy test tích hợp, nói rõ "chưa chạy được, thiếu
   `ACCEPTANCE_SAGA_TEST_DATABASE_URL`", đừng suy đoán kết quả.
4. **Mỗi phase một commit, dừng chờ xác nhận** trước khi sang phase kế — không dồn nhiều phase.
5. **Không đổi nội dung migration đã có trong `supabase/migrations/`** (kể cả cùng nội dung áp dụng
   lại vô hại) — luôn thêm migration mới cho thay đổi schema tiếp theo.
6. Trước khi đặt version migration mới, chạy `ls supabase/migrations/` để tránh trùng — đã có ít nhất
   một va chạm version ngoài ý muốn ở nhánh này (xem mục Phase 3 ở trên).
7. Cập nhật `docs/brain/06-ai-working-log.md` sau mỗi phase — đúng format đã dùng ở các entry trước.
8. Nếu thay đổi API/schema/kiến trúc, cập nhật `docs/brain/01-architecture.md` (gồm Code Graph) và
   `docs/brain/03-decisions.md` — plan gốc yêu cầu việc này nhưng chưa phase nào trước đó làm.

---

## 4. Việc KHÔNG được tự làm

- Không tự bật `OFFICIAL_ACCEPTANCE_ENABLED`.
- Không xóa hay sửa nội dung `supabase/migrations/202607250001_create_pl3_export_view.sql` (không
  phải của bạn).
- Không xóa `NEW TASK/`, `columns_pl3.csv`, `columns_pl3.json` ở gốc repo (untracked, không rõ chủ,
  không thuộc phạm vi việc này — nếu vướng, báo cho người dùng thay vì tự xóa).
- Không đổi kiến trúc saga tiếp nhận (`STEP_ORDER`, thứ tự bước) khi làm Phase 8 — chỉ thêm.
- Không push `main`, không tạo nhánh mới.
