# REVIEW_CLAUDE_OPUS.md — Review kiến trúc `land-ocr-180` và phương án Antigravity

> **Người review:** Claude Opus 5
> **Ngày:** 2026-07-25
> **Phạm vi:** toàn bộ repo `vi-phuong-158/capphongchau` (nhánh `claude/prompt-claude-opus-review-95612d`, base `main` @ `f531875`), tài liệu `PHUONG_AN_ANTIGRAVITY_AGENT_XU_LY_HO_SO_DAT_DAI_V3.md`, `GEMINI.md`, `PROMPT_CLAUDE_OPUS_REVIEW_VA_LAP_BAN_THI_CONG.md`.
> **Nguyên tắc:** không sửa code trong lượt này. Mọi kết luận đều viện dẫn file/dòng. Chỗ nào chưa xác minh được thì ghi rõ là chưa xác minh.

---

## 1. Executive summary

Repo **không phải là một dự án trống hay PoC**: đã có cổng kê khai công khai chạy thật, Supabase PostgreSQL làm nguồn dữ liệu, Google My Drive lưu ảnh, Auth.js + CSRF + idempotency + audit + saga tiếp nhận chính thức có checkpoint. Baseline kiểm tra được: `npx vitest run` → **211 pass / 6 skip, 33 file pass / 1 skip**; `npx next build` → **thành công**, 32 route được sinh, không có warning bundling.

Nhưng phương án V3 giả định một nền móng mà **repo chưa có**:

| Giả định của V3/GEMINI.md                   | Hiện trạng thật                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cán bộ sửa được toàn bộ bản làm việc        | `PATCH /api/submissions/:id` chỉ nhận `certificate` + 6 trường của `owners`. **Không sửa được thửa đất, mục đích sử dụng, tài sản.**                   |
| Bốn lớp dữ liệu truy vết được               | Chỉ có **một** cột `draft_json` bị ghi đè tuần tự bởi cả người dân lẫn cán bộ.                                                                         |
| "Hoàn thành xử lý → ghi dữ liệu chính thức" | Saga ghi `cases`/`owners`/`certificates`/`files`. **Thửa đất và mục đích sử dụng không được ghi vào bất kỳ bảng chính thức nào.**                      |
| PL3 xuất được dữ liệu đã tiếp nhận          | Sheet `PL3` chỉ lấy `status = 'ACCEPTED'`, mà `OFFICIAL_ACCEPTANCE_ENABLED = false` nên **không hồ sơ nào có thể đạt `ACCEPTED`** → sheet luôn 0 dòng. |
| Cán bộ sửa hồ sơ đã gửi                     | Mỗi lần sửa gọi `refreshCanonicalProjection`, hàm này **xóa `public_parcels` trước `public_land_uses`** → vi phạm khóa ngoại → HTTP 500.               |

Nói cách khác: **luồng nghiệp vụ trung tâm của phương án mới (cán bộ nhận hồ sơ → sửa toàn bộ → hoàn thành → xuất PL3) hiện đang gãy ở bốn chỗ độc lập nhau**, và ba trong bốn chỗ đó không liên quan gì tới AI. Thêm AI vào trước khi vá xong là xây tầng hai trên móng nứt.

Phần AI/Antigravity của V3 về mặt kiến trúc là **đúng hướng và thận trọng**: agent chỉ sinh dữ liệu nháp, không có DB credential, không tự quyết định tiếp nhận, có manifest/checksum/lease/idempotency, có chống prompt injection. Tôi giữ gần như nguyên vẹn phần đó. Cái tôi cắt là **phạm vi**: bỏ `intake_batch`, bỏ bounding box, bỏ evidence table riêng ở pha đầu, và dời AI xuống sau khi nền móng xanh.

---

## 2. Kết luận

> ## `APPROVE WITH CHANGES`

Phê duyệt **hướng kiến trúc** của V3 (Antigravity = worker bán tự động có cán bộ giám sát; Supabase + Drive là nguồn sự thật; cán bộ quyết định dữ liệu chính thức), với **năm thay đổi bắt buộc**:

1. **Sửa xong 5 lỗi P0 trước khi viết bất kỳ dòng code AI nào.** Chúng độc lập với AI và đang chặn chính nghiệp vụ mà AI phục vụ.
2. **Bỏ `intake_batch`** khỏi mọi pha (§8.1). Giữ `một submission = một GCN`.
3. **Bốn lớp dữ liệu bằng 3 cột JSONB mới + 3 bảng AI**, không tái sử dụng `draft_json` (§8.2).
4. **Không đổi enum `PublicStatus`.** Nhãn "Chờ tiếp nhận / Đang xử lý / Hoàn thành xử lý" là nhãn hiển thị ánh xạ từ trạng thái có sẵn (§8.3).
5. **Ảnh CCCD tuyệt đối không gửi Gemini** trong toàn bộ phạm vi này. Job chỉ chứa file `documentType = CERTIFICATE`.

Không `REJECT`, vì phần AI không phá invariant nào của repo khi được đặt sau các bảng staging riêng. Không `APPROVE` thẳng, vì V3 mô tả nhiều thứ như đã có mà thực tế chưa có, và nếu Antigravity thi công theo nguyên văn V3 thì sẽ sửa nhầm chỗ.

---

## 3. Bảng hiện trạng repo

| Hạng mục             | Hiện trạng                                                                                                                                  | Bằng chứng                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack                | Next.js 16 App Router, TS strict, React 19, Supabase Postgres (`postgres` 3.4), Drive qua `googleapis`, ExcelJS 4.4, Auth.js v5 beta, Zod 4 | [package.json](package.json)                                                                                                                           |
| Build                | PASS, 32 route, không warning                                                                                                               | `npx next build` (2026-07-25)                                                                                                                          |
| Unit test            | 211 pass / 6 skip                                                                                                                           | `npx vitest run` (2026-07-25)                                                                                                                          |
| E2E                  | Chỉ **1** test Playwright (trang chủ). Không có E2E nào cho hàng chờ, claim, sửa hồ sơ hay tải PL3                                          | [tests/e2e/home.spec.ts](tests/e2e/home.spec.ts)                                                                                                       |
| Kết nối DB           | Supavisor transaction pooler, `prepare:false`, **`max: 1`**                                                                                 | [database.ts:12-20](src/modules/supabase/database.ts:12)                                                                                               |
| Migration            | 4 file; **2 file trùng version `202607240001`**                                                                                             | [supabase/migrations/](supabase/migrations/)                                                                                                           |
| Cổng người dân       | Đầy đủ: tạo nháp, autosave, QR CCCD client-side, resumable upload thẳng Drive, gửi, khôi phục bằng mã tiếp nhận + mã bí mật                 | [wizard.tsx](src/app/ke-khai/wizard.tsx) (3.025 dòng)                                                                                                  |
| Trang cán bộ         | Hàng chờ có phân trang + tìm kiếm; chi tiết hồ sơ; Nhận xử lý / Yêu cầu bổ sung / Từ chối; sửa GCN + chủ sử dụng                            | [submissions-queue.tsx](src/components/submissions-queue.tsx), [submission-detail.tsx](src/components/submission-detail.tsx)                           |
| Sửa thửa đất         | **Không có.** Thửa chỉ hiển thị đọc                                                                                                         | [submission-detail.tsx:587](src/components/submission-detail.tsx:587), [route.ts:70-80](src/app/api/submissions/[submissionId]/route.ts:70)            |
| Tiếp nhận chính thức | Saga 6 bước resumable, đã diễn tập staging thật, **đang bị khóa bằng cờ**                                                                   | [acceptance-saga.ts](src/modules/submissions/acceptance-saga.ts), [acceptance.ts:35](src/modules/submissions/acceptance.ts:35)                         |
| Xuất PL3             | Có route + builder thuần + 20 unit test. Nút nằm ở `/profile`, **không nằm ở trang hàng chờ**                                               | [route.ts](src/app/api/exports/route.ts), [pl3-export.ts](src/modules/public-intake/pl3-export.ts), [profile/page.tsx:79](src/app/profile/page.tsx:79) |
| AI/OCR               | **Chưa có gì.** Không có bảng, route, module, script hay schema nào liên quan AI                                                            | `find src scripts -name "*ai*"` → rỗng                                                                                                                 |
| `intake_batch`       | Chưa có                                                                                                                                     | —                                                                                                                                                      |
| Bốn lớp dữ liệu      | Chưa có. Một cột `draft_json`                                                                                                               | [schema.sql:64](supabase/migrations/202607230001_supabase_schema.sql:64)                                                                               |

---

## 4. Các điểm đã xác minh — bảng đối chiếu §7 của prompt

| #   | Nhận định trong prompt                                                  | Trạng thái                                      | Bằng chứng                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Xóa `public_parcels` trước `public_land_uses` lỗi khóa ngoại            | **CONFIRMED**                                   | [repository.ts:1357-1361](src/modules/public-intake/repository.ts:1357) xóa theo thứ tự `certificates → owners → parcels → land_uses`; FK `public_land_uses.parcel_id → public_parcels(parcel_id)` khai ở [schema.sql:194](supabase/migrations/202607230001_supabase_schema.sql:194) **không có `on delete cascade`** và không `deferrable`                                                                                                                                          |
| 2   | Hai migration cùng version `202607240001`                               | **CONFIRMED**                                   | `202607240001_official_acceptance.sql` và `202607240001_repair_public_submission_identity_and_drafts.sql`                                                                                                                                                                                                                                                                                                                                                                            |
| 3   | `fullName` ở certificate lookup chỉ kiểm rỗng, không tham gia đối chiếu | **CONFIRMED (nhưng là quyết định có chủ đích)** | [certificate-lookup/route.ts:57-64](src/app/api/public/certificate-lookup/route.ts:57) chỉ kiểm `!fullName`; khóa khớp là `identityHmac(pepper, citizenId)` — [workflow.ts:170-172](src/modules/public-intake/workflow.ts:170), lý do ghi rõ ở comment 162-169. Xem P1-6 về hệ quả thật                                                                                                                                                                                              |
| 4   | Phiên public mô tả sliding nhưng không thực sự refresh                  | **CONFIRMED**                                   | [route-context.ts:124-138](src/modules/public-intake/route-context.ts:124) chỉ set lại cookie khi `tokenVersion === "v1"` hoặc `rowIndex` lệch. Phiên v2 bình thường **không bao giờ được gia hạn** → 2 giờ cứng, không phải trượt như [session.ts:10-11](src/modules/public-intake/session.ts:10) mô tả                                                                                                                                                                             |
| 5   | Gọi Google Drive trong transaction DB                                   | **CONFIRMED**                                   | [storage.ts:235-268](src/modules/public-intake/storage.ts:235) — `findOrCreateFolder` mở `database.begin(...)` rồi gọi `drive.files.list` + `drive.files.create` **bên trong**. Với `max: 1` đây là giữ toàn bộ kết nối DB của app qua 2 vòng mạng tới Google                                                                                                                                                                                                                        |
| 6   | Optimistic locking chưa dùng đúng `expectedVersion` từ client           | **NOT REPRODUCED**                              | Client gửi `version`, route so `record.version !== body.data.version` ([action/route.ts:155](src/app/api/submissions/[submissionId]/action/route.ts:155), [route.ts:214](src/app/api/submissions/[submissionId]/route.ts:214)) và UPDATE có `and version = $2` ([repository.ts:550](src/modules/public-intake/repository.ts:550), [637](src/modules/public-intake/repository.ts:637), [1168](src/modules/public-intake/repository.ts:1168)). Điểm yếu thật nằm ở chỗ khác — xem P1-7 |
| 7   | Upload Drive thành công nhưng DB lỗi → orphan file                      | **CONFIRMED**                                   | [uploads/complete/route.ts:137-166](src/app/api/public/submissions/current/uploads/complete/route.ts:137) — `appendFile` ném lỗi không phải `SubmissionIdempotencyConflictError` thì `throw` luôn, không `discardFile`. Các nhánh từ chối phía trên **có** gọi `discardFile`, nhánh này thì không                                                                                                                                                                                    |
| 8   | Health endpoint gọi external service mà không được bảo vệ               | **CONFIRMED**                                   | [health/google/route.ts](src/app/api/health/google/route.ts) gọi `drive.files.get` + `drive.about.get` mỗi request; [proxy.ts:24](src/proxy.ts:24) `matcher` chỉ gồm `/profile`, `/users`, `/submissions` → `/api/health/*` mở hoàn toàn                                                                                                                                                                                                                                             |
| 9   | Acceptance chính thức bị feature flag khóa                              | **CONFIRMED**                                   | [acceptance.ts:35](src/modules/submissions/acceptance.ts:35) `OFFICIAL_ACCEPTANCE_ENABLED = false`; [accept/route.ts:123-131](src/app/api/submissions/[submissionId]/accept/route.ts:123) trả 409                                                                                                                                                                                                                                                                                    |
| 10  | Tài liệu trong repo lỗi thời so với mã nguồn                            | **CONFIRMED**                                   | Ví dụ: [04-current-tasks.md:110](docs/brain/04-current-tasks.md:110) "production chưa cutover" — mâu thuẫn với chính dòng 21-29 cùng file; [05-testing-and-deploy.md:5-6](docs/brain/05-testing-and-deploy.md:5) vẫn ghi "chưa cấu hình Supabase production"                                                                                                                                                                                                                         |

---

## 5. P0 — lỗi chặn (5 mục)

### P0-1 — `refreshCanonicalProjection` vi phạm khóa ngoại: mọi lần cán bộ sửa hồ sơ đã gửi và mọi lần người dân gửi bổ sung đều 500

**Nơi:** [repository.ts:1351-1361](src/modules/public-intake/repository.ts:1351)

```
1357  delete from public.public_certificates ...
1358  delete from public.public_owners ...
1359  delete from public.public_parcels ...     ← xóa cha
1360  delete from public.public_land_uses ...   ← xóa con SAU
```

`public_land_uses.parcel_id` tham chiếu `public_parcels(parcel_id)` ([schema.sql:194](supabase/migrations/202607230001_supabase_schema.sql:194)), không cascade, không deferrable. Dòng 1359 chỉ chạy được khi bảng con rỗng.

**Đường tới lỗi:**

- Lần gửi đầu (`submit`, [repository.ts:1173](src/modules/public-intake/repository.ts:1173)): bảng còn rỗng → deletes no-op → **chạy được**, và chính lần này chèn `public_land_uses`.
- Lần gửi bổ sung (`RESUBMITTED`) hoặc **mọi lần cán bộ bấm Lưu** trên hồ sơ không `DRAFT` ([repository.ts:641-643](src/modules/public-intake/repository.ts:641)): bảng con đã có dòng → `delete from public_parcels` ném `foreign_key_violation` → transaction rollback → route trả `INTERNAL_ERROR` 500.

**Vì sao là P0 của phương án mới:** toàn bộ V3 xoay quanh "cán bộ nhận hồ sơ và sửa bản làm việc". Thao tác sửa duy nhất đang có sẵn đã hỏng cho đúng tập hồ sơ cần sửa.

**Vì sao chưa ai thấy:** không có test nào chạm PostgreSQL thật cho đường này. `tests/public-intake-repository.test.ts` mock tầng SQL; test tích hợp thật duy nhất ([staging-rehearsal-acceptance-saga.integration.test.ts](tests/staging-rehearsal-acceptance-saga.integration.test.ts)) chỉ đi qua saga tiếp nhận, không đi qua `refreshCanonicalProjection`.

**Bản sửa tối thiểu:** đảo hai dòng — con trước cha:

```
delete public_land_uses → delete public_parcels → delete public_owners
→ delete public_certificates → delete public_assets
```

Kèm test tích hợp trên Postgres thật (tái dùng cơ chế `ACCEPTANCE_SAGA_TEST_DATABASE_URL` đã có).

---

### P0-2 — Hai migration trùng version `202607240001`

**Nơi:** `supabase/migrations/202607240001_official_acceptance.sql` và `supabase/migrations/202607240001_repair_public_submission_identity_and_drafts.sql`

Quy trình áp dụng chính thức trong repo là `supabase db push` ([05-testing-and-deploy.md:40-45](docs/brain/05-testing-and-deploy.md:40)). Supabase CLI dùng **tiền tố trước dấu `_` làm khóa version** trong `supabase_migrations.schema_migrations`. Hai file cùng version nghĩa là: thứ tự áp dụng không xác định, và sau khi một file được ghi nhận thì file kia bị coi là "đã chạy" và **không bao giờ được áp dụng** trên môi trường mới.

Hệ quả cụ thể: một môi trường mới có thể có `public_acceptance_sagas` mà thiếu bản vá `legacy_row_index` sequence (hoặc ngược lại) — cả hai đều là điều kiện cần cho luồng đang chạy.

**Bản sửa tối thiểu:** đổi tên **một** file sang version mới, chưa dùng, lớn hơn cả hai (ví dụ `202607240003_official_acceptance.sql`), giữ nguyên nội dung SQL. Cả hai file đều đã `if not exists`/idempotent nên áp dụng lại vô hại. **Không sửa nội dung migration đã chạy production.** Bổ sung test chặn tái phát: quét thư mục, khẳng định version duy nhất và đơn điệu tăng.

---

### P0-3 — Xuất PL3: sheet chính thức luôn rỗng, cắt âm thầm ở 2.000 hồ sơ, và mất file khi ghi nhật ký lỗi

Đây là hạng mục P0 mà prompt yêu cầu điều tra sâu nhất. Kết quả điều tra bằng tái hiện thật (§5.1) chứ không suy đoán.

#### 5.1. Cách tôi tái hiện

Tôi viết một test tạm gọi thẳng `POST` của [src/app/api/exports/route.ts](src/app/api/exports/route.ts) với toàn bộ I/O được mock (auth, CSRF, repository, storage), chạy 4 kịch bản. Kết quả thật:

| Kịch bản                              | Kết quả                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A — có hồ sơ `ACCEPTED`               | HTTP **200**, 9.464 byte, magic `PK`, `x-export-row-count: 2` → **route và ExcelJS hoạt động đúng**                     |
| B — chỉ có `SUBMITTED`/`UNDER_REVIEW` | HTTP **200**, 2 dòng, nhưng toàn bộ nằm ở sheet `Ton dong`; sheet `PL3` **rỗng**                                        |
| C — `appendExportJob` ném lỗi         | HTTP **500**, `{"code":"INTERNAL_ERROR","message":"Không thể tạo bản kết xuất PL3."}` — **file đã dựng xong bị vứt bỏ** |
| D — 2.500 hồ sơ `ACCEPTED`            | `x-export-row-count: 2000` — **mất 500 hồ sơ, không cảnh báo gì**                                                       |

Test tạm đã được xóa sau khi lấy kết quả (lượt này không sửa repo). Kịch bản y hệt được đưa vào bản thi công dưới dạng test chính thức (Phase 1).

#### 5.2. Root cause — có bằng chứng

**(a) Sheet `PL3` không thể có dòng nào.** [pl3-export.ts:48](src/modules/public-intake/pl3-export.ts:48) `OFFICIAL_EXPORT_STATUSES = ["ACCEPTED"]`. Đường duy nhất tới `ACCEPTED` là saga tiếp nhận ([acceptance-saga.ts:496-502](src/modules/submissions/acceptance-saga.ts:496)), mà route chặn cứng bằng `OFFICIAL_ACCEPTANCE_ENABLED = false` ([accept/route.ts:123](src/app/api/submissions/[submissionId]/accept/route.ts:123)). **Không có hồ sơ nào có thể đạt `ACCEPTED` trong hệ thống hiện tại.** Nếu triệu chứng cán bộ gặp là "tải được file nhưng trống", đây chính là nguyên nhân — và nó không nằm ở tầng export.

**(b) Cắt âm thầm ở 2.000.** [route.ts:51](src/app/api/exports/route.ts:51) `allRecords.slice(0, 2000)` — cắt **sau** khi đã tải toàn bộ về bộ nhớ, sắp theo `legacy_row_index` (thứ tự tạo, không phải thứ tự nghiệp vụ), không có header `truncated`, không có cảnh báo trong file. Với mục tiêu 20.000 hồ sơ thì 90% dữ liệu biến mất và báo cáo vẫn trông "bình thường". Kịch bản D chứng minh.

**(c) Ghi nhật ký lỗi làm mất file đã dựng xong.** [route.ts:85-106](src/app/api/exports/route.ts:85) — `appendExportJob` và `appendAudit` nằm **ngoài** `try/catch`, chỉ upload Drive được bọc. Bytes XLSX đã sẵn sàng ở dòng 54 nhưng một lỗi ghi bảng `export_jobs` ở dòng 85 khiến catch tổng ở dòng 120 nuốt tất cả và trả 500. Kịch bản C chứng minh. Đây là ứng viên số một cho triệu chứng "bấm nút, báo lỗi, không có file".

**(d) `repository.list()` không có bộ lọc và không phân trang.** [repository.ts:774-780](src/modules/public-intake/repository.ts:774) — `select ... draft_json, file_summary_json ... from public_submissions order by legacy_row_index`, **không `where`, không `limit`**. Mỗi lần xuất là kéo toàn bộ `draft_json` của mọi hồ sơ về Node. Ở quy mô 20.000 hồ sơ × payload GCN 20 thửa, đây là hàng trăm MB trong một Vercel Function → nguy cơ hết bộ nhớ hoặc quá `maxDuration` → 500. **Chưa xác minh được ở production** (tôi không có quyền truy cập Vercel/Supabase thật) nhưng là lỗi thiết kế rõ ràng, phải sửa bất kể có phải nguyên nhân hiện tại hay không.

**(e) Cột 49 có thể rỗng do jsonb-as-string.** Xem P1-1.

**(f) Nút không nằm ở nơi cán bộ tìm.** `Pl3ExportButton` chỉ được render trong [profile/page.tsx:79](src/app/profile/page.tsx:79). Trang "Hàng chờ tiếp nhận" ([submissions/page.tsx](src/app/submissions/page.tsx)) **không có nút xuất**. Một cán bộ được báo "trang quản trị có nút xuất PL3" mà tìm ở hàng chờ sẽ kết luận là nút hỏng.

**(g) Không có bộ lọc nào.** Commit `06c284d` gỡ dropdown trạng thái (vì nó dùng enum MVP cũ `VERIFIED`/`PENDING_REVIEW` không còn tồn tại → `records` luôn rỗng → đây là lỗi "0 dòng" _trước đó_). Bản sửa đó đúng hướng nhưng để lại hệ quả: **không còn cách nào xuất theo ngày/ca/trạng thái**, mà SOP cuối ca của V3 (§25.3) lại yêu cầu "xuất một file PL3 kiểm soát theo ngày/ca".

#### 5.3. Những giả thuyết tôi đã loại trừ

| Giả thuyết                                          | Kết luận                                                                                                                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ExcelJS không chạy trên runtime Next 16 / Turbopack | **Loại.** `npx next build` thành công; `exceljs` được bundle vào `.next/server/chunks/[root-of-the-server]__0l76qxg._.js`, không warning; kịch bản A trả workbook 9.464 byte mở được                            |
| Sai `Content-Type`/`Content-Disposition`            | **Loại.** [route.ts:110-118](src/app/api/exports/route.ts:110) đúng MIME OOXML, `attachment; filename="..."`, `cache-control: no-store`                                                                         |
| Sai kiểu `Buffer`/`Uint8Array`                      | **Loại.** `renderPl3Workbook` trả `Uint8Array` ([pl3-export.ts:389](src/modules/public-intake/pl3-export.ts:389)), route bọc lại `new Uint8Array(bytes)` — hợp lệ với `NextResponse`                            |
| CSP chặn tải blob                                   | **Loại.** [next.config.ts:3-16](next.config.ts:3) không có directive nào chi phối `<a download>` với `blob:`; `img-src` đã có `blob:`                                                                           |
| Lỗi Drive làm hỏng tải về                           | **Loại.** Upload Drive đã là best-effort ([route.ts:69-81](src/app/api/exports/route.ts:69))                                                                                                                    |
| Thiếu quyền / CSRF                                  | **Loại về mặt code.** Ba role được phép ([route.ts:17](src/app/api/exports/route.ts:17)), CSRF token lấy từ `/api/security/csrf` cùng phiên; sai quyền trả 403 với thông báo riêng, không phải "không tạo được" |

**Điều tôi KHÔNG khẳng định được từ đây:** triệu chứng chính xác mà cán bộ gặp (không có file / file rỗng / file hỏng / báo lỗi). Bốn nguyên nhân (a)(c)(d)(f) cho bốn triệu chứng khác nhau. Phase 1 của bản thi công yêu cầu Antigravity **thu ba dữ kiện chẩn đoán** trước khi sửa: (i) HTTP status + thân phản hồi thật khi bấm nút, (ii) `select count(*) from public.export_jobs` và `select status, count(*) from public.public_submissions group by 1`, (iii) log Vercel Function của request đó. Ba dữ kiện này phân biệt dứt điểm bốn nhánh.

---

### P0-4 — Cán bộ không sửa được thửa đất, mục đích sử dụng, tài sản

**Nơi:** [src/app/api/submissions/[submissionId]/route.ts:60-80](src/app/api/submissions/[submissionId]/route.ts:60)

`patchSchema` chỉ có `version`, `certificate` (3 trường) và `owners` (6 trường). Không có `parcels`, `landUses`, `assets`. Giao diện khớp đúng phạm vi đó: modal sửa chỉ dựng "Giấy chứng nhận" và "Chủ sử dụng" ([submission-detail.tsx:627, 671](src/components/submission-detail.tsx:627)); phần "Thửa đất" ([submission-detail.tsx:587](src/components/submission-detail.tsx:587)) chỉ hiển thị.

Yêu cầu nghiệp vụ mới nói rõ: _"cán bộ được chỉnh sửa toàn bộ trường của bản làm việc"_, _"thêm, sửa, xóa, sắp xếp thửa đất"_, _"thêm, sửa, xóa mục đích sử dụng"_. Đây là **hạng mục lớn nhất chưa có** trong repo, và cũng là thứ AI phục vụ — AI đọc ra 20 thửa mà cán bộ không sửa được thửa nào thì kết quả AI không dùng được.

**Kèm theo — lỗ hổng quyền:** [route.ts:220-229](src/app/api/submissions/[submissionId]/route.ts:220)

```ts
const isAdministrator = user.roles.includes(WARD_ADMIN) || user.roles.includes(SYSTEM_ADMIN);
if (!mayStaffEdit(record, user.email) && !isAdministrator) { ...từ chối... }
```

`mayStaffEdit` đòi `claimedBy === user && status === UNDER_REVIEW` ([review.ts:38-40](src/modules/submissions/review.ts:38)). Nhưng `isAdministrator` **bỏ qua toàn bộ điều kiện đó, kể cả điều kiện trạng thái**. Nghĩa là quản trị viên PATCH được một hồ sơ đang `ACCEPTED`: `draft_json` đổi, còn `cases`/`certificates`/`owners` đã ghi chính thức thì không → dữ liệu chính thức và dữ liệu nguồn lệch nhau vĩnh viễn, không có dấu vết đối soát.

---

### P0-5 — Không tồn tại bản chính thức của thửa đất và mục đích sử dụng

**Nơi:** [acceptance-saga.ts:382-477](src/modules/submissions/acceptance-saga.ts:382) (bước `RECORDS_WRITTEN`)

Saga ghi 4 bảng: `public.cases`, `public.owners`, `public.certificates`, `public.files`. **Không ghi thửa đất, không ghi mục đích sử dụng, không ghi tài sản.** Bảng `public.parcels` (có cột `data_json`) tồn tại trong schema ([schema.sql:392](supabase/migrations/202607230001_supabase_schema.sql:392)) nhưng không dòng code nào trong `src/` ghi vào đó — kiểm bằng `grep -rn "public.parcels" src/` → chỉ khớp `public_parcels` (bảng khác).

Nghĩa là sau khi "tiếp nhận chính thức" thành công, **toàn bộ dữ liệu thửa và mục đích sử dụng vẫn chỉ nằm trong `draft_json`** — cùng một cột mà cán bộ và người dân đều ghi đè được. Không có snapshot bất biến. PL3 vì vậy cũng đọc từ `draft` ([pl3-export.ts:302-327](src/modules/public-intake/pl3-export.ts:302)), tức là báo cáo "chính thức" thực chất phản ánh trạng thái nháp mới nhất, không phải trạng thái tại thời điểm chốt.

Đây là lý do kỹ thuật khiến yêu cầu "bốn lớp dữ liệu" của prompt không thể chỉ là đổi tên biến — phải thêm cột.

---

## 6. P1 — rủi ro cao (10 mục)

| #         | Vấn đề                                                                                      | Bằng chứng                                                                                                                                                                                                                                                                                                                  | Hệ quả                                                                                                                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1-1**  | `file_summary_json` không được parse phòng thủ cho hiện tượng jsonb-as-string của Supavisor | [repository.ts:197](src/modules/public-intake/repository.ts:197) `Array.isArray(row.file_summary_json) ? ... : []`. Cùng lỗi mà [acceptance-saga.ts:88-94](src/modules/submissions/acceptance-saga.ts:88) và [repository.ts:162-173](src/modules/public-intake/repository.ts:162) đã phải vá cho `moved_files`/`draft_json` | Khi pooler trả chuỗi, `fileSummaries` thành `[]` **âm thầm** → PL3 cột 49 rỗng, `completionChecklist` báo thiếu ảnh sai                                                                                                                                                                                             |
| **P1-2**  | Gọi Google Drive bên trong transaction DB, pool `max: 1`                                    | [storage.ts:235-268](src/modules/public-intake/storage.ts:235)                                                                                                                                                                                                                                                              | Mọi request khác của app xếp hàng sau 2 vòng mạng tới Google. Comment ở dòng 232 cảnh báo "đừng gọi hàm này trong transaction" nhưng chính hàm đó mở transaction                                                                                                                                                    |
| **P1-3**  | Phiên công khai không thực sự trượt; CSRF công khai cũng cố định 2 giờ                      | [route-context.ts:124-138](src/modules/public-intake/route-context.ts:124), [session.ts:106-108](src/modules/public-intake/session.ts:106)                                                                                                                                                                                  | Người dân đang tải ảnh trên mạng yếu bị đá ra sau đúng 2 giờ dù đang thao tác liên tục                                                                                                                                                                                                                              |
| **P1-4**  | File orphan trên Drive                                                                      | [uploads/complete/route.ts:161-166](src/app/api/public/submissions/current/uploads/complete/route.ts:161)                                                                                                                                                                                                                   | Ảnh CCCD/GCN nằm lại `01_INBOX` không có bản ghi DB → không ai biết để dọn, không có retention                                                                                                                                                                                                                      |
| **P1-5**  | `/api/health/google`, `/api/health/database` mở công khai                                   | [proxy.ts:24](src/proxy.ts:24)                                                                                                                                                                                                                                                                                              | Ai cũng gọi được vòng lặp tiêu quota Drive API và kết nối DB `max:1`. Cron Vercel gọi mỗi ngày ([vercel.json](vercel.json)) nhưng endpoint không phân biệt cron với người lạ                                                                                                                                        |
| **P1-6**  | Tra cứu GCN công khai có thể dò được ở phía server                                          | [certificate-lookup/route.ts:56-64](src/app/api/public/certificate-lookup/route.ts:56)                                                                                                                                                                                                                                      | Lớp chống dò được mô tả là "bắt buộc quét QR" nhưng `hasCompleteExistingRecordLookupIdentity` ([workflow.ts:179-189](src/modules/public-intake/workflow.ts:179)) **chỉ chạy phía client**. Route chỉ đòi 12 chữ số + tên bất kỳ + token Turnstile → dò được ở tốc độ giải Turnstile, và trả về "CCCD này đã có GCN" |
| **P1-7**  | Claim không có guard `claimed_by`, quản trị viên cướp hồ sơ âm thầm                         | [action/route.ts:167-171](src/app/api/submissions/[submissionId]/action/route.ts:167) đặt `force = true` cho mọi WARD_ADMIN/SYSTEM_ADMIN; UPDATE ([repository.ts:545-551](src/modules/public-intake/repository.ts:545)) chỉ có `version = $2`, không có `claimed_by is null`                                                | Nút "Nhận xử lý" bình thường của admin chiếm luôn hồ sơ cán bộ khác đang giữ, không hỏi, không lý do. Không có `Trả lại hàng chờ` / `Chuyển giao`                                                                                                                                                                   |
| **P1-8**  | `repository.list()` bị dùng cho cả export lẫn tìm kiếm                                      | [repository.ts:774](src/modules/public-intake/repository.ts:774), [api/submissions/route.ts:57-60](src/app/api/submissions/route.ts:57)                                                                                                                                                                                     | Mỗi lần cán bộ gõ vào ô tìm kiếm là một lần kéo toàn bộ `draft_json` của mọi hồ sơ. Comment ở dòng 54-56 nhận biết vấn đề nhưng chỉ né được đường không-tìm-kiếm                                                                                                                                                    |
| **P1-9**  | PII vào `audit_logs.metadata`                                                               | [submissions/[submissionId]/route.ts:320-349](src/app/api/submissions/[submissionId]/route.ts:320) ghi `"Nguyễn Văn A → Nguyễn Văn B"`, địa chỉ thường trú đầy đủ                                                                                                                                                           | CCCD đã được che ([route.ts:55-58](src/app/api/submissions/[submissionId]/route.ts:55)) nhưng họ tên + địa chỉ thì không. `audit_logs` append-only, không retention                                                                                                                                                 |
| **P1-10** | `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE` đang bật trên production                             | [04-current-tasks.md:99-106](docs/brain/04-current-tasks.md:99)                                                                                                                                                                                                                                                             | Đã được chủ dự án chấp nhận rủi ro ([03-decisions.md](docs/brain/03-decisions.md) [2026-07-24]). Nhắc lại vì phương án mới đưa **ảnh giấy tờ thật với khối lượng lớn** vào chính bề mặt đó                                                                                                                          |

---

## 7. P2 — cải tiến

- **P2-1** — `wizard.tsx` 3.025 dòng trong một file client. Trước khi thêm bảng sửa 20 thửa cho cán bộ, tách component/hook như V3 §21.4 đề xuất. Không refactor lan sang phần người dân trong cùng commit.
- **P2-2** — `labels` của hàng chờ ([submissions-queue.tsx:17-27](src/components/submissions-queue.tsx:17)) thiếu `NO_ACTION_REQUIRED` → hiển thị mã thô.
- **P2-3** — `paginate()` ([api/submissions/route.ts:27-40](src/app/api/submissions/route.ts:27)) phân trang bằng `findIndex` trên mảng đã tải hết; nên là keyset pagination ở SQL.
- **P2-4** — `buildOriginalFileNames` đánh số `-1`, `-2` (không đệm 0) trong khi quy ước mới là `-01`, `-02`. Sửa được **không tốn kém ngay bây giờ** vì saga đang khóa nên chưa file nào bị đổi tên thật trên Drive.
- **P2-5** — `PL3_COLUMNS` trường 20 luôn rỗng ([pl3-export.ts:284](src/modules/public-intake/pl3-export.ts:284)) do chưa có bảng tra số thửa cũ→mới. Đã là câu hỏi treo trong `04-current-tasks.md`; nhắc lại vì PL3 nộp lên có thể bị trả về.
- **P2-6** — Không có E2E nào cho luồng cán bộ. 1 test Playwright duy nhất kiểm trang chủ.
- **P2-7** — `renderPl3Workbook` không ghi cảnh báo vào file. Warnings được đếm ([route.ts:60](src/app/api/exports/route.ts:60)) rồi vứt. Nên thêm sheet `Canh bao`.
- **P2-8** — Thêm `serverExternalPackages: ["exceljs"]` vào `next.config.ts`. Hiện bundle chạy được nên **không phải bug**, nhưng để ExcelJS ở dạng external là cấu hình chuẩn cho thư viện Node nặng, giảm rủi ro khi nâng Next.

---

## 8. Quyết định kiến trúc

### 8.1. Một submission = một GCN — **KHÔNG thêm `intake_batch`**

**Quyết định: phương án A.** V3 §4.1 đề xuất thêm `intake_batches`; tôi bác bỏ ở mọi pha.

Lý do — `submission_id` hiện là khóa của **chín** thứ độc lập nhau:

| Thứ bị khóa theo submission                                                                          | Bằng chứng                                                                                             |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Mã tiếp nhận `PC-KK-{năm}-{8}`                                                                       | [receipt-code.ts:51-54](src/modules/public-intake/receipt-code.ts:51)                                  |
| Mã bí mật + `access_version` (khôi phục phiên)                                                       | [session.ts:135-150](src/modules/public-intake/session.ts:135)                                         |
| Cookie phiên công khai (ký kèm `submissionId`, `rowIndex`)                                           | [session.ts:40-48](src/modules/public-intake/session.ts:40)                                            |
| CSRF công khai (ký kèm `submissionId`)                                                               | [session.ts:101-108](src/modules/public-intake/session.ts:101)                                         |
| Thư mục Drive `01_INBOX/{submissionId}/originals`                                                    | [storage.ts:58-65](src/modules/public-intake/storage.ts:58)                                            |
| 5 bảng chuẩn hóa `public_*` (FK `submission_id`)                                                     | [schema.sql:144-210](supabase/migrations/202607230001_supabase_schema.sql:144)                         |
| Saga tiếp nhận (`public_acceptance_sagas.submission_id` là **primary key**)                          | [202607240001_official_acceptance.sql:18](supabase/migrations/202607240001_official_acceptance.sql:18) |
| Mọi idempotency key (`PUBLIC_UPLOAD_COMPLETE:{submissionId}:...`, `STAFF_ACTION:{submissionId}:...`) | nhiều route                                                                                            |
| Nổ dòng PL3 (một phiếu đúng một GCN)                                                                 | [pl3-export.ts:5-6](src/modules/public-intake/pl3-export.ts:5)                                         |

Thêm `intake_batch` là chạm cả chín. Lợi ích duy nhất V3 nêu — "tái sử dụng CCCD và thông tin liên hệ" — đạt được rẻ hơn nhiều bằng **nút "Kê khai thêm GCN"**: tạo submission mới, sao chép `owners` + `phone` từ submission vừa gửi, người dân chỉ nhập phần GCN mới. Không migration, không đổi FK, không đụng saga.

Nếu sau này thật sự cần gom hộ (ví dụ để in phiếu hẹn theo hộ), thêm **một cột nullable** `household_group_id uuid` vào `public_submissions` + một bảng tra là đủ, và làm được bất cứ lúc nào mà không phá dữ liệu cũ. Đó là đường thoát rẻ, nên không cần trả trước chi phí bây giờ.

Chi phí thật của A: một hộ 3 GCN có 3 mã tiếp nhận, 3 mã bí mật. Đây là **chi phí vận hành nhỏ và giải thích được** (mỗi GCN một phiếu), đổi lấy việc không đụng vào chín điểm nêu trên.

### 8.2. Bốn lớp dữ liệu

| Lớp          | Lưu ở đâu                                                                                                                                                                | Ghi bởi                                                                                                                    | Bất biến                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **citizen**  | `public_submissions.citizen_payload_json` (cột **mới**) + `citizen_payload_version`                                                                                      | Đúng một lần tại `submit`; mỗi lần gửi bổ sung ghi thêm một dòng vào `public_submission_payload_history`, **không ghi đè** | AI và cán bộ không bao giờ ghi vào cột này                                  |
| **AI**       | 3 bảng mới `ai_extraction_jobs` / `ai_extraction_results` / `ai_field_comparisons`                                                                                       | Chỉ importer AI                                                                                                            | Không bao giờ ghi vào submission                                            |
| **working**  | `public_submissions.working_payload_json` (cột **mới**)                                                                                                                  | Chỉ `assigned staff` qua `PATCH .../working-payload`                                                                       | Khởi tạo bằng bản sao citizen payload lúc claim                             |
| **official** | `public_submissions.official_payload_json` + `official_payload_at` + `official_payload_by` (cột **mới**), **cộng thêm** ghi đủ `parcels`/`land_uses` vào bảng chính thức | Chỉ saga hoàn thành xử lý, trong transaction                                                                               | Chỉ đổi qua chức năng "điều chỉnh hồ sơ chính thức" riêng, có lịch sử riêng |

**`draft_json` giữ nguyên ý nghĩa cũ** — bản nháp người dân đang gõ trước khi gửi. Không đổi tên, không đổi kiểu, không migration dữ liệu. Đây là điểm mấu chốt để bản thi công có thể rollback bằng cách bỏ dùng cột mới.

Ba cột JSONB mới đều `null` được, thêm bằng `alter table ... add column if not exists` → migration không khóa bảng lâu, không phá dữ liệu cũ, rollback = ngừng đọc cột.

`ai_field_comparisons` thay cho `ai_field_evidence` + `ai_validation_issues` của V3: một bảng ghi đúng cái cán bộ cần nhìn (`field_path`, `citizen_value`, `ai_value`, `status ∈ {MATCH, MISMATCH, CITIZEN_MISSING, AI_UNREADABLE, AI_ONLY, RULE_VIOLATION}`, `evidence_text`, `source_file_id`, `page_index`). Bounding box: **không làm** ở pha này (V3 §27 câu 8 — trả lời: không cần).

### 8.3. State machine — không đổi enum

Giữ nguyên 10 giá trị `PublicStatus` ([workflow.ts:5-16](src/modules/public-intake/workflow.ts:5)) — đã có `check constraint` trong DB, đã có dữ liệu thật. Chỉ ánh xạ nhãn:

```text
Chờ tiếp nhận      ← SUBMITTED, RESUBMITTED
Đang xử lý         ← UNDER_REVIEW
Đang ghi chính thức ← ACCEPTING          (trạng thái quá độ, hiển thị dạng spinner)
Hoàn thành xử lý   ← ACCEPTED
Cần bổ sung        ← NEEDS_SUPPLEMENT
Không tiếp nhận    ← REJECTED
Đã có hồ sơ        ← NO_ACTION_REQUIRED
(ẩn khỏi hàng chờ) ← DRAFT, EXPIRED
```

Bảng nhãn hiện có ([submissions-queue.tsx:17-27](src/components/submissions-queue.tsx:17)) **đã đúng gần hết** — `SUBMITTED: "Chờ tiếp nhận"`, `UNDER_REVIEW: "Đang xử lý"`. Chỉ cần thêm `NO_ACTION_REQUIRED` và đổi `ACCEPTED` thành `"Hoàn thành xử lý"`.

Trạng thái job AI (`QUEUED → PACKAGING → ... → IMPORTED`) là **cột riêng trên `ai_extraction_jobs`**, không trộn vào `PublicStatus`. Hồ sơ không có kết quả AI vẫn đi hết luồng thủ công — đây là invariant bắt buộc.

### 8.4. Claim / lock

Cơ chế CAS theo `version` hiện có **đã đủ nguyên tử** để chống hai cán bộ claim cùng lúc (người thua nhận `409 VERSION_CONFLICT`). Không cần lease/heartbeat cho 3 cán bộ. Bốn thay đổi:

1. Thêm điều kiện vào chính câu UPDATE, không chỉ kiểm ở tầng route:
   ```sql
   where submission_id = $1 and version = $2
     and status in ('SUBMITTED','RESUBMITTED')
     and claimed_by is null
   ```
2. **Tách `FORCE_CLAIM` khỏi `CLAIM`.** Admin bấm "Nhận xử lý" thì cũng bị 403 như mọi người nếu hồ sơ đã có chủ; muốn cướp phải bấm nút riêng, nhập `reason` bắt buộc, audit `SUBMISSION_FORCE_CLAIMED`.
3. Thêm `RELEASE` (trả lại hàng chờ, cần `reason`) và `TRANSFER` (chuyển giao, cần `toEmail` + `reason`).
4. **Bỏ nhánh `isAdministrator` bỏ qua kiểm tra trạng thái ở `PATCH`** (P0-4). Admin muốn sửa thì `FORCE_CLAIM` trước.

Không tự mở khóa khi đóng tab. Không tự hết hạn theo thời gian ở MVP — thay vào đó hàng chờ hiển thị "đang giữ N giờ" để cán bộ tự xử lý theo SOP cuối ca.

### 8.5. AI job

- **Một job = một submission = một GCN.** (V3 §27 câu 2 — trả lời: một GCN.)
- Job chỉ gồm file `documentType = 'CERTIFICATE'`. **Ảnh CCCD không bao giờ vào job.** Đây là ràng buộc code, không phải quy ước: hàm dựng manifest lọc theo `documentType` và validator từ chối manifest chứa loại khác.
- Ảnh **được sao chép** từ Drive về workspace cục bộ ngoài repo qua `ANTIGRAVITY_WORKSPACE_ROOT` (V3 §27 câu 3 — trả lời: sao chép, không mount; mount Drive trên Windows là đường dẫn ảo không có checksum ổn định).
- Agent **không có DB credential**. Import qua `POST /api/ai/results` với `AI_WORKER_API_KEY` riêng (V3 §27 câu 13 — trả lời: API nội bộ, không phải DB role riêng; trên Vercel một DB role thứ hai là thêm secret phải xoay mà không thêm bảo đảm nào).
- Idempotency theo `input_fingerprint = sha256(submissionId | citizenPayloadVersion | fileId+sha256 theo thứ tự | schemaVersion | promptVersion)`.
- `raw_json` lưu thẳng trong `jsonb` (V3 §27 câu 6 — trả lời: lưu trong DB; payload một GCN 20 thửa cỡ vài trăm KB, thêm object storage là thêm một hệ thống phải backup và phân quyền mà không được gì).
- Schema mỗi trường `{value, status, evidenceText, sourceFileIds}` là **hợp lý ở mức 20 thửa** (V3 §27 câu 5 — trả lời: giữ). Đo thử: 20 thửa × 1 mục đích × ~8 trường ≈ 200 object ≈ 60–120 KB JSON. Chấp nhận được.
- **Cờ tắt:** `AI_EXTRACTION_ENABLED=false` mặc định. Tắt cờ thì cán bộ vẫn xử lý thủ công đủ mọi thao tác.

### 8.6. Đặt tên tệp và thư mục — quyết định cuối

**Tên tệp: GIỮ KHOẢNG TRẮNG như trên bìa.**

Prompt §5.1 đưa ví dụ `0 319059-GCN.pdf`, `AA 09489120-GCN.pdf` (giữ dấu cách) trong khi V3 §30.3 lại yêu cầu đổi dấu cách thành `-`. Hai tài liệu mâu thuẫn; prompt có mức ưu tiên cao hơn, **và** code hiện tại đã giữ dấu cách với test bao phủ ([file-naming.ts:29-35](src/modules/public-intake/file-naming.ts:29), [tests/file-naming.test.ts](tests/file-naming.test.ts)). Chọn giữ dấu cách → không sửa gì, không rủi ro.

Quy tắc chốt:

```text
Tệp GCN:      {SỐ PHÁT HÀNH}-GCN.{ext}          → "AA 09489120-GCN.jpg"
Nhiều tệp:    {SỐ PHÁT HÀNH}-GCN-{01..99}.{ext} → "AA 09489120-GCN-01.jpg"
Giấy tờ:      {SỐ PHÁT HÀNH}-GT[-{01..99}].{ext}
Chưa rõ seri: {MÃ TIẾP NHẬN}-GCN[-{01..99}].{ext}  (KHÔNG đoán seri)
```

- Chuẩn hóa: bỏ `/ \ \r \n \t \0`, gộp khoảng trắng liên tiếp, trim. Không đụng số 0 đứng đầu. Giữ nguyên chữ hoa/thường như người dân/bìa ghi.
- **Đệm 0 hai chữ số** cho STT (`-01` thay vì `-1`) — sửa `buildOriginalFileNames`. An toàn tuyệt đối lúc này vì saga đang khóa, chưa file thật nào bị đổi tên.
- `original_filename` và `normalized_filename` lưu riêng; liên kết nghiệp vụ **chỉ** bằng `file_id` / `drive_file_id`. Cột `public_files.file_name` đã có, thêm `normalized_file_name`, `filename_status ∈ {PROVISIONAL, CONFIRMED}`, `renamed_at`, `renamed_by`.
- Tải lại tệp: `-R01`, `-R02`, `is_current`. Không ghi đè.
- Trùng tên: không thể trùng vì tiền tố là số phát hành + STT trong cùng hồ sơ; nếu hai hồ sơ khác nhau cùng số phát hành thì đó là dữ liệu cần cán bộ xử lý, sinh cảnh báo `DUPLICATE_SERIAL`, không tự phân biệt bằng tên.

**Thư mục inbox:**

```text
HS-{MÃ_TIẾP_NHẬN}_{HỌ_TÊN_KHÔNG_DẤU}_{SERI_SLUG}
```

Ví dụ thật (mã tiếp nhận đúng định dạng repo đang sinh, **không phải** `PC-20260725-000123` như V3 giả định):

```text
HS-PC-KK-2026-A7K3M2P9_NGUYEN-VAN-A_AA-09489120
HS-PC-KK-2026-B4N8QRS2_TRAN-THI-B_CHUA-XAC-DINH
```

- Dài tối đa **120 ký tự**; cắt phần họ tên trước, không cắt mã tiếp nhận và seri.
- Ký tự hợp lệ: `A-Z 0-9 - _`. Tiếng Việt bỏ dấu (NFD → strip combining marks → uppercase), khoảng trắng → `-`.
- Chống trùng: mã tiếp nhận là duy nhất toàn hệ thống → thư mục duy nhất kể cả hai người trùng họ tên.
- Chưa biết seri: `CHUA-XAC-DINH`, `filename_status = PROVISIONAL`.
- Đổi tên sau khi cán bộ xác nhận seri: script có kiểm soát đổi `normalized_filename` + đổi tên trên Drive, `drive_file_id` **không đổi**, ghi audit `FILE_RENAMED`.
- **Không** đưa CCCD, số điện thoại, địa chỉ vào tên. Họ tên không dấu chỉ dùng trong `inbox` cục bộ đã phân quyền — chấp nhận được vì đây là máy trạm của đơn vị, không đồng bộ ra ngoài.
- Agent **không tin filename**: đọc seri trong ảnh độc lập, lệch thì sinh `SERIAL_FILENAME_MISMATCH` (severity `HIGH`), chuyển `needs-review`.

### 8.7. Xuất PL3

1. Đọc theo thứ tự ưu tiên `official_payload_json → working_payload_json → draft_json`, không đọc thẳng `draft` nữa.
2. Lọc và phân trang **ở SQL**: thêm `listForExport({statuses, fromDate, toDate, limit, cursor})`, đọc theo lô 500 dòng, dựng workbook theo luồng.
3. **Bỏ `slice(0, 2000)`.** Nếu vẫn cần chặn trên (bảo vệ bộ nhớ), phải trả `x-export-truncated: 1` **và** một dòng cảnh báo trong sheet `Canh bao`, không im lặng.
4. Ghi `export_jobs`/`audit_logs` bọc `try/catch` riêng: lỗi ghi nhật ký làm `x-export-audit: failed`, **không hủy file**.
5. Thêm sheet thứ ba `Canh bao`: mỗi dòng một cảnh báo kèm mã tiếp nhận.
6. Thêm bộ lọc trên UI (nhóm trạng thái + khoảng ngày) và đặt nút export **cả ở trang hàng chờ**, không chỉ `/profile`.
7. Header `x-export-row-count`, `x-export-submission-count`, `x-export-warning-count`, `x-export-truncated`, `x-export-archived` — đủ để đối soát cuối ca.
8. `MAX_LAND_USES_PER_PARCEL = 3` **đúng với PL3** — biểu mẫu chỉ có ba bộ cột 25–29 / 30–34 / 35–39 ([pl3-export.ts:83-97](src/modules/public-intake/pl3-export.ts:83)). Giữ nguyên hằng số. Nhưng xem câu hỏi §10-Q3 về thửa có >3 mục đích.

---

## 9. Những nội dung của V3 cần bỏ hoặc sửa

| V3                                                                                                             | Vấn đề                                                                                                                                                                      | Xử lý                                                                                                     |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| §4.1 `intake_batches`                                                                                          | Chi phí vượt lợi ích, chạm 9 điểm khóa theo `submission_id`                                                                                                                 | **BỎ** khỏi mọi pha. Thay bằng nút "Kê khai thêm GCN"                                                     |
| §2.2 "Dữ liệu cấu trúc ban đầu có thể rỗng hoặc tối thiểu", §1.2 "người dân chỉ chụp ảnh"                      | **Mâu thuẫn với quyết định mới nhất** trong prompt §4.1: _"Người dân vẫn trực tiếp điền thông tin hồ sơ"_                                                                   | **SỬA.** Người dân vẫn kê khai đủ như hiện tại. AI đọc ảnh để **đối chiếu**, không để thay người dân nhập |
| §8.1, §8.2 các trạng thái `READY_FOR_AI`, `AI_EXTRACTED`, `WAITING_FOR_PROCESSING`, `IN_PROGRESS`, `COMPLETED` | Đề xuất trạng thái nghiệp vụ mới, trùng chức năng enum đã có                                                                                                                | **SỬA.** Trạng thái job AI để riêng trên `ai_extraction_jobs`. `PublicStatus` không đổi                   |
| §9.3 `ai_field_evidence` + §9.4 `ai_validation_issues`                                                         | Hai bảng cho một mục đích ở pha đầu                                                                                                                                         | **GỘP** thành `ai_field_comparisons`                                                                      |
| §9.6 `intake_batches`                                                                                          | Như trên                                                                                                                                                                    | **BỎ**                                                                                                    |
| §10 schema `assets`, `agentSelfCheck`                                                                          | Giữ; nhưng `documentAssessment.detectedPageCount` phải so với số file trong manifest, không tự khai                                                                         | **SỬA** thành ràng buộc validator                                                                         |
| §12.6 "nhiều hơn 3 land use thì blocking issue"                                                                | Đúng hướng, nhưng repo **chặn cứng ngay lúc người dân khai** ([validation.ts:263-265](src/modules/public-intake/validation.ts:263)) → người dân không nộp được hồ sơ hợp lệ | **SỬA** — xem §10-Q3                                                                                      |
| §14.1 "Người dân không xem hoặc sửa danh sách trường AI"                                                       | Đúng, giữ                                                                                                                                                                   | Giữ                                                                                                       |
| §16.6 "xác minh điều khoản gói Antigravity"                                                                    | Đúng và **bắt buộc**, nhưng V3 đặt ở mục 16 như một lưu ý                                                                                                                   | **NÂNG** thành điều kiện GO cứng, chặn Pha pilot                                                          |
| §20.3 công thức dự báo                                                                                         | Giả định Agent là nút cổ chai. Với 3 cán bộ, nút cổ chai gần như chắc chắn là **thời gian cán bộ review**, không phải AI                                                    | **SỬA** — đo thời gian cán bộ trước khi đo tốc độ AI                                                      |
| §22.2 `AI_EXTRACTION_PUBLIC_REVIEW_ENABLED`                                                                    | Không còn ý nghĩa (người dân không review dữ liệu AI)                                                                                                                       | **BỎ** biến này                                                                                           |
| §30.2 `HS-PC-20260725-000123_...`                                                                              | **Mã tiếp nhận thật là `PC-KK-2026-A7K3M2P9`** ([receipt-code.ts:51-54](src/modules/public-intake/receipt-code.ts:51)), không phải dạng ngày+số thứ tự                      | **SỬA** toàn bộ ví dụ                                                                                     |
| §30.3 "thay khoảng trắng bằng `-`" trong tên tệp                                                               | Mâu thuẫn với prompt §5.1 và với code + test hiện có                                                                                                                        | **SỬA** — giữ khoảng trắng ở tên tệp, chỉ dùng slug gạch ngang cho tên thư mục                            |
| §30.5 cấu trúc thư mục nhiều GCN lồng nhau                                                                     | Hệ quả của `intake_batch` đã bỏ                                                                                                                                             | **BỎ.** Mỗi hồ sơ một thư mục phẳng                                                                       |
| §17.4 ngưỡng pilot ≥99,5% / ≥98%                                                                               | Con số hợp lý **nếu** đo trên bộ mẫu có đáp án chuẩn do cán bộ nhập tay. Chưa có bộ mẫu đó                                                                                  | **GIỮ** kèm điều kiện: phải dựng bộ vàng 50 GCN trước khi trích dẫn bất kỳ con số nào                     |

---

## 10. Câu hỏi thực sự cần người dùng quyết định

> ## ✅ [2026-07-25] CẢ BẢY CÂU ĐÃ ĐƯỢC TRẢ LỜI
>
> Đáp án đầy đủ và hệ quả thi công nằm ở `docs/brain/03-decisions.md` [2026-07-25] "Trả lời 7 câu
> hỏi treo của review kiến trúc". Tóm tắt:
>
> | Câu | Đáp án                                                            | Đã thi công?                                                                                                                       |
> | --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
> | Q1  | Cán bộ sửa **toàn trường**, kể cả field `QR_CONFIRMED`            | ✅ Đã làm — hạ khóa cứng xuống cảnh báo + audit `identityOverride`                                                                 |
> | Q2  | Cho cán bộ sửa hồ sơ đã hoàn thành; cán bộ quyết định cuối cùng   | ✅ **Đã làm** — `syncOfficialRecord` ghi lại dữ liệu chính thức trong CÙNG transaction với lần sửa; bắt buộc lý do; đóng luôn P0-4 |
> | Q3  | Tạm giữ ở **3 mục đích**                                          | ✅ Không đổi code                                                                                                                  |
> | Q4  | Bỏ trường 21/22, **vẫn thu** cột O, P (nhiều chủ đã mất)          | ✅ Hiện trạng đã đúng — không cần sửa                                                                                              |
> | Q5  | Cứ cho thực hiện Gemini/Antigravity                               | ✅ Gỡ tư cách điều kiện chặn. Ảnh CCCD vẫn tuyệt đối không gửi mô hình                                                             |
> | Q6  | **Chưa có hồ sơ thật nào**; thu hồ sơ thật bắt đầu sau 2026-07-25 | —                                                                                                                                  |
> | Q7  | **Đảo sang `true`**                                               | ✅ Đã đảo + vá P0-1 và P0-5 cùng lượt + nối nút UI                                                                                 |
>
> Phần bên dưới giữ nguyên như lúc đặt câu hỏi, để đọc lại được bối cảnh vì sao từng câu là câu
> chặn.

Chỉ liệt kê những câu mà **không có đáp án nào an toàn để tôi tự chọn**.

**Q1 — Cán bộ có được sửa số định danh của chủ đã `QR_CONFIRMED` không?**
Hiện tại khóa cứng ([review.ts:47-49](src/modules/submissions/review.ts:47), [route.ts:274-281](src/app/api/submissions/[submissionId]/route.ts:274)). Yêu cầu mới nói _"cán bộ được sửa toàn bộ trường"_. Hai điều này loại trừ nhau. **Khuyến nghị: giữ khóa** (số đọc từ chip thẻ đáng tin hơn mắt cán bộ), nhưng cần chủ dự án xác nhận, vì nếu QR đọc nhầm thì hồ sơ sẽ bế tắc.

**Q2 — Hồ sơ đã `Hoàn thành xử lý` rồi phát hiện sai thì sửa thế nào?**
Cần một chức năng "điều chỉnh hồ sơ chính thức" riêng, quyền cao hơn, có lịch sử điều chỉnh riêng — hay chấp nhận "làm lại từ đầu"? Ảnh hưởng trực tiếp tới thiết kế `official_payload`. **Khuyến nghị: MVP chưa làm chức năng điều chỉnh; chỉ chặn PATCH sau khi hoàn thành và ghi nhận đây là hạn chế đã biết.**

**Q3 — Một thửa có hơn 3 mục đích sử dụng thì PL3 ghi thế nào?**
Biểu mẫu chỉ có 3 bộ cột. Hiện hệ thống **chặn người dân nộp** ([validation.ts:263](src/modules/public-intake/validation.ts:263)) — tức là hồ sơ hợp lệ ngoài đời không nộp được. Ba lựa chọn: (a) giữ chặn, người dân ra phường làm trực tiếp; (b) cho khai >3 rồi PL3 nổ thêm một dòng cùng thửa cho mục đích 4–6; (c) cho khai >3, PL3 ghi 3 mục đầu + cảnh báo BLOCKING buộc cán bộ xử lý ngoài hệ thống. **Cần cơ quan xác nhận PL3 có chấp nhận (b) không.** Không tự quyết được vì sai là sai file nộp lên tỉnh.

**Q4 — Trường 21, 22 của PL3 là gì, và hai cột O/P có thuộc bộ 49 không?**
Đã treo từ trước ([04-current-tasks.md:174](docs/brain/04-current-tasks.md:174)). Nhắc lại vì nó quyết định `PL3_COLUMNS` có đúng hay không — nếu sai thì **mọi file đã xuất đều sai**, và không test nào bắt được.

**Q5 — Điều khoản xử lý dữ liệu của gói Antigravity/Gemini đang dùng?**
Cần văn bản xác nhận: dữ liệu xử lý ở đâu, có dùng để huấn luyện không, retention bao lâu. **Không được đưa ảnh GCN thật vào mô hình trước khi có câu trả lời.** Ảnh GCN chứa họ tên + địa chỉ + số thửa — là dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP.

**Q6 — Có bao nhiêu hồ sơ thật đang ở mỗi trạng thái trong `public_submissions`?**
Tôi không có quyền truy cập DB. Con số này quyết định P0-3 nhánh (d) có phải nguyên nhân thật hay không, và quyết định có cần streaming export ngay ở Phase 2 hay để Phase sau. Lệnh: `select status, count(*) from public.public_submissions group by 1 order by 2 desc;`

**Q7 — Đảo `OFFICIAL_ACCEPTANCE_ENABLED = true` khi nào?**
`04-current-tasks.md` nói điều kiện gác cổng duy nhất còn lại (diễn tập staging) **đã xong**. Nếu vậy thì cờ này đang chặn nhầm và là nguyên nhân trực tiếp của P0-3(a). Cần chủ dự án xác nhận đảo cờ — nhưng **chỉ sau khi P0-1 và P0-5 đã sửa**, vì hiện tại "hoàn thành xử lý" ghi thiếu thửa đất.

---

## 11. Checklist §31 của V3

```text
[x] Kiến trúc không phụ thuộc Antigravity là service 24/7   — job/lease bền vững trong Postgres
[x] Agent không có quyền ghi dữ liệu chính thức             — chỉ POST /api/ai/results với API key riêng
[x] Dữ liệu ảnh không bị commit hoặc lộ qua log             — workspace ngoài repo + .gitignore + quy tắc log
[x] Job có idempotency, lease và retry                      — input_fingerprint + lease_expires_at + attempt_count
[x] Result có evidence và schema strict                     — Zod strict + ai_field_comparisons
[x] Validator không dựa vào confidence của model            — chỉ status/evidence/rule
[x] Một GCN 20 thửa được xử lý đầy đủ                       — bảng sửa thửa của cán bộ (Phase 9) + test 20 thửa
[x] Nhiều GCN của một hộ có lộ trình rõ                     — nút "Kê khai thêm GCN", không batch
[x] Không cắt quá 3 land uses âm thầm                       — đã chặn ở validation; xem Q3
[x] Chạy lại AI không ghi đè dữ liệu cán bộ đã sửa          — AI không bao giờ ghi working_payload
[x] Migration có thể rollback bằng feature flag             — AI_EXTRACTION_ENABLED + cột nullable
[x] Public DTO không lộ raw result/PII nội bộ               — không có API public nào chạm bảng AI
[x] Có test prompt injection qua ảnh                        — Phase 13
[x] Có claim/lock nguyên tử để 03 cán bộ không sửa chung    — CAS version + guard claimed_by (Phase 8)
[x] Chỉ cán bộ được giao có quyền PATCH/complete            — bỏ nhánh admin bypass (Phase 8)
[x] Có SOP quota/hết mạng/máy tắt                           — Phase 13 runbook
[x] Có tiêu chí chuyển sang Gemini API khi quy mô tăng      — §12 dưới đây
[!] Xuất XLSX PL3 tải được, mở được, đủ dữ liệu             — CHƯA ĐẠT, là P0-3, sửa ở Phase 1-2
[x] Có test PL3 cho GCN 20 thửa và nhiều chủ                — Phase 1
[!] Có xác minh điều khoản xử lý dữ liệu trước pilot thật   — CHƯA CÓ, câu hỏi Q5
[x] Có quy ước folder bộ hồ sơ và filename GCN/GT thống nhất — §8.6
[x] Agent không tin filename, có SERIAL_FILENAME_MISMATCH   — §8.6 + Phase 7
[x] Tên gốc, tên chuẩn hóa, Drive file ID và revision riêng — Phase 11
```

Hai mục `[!]` là điều kiện chặn pilot dữ liệu thật.

---

## 12. Khi nào bỏ Antigravity chuyển sang Gemini API

Chuyển khi **bất kỳ** điều nào xảy ra:

- Tồn đọng job `READY_FOR_AGENT` > 500 kéo dài quá 3 ngày làm việc.
- Quota Antigravity hết trước 60% khối lượng của một ca, lặp lại 3 ca liên tiếp.
- Cần xử lý ngoài giờ hành chính (máy trạm tắt là hệ thống đứng).
- Tổng khối lượng còn lại > 5.000 GCN và tốc độ đo được < 150 GCN/ngày/máy.

Chi phí chuyển đổi được thiết kế là **thấp**: giữ nguyên bảng `ai_extraction_jobs`/`_results`/`_comparisons`, giữ nguyên validator và schema, chỉ đổi `worker_type` từ `ANTIGRAVITY` sang `GEMINI_API` và thay tầng gọi mô hình. Đây là lý do tôi giữ toàn bộ phần trừu tượng worker của V3 §26.4.

---

## 13. Điều tôi CHƯA xác minh được

Ghi rõ để không ai đọc tài liệu này rồi tưởng mọi thứ đã được kiểm chứng:

1. **Triệu chứng thật của lỗi PL3 ở production.** Tôi tái hiện được 4 nhánh lỗi trong test, không truy cập được production để biết nhánh nào đang xảy ra.
2. **Số hồ sơ thật và phân bố trạng thái** trong `public_submissions` — quyết định mức độ khẩn của P0-3(d).
3. **P0-1 chưa được chứng minh trên PostgreSQL thật.** Kết luận dựa trên đọc SQL + đọc DDL khóa ngoại. Phase 0 của bản thi công yêu cầu test tích hợp chứng minh trước khi sửa.
4. **Biến môi trường trên Vercel Production** (`SUPABASE_DATABASE_URL`, `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE`) — chỉ chủ dự án xem được.
5. **Hành vi jsonb-as-string của Supavisor xảy ra với tần suất nào.** Repo ghi nhận nó là "đôi khi" ([acceptance-saga.ts:80-87](src/modules/submissions/acceptance-saga.ts:80)); tôi không tái hiện được, chỉ chỉ ra chỗ chưa được vá phòng thủ.
6. **`npm run test:e2e` và `npm run test:python`** — chưa chạy trong lượt này (Playwright cần dựng dev server; test Python cần môi trường Python). Đã chạy `vitest` và `next build`.
