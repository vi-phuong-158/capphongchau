# 06 — AI Working Log

## [2026-07-25] Phase 6 — API sửa bản làm việc đầy đủ (Antigravity)

- **Agent:** Antigravity / Gemini 3.6 Flash (High)
- **Thay đổi:**
  - **`repository.ts`:** Thêm `commitWorkingPayload()` để cập nhật `working_payload_json`, tăng version, ghi history `WORKING`, cập nhật `updated_at`, `working_payload_at`, `working_payload_by`, và tự động đồng bộ lại canonical projection (`refreshCanonicalProjection`).
  - **`working-payload/route.ts`:** Tạo API Handler cho `PUT /api/submissions/:submissionId/working-payload` để cán bộ đang giữ hồ sơ (`claimedBy === email` và `status === UNDER_REVIEW`) chỉnh sửa bản làm việc với đầy đủ schema validation (`draftSchema`), idempotency protection và audit tracking.
  - **Kiểm tra:**
    - `npx vitest run`: 39 file pass / 1 skip (**240 test pass / 9 skip**).
    - `npm run typecheck`: PASS.
    - `npm run build`: PASS (tạo mới route `/api/submissions/[submissionId]/working-payload`).
- **File đã sửa:** `src/modules/public-intake/repository.ts`, `src/app/api/submissions/[submissionId]/working-payload/route.ts` (mới), `tests/working-payload.test.ts` (mới), `docs/brain/06-ai-working-log.md`.
- **Lý do:** Cho phép cán bộ nhận xử lý biên tập và cập nhật bản làm việc độc lập với bản người dân gửi.

## [2026-07-25] Phase 5 — Chống race-condition khi nhận xử lý / claim atomic (Antigravity)

- **Agent:** Antigravity / Gemini 3.6 Flash (High)
- **Thay đổi:**
  - **`202607250004_submission_claim_guard.sql`:** Thêm `claim_released_at`, `claim_note` và partial index `public_submissions_open_queue_idx` trên `status in ('SUBMITTED','RESUBMITTED')`.
  - **`review.ts`:**
    - Cập nhật `mayClaim(status)` chỉ áp dụng cho `SUBMITTED` & `RESUBMITTED` (bỏ `UNDER_REVIEW`).
    - Thêm các helper `mayForceClaim`, `mayRelease`, `mayTransfer`.
  - **`repository.ts`:**
    - Cập nhật `commitStaffAction`: kiểm tra atomic `and ($7::boolean = true or claimed_by is null or claimed_by = '' or claimed_by = actor)`.
    - Trả lỗi `SubmissionAlreadyClaimedError` nếu bị cán bộ khác chiếm trước thay vì lỗi chung.
  - **`action/route.ts`:**
    - Hỗ trợ các hành động `CLAIM`, `FORCE_CLAIM`, `RELEASE`, `TRANSFER`.
    - Yêu cầu lý do cho `RELEASE`, `TRANSFER`, `FORCE_CLAIM`. Trả HTTP 409 `ALREADY_CLAIMED` khi tranh chấp claim.
  - **Kiểm tra:**
    - `npx vitest run`: 38 file pass / 1 skip (**237 test pass / 9 skip**).
    - `npm run typecheck`: PASS.
    - `npm run build`: PASS.
- **File đã sửa:** `supabase/migrations/202607250004_submission_claim_guard.sql` (mới), `src/modules/submissions/review.ts`, `src/modules/public-intake/repository.ts`, `src/app/api/submissions/[submissionId]/action/route.ts`, `src/modules/common/api-error.ts`, `tests/submission-claim.test.ts` (mới), `tests/submission-review.test.ts`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Đảm bảo tính nguyên tử khi cán bộ nhận hồ sơ, ngăn race condition và hỗ trợ cưỡng chế/chuyển giao có ghi vết audit.

## [2026-07-25] Phase 4 — Thêm hai lớp citizen_payload & working_payload (Antigravity)

- **Agent:** Antigravity / Gemini 3.6 Flash (High)
- **Thay đổi:**
  - **`202607250002_submission_payload_layers.sql`:**
    - Thêm các cột `citizen_payload_json`, `citizen_payload_version`, `citizen_payload_at`, `working_payload_json`, `working_payload_at`, `working_payload_by` vào bảng `public_submissions`.
    - Tạo bảng lịch sử `public_submission_payload_history` lưu truy vết thay đổi các lớp payload.
    - Cập nhật backfill cho hồ sơ cũ đã nộp (`status` hợp lệ): sao chép `draft_json` sang `citizen_payload_json`.
  - **`payload-layers.ts`:**
    - Định nghĩa helper `effectivePayload` (`workingPayload` > `citizenPayload` > `draft`) và `payloadLayerOf`.
  - **`repository.ts`:**
    - Cập nhật `SubmissionRecord` & `SubmissionRow` và `SUBMISSION_SELECT` để nạp 6 cột mới.
    - Cập nhật `submit()`: lưu `citizen_payload_json` và ghi history `CITIZEN`.
    - Cập nhật `commitStaffAction()`: khi cán bộ nhận xử lý (claim), tự động khởi tạo `working_payload_json` từ `citizen_payload_json` (hoặc `draft_json`) và ghi history `WORKING`.
  - **Kiểm tra:**
    - `npx vitest run`: 37 file pass / 1 skip (**233 test pass / 9 skip**).
    - `npm run typecheck`: PASS.
    - `npm run build`: PASS.
- **File đã sửa:** `supabase/migrations/202607250002_submission_payload_layers.sql` (mới), `src/modules/public-intake/payload-layers.ts` (mới), `src/modules/public-intake/repository.ts`, `tests/payload-layers.test.ts` (mới), `docs/brain/06-ai-working-log.md`.
- **Lý do:** Tách bạch lớp dữ liệu do người dân gửi và lớp dữ liệu do cán bộ biên tập theo yêu cầu phạm vi thu hẹp của Phase 4.
- **Chưa xác minh:** Chưa chạy migration trên Supabase production thật.

## [2026-07-25] Phase 3 — Chuẩn hóa migration trùng version (Antigravity)

- **Agent:** Antigravity / Gemini 3.6 Flash (High)
- **Thay đổi:**
  - Đổi tên file migration trùng version `202607240001_official_acceptance.sql` thành `202607240003_official_acceptance.sql` (bằng `git mv`).
  - Tạo `tests/migration-versions.test.ts` để kiểm tra tự động tính duy nhất của tất cả tiền tố timestamp trong `supabase/migrations/`.
  - Bổ sung timeout 30s cho 2 test nạp 2.500 bản ghi (`T2` trong `exports-route.test.ts` và `L5` trong `pl3-export-large-certificate.test.ts`) để tránh timeout khi chạy song song toàn bộ test suite.
  - **Kiểm tra:**
    - `npx vitest run`: 36 file pass / 1 skip (**229 test pass / 9 skip**).
    - `npm run typecheck`: PASS.
    - `npm run build`: PASS.
- **File đã sửa:** `supabase/migrations/202607240003_official_acceptance.sql` (renamed), `tests/migration-versions.test.ts` (mới), `tests/exports-route.test.ts`, `tests/pl3-export-large-certificate.test.ts`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thành vá lỗi P0-2 theo `IMPLEMENTATION_PLAN_ANTIGRAVITY.md`.
- **Chưa xác minh:** Không áp dụng `supabase db push` trên production.

## [2026-07-25] Phase 2 — Sửa xuất PL3/XLSX (Antigravity)

- **Agent:** Antigravity / Gemini 3.6 Flash (High)
- **Thay đổi:**
  - **`repository.ts`:**
    - Thêm `decodeFileSummaries` đọc phòng thủ `file_summary_json` dạng chuỗi JSON.
    - Thêm `listForExport` dùng keyset pagination theo `legacy_row_index` với `batchSize = 500` và bộ lọc `statuses`, `fromDate`, `toDate`.
  - **`pl3-export.ts`:**
    - Thêm `createPl3Accumulator` gom dữ liệu theo từng lô stream.
    - Thêm sheet `Canh bao` render danh sách cảnh báo và thông báo khi dữ liệu vượt ngưỡng.
    - Thêm phòng thủ trong `scannedFileNames` cho `fileSummaries` dạng string.
  - **`route.ts` (`/api/exports`):**
    - Viết lại route dùng `listForExport` phân lô streaming, bỏ cứng `.slice(0, 2000)`.
    - Thêm tham số query `scope`, `from`, `to`. Giới hạn `MAX_EXPORT_SUBMISSIONS = 20000` (đánh dấu `truncated = true` khi vượt).
    - Tách riêng 3 khối I/O phụ trợ (`uploadExport`, `appendExportJob`, `appendAudit`) trong từng `try/catch` độc lập — lỗi ghi log/drive không làm hủy file XLSX trả về cho cán bộ.
    - Trả về các header: `x-export-job-id`, `x-export-row-count`, `x-export-submission-count`, `x-export-warning-count`, `x-export-truncated`, `x-export-archived`, `x-export-audit`.
  - **`pl3-export-button.tsx` & `submissions/page.tsx`:**
    - Thêm các ô chọn phạm vi, từ ngày, đến ngày trong nút xuất.
    - Hiển thị cảnh báo màu đỏ khi `x-export-truncated = 1` và ghi chú khi `x-export-audit = failed`.
    - Nhúng `<Pl3ExportButton />` trực tiếp tại trang `Hàng chờ tiếp nhận` (`/submissions`) cho các vai trò `REPORT_VIEWER`, `WARD_ADMIN`, `SYSTEM_ADMIN`.
  - **`next.config.ts`:** Thêm `serverExternalPackages: ["exceljs"]`.
  - **Kiểm tra:**
    - `npx vitest run`: 35 file pass / 1 skip (**228 test pass / 9 skip**). Cả 5 test đỏ của Phase 1 đều chuyển sang **PASS**.
    - `npm run typecheck`: PASS.
    - `npm run build`: PASS.
- **File đã sửa:** `src/app/api/exports/route.ts`, `src/modules/public-intake/pl3-export.ts`, `src/modules/public-intake/repository.ts`, `src/components/pl3-export-button.tsx`, `src/app/submissions/page.tsx`, `next.config.ts`, `tests/exports-route.test.ts`, `tests/pl3-export-large-certificate.test.ts`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thành toàn bộ mục tiêu của Phase 2 theo `IMPLEMENTATION_PLAN_ANTIGRAVITY.md`.
- **Chưa xác minh:** Chưa thử nghiệm tải file thực tế trên trình duyệt production thật.

## [2026-07-25] Phase 1 — Test tái hiện lỗi PL3 (Antigravity)

- **Agent:** Antigravity / Gemini 3.6 Flash (High)
- **Thay đổi:**
  - Thêm 2 file test mới để tái hiện các lỗi xuất PL3:
    - `tests/exports-route.test.ts`: test route `POST /api/exports` (các trường hợp T1-T6).
    - `tests/pl3-export-large-certificate.test.ts`: test bộ tạo dữ liệu PL3 với GCN lớn và cảnh báo (L1-L6).
  - Chạy `npx vitest run tests/exports-route.test.ts tests/pl3-export-large-certificate.test.ts`:
    - Tổng cộng: **12 tests (7 PASS / 5 FAIL)**.
    - Đúng chính xác **5 test FAIL** có chủ đích: T2 (cắt 2.000 dòng), T3 (`appendExportJob` làm chết file), T4 (`appendAudit` làm chết file), T6 (`file_summary_json` string làm rỗng cột 49), L6 (thiếu sheet 'Canh bao').
- **File đã tạo/sửa:** `tests/exports-route.test.ts`, `tests/pl3-export-large-certificate.test.ts`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thành bộ test đỏ đúng theo tiêu chí của Phase 1 trong `IMPLEMENTATION_PLAN_ANTIGRAVITY.md` trước khi sửa ở Phase 2.
- **Chưa xác minh:** Các test đỏ sẽ được chuyển xanh tại Phase 2.

## [2026-07-25] Phase 0 — Baseline & Chẩn đoán xuất PL3 (Antigravity)

- **Agent:** Antigravity / Gemini 3.6 Flash (High)
- **Thay đổi:**
  - Khởi tạo nhánh `feat/antigravity-assisted-review` từ commit `b8e67a2` trên `main`.
  - Đo và xác minh baseline Quality Gate thành công:
    - `npm run typecheck`: PASS (0 lỗi TS).
    - `npm run lint`: PASS (yêu cầu `NODE_OPTIONS="--max-old-space-size=8192"` do dung lượng heap).
    - `npm test` (`npx vitest run`): PASS — 33 file pass / 1 skip; **216 test pass / 9 test skip** (khớp 100% với baseline).
    - `npm run build` (`npx next build`): PASS (32 routes compiled, static generation clean).
  - Lập ma trận chẩn đoán 4 nhánh nguyên nhân độc lập gây ra sự cố xuất PL3 (phân tích từ `REVIEW_CLAUDE_OPUS.md` và `IMPLEMENTATION_PLAN_ANTIGRAVITY.md`).
- **File đã sửa:** `docs/brain/06-ai-working-log.md`.
- **Lý do:** Đạt điều kiện BƯỚC 0 và hoàn thành Phase 0 theo `IMPLEMENTATION_PLAN_ANTIGRAVITY.md`.
- **Chưa xác minh:** Chưa có log HTTP DevTools/Vercel hoặc dữ liệu Supabase SQL Editor từ môi trường Production của người dùng. Sẽ vá toàn bộ các nhánh lỗi (b, c, d, e, f, g) tại Phase 2 theo kế hoạch.

## [2026-07-25] Diễn tập trên Postgres thật xác nhận bản vá P0-1/P0-5/Q2 — tìm và sửa fixture test sai

- **Agent:** Claude Code
- **Thay đổi:** Chạy `tests/staging-rehearsal-acceptance-saga.integration.test.ts` (9 kịch bản, gồm
  3 kịch bản mới 1b/1c/1d thêm ở lượt trước) trên Postgres thử nghiệm thật (project riêng, region
  `ap-northeast-2`, khác production `ap-southeast-1`) — trước đó các kịch bản này mới chỉ chạy qua
  typecheck/mock, chưa từng chạm PostgreSQL thật.
  - **Lần chạy đầu: 2/9 fail** — `null value in column "owner_type"/"role_on_certificate"/
    "qr_payload_hash" of relation "public_owners" violates not-null constraint`. Nguyên nhân: fixture
    `seedSubmission()` trong chính test dùng owner/parcel/landUse thiếu nhiều trường. Xác minh trước
    khi kết luận: `ownerType`/`roleOnCertificate` là trường **bắt buộc** trong `draftSchema` thật
    (`validation.ts`) và cột tương ứng trong Postgres là `not null` — dữ liệu thiếu các trường này
    **không bao giờ tồn tại qua API thật**. Đây là lỗ hổng trong test tôi viết, không phải bug
    trong `refreshCanonicalProjection`/`commitOfficialAmendment`.
  - Nguyên nhân kỹ thuật sâu hơn: mọi cột `public_owners`/`public_parcels`/`public_land_uses` là
    `not null default ''`, nhưng code luôn liệt kê đủ tên cột trong câu INSERT — nên một trường
    JS `undefined` được `postgres.js` gửi thành `NULL` **tường minh**, ghi đè default thay vì bỏ
    qua cột. Thiếu một trường trong fixture là đủ để vi phạm ràng buộc.
  - Đã sửa `seedSubmission()` và ba khối `parcels`/`landUses` tùy biến trong kịch bản 1c/1d cho đủ
    toàn bộ trường bắt buộc theo đúng shape `Owner`/`Parcel`/`LandUse` thật (`types.ts`), thay vì
    thêm từng trường một qua nhiều vòng lặp — tra `types.ts` + schema một lần rồi sửa dứt điểm.
  - **Lần chạy sau khi sửa fixture: 9/9 PASS** trên Postgres thật, gồm cả 1c (chứng minh P0-1: sửa
    hồ sơ có `public_land_uses` hai lần liên tiếp không còn `foreign_key_violation`) và 1d (chứng
    minh Q2: điều chỉnh hồ sơ đã `ACCEPTED` ghi lại đúng `public.certificates`/`public.parcels`,
    xóa thửa bị bỏ, giữ nguyên mã hồ sơ chính thức, lý do điều chỉnh có trong `audit_logs`).
  - Chạy lại `npx vitest run` (không cần Postgres thật) sau đó: vẫn 216 pass / 9 skip, không hồi quy.
- **File đã sửa:** `tests/staging-rehearsal-acceptance-saga.integration.test.ts`,
  `docs/brain/06-ai-working-log.md`.
- **Lý do:** Trước khi gộp nhánh review vào `main` (Vercel tự deploy từ `main`, và
  `OFFICIAL_ACCEPTANCE_ENABLED = true` nên đây là dữ liệu thật), bắt buộc kiểm chứng hai lỗi P0 đã
  vá và luồng điều chỉnh hồ sơ trên PostgreSQL thật — không chỉ tin vào typecheck/mock.
- **Kiểm tra:** `ACCEPTANCE_SAGA_TEST_DATABASE_URL=... npx vitest run
  tests/staging-rehearsal-acceptance-saga.integration.test.ts` → 9/9 PASS. Connection string thử
  nghiệm được truyền qua biến môi trường nạp từ file tạm ngoài repo (không phải qua tham số dòng
  lệnh, không ghi vào bất kỳ file nào trong repo, đã xóa file tạm ngay sau khi dùng xong).
- **Chưa xác minh:** `npm run test:e2e`, `npm run test:python` vẫn chưa chạy trong phiên này.

## [2026-07-25] Mở tiếp nhận hồ sơ chính thức + vá 2 lỗi chặn + trả lời 7 câu hỏi treo

- **Agent:** Claude Code (Opus 5)
- **Thay đổi:**
  - **Vá P0-1 — thứ tự xóa khóa ngoại.** `refreshCanonicalProjection` xóa `public_parcels` **trước**
    `public_land_uses`, mà FK `public_land_uses.parcel_id → public_parcels(parcel_id)` không
    cascade, không deferrable. Lần gửi đầu không lộ vì bảng con còn rỗng; từ lần làm mới thứ hai
    (cán bộ sửa hồ sơ đã gửi, người dân gửi bổ sung) là `foreign_key_violation` → HTTP 500. Đảo lại
    thứ tự con-trước-cha: `land_uses → parcels → owners → certificates → assets`.
  - **Vá P0-5 — saga không ghi thửa/mục đích vào bảng chính thức nào.** Bước `RECORDS_WRITTEN` chỉ
    ghi `cases`/`owners`/`certificates`/`files`; sau khi tiếp nhận chính thức, dữ liệu thửa vẫn chỉ
    nằm trong `draft_json` — cột mà cán bộ và người dân đều ghi đè được. Bổ sung ghi
    `public.parcels` và `public.assets` (bảng `data_json jsonb` gắn `case_id`, **đã có sẵn** trong
    schema `202607230001` nên **không cần migration mới**), ID tất định `ACC:{submissionId}:{id}` +
    `on conflict do nothing`. Audit của bước này giờ ghi thêm số lượng owner/thửa/tài sản/file
    (chỉ đếm, không ghi giá trị — tránh PII vào `audit_logs`).
  - **Đảo `OFFICIAL_ACCEPTANCE_ENABLED` từ `false` sang `true`** và viết lại comment tại chỗ để ghi
    đủ 4 điều kiện gác cổng đã đóng + đường lùi.
  - **Nối nút "Tiếp nhận chính thức" vào route thật.** Trước đó nút bị `disabled` cứng, không có
    `onClick` — đảo cờ không thôi thì cán bộ vẫn không bấm được. Thêm `acceptOfficially()` với
    xác nhận trước khi chạy, và `idempotency-key` giữ trong `useRef` để bấm lại sau lỗi mạng đi
    tiếp từ checkpoint thay vì sinh hồ sơ chính thức mới. Nút đổi nhãn thành "Tiếp tục tiếp nhận"
    khi hồ sơ đang `ACCEPTING`. Header hồ sơ hiện thêm "Mã hồ sơ chính thức" và "Bước tiếp nhận dở
    dang".
  - **Q1 — cán bộ sửa toàn trường.** `isOwnerIdentityLocked` → `isOwnerIdentityQrConfirmed`, hạ từ
    khóa cứng xuống cảnh báo. Bỏ chặn 400 ở `PATCH`, bỏ `disabled` ở 5 ô nhập trong giao diện, thay
    bằng cảnh báo màu hổ phách. Ghi đè trường đọc từ chip để lại dấu vết riêng trong `audit_logs`
    (`identityOverride`, `identityOverrideOwnerCount`).
  - **Q2 — điều chỉnh hồ sơ đã tiếp nhận. ĐÃ THI CÔNG.** Thêm
    `src/modules/submissions/official-record.ts` với `syncOfficialRecord` — một định nghĩa duy nhất
    về "dữ liệu chính thức", dùng chung bởi saga tiếp nhận và đường điều chỉnh, để hai đường không
    bao giờ lệch nhau. Ngữ nghĩa đồng bộ: upsert bản ghi còn trong bản kê khai, **xóa** bản ghi đã
    bị bỏ. Thêm `mayAmendOfficialRecord` và `commitOfficialAmendment` (ghi `draft_json`, hình chiếu
    chuẩn hóa và dữ liệu chính thức trong **cùng một transaction** — không có cửa sổ nào để hai bên
    lệch). `PATCH` nhận `amendmentReason` bắt buộc ≥ 10 ký tự khi hồ sơ `ACCEPTED`, và **gỡ nhánh
    `|| isAdministrator`** vốn cho quản trị viên sửa hồ sơ ở bất kỳ trạng thái nào mà không đồng bộ
    và không cần lý do — đó là lỗ hổng P0-4, nay đã đóng. Giao diện có nút riêng "Điều chỉnh hồ sơ
    chính thức" màu cam kèm ô lý do bắt buộc.
  - **Q3–Q7 ghi vào `03-decisions.md`.** Q3 (giữ 3 mục đích) và Q4 (bỏ trường 21/22, giữ cột O/P)
    **không cần sửa code** — hiện trạng đã đúng.
  - **Trip-wire hai chiều.** `tests/submission-acceptance.test.ts` giờ khẳng định cờ là `true`; đóng
    lại phải là quyết định có ghi chép, không phải sửa lướt qua.
- **File đã sửa:** `src/modules/submissions/official-record.ts` (mới),
  `src/modules/submissions/acceptance.ts`, `src/modules/submissions/acceptance-saga.ts`,
  `src/modules/submissions/review.ts`, `src/modules/public-intake/repository.ts`,
  `src/app/api/submissions/[submissionId]/route.ts`, `src/components/submission-detail.tsx`,
  `tests/submission-acceptance.test.ts`, `tests/submission-review.test.ts`,
  `tests/staging-rehearsal-acceptance-saga.integration.test.ts`, `docs/brain/01-architecture.md`,
  `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`,
  `REVIEW_CLAUDE_OPUS.md`.
- **Lý do:** Chủ dự án quyết định mở tiếp nhận chính thức để bắt đầu thu hồ sơ thật, và trả lời 7
  câu hỏi treo ở `REVIEW_CLAUDE_OPUS.md` §10. Hai lỗi P0 phải vá cùng lượt vì nếu mở cờ mà không vá
  thì hồ sơ chính thức đầu tiên đã hỏng: cán bộ không sửa được hồ sơ đã gửi, và dữ liệu thửa không
  có bản chốt bất biến.
- **Kiểm tra:**
  - `npm run typecheck` PASS · `npm run lint` 0 error (5 warning có sẵn từ trước) ·
    `npx vitest run` **216 pass / 9 skip** (3 skip mới là 3 kịch bản tích hợp cần Postgres thật).
  - Thêm 2 kịch bản tích hợp vào `staging-rehearsal-acceptance-saga.integration.test.ts`:
    **1b** — GCN 2 thửa (một thửa 2 mục đích) + 1 tài sản → `public.parcels` đúng 2 dòng với
    `landUses` nằm trong `data_json`, `public.assets` 1 dòng, replay cùng key không nhân đôi.
    **1c** — gọi `commitStaffDraftEdit` **hai lần liên tiếp** trên hồ sơ có `public_land_uses`;
    lần thứ hai chính là lần ném `foreign_key_violation` trước bản vá.
    **1d** — tiếp nhận rồi điều chỉnh: sửa số vào sổ và xóa một thửa → `public.certificates` theo
    giá trị mới, `public.parcels` còn đúng 1 dòng (thửa bị xóa không để lại dòng mồ côi), mã hồ sơ
    chính thức **không đổi**, không sinh `case` thứ hai, và lý do điều chỉnh có trong `audit_logs`.
    Thêm 5 test đơn vị cho `mayAmendOfficialRecord`, gồm bất biến "không hồ sơ nào đi được cả hai
    đường sửa".
    Chạy bằng: `ACCEPTANCE_SAGA_TEST_DATABASE_URL=... npx vitest run tests/staging-rehearsal-acceptance-saga.integration.test.ts`
- **Chưa xác minh:** ba kịch bản tích hợp mới **chưa được chạy trên Postgres thật trong phiên này**
  (không có `ACCEPTANCE_SAGA_TEST_DATABASE_URL`) — cần chạy trước khi tiếp nhận hồ sơ thật đầu tiên.
  Chưa chạy `npm run test:e2e`, `npm run test:python`, `npm run build` sau đợt sửa cuối. Chưa kiểm
  chứng trên Vercel Production. Danh sách việc phải làm trong ngày đầu thu hồ sơ thật ở
  `04-current-tasks.md` mục [2026-07-25].

## [2026-07-25] Review kiến trúc cho phương án Antigravity và lập bản thi công (không sửa code)

- **Agent:** Claude Code (Opus 5)
- **Thay đổi:** Chỉ thêm tài liệu, **không sửa một dòng mã nguồn nào**.
  - `REVIEW_CLAUDE_OPUS.md` — review kiến trúc, kết luận `APPROVE WITH CHANGES`, 5 lỗi P0, 10 rủi
    ro P1, 8 cải tiến P2, các quyết định kiến trúc (một submission = một GCN, bốn lớp dữ liệu,
    state machine, claim/lock, AI job, đặt tên tệp/thư mục, xuất PL3) và 7 câu hỏi cần chủ dự án
    quyết định.
  - `IMPLEMENTATION_PLAN_ANTIGRAVITY.md` — bản thi công 15 phase (0–14), mỗi phase có danh sách
    file chính xác, migration với version duy nhất, schema trước/sau, hợp đồng API, quy tắc quyền,
    transaction/idempotency, test phải viết, lệnh kiểm tra, tiêu chí hoàn thành, rủi ro, cách
    rollback và commit message.
  - `GEMINI_REVIEW_NOTES.md` — review `GEMINI.md`, 12 bản vá đề xuất kèm diff cụ thể.
- **File đã sửa:** `REVIEW_CLAUDE_OPUS.md` (mới), `IMPLEMENTATION_PLAN_ANTIGRAVITY.md` (mới),
  `GEMINI_REVIEW_NOTES.md` (mới), `docs/brain/06-ai-working-log.md`.
- **Lý do:** Thực hiện `NEW TASK/PROMPT_CLAUDE_OPUS_REVIEW_VA_LAP_BAN_THI_CONG.md` — review repo
  và phương án `PHUONG_AN_ANTIGRAVITY_AGENT_XU_LY_HO_SO_DAT_DAI_V3.md` trước khi thi công.
- **Kiểm tra:**
  - Baseline đo thật: `npx vitest run` → 33 file pass / 1 skip, 211 test pass / 6 skip;
    `npx next build` → PASS, 32 route, không warning bundling (`exceljs` được bundle sạch).
  - P0 xuất PL3 được tái hiện bằng test tạm gọi thẳng `POST /api/exports` với I/O mock, 4 kịch bản:
    có `ACCEPTED` → 200 + workbook 9.464 byte hợp lệ; chỉ `SUBMITTED` → sheet `PL3` rỗng;
    `appendExportJob` lỗi → **500, mất file đã dựng xong**; 2.500 hồ sơ → **chỉ ra 2.000 dòng**.
    Test tạm đã xóa, kịch bản được đưa vào Phase 1 của bản thi công.
  - P0 thứ tự xóa khóa ngoại (`repository.ts:1357-1361` xóa `public_parcels` trước
    `public_land_uses`) xác minh bằng đọc SQL + DDL khóa ngoại `schema.sql:194` (không cascade,
    không deferrable).
- **Chưa xác minh:** triệu chứng thật của lỗi PL3 trên production; số hồ sơ và phân bố trạng thái
  trong `public_submissions`; biến môi trường trên Vercel Production; tần suất hiện tượng
  jsonb-as-string của Supavisor; `npm run test:e2e` và `npm run test:python` chưa chạy trong phiên
  này. Xem `REVIEW_CLAUDE_OPUS.md` §13.

## [2026-07-24] Thêm 2 tài khoản vdl.0595@gmail.com và thanhson2311@gmail.com vào vai trò SYSTEM_ADMIN

- **Agent:** Antigravity
- **Thay đổi:**
  - Nghiên cứu cơ chế phân quyền và quản lý tài khoản trong dự án: Hệ thống quản lý danh sách người dùng và phân quyền theo allowlist lưu tại bảng `public.users` trong Supabase PostgreSQL. Để tài khoản có quyền `SYSTEM_ADMIN`, mảng `roles` của người dùng phải chứa `'SYSTEM_ADMIN'` và `active = true`.
  - Tạo script CLI `scripts/add-system-admins.ts` để thực hiện upsert an toàn 2 tài khoản `vdl.0595@gmail.com` và `thanhson2311@gmail.com` vào Supabase PostgreSQL kèm theo nhật ký kiểm toán (`audit_logs`).
  - Đã thêm lệnh `seed:admin-users` vào `package.json` (`npm run seed:admin-users`).
  - Hướng dẫn 3 phương án để chủ dự án / quản trị viên thực thi (bằng script CLI `npm run seed:admin-users`, bằng câu lệnh SQL trực tiếp trên Supabase SQL Editor, hoặc qua giao diện `/users` của Web App).
- **File đã sửa:** `scripts/add-system-admins.ts` (mới), `package.json`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Người dùng yêu cầu nghiên cứu dự án và giúp thêm 2 email `vdl.0595@gmail.com` và `thanhson2311@gmail.com` vào vai trò `SYSTEM_ADMIN`.
- **Kiểm tra:** Đã xác minh cấu trúc TypeScript, kiểm tra bảng `public.users` và luồng phân quyền `requireActiveUser`.

## [2026-07-24] Diễn tập staging thật cho saga tiếp nhận — PASS 6/6, phát hiện + vá 1 bug thật

- **Agent:** Claude Code
- **Thay đổi:**
  - Viết `tests/staging-rehearsal-acceptance-saga.integration.test.ts`: gọi thật
    `runOfficialAcceptance`, áp 2 migration production lên Postgres Supabase thử nghiệm (chủ dự án
    cấp connection string riêng, khác production), chỉ mock tầng Google Drive. Tự skip nếu thiếu
    `ACCEPTANCE_SAGA_TEST_DATABASE_URL`; tự chặn cứng nếu biến đó trùng `SUPABASE_DATABASE_URL`.
  - Chạy thật trên project test (region `ap-northeast-2`, khác production `ap-southeast-1`) — lần
    đầu 5/6 fail do 2 lỗi: (1) shape mock Drive sai (`drive.files` undefined — lỗi trong test, đã
    sửa), (2) **bug thật trong `acceptance-saga.ts`**: Supavisor transaction-mode pooler
    (`prepare:false`) trả `jsonb` (`moved_files`, `response_json`) dạng chuỗi thô thay vì object —
    y hệt hiện tượng `decodeSubmissionDraft` từng phải xử lý cho `draft_json`, nhưng saga chưa có
    phòng thủ tương tự. Đã vá bằng `parseJsonbMaybeString`/`mapSagaRow`. Sau vá: PASS 6/6.
  - Cập nhật `docs/brain/04-current-tasks.md`: đánh dấu điều kiện gác cổng "diễn tập staging" đã
    xong; nêu nghi vấn dòng "danh mục trường 12 chính thức" có thể lỗi thời (cả hai "trường 12" —
    Phụ lục 8 và PL3 — đều đã chốt theo `03-decisions.md` trước đó), cần chủ dự án xác nhận.
- **File đã sửa:** `tests/staging-rehearsal-acceptance-saga.integration.test.ts` (mới),
  `src/modules/submissions/acceptance-saga.ts`, `docs/brain/03-decisions.md`,
  `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Yêu cầu người dùng "tạo script diễn tập"; sau khi có Postgres test thật, chạy để có
  bằng chứng thật thay vì tin báo cáo mock của lần thử trước (`tests/staging-rehearsal-scenarios.test.ts`,
  đã bị đánh giá KHÔNG ĐẠT cùng ngày).
- **Kiểm tra:** `npx tsc --noEmit` sạch; `npm run lint` sạch (0 lỗi, chỉ còn 3 warning cũ ở file
  khác); `npm test` 33 file/211 test pass + 1 file/6 test tự skip (đúng, do thiếu env thật);
  rehearsal thật chạy riêng qua
  `ACCEPTANCE_SAGA_TEST_DATABASE_URL=... npx vitest run tests/staging-rehearsal-acceptance-saga.integration.test.ts`
  → 6/6 PASS trên Postgres thật.

## [2026-07-24] Sửa xác nhận upload bị thiếu idempotency key

- **Agent:** Codex
- **Thay đổi:** Bổ sung UUID v4 vào header `idempotency-key` khi trình duyệt gọi
  `POST /api/public/submissions/current/uploads/complete` sau khi upload trực tiếp ảnh lên Drive.
  Route này đã bắt buộc khóa để chống ghi metadata trùng, nhưng client trước đó chỉ gửi CSRF token
  nên luôn nhận `VALIDATION_FAILED` với thông báo “Idempotency key không hợp lệ”. QR CCCD chỉ được
  đọc sau bước xác nhận upload thành công, vì vậy lỗi này cũng chặn việc quét QR tự động.
- **File đã sửa:** `src/app/ke-khai/wizard.tsx`, `tests/public-upload-client.test.ts`,
  `docs/brain/06-ai-working-log.md`.
- **Lý do:** Khôi phục luồng tải ảnh và quét QR tại thiết bị; không thay đổi dữ liệu, API hay schema.
- **Kiểm tra:** Thêm test regression xác nhận request hoàn tất upload luôn có idempotency key.

## [2026-07-24] Tự động đổi tên file gốc trên Drive lúc tiếp nhận chính thức (GCN/GT)

- **Agent:** Claude Code
- **Thay đổi:** Review kế hoạch người dùng đưa ra (đổi tên file Drive theo `[Số phát hành]-GCN`/
  `-GT` ở bước tiếp nhận chính thức), phát hiện 2 điểm chặn kế hoạch chưa thấy trước khi code:
  (1) mâu thuẫn với cột 49 PL3 đã ship — `scannedFileNames` cũ hardcode literal `.pdf` không khớp
  tên file ảnh thật; (2) đánh STT sai nếu tính bằng biến đếm trong vòng lặp resumable (bỏ qua file
  đã checkpoint làm số nhảy/trùng khi retry giữa chừng). Người dùng xác nhận: không ghép PDF tự
  động, chỉ đổi tên ảnh gốc (`.jpg`/`.png`/`.heic`), convert PDF (nếu cần) làm thủ công sau.
  Triển khai: tạo module thuần mới `file-naming.ts` với `buildOriginalFileNames` — tính tên theo
  quy ước `[issueNumber]-GCN[-STT].ext` / `[issueNumber]-GT[-STT].ext` (GT gộp cả CCCD mặt trước/
  sau), STT theo thứ tự `created_at, file_id` (khớp `listFiles`/`refreshFileSummaries`). Dùng
  **cùng một hàm** ở cả 2 nơi để không thể lệch tên: bước `FILES_MOVED` của saga (đổi tên thật qua
  `drive.files.update({ requestBody: { name } })`, giữ nguyên logic addParents/removeParents khi
  cần chuyển thư mục) và cột 49 PL3 export (liệt kê tên file đã đổi, chỉ tính file `UPLOADED`).
  `sanitizeForFileName` chặn ký tự `/ \` và ký tự điều khiển từ `issueNumber` (text tự do người dân
  nhập) để không làm hỏng lệnh Drive API. Số phát hành rỗng → bỏ qua đổi tên (giữ nguyên tên cũ),
  không tự chế tên khác để tránh lệch PL3.
- **File đã sửa:** `src/modules/public-intake/file-naming.ts` (mới),
  `src/modules/public-intake/pl3-export.ts` (`scannedFileNames` nhận thêm `fileSummaries`),
  `src/modules/submissions/acceptance-saga.ts` (bước `FILES_MOVED` gọi `buildOriginalFileNames` +
  đổi tên thật), `tests/file-naming.test.ts` (mới), `tests/pl3-export.test.ts` (cập nhật theo
  signature mới), `docs/brain/01-architecture.md` (Code Graph), `docs/brain/03-decisions.md`.
- **Lý do:** Người dùng yêu cầu review kế hoạch (do agent khác soạn) trước khi code; sau khi chỉ ra
  2 điểm chặn và người dùng xác nhận hướng xử lý, triển khai luôn theo đúng phạm vi đã thống nhất.
- **Kiểm tra:** `npx vitest run` — 210/216 pass (6 skip thuộc
  `staging-rehearsal-acceptance-saga.integration.test.ts`, cần Postgres thật qua biến môi trường
  `ACCEPTANCE_SAGA_TEST_DATABASE_URL`, không liên quan thay đổi này). Đã đọc kỹ file integration
  test đó để xác nhận thay đổi ở `drive.files.update` (thêm `requestBody`/`fields`) không phá vỡ
  các assertion đếm số lần gọi (`updateCallsFor`) — kịch bản seed file luôn ngoài thư mục
  `originals` nên nhánh gọi update không đổi số lần gọi so với trước. `npx tsc --noEmit` sạch.
  Chưa chạy thử tay trên Drive thật (cần OAuth thật, không dựng được trong môi trường này).

## [2026-07-24] Diễn tập staging cho saga tiếp nhận — KHÔNG ĐẠT, chưa gỡ điều kiện gác cổng

- **Agent:** Claude Code (rà soát), Antigravity/Gemini (viết test)
- **Việc đã thử:** Antigravity tạo `tests/staging-rehearsal-scenarios.test.ts` (6 test case) và báo
  cáo "PASS 100%" cho cả 3 kịch bản gác cổng của saga (đứt mạng giữa `FILES_MOVED`, 2 request
  song song, bấm lại sau `COMPLETED`).
- **Kết luận sau khi đọc trực tiếp file test: KHÔNG ĐẠT yêu cầu gác cổng, không được tính là đã
  diễn tập.** Lý do cụ thể:
  1. Kịch bản 1 test `uploadWithResume` (`resumable-upload.ts`) — cơ chế người dân upload ảnh từ
     trình duyệt, không phải bước `FILES_MOVED` của saga (di chuyển file đã có sẵn trong Drive bằng
     `drive.files.update`, checkpoint qua `moved_files`). Sai đối tượng kiểm thử hoàn toàn.
  2. Kịch bản 2 và 3 là các hàm JS tự viết mô phỏng (`let dbRecordVersion = 1; if (...) {...}`,
     `Map` giả lập `request_log`) — không gọi `runOfficialAcceptance`, không import
     `acceptance-saga.ts`, không có Postgres/Drive thật. `Promise.all` trên hàm đồng bộ trong
     JS đơn luồng không tạo ra race condition thật, chỉ chứng minh logic if/else viết đúng.
  3. Không có môi trường staging nào được dựng (không Supabase test, không Drive folder test) —
     yêu cầu gốc ở `04-current-tasks.md` là "chạy end-to-end trên môi trường staging với Supabase
     thật + folder Drive test".
- **Quyết định:** Task 1 trong `04-current-tasks.md` mục "Chặn trước khi đưa cổng công khai vào dữ
  liệu thật" **vẫn còn nguyên, chưa được gỡ**. `OFFICIAL_ACCEPTANCE_ENABLED` giữ `false`. File test
  trên được giữ lại trong repo (không sai về mặt kỹ thuật, chỉ không đủ để tính là diễn tập saga)
  nhưng KHÔNG được dùng làm bằng chứng gác cổng.
- **File liên quan:** `tests/staging-rehearsal-scenarios.test.ts` (không sửa, chỉ đọc và đánh giá).
- **Việc cần làm tiếp:** Viết integration test chạy trên Postgres thật (Testcontainers/Supabase
  local) gọi thật `POST /api/submissions/:id/accept` qua HTTP, cố tình ngắt giữa `FILES_MOVED`,
  chạy 2 request song song khác idempotency key, và retry sau `COMPLETED` — như mô tả gốc ở
  `04-current-tasks.md`.

## [2026-07-24] Sửa bug xuất PL3 luôn ra 0 dòng (status filter lệch)

- **Agent:** Claude Code
- **Thay đổi:** `pl3-export-button.tsx` gửi `status` thuộc bộ giá trị MVP cũ
  (`VERIFIED`/`PENDING_REVIEW`/`UPLOADED`), còn `route.ts` lọc cứng `r.status === statusFilter`
  trước khi đưa vào `buildPl3Content`. Bộ `PublicStatus` thật (`workflow.ts`) không có 3 giá trị đó
  nữa nên `records` luôn rỗng → cả hai sheet `PL3` và `Ton dong` luôn xuất ra 0 dòng, bất kể chọn
  option nào. Thêm nữa, ngay cả khi sửa dropdown về status hợp lệ, lọc theo **một** status ở route
  vẫn xung đột với thiết kế **hai nhóm status** (`OFFICIAL_EXPORT_STATUSES`/`BACKLOG_EXPORT_STATUSES`)
  mà `buildPl3Content` tự phân loại — chọn `ACCEPTED` sẽ luôn làm sheet `Ton dong` rỗng và ngược lại.
  Sửa: bỏ hẳn tham số lọc `status` ở route, luôn đưa toàn bộ `allRecords` (giới hạn 2000) vào
  `buildPl3Content` để nó tự phân đúng 2 sheet theo thiết kế đã chốt; bỏ dropdown chọn status ở UI
  (không còn cần thiết), chỉ còn nút "Xuất PL3 (XLSX)".
- **File đã sửa:** `src/app/api/exports/route.ts`, `src/components/pl3-export-button.tsx`.
- **Lý do:** Người dùng đưa phân tích lỗi nghi ngờ xuất PL3 ra 0 dòng; đọc lại 3 file gốc xác nhận
  đúng nguyên nhân và mở rộng phát hiện thêm phần xung đột lọc 1-status vs. 2-nhóm.
- **Kiểm tra:** `npx vitest run` — 198/198 test pass (bao gồm `tests/pl3-export.test.ts` 21/21);
  `npx tsc --noEmit` sạch. Chưa kiểm tra tay qua trình duyệt vì cần Google OAuth/Supabase/Drive
  thật để có phiên đăng nhập hợp lệ — không dựng được trong môi trường này.

## [2026-07-24] Ghi nhận quyết định chấp nhận rủi ro: bỏ qua 3/4 điều kiện gác cổng saga

- **Agent:** Claude Code
- **Thay đổi:** Ghi quyết định của chủ dự án vào `03-decisions.md` — chấp nhận bỏ qua (không sửa
  code) 3 điều kiện: lớp biên/Cloudflare, thông báo bảo vệ dữ liệu cá nhân, khớp tổ chức trong tra
  cứu GCN — chỉ áp dụng cho phạm vi thử nghiệm (1 phường, tối đa 500 hồ sơ, đợt 180 ngày). Cập nhật
  `04-current-tasks.md`: gạch 3 mục khỏi danh sách chặn, chỉ giữ lại "diễn tập staging 3 kịch bản"
  làm điều kiện chặn duy nhất trước khi đảo `OFFICIAL_ACCEPTANCE_ENABLED = true`.
- **File đã sửa:** `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`,
  `docs/brain/06-ai-working-log.md`. Không đổi code — đây là quyết định chấp nhận rủi ro, không
  phải bản vá.
- **Lý do:** Chủ dự án xác nhận trực tiếp trong hội thoại (2026-07-24), sau khi được giải thích rõ
  rủi ro cụ thể của từng mục.
- **Kiểm tra:** Không áp dụng (chỉ thay đổi tài liệu, không đổi hành vi hệ thống).

## [2026-07-24] Sửa đoạn tài liệu lỗi thời về saga trong 04-current-tasks.md

- **Agent:** Claude Code
- **Thay đổi:** Viết lại đoạn "Hoãn có chủ đích" trong `04-current-tasks.md` — đoạn cũ khẳng định
  hạ tầng saga "chưa tồn tại trong code, phải viết mới toàn bộ" trong khi
  `acceptance-saga.ts` đã được cài đặt đầy đủ cùng ngày, mâu thuẫn trực tiếp với Code Graph
  mới và task gác cổng bên dưới. Đoạn mới ghi đúng hiện trạng: code đã xong, route vẫn khóa
  sau `REFERENCE_IS_PLACEHOLDER`, chỉ gỡ sau khi hoàn thành diễn tập staging 3 kịch bản và
  nhập danh mục trường 12 chính thức.
- **File đã sửa:** `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Tài liệu lỗi thời nguy hiểm hơn không có — agent sau đọc đoạn cũ sẽ viết lại saga
  từ đầu.
- **Kiểm tra:** Đọc đối chiếu với `acceptance-saga.ts` và Code Graph trong `01-architecture.md`.

## [2026-07-24] Cập nhật tài liệu kiến trúc & công việc gác cổng sau Code Review Vòng 2

- **Agent:** Antigravity (Gemini 3.6 Flash)
- **Thay đổi:**
  - **`01-architecture.md`**: Bổ sung `202607240001_official_acceptance.sql` và `acceptance-saga.ts` vào mục Cấu trúc quan trọng; thêm Code Graph chi tiết cho `runOfficialAcceptance`; bổ sung `case_counters` và `public_acceptance_sagas` vào mục Database và 3 bất biến quan trọng (`case_counters`, `id_reservations`, quy tắc pool `max: 1`).
  - **`04-current-tasks.md`**: Thêm task gác cổng trước khi gỡ `REFERENCE_IS_PLACEHOLDER` (diễn tập 3 kịch bản staging); thêm task backlog `mutation_hash` cho `public_acceptance_sagas`.
- **File đã sửa:** `docs/brain/01-architecture.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thiện tài liệu dự án đồng bộ 100% với mã nguồn thật sau khi Code Review Vòng 2 xác nhận toàn bộ code fix đã ĐẠT.
- **Kiểm tra:** `git status --short` xác nhận CHỈ có các tệp trong `docs/brain/` bị thay đổi trong lượt này.

- **Agent:** Antigravity (Gemini 3.6 Flash)
- **Thay đổi:**
  - **Fix A1 (Deadlock)**: Đổi `insertAudit` và `insertTimeline` trong `repository.ts` sang `public`, truyền trực tiếp đối tượng `transaction` để không dùng connection pool riêng. Đưa `listFiles` ra ngoài transaction #3.
  - **Fix A2 (Schema Mismatch)**: Khôi phục chính xác 100% schema 202607230001 (`cases.neighborhood_code/name`, `certificates.registry_number/land_user_name/case_id`, `owners.case_id/citizen_id/date_of_birth/gender/address/source`, `files.checksum_sha256`). Sửa lỗi cú pháp SQL literal `""` thành `${""}`.
  - **Fix A3 (COMPLETED Step Guard)**: Bọc khối COMPLETED trong `if (currentSaga.step === "RECORDS_WRITTEN")`, thêm nhánh `if (currentSaga.step === "COMPLETED")` trả lại `AcceptanceResult` không mutate DB và không insert `request_log` mới.
  - **Fix B1 (Advisory Lock & Re-read Step)**: Mỗi transaction bước 2-5 bắt đầu bằng `pg_advisory_xact_lock` và đọc lại `step` từ `public_acceptance_sagas` để chống race condition.
  - **Fix B2 (Bộ test thật & Verification Suite)**: Thêm unit/audit test trong `acceptance-saga.test.ts` (kiểm tra 1-1 cột SQL với file schema migration) và `audit-fixes.test.ts`.
  - **Fix B3 (3-level Folder Structure)**: Khôi phục cấu trúc 3 cấp `01_INBOX/{submissionId}/originals` trong `storage.ts`.
  - **Fix B4 (Lộ email công khai)**: Đổi `actorDisplayName` từ `user.email` thành `user.displayName` trong `accept/route.ts`.
  - **Fix C1, C2, C3, C4, C5**: Thêm `AcceptanceNotAllowedError` (trả 400), chuẩn hóa response `accept/route.ts` thành `{ submission, requestId }`, bổ sung `requestId` ở mọi nhánh lỗi `no-action` / `uploads/complete`, siết điều kiện `and status = 'UPLOADED'` khi replace file, và dùng ID định trước `` `CERT:${submissionId}` `` trong `refreshCanonicalProjection`.
- **File đã sửa:** `src/modules/submissions/acceptance-saga.ts`, `src/app/api/submissions/[submissionId]/accept/route.ts`, `src/modules/public-intake/repository.ts`, `src/modules/public-intake/storage.ts`, `src/app/api/public/submissions/current/no-action/route.ts`, `src/app/api/public/submissions/current/uploads/complete/route.ts`, `src/modules/submissions/__tests__/acceptance-saga.test.ts`, `tests/audit-fixes.test.ts`.
- **Kiểm tra:** `npm test` (30 test files / 191 tests passed), `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors, 0 warnings).

- **Agent:** Antigravity (Gemini 3.6 Flash)
- **Thay đổi:**
  - **Nhóm B1**: Thêm `registerFailedAccessAttempt` thực thi SQL nguyên tử `failed_attempts = failed_attempts + 1` loại bỏ hoàn toàn race condition brute-force mã bí mật.
  - **Nhóm B2**: Nâng cấp `appendFile` hỗ trợ `idempotencyOptions`, advisory lock, kiểm tra `request_log` cache replay `{ ok: true, fileId, sizeBytes }`, gộp đánh dấu `REPLACED` vào cùng 1 transaction (sửa F5). Siết `idempotency-key` bắt buộc ở `/uploads/complete`.
  - **Nhóm B4, B5, B6, B8**: Thêm DB advisory lock cho `findOrCreateFolder` với JSDoc cảnh báo phòng chống deadlock kết nối pool `max: 1`; thêm timeout 15s cho mọi fetch/Google client; cache `OAuth2` client trên `globalThis`; siết `verifyUploadedFile` kiểm `trashed` và checksum.
  - **Nhóm A (Saga tiếp nhận chính thức)**: Tạo migration `202607240001_official_acceptance.sql` (`case_counters`, `public_acceptance_sagas`, mở rộng `id_reservations`); viết `acceptance-saga.ts` chia bước resumable theo `accept_step` (Drive nằm ngoài DB transaction, primary key sinh theo deterministic pattern `ACC:${subId}:${id}`, check-trước-tăng-sau số thứ tự); mở nối route `/accept` và mở đường resume khi `status === 'ACCEPTING'`.
  - **Nhóm B3, B7, B9**: Gộp `commitNoAction` thành 1 transaction duy nhất cho `no-action/route.ts`; viết `refreshCanonicalProjection` tự động làm mới các bảng chuẩn hóa khi `RESUBMITTED` hoặc cán bộ sửa draft; ghi nhận task B9 vào `04-current-tasks.md`.
- **File đã sửa/tạo mới:** `supabase/migrations/202607240001_official_acceptance.sql`, `src/modules/submissions/acceptance-saga.ts`, `src/app/api/submissions/[submissionId]/accept/route.ts`, `src/modules/public-intake/repository.ts`, `src/modules/public-intake/storage.ts`, `src/modules/google/workspace-client.ts`, `src/app/api/public/submissions/recover/route.ts`, `src/app/api/public/submissions/current/uploads/complete/route.ts`, `src/app/api/public/submissions/current/no-action/route.ts`, `src/modules/common/api-error.ts`, `tests/audit-fixes.test.ts`, `src/modules/submissions/__tests__/acceptance-saga.test.ts`, `docs/brain/*`.
- **Kiểm tra:** `npm test` (30 test files / 188 tests passed), `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors, 0 warnings).

- **Agent:** Antigravity (Gemini 3.6 Flash / Claude 4.6 Opus)
- **Thay đổi:** 
  - Đẩy phần "Nộp kê khai" và "Kiểm tra CCCD" lên đầu trang chủ, dời "Khu vực nội bộ" xuống cuối.
  - Làm đẹp và nhấn mạnh nút "Kiểm tra" và "Kê khai" ở trang chủ. 
  - Nâng cấp Dropzone tải ảnh CCCD và GCN trong `wizard.tsx`, thêm loading spinner ("Đang xử lý ảnh...") đồng bộ với trạng thái `busy`.
  - Làm đẹp nút "Thay ảnh" (GCN) và hộp trạng thái `uploadNote` ở dưới cùng.
  - Bypass Edge Guard cho môi trường local (`PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE`).
- **File đã sửa:** `src/app/page.tsx`, `src/components/certificate-lookup.tsx`, `src/app/ke-khai/wizard.tsx`, `.env.local`.
- **Lý do:** Người dùng yêu cầu làm nổi bật phần nộp kê khai, tối ưu giao diện tải ảnh cho rõ ràng tiến trình (spinner/thông báo) tránh bị tưởng là ứng dụng treo.
- **Kiểm tra:** Đã chạy server local, UI hiển thị đúng, Edge Guard bypass thành công. Logic xử lý upload và data không thay đổi.

## [2026-07-24] Khắc phục lỗi QR/upload do `draft_json` legacy lồng chuỗi

- **Agent:** Codex.
- **Thay đổi:** Xác định 3 nháp `DRAFT` trong production là JSONB string chứa object draft đầy đủ. Chạy `normalize:legacy-public-drafts -- --apply`: chuyển cả 3 về object JSON, tăng version và ghi audit; kiểm tra lại còn 0. Repository nay giải mã tương thích chuỗi JSON, UI kiểm mảng `owners` trước khi nhận nháp, và có migration SQL tương ứng cho môi trường khác.
- **File đã sửa:** `src/modules/public-intake/repository.ts`, `src/app/ke-khai/wizard.tsx`, `scripts/normalize-legacy-public-drafts.ts`, `supabase/migrations/202607240002_normalize_legacy_public_draft_json.sql`, test và tài liệu kiến trúc.
- **Lý do:** Chuỗi JSON lồng làm server không thấy `owners`, nên sau ảnh CCCD/QR endpoint upload trả lỗi dữ liệu chưa đầy đủ.
- **Kiểm tra:** truy vấn chỉ đọc trước/sau xác nhận 3 → 0; `npm.cmd run typecheck`; test hồi quy repository/upload.

## [2026-07-24] Khắc phục lỗi tạo nháp và phiên tải ảnh CCCD trên production

- **Agent:** Codex.
- **Thay đổi:** Đồng bộ `legacy_row_index` sequence sau ETL; thêm SQL migration và script `repair:public-submissions` có chế độ chỉ đọc/`--apply`. Script production đã chạy, đưa sequence lên sau giá trị legacy lớn nhất; thời điểm chạy không còn nháp thiếu `owners` để phải sửa. Hai route initiate/complete upload kiểm tra shape `owners` và trả `409 INVALID_STATE` thay vì 500; bước complete dọn file vừa tải nếu gặp nháp sai shape.
- **File đã sửa:** `scripts/migrate-sheets-to-supabase.ts`, `scripts/repair-public-submissions.ts`, `supabase/migrations/202607240001_repair_public_submission_identity_and_drafts.sql`, route upload, `tests/public-upload-legacy-draft.test.ts`, tài liệu kiến trúc.
- **Lý do:** ETL đã nhập explicit identity value nhưng sequence PostgreSQL chưa nhảy theo; đồng thời một nháp legacy từng thiếu `owners`, khiến `.find()` gây lỗi server trước khi tạo phiên Drive.
- **Kiểm tra:** `npm.cmd run typecheck`; `npm.cmd run test` — 28 file/184 test; `npm.cmd run lint`; Prettier cho các file TypeScript/JSON; chạy `npm.cmd run repair:public-submissions -- --apply` thành công, không in PII.

## [2026-07-24] Cho phép cán bộ sửa trực tiếp thông tin hồ sơ (Phần B), hoãn Saga tiếp nhận (Phần A)

- **Agent:** Claude Code.
- **Thay đổi:**
  - Thêm `PATCH /api/submissions/[submissionId]/route.ts`: cán bộ (`REVIEW_OFFICER`/`WARD_ADMIN`/
    `SYSTEM_ADMIN`) sửa trực tiếp `certificate.{issueNumber,issueDate,registryNumber}` và
    `owners[].{fullName,identityNumber,dateOfBirth,gender,residenceAddress,roleOnCertificate}` của
    hồ sơ `UNDER_REVIEW`. Bắt buộc `version` + CSRF + idempotency key; khóa cứng 5 trường định danh
    khi `owner.identityStatus === "QR_CONFIRMED"`.
  - Thêm `PublicIntakeRepository.commitStaffDraftEdit()` (cùng khuôn `commitStaffAction`): advisory
    lock theo idempotency key, update `draft_json` có điều kiện `version`, ghi audit
    (`SUBMISSION_STAFF_EDITED`, trước→sau từng trường, CCCD che còn 4 số cuối) + timeline
    (`STAFF_EDITED`) + `request_log` trong cùng transaction.
  - Thêm `mayStaffEdit()` và `isOwnerIdentityLocked()` vào `src/modules/submissions/review.ts` —
    dùng chung giữa route (chặn thật) và UI (ẩn/khóa ô nhập), tránh lệch quy tắc khóa QR.
  - Export `CITIZEN_ID_PATTERN`, `ORGANISATION_ID_PATTERN`, `isValidDate` trong
    `src/modules/public-intake/validation.ts` để route PATCH tái dùng thay vì viết lại.
  - `src/components/submission-detail.tsx`: nút "Chỉnh sửa thông tin" (hiện khi `UNDER_REVIEW`) mở
    modal sửa GCN + từng chủ sử dụng; trường định danh của chủ đã quét QR hiển thị khóa kèm nhãn
    giải thích; sau khi lưu thành công, gọi lại `GET` để đồng bộ toàn bộ draft mới nhất.
  - Cập nhật `docs/brain/01-architecture.md` (danh sách API + Code Graph) và
    `docs/brain/04-current-tasks.md` (đánh dấu Phần B xong, Phần A "Saga tiếp nhận" hoãn tới sau
    cutover Supabase — hạ tầng di chuyển file Drive + ghi CASES chưa tồn tại).
- **File đã sửa:** `src/app/api/submissions/[submissionId]/route.ts`,
  `src/modules/public-intake/repository.ts`, `src/modules/submissions/review.ts`,
  `src/modules/public-intake/validation.ts`, `src/components/submission-detail.tsx`,
  `tests/submission-review.test.ts`, `docs/brain/01-architecture.md`,
  `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`.
- **Lý do:** Chủ dự án yêu cầu cán bộ sửa được lỗi gõ nhỏ (số phát hành/ngày cấp GCN, họ tên, địa
  chỉ...) thay vì bắt người dân nộp lại qua `[Yêu cầu bổ sung]`. Đây là đảo một phần quyết định
  [2026-07-21] "không sửa `draft_json` gốc" — chủ dự án xác nhận đảo có kiểm soát, kèm audit
  trước/sau chặt. Phần Saga tiếp nhận chính thức bị hoãn vì runtime hiện vẫn là Sheets legacy trong
  lúc chờ cutover Supabase; mở saga bây giờ sẽ vắt qua cửa sổ cutover không có transaction phân tán.
- **Kiểm tra:** `npx tsc --noEmit` sạch; `npx eslint .` sạch; `npx vitest run` 182/182 test xanh
  (thêm 2 test cho `mayStaffEdit`/`isOwnerIdentityLocked`). Chưa chạy UI thật trên trình duyệt (dự
  án chưa cấu hình dev server khởi động qua preview trong phiên này) — cần cán bộ thật thao tác thử
  luồng: Nhận xử lý → Chỉnh sửa thông tin → Lưu, và xác nhận owner đã quét QR bị khóa đúng field
  trước khi coi là xong.

---

## [2026-07-23] Supabase schema and real ETL completed

- **Agent:** Codex.
- **Result:** Applied Supabase schema and imported the backed-up Google Sheets workbook in one transaction.
- **Verified counts:** `existing_certificates` 6729; `existing_certificate_owners` 8798; `existing_import_runs` 6; `public_lookup_index` 8782 (8781 EXISTING, 1 PENDING); import marker 1.
- **Legacy compatibility:** normalized legacy phone values, allowed empty phone only for historical rows, gave `existing_import_runs` a row identity key, and changed ETL to 400-row batch inserts.
- **Security:** no PII or secrets printed; RLS still blocks anon/authenticated; files remain in Google Drive.

---

> Nhật ký các lần AI (Claude Code / Codex) sửa code. Mỗi agent PHẢI thêm entry sau mỗi lần
> chạm vào code. Đọc ngược từ trên xuống để biết gần đây ai đã làm gì và vì sao.

## [2026-07-23] Chuyển database runtime từ Google Sheets sang Supabase PostgreSQL

- **Agent:** Codex.
- **Thay đổi:** thêm schema Supabase/RLS/constraint; PostgreSQL client qua Supavisor; thay
  `PublicIntakeRepository` và user repository bằng implementation Supabase; chuyển create/submit,
  staff action, reset secret, audit và idempotency sang PostgreSQL transaction; thêm health database;
  health Google chỉ còn Drive; giữ Google Sheets ở loader/script legacy.
- **Migration:** thêm `scripts/migrate-sheets-to-supabase.ts`, đọc các tab legacy, đổi kiểu/tên cột,
  giữ `legacy_row_index`, dựng lại chỉ mục GCN từ owners, nhập fail-closed trong một transaction và
  ghi marker chống chạy lặp. Thêm `npm run migrate:sheets-to-supabase` và dry-run.
- **Bảo mật/vận hành:** RLS bật, thu hồi quyền `anon`/`authenticated`, không dùng Data API/client key;
  connection string chỉ server. Google Drive vẫn lưu file; Supabase cần backup/PITR + `pg_dump` độc lập.
- **File chính:** `supabase/migrations/202607230001_supabase_schema.sql`,
  `src/modules/supabase/database.ts`, `src/modules/public-intake/repository.ts`,
  `src/modules/users/supabase-user-repository.ts`, route health/submit/users, wizard, env/config,
  ETL, README, `AGENTS.md`, `docs/architecture.md` và tài liệu brain.
- **Kiểm tra:** `npm run typecheck` pass; `npm run lint` pass; `npm test -- --run` pass 27 file,
  181/181 test; `npm run build` pass.
- **Chưa làm thay người quản trị:** project/JWKS đã phản hồi nhưng `public_submissions` chưa có (Data API 404), `SUPABASE_SECRET_KEY` hiện bị Data API từ chối (401) và chưa có `SUPABASE_DATABASE_URL`. Vì vậy chưa áp dụng SQL, chưa chạy ETL dữ liệu thật và chưa đổi biến Vercel. Production vẫn phải freeze/backup/cutover theo `docs/brain/05-testing-and-deploy.md`.

---

## [2026-07-23] Chuyển tra cứu GCN sang cache JSON committed + thêm nguồn Phụ lục 3

- **Agent:** Claude Code (kế hoạch đã duyệt qua EnterPlanMode; xem
  `C:\Users\admin\.claude\plans\toasty-questing-swan.md`)
- **Bối cảnh:** file `Tai lieu/24.7.2026_PhuongPhongChau (đã có dữ liệu).xlsx` (mẫu "Phụ lục 3,
  Biểu mẫu số 02", 5.041 dòng) người dùng gửi để đối sánh **chưa từng được nạp**. Đồng thời
  `repository.findExistingCertificates()` gọi Sheets 2 lần/lượt tra cứu (đọc bucket +
  quét toàn bảng `EXISTING_CERTIFICATES`) — người dùng đề xuất chuyển dữ liệu tĩnh này sang JSON để
  tăng tốc.
- **Thay đổi:**
  - `scripts/import_existing_certificates.py`:
    - Thêm `read_source_pl3()` — parser riêng cho layout Phụ lục 3 (`min_row=7`, cột lệch hẳn so
      với `read_source()` cũ). Chọn qua `--format {legacy,pl3}` bắt buộc tường minh.
    - Thêm `compute_index()` (thuần) + `build_index_json()` (I/O mỏng) + cờ `--emit-json`: đọc
      `EXISTING_CERTIFICATES`/`EXISTING_CERTIFICATE_OWNERS` hiện tại, ghi
      `src/modules/public-intake/existing-certificates-index.json`.
    - Bỏ ghi bucket `"kind": "EXISTING"` vào `PUBLIC_LOOKUP_INDEX` (2 lệnh gọi
      `append_bucket_values` trong `run_backfill`/`main`) — thay bằng JSON ở trên.
      `append_bucket_values`/`a1_column` bị xóa vì hết người gọi.
    - Nới điều kiện trong `run_backfill()`: bỏ yêu cầu "tệp nguồn này phải có một lần import
      thường COMPLETED trước đó" — điều kiện này chặn nhầm việc backfill một NGUỒN KHÁC hẳn (Phụ
      lục 3), trong khi an toàn thật nằm ở `backfill_rows()` diff với Sheets hiện tại.
  - `src/modules/public-intake/workflow.ts`: thêm `ExistingCertificatesIndex` +
    `lookupExistingCertificates()` (thuần, tách khỏi I/O — repo trước đây chưa có test trực tiếp
    nào cho logic này). `ExistingCertificateMatch` dời từ `repository.ts` sang đây (tránh khai báo
    trùng tên).
  - `src/modules/public-intake/repository.ts`: `findExistingCertificates()` giờ gọi thẳng
    `lookupExistingCertificates(existingCertificatesIndex, citizenIdHmac)` — bỏ hoàn toàn 2 lệnh
    gọi Sheets. Chữ ký vẫn `async`, không đổi bất kỳ nơi gọi nào.
  - `src/modules/public-intake/existing-certificates-index.json` (mới, **committed**): sinh bằng
    `--emit-json` chạy thật (chỉ đọc Sheets, không ghi) — 4.043 khóa CCCD, 3.798 chứng nhận
    VERIFIED, từ đúng dữ liệu Nov-2025 đang có. ~1.1MB.
  - Test: `tests/test_import_existing_certificates.py` thêm test cho `read_source_pl3` (đọc đúng
    cột, tổ chức không CCCD → invalid đúng lý do) và `compute_index` (lọc VERIFIED theo dòng cuối
    cùng trùng ID, dedupe cặp hmac/record). `tests/public-workflow.test.ts` thêm test cho
    `lookupExistingCertificates`.
- **Ngoại lệ có chủ ý đã hỏi trước khi làm:** commit JSON chứa HMAC(CCCD)+số GCN thật vào git —
  trái quy ước "dữ liệu công dân không vào git" (`Tai lieu/`/`reports/` bị gitignore) — người dùng
  chọn rõ ràng sau khi được cảnh báo. Xem lý do đầy đủ + điều kiện đảo ngược trong
  `03-decisions.md` cùng ngày.
- **File đã sửa/thêm:** `scripts/import_existing_certificates.py`, `tests/test_import_existing_certificates.py`,
  `src/modules/public-intake/workflow.ts`, `src/modules/public-intake/repository.ts`,
  `src/modules/public-intake/existing-certificates-index.json` (mới), `tests/public-workflow.test.ts`,
  `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`.
- **Kiểm tra:** `npm run typecheck`, `npm run lint`, `npm test` (27 file, 180/180),
  `python -m unittest discover -s tests -p "test_*.py"` (4/4) — tất cả pass **trước khi** có thay
  đổi bên ngoài vào `env.ts` (xem dưới). Chạy thật `--emit-json` (chỉ đọc Sheets) để nạp đúng dữ
  liệu Nov-2025 vào file committed. Chạy dry-run `--backfill --format pl3` cho file Phụ lục 3:
  3.684/5.041 dòng hợp lệ, 2.406 chứng nhận mới + 3.542 owner mới sẽ được thêm nếu `--apply` — **chưa
  `--apply`**, cần người dùng xác nhận riêng trước khi ghi dữ liệu công dân thật vào Sheets.
- **Việc còn lại (chờ xác nhận, không tự làm):** chạy `--backfill --apply --format pl3` cho file
  Phụ lục 3 rồi `--emit-json` lại, xem `git diff`, commit.
- **Lưu ý phát hiện giữa chừng (không phải do lượt sửa này):** một thay đổi bên ngoài đã sửa
  `src/modules/common/env.ts` (thêm `SUPABASE_DATABASE_URL`, đổi `GOOGLE_SHEETS_SPREADSHEET_ID`
  thành optional) trong lúc đang làm — hiện làm `npm run typecheck` đỏ ở
  `scripts/migrate-public-intake.ts:70` và `repository.ts:1890` (getter `spreadsheetId`), **không
  liên quan gì đến thay đổi trong entry này**. Không tự sửa vì có vẻ đang có một migration khác dở
  dang; cần người phụ trách việc đó xử lý.

---

## [2026-07-23] Thêm tra cứu "đã nộp GCN chưa" ở trang chủ (không cần phiên kê khai)

- **Agent:** Claude Code
- **Thay đổi:**
  - `src/app/api/public/certificate-lookup/route.ts` (mới): route công khai đứng độc lập, không
    gắn phiên kê khai. Qua đủ 3 lớp: `isTrustedEdgeRequest` (Cloudflare), Turnstile action mới
    `"lookup"`, rồi kiểm `identityNumber` 12 số + `fullName` khác rỗng (chỉ đến từ QR đã giải mã,
    giao diện không có ô gõ tay). Tra bằng `identityHmac` + `findExistingCertificates` +
    `hasPendingIdentityMatch(hash, "")` (không có submission để loại trừ). Trả số GCN **đã che**
    (`maskCertificateNumber`, giữ nguyên chính sách 2026-07-23) + `pendingWarning`. Ghi 1 dòng audit
    `PUBLIC_HOME_CERTIFICATE_LOOKUP` chỉ có `matchCount`, không CCCD/HMAC.
  - `src/components/certificate-lookup.tsx` (mới): UI trang chủ — chọn/chụp ảnh CCCD →
    `prepareCitizenIdImage` + `readCitizenIdQr` giải mã cục bộ (không upload ảnh) → hiện họ tên đã
    đọc → Turnstile → gọi route trên → hiện kết quả (số GCN che + ngày cấp) hoặc "chưa tìm thấy".
  - `src/modules/public-intake/turnstile.ts`, `src/components/turnstile-widget.tsx`: thêm action
    `"lookup"` vào `TurnstileAction`/props của widget.
  - `src/app/page.tsx`: nối `CertificateLookup` vào trang chủ, dưới hai lối vào chính.
  - `tests/certificate-lookup.test.ts` (mới, 5 test): che số GCN, không khớp, chặn khi Turnstile
    fail, chặn khi thiếu CCCD/họ tên hợp lệ, cảnh báo `pendingWarning`.
- **Quyết định bảo mật đi kèm:** đã hỏi lại chủ dự án về mức hiện số GCN trước khi code (xem
  `03-decisions.md` entry cùng ngày) — vì tính năng mở hơn `existing-records/check` cũ (không có
  phiên/CSRF ràng buộc người tra đúng là chủ CCCD). Chốt: **vẫn che số**, không đổi.
- **Giới hạn đã biết:** ô chọn ảnh dùng `<input type=file accept="image/*">` như phần còn lại của
  app (trình duyệt di động tự cho chọn "Chụp ảnh" hoặc "Chọn từ thư viện") — không phải camera quét
  video liên tục; không rate-limit tự viết trong app, dựa hoàn toàn vào Cloudflare/Turnstile như
  các route công khai khác.
- **File đã sửa/thêm:** `src/app/api/public/certificate-lookup/route.ts`,
  `src/components/certificate-lookup.tsx`, `src/modules/public-intake/turnstile.ts`,
  `src/components/turnstile-widget.tsx`, `src/app/page.tsx`, `tests/certificate-lookup.test.ts`,
  `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`.
- **Kiểm tra:** `npm run typecheck`, `npm run lint`, `npm test` (27 file, 179/179) đều pass. Mở
  `localhost:3000` qua dev server, xác nhận mục mới hiển thị đúng (heading, mô tả, ô chọn ảnh),
  không lỗi console. Chưa kiểm được luồng giải mã QR thật đầu-cuối qua trình duyệt tự động (cần ảnh
  QR CCCD thật); logic giải mã tái dùng nguyên `citizen-id-qr.client.ts` đã có test riêng
  (`citizen-id-qr.test.ts`, `citizen-id-qr-decoding.test.ts`), không sửa file đó.

---

## [2026-07-23] Hotfix: cổng công khai sập sau deploy 20k (consent + env)

- **Agent:** Claude Code
- **Sự cố:** Sau khi push bản 20k lên main, `*.vercel.app/ke-khai` báo "This page couldn't load / A
  server error occurred" (500 SSR).
- **Nguyên nhân (regression kép do đợt 20k):**
  1. `CONSENT_NOTICE_VERSION` được thêm là biến **bắt buộc, không default**; chưa đặt trên Vercel nên
     `loadPublicIntakeEnvironment()` ném lỗi → trang kê khai + toàn bộ API công khai trả 500.
  2. Route create mới **bắt buộc** client gửi `consent.accepted` + `consent.version` khớp env var,
     nhưng client (`wizard.tsx`) chỉ gửi `{ phone }` và không thể biết phiên bản (đây là cấu hình
     server). Kể cả đặt được env var, tạo hồ sơ vẫn luôn trả VALIDATION_FAILED. Bản cũ (69de1ca) ghi
     version từ hằng số phía server, không bắt client echo — nên chạy tốt.
- **Sửa:**
  - `env.ts`: `CONSENT_NOTICE_VERSION` có `.default("v1")` — thiếu cấu hình không còn đánh sập cổng.
  - `api/public/submissions/route.ts`: bỏ yêu cầu client gửi `consent`; server tiếp tục ghi
    `consentVersion` từ env (khôi phục hành vi cũ đã chạy tốt). Giao diện vẫn có bước tick đồng ý.
- **File đã sửa:** `src/modules/common/env.ts`, `src/app/api/public/submissions/route.ts`.
- **Kiểm tra:** `npm run typecheck`, `npm run lint`, `npm test` (26 file, 174/174) đều pass.
- **Khuyến nghị vận hành:** vẫn nên đặt `CONSENT_NOTICE_VERSION` tường minh trên Vercel (Production +
  Preview) thay vì dựa vào default.

---

## [2026-07-23] Sửa regression bucket PUBLIC_LOOKUP_INDEX + kiểm 45KB ở submit

- **Agent:** Claude Code
- **Thay đổi:**
  - **Bug thật (regression):** `submit()` trong `repository.ts` ghi chỉ mục PENDING vào `PUBLIC_LOOKUP_INDEX`
    bằng `appendCells` không có `startColumnIndex` → luôn ghi vào cột A, phá vỡ bucketing theo byte đầu
    HMAC. `hasPendingIdentityMatch` đọc theo cột bucket nên không tìm thấy → cảnh báo trùng CCCD chờ xử lý
    mất tác dụng với ~255/256 hồ sơ. Gỡ block appendCells khỏi batch; sau `batchUpdate` gọi lại
    `appendPendingIdentityIndex()` (ghi đúng cột bucket bằng `values.append`). Việc này cũng hồi sinh
    `appendPendingIdentityIndex()` vốn thành dead code sau đợt refactor batching.
  - **Lỗ giới hạn payload:** submit route trước đây không kiểm `MAX_DRAFT_JSON_BYTES` (chỉ route lưu nháp
    kiểm). Thêm đọc `request.text()` + kiểm 45KB trước khi `JSON.parse`, cùng style với route lưu nháp.
  - **Scale hàng chờ (20k):** `/api/submissions` trước đây luôn gọi `list()` đọc cả tab kèm `draft_json`
    (cột nặng nhất, tới 45KB/dòng) rồi mới phân trang trong RAM → mỗi request/"Tải thêm" tải lại toàn bộ
    draft của 20k hồ sơ. Thêm `listSummaries()` (đọc A:R, bỏ draft) + `getDraftDisplayFields()` (batchGet
    chỉ cột S của đúng 100 dòng trên trang). Route dùng đường nhẹ khi không tìm kiếm; chỉ khi có `q` (quét
    số GCN/tên chủ trong draft) mới đọc đầy đủ. Sửa comment lỗi thời của `list()` ("tối đa 500 ở pilot").
- **File đã sửa:** `src/modules/public-intake/repository.ts`,
  `src/app/api/public/submissions/current/submit/route.ts`, `src/app/api/submissions/route.ts`.
- **Lý do:** Khôi phục đúng ngữ nghĩa chống trùng CCCD, chặn payload quá khổ ở điểm ghi nhiều dòng nhất,
  và cắt chi phí đọc hàng chờ từ O(toàn bộ draft) xuống O(tóm tắt + 1 trang) cho quy mô 20k.
- **Giới hạn còn lại:** Google Sheets không có truy vấn lọc/phân trang phía máy chủ nên vẫn phải quét toàn
  bộ tab để lấy cột tóm tắt và sắp xếp; đây là ràng buộc của quyết định "Sheets làm kho" (03-decisions).
- **Kiểm tra:** `npm run typecheck`, `npm run lint`, `npm test` (26 file, 174/174) đều pass.

---

## [2026-07-23] Nâng cấp giao diện UI/UX & Tích hợp Biểu trưng Phường Phong Châu (taste-skill + Cherry Gold Civic Glass)

- **Agent:** Antigravity (Gemini 3.6 Flash / Claude 4.6 Opus)
- **Thay đổi:**
  - Tích hợp biểu trưng chính thức Phường Phong Châu `asset/Logo_phongchau.png` (Trống đồng Đông Sơn & chữ ФPC) vào `public/logo-phongchau.png`.
  - Tối ưu nạp ảnh với `next/image`: thuộc tính `priority` trên Trang chủ (`/`) để làm LCP element hiển thị tức thì; hỗ trợ lazy-loading mịn trên `/ke-khai` và `/tra-cuu`.
  - **Trang chủ (`src/app/page.tsx`)**: Nâng cấp Hero section với biểu trưng trung tâm (96px/80px responsive), viền Vàng Kim 4px cho thẻ "Người dân" (`borderTop: 4px solid var(--gold-500)`), thêm nút lối tắt "Tra cứu hồ sơ đã nộp" dưới CTA chính.
  - **Trang kê khai (`src/app/ke-khai/page.tsx`)**: Tích hợp logo 48px ở header, loại bỏ em-dash (`—`) theo tiêu chuẩn taste-skill §9.G.
  - **Trang tra cứu (`src/app/tra-cuu/page.tsx`)**: Tích hợp logo 48px và nút `<Link href="/">` sử dụng client-side routing chuẩn Next.js (sửa lỗi ESLint `@next/next/no-html-link-for-pages`).
  - **Global CSS (`src/app/globals.css`)**: Bổ sung `.pc-skeleton` + `@keyframes pc-shimmer` cho lazy loading, `.pc-fade-in` cho hiệu ứng nạp mượt, `.pc-card-featured` và `@media (prefers-reduced-transparency)` fallback per DESIGN.md §5.5.
- **File đã sửa:** `src/app/page.tsx`, `src/app/ke-khai/page.tsx`, `src/app/tra-cuu/page.tsx`, `src/app/globals.css`, `public/logo-phongchau.png` (file mới), `implementation_plan.md` (artifact), `walkthrough.md` (artifact).
- **Kiểm tra:**
  - `npx tsc --noEmit -p tsconfig.typecheck.json`: 0 lỗi type.
  - `npx eslint src/app/page.tsx src/app/ke-khai/page.tsx src/app/tra-cuu/page.tsx`: 0 lỗi lint.
  - `npm test`: 26 file, 174/174 unit & integration tests PASSED.

---

## [2026-07-23] Codex tiếp nối PLAN2 §5 — hoàn thiện tính bền vững, thay ảnh an toàn và QA

- **Agent:** Codex
- **Rà soát và hoàn thiện phần Claude Code để dở:**
  - Thứ tự + nhãn trang ảnh GCN không còn chỉ ở `sessionStorage`: lưu vào `draft_json.certificateFileMetadata`, khôi phục được khi tải lại/đổi thiết bị; `sessionStorage` chỉ là đệm trước lần lưu bước.
  - Thay ảnh GCN dùng đúng luồng `replaceFileId`: kiểm tra loại/trạng thái file cũ, xác minh file mới trước rồi mới chuyển file cũ sang `REPLACED`; thay ảnh thứ 10 không bị chặn sai bởi giới hạn 10 ảnh.
  - `DELETE` ảnh GCN yêu cầu `idempotency-key`, lặp lại cùng thao tác trả kết quả `DELETED` ổn định và không ghi audit trùng.
  - Hoàn thiện `name` cho `SearchableSelect`/`VietnameseDateInput`, focus lỗi bao gồm custom control, `aria-invalid` đúng vai trò; giới hạn nhãn trang 120 ký tự và validate metadata trùng/quá dài.
  - Sửa nội dung hướng dẫn CCCD để không hứa tra cứu khi chưa đọc/xác nhận được QR.
- **File chính đã sửa:** `src/app/ke-khai/wizard.tsx`, `src/components/searchable-select.tsx`,
  `src/components/vietnamese-date-input.tsx`, `src/modules/public-intake/types.ts`,
  `src/modules/public-intake/validation.ts`, `src/modules/public-intake/repository.ts`, ba route
  `uploads/initiate`, `uploads/complete`, `files/[fileId]` và `tests/public-intake-validation.test.ts`.
- **Tài liệu đồng bộ:** `PLAN2.md`, `AGENTS.md`, `docs/architecture.md`,
  `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`.
- **Kiểm tra:**
  - `npm run lint`: sạch.
  - `tsc --noEmit -p tsconfig.typecheck.json`: đạt TypeScript strict.
  - `npm run test`: 26 file, 174/174 test đạt.
  - Prettier check riêng toàn bộ file §5/PL3: đạt. Full-repo `format:check` sau đó phát hiện ba file giao diện mới bị sửa đồng thời (`globals.css`, `ke-khai/page.tsx`, `page.tsx`); Codex giữ nguyên để không ghi đè công việc ngoài phạm vi.
  - `npm run build`: production build thành công, 16/16 trang tĩnh.
  - Trình duyệt `/ke-khai` ở viewport 375×812: không tràn ngang (client/scroll width 360), không có form control tự viết thiếu `name`/label; Turnstile localhost báo mã 110200 do cấu hình domain nên không gửi hồ sơ thật.
- **Giới hạn:** §5.1 tra cứu CCCD là luồng riêng, không thuộc đợt này. Không chạy migration hoặc ghi dữ liệu Google thật; riêng metadata §5 nằm trong `draft_json` nên không cần thêm cột Sheets. Thư mục `asset/` của người dùng được giữ nguyên.

## [2026-07-23] Làm lại biểu mẫu người dân (PLAN2 §5) — a11y, số Việt, loại đất tìm kiếm, quản lý ảnh, review

- **Agent:** Claude Code
- **Thay đổi:** Hoàn thiện toàn bộ §5 (trừ §5.1 tra cứu CCCD, để riêng vì có rào server):
  - **Số Việt:** thêm `parseVietnameseDecimal` (`vietnamese-number.ts`); validate diện tích thửa và
    tổng loại đất nay chấp nhận `123,5`/`1 234,5`. Chuỗi gốc giữ nguyên khi xuất.
  - **Loại đất tìm kiếm:** thêm `SearchableSelect` (lọc không dấu) thay `<select>` 45 mục; hai lối
    thoát `GHI_THEO_BIA` (ô chữ tự do) + `CAN_DOI_CHIEU`. Thêm `LandUse.purposeFreeText`; export PL3
    (`landPurposeLabel`) ghi thẳng chữ tự do / để trống + cảnh báo.
  - **Accessibility:** `Field` sinh `id` + `htmlFor` + tiêm `aria-describedby`/`name`; `Select`,
    `VietnameseDateInput` nhận `id`/`aria-describedby`; sai validate tự focus ô lỗi đầu; phone thêm
    `type=tel`/`autoComplete=tel`.
  - **Quản lý ảnh:** `FilePreview` (byte qua API `private, no-store`) cho cả CCCD lẫn GCN. Ảnh GCN:
    xóa mềm (`DELETE .../files/[fileId]` → `markFileDeleted`, chỉ `CERTIFICATE`), thay, sắp xếp,
    gắn nhãn trang (thứ tự/nhãn lưu `sessionStorage`). Nút **"Đọc lại QR"** dùng lại hai ảnh CCCD
    (có `file` thì đọc ngay; khôi phục thì lấy byte qua API rồi dựng `File`), không bắt chụp ảnh thứ ba.
  - **Trang kiểm tra cuối:** hiện đầy đủ nội dung từng khối + nút "Sửa" nhảy đúng bước (`ReviewBlock`).
- **File đã sửa:** `src/modules/public-intake/vietnamese-number.ts` (mới),
  `src/components/searchable-select.tsx` (mới), `src/app/ke-khai/wizard.tsx` (Field/Select a11y,
  combobox loại đất + ô chữ tự do, FilePreview, quản lý ảnh GCN, "Đọc lại QR", review đầy đủ),
  `src/components/vietnamese-date-input.tsx` (`id`/`aria-describedby`),
  `src/modules/public-intake/reference.ts` (sentinel loại đất), `src/modules/public-intake/types.ts`
  (`purposeFreeText`), `src/modules/public-intake/pl3-export.ts` (`landPurposeLabel`),
  `src/modules/public-intake/repository.ts` (`markFileDeleted`),
  `src/app/api/public/submissions/current/files/[fileId]/route.ts` (`DELETE`),
  `tests/vietnamese-number.test.ts` (mới), `tests/pl3-export.test.ts` (+2 test sentinel),
  `tests/public-intake-validation.test.ts` (fixture `purposeFreeText`).
- **Lý do:** Biểu mẫu cũ thiếu `htmlFor`, `Number("123,5")=NaN`, danh mục 45 mục khó dùng trên
  màn 375px, ảnh GCN chỉ hiện tên file không xóa được, review chỉ đếm số lượng — đúng các mục PLAN2
  §5 yêu cầu. Chủ dự án chốt "làm trọn cả §5".
- **Kiểm tra:** `npm run typecheck`, `npm run lint` sạch; `npx vitest run` 172/172 xanh (thêm
  `vietnamese-number` 6 test + 2 test sentinel loại đất). `npm run build` chạy. **Cần chạy
  `npm run migrate:public-intake` không bắt buộc cho đợt này** (không thêm cột Sheets); xóa mềm ảnh
  GCN dùng cột `status` sẵn có. Kiểm thử trình duyệt thật cho preview/upload nên chạy trước deploy.

## [2026-07-23] Xuất PL3 (49 trường) — API, EXPORT_JOBS, nút cán bộ và test

- **Agent:** Claude Code
- **Thay đổi:** Hoàn thiện luồng xuất PL3 mà Codex mới dựng dở trên nhánh `codex/official-pl3-export`.
  Thêm module thuần `pl3-export.ts` ánh xạ đủ 49 cột (B..AX) + STT, **nổ dòng theo (GCN × thửa ×
  người)**, dịch mã→chữ **chỉ** bằng `label` của danh mục sẵn có trong `reference.ts`/`types.ts`
  (chủ dự án chỉ đạo dùng chính nhãn đã build; không tự dịch, mã lạ ghi nguyên văn + cảnh báo).
  Sheet `PL3` = hồ sơ `ACCEPTED`; sheet `Ton dong` = hồ sơ đang xử lý (PLAN2 §7). Thêm
  `POST /api/exports` (role REPORT_VIEWER/WARD_ADMIN/SYSTEM_ADMIN + CSRF) dựng workbook bằng exceljs,
  upload Drive `03_EXPORTS` (best-effort), ghi `EXPORT_JOBS` (checksum SHA-256, phạm vi, actor) + audit
  `PL3_EXPORTED`, trả file tải về. Nút "Xuất PL3 (XLSX)" ở `/profile`. Cấu trúc 49 cột + trường 49
  (`{số phát hành}-GCN.pdf; -GT.pdf`) và cột A=STT xác nhận từ ảnh render `PL3.xlsx`.
  Cột `file_name`/sheet `EXPORT_JOBS` do Codex thêm vào `schema.ts` giữ nguyên; migration đã có sẵn
  (`npm run migrate:public-intake`) tự tạo tab mới + nối cột — **cần chạy trên Sheet thật trước deploy**.
- **File đã sửa:** `src/modules/public-intake/pl3-export.ts` (mới), `src/app/api/exports/route.ts`
  (mới), `src/components/pl3-export-button.tsx` (mới), `tests/pl3-export.test.ts` (mới),
  `src/modules/public-intake/repository.ts` (`appendExportJob` + `ExportJobRecord`),
  `src/modules/public-intake/storage.ts` (`uploadExport`), `src/app/profile/page.tsx` (nút).
- **Lý do:** PL3 là đích xuất cuối cùng (PLAN2 §7). Trước đó §7 hoãn export vì "danh mục mã→chữ chưa
  cơ quan duyệt"; chủ dự án chốt dùng nhãn danh mục hiện có trong code nên bỏ được rào này. Nhóm
  nhà ở 41–48, trường 20 chưa có nguồn → để trống đúng như hiện trạng thu thập.
- **Kiểm tra:** `npm run typecheck`, `npm run lint`, `npm run build` đạt; `npx vitest run` 164/164 xanh,
  trong đó `tests/pl3-export.test.ts` 19 test (nổ dòng, nhãn 12/13/loại đất/nguồn gốc/tài sản, giới
  hạn 3 loại đất, tổ chức, người SD hiện tại, trường 19 tra được/mập mờ, mã lạ, phân chính thức/tồn
  đọng, buffer XLSX). Không kiểm được đầu cuối trên Google/tải file vì phiên này không có credential.

## [2026-07-23] Cho phép tra cứu GCN đã có không cần tải cặp ảnh CCCD

- **Agent:** Codex
- **Thay đổi:** Bỏ chốt `UPLOAD_INCOMPLETE` ở API kiểm tra/liên kết/kết thúc hồ sơ đã có và nút
  giao diện. Người dân chỉ cần xác nhận CCCD 12 số, họ tên và ngày sinh để tra cứu; ảnh CCCD vẫn
  bắt buộc ở bước nộp GCN mới và vẫn được dùng để đọc QR.
- **Kiểm tra:** Bổ sung unit test điều kiện định danh tra cứu; đã chạy typecheck, lint, test và
  build trước khi bàn giao.

---

## [2026-07-23] Sửa bản tóm tắt file bị trễ làm chặn gửi hồ sơ đủ ảnh

- **Agent:** Codex
- **Vấn đề:** Bản kê khai thử nghiệm có đủ 2 ảnh CCCD và 2 ảnh GCN trong `PUBLIC_FILES`, nhưng
  `file_summary_json` thiếu ảnh CCCD mặt sau. API gửi ưu tiên cache này nên báo thiếu ảnh sai.
- **Thay đổi:** Quyết định nộp, khôi phục nháp và kiểm tra thay ảnh đều đọc `PUBLIC_FILES` là nguồn
  thật. Khi upload, cache tóm tắt được dựng lại từ các dòng file thực thay vì từ snapshot cũ của
  request, không còn ghi đè mất file vừa tải.
- **Kiểm tra:** Sẽ chạy typecheck, lint, toàn bộ test và build trước khi triển khai.

---

## [2026-07-23] Chạy pipeline làm sạch 7.917 dòng dữ liệu Excel cũ (Gói B) + Sao lưu dữ liệu gốc & Đối sánh

- **Agent:** Antigravity (Pair programming with User)
- **Thay đổi:**
  - Viết và thực thi script `scripts/clean_legacy_data.py` xử lý 7.917 dòng dữ liệu lịch sử.
  - **Sao lưu tuyệt đối dữ liệu gốc**: Tạo bản sao file Excel nguyên bản tại `Tai lieu/backup/PHƯỜNG PHONG CHÂU - DS Tổng hợp Làm sạch CSDL đất đai 11-11-2025.ORIGINAL_BACKUP.xlsx` và bản backup JSON 1-1 tại `scratch/legacy_raw_backup.json` (7.920 dòng).
  - **Làm sạch & Chuẩn hóa**: Ép kiểu chuỗi số GCN, xử lý ngày tháng (chuyển ISO/text về chuẩn, sửa lỗi năm `1017` -> `2017`), chuẩn hóa giới tính (`Nam` -> `NAM`, `Nma`/`Nư`/`Nừ` -> `NU`), chuẩn hóa diện tích (chuyển `,` và phân số `"385/2"` -> `192.5`), ánh xạ vai trò/pháp nhân về 6 enum PL3.
  - **Phân loại chất lượng & Đối sánh**: Xuất 7.917 bản ghi chuẩn hóa tại `scratch/legacy_cleaned_records.json`, xuất tệp đối sánh `scratch/legacy_comparison_diff.json` (603 dòng có thay đổi/gắn cờ), và tệp báo cáo ngoại lệ `scratch/legacy_data_exceptions_report.json` (553 bản ghi cần cán bộ xác minh).
- **Lý do:** Chuẩn bị bộ dữ liệu sạch cho Gói B, bảo lưu nguyên trạng file gốc để đối chiếu 1-1, và phân loại `REUSABLE` (7.364 dòng), `DATA_ONLY` (548 dòng), `CONFLICT` (5 dòng).
- **Kiểm tra:** Script thực thi thành công, file sao lưu và các tệp JSON kết quả đã được ghi vào thư mục `Tai lieu/backup/` và `scratch/`.

---

## [2026-07-23] `VietnameseDateInput` — ba ô số Ngày/Tháng/Năm cho ngày sinh và ngày cấp GCN

- **Agent:** Claude Code
- **Thay đổi:** Component `src/components/vietnamese-date-input.tsx` (ba ô số, `inputMode=numeric`,
  tự nhảy ô khi đủ số, Backspace ở ô rỗng lùi ô trước) + module thuần
  `src/modules/public-intake/vietnamese-date.ts` (`splitIsoDate`, `assembleIsoDate` với kiểm ngày
  hợp lệ / năm nhuận / chặn tương lai / khoảng năm). Ráp vào wizard cho **ngày sinh** (năm ≥ 1900)
  và **ngày cấp GCN** (năm ≥ 1987). Gỡ ô `type=date` (ngày sinh) và ô gõ tự do + helper
  `parseVietnameseDate`/`displayVietnameseDate` + state `issueDateInput` (ngày cấp) đã thay thế.
- **Lý do:** gõ tự do dễ sai định dạng (PL3 mẫu có `9/10/1017`); lịch gốc trên điện thoại bắt cuộn
  ngược nhiều năm cho ngày sinh. Ba ô số lấy được cả tốc độ bàn phím số lẫn chuẩn hóa `YYYY-MM-DD`.
  Khép mục `VietnameseDateInput` treo trong `PLAN2.md` §4.5.
- **File đã sửa:** thêm `vietnamese-date-input.tsx`, `vietnamese-date.ts`,
  `tests/vietnamese-date.test.ts`; sửa `wizard.tsx`, `PLAN2.md`.
- **Kiểm tra:** `tsc` sạch · `lint` sạch · `vitest` **144/144** (+8 test module ngày: ngày không tồn
  tại, năm nhuận, chặn tương lai, khoảng năm bắt lỗi `1017`) · `build` sạch · `/ke-khai` không lỗi
  console, component có trong bundle. Thao tác trực tiếp trên ô nằm sau bước tạo hồ sơ (cần Google)
  nên chưa chạy tay được cục bộ; logic phủ bằng unit test.

---

## [2026-07-23] Khóa tra "hồ sơ đã có" rút về CCCD + bắt buộc QR

- **Agent:** Claude Code
- **Thay đổi:**
  - **Khớp chỉ theo HMAC của CCCD.** Gỡ điều kiện `item.identityMatchHmac === identityMatchHash`
    khỏi `findExistingCertificates` và `hasPendingIdentityMatch` (repository.ts); bỏ tham số
    `identityMatchHash` và bỏ ghi `identityMatchHmac` trong `appendPendingIdentityIndex`; gỡ hàm
    `identityMatchHmac` + `normalizeIdentityName` khỏi workflow.ts; cập nhật 4 route caller (check,
    link, no-action, submit) không còn tính/truyền match hash. Script Python `identity_hashes` bỏ
    ngày sinh khỏi join.
  - **Tra nhanh bắt buộc QR.** `hasCompleteExistingRecordLookupIdentity` chỉ nhận `QR_CONFIRMED`
    (trước nhận cả `MANUAL_COMPLETE`); bỏ luôn tham số `dateOfBirth`. Gỡ nút "Kiểm tra GCN đã có"
    đường gõ tay ở wizard (điều kiện thành code chết) + import thừa.
- **Lý do:** soi kho thật thấy 87% ngày sinh chỉ có năm và họ tên đa nguồn hay lệch dấu — để trong
  khóa là trượt phần lớn hồ sơ thật. Chống dò chuyển sang bắt buộc quét QR (đang cầm thẻ thật). Xem
  `03-decisions.md` [2026-07-23].
- **Đánh đổi:** khóa CCCD-đơn ưu tiên **không bỏ sót** (recall) — false-positive do lỗi nhập CCCD
  trong kho được chặn ở bước người dân xác nhận + cán bộ duyệt liên kết. Ai QR không lên thì vẫn kê
  khai/nộp bình thường, chỉ mất lối tắt "đã có".
- **File đã sửa:** `workflow.ts`, `repository.ts`, `existing-records/check|link/route.ts`,
  `no-action/route.ts`, `submit/route.ts`, `wizard.tsx`, `scripts/import_existing_certificates.py`,
  `tests/public-workflow.test.ts`, `PLAN2.md`, `docs/brain/03-decisions.md`.
- **Kiểm tra:** `tsc` sạch · `lint` sạch · `vitest` **136/136** (đổi test QR-only + che số GCN) ·
  `build` sạch · `py_compile` script import OK.

---

## [2026-07-23] Thu "Người sử dụng đất hiện tại" (PL3 O, P, 14, 15) + nghiên cứu ba file kho

- **Agent:** Claude Code
- **Nghiên cứu ba tài liệu** (không sửa file gốc):
  - `24.7.2026_PhuongPhongChau (đã có dữ liệu).xlsx` — kho đã duyệt, 5.041 dòng. CCCD phủ 99% cá
    nhân (3.492 phân biệt); **87% ngày sinh chỉ có năm**; số phát hành GCN 90%, định dạng bẩn; 280
    tổ chức không CCCD (mã dạng `N/A-<mst>`). → Chốt khóa tra = **CCCD, bỏ ngày sinh**, xem
    `03-decisions.md`.
  - `24.7.2026 PhuongPhongChau (hiện trạng dữ liệu).xlsx` — bảng phân loại chất lượng/trạng thái theo
    thửa (nguồn gắn cờ `REUSABLE`), không phải nguồn định danh.
  - `PL3.xlsx` — xác nhận nhóm cột O, P, 14, 15 = "Thông tin người sử dụng đất hiện tại".
- **Thay đổi code — khối Người sử dụng đất hiện tại:** thêm cờ `hasDistinctCurrentUser` + 4 trường
  (`currentUserName`, `currentUserCitizenId`, `currentUserAddress`, `changeReason`) vào `Owner`;
  danh mục `CHANGE_REASON_OPTIONS` (Thừa kế/Tặng cho/Chuyển nhượng/Khác). Khi bật: `requiresCitizenId`
  vẫn true nhưng loại khỏi yêu cầu ảnh CCCD ở `validateDraftForSubmit`, endpoint gửi
  (`identityOwners`), và `completionChecklist`; UI ẩn khối ảnh/QR/ngày sinh, hiện khối người sử dụng
  hiện tại; ô CCCD người trên GCN thành tùy chọn.
- **Lý do:** nhiều ca chủ trên GCN đã mất; không quét được thẻ người đã mất nên phải miễn ảnh và thu
  người thừa kế bằng chữ (chốt "miễn ảnh, chỉ khai chữ").
- **File đã sửa:** `types.ts`, `reference.ts`, `validation.ts`, `submit/route.ts`, `workflow.ts`,
  `wizard.tsx`, `schema.ts`, `repository.ts`, `tests/public-intake-validation.test.ts`, `PLAN2.md`,
  `docs/brain/03-decisions.md`.
- **Deploy:** phải chạy lại `npm run migrate:public-intake` (thêm 5 cột `PUBLIC_OWNERS`).
- **Kiểm tra:** `tsc` sạch · `lint` sạch · `vitest` **136/136** (thêm 2 test: chủ đã mất miễn CCCD
  nhưng bắt khai đủ người sử dụng hiện tại; CCCD người hiện tại 12 số + lý do trong danh mục) ·
  `build` sạch · `/ke-khai` không lỗi console, các chuỗi mới có trong bundle client.

---

## [2026-07-22] Bốn lỗi dữ liệu chặn xuất PL3 — (c)(d)(e)(f) của `PLAN2.md` §4.2

- **Agent:** Claude Code
- **Thay đổi:**
  - **(c) Danh mục trường 12/13 theo PL3.** `OWNER_TYPES` thêm `DONG_SU_DUNG` và
    `CONG_DONG_DAN_CU` (đủ sáu). `CERTIFICATE_ROLE_OPTIONS` thay toàn bộ bốn mã tự đặt bằng sáu giá
    trị PL3: `CA_NHAN`/`CHU_HO`/`CHONG`/`VO`/`NGUOI_DAI_DIEN`/`THANH_VIEN`. `validateDraftForSubmit`
    nay bắt vai trò phải nằm trong danh mục, không chỉ khác rỗng.
  - **(d) Dung sai diện tích 0,5 m².** `LAND_USE_AREA_TOLERANCE_M2`, dùng chung giữa validation ở
    máy chủ và kiểm theo bước ở trình duyệt.
  - **(e) Bịt lỗ định danh.** `requiresCitizenId` nay đúng bằng "không phải tổ chức" — `HO_GIA_DINH`
    và `DONG_SU_DUNG` bắt buộc CCCD 12 số, ngày sinh, giới tính, địa chỉ và đủ cặp ảnh CCCD. Thêm
    `isOrganisationOwner`; tổ chức / cộng đồng dân cư miễn CCCD nhưng bắt buộc **mã số thuế** đúng
    định dạng (10 số, hoặc 10 số kèm 3 số đơn vị trực thuộc) và **địa chỉ trụ sở**.
  - **(f) Tối đa 3 dòng mục đích mỗi thửa.** `MAX_LAND_USES_PER_PARCEL`, chặn ở validation và vô
    hiệu hóa nút "+ Thêm mục đích sử dụng" kèm dòng giải thích khi đủ 3.
- **Lý do:**
  - (c) Bộ mã cũ **không trùng giá trị nào** trong dropdown của PL3 — xuất ra sẽ là giá trị lạ giữa
    file nộp. `label` giờ chính là chuỗi ghi ra file, nên test khóa cả thứ tự để đừng ai sửa nhãn
    cho "gọn" rồi làm lệch file nộp.
  - (d) Quy tắc "tổng không được vượt diện tích thửa" **từ chối chính dữ liệu do cơ quan phát
    hành**: dòng 9 của PL3 mẫu có thửa `29,16` m² nhưng loại đất ghi `29,2` m². Nguyên nhân là làm
    tròn tới 0,1 m², sai số tối đa 0,155 m² — lấy 0,5 m² cho rộng mà vẫn bắt được sai sót thật.
  - (e) Chọn "Hộ gia đình" trước đây là bỏ qua **toàn bộ** phần định danh, nộp được hồ sơ chỉ với
    một cái tên. PL3 mẫu có CCCD ở **cả ba** dòng hộ gia đình (CCCD chủ hộ) → là lỗi, không phải
    thiết kế. Hộ gia đình là dạng phổ biến nhất nên đây là phần lớn thiệt hại.
  - (f) PL3 chỉ có ba bộ cột loại đất (Z–AD, AE–AI, AJ–AN). Không chặn thì thửa khai 4 mục đích vẫn
    nộp được rồi âm thầm mất dòng thứ tư lúc xuất — mất dữ liệu không ai thấy.
- **Đường lùi cho dữ liệu cũ:** `LEGACY_CERTIFICATE_ROLE_CODES` + `normalizeCertificateRole()` đổi
  bốn mã cũ sang giá trị PL3, gọi đúng một chỗ — lúc `adoptServerDraft` tải nháp về. Không có đường
  này thì nháp cũ hiện ô "Vai trò trên GCN" trống mà người dân không hiểu vì sao.
- **Còn hở, đã ghi vào `PLAN2.md` §4.2:** hồ sơ mà **mọi** chủ thể đều là tổ chức thì
  `identityOwners` rỗng, `.every()` trả `true`, nộp được không cần ảnh CCCD nào. Mã số thuế + trụ sở
  nâng rào nhưng chưa bịt hẳn; bịt hẳn phải thu CCCD người đại diện, gộp vào đợt làm trường 14/15.
  `DONG_SU_DUNG` → `Thành viên` cũng là suy đoán gần nhất, cần cán bộ xem lại.
- **File đã sửa:** `src/modules/public-intake/types.ts` (`OWNER_TYPES`, `OWNER_TYPE_LABELS`,
  `requiresCitizenId`, `isOrganisationOwner`, `MAX_LAND_USES_PER_PARCEL`),
  `reference.ts` (`CERTIFICATE_ROLE_OPTIONS`, `CERTIFICATE_ROLE_CODES`,
  `LEGACY_CERTIFICATE_ROLE_CODES`, `normalizeCertificateRole`),
  `validation.ts` (`LAND_USE_AREA_TOLERANCE_M2`, nhánh tổ chức, giới hạn 3 dòng, dung sai),
  `src/app/ke-khai/wizard.tsx` (chuẩn hóa lúc tải nháp, ô mã số thuế / trụ sở, chặn nút thêm mục
  đích, kiểm theo bước), `tests/public-intake-validation.test.ts`, `tests/reference-catalog.test.ts`,
  `PLAN2.md`.
- **Không đổi schema Google Sheets** — bốn sửa đổi đều nằm trong giá trị của cột đã có, nên **không
  cần chạy lại `migrate:public-intake`** cho riêng đợt này (cảnh báo `old_ward` từ đợt trước vẫn còn
  hiệu lực).
- **Kiểm tra:** `npx tsc --noEmit` sạch · `npm run lint` sạch · `npx vitest run` **129/129 xanh**
  (thêm 10 test: hộ gia đình và đồng sử dụng bắt buộc CCCD, tổ chức cần MST + trụ sở, từ chối vai
  trò ngoài danh mục, khóa thứ tự hai danh mục PL3, ánh xạ bốn mã cũ, ca `29,16`/`29,2` của PL3 mẫu
  phải qua còn `29,16`/`30` phải chặn, giới hạn 3 dòng) · `npm run build` sạch · `/ke-khai` chạy dev
  không lỗi console, các chuỗi mới (`Cộng đồng dân cư`, `Mã số thuế`, `Địa chỉ trụ sở`,
  `Thêm mục đích sử dụng (tối đa …)`) có mặt trong bundle client.

---

## [2026-07-22] Thêm trường "đơn vị hành chính cũ" của thửa đất

- **Agent:** Claude Code
- **Thay đổi:** Thêm ô chọn bắt buộc _"Thửa đất thuộc đơn vị nào trước sáp nhập?"_ ở bước Thửa đất:
  Xã Phú Hộ (cũ) / Xã Hà Thạch (cũ) / Phường Phong Châu (cũ) / Không rõ.
- **Lý do:** Mảnh cuối để `lookupNewMapSheet` chạy được. Ba xã cũ đều đánh số tờ bản đồ từ 1, nên
  không có trường này thì "tờ 5" ra ba đáp án (5, 89, hoặc 148) và không thể điền trường 19 của PL3.
- **`KHONG_RO` là lựa chọn hợp lệ, không phải để trống:** bắt buộc người dân chọn một mục, nhưng có
  lối thoát. Phân biệt được "chưa xác định" với "chưa ai đụng tới" — để trống thì hai trạng thái
  này lẫn vào nhau khi cán bộ lọc hàng chờ.
- **File đã sửa:** `src/modules/public-intake/types.ts` (thêm `Parcel.oldWard`),
  `reference.ts` (`OLD_WARD_OPTIONS`), `validation.ts` (kiểm ở ranh giới tin cậy),
  `repository.ts` (ghi vào `PUBLIC_PARCELS`), `src/app/ke-khai/wizard.tsx` (ô chọn + kiểm theo bước),
  `src/modules/bootstrap/schema.ts` (cột `old_ward`), `scripts/migrate-public-intake.ts`,
  `tests/public-intake-validation.test.ts`.
- **Migration:** cột `old_ward` thêm ở **cuối** `PUBLIC_PARCELS` để không dịch cột của dữ liệu đã
  có (mã định vị theo chỉ số cột). `scripts/migrate-public-intake.ts` nay còn **nối cột thiếu vào
  tab đã tồn tại**, không chỉ tạo tab mới — vẫn idempotent, chỉ nối thêm chứ không đổi tên/chèn
  giữa/xóa. **Phải chạy `npm run migrate:public-intake` trước khi deploy bản này.**
- **Kiểm tra:** `vitest run` 119/119 đạt (3 test mới: bắt buộc chọn, chấp nhận `KHONG_RO`, từ chối
  mã lạ); typecheck và lint sạch; `/ke-khai` tải không lỗi console và trường mới có trong chunk gửi
  xuống trình duyệt.
- **Chưa làm:** màn hình chi tiết của cán bộ chưa hiện `oldWard` — nằm trong hạng mục lớn hơn "chi
  tiết cán bộ chưa hiển thị đầy đủ land-use/assets" đã ghi nhận từ trước.

## [2026-07-22] Bảng tham chiếu tờ bản đồ cũ → mới cho Phong Châu (trường 19 của PL3)

- **Agent:** Claude Code
- **Bối cảnh:** Chủ dự án cung cấp `Tai lieu/PL3.xlsx` (bộ **49 trường**, đích xuất cuối cùng — khác
  với 15 trường Phụ lục 8 đang làm) và `Tai lieu/DS THAM CHIEU PHUTHO VINHPHUC HOABINH 25052026.pdf`
  (313 trang, 33.309 dòng), yêu cầu quy đổi số tờ trên GCN sang số tờ bản đồ hiện nay khi xuất báo cáo.
- **Thay đổi:** Trích 164 dòng có xã mới là Phường Phong Châu (mã `07954`, khớp mẫu PL3), sinh
  `src/modules/public-intake/map-sheet-reference.ts` kèm hàm `lookupNewMapSheet`.
- **Quy tắc quy đổi:**
  - Xã Phú Hộ (07954): tờ 1–84 → **giữ nguyên số**.
  - Xã Hà Thạch (07963): tờ 1–59 → tờ **85–143**.
  - Phường Phong Châu cũ (07945): 21 tờ → tờ **144–164**.
- **Phát hiện quan trọng — khóa tra cứu phải gồm TỶ LỆ:** phường Phong Châu cũ có **hai** bộ bản đồ
  đánh số độc lập từ 1. Tờ 7 tỷ lệ 1/500 ra tờ 150, tờ 7 tỷ lệ 1/1000 ra tờ 156. GCN thường không
  ghi tỷ lệ nên ca này **không tự quyết được** — hàm trả `AMBIGUOUS` để cán bộ đối chiếu. Đã kiểm
  bằng test: đây là ca mập mờ **duy nhất** trong toàn bộ 164 dòng.
- **File đã tạo:** `src/modules/public-intake/map-sheet-reference.ts`,
  `tests/map-sheet-reference.test.ts`.
- **File đã sửa:** `docs/brain/01-architecture.md`.
- **Lý do:** Trường 19 "Số hiệu tờ trên bản đồ địa chính" của PL3 đang trống ở mọi dòng mẫu — đây
  chính là việc cần tự động hóa.
- **Kiểm tra:** `vitest run` 116/116 đạt (11 test mới, gồm ca mập mờ tờ 7 và ca số 0 đứng đầu như
  `"07"` mà PL3 mẫu dùng); typecheck và lint sạch. Đối chiếu tổng: 84+59+21 = 164 dòng, tờ mới phủ
  kín 1–164 không trùng không khuyết.
- **Trường còn thiếu đã được bổ sung ngay sau đó** — xem entry kế tiếp cùng ngày.
- **Bảng này KHÔNG giải quyết trường 20** ("Số thứ tự thửa trên bản đồ địa chính") — nó chỉ quy đổi
  số tờ, không quy đổi số thửa. Trường 20 vẫn cần nguồn khác hoặc cán bộ làm thủ công.

## [2026-07-22] Sửa lỗi ảnh JPG từ Zalo bị từ chối; thêm danh bạ cán bộ và phạm vi áp dụng

- **Agent:** Claude Code
- **Vấn đề:** Người dùng thật báo "một số đuôi ảnh không hoạt động, có người dùng đuôi JPG nhưng
  không được". Ảnh chụp màn hình kèm theo cho thấy tên tệp dạng
  `z8070298699198_b736ca25543c2e1e8d31942dab4553cf.jpg` — **tên tệp ảnh Zalo**.
- **Nguyên nhân gốc:** Client gửi thẳng `File.type` lên `uploads/initiate`, route so khớp tuyệt đối
  với `ACCEPTED_MIME_TYPES`. Ảnh nhận qua Zalo/Messenger thường về với `File.type` **rỗng** (hệ điều
  hành không có đăng ký cho phần mở rộng) hoặc bí danh **`image/jpg`** — không có trong danh sách,
  nên bị 400 "Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc HEIC" dù tệp là JPEG hợp lệ. Thuộc tính
  `accept` chỉ có MIME còn khiến nhiều trình quản lý tệp Android làm mờ đúng ảnh cần chọn.
- **Thay đổi:**
  - Thêm `modules/public-intake/image-format.ts`: quy bí danh (`image/jpg`, `image/pjpeg`,
    `image/x-png`, `image/heic-sequence`…) về tên chuẩn, suy từ phần mở rộng khi trình duyệt khai
    rỗng, và chuỗi `IMAGE_FILE_ACCEPT` có cả đuôi lẫn MIME.
  - `initiate` chuẩn hóa loại rồi **trả `mimeType` đã chuẩn** về client; client dùng đúng giá trị đó
    cho `Content-Type` của lệnh PUT, không dùng lại `File.type` — lệnh PUT phải khai đúng loại đã
    đăng ký với phiên resumable.
  - Ảnh GCN nay cũng đi qua `prepareCitizenIdImage` (chuyển HEIC→JPEG) như ảnh CCCD. Trước đó chỉ
    ảnh CCCD được chuyển, ảnh GCN chụp bằng iPhone đi thẳng lên Drive ở dạng HEIC.
  - Ghi chú "Đã tải N ảnh GCN" đếm theo **tổng** ảnh của hồ sơ thay vì theo lượt chọn tệp vừa rồi
    (trước đó chọn 2 lượt × 1 ảnh hiển thị "Đã tải 1 ảnh" dù danh sách có 2 dòng — thấy rõ trong ảnh
    chụp màn hình người dùng gửi). Khóa React của danh sách kèm vị trí vì tệp Zalo dễ trùng tên.
  - Thêm `modules/public-intake/support-contacts.ts`: danh bạ cán bộ hỗ trợ theo 8 tổ dân phố, đầu
    mối tư vấn chung, và `COVERAGE_NOTICE` về phạm vi áp dụng. Hiển thị ở khối "Không tự làm được?"
    (link `tel:` bấm gọi thẳng) và ngay đầu `/ke-khai`.
- **File đã tạo:** `src/modules/public-intake/image-format.ts`,
  `src/modules/public-intake/support-contacts.ts`, `tests/image-format.test.ts`.
- **File đã sửa:** `src/modules/public-intake/storage.ts`,
  `src/app/api/public/submissions/current/uploads/initiate/route.ts`, `src/app/ke-khai/wizard.tsx`,
  `src/app/ke-khai/page.tsx`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`.
- **Lý do:** Lỗi định dạng chặn người dân thật ngay ở bước tải ảnh — họ có tệp đúng nhưng hệ thống
  bảo sai. Danh bạ và phạm vi áp dụng để người dân biết gọi ai và biết trước mình có thuộc địa bàn
  không, thay vì kê khai xong mới bị từ chối.
- **Không làm yếu kiểm soát:** Giá trị chuẩn hóa chỉ là lời khai lúc tạo phiên. Chốt chặn thật vẫn
  là `verifyUploadedFile` đọc `mimeType` do Drive nhận dạng **từ nội dung tệp** — PDF đổi đuôi
  `.jpg` vẫn bị chặn và xóa.
- **Kiểm tra:** `vitest run` 105/105 đạt (thêm 10 test mới cho `image-format`, gồm đúng ca tên tệp
  Zalo với `File.type` rỗng); `npm run typecheck` và `npm run lint` sạch; `next build` đạt. Kiểm
  trực tiếp `/ke-khai` trên dev server: danh bạ hiện đủ 8 tổ, 8 liên kết `tel:`, phạm vi áp dụng
  hiện đầu trang, không tràn ngang ở khung 375px, console không lỗi.
- **Tồn đọng đã chủ dự án xác nhận cùng ngày (2026-07-22), cập nhật ngay:**
  1. TDP Hà Thạch — đồng chí Dương Văn Dũng: bổ sung số `0964216333`.
  2. Số trùng là của đồng chí Hoàng Minh Trung (không phải Vũ Đình Lâm) — sửa thành `0375998437`
     cho cả hai tổ Phú An/Phú Lợi mà đồng chí phụ trách. Số của Vũ Đình Lâm (`0962558662`) giữ
     nguyên, nay không còn trùng ai.
- **Đã chốt, KHÔNG sửa:** `NEIGHBORHOOD_HINTS` giữ nguyên **10 tổ dân phố**. Chủ dự án xác nhận
  (2026-07-22) danh sách 10 là đúng; danh bạ cán bộ chỉ có 8 đầu mối vì một cán bộ phụ trách nhiều
  tổ, không phải vì thiếu tổ. Đừng rút danh sách này xuống 8.

## [2026-07-22] Sửa lỗi tải ảnh CCCD báo "Chủ sử dụng không hợp lệ" (400)

- **Agent:** Claude Code
- **Vấn đề:** Chủ dự án test trên production, tải đủ hai mặt CCCD nhưng
  `POST /api/public/submissions/current/uploads/initiate` luôn trả **400** kèm
  "Chủ sử dụng của ảnh CCCD không hợp lệ", giao diện lại báo thiếu ảnh.
- **Nguyên nhân gốc — hai bản nháp có ID chủ sử dụng khác nhau:**
  - Trình duyệt sinh nháp riêng lúc mở trang: `emptyDraft(newId(), …)` (`wizard.tsx`).
  - Máy chủ sinh nháp riêng lúc tạo hồ sơ: `emptyDraft(randomUUID(), …)`
    (`api/public/submissions/route.ts`).
  - Khi tải ảnh, client gửi `ownerId` của nó; route `initiate` tra
    `record.draft.owners.find(c => c.id === ownerId)` trong nháp **của máy chủ** → không thấy → 400.
  - Nháp chỉ được đồng bộ khi bấm "Tiếp tục", mà ảnh CCCD lại tải **trước** lúc đó, nên không lần
    nào tải được. Lỗi có hai biểu hiện: (1) ngay chủ sử dụng đầu tiên, (2) mỗi khi người dân thêm
    người mới rồi tải ảnh ngay.
- **Thay đổi:**
  - Thêm `adoptServerDraft()`: sau khi tạo hồ sơ, lấy nháp máy chủ về bằng
    `GET /api/public/submissions/current`. Chọn hướng _lấy về_ thay vì _đẩy lên_ vì ở lần khôi phục
    (`recovered`), nháp máy chủ mới là bản có dữ liệu đã lưu — đẩy bản rỗng trên máy lên sẽ xoá dữ
    liệu người dân.
  - `handleCitizenIdUpload` gọi `saveDraft()` trước khi tải ảnh, để chủ sử dụng vừa thêm chắc chắn
    đã có trong nháp máy chủ.
- **Lỗi thứ hai phát hiện trong lúc kiểm chứng (do chính lượt trước gây ra):** siteverify của
  Cloudflare với **khóa sandbox** không trả trường `action` và luôn báo `hostname: "example.com"`
  (đã kiểm bằng curl). Phép kiểm nghiêm ngặt thêm ở lượt trước vì thế chặn luôn khóa test — tức
  quy trình chạy local ghi trong `.env.example`/`05-testing-and-deploy.md` **thực ra không dùng
  được**, và lượt trước chưa hề chạy thử đường verify này. Sửa: nhận diện bộ khóa sandbox công bố
  công khai của Cloudflare và bỏ qua hai phép kiểm đó; khóa thật vẫn kiểm nghiêm ngặt như cũ.
  Nhận diện dựa trên secret trong cấu hình máy chủ nên kẻ tấn công không tác động được.
- **File đã sửa:** `src/app/ke-khai/wizard.tsx`, `src/modules/public-intake/turnstile.ts`,
  `tests/turnstile.test.ts`.
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `format:check` ✅, `test` ✅ 95/95 (+2), `build` ✅.
  **Chạy thật đầu-cuối trên máy** (Google Sheets + Drive thật, khóa Turnstile sandbox tạm thời rồi
  khôi phục lại khóa thật ngay sau): tạo hồ sơ `200` → `GET /current` `200` (đồng bộ ID) →
  `PATCH /current` `200` (đẩy nháp) → `uploads/initiate` **`200`** (trước khi sửa là `400`) →
  `uploads/complete` `200`. Không còn thông báo "Chủ sử dụng … không hợp lệ".

---

## [2026-07-22] Deploy production đầu tiên; cờ tạm mở chốt chặn để test không domain

- **Agent:** Claude Code
- **Bối cảnh:** Chủ dự án yêu cầu deploy lên Vercel để test trên điện thoại. `git push` ở entry
  trước đã tự kích hoạt build qua GitHub integration nhưng **lỗi**: thiếu `ORIGIN_SHARED_SECRET`
  trên Vercel (biến bắt buộc, `/ke-khai` throw `EnvironmentValidationError` lúc prerender).
- **Thay đổi:**
  - Link thư mục local với Vercel project `capphongchau` (`vercel link`).
  - Sinh `ORIGIN_SHARED_SECRET` ngẫu nhiên, thêm vào Vercel Production + Preview (dạng Sensitive).
  - Deploy `vercel deploy --prod` → build thành công, alias `https://capphongchau.vercel.app`.
    `GET /api/health/google` trả `ok` cho cả oauth/drive/sheets/schema — tích hợp Google hoạt động
    đúng trên production thật.
  - Kiểm tra `vercel domains ls` / `vercel inspect`: **không có domain tùy chỉnh** nào gắn với
    project này, chỉ có `*.vercel.app`. Chủ dự án nhầm URL Vercel là domain đã "cài trên
    Cloudflare" — thực ra chỉ mới tạo widget Turnstile (khớp với key thật đã thấy trên Vercel từ
    trước), chưa có domain/DNS/Transform Rule nào cả. Vercel giữ DNS zone của `*.vercel.app`, chủ
    dự án không sở hữu nên không thể trỏ Cloudflare vào được.
  - Vì vậy `GET /ke-khai` trả **404** đúng như thiết kế chốt chặn (xem entry lớp biên trước) — nó
    chặn đúng thứ nó sinh ra để chặn, kể cả khi chính chủ dự án gọi trực tiếp. Để chủ dự án test
    được ngay, thêm cờ `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE` — mặc định không đặt (chốt chặn vẫn
    bắt buộc), chỉ tắt được khi đặt đúng chuỗi `"true"`. Xem quyết định kỹ thuật đầy đủ trong
    `03-decisions.md`.
- **File đã sửa:** `src/modules/public-intake/edge-guard.ts`, `.env.example`.
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `format:check` ✅, `test` ✅ 93/93 (+3), `build` ✅.
  Test mới khóa hành vi cờ: mặc định vẫn đòi header ở production; giá trị không phải chuỗi `"true"`
  chính xác (`"1"`, `"TRUE"`) không có tác dụng — tránh bật nhầm qua toán tử truthy.
- **CẦN LÀM SAU (bắt buộc trước pilot dữ liệu thật):** Xóa `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE`
  khỏi Vercel ngay khi có domain thật gắn Cloudflare. Xem checklist domain/Cloudflare trong
  `05-testing-and-deploy.md` §"Cấu hình Cloudflare".

---

## [2026-07-22] Áp design system Cherry Gold Civic Glass, bỏ banner bản chạy thử

- **Agent:** Claude Code
- **Thay đổi:**
  - Bỏ khối cảnh báo "BẢN CHẠY THỬ — DỮ LIỆU ĐƯỢC LƯU THẬT" ở đầu `/ke-khai` theo yêu cầu chủ dự án.
  - `globals.css` thay toàn bộ token cũ (xanh lá dịch vụ công) bằng bảng token của `DESIGN.md` §4:
    thang cherry và gold đầy đủ, nền/chữ/viền, màu ngữ nghĩa, bo góc, đổ bóng, thời lượng chuyển
    động. Giữ nguyên tên sáu biến mà JSX đang dùng (`--accent`, `--muted`, `--danger`,
    `--warning-surface`, `--warning-border`, `--foreground`) và ánh xạ chúng sang bảng mới, nên đổi
    được toàn bộ diện mạo mà không phải sửa rải rác trong component.
  - Restyle `pc-input/select/textarea/card/button` theo §7: nút chính cherry-700, nút phụ viền
    cherry-200 chữ cherry-800, focus ring 2px + `--shadow-focus`, chiều cao điều khiển 44px trên
    desktop và 48px trên mobile (§6.3, §7.2). Thêm `.pc-button-gold` cho CTA vàng và `.pc-code`
    cho mã hồ sơ/mã bí mật (mono, `tabular-nums`, bôi đen được — §4.4).
  - `prefers-reduced-motion` giờ áp cho toàn trang, không riêng panel bước (§12.4).
  - Thêm dải gradient cherry→gold ở đầu trang chủ và `/ke-khai` làm điểm neo thị giác, thay vì phủ
    màu thương hiệu dày (§1.3).
- **Phạm vi cố ý không làm:** `DESIGN.md` mô tả cả app shell nội bộ, sidebar, dashboard, bảng dữ
  liệu, modal kính mờ và một cây route khác (`/app/ho-so`, `/public/bat-dau`…). Những màn hình đó
  **chưa tồn tại**; đổi cây route sẽ phá hợp đồng API đang chạy. Lần này chỉ làm mốc "M0 — Nền tảng
  thiết kế" của chính `DESIGN.md` §18, là phần các màn hình sau kế thừa được ngay.
- **File đã sửa:** `src/app/globals.css`, `src/app/page.tsx`, `src/app/ke-khai/page.tsx`,
  `src/app/ke-khai/wizard.tsx`.
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `format:check` ✅, `test` ✅ 90/90, `build` ✅. Đo trên
  trình duyệt: token áp đúng (nút cherry-700 `#991b35`, cao 44px desktop / 48px mobile, bo 10px);
  không tràn ngang ở 360×800, 390×844 và 1440×900; không lỗi console.
- **Sửa thêm một lỗi tương phản của chính DESIGN.md:** `--text-muted` (#83777b) trên nền trắng đo
  được **4.29:1**, dưới ngưỡng AA 4.5:1 mà §13 yêu cầu. Giữ nguyên giá trị token theo §4.2 nhưng
  `.pc-field-hint` chuyển sang `--text-secondary` (7.0:1). Các cặp màu còn lại đều đạt: chữ chính
  15.9:1, chữ trắng trên nút cherry 7.9:1, nút phụ 11.0:1, danger 6.5:1, chữ trên nút vàng 8.9:1.

---

## [2026-07-22] Sửa lỗi quét QR CCCD và thêm nút quét chủ động

- **Agent:** Claude Code
- **Vấn đề:** Chủ dự án báo quét QR "không hoạt động". **Nguyên nhân gốc: thiếu hint
  `TRY_HARDER`.** Ở cấu hình mặc định, ZXing chỉ quét một số dòng ngang cố định của ảnh, nên mã QR
  có đọc được hay không phụ thuộc việc nó rơi trúng dòng quét nào — kết quả thất thường chứ không
  theo ngưỡng dự đoán được. Đo trên 9 bố cục: QR 120px **trượt**, 150px đọc được, 240px **trượt**,
  300px đọc được — cùng một khung ảnh 1200×1600. Ảnh gốc 12MP chụp dọc và ảnh vuông cũng trượt.
  Bật `TRY_HARDER` đọc được **9/9**, tốn 7–52ms. Đây là lý do lỗi sống sót qua thử nghiệm tay:
  vài bố cục ngang vẫn chạy đúng.
- **Thay đổi:**
  - `citizen-id-qr.client.ts` viết lại đường giải mã: truyền `TRY_HARDER`, thu nhỏ cạnh dài về
    1600px, và dùng `decodeFromCanvas` đọc thẳng pixel.
  - Bỏ vòng lặp thử 4 hướng xoay. Nó chỉ tồn tại để chữa cháy đúng lỗi trên (xoay ảnh dọc thành
    ngang thì đôi khi may mắn đọc được), trong khi QR vốn bất biến với hướng xoay. Cách cũ tạo 3
    chuỗi data URL vài MB từ ảnh 12MP — chậm, tốn bộ nhớ, và trên iOS canvas quá lớn có thể trả
    ảnh rỗng khiến quét hỏng im lặng.
  - Thêm nút **"Quét QR căn cước"** ngay đầu khối thông tin từng chủ sử dụng: mở camera chụp một
    kiểu mặt sau thẻ, giải mã tại chỗ, tự điền các ô bên dưới. Ảnh này **không** được tải lên.
  - Gộp phần đổ dữ liệu QR vào chủ sử dụng thành `applyQrResult` dùng chung cho hai đường (đọc
    ngầm khi tải ảnh, và quét chủ động), kèm cờ `force` phân biệt hai hành vi ghi đè.
- **File đã tạo:** `tests/citizen-id-qr-decoding.test.ts`.
- **File đã sửa:** `src/modules/public-intake/citizen-id-qr.client.ts`, `src/app/ke-khai/wizard.tsx`.
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `format:check` ✅, `test` ✅ 90/90 (+8), `build` ✅.
  Test mới khóa lại kết luận đo được: liệt kê đúng các bố cục mà cấu hình mặc định trượt, và
  khẳng định `TRY_HARDER` đọc được tất cả — ai bỏ hint đi thì test đỏ. Trang `/ke-khai` nạp sạch,
  không lỗi console hay server.
- **Chưa kiểm chứng được ở môi trường này:** camera thật trên điện thoại, và luồng quét trong thẻ
  chủ sử dụng (phải tạo một bản kê khai thật mới hiện ra khối đó — thao tác ghi dữ liệu thật vào
  Sheets/Drive nên chưa tự ý chạy). Cần một lượt thử trên điện thoại với thẻ căn cước thật.
- **Rủi ro còn lại cần thẻ thật để kiểm:** `parseCitizenIdQr` yêu cầu đúng 7 trường ngăn bằng `|`
  và 12 chữ số ở trường đầu. Chưa ai đối chiếu định dạng này với **thẻ căn cước mẫu 2024**. Ngoài
  ra chưa ép `CHARACTER_SET`, nên nếu thẻ không khai báo ECI UTF-8 thì địa chỉ có dấu tiếng Việt
  có thể ra sai chữ. Cả hai chỉ kết luận được khi quét một thẻ thật — **không được đoán rồi nới
  lỏng parser**.

---

## [2026-07-22] Lớp biên cổng công khai: chặn đi vòng qua Cloudflare + Turnstile

- **Agent:** Claude Code
- **Vấn đề:** `/api/public/*` và `/ke-khai` là bề mặt ẩn danh, mỗi lần tạo nháp sinh một thư mục
  Drive và hai dòng Sheets, mà toàn bộ kho nằm trên **một tài khoản Gmail cá nhân**. Trước thay
  đổi này cả mã nguồn chỉ có đúng một dòng TODO — không Turnstile, không rate limit, không chặn
  đường gọi thẳng `*.vercel.app`. Một script đơn giản đủ đốt hết quota Drive/Sheets trong một
  đêm. Đây là hạng mục "chặn trước khi mở công khai" trong `04-current-tasks.md`.
- **Thay đổi (phần code — phần dashboard Cloudflare do chủ dự án làm):**
  - `edge-guard.ts`: so sánh constant-time header `X-Origin-Auth` do Cloudflare gắn với
    `ORIGIN_SHARED_SECRET`. Chỉ bắt buộc khi `NODE_ENV=production` — gồm cả Preview của Vercel.
    Đây là nhánh theo môi trường triển khai, **không** có đường nào để người gọi tự khai mình
    đáng tin.
  - `turnstile.ts`: siteverify với timeout 5s, **fail-closed** mọi hướng (lỗi mạng, timeout,
    HTTP lỗi, body không parse được đều là từ chối), kiểm cả `action` lẫn `hostname`, không log
    token.
  - Va chạm đã lường: token Turnstile dùng một lần, còn luồng tạo nháp **cố ý retry cùng
    idempotency key** trên mạng yếu. Nếu chặn thẳng `timeout-or-duplicate` thì phá đúng bản sửa
    lỗi mạng yếu ngày 2026-07-21. Cách xử lý: phân biệt "token đã dùng" với "token giả" — token
    đã dùng chỉ được đi tiếp vào **đường replay idempotency**, không bao giờ tạo bản mới
    (`StaleChallengeError`).
  - Gắn chốt chặn ở ba điểm: `resolvePublicRequest` (phủ 4 route `current/*`), route tạo nháp, và
    trang `/ke-khai` (404 khi không qua Cloudflare). Cố ý **không** dùng middleware: `proxy.ts`
    sửa matcher có rủi ro hai chiều (`PLAN_NL` §10.1) và Edge runtime không có `timingSafeEqual`.
  - Widget Turnstile ở hai hành động `create` và `submit`; token gắn với đúng hành động, lấy
    widget mới sau mỗi lần dùng, nút hành động khóa khi chưa có token.
- **File đã tạo:** `src/modules/public-intake/edge-guard.ts`,
  `src/modules/public-intake/turnstile.ts`, `src/components/turnstile-widget.tsx`,
  `tests/edge-guard.test.ts`, `tests/turnstile.test.ts`, `tests/public-surface-guard.test.ts`.
- **File đã sửa:** `src/modules/common/env.ts`, `src/modules/public-intake/route-context.ts`,
  `src/app/api/public/submissions/route.ts`,
  `src/app/api/public/submissions/current/submit/route.ts`, `src/app/ke-khai/page.tsx`,
  `src/app/ke-khai/wizard.tsx`, `src/proxy.ts` (chỉ thêm comment), `.env.example`,
  `tests/env.test.ts`, `tests/public-submission-create.test.ts`.
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `format:check` ✅, `test` ✅ 82/82 (+22), `build` ✅.
  Test mới gồm: gọi thẳng deployment không có header → từ chối; header sai giá trị/sai độ dài →
  từ chối; Turnstile fail-closed khi siteverify timeout hoặc lỗi mạng; token sai `action` hoặc
  sai hostname → từ chối; token đã dùng + có nháp cũ → replay được; token đã dùng + chưa có nháp
  → **không** tạo mới; mọi route `/api/public` đều qua chốt chặn (test tự liệt kê thư mục, route
  mới quên gắn sẽ đỏ); matcher `proxy.ts` chặn đúng đường cán bộ và không chạm `/ke-khai`.
  Chạy thật trên trình duyệt: `/ke-khai` render widget, test key cấp token, nút mở khóa;
  `POST /api/public/submissions` thiếu token → 403, token giả → 403 kèm thông báo không lộ chi
  tiết. Hai lượt 403 này bị chặn **trước** mọi lệnh gọi Google. Chưa chạy tạo nháp trọn vẹn vì
  thao tác đó ghi dữ liệu thật vào Sheets/Drive của chủ dự án.
- **Chưa xong (phần dashboard, AI không làm được):** DNS proxy qua Cloudflare, SSL Full (strict),
  Transform Rule gắn `X-Origin-Auth`, cache rule bypass `/api/*` + `/ke-khai*`, rate limiting
  rules, và đặt ba biến môi trường mới trên Vercel cho cả Production lẫn Preview. Chưa làm xong
  các mục này thì `ORIGIN_SHARED_SECRET` ở origin **chưa có tác dụng bảo vệ nào**.
- **Ghi chú cho agent sau:** chưa có chỗ nào đọc `CF-Connecting-IP`. Khi làm audit HMAC(IP) thì
  bắt buộc chỉ đọc header đó **sau** khi đã qua `isTrustedEdgeRequest`, nếu không ai cũng tự khai
  IP tùy ý (`PLAN_NL` §10.2).

---

## [2026-07-21] Xử lý treo khi tải ảnh: timeout, tiếp tục từ chỗ dở, hủy được

- **Agent:** Claude Code
- **Vấn đề:** Lần trước mới sửa **nguyên nhân** của một lần treo cụ thể (thiếu header `Origin`
  nên Google không gắn CORS cho phiên resumable), chưa xử lý **việc bị treo nói chung**. `fetch`
  PUT lên Drive không có timeout, không retry, không hủy được: mạng 4G rớt giữa chừng thì giao
  diện đứng ở "Đang tải…" cho tới khi hệ điều hành đóng socket, `busy` kẹt `true` nên mọi nút bị
  khóa và người dân không có đường thoát. `PLAN.md` §6 và `PLAN_NL.md` §11 đều yêu cầu kiểm thử
  "mất mạng giữa upload, retry" — tức đây là lỗi thật, không phải chuyện phụ.
- **Thay đổi:** Thêm `src/modules/public-intake/resumable-upload.ts`:
  - Mỗi lần thử có timeout riêng (60s) bằng `AbortController`, ghép với tín hiệu hủy của người
    dùng.
  - Thất bại thì hỏi Google đã nhận bao nhiêu byte (`Content-Range: bytes */tổng` → 308 kèm
    header `Range`) rồi **gửi tiếp phần còn thiếu**, không tải lại từ đầu. Tối đa 3 lần thử.
  - Nhận ra trường hợp tệp thực ra đã lên đủ dù lần thử báo lỗi (tránh tải lại thừa).
  - Ném `UploadCancelledError`/`UploadFailedError` để giao diện phân biệt được hủy và lỗi.
  - Thêm `fetchApi` (timeout 20s) cho toàn bộ lệnh gọi API của app — trước đó cũng không có
    timeout nào.
  - Giao diện: hiện phần trăm tiến độ, nút **"Hủy tải ảnh"**, xóa lỗi cũ khi bắt đầu lượt mới,
    và `busy` luôn được trả về `false` trong `finally`.
- **File đã tạo:** `src/modules/public-intake/resumable-upload.ts`, `tests/resumable-upload.test.ts`.
- **File đã sửa:** `src/app/ke-khai/wizard.tsx`.
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `test` ✅ 46/46, `format:check` ✅, `build` ✅.
  9 test mới cho module upload, gồm: gửi tiếp đúng `Content-Range` khi mới nhận một phần; rớt
  mạng giữa chừng thì hỏi tiến độ rồi gửi nốt phần thiếu; nhận ra tệp đã lên đủ; bỏ cuộc sau số
  lần thử tối đa **thay vì treo**; hủy thì dừng ngay không thử lại; timeout tự kết thúc lần thử.
  Chạy thật trên trình duyệt: tải ảnh 175 KB thành công; bắt đầu tải ảnh **12,7 MB** rồi bấm
  "Hủy tải ảnh" → dừng ngay, hiện "Đã hủy tải ảnh...", **các nút mở khóa lại**; sau đó chọn tệp
  khác tải lại thành công.

---

## [2026-07-21] Cổng kê khai công khai lưu thật vào Google Sheets + Drive

- **Agent:** Claude Code
- **Thay đổi:** Nâng demo `/ke-khai` từ UI-only lên lưu trữ thật. Migration idempotent thêm 7 tab
  `PUBLIC_*`; phiên công khai bằng cookie ký HMAC + CSRF riêng (người dân không có email nên
  không dùng lại `modules/auth/csrf.ts`); 5 API route công khai; upload resumable trực tiếp
  browser → Drive; submit trải nháp JSON thành các dòng chuẩn hóa trong **một** `batchUpdate`.
- **Quyết định thiết kế đáng chú ý:** nháp lưu dạng JSON trong `PUBLIC_SUBMISSIONS.draft_json`,
  chỉ chuẩn hóa ra 5 tab con **khi gửi**. Nháp bị sửa liên tục; nếu chuẩn hóa ngay thì mỗi lần
  lưu phải xóa/ghi lại nhiều dòng ở năm tab, đốt đúng cái quota ghi Sheets vốn là trần thật của
  hệ thống (`PLAN_NL.md` §9.1).
- **File đã tạo:** `scripts/migrate-public-intake.ts`, `src/modules/public-intake/{session,
repository,storage,route-context,validation}.ts`, `src/app/api/public/submissions/**` (5 route),
  `tests/public-intake-validation.test.ts`.
- **File đã sửa:** `src/modules/bootstrap/{schema,index}.ts`, `src/modules/common/env.ts`,
  `src/modules/google/workspace-client.ts`, `src/app/ke-khai/{page,wizard}.tsx`, `.env.example`,
  `package.json`, `tests/env.test.ts`.
- **Hai lỗi phát hiện khi chạy thật, đã sửa:**
  1. **Upload từ trình duyệt bị treo.** Google chỉ gắn CORS header cho phiên resumable nếu header
     `Origin` được gửi **lúc tạo phiên**. Thiếu nó thì PUT từ browser treo vô hạn (không phải lỗi
     CORS rõ ràng nên rất khó đoán). Đã truyền `browserOrigin` lấy từ `new URL(request.url).origin`
     — không lấy từ header `Origin` của client để tránh phản chiếu origin lạ.
  2. **PATCH không validate lại dữ liệu.** Chỉ endpoint tạo mới kiểm số điện thoại; PATCH nhận
     nguyên `draft` nên số điện thoại hỏng ghi thẳng vào Sheets (phát hiện khi một giá trị `002`
     lọt vào kho lúc kiểm thử). Thêm `validation.ts` kiểm ở cả PATCH lẫn submit.
- **Bảo mật đã có:** cookie `HttpOnly`/`SameSite=Strict` trượt 2h–trần 12h; CSRF buộc vào phiên;
  submission_id **chỉ** lấy từ cookie đã ký, không nhận từ URL/body; mã bí mật chỉ lưu HMAC với
  pepper riêng; xác minh parent/MIME/kích thước sau upload và **xóa tệp không đạt**; ngân sách
  byte và số lượng ảnh enforce ở server; không trả Drive ID ra client.
- **Chưa có, bắt buộc trước khi deploy công khai:** Turnstile, Cloudflare rate limiting, kiểm tra
  `ORIGIN_SHARED_SECRET` (`PLAN_NL.md` §10, §10.2). Banner trên `/ke-khai` đang nói rõ điều này.
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `test` ✅ 37/37, `format:check` ✅, `build` ✅.
  Migration chạy hai lần: lần đầu tạo 7 tab, lần hai báo "không có tab nào cần thêm" (idempotent).
  Chạy thật đầu-cuối trên trình duyệt: tạo nháp → autosave hiện "Đã lưu" → xác nhận mã bí mật →
  tải 1 ảnh CCCD + 2 ảnh GCN thẳng lên Drive → gửi. Đối chiếu Sheets sau khi gửi:
  `PUBLIC_SUBMISSIONS` `SUBMITTED`, `PUBLIC_CERTIFICATES`/`OWNERS`/`PARCELS`/`LAND_USES` mỗi tab
  1 dòng, `PUBLIC_ASSETS` 0 dòng (đúng, không có tài sản), `PUBLIC_FILES` 3 dòng đều có checksum.
  Xác nhận CSRF chặn: gọi `uploads/initiate` thiếu token trả 403 `ACCESS_DENIED`.
- **Dữ liệu demo còn lại trong Sheets:** 2 dòng `PUBLIC_SUBMISSIONS` (một `DRAFT`, một
  `SUBMITTED`) và 3 ảnh trong `01_INBOX` — dữ liệu giả, xóa được bất cứ lúc nào.

---

## [2026-07-21] Demo cổng kê khai công khai `/ke-khai` (UI-only, không đụng Google)

- **Agent:** Claude Code
- **Thay đổi:** Dựng bản chạy thử cổng kê khai cho người dân — wizard 8 bước phủ đủ 15 trường
  Phụ lục 8, sinh mã tiếp nhận/mã bí mật, sàng lọc trường hợp ngoài phạm vi, xác nhận đã lưu mã
  trước khi cho tải ảnh. Thêm design token vào `globals.css` (nền `#F7F6F3`, mặt trắng, viền
  `#EAEAEA`, nhấn xanh lục, input cao 48px, focus ring rõ, tắt animation khi
  `prefers-reduced-motion`), thay font Arial bằng system stack. Trang chủ tách hai đường đi
  "Người dân" / "Cán bộ".
- **Phạm vi có chủ đích:** **không** gọi Google Sheets/Drive, **không** migration, **không**
  upload thật, **không** API route mới. Dữ liệu chỉ nằm trong state React và mất khi tải lại
  trang. Có banner "BẢN CHẠY THỬ — KHÔNG NHẬP DỮ LIỆU THẬT" trên đầu trang để không ai nhập PII
  thật vào form chưa có lớp bảo vệ nào.
- **File đã tạo:** `src/modules/public-intake/types.ts`, `src/modules/public-intake/reference.ts`,
  `src/modules/public-intake/receipt-code.ts`, `src/app/ke-khai/page.tsx`,
  `src/app/ke-khai/wizard.tsx`, `tests/receipt-code.test.ts`, `.claude/launch.json`.
- **File đã sửa:** `src/app/globals.css`, `src/app/page.tsx`.
- **Lý do:** Chủ dự án yêu cầu có bản demo chạy thử trước, các hạng mục còn tồn đọng note lại
  hoàn thiện sau. Chọn phạm vi UI-only để tránh migration cột trên `CASES`/`CERTIFICATES`/`OWNERS`
  (rủi ro cao, không hoàn tác được) và để không phụ thuộc bảng mã trường 12 hiện chưa có.
- **Nợ kỹ thuật đã ghi rõ trong code:** `reference.ts` có cờ `REFERENCE_IS_PLACEHOLDER` và cảnh
  báo — **toàn bộ danh mục mã là giá trị tạm**, phải thay bằng bảng mã chính thức từ Chi nhánh
  VPĐKĐĐ Phú Thọ/đơn vị thi công trước khi dùng dữ liệu thật (xem `PLAN_NL.md` §5.3 mục V1).
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `test` ✅ 25/25 (thêm 10 test cho mã tiếp nhận: bảng chữ
  không chứa `0/O/1/I/L/U`, năm theo `Asia/Ho_Chi_Minh` — có case 31/12 23:00 UTC phải ra 2027,
  ký tự kiểm tra, 200 mã liên tiếp không trùng), `format:check` ✅, `build` ✅ (`/ke-khai` prerender
  tĩnh). Chạy thật trên trình duyệt: xác nhận render tiếng Việt đúng, chọn "Chưa có GCN" hiện khối
  định tuyến ra một cửa và khóa nút Tiếp tục, thiếu ô đồng ý thì chặn chuyển bước, qua bước 2 sinh
  `PC-KK-2026-2GTT7JG9` (ký tự kiểm tra khớp) và mã bí mật 4 nhóm.

---

## [2026-07-21] Sửa sau review Task 4: fail-fast cấu hình, Zod v4, chuẩn hóa line ending

- **Agent:** Claude Code
- **Thay đổi:** (1) Thêm `src/instrumentation.ts` gọi `loadServerEnvironment()` khi server khởi động — trước đó hàm này không có caller nào nên validation cấu hình chỉ tồn tại trên giấy; guard bỏ qua ở dev và lúc build để `next build` và Playwright vẫn chạy được trên máy chưa dựng `.env`. (2) Đổi `env.ts` sang cú pháp Zod v4 (`z.url()`, `z.email()` thay cho `z.string().url()/.email()` kiểu v3 đã deprecated). (3) Thêm `.gitattributes` (`* text=auto eol=lf`) vì `core.autocrlf=true` trên Windows tạo CRLF trong working tree, làm `format:check` đỏ lại sau **mỗi** lần checkout/merge — file nhị phân (`*.pdf`, `*.docx`, ảnh) đánh dấu `binary` để không bị chuẩn hóa.
- **File đã tạo:** `src/instrumentation.ts`, `tests/instrumentation.test.ts`, `.gitattributes`.
- **File đã sửa:** `src/modules/common/env.ts`, và chuẩn hóa line ending LF trên toàn repo.
- **Lý do:** Khắc phục phát hiện khi review M0 Task 4 — cấu hình sai lẽ ra phải làm hỏng deploy chứ không phải hỏng request đầu tiên chạm Google API giữa lúc cán bộ đang nộp hồ sơ; và gate format phải ổn định thay vì đỏ/xanh theo thao tác git.
- **Kiểm tra:** `lint` ✅, `typecheck` ✅, `test` ✅ 10/10 (thêm 3 test cho các nhánh guard, gồm test chứng minh server production thiếu biến môi trường thì **ném lỗi thật**), `format:check` ✅, `build` ✅. Xác nhận `.next/server/instrumentation.js` được sinh ra (Next đã nhận hook), `git check-attr` trả `eol: lf` cho mã nguồn và `binary: set` cho PDF/DOCX, kích thước hai file nghiệp vụ không đổi (1102991 / 15946 bytes).

---

## [2026-07-21] Hoàn thành M1 Task 7 — cấu hình OAuth và tạo clients

- **Agent:** Codex
- **Thay đổi:** Tạo cấu hình Google Auth Platform với app name `Ho so dat dai Phong Chau`, nhóm người dùng External và email hỗ trợ/liên hệ `anmphongandn@gmail.com`; tạo hai OAuth client: `Phong Chau Web Sign-In` (Web application) và `Phong Chau Drive Sheets Bootstrap` (Desktop app). Web client chỉ có origin `http://localhost:3000` và redirect URI `http://localhost:3000/api/auth/callback/google`.
- **File đã sửa:** `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Tách OAuth đăng nhập web khỏi OAuth offline dùng để bootstrap kho My Drive/Google Sheets, không dùng service account.
- **Kiểm tra:** Google Auth Platform xác nhận tạo thành công cả hai clients. Không download, commit hoặc ghi client secret vào tài liệu/source. OAuth hiện ở trạng thái External/Testing; phải thêm URL Vercel, kiểm tra consent screen và chuyển Production trước dữ liệu thật.

---

## [2026-07-21] Hoàn thành M1 Task 6 — bật Google Drive API và Google Sheets API

- **Agent:** Codex
- **Thay đổi:** Bật hai dịch vụ bắt buộc trong Google Cloud Project `resolute-future-478306-e7`: `drive.googleapis.com` và `sheets.googleapis.com`.
- **File đã sửa:** `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Cho phép bước tiếp theo tạo OAuth clients và bootstrap an toàn My Drive/Google Sheets cho ứng dụng.
- **Kiểm tra:** Trang API/Service Details của từng dịch vụ hiển thị trạng thái `Enabled` và nút `Disable API`.

---

## [2026-07-21] Hoàn thành M1 Task 5 — tạo Google Cloud Project

- **Agent:** Codex
- **Thay đổi:** Tạo Google Cloud Project bằng tài khoản chủ sở hữu đã chốt `anmphongandn@gmail.com`; Project ID `resolute-future-478306-e7`, Project number `192974001854`.
- **File đã sửa:** `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thành bước 1 của M1 để chuẩn bị bật Google Drive API, Google Sheets API và tạo OAuth clients. Chưa tạo API key, OAuth client, refresh token hay thay đổi cấu hình ứng dụng.
- **Kiểm tra:** Google Cloud Console hiển thị dashboard của Project ID `resolute-future-478306-e7` dưới đúng tài khoản chủ sở hữu.

---

## [2026-07-21] Sửa 3 điểm sau review M0: ghim version, typecheck tests, prettier

- **Agent:** Claude Code
- **Thay đổi:** (1) Ghim toàn bộ dependency trong `package.json` từ `"latest"` sang range `^x.y.z` theo phiên bản đã cài (Next 16.2.10, React 19.2.7, …), đồng bộ `package-lock.json` bằng `npm install --package-lock-only`. (2) Thêm script `typecheck` + `tsconfig.typecheck.json` bao cả `tests/` (tsconfig chính đang exclude `tests`, nên trước đó test không được kiểm kiểu). (3) Chạy `prettier --write .` để `format:check` xanh — trước đó fail trên chính file scaffold (`src/app/page.tsx`, `tsconfig.json`, `tests/*`).
- **File đã sửa:** `package.json`, `package-lock.json`, `tsconfig.typecheck.json` (mới), và reformat prettier trên nhiều file `src/`, `tests/`, `docs/`, `*.md`.
- **Lý do:** Khắc phục các phát hiện khi review 3 task M0 — `"latest"` gây trôi phiên bản (rủi ro tái lập/supply-chain), tests không được typecheck, và quality gate `format:check` đỏ ngay từ đầu.
- **Kiểm tra:** `npm run lint` ✅, `npm run typecheck` ✅ (đã bao tests), `npm test` ✅ 3/3, `npm run format:check` ✅, `npm run build` ✅. Xác nhận `package.json` không còn chuỗi `"latest"`.

## [2026-07-21] Hoàn thành M0 Task 4 — cấu hình môi trường và lỗi API

- **Agent:** Codex
- **Thay đổi:** Thêm `.env.example`, `loadServerEnvironment` dùng Zod và payload lỗi API thống nhất với HTTP status mapping. Validation chỉ báo tên biến lỗi, không chứa giá trị secret.
- **File đã tạo/sửa:** `.env.example`, `src/modules/common/env.ts`, `src/modules/common/api-error.ts`, `tests/env.test.ts`, `tests/api-error.test.ts`, `README.md`, `docs/architecture.md`, `docs/brain/00-project-overview.md`, `docs/brain/01-architecture.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thành M0 Task 4 và tạo ranh giới cấu hình/lỗi an toàn trước khi M1 tích hợp dịch vụ Google.
- **Kiểm tra:** ESLint, Vitest, TypeScript, Prettier cho file mới và Next.js production build.

---

## [2026-07-21] Hoàn thành M0 Task 3 — khung module và ranh giới repository

- **Agent:** Codex
- **Thay đổi:** Tạo module `auth`, `cases`, `files`, `drive`, `sheets`, `qr`, `users`, `reports`, `audit`, `common`; công bố enum/kiểu domain tối thiểu, hợp đồng `DataRepository` và `StorageRepository`, không tích hợp Google API hoặc thêm luồng nghiệp vụ sớm.
- **File đã tạo/sửa:** `src/modules/**/*`, `tests/domain.test.ts`, `docs/brain/01-architecture.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thành M0 Task 3, định hình biên giới module để các task M1–M4 không gọi trực tiếp Google API từ component hoặc service.
- **Kiểm tra:** ESLint, Vitest, TypeScript và Next.js production build.

---

## [2026-07-21] Hoàn thành mã M1 Task 8 — bootstrap Google và health check

- **Agent:** Codex
- **Thay đổi:** Thêm Google API client chỉ dùng server/CLI, schema bootstrap cho 14 tab Sheets và dữ liệu danh mục, cùng `scripts/bootstrap-google.ts` tạo idempotent cây My Drive, spreadsheet và `SYSTEM_ADMIN` đầu tiên. Thêm `GET /api/health/google` kiểm tra token OAuth, thư mục gốc và schema; khai báo/lưu scope `drive.file` trong Google OAuth consent screen.
- **File đã tạo/sửa:** `src/modules/bootstrap/*`, `src/modules/google/workspace-client.ts`, `scripts/bootstrap-google.ts`, `src/app/api/health/google/route.ts`, `tests/bootstrap-schema.test.ts`, `package.json`, `package-lock.json`, `tsconfig.typecheck.json`, `.gitignore`, `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`.
- **Lý do:** Hoàn thành phần code của M1 mà không cần tạo thủ công file Drive (không tương thích với `drive.file`) và không đưa secret/refresh token vào source hoặc terminal.
- **Kiểm tra:** `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test`, `npm.cmd run build`, `git diff --check` đều đạt. Chưa chạy bootstrap thật/health live vì OAuth client secret chưa được lưu an toàn trong `.env.local`.

---

## [2026-07-21] Bootstrap CLI tự nạp `.env.local`

- **Agent:** Codex
- **Thay đổi:** Bootstrap CLI dùng `@next/env` để nạp `.env.local` trước khi validation, đồng thời khai báo dependency trực tiếp.
- **File đã sửa:** `scripts/bootstrap-google.ts`, `package.json`, `package-lock.json`, `docs/brain/05-testing-and-deploy.md`.
- **Lý do:** Hướng dẫn vận hành dùng `.env.local`; `tsx` không tự nạp file này như Next.js nếu không có cấu hình rõ ràng.
- **Kiểm tra:** `npm.cmd run format:check`, `npm.cmd run typecheck`, `npm.cmd run test`, `git diff --check` đều đạt.

---

## [2026-07-21] Sửa entrypoint CommonJS cho bootstrap CLI

- **Agent:** Codex
- **Thay đổi:** Thay top-level `await` bằng lời gọi `bootstrap()` có xử lý lỗi rõ ràng, tương thích với output CommonJS của `tsx` trong dự án.
- **File đã sửa:** `scripts/bootstrap-google.ts`.
- **Lý do:** Lần chạy bootstrap thật dừng trước OAuth do `tsx` báo top-level `await` không được hỗ trợ với CommonJS; chưa tạo dữ liệu Google ở lần chạy lỗi.
- **Kiểm tra:** Chạy lại bootstrap sau typecheck.

---

## [2026-07-21] Bootstrap My Drive và Google Sheets thành công

- **Agent:** Codex + chủ dự án xác minh Google OAuth
- **Thay đổi:** Chạy bootstrap thật bằng tài khoản quản trị; tạo hoặc xác nhận cây My Drive, spreadsheet 14 tab, dữ liệu tham chiếu 10 tổ dân phố và dòng `SYSTEM_ADMIN` đầu tiên.
- **File đã tạo cục bộ:** `.bootstrap-state.json`, `.bootstrap-secrets.json` (đều bị Git bỏ qua; không ghi ID/token vào working log).
- **Lý do:** Hoàn tất phần tạo kho dữ liệu thật của M1.
- **Kiểm tra:** Chạy lại `npm.cmd run bootstrap:google` đạt và trả thông báo `Bootstrap hoàn tất`; lần chạy lại dùng state hiện có, không tạo trùng kho dữ liệu.

---

## [2026-07-21] Health check M1 không phụ thuộc cấu hình đăng nhập M2

- **Agent:** Codex
- **Thay đổi:** Tách validation cấu hình kho Google khỏi validation cấu hình server đầy đủ; `GET /api/health/google` chỉ cần OAuth Drive, refresh token, Drive root ID và spreadsheet ID.
- **File đã sửa:** `src/modules/common/env.ts`, `src/app/api/health/google/route.ts`, `tests/env.test.ts`, `docs/brain/01-architecture.md`, `docs/brain/05-testing-and-deploy.md`.
- **Lý do:** Cần xác minh M1 ngay sau bootstrap, trước khi tạo Google Sign-In và các secret của M2.
- **Kiểm tra:** `npm.cmd run format:check`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test` đều đạt (13 tests). Health check thật trả HTTP 200 với `oauth`, `drive`, `sheets`, `schema` đều `ok`.

---

## [2026-07-21] Hoàn thành M2 — Google Sign-In và phân quyền USERS

- **Agent:** Codex
- **Thay đổi:** Thêm Auth.js/Google OAuth (scope đăng nhập tối thiểu, state/PKCE, session JWT cookie
  HttpOnly/SameSite/Secure), `proxy.ts` bảo vệ session ở Edge và authorization Node đọc lại `USERS`
  cho từng page/API. Hoàn thành `/profile`, `/users` cho SYSTEM_ADMIN, `GET/POST/PATCH /api/users`,
  `GET /api/security/csrf`. Token CSRF HMAC gắn email, hạn 10 phút; API write yêu cầu CSRF và
  idempotency key. Repository Users ghi `USERS`, `AUDIT_LOGS`, `REQUEST_LOG` cùng một Sheets
  `batchUpdate`; audit từ chối đăng nhập chỉ lưu hash email.
- **File đã tạo/sửa:** `src/auth*`, `src/proxy.ts`, routes auth/users/CSRF, module `auth`, repository
  Users, trang profile/users, component quản trị, test CSRF, `package.json`/lockfile và tài liệu kiến trúc.
- **Lý do:** Hoàn thành M2 trước khi tạo/upload hồ sơ để email ngoài allowlist không thể truy cập và
  thay đổi quyền có hiệu lực ngay.
- **Kiểm tra:** `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test` (15 tests),
  `npm.cmd run format:check`, `npm.cmd run build` đều đạt.

## [2026-07-21] Sửa tạo bản kê khai bị báo lỗi sau khi backend đã ghi

- **Agent:** Codex
- **Thay đổi:** Bắt buộc UUID `idempotency-key` cho API tạo nháp công khai; sinh ổn định
  submission ID, mã tiếp nhận và mã bí mật bằng HMAC; cache kết quả không chứa secret trong
  `REQUEST_LOG`; batch dòng nháp và request log; gộp retry chồng nhau trong cùng instance. Giao
  diện giữ key theo phiên, tự retry một lần khi lỗi mạng/5xx, bắt rejection và hiển thị hướng dẫn
  khôi phục. Route trả lỗi JSON an toàn, có `maxDuration=30`; client chờ 35 giây.
- **File đã sửa:** `src/app/api/public/submissions/route.ts`, `src/app/ke-khai/wizard.tsx`,
  `src/modules/public-intake/repository.ts`, `src/modules/public-intake/creation-idempotency.ts`,
  `tests/public-submission-create.test.ts`, `AGENTS.md`, `docs/architecture.md`,
  `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`,
  `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Lần thử trên điện thoại đã tạo `DRAFT` và thư mục Drive thật nhưng mất response sau
  khoảng 8,4 giây; UI báo thất bại và lần bấm lại có nguy cơ tạo hồ sơ trùng.
- **Kiểm tra:** Test route bao phủ tạo mới, replay sau mất response, hai retry chồng nhau và lỗi
  Google không lộ chi tiết. `typecheck`, lint, 50/50 Vitest, Prettier và `git diff --check` đạt;
  smoke trực tiếp `/ke-khai` trả HTTP 200 và API thiếu idempotency key trả JSON 400 đúng chuẩn.
  Playwright runner cấu hình sẵn không khởi động được server port 3001 vì Next dev port 3000 đang
  giữ khóa `.next`; không dừng server người dùng đang thử để tránh gián đoạn.

## [2026-07-21] Bắt đầu khu vực cán bộ xử lý bản kê khai

- **Agent:** Codex
- **Thay đổi:** Thêm hàng chờ `/submissions`, trang chi tiết bản kê khai và API có allowlist, role,
  CSRF, version và audit cho thao tác nhận xử lý, yêu cầu bổ sung và từ chối. Dữ liệu nhạy cảm bị
  che; không trả Drive ID hoặc link Drive.
- **File đã sửa:** `src/app/submissions/*`, `src/app/api/submissions/*`, `src/components/submission*`,
  `src/modules/public-intake/repository.ts`, `src/modules/submissions/review.ts`, `src/proxy.ts`,
  `src/app/profile/page.tsx`, test và tài liệu kiến trúc liên quan.
- **Lý do:** Cổng công khai đã ghi `PUBLIC_*` nhưng chưa có đường cho cán bộ xem hoặc phân loại hồ sơ.
- **Kiểm tra:** TypeScript, ESLint, Prettier và Vitest được chạy sau thay đổi. Tiếp nhận chính thức,
  preview và migration schema là bước tiếp theo; nút tiếp nhận chưa được mở khi bảng mã trường 12
  còn là placeholder.

## [2026-07-21] Hiện PII đầy đủ trong chi tiết hồ sơ cho cán bộ

- **Agent:** Codex
- **Thay đổi:** Trang chi tiết `/submissions/:id` trả và hiển thị đầy đủ số điện thoại cùng CCCD/số
  định danh sau khi server kiểm tra role cán bộ; danh sách hàng chờ vẫn che PII. Mỗi lượt mở chi
  tiết ghi audit `SUBMISSION_SENSITIVE_DETAIL_VIEWED`.
- **Lý do:** Cán bộ cần đối chiếu trực tiếp số liên hệ và định danh với giấy tờ khi xử lý hồ sơ.
- **Kiểm tra:** API vẫn đặt `cache-control: no-store`, không trả Drive ID/link và chỉ role nghiệp vụ
  mới truy cập được trang/endpoint.

## [2026-07-21] Xem ảnh giấy tờ trong chi tiết hồ sơ

- **Agent:** Codex
- **Thay đổi:** Thêm route ảnh preview có kiểm tra role, tra `PUBLIC_FILES`, lấy thumbnail nội bộ
  từ Google Drive bằng OAuth rồi trả `private, no-store`; UI hiển thị CCCD/GCN trong chi tiết hồ
  sơ. Không trả URL thumbnail hay ảnh gốc cho trình duyệt.
- **Lý do:** Cán bộ cần đối chiếu dữ liệu khai báo với ảnh giấy tờ mà không mở Drive công khai.
- **Kiểm tra:** Mỗi lượt preview ghi `SUBMISSION_FILE_PREVIEW_VIEWED`; typecheck, lint, Vitest và
  Prettier đạt. Thumbnail phụ thuộc Drive tạo được preview cho loại tệp đã tải.

## [2026-07-21] Chuẩn bị saga tiếp nhận chính thức an toàn

- **Agent:** Codex
- **Thay đổi:** Sửa ánh xạ các cột `PUBLIC_SUBMISSIONS` để mọi transition/lưu nháp/submit bảo toàn
  consent, thời hạn lưu, `official_case_id` và checkpoint. Thêm guard/API `POST
/api/submissions/:submissionId/accept`, định nghĩa checkpoint saga, kiểm tra role/CSRF/version/
  idempotency và khóa rõ ràng khi danh mục mã trường 12 còn placeholder. UI hiển thị nút tiếp nhận
  bị khóa cùng lý do; ảnh preview vẫn sử dụng được.
- **File đã sửa:** `src/modules/public-intake/repository.ts`, `src/modules/submissions/acceptance.ts`,
  `src/app/api/submissions/[submissionId]/accept/route.ts`, `src/app/api/submissions/[submissionId]/route.ts`,
  `src/components/submission-detail.tsx`, `tests/submission-*.test.ts`, `AGENTS.md` và tài liệu brain.
- **Lý do:** Tiếp nhận chính thức là quy trình nhiều hệ thống (Sheets + Drive); không được promotion
  nửa chừng hoặc ghi dữ liệu thật bằng mã danh mục demo.
- **Kiểm tra:** TypeScript, ESLint, 55/55 Vitest, Prettier và `git diff --check` đạt.

## [2026-07-21] Dùng mã loại đất theo Thông tư 08/2024/TT-BTNMT cho bản demo

- **Agent:** Codex
- **Thay đổi:** Thay danh mục loại đất minh họa bằng các mã dùng trong Mục A, Phụ lục II Thông tư
  08/2024/TT-BTNMT; thêm version catalog và test. Mã nguồn gốc, hình thức, thời hạn được giữ là
  mã chuẩn hóa nội bộ để map về danh mục trao đổi của VPĐKĐĐ sau này.
- **Nguồn:** Công báo điện tử Chính phủ, Thông tư 08/2024/TT-BTNMT, hiệu lực 01/08/2024.
- **Kiểm tra:** TypeScript, ESLint, Vitest và Prettier.

## Format entry

```
## [YYYY-MM-DD] [Tên task ngắn gọn]
- **Agent:** Claude Code | Codex
- **Thay đổi:** <mô tả ngắn những gì đã làm>
- **File đã sửa:** <danh sách file>
- **Lý do:** <vì sao cần thay đổi>
- **Kiểm tra:** <cách xác minh hoạt động đúng>
```

---

## [2026-07-21] Cặp ảnh CCCD theo người và tự điền QR từ ảnh

- **Agent:** Codex
- **Thay đổi:** Chuyển bước đầu của `/ke-khai` thành tạo nháp sau đồng ý rồi tải cặp CCCD mặt trước/mặt sau cho từng cá nhân (tối đa 10). Browser chuyển HEIC cục bộ, dùng ZXing thử ảnh/xoay, parse QR bảo thủ và chỉ lưu dữ liệu tách, hash, phiên bản xử lý; người kê khai phải xác nhận kết quả QR. QR thất bại bắt buộc nhập tay ngày sinh, giới tính và thường trú. Bổ sung liên kết `owner_id` cho ảnh, thay ảnh an toàn `REPLACED`, migration append-only và preview cán bộ cho hai mặt.
- **File đã sửa:** `wizard.tsx`, public upload/submit routes, public-intake types/repository/QR parser, schema bootstrap, migration script, test và tài liệu kiến trúc.
- **Lý do:** Giảm thời gian nhập CCCD nhưng không dùng OCR; hỗ trợ QR ở mặt sau thẻ căn cước mới và đối chiếu đầy đủ hai mặt.
- **Kiểm tra:** `npm.cmd run test` (59/59), `typecheck`, `lint`, `format:check`, `build` và `git diff --check` đạt. Cần chạy migration schema trước deploy.

---

## [2026-07-22] Áp dụng migration cặp CCCD trên Google Sheets

- **Agent:** Codex
- **Thay đổi:** Chạy `migrate:citizen-id-pairs`, thêm append-only `owner_id` vào `FILES`, `IDENTITY_QR_SCANS`, `PUBLIC_FILES`; thêm ngày sinh, giới tính, thường trú, nguồn và metadata QR vào `PUBLIC_OWNERS`.
- **Lý do:** Đồng bộ schema Google Sheets thật với luồng cặp ảnh CCCD theo từng cá nhân.
- **Kiểm tra:** Chạy lại migration ngay sau đó không ghi thêm cột nào, xác nhận idempotent.

---

---

## [2026-07-21] Khởi tạo bộ não dự án (AI project brain)

- **Agent:** Claude Code
- **Thay đổi:** Tạo `CLAUDE.md` mới và `docs/brain/00-06` làm bộ nhớ dùng chung cho AI. `AGENTS.md` hiện có được giữ nguyên nội dung nghiệp vụ chi tiết, chỉ thêm phần trỏ tới `docs/brain/` ở đầu file (hợp nhất, không ghi đè — `AGENTS.md` gốc đã rất chi tiết và chính xác).
- **File đã tạo:** `CLAUDE.md`, `docs/brain/00-project-overview.md`, `docs/brain/01-architecture.md`, `docs/brain/02-coding-rules.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`.
- **File đã sửa:** `AGENTS.md` (thêm header trỏ tới `docs/brain/`).
- **Lý do:** Thiết lập ngữ cảnh và quy tắc dùng chung để mọi AI agent đọc trước khi code, tránh "code mù" khi dự án bắt đầu triển khai mã nguồn (M0 trong `PLAN.md`).
- **Kiểm tra:** Các file tồn tại, nội dung khớp với `README.md`/`AGENTS.md`/`PLAN.md`/`docs/architecture.md` hiện có tại thời điểm khởi tạo (2026-07-21); các mục chưa xác minh được (lệnh cài đặt thật, Code Graph) được đánh dấu `_(cần bổ sung)_` thay vì bịa.

## [2026-07-21] Rà soát kỹ thuật PLAN.md, chốt các điểm hở trước M0

- **Agent:** Claude Code
- **Thay đổi:** Review `PLAN.md` theo yêu cầu người dùng, phát hiện các lỗ hổng kỹ thuật (sinh Case ID có race condition, cơ chế version-conflict/idempotency chưa cụ thể trên Sheets, thiếu thư viện HEIC, bảo mật CSRF dồn hết vào M5, backup không tách khỏi tài khoản gốc, thiếu ghi chú tuân thủ PII) và cập nhật trực tiếp vào tài liệu thay vì chỉ để lại nhận xét.
- **File đã sửa:** `PLAN.md` (§2.1, §2.3, §3, M2, M3.6, M5, §5, thêm §7 Tuân thủ dữ liệu cá nhân), `docs/brain/03-decisions.md` (8 entry quyết định mới, 1 entry đánh dấu "cần chủ dự án xác nhận"), `docs/brain/01-architecture.md` (Stack, Lưu ý kiến trúc), `docs/brain/05-testing-and-deploy.md` (ghi chú backup/SPOF).
- **Lý do:** Các lỗ hổng này ảnh hưởng tính đúng đắn dữ liệu (trùng Case ID) và bảo mật (CSRF, backup) nếu để agent code M0–M5 tự suy diễn mỗi người một kiểu.
- **Kiểm tra:** Đọc lại `PLAN.md` để xác nhận số thứ tự mục (1–8) không bị gãy sau khi chèn §7 mới; đối chiếu `docs/brain/03-decisions.md` với `PLAN.md` để không mâu thuẫn.

## [2026-07-21] Hoàn thành M0 Task 1 — đồng bộ tài liệu kiến trúc

- **Agent:** Codex
- **Thay đổi:** Đồng bộ tài liệu chuẩn theo PLAN đã rà soát: ghi rõ PWA online-only, HEIC/HEIF client-side, bootstrap Drive cùng OAuth client, `REQUEST_LOG` cho idempotency, quy tắc thay/xóa file, batch Sheets, backup tách khỏi Gmail gốc và điều kiện PII trước pilot thật.
- **File đã sửa:** `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/brain/01-architecture.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thành Task 1 M0 và ngăn tài liệu kiến trúc/API/schema mâu thuẫn trước khi khởi tạo mã nguồn.
- **Kiểm tra:** Đối chiếu các điểm kiến trúc mới với `PLAN.md`; chưa có mã nguồn hoặc test tự động ở task tài liệu này.

## [2026-07-21] Hoàn thành M0 Task 2 — khởi tạo Next.js/PWA/test

- **Agent:** Codex
- **Thay đổi:** Tạo Next.js App Router TypeScript strict, Tailwind, PWA manifest và service worker online-only, scaffold ESLint/Prettier/Vitest/Playwright, trang khởi tạo và smoke test.
- **File đã tạo/sửa:** `package.json`, `package-lock.json`, `tsconfig.json`, cấu hình Next/ESLint/Prettier/Vitest/Playwright, `src/app/*`, `src/components/pwa-register.tsx`, `src/lib/app-metadata.ts`, `public/*`, `tests/*`, `docs/brain/00-project-overview.md`, `docs/brain/01-architecture.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thành nền tảng kỹ thuật bắt buộc trước khi tạo module nghiệp vụ ở M0 Task 3.
- **Kiểm tra:** Next.js build và TypeScript đạt; Vitest đạt 1/1. Playwright assertion đạt 1/1 nhưng runner dev server không tự dừng trước timeout của môi trường Windows; cần chạy lại ở terminal/CI bình thường.

---

## [2026-07-22] Thực thi Gói A — tra cứu, khôi phục, đối chiếu GCN cũ và bổ sung có cấu trúc

- **Agent:** Codex
- **Thay đổi:** Thêm cookie phiên v2 có locator/access-version; API và trang `/tra-cuu`; khóa 5
  lần sai/15 phút; file summary phục hồi sau reload; preview có audit; timeline công khai; yêu cầu
  bổ sung theo field/file và khóa các trường ngoài yêu cầu; trạng thái `RESUBMITTED` và
  `NO_ACTION_REQUIRED`; tra cứu GCN cũ bằng HMAC 256 bucket sau xác minh cặp ảnh CCCD + CCCD + họ
  tên + ngày sinh; cảnh báo hồ sơ pending; cấp lại mã bí mật cho quản trị viên sau xác minh trực
  tiếp. Bỏ lần chụp QR riêng, đưa hai ảnh CCCD lên đầu phần cá nhân và cho gõ ngày cấp GCN trực
  tiếp. Thêm công cụ dry-run/apply nhập Excel cũ và báo cáo dòng lỗi không chứa PII.
- **File chính:** `src/modules/public-intake/{workflow,session,repository}.ts`, schema bootstrap,
  public/staff API routes, `/tra-cuu`, `wizard.tsx`, `submission-detail.tsx`,
  `scripts/import_existing_certificates.py`, test và tài liệu kiến trúc.
- **Dữ liệu import:** 7.916 dòng nguồn; 7.038 dòng hợp lệ; 878 dòng loại; 3.826 GCN; 4.517 liên
  kết chủ; 289 dòng thuộc nhóm xung đột; 2.521 dòng lặp trong cùng quan hệ. Đã chạy migration
  append-only và `--apply` bằng pepper thật vào Google Sheets cấu hình; chạy lại xác nhận nguồn
  `COMPLETED` không ghi trùng. Đọc kiểm tra sau import: 3.826 GCN = 3.746 `VERIFIED` + 80
  `CONFLICT`, 4.517 liên kết chủ và 4.394 mục chỉ mục công khai; chỉ `VERIFIED` được tra cứu.
- **Kiểm tra:** `npm.cmd run lint`, `npm.cmd run typecheck`, Vitest 22 file/133 test,
  `npm.cmd run build`, kiểm tra cú pháp Python và `git diff --check` đều đạt. Migration tạo 8 tab,
  nối 3 cột; import thật và kiểm tra idempotency đều đạt.

## [2026-07-23] Sửa lỗi dữ liệu và giao dịch của PR #1

- **Agent:** Codex
- **Thay đổi:** Import GCN cũ không còn loại/lưu ngày sinh; thêm `--backfill` append-only, resumable theo ID ổn định và reader lấy trạng thái GCN cuối. Cập nhật truy cập chỉ ghi cột hẹp. Claim/yêu cầu bổ sung/từ chối cùng audit, timeline và idempotency đi trong một Sheets batch; reset mã bí mật replay được mà không lưu secret rõ.
- **File đã sửa:** import legacy, public-intake repository/session, staff routes, kiểm thử Python và tài liệu kiến trúc.
- **Lý do:** Tránh bỏ mất dữ liệu chỉ vì ngày sinh, ghi đè autosave/upload, trạng thái NEEDS_SUPPLEMENT không có yêu cầu mở và reset mã lặp.
- **Kiểm tra:** dry-run import 7.146/7.916 dòng hợp lệ; Python compile + unit test và TypeScript typecheck đạt trước dry-run backfill thật.

---

## [2026-07-24] Tích hợp font Be Vietnam Pro toàn hệ thống qua next/font/google

- **Agent:** Gemini (Antigravity)
- **Thay đổi:** Nâng cấp font mặc định cho toàn bộ ứng dụng sang `Be Vietnam Pro` thông qua `next/font/google` với subsets `['vietnamese', 'latin']`, hỗ trợ self-host tự động khi build, không gọi CDN runtime (đạt chuẩn PWA offline và security rule). Cập nhật fallback font stack trong `globals.css` và tài liệu typography `DESIGN.md`.
- **File đã sửa:** `src/app/layout.tsx`, `src/app/globals.css`, `DESIGN.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Giúp giao diện kê khai & toàn ứng dụng hiển thị tiếng Việt cân đối, sắc nét, đúng phong cách hành chính công hiện đại và bớt đơn điệu.
- **Kiểm tra:** `npx tsc --noEmit` ✅, Vitest `npm test` ✅ (181/181 tests passed).

---

## [2026-07-24] Tối ưu ngắt dòng tiêu đề mobile và loại bỏ banner thử nghiệm

- **Agent:** Gemini (Antigravity)
- **Thay đổi:** Thêm `inline-block` bọc cụm từ "Phường Phong Châu" ở tiêu đề chính (`h1`) trang chủ để tránh ngắt dòng lẻ loi thành "Phường / Phong Châu" trên màn hình di động; xóa bỏ ô thông báo banner "Bản thử nghiệm chỉ hoạt động khi có kết nối mạng" ở cuối trang chủ theo yêu cầu của chủ dự án.
- **File đã sửa:** `src/app/page.tsx`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Tăng tính cân đối, thẩm mỹ giao diện di động và loại bỏ thông báo thử nghiệm thừa.
- **Kiểm tra:** `npx tsc --noEmit` ✅, Vitest `npm test` ✅.

---

## [2026-07-24] Thêm Logo Phường Phong Châu làm logo và favicon hệ thống

- **Agent:** Gemini (Antigravity)
- **Thay đổi:** Cấu hình logo Phường Phong Châu (`/logo-phongchau.png`) làm icon chính thức của trang web trong `layout.tsx` (metadata `icons` gồm favicon, shortcut icon và apple-touch-icon) và PWA `manifest.ts`; tạo các file icon tương thích (`icon.png`, `apple-touch-icon.png`); bổ sung logo hiển thị ở đầu trang Hồ sơ cá nhân (`/profile`).
- **File đã sửa:** `src/app/layout.tsx`, `src/app/manifest.ts`, `src/app/profile/page.tsx`, `public/icon.png`, `public/apple-touch-icon.png`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Đảm bảo nhận diện thương hiệu hành chính công Phường Phong Châu đồng bộ trên tab trình duyệt, shortcut mobile, PWA app icon và giao diện.
- **Kiểm tra:** `npx tsc --noEmit` ✅, Vitest `npm test` ✅.

## [2026-07-24] Dọn cache JSON tra cứu GCN đã chết sau migration Supabase

- **Agent:** Claude Code
- **Thay đổi:** Sau khi runtime chuyển sang Postgres (`findExistingCertificates` đọc trực tiếp
  `public.public_lookup_index`/`public.existing_certificates`), cache JSON committed
  (`existing-certificates-index.json`) không còn được đọc ở đâu — xóa file này, xóa hàm
  `lookupExistingCertificates`/kiểu `ExistingCertificatesIndex` (`workflow.ts`) và test tương ứng,
  xóa chế độ `--emit-json`/`compute_index`/`build_index_json` cùng test Python liên quan
  trong `scripts/import_existing_certificates.py`.
- **File đã sửa:** `scripts/import_existing_certificates.py`, `src/modules/public-intake/workflow.ts`,
  `tests/public-workflow.test.ts`, `tests/test_import_existing_certificates.py`,
  `docs/brain/03-decisions.md`; xóa `src/modules/public-intake/existing-certificates-index.json`.
- **Lý do:** Review commit migration Supabase phát hiện toàn bộ đường cache JSON (từ PR #2) đã thành
  code chết — Postgres có index thật nên không cần cache tĩnh song song nữa.
- **Kiểm tra:** `python -m unittest discover` 3/3, `npx vitest run` 180/180, `npx tsc --noEmit` sạch.
