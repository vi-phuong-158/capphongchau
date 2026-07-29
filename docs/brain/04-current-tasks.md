# 04 — Current Tasks

> Cập nhật mỗi khi bắt đầu hoặc hoàn thành task. Agent đọc đây để biết được phép làm gì.
>
> **Roadmap đang có hiệu lực là [`PLAN.md`](../../PLAN.md).**
> `PLAN2`, `PLAN_NL` và kế hoạch thi công Claude là tài liệu lịch sử đã lưu trong `docs/archive/`;
> không dùng chúng để đảo ngược trạng thái hiện tại. Chi tiết được phép làm nằm trong file này và
> các quyết định mới nhất ở `03-decisions.md`.

---

## [2026-07-29] Phase 4 pool Supabase và region — code sẵn sàng, chờ Preview benchmark

- Code có `SUPABASE_POOL_MAX` 1–3 (default 1), `vercel.json` khóa `sin1` và benchmark runner không xuất dữ liệu nhạy cảm.
- **Không được** đặt pool lớn hơn 1 hoặc kết luận PASS trước khi có Preview deployment Ready, session cán bộ benchmark riêng, dữ liệu tổng hợp và số connection quota từ Supabase dashboard.
- Chạy lần lượt 1/2/3 với warm-up 10, đo 40 lượt/route, 4 worker; chọn giá trị cao hơn chỉ khi P95 tốt hơn ≥10%, error rate 0 và peak connection <70% quota. Không thao tác Production trong phase này.

---

## [2026-07-29] Phase 1 hiệu năng hàng chờ — đã triển khai trong code

- `GET /api/submissions` đã chuyển lọc/tìm/phân trang sang
  `PublicIntakeRepository.listQueuePage`; mỗi request chỉ lấy tối đa 101 dòng và dùng cursor
  `(updated_at, submission_id)`.
- UI tìm kiếm debounce 350 ms, không gửi một ký tự và giữ bảng cũ khi đang tải.
- **Chưa chạy migration:** áp `202607290004_queue_search_performance.sql` trên Preview sau các
  migration đang chờ theo đúng thứ tự, rồi chạy `EXPLAIN (ANALYZE, BUFFERS)` với 500/5.000/20.000
  hồ sơ giả. Không deploy code Phase 1 trước migration.
- Chưa có P50/P95 Preview; không tuyên bố đạt mục tiêu ≤ 1,5 giây cho tới khi có số đo thật.

## [2026-07-29] Bàn làm việc biên tập đầy đủ PL3 — đã triển khai trong code

- Đã đối chiếu trực tiếp `Tai lieu/PL3.xlsx`, sheet `Phong Châu`, toàn bộ cột B–AX.
- `WorkingPayloadEditor` có CRUD cho chủ/tổ chức/người đại diện, người sử dụng hiện tại, thửa,
  tối đa ba mục đích/thửa và tài sản AO–AW. B/V/AX hiện nguồn và bắt lý do khi ghi đè.
- Payload JSON, Zod, projection repository, audit, official sync và PL3 export đã mở rộng tương ứng;
  test khóa đúng 49 nhãn và một dòng đủ 49 giá trị.
- **Chưa chạy migration:** phải áp dụng `202607290002_full_pl3_editor.sql` trên preview rồi production
  trước khi deploy code. Sau migration cần lưu→tải lại→tiếp nhận→xuất một hồ sơ giả đủ B–AX.

## [2026-07-29] Review PR #6 vòng hai — đã sửa trong code

Đã sửa 3 phát hiện chính (xóa nhầm tệp Drive của hộ khác; RLS `force` làm telemetry hỏng im lặng;
409 giả làm người dân kẹt) và 4 phát hiện phụ (trần bảng số đo, so sánh sâu `hasLocalChanges`,
escape truy vấn Drive, guard môi trường cho script xóa dữ liệu E2E). Test 590 pass/10 skipped.
Chưa merge, chưa push, chưa deploy, chưa chạy migration.

### Chỉ mục tra cứu CCCD — ĐÃ CHỐT VÀ ĐÃ LÀM

Người dùng chốt ngày 2026-07-29: CCCD vào `public_lookup_index` với `kind = 'PENDING'`, ghi ở cả
`RESUBMITTED` và ở cả ba đường ghi của cán bộ. Chi tiết và lý do ở `03-decisions.md` cùng ngày.
Trước đó hồ sơ MỨC A không có CCCD lúc gửi đầu sẽ không bao giờ vào chỉ mục.

## [2026-07-29] Review bắt buộc PR #6 — đã sửa trong code (vòng một)

Đã sửa 2 BLOCKER và 5 HIGH: upload replay, assisted submit, exact version, official gate, atomic
consent audit, telemetry RLS và timeline privacy; đã thêm CI PR. Chưa merge/deploy/chạy migration.
E2E assisted phải báo skipped khi thiếu rehearsal credential.

## [2026-07-28] PUBLIC INTAKE V2 — luồng kê khai công khai còn 4 bước

Thi công theo [kế hoạch V2 đã lưu](../archive/plans/CLAUDE_IMPLEMENTATION_PLAN_PUBLIC_INTAKE_V2-2026-07-28.md), trên nhánh
`claude/land-declaration-process-feedback-126f2e`. **Chưa merge, chưa deploy, chưa chạy migration
production.**

### Đã xong (7 commit)

| Phase | Nội dung | Commit |
|---|---|---|
| 0 | Baseline + test characterization khóa lỗ hổng `completionChecks` | `1cc7d93` |
| 1 | Tách MỨC A (người dân gửi) khỏi MỨC C (tiếp nhận chính thức) | `e938bab` |
| 2 | Wizard 7 bước → 4 bước | `fe3e2e3` |
| 3 | Chuẩn hóa ảnh trên thiết bị (source default TẮT; Vercel Preview/Production đã BẬT 2026-07-29) | `814eee7` |
| 4 | Tiến độ tải thật qua XHR + hàng đợi 2 luồng | `bdbf180` |
| 6 | Màn hình thành công + kê khai hồ sơ tiếp theo | `ee30ee8` |
| 8 | Lưu và hiển thị tên cán bộ tiếp nhận | `ea3f716` |
| 7 | Chế độ cán bộ hỗ trợ kê khai `/ke-khai-ho` | `7345090` |

| 5 | Số đo tải ảnh, dọn tệp mồ côi an toàn, hai script vận hành | vòng rà soát |

### Vòng rà soát (sau `aa2135e`)

Rà soát toàn bộ diff `79f4ae6..aa2135e` theo 14 điểm, kết quả ở
`evidence/PUBLIC_INTAKE_V2_DIFF_REVIEW.md`: **1 BLOCKER, 4 HIGH đã sửa**; 5 MEDIUM, 3 LOW ghi lại.

BLOCKER đáng nhớ: nút "Kê khai hồ sơ tiếp theo" gọi endpoint tạo hồ sơ với `phone: ""`, mà endpoint
bắt buộc `^0\d{9}$` — nút **chưa bao giờ** chạy được. Không test nào bắt vì wizard không có test
render và E2E chưa chạy lần nào.

### Việc bắt buộc trước khi merge / bật cờ

1. **Chạy bốn migration** `202607280001`–`202607280004` trên preview trước, production sau,
   **đúng thứ tự và trước khi deploy code**, rồi chạy
   `npm run preflight:public-intake-v2-migrations` để xác nhận PASS. Toàn bộ additive; rollback là
   bỏ cột/bỏ bảng. Quy trình đầy đủ: `evidence/PUBLIC_INTAKE_V2_PREVIEW_MIGRATION_RUNBOOK.md`.
2. **Chạy `npm run test:e2e:preview`** trên preview thật — chưa chạy lần nào trong phiên thi công
   vì thiếu Supabase/Drive/tài khoản cán bộ thật. 15 kịch bản đã viết đầy đủ, không còn
   `test.fixme` không điều kiện. Điều kiện đầy đủ: `evidence/PUBLIC_INTAKE_V2_E2E_CHECKLIST.md`.
3. **Bật `OFFICER_ASSISTED_INTAKE_ENABLED=true`** trên preview trước khi chạy các kịch bản
   E2E-06b/E2E-06c — kill switch server-side mặc định TẮT (2026-07-28, vòng rà soát lần hai).
4. **Kiểm chất lượng ảnh** theo `evidence/PUBLIC_INTAKE_V2_UPLOAD_BENCHMARK.md` (đã có bảng so
   sánh nguồn↔sau chuẩn hóa theo từng ảnh). Chủ dự án đã yêu cầu bật
   `NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED=true` trên Preview/Production ngày 2026-07-29
   trước khi hoàn tất benchmark. Chưa có số đo trước/sau; **không được** tuyên bố đạt mục tiêu tăng
   tốc cho tới khi bảng được điền. Nếu chữ nhỏ, hướng ảnh hoặc QR trượt, rollback cờ ngay.
5. **Thử luồng thật trên thiết bị di động**: chọn nhiều ảnh GCN, tắt mạng giữa chừng, kiểm tra
   resume và tiến độ không tụt.
6. **Xác nhận danh sách vai trò `ASSISTED_INTAKE_ROLES`** (`INTAKE_OFFICER`, `WARD_ADMIN`,
   `SYSTEM_ADMIN`) đúng nghiệp vụ. `REVIEW_OFFICER` bị loại có chủ đích — không để một người vừa
   nhập hộ dân vừa thẩm định chính hồ sơ đó.
7. **Chạy hai test integration còn skip** (`ACCEPTANCE_SAGA_TEST_DATABASE_URL=... npx vitest run
   tests/staging-rehearsal-acceptance-saga.integration.test.ts
   tests/canonical-projection.integration.test.ts`) trên một Postgres thử nghiệm — bảo vệ đúng
   luồng "official acceptance guard" và "idempotent replay". Danh sách đầy đủ 10 test đang skip:
   `evidence/PUBLIC_INTAKE_V2_SKIPPED_TESTS.md`.
8. **Sau mỗi đợt E2E, dọn dữ liệu**: `npm run cleanup:e2e-preview-data -- --apply --confirm=...`
   rồi `npx tsx scripts/audit-orphan-public-files.ts --apply --confirm=...`.

### Cảnh báo cho agent sau

- **KHÔNG nới `completionChecks`.** Từ V2 nó là gác cổng duy nhất cho dữ liệu nghiệp vụ đầy đủ;
  cổng công khai đã nới hết mức. Xem `03-decisions.md` [2026-07-28] entry đầu tiên.
- **KHÔNG thêm luật nghiệp vụ trực tiếp vào `wizard.tsx`.** Luật nằm ở `validation.ts`;
  `public-wizard-validation.ts` chỉ lọc theo bước và ánh xạ tên trường. Trước V2 hai nơi có hai bản
  regex riêng và đã lệch nhau.
- **KHÔNG cho client gửi `intake_channel` hay `assistedBy`.** Máy chủ suy ra từ route và phiên.
- **KHÔNG đổi `.catch(() => true)` trong `discardIfOrphan`** (complete route) thành `false` cho
  "hợp lý hơn". Hỏi cơ sở dữ liệu không được thì mặc định là **đã nhận**, tức là không xóa: để sót
  một tệp thừa thì script rà soát dọn được, xóa nhầm tệp đã nhận là mất ảnh giấy tờ vĩnh viễn.
- **KHÔNG thêm trường tự do vào `clientUploadTelemetrySchema`.** Mọi trường phải là số hoặc danh
  mục đóng; một ô tự do là chỗ để CCCD hay tên tệp lọt vào bảng số đo, và đã ghi thì không gỡ ra.
- **KHÔNG ghép tên tệp client gửi lên vào tên tệp trong kho.** Máy chủ tự đặt tên; xem H-01.
- **KHÔNG dùng cờ `NEXT_PUBLIC_` cho chế độ cán bộ hỗ trợ.** `OFFICER_ASSISTED_INTAKE_ENABLED` là
  server-side thuần túy, đọc qua `loadPublicIntakeEnvironment()`. Cờ client không phải hàng rào
  bảo mật.
- **KHÔNG liệt kê cứng tên bảng con của `public_submissions` trong script dọn dữ liệu.** Có ~16
  bảng, phần lớn không cascade. `cleanup-e2e-preview-data.ts` dò `information_schema` — giữ
  nguyên cách đó khi sửa.

---

## [2026-07-25] TRẠNG THÁI HIỆN TẠI — đã mở tiếp nhận hồ sơ chính thức

**[CẬP NHẬT 2026-07-26]** Hạ tầng Antigravity AI draft GCN đã có trong code nhưng mặc định
`AI_EXTRACTION_ENABLED=false`. Chỉ bật sau khi áp dụng migrations `202607260001` và `202607260002`, đặt worker key ở
Vercel/máy trạm, kiểm tra station theo `agent/STATION_RUNBOOK.md` với dữ liệu giả và chấp nhận rủi
ro `ADMIN_BROAD_ACCESS`. AI không là điều kiện tiếp nhận chính thức.

**Hệ thống đang MỞ để thu hồ sơ thật.** `OFFICIAL_ACCEPTANCE_ENABLED = true`. Chưa có hồ sơ thật
nào trong hệ thống trước ngày này; thu hồ sơ thật bắt đầu từ sau 2026-07-25.

Luồng đầy đủ đang chạy được: người dân kê khai → cán bộ nhận xử lý → sửa thông tin GCN và chủ sử
dụng → **Tiếp nhận chính thức** (sinh `PHONGCHAU-{năm}-{6 số}`, chuyển ảnh sang `02_CASES`, ghi
`cases`/`owners`/`certificates`/`parcels`/`assets`/`files`) → xuất PL3.

Phát hiện sai **sau khi** đã tiếp nhận thì dùng nút **"Điều chỉnh hồ sơ chính thức"** (màu cam,
chỉ hiện khi hồ sơ `ACCEPTED`). Bắt buộc nhập lý do ≥ 10 ký tự; hệ thống ghi lại dữ liệu chính thức
trong cùng transaction nên `draft_json` và bảng chính thức không bao giờ lệch nhau. Mã hồ sơ chính
thức và ảnh trên Drive giữ nguyên. Xem `03-decisions.md` [2026-07-25] Q2.

### Hạn chế đã biết — chưa đóng, KHÔNG phải lỗi mới phát hiện

**[CẬP NHẬT 2026-07-25]** Năm dòng trong bản cũ đã ĐÓNG, gỡ khỏi bảng: "cán bộ không sửa
được thửa/mục đích" (đóng ở Phase 6-7, xem `PUT /api/submissions/:id/working-payload` +
`WorkingPayloadEditor`), "PL3 cắt âm thầm ở 2.000 hồ sơ" (đóng ở Phase 2, thay bằng
`MAX_EXPORT_SUBMISSIONS = 20000` kèm cờ `truncated` hiển thị trên sheet), "lỗi ghi
`export_jobs`/`audit_logs` làm mất file PL3" (đóng ở Phase 2, file giữ nguyên dù ghi audit lỗi),
snapshot `official_payload_*` cũ sau điều chỉnh (đóng bằng một update cùng transaction với
`syncOfficialRecord`) và race tạo folder Drive xuyên lambda (đóng bằng advisory lock PostgreSQL
theo `(parentId, name)`).

| Hạn chế                                                                        | Ảnh hưởng                                                           | Khi nào phải đóng                           |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------- |
| Thửa có **>3 mục đích sử dụng** thì người dân không nộp được (Q3: tạm giữ ở 3) | Ca đó phải ra phường làm trực tiếp                                  | Mở lại với cơ quan nếu tần suất thực tế cao |
| `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE=true` trên Vercel Production             | `/ke-khai` và `/api/public/*` không có Cloudflare WAF/rate limiting | Khi có domain thật gắn Cloudflare           |

### Việc phải làm ngay trong ngày đầu thu hồ sơ thật

1. Tiếp nhận chính thức **1 hồ sơ thử** trước khi mở cho dân, rồi kiểm trên Supabase:
   `select case_id from public.cases;` · `select parcel_id, data_json from public.parcels;` ·
   `select asset_id from public.assets;` — phải có đủ thửa và mục đích sử dụng trong `data_json`.
2. Kiểm ảnh đã chuyển sang `02_CASES/{TĐP}/{CASE_ID}/originals` trên Drive và **đổi đúng tên**
   (`{số phát hành}-GCN.jpg`).
3. Bấm **Xuất PL3** một lần, mở file bằng Excel — sheet `PL3` phải có dòng của hồ sơ vừa tiếp nhận
   (trước 2026-07-25 sheet này luôn rỗng vì không hồ sơ nào đạt được `ACCEPTED`).
4. Nếu bất kỳ bước nào sai: đảo `OFFICIAL_ACCEPTANCE_ENABLED` về `false`, deploy, báo lại. Hồ sơ dở
   nằm lại `ACCEPTING` an toàn.

---

### ETL status update (2026-07-23)

Schema and data ETL have completed successfully after the Google Sheets backup. Supabase verification found the expected legacy tables and one `LEGACY_SHEETS_IMPORT:*` marker. **Cutover đã hoàn tất**; không chạy lại ETL và giữ Sheet cũ ở chế độ read-only/restricted.

## [2026-07-24] Chỉnh sửa trực tiếp cho cán bộ (xong) + Saga tiếp nhận chính thức (hoãn)

**Đã làm:** `PATCH /api/submissions/:submissionId` cho cán bộ sửa lỗi gõ nhỏ trực tiếp trong
`draft_json` (thông tin GCN + thông tin cá nhân, khóa cứng trường định danh của chủ đã
`QR_CONFIRMED`). Xem quyết định [2026-07-24] trong `03-decisions.md`.

**[SỬA 2026-07-24] Đã sửa nhận định sai bên dưới:** phần "Migration Supabase" ghi "production chưa
cutover" là **tài liệu cũ, không khớp code** — `PublicIntakeRepository` (`repository.ts`) chỉ còn
gọi `getDatabase()` (Supabase), không còn đường ghi Sheets nào; ETL thật đã chạy và đối chiếu số
dòng (xem `06-ai-working-log.md` [2026-07-23] "Supabase schema and real ETL completed" — 6729
GCN, 8798 owner, không phải dry-run); commit `9a5cea9` (migrate runtime sang Supabase) đã nằm trên
`main`. Về code + dữ liệu, cutover coi như **đã xong**. Việc duy nhất AI không tự xác nhận được từ
đây là biến môi trường `SUPABASE_DATABASE_URL` có đang cấu hình đúng trên **Vercel Production**
hay không (chỉ chủ dự án xem được dashboard Vercel) — nếu nghi ngờ, kiểm tra `/api/health/database`
trên production trước khi coi cutover là chốt hoàn toàn.

**[2026-07-25] ĐÃ MỞ — không còn hoãn.** Saga "Tiếp nhận chính thức" (`POST
/api/submissions/:submissionId/accept`) cài đặt đầy đủ từ 2026-07-24 trong
`src/modules/submissions/acceptance-saga.ts` (tạo thư mục `02_CASES/{TĐP}/{CASE_ID}/originals`,
di chuyển file Drive từ `01_INBOX`, ghi `CASES/CERTIFICATES/OWNERS/PARCELS/ASSETS/FILES` — xem Code
Graph trong `01-architecture.md`). Cờ `OFFICIAL_ACCEPTANCE_ENABLED` đã đảo sang `true` và nút
"Tiếp nhận chính thức" đã được nối vào route thật. Xem `03-decisions.md` [2026-07-25] "MỞ tiếp nhận
chính thức" — trong đó có hai lỗi chặn phải vá cùng lượt (thứ tự xóa khóa ngoại của
`refreshCanonicalProjection`, và saga trước đó không ghi thửa/mục đích vào bảng chính thức nào).

**Công tắc dừng khẩn:** đảo `OFFICIAL_ACCEPTANCE_ENABLED` về `false` trong
`src/modules/submissions/acceptance.ts` rồi deploy. Hồ sơ đang dở nằm lại `ACCEPTING`; bấm lại với
**cùng `idempotency-key`** sau khi mở lại sẽ đi tiếp từ checkpoint, không tạo hồ sơ chính thức thứ
hai. Đóng cờ là quyết định phải ghi vào `03-decisions.md`, không sửa lướt qua —
`tests/submission-acceptance.test.ts` có trip-wire hai chiều.

**[SỬA KHẨN 2026-07-24]** Trước bản sửa này, route chỉ còn được chặn bởi `REFERENCE_IS_PLACEHOLDER`
— nhưng cờ đó **đã là `false`** từ quyết định export PL3 2026-07-23 (không liên quan gì tới việc
mở saga). Nghĩa là sau khi saga được nối vào route cùng ngày, hard-stop thật đã bị gỡ mà không ai
nhận ra: saga có thể chạy thật cho bất kỳ ai có role quyết định + CSRF hợp lệ. Đã tách thành cờ
`OFFICIAL_ACCEPTANCE_ENABLED` độc lập, mặc định `false`, có test trip-wire trong
`tests/submission-acceptance.test.ts`. Xem `03-decisions.md` [2026-07-24 — SỬA KHẨN].

**[2026-07-24] Diễn tập staging đã chạy THẬT và PASS 6/6** — xem
`tests/staging-rehearsal-acceptance-saga.integration.test.ts`, gọi trực tiếp
`runOfficialAcceptance` trên một Postgres Supabase THỬ NGHIỆM (project riêng, khác production),
chỉ giả lập tầng Google Drive. Cả 3 kịch bản gốc + 3 biến thể đều đạt (xem `03-decisions.md`
[2026-07-24 — Diễn tập staging]). Diễn tập này còn phát hiện và vá được 1 **bug thật**: Supavisor
transaction-mode pooler (`prepare: false`) đôi khi trả cột `jsonb` (`moved_files`, `response_json`)
về dạng chuỗi thô thay vì object — nếu không vá, replay idempotent của saga sẽ trả kết quả sai cho
client thật. Đã sửa trong `acceptance-saga.ts` (hàm `parseJsonbMaybeString`/`mapSagaRow`).

**Điều kiện gác cổng "diễn tập staging" coi như đã xong.** Muốn chạy lại độc lập:
`ACCEPTANCE_SAGA_TEST_DATABASE_URL=... npx vitest run tests/staging-rehearsal-acceptance-saga.integration.test.ts`
(tự skip an toàn nếu thiếu biến môi trường, tự chặn nếu trỏ trùng `SUPABASE_DATABASE_URL` thật).

**[2026-07-25 — ĐÃ ĐÓNG] Điều kiện gác cổng cuối cùng.** Nghi vấn "danh mục trường 12 chính thức
được nhập thay dữ liệu demo" đúng là **tài liệu lỗi thời**: cả trường 12 của Phụ lục 8 (loại
đất/nguồn gốc) lẫn trường 12 của PL3 (pháp nhân trên GCN) đều đã chốt chính thức trong
`03-decisions.md` [2026-07-22]/[2026-07-23]. Chủ dự án xác nhận không còn danh mục nào treo và
quyết định đảo cờ ngày 2026-07-25.

## Migration Supabase (2026-07-23, đã xong về code + dữ liệu 2026-07-24)

Runtime repository hồ sơ và `USERS` đã chuyển hẳn sang Supabase PostgreSQL — không còn đường ghi
Sheets nào trong `repository.ts`. Schema SQL, health endpoint, ETL Sheets→Supabase đã có **và đã
chạy thật** (xem `06-ai-working-log.md` [2026-07-23]). Google Drive vẫn lưu file, không đổi.

Còn lại — không chặn code, nhưng nên xác nhận trước khi coi pilot dữ liệu thật là an toàn:

1. Xác nhận `SUPABASE_DATABASE_URL` (Supavisor transaction pooler) đúng trên Vercel Production —
   chỉ chủ dự án xem được, AI không tự kiểm tra qua dashboard.
2. Đối chiếu lại `/api/health/database` trên production trả `ok`.
3. Thiết lập backup/PITR và `pg_dump` mã hóa ra nơi độc lập (Supabase project Singapore).
4. Giữ Google Sheet cũ ở chế độ read-only/restricted — không ghi lại vào Sheet, không chạy lại ETL.

Quyết định “giữ Sheets, không PostgreSQL” trong kế hoạch cũ và mục “Đã chốt” bên dưới là lịch sử,
đã bị yêu cầu mới của chủ dự án thay thế.

---

## Thay đổi lớn về mục tiêu (2026-07-22)

**Đích xuất là `Tai lieu/PL3.xlsx` — 49 trường, không phải 15 trường Phụ lục 8.** Mỗi dòng là một
(GCN × thửa × người), giá trị ghi bằng chữ chứ không phải mã. Từ 2026-07-29 Bàn làm việc cán bộ
đã biên tập đủ B–AX; cổng người dân vẫn chỉ bắt buộc MỨC A và để cán bộ hoàn thiện phần còn lại.
Xem quyết định cùng ngày trong `03-decisions.md`; bảng đối chiếu đầy đủ nằm trong kế hoạch cũ ở
`docs/archive/plans/PLAN2-2026-07-22.md`.

**Quy mô mục tiêu nâng lên 20.000 hồ sơ** (trước là 500). Đã có phương án: **không sharding**, giữ
một Supabase PostgreSQL database và tối ưu tầng truy cập dữ liệu — xem `03-decisions.md`.

**Duyệt hồ sơ sẽ có Gemini đối chiếu** (so lệch hai nguồn, không điền sẵn). Chưa xây.

---

## Đang làm

**Production đã deploy** (2026-07-22): `https://capphongchau.vercel.app`, `/api/health/google`
trả `ok`, `/ke-khai` trả 200 và đúng nội dung. **Chưa có domain thật gắn Cloudflare** — chỉ có URL
Vercel cấp, chủ dự án không sở hữu DNS zone đó. Đang bật tạm
`PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE=true` trên Vercel Production để test trên điện thoại (xác
nhận có tác dụng: `/ke-khai` từ 404 chuyển sang 200 sau khi bật + redeploy).
**⚠️ BẮT BUỘC xóa biến này ngay khi có domain thật gắn Cloudflare** — trong lúc bật, `/ke-khai` và
`/api/public/*` không được Cloudflare WAF/rate limiting bảo vệ (xem `03-decisions.md` và
`06-ai-working-log.md` cùng ngày). Trước dữ liệu thật phải kiểm tra biến này đã bị gỡ khỏi Vercel.

M2 đã hoàn thành và được kiểm tra build.

**Cổng kê khai công khai `/ke-khai` production đã chạy trên runtime Supabase**: tạo nháp, autosave,
upload và submit ghi dữ liệu cấu trúc vào Supabase PostgreSQL; file vẫn đi thẳng Google Drive.
Google Sheets chỉ còn là nguồn legacy/read-only và công cụ ETL; không có đồng bộ hai chiều. Các
script `migrate:public-intake`/`migrate:citizen-id-pairs` chỉ dùng khi phục hồi hoặc xử lý một
môi trường Sheets legacy riêng, không chạy trong request runtime production.

**Lớp biên — phần code đã xong (2026-07-22, nhánh `feat/edge-protection`):** Turnstile fail-closed
ở hai hành động `create`/`submit`, và chốt chặn `ORIGIN_SHARED_SECRET` ở `/api/public/*` +
`/ke-khai`. **Phần dashboard chưa làm và AI không làm được:** DNS proxy qua Cloudflare, SSL Full
(strict), Transform Rule gắn header `X-Origin-Auth`, cache rule bypass `/api/*` + `/ke-khai*`,
rate limiting rules, đặt biến môi trường mới trên Vercel, bật Deployment Protection cho Preview.
Chưa xong các mục đó thì chốt chặn ở origin **chưa bảo vệ được gì**.

### Đã làm xong 2026-07-22 (nhánh `fix/image-format-and-support-contacts`)

- Sửa lỗi ảnh JPG từ Zalo bị từ chối oan (`File.type` rỗng hoặc bí danh `image/jpg`).
- Ảnh GCN cũng qua bước chuyển HEIC→JPEG như ảnh CCCD.
- Danh bạ cán bộ hỗ trợ theo tổ dân phố + câu phạm vi áp dụng ở đầu `/ke-khai`.
- Bảng tham chiếu tờ bản đồ cũ → mới (164 dòng) và trường `Parcel.oldWard`.

✅ Đã chạy `npm run migrate:public-intake` trên Google Sheet đang cấu hình ngày 2026-07-22 — thêm
8 tab Gói A và nối `access_version`, `file_summary_json`, `old_ward`. Môi trường Google Sheet khác
vẫn phải chạy migration trước deploy.
Script nay còn nối được cột thiếu vào tab đã tồn tại, không chỉ tạo tab mới.

### Chặn trước khi đưa cổng công khai vào dữ liệu thật

Danh sách đầy đủ kèm ước công nằm trong kế hoạch lịch sử `docs/archive/plans/PLAN2-2026-07-22.md` §2.

1. ~~Gác cổng trước khi đảo `OFFICIAL_ACCEPTANCE_ENABLED = true` (diễn tập staging 3 kịch bản)~~ —
   **ĐÃ XONG 2026-07-24**, xem chi tiết ở mục "Hoãn có chủ đích" phía trên và
   `03-decisions.md` [2026-07-24 — Diễn tập staging].

**Đây là điều kiện chặn DUY NHẤT còn lại.** Ba mục dưới đây từng được chủ dự án chấp nhận rủi ro
ngày 2026-07-24. Mục consent đã được sửa lại ngày 2026-07-28 theo yêu cầu mới; hai mục còn lại vẫn
giữ quyết định cũ — xem `03-decisions.md` để biết phạm vi:

- ✅ **Đã sửa 2026-07-28:** public và assisted create bắt buộc `consent.accepted === true`, server
  validate trước create, lưu server consent version và assisted audit metadata. Thông báo bảo vệ
  dữ liệu vẫn cần chốt nguyên văn trước vận hành thật.
- ~~Lớp biên: `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE` bật trên production; chưa có domain thật sau
  Cloudflare~~ — chấp nhận chạy trên `*.vercel.app`, bù bằng Turnstile (vẫn bật) + công tắc khẩn
  `PUBLIC_INTAKE_MODE=PAUSED`.
- ~~Tổ chức trong tra cứu GCN đã có chưa khớp được bằng mã số thuế~~ (280 dòng tổ chức trong kho) —
  cán bộ tự đối chiếu thủ công cho nhóm tổ chức, hệ thống không tự động hóa.

✅ **Đã sửa trong phiên 2026-07-23** (từng là mục 1/3/5 của danh sách này, xem `03-decisions.md` và
`06-ai-working-log.md` cùng ngày):

- Khôi phục hồ sơ bằng mã tiếp nhận + mã bí mật (`/tra-cuu`, session v2, khóa tạm 5 lần sai).
- Lỗ định danh Hộ gia đình/Tổ chức bỏ qua CCCD — `requiresCitizenId`/`isOrganisationOwner` sửa lại.
- Quy tắc kiểm diện tích từ chối chính dữ liệu PL3 mẫu — thêm dung sai 0,5 m².
- Danh mục trường 12/13 sai theo PL3; giới hạn 3 dòng mục đích/thửa; thu "Người sử dụng hiện tại"
  (cột O, P) cho ca chủ đã mất; tra cứu GCN đã có theo CCCD-đơn + bắt buộc QR;
  `VietnameseDateInput` cho ngày sinh/ngày cấp GCN.
- **Chưa chạy `npm run migrate:public-intake` sau các thay đổi này ở môi trường khác** — nhớ chạy
  trước deploy môi trường mới (cột `access_version`, `file_summary_json`, 5 cột `PUBLIC_OWNERS`,
  8 tab Gói A).

### Chờ cơ quan trả lời — AI không làm thay được

- **Danh mục `Loại đất` / `Nguồn gốc` / `Hình thức` / `Thời hạn`.** Câu quan trọng nhất: giá trị
  _"Nhận chuyển nhượng đất được Công nhận QSDĐ như giao đất có thu tiền sử dụng đất"_ là **một mục
  trong danh mục** hay **ghép hai ý**? Đáp án quyết định biểu mẫu có một ô chọn hay hai. Bộ câu hỏi
  đã soạn sẵn ở kế hoạch lịch sử `docs/archive/plans/PLAN2-2026-07-22.md` §9.
- ~~**Trường 21 và 22 của PL3 là gì**, và cột O, P không đánh số có thuộc bộ 49 không.~~
  **[ĐÃ TRẢ LỜI 2026-07-25]** Bỏ trường 21/22 (nguồn dữ liệu hiện dùng là loại đưa vào sử dụng
  ngay), nhưng khâu **thu thập** vẫn phải có cột O, P vì nhiều trường hợp chủ trên GCN đã mất.
  `PL3_COLUMNS` hiện tại đã đúng y như vậy — nhảy từ 20 sang 23, và có đúng hai cột `field: null`
  cho người sử dụng hiện tại. **Không cần sửa code.** Xem `03-decisions.md` [2026-07-25] Q4.
- **Có bảng tham chiếu số THỬA cũ→mới không?** Bảng hiện có chỉ quy đổi số _tờ_ (trường 19); trường
  20 chưa có nguồn nào.
- **Định nghĩa phân nhóm A/B/C/E** (KH 247/KH-UBND ngày 30/6/2026) — ảnh hưởng schema báo cáo.
- **Tỷ lệ GCN cấp cho hộ gia đình** ở Phong Châu (đếm trên ~30 GCN thật) — quyết định có chặn được
  hộ gia đình gửi hồ sơ hay không; nếu HGĐ chiếm đa số thì quy tắc chặn làm cổng vô dụng.
- **Tỷ lệ GCN nhiều thửa** — đếm cùng lần trên ~30 GCN thật.
- ~~**Xác minh tầng dịch vụ Gemini** (bật thanh toán, điều khoản không dùng dữ liệu huấn luyện)
  trước tấm ảnh thật đầu tiên.~~ **[ĐÃ QUYẾT ĐỊNH 2026-07-25]** Chủ dự án quyết định cứ thực hiện.
  Đây không còn là điều kiện chặn. **Ràng buộc kỹ thuật không đổi:** ảnh CCCD tuyệt đối không gửi
  sang mô hình — job chỉ chứa file `documentType = 'CERTIFICATE'`, chặn ở khâu đóng gói chứ không
  trông vào Agent nhớ quy tắc. Xem `03-decisions.md` [2026-07-25] Q5.

### Đã chốt — đừng đề xuất lại

- **[SUPERSEDED 2026-07-23] Kho dữ liệu:** trước đây giữ Google Sheets + Drive; hiện dữ liệu cấu trúc chuyển sang Supabase, Drive vẫn giữ file. Ghi chú kỹ thuật: mã nguồn
  **không hỗ trợ Shared Drive** (không có `supportsAllDrives` ở bất kỳ lời gọi Drive API nào) —
  muốn chuyển sau này phải sửa toàn bộ lời gọi, không chỉ đổi folder ID.
- **Nhân sự duyệt:** chủ dự án xác nhận có đủ. Không cần phân tích lại năng lực duyệt.
- **10 tổ dân phố** trong `NEIGHBORHOOD_HINTS` là đúng — danh bạ chỉ có 8 đầu mối vì một cán bộ phụ
  trách nhiều tổ. **Không rút xuống 8.**
- **[SUPERSEDED 2026-07-23]** Quyết định không dùng PostgreSQL đã bị chủ dự án thay thế bằng Supabase.
- **Danh mục trường 12 và 13** đã lấy từ dropdown PL3 — xem `03-decisions.md`.

---

## Chờ làm (backlog)

- **B9 Task (Chờ làm)**: Bổ sung `request_log` kind `'PUBLIC_SAVE_DRAFT'` và idempotency-key cho `PATCH /api/public/submissions/current` (`saveDraft`). Hiện đã có `version` guard nên không mất dữ liệu.
- **Thêm cột `mutation_hash` vào `public_acceptance_sagas`** (migration mới) — hiện retry cùng key nhưng khác payload trong lúc saga dở dang không bị phát hiện `IDEMPOTENCY_CONFLICT` cho đến bước COMPLETED. Rủi ro thấp, làm khi có dịp.

Theo thứ tự mốc trong `PLAN.md`:

### M0: Chuẩn hóa và khởi tạo (hoàn thành)

- **Mô tả:** Đã hoàn thành bốn task: đồng bộ tài liệu, scaffold Next.js/PWA/lint/test, khung module và `.env.example` cùng validation biến môi trường/định dạng lỗi API.
- **Liên quan:** toàn bộ repo.
- **Ưu tiên:** Hoàn thành.

### M1: Google Cloud, My Drive và Sheets

- **Mô tả:** Tạo Google Cloud Project, bật Drive/Sheets API, tạo OAuth client, viết bootstrap CLI (tạo cây thư mục Drive, spreadsheet, seed dữ liệu danh mục), thêm health check.
- **Liên quan:** module `drive`, `sheets`.
- **Ưu tiên:** Cao.

### M2: Đăng nhập và phân quyền

- **Mô tả:** Hoàn thành Google Sign-In qua Auth.js, session cookie an toàn, state/PKCE, CSRF HMAC,
  `USERS` allowlist/role ở Node, proxy Edge chặn session, profile và trang SYSTEM_ADMIN. `USERS`,
  `AUDIT_LOGS`, `REQUEST_LOG` được ghi cùng batch; từ chối đăng nhập được audit bằng email băm.
- **Liên quan:** module `auth`, `users`, `audit`.
- **Ưu tiên:** Cao.

### M3: Tiếp nhận hồ sơ, QR và upload

- **Mô tả:** Form mobile-first tạo hồ sơ, upload cặp CCCD cho từng cá nhân (tối đa 10 người) + 1–10 GCN, đọc QR client-side, resumable upload, lưu nháp, chuyển trạng thái DRAFT → UPLOADED.
- **Liên quan:** module `cases`, `files`, `qr`.
- **Ưu tiên:** Trung bình (phụ thuộc M0–M2).

### M4: Kiểm tra, tra cứu, dashboard và xuất

- **Mô tả:** Màn hình chi tiết hồ sơ, thao tác Lưu tạm/Yêu cầu bổ sung/Xác nhận, tìm kiếm, dashboard theo tổ dân phố, xuất CSV.
- **Liên quan:** module `cases`, `reports`.
- **Ưu tiên:** Trung bình.

### M5: Bảo mật, triển khai và thí điểm

- **Mô tả:** Rate limit, security headers, kiểm tra log không lộ dữ liệu nhạy cảm, backup Drive/Sheets tách khỏi Gmail gốc, deploy Preview → Production, thí điểm tuần tự 20 → 100 → 500 hồ sơ, viết runbook. CSRF/session an toàn phải hoàn thành từ M2.
- **Liên quan:** toàn hệ thống.
- **Ưu tiên:** Thấp cho đến khi M0–M4 ổn định.

---

## Không làm lúc này

- **OCR ảnh CCCD — vẫn cấm.** Ảnh CCCD không được gửi đi đâu; QR đã đọc chính xác tuyệt đối ngay
  trên máy người dân, gửi thêm sang bên thứ ba là tăng phơi nhiễm PII mà không được gì.
  _(Ngoại lệ đã chốt 2026-07-22: **ảnh GCN** được gửi Gemini để **đối chiếu** với bản người dân
  khai — xem `03-decisions.md`. Không sinh mã trường 12, không tự ghi vào hồ sơ chính thức.)_
- Google Cloud Vision — không dùng; đã chọn Gemini.
- Vercel Blob, Shared Drive, service account — ngoài kiến trúc Supabase PostgreSQL + My Drive + Vercel hiện tại.
- Đối soát dân cư tự động — cần thẩm quyền pháp lý riêng, chưa có kênh kỹ thuật chính thức.
- Cung cấp dữ liệu công khai hoặc link Drive công khai — vi phạm nguyên tắc bảo mật của dự án.

---

## Đã hoàn thành gần đây

- [2026-07-22] Phần code của lớp biên: chốt chặn `ORIGIN_SHARED_SECRET` chống gọi thẳng
  `*.vercel.app`, Turnstile fail-closed ở `create`/`submit`, token đã dùng chỉ mở đường replay
  idempotency. 82 test xanh. Phần cấu hình Cloudflare/Vercel còn chờ chủ dự án.
- [2026-07-21] Sửa lỗi tạo bản kê khai trên mạng yếu: request tạo nháp dùng idempotency key HMAC
  ổn định, `PUBLIC_SUBMISSIONS` + `REQUEST_LOG` ghi cùng batch, retry trả lại đúng mã/phiên, lỗi
  Google trả JSON an toàn và giao diện bắt lỗi mạng thay vì bị kẹt.
- [2026-07-21] Hoàn thành M1 Task 5: tạo Google Cloud Project dưới tài khoản `anmphongandn@gmail.com`; Project ID: `resolute-future-478306-e7`. Chưa bật API, chưa tạo OAuth client hoặc secret.
- [2026-07-21] Hoàn thành M1 Task 6: bật `drive.googleapis.com` và `sheets.googleapis.com` trong Project ID `resolute-future-478306-e7`. Chưa tạo OAuth client, API key hoặc secret.
- [2026-07-21] Hoàn thành M1 Task 7: cấu hình Google Auth Platform ở chế độ External/Testing và tạo OAuth client Web + Desktop bootstrap. Chỉ đăng ký URL local; URL Vercel và chuyển Production còn chờ deploy/rà soát trước pilot dữ liệu thật.
- [2026-07-21] Hoàn thành phần mã M1 Task 8: thêm Google API client phía server/CLI, bootstrap idempotent tạo cây My Drive + spreadsheet 14 tab + danh mục/`SYSTEM_ADMIN`, endpoint `GET /api/health/google` và test schema. Đã khai báo/lưu scope OAuth `drive.file`. Chưa chạy bootstrap trên My Drive thật vì không đưa OAuth client secret vào source hay terminal; cần cấu hình `.env.local` an toàn trước.
- [2026-07-21] Hoàn thành bootstrap thật bằng tài khoản `anmphongandn@gmail.com`: OAuth `drive.file` thành công, cây My Drive và spreadsheet 14 tab đã được tạo; ID và refresh token chỉ nằm trong các tệp cục bộ bị Git bỏ qua. Chưa đưa các giá trị này vào cấu hình Vercel.
- [2026-07-21] Hoàn thành M1: `GET /api/health/google` trả HTTP 200 với OAuth, Drive, Sheets và schema đều `ok` sau khi cấu hình ID/refresh token cục bộ. M2 là hạng mục tiếp theo.
- [2026-07-21] Hoàn thành M0 Task 2: tạo Next.js App Router + TypeScript strict, PWA online-only, Tailwind, ESLint/Prettier, Vitest và Playwright; build/typecheck/unit test đạt.
- [2026-07-21] Hoàn thành M0 Task 3: tạo khung module domain, repository và hợp đồng dữ liệu; `DataRepository`/`StorageRepository` tách khỏi service/frontend.
- [2026-07-21] Hoàn thành M0 Task 4: thêm `.env.example`, validation server không lộ secret và payload lỗi API thống nhất.
- [2026-07-21] Hoàn thành M0 Task 1: đồng bộ `AGENTS.md`, `README.md`, `docs/architecture.md` và tài liệu brain theo PLAN đã rà soát (online-only, HEIC/HEIF, `drive.file` bootstrap, idempotency, an toàn thay/xóa file, backup và PII).
- [2026-07-21] Hoàn tất tài liệu kiến trúc và kế hoạch: `README.md`, `AGENTS.md`, `PLAN.md`, `docs/architecture.md`.
- [2026-07-21] Khởi tạo bộ não dự án AI dùng chung: `CLAUDE.md`, `docs/brain/00-06` (merge với `AGENTS.md` hiện có, không ghi đè).

- [2026-07-23] PR #1: code sửa import ngày sinh, backfill append-only, staff action atomic và reset idempotent đã hoàn tất; còn dry-run/backup/apply Google Sheet và xác nhận Preview.
# Phase 2 hiệu năng chi tiết hồ sơ — đã thi công, chờ nghiệm thu Preview

- Không có migration. Cần kiểm tra server-prime detail, ảnh/AI lazy, `findActiveFile` scope, audit và `Server-Timing` trên Preview bằng session cán bộ hợp lệ.
- Chỉ đánh dấu PASS khi P95 mở metadata/preview được ghi bằng evidence; không deploy Production trong đợt này.
