# PUBLIC INTAKE V2 — RELEASE CHECKLIST

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

Không thêm biến nào khác. Chế độ cán bộ hỗ trợ **không** có cờ bật/tắt — nó được bảo vệ bằng auth
thật, không phải bằng cờ; cờ client không bao giờ là hàng rào bảo mật.

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
