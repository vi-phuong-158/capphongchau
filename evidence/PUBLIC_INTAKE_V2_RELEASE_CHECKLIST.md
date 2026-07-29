# PUBLIC INTAKE V2 — RELEASE CHECKLIST

> **SNAPSHOT LỊCH SỬ:** checklist này được lập trước khi thêm kill switch server-side. Không dùng
> kết luận cũ về feature flag trong snapshot để suy ra trạng thái hiện tại; xem `docs/brain/03-decisions.md`.

Nhánh `claude/land-declaration-process-feedback-126f2e`. **Chưa merge, chưa deploy, chưa chạy
migration ở bất kỳ môi trường nào.**

## 1. Trước khi merge

- [ ] Đọc lại `evidence/PUBLIC_INTAKE_V2_MIGRATION_REVIEW_V2.md` (bản đầy đủ, **4 migration**) —
      **migration chạy TRƯỚC, code deploy SAU**. Ngược lại là 500 ở mọi màn hình hồ sơ.
- [ ] Đọc `evidence/PUBLIC_INTAKE_V2_DIFF_REVIEW.md` — 1 BLOCKER + 4 HIGH đã sửa, 5 MEDIUM còn lại.
- [ ] `npm run test:e2e` với credential thật — **chưa chạy lần nào**. Bảy kịch bản đã viết ở
      `tests/e2e/public-intake-v2.spec.ts`; điều kiện đầy đủ ở `PUBLIC_INTAKE_V2_E2E_CHECKLIST.md`.
      Lưu ý các test `fixme`/`skip` **không** tính là pass.
- [ ] Bảy kịch bản E2E §17.3 của đầu bài, đặc biệt **E2E-05 official guard**: hồ sơ tối thiểu phải
      **bị chặn** ở bước tiếp nhận chính thức.
- [ ] Rà soát người thật: mở `/ke-khai` trên điện thoại, kê khai một hồ sơ giả từ đầu đến cuối.
- [ ] Xác nhận với chủ dự án: bỏ bước tài sản khỏi cổng công khai là đúng ý (dữ liệu vẫn còn, chỉ
      ẩn giao diện).

## 2. Cấu hình môi trường

| Biến | Giá trị khi phát hành | Ghi chú |
|---|---|---|
| `NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED` | `false` | Chỉ bật sau khi qua bộ kiểm chất lượng ảnh |

Chế độ cán bộ hỗ trợ hiện dùng `OFFICER_ASSISTED_INTAKE_ENABLED` ở server, mặc định `false`, độc lập
với `ASSISTED_INTAKE_ROLES`. Cờ client không bao giờ là hàng rào bảo mật.

## 3. Sau khi deploy — kiểm ngay

- [ ] `/ke-khai` hiển thị **4 bước**, không phải 7.
- [ ] Kê khai thử một hồ sơ **tối thiểu** (phone + tên + 3 ảnh, bỏ trống mọi ô khác) → gửi được.
- [ ] Mở hồ sơ đó ở màn hình quản trị → bấm **Tiếp nhận chính thức** → phải **bị chặn** kèm danh
      sách thiếu sót. Đây là phép thử quan trọng nhất của cả đợt.
- [ ] Cán bộ nhận xử lý → màn hình hiển thị **tên** cán bộ, không phải email.
- [ ] Tra cứu công khai hồ sơ đó → thấy tên cán bộ, **không** thấy email.
- [ ] Đăng nhập cán bộ, mở `/ke-khai-ho` → có banner chế độ hỗ trợ.
- [ ] Đăng xuất, mở `/ke-khai-ho` → bị đá về trang chủ.
- [ ] Kiểm SQL: hồ sơ tạo ở `/ke-khai-ho` có `intake_channel = 'OFFICER_ASSISTED'` và đủ
      `assisted_by_email`, `assisted_by_display_name`, `assisted_at`.
- [ ] Kiểm SQL: hồ sơ tạo ở `/ke-khai` có `intake_channel = 'SELF_SERVICE'` và ba cột kia NULL.
- [ ] Gửi hồ sơ xong → màn hình **"KÊ KHAI THÀNH CÔNG"** giữa màn hình, có mã tiếp nhận, nút sao
      chép và nút kê khai tiếp.
- [ ] Bấm "Kê khai hồ sơ tiếp theo" → về **bước 1**, hồ sơ trống hoàn toàn, không còn ảnh hay dữ
      liệu hộ trước; mã vừa gửi vẫn đọc lại được ở dòng "Đã gửi trong phiên này". Nhập số điện
      thoại hộ mới rồi Tiếp tục → tạo được hồ sơ mới với mã khác.
      **Đây là phép thử của lỗi BLOCKER đã sửa** — trước đó nút này luôn trả 400.
- [ ] Kiểm SQL: `select count(*) from public.public_upload_attempts;` > 0 sau vài lượt tải ảnh, và
      không cột nào chứa tên tệp hay dữ liệu cá nhân.
- [ ] Chạy `npx tsx scripts/audit-orphan-public-files.ts` (chế độ khô) → kỳ vọng `DRIVE_ORPHAN = 0`.

## 4. Trước khi bật chuẩn hóa ảnh (đợt sau)

- [x] Phase 5 đã làm (bảng `public_upload_attempts`, telemetry, hai script vận hành).
- [ ] Chạy `npx tsx scripts/report-upload-performance.ts --days=7` để có số **trước** khi bật cờ.
- [ ] Chạy bộ kiểm chất lượng Q1–Q7 ở `evidence/PUBLIC_INTAKE_V2_UPLOAD_BENCHMARK.md` trên
      preview deployment với thiết bị thật.
- [ ] Điền bảng đo thời gian trước/sau trong file đó.
- [ ] Bật cờ cho **nhóm cán bộ test** trước, theo dõi ít nhất một ngày làm việc.
- [ ] Chỉ mở cho người dân khi Q1–Q4 đều PASS.

## 5. Rollback

| Vấn đề | Cách xử lý | Mất gì |
|---|---|---|
| Ảnh sau chuẩn hóa mờ/mất góc | Đặt cờ `false`, deploy lại | Không mất gì; HEIC vẫn chuyển JPEG như cũ |
| Wizard V2 có lỗi nghiêm trọng | `git revert` commit `fe3e2e3` | Quay lại 7 bước; dữ liệu nháp vẫn tương thích |
| Chế độ cán bộ có vấn đề | `git revert` commit `7345090`; giữ migration | Cột thừa vô hại |
| Cần rollback toàn bộ | Revert code trước, migration sau | Mất tên cán bộ đã nhận + nhãn nguồn của hồ sơ tạo sau deploy. **Không** mất dữ liệu kê khai, ảnh hay hồ sơ chính thức |

## 6. Việc còn nợ, đã ghi rõ ở `docs/brain/04-current-tasks.md`

- Đo hiệu năng thật — **hiện chưa có số nào, không được tuyên bố đã tăng tốc**. Hạ tầng đo đã có;
  còn thiếu đúng dữ liệu chạy thật.
- E2E chưa chạy lần nào.
- Xác nhận `ASSISTED_INTAKE_ROLES` đúng nghiệp vụ của phường (giả định: `INTAKE_OFFICER` là cán bộ
  một cửa).
- 5 phát hiện MEDIUM ở `PUBLIC_INTAKE_V2_DIFF_REVIEW.md`, đáng chú ý nhất là M-01 (phản hồi 308
  tiêu một lượt thử lại) — cần dữ liệu Phase 5 rồi mới chỉnh có căn cứ.

---

## 7. Release note — Bàn biên tập PL3 đầy đủ (PR #7, 2026-07-29)

### 7.1. THAY ĐỔI HÀNH VI — điều kiện tiếp nhận hồ sơ TỔ CHỨC chặt hơn

**Phải phổ biến cho cán bộ trước khi bật.** Trước đây `checkOwner` thoát sớm ở nhánh tổ chức, nên
một dòng chủ sử dụng là tổ chức chỉ cần mã số thuế và địa chỉ trụ sở là qua được cửa tiếp nhận.

Từ PR #7, mô hình dữ liệu tách đúng theo PL3: cột **F/G là tổ chức**, cột **H–L là người đại diện
theo pháp luật**. Vì vậy một dòng tổ chức nay **bắt buộc** phải có đủ:

| Cột | Trường | Ghi chú |
|---|---|---|
| F | Tên tổ chức | Mới — trước đây nằm chung ô họ tên |
| G | Số định danh tổ chức | Mã số thuế 10 số (hoặc kèm 3 số đơn vị trực thuộc) |
| H | Họ tên người đại diện | **Mới bắt buộc** |
| I | Ngày sinh người đại diện | **Mới bắt buộc** |
| J | Giới tính người đại diện | **Mới bắt buộc** |
| L | Địa chỉ thường trú | Trước là địa chỉ trụ sở, nay là của người đại diện |

**Tác động:** mọi hồ sơ tổ chức đang chờ tiếp nhận sẽ bị chặn cho tới khi cán bộ bổ sung thông tin
người đại diện. Đây là **chủ ý**, không phải lỗi — PL3 đòi các cột này.

**Việc cần làm trước khi bật:** rà danh sách hồ sơ tổ chức đang ở trạng thái chờ, báo trước cho cán
bộ để chuẩn bị thông tin người đại diện.

### 7.2. Bản ghi tổ chức cũ tự di trú khi sửa

Dòng tổ chức lưu **trước** migration `202607290002` giữ tên tổ chức ở ô họ tên. Khi cán bộ mở bàn
làm việc và sửa bất kỳ trường nào của dòng đó, hệ thống tự chuyển tên/mã số tổ chức sang cột F/G và
giải phóng ô H/K cho người đại diện. Cán bộ **không cần thao tác gì thêm**, chỉ cần điền tiếp.

Ngoại lệ có chủ ý: đổi cột M từ tổ chức sang cá nhân thì **không** di trú — hệ thống hiểu cán bộ
đang khẳng định ô họ tên vốn là tên người thật.

### 7.3. Ô lý do ghi đè không được chứa CCCD

Ba ô lý do ghi đè (cột B, cột V của từng thửa, cột AX) đi thẳng vào nhật ký audit, nên hệ thống
**từ chối lưu** nếu phát hiện chuỗi 12 số giống số định danh cá nhân (kể cả khi viết cách nhau bằng
dấu cách, chấm hoặc gạch). Cán bộ chỉ ghi lý do nghiệp vụ ngắn, ví dụ
*"Theo bản đồ địa chính đã đối chiếu"*.

Hồ sơ đã lưu trước khi có luật này cũng bị chặn ở bước tiếp nhận, kèm thông báo chỉ rõ ô nào.

### 7.4. Tài sản chưa gắn thửa: lưu được, không tiếp nhận được

Xóa một thửa đang có tài sản gắn vào thì tài sản tự về trạng thái chưa chọn thửa và **vẫn lưu được**
bản làm việc. Bước **tiếp nhận chính thức** sẽ chặn, kèm thông báo gọi đúng tên tài sản, ví dụ
*"Tài sản 2 (Công trình xây dựng khác — Nhà kho sau vườn) chưa chọn thửa đất"*.

### 7.5. File PL3 xuất ra thay đổi khi một thửa có nhiều tài sản

PL3 chỉ có **một** bộ 9 cột AO–AW cho mỗi thửa. Thửa có nhiều tài sản được gộp bằng `"; "` theo
đúng thứ tự tài sản ở cả 9 cột; ô trống ghi ký tự giữ chỗ `-` để các cột không lệch nhau.

```
AO = Nhà ở; Công trình xây dựng khác
AS = 100; 100          <- KHÔNG gộp trùng thành một giá trị
AT = 180; -            <- tài sản thứ hai không có diện tích sàn
```

Sheet **"Canh bao"** có một dòng nhắc mỗi thửa như vậy. Hồ sơ có 0 hoặc 1 tài sản trên mỗi thửa
(trường hợp áp đảo) xuất ra **giống hệt** trước đây.

### 7.6. Migration phải áp theo thứ tự

| Migration | Nội dung | Bắt buộc |
|---|---|---|
| `202607290002_full_pl3_editor.sql` | Thêm cột PL3 cho owner/parcel/asset + projection chính thức | Áp trước khi deploy code |
| `202607290003_drop_working_payload_override_columns.sql` | Gỡ 4 cột ghi đè song song trên `public_submissions` | Áp cùng đợt; idempotent, chạy được dù `202607290002` đã áp hay chưa |

Sau khi áp, chạy `npm run preflight:public-intake-v2-migrations` — script kiểm cả hai chiều: cột
PL3 phải **có**, và 4 cột ghi đè song song phải **không còn**.

**ĐÃ THỰC HIỆN 2026-07-29.** Cả hai migration đã áp lên database Supabase của dự án
(project `vzouriblxzjlfwtwhnkx`), mỗi file trong một transaction riêng:

```
[OK] 202607290002_full_pl3_editor.sql — 1384 ms
[OK] 202607290003_drop_working_payload_override_columns.sql — 226 ms
```

Preflight sau đó: **25/25 đạt, exit code 0**, gồm ba dòng của hạng mục này:

```
[OK] Có đủ cột lưu PL3 B–AX (202607290002) — OK
[OK] Index public_assets_parcel_idx tồn tại (202607290002) — OK
[OK] Đã gỡ cột ghi đè song song trên public_submissions (202607290003) — OK
```

Project **không có** bảng `supabase_migrations.schema_migrations` — các migration trước được áp thủ
công, nên hai file này cũng áp thủ công cho nhất quán (`npx tsx scripts/apply-pl3-editor-migrations.ts`).
Cả hai idempotent nên nếu sau này chuyển sang Supabase CLI, `db push` chạy lại là vô hại.

### 7.7. Rà soát tác động của §7.1 trên dữ liệu thật (2026-07-29)

| Chỉ số | Số lượng |
|---|---|
| Hồ sơ ở trạng thái chờ tiếp nhận | 13 |
| Trong đó có chủ sử dụng là **tổ chức** | **0** |
| **Sẽ bị chặn theo §7.1** | **0** |

Toàn bộ 13 dòng chủ sử dụng đều là `CA_NHAN`. Đã kiểm chứng ngược để loại trừ lỗi đọc payload:
13/13 hồ sơ parse được payload, 0 payload rỗng/hỏng.

**Kết luận: §7.1 không ảnh hưởng hồ sơ nào đang tồn tại.** Vẫn phải phổ biến cho cán bộ vì nó áp
dụng cho hồ sơ tổ chức **tạo mới** từ nay về sau.

Tái lập: `npx tsx scripts/survey-organisation-submissions.ts` (chỉ đọc, không in thông tin cá nhân).

`working_payload_json` là nguồn sự thật **duy nhất** cho mã ĐVHC ghi đè và tên file quét ghi đè.
Không khôi phục lại 4 cột đó dưới bất kỳ hình thức nào.
