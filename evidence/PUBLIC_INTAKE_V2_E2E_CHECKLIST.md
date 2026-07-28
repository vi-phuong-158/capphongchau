# PUBLIC INTAKE V2 — ĐIỀU KIỆN CHẠY E2E

**`npm run test:e2e` CHƯA CHẠY LẦN NÀO** trong phiên thi công. Không có credential Supabase,
Google Drive hay tài khoản cán bộ trong môi trường này.

Bảy kịch bản §17.3 đã được **viết** ở `tests/e2e/public-intake-v2.spec.ts` và **liệt kê được**
(`npx playwright test --list` → 12 test trong 2 file). Viết được và liệt kê được **không phải** là
chạy đúng — đừng đọc nhầm hai chuyện đó.

## Ba trạng thái trong file spec, phân biệt có chủ đích

| Đánh dấu | Nghĩa | Playwright báo |
|---|---|---|
| không đánh dấu | Chạy ngay khi có đủ biến môi trường | pass / fail thật |
| `test.skip(...)` | Thiếu biến môi trường | **skipped**, không phải passed |
| `test.fixme(...)` | Đã viết mã, cần tệp ảnh thật hoặc mô phỏng đứt mạng ở tầng thiết bị; chưa ai chạy | **không tính là pass** |

Phân biệt này để `0 failed` không bao giờ bị đọc thành "đã kiểm hết".

## Biến môi trường phải có

| Biến | Dùng để | Bắt buộc cho |
|---|---|---|
| `E2E_PUBLIC_INTAKE_READY` | Công tắc xác nhận môi trường đã sẵn sàng | E2E-01, E2E-02 |
| `E2E_OFFICER_EMAIL` | Tài khoản cán bộ có `INTAKE_OFFICER` (hoặc quản trị) | E2E-05, E2E-06, E2E-07 |
| `E2E_REVIEWER_EMAIL` | Tài khoản **chỉ** có `REVIEW_OFFICER` | E2E-06 (kiểm 403) |
| `SUPABASE_DB_URL` | Cơ sở dữ liệu thật | tất cả |
| `GOOGLE_*` (theo `docs/brain/05-testing-and-deploy.md`) | Drive thật | E2E-01, E2E-03 |
| `TURNSTILE_SECRET_KEY` + site key test | Vượt cổng bot | E2E-01, E2E-02 |
| `AUTH_SECRET`, cấu hình next-auth | Đăng nhập cán bộ | E2E-05, E2E-06, E2E-07 |

## Dữ liệu test phải chuẩn bị

1. **Ảnh mẫu** ở `tests/fixtures/`: `gcn.jpg`, `gcn-1.jpg`, `gcn-2.jpg`, `gcn-3.jpg`,
   `cccd-truoc.jpg`, `cccd-sau.jpg`. **Không được dùng ảnh giấy tờ thật của người dân** (kế hoạch
   §8.1) — dùng bản in mẫu hoặc ảnh dựng. Thư mục này chưa tồn tại, phải tự tạo.
2. **Ba tài khoản** trong `public.users`, `active = true`:
   - một chỉ `INTAKE_OFFICER`;
   - một chỉ `REVIEW_OFFICER` (để chứng minh 403);
   - một `WARD_ADMIN` để quyết định tiếp nhận.
   Đặt `display_name` là **tên người**, không phải email — E2E-07 kiểm đúng điều đó.
3. **Bốn migration đã chạy trên môi trường test.** Thiếu chúng thì gần như mọi test 500 chứ không
   fail vì lý do nghiệp vụ; xem `PUBLIC_INTAKE_V2_MIGRATION_REVIEW_V2.md`.
4. **Một thư mục Drive test riêng.** E2E tạo hồ sơ và tải ảnh thật; đừng trỏ vào kho production.

## Trước khi chạy

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

Playwright tự dựng dev server ở cổng 3001 (`playwright.config.ts`), nên **không** chạy `npm run dev`
song song.

## Sau khi chạy — phải kiểm bằng mắt, spec không thay được

- Ảnh sau chuẩn hóa còn đọc được chữ trên bìa GCN không (bộ Q1–Q7 ở
  `PUBLIC_INTAKE_V2_UPLOAD_BENCHMARK.md`). Không test tự động nào chứng minh được điều này.
- Ma trận thiết bị di động §17.4 — cần máy thật, không dùng emulator.
- Số đo trong `public.public_upload_attempts` sau vài lượt kê khai: chạy
  `npx tsx scripts/report-upload-performance.ts --days=1` và đối chiếu với cảm nhận thực tế.
- Chạy `npx tsx scripts/audit-orphan-public-files.ts` (chế độ khô) sau đợt E2E: kỳ vọng
  `DRIVE_ORPHAN = 0`. Khác 0 nghĩa là đường dọn dẹp ở complete route có lỗ.
