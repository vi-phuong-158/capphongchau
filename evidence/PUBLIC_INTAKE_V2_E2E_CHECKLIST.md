# PUBLIC INTAKE V2 — ĐIỀU KIỆN CHẠY E2E TRÊN PREVIEW

**`npm run test:e2e:preview` CHƯA CHẠY LẦN NÀO** trong phiên thi công. Không có Supabase preview,
Google Drive test hay tài khoản cán bộ thật trong môi trường này.

15 kịch bản (bảy kịch bản gốc §17.3 + ba kịch bản bổ sung E2E-08/09/10 tìm ra ở vòng rà soát bảo
mật lần hai) đã được **viết** ở `tests/e2e/public-intake-v2.spec.ts` và **liệt kê được**
(`npx playwright test --list` → 15 test trong 2 file). Viết được và liệt kê được **không phải** là
chạy đúng — đừng đọc nhầm hai chuyện đó.

## Hai trạng thái trong file spec — không còn `test.fixme` không điều kiện

Vòng rà soát trước để lại ba `test.fixme(true, ...)` không điều kiện ("cần tệp ảnh thật", "cần mô
phỏng đứt mạng") — tức là chưa ai kiểm được dù có credential hay không. Vòng này đã bỏ hết:

| Đánh dấu | Nghĩa | Playwright báo |
|---|---|---|
| không đánh dấu | Chạy ngay khi có đủ biến môi trường của `describe` bao ngoài | pass / fail thật |
| `test.skip(!BIẾN, lý_do)` | Thiếu ĐÚNG MỘT biến môi trường cụ thể | **skipped**, không phải passed |

Cách giải quyết ba kịch bản trước đây "cần tệp ảnh thật"/"cần mô phỏng đứt mạng":

- **Ảnh thật** → dùng fixture PNG 1×1 không PII đã có sẵn ở `tests/fixtures/` (`gcn.png`,
  `gcn-1.png`, `gcn-2.png`, `gcn-3.png`, `cccd-truoc.png`, `cccd-sau.png`). Đủ để trình duyệt và
  Drive xử lý được (định dạng PNG hợp lệ, `createImageBitmap` giải mã được) cho mục đích **nối
  dây** — không dùng được cho bộ kiểm chất lượng ảnh, xem `PUBLIC_INTAKE_V2_UPLOAD_BENCHMARK.md`.
- **Mô phỏng đứt mạng** → dùng `page.route()` của Playwright để `abort()` đúng một lần PUT
  resumable đầu tiên tới Drive (E2E-04) hoặc đúng một lần POST tạo hồ sơ đầu tiên (E2E-10), thay vì
  tắt mạng toàn thiết bị (không khả thi trong CI).

## Biến môi trường phải có

| Biến | Dùng để | Bắt buộc cho |
|---|---|---|
| `E2E_BASE_URL` | Trỏ Playwright vào preview deployment thật thay vì tự dựng `next dev` cục bộ | Toàn bộ chế độ preview (`playwright.config.ts`) |
| `E2E_PUBLIC_INTAKE_READY` | Công tắc xác nhận Supabase + Drive + Turnstile preview đã sẵn sàng | E2E-01, E2E-02, E2E-03, E2E-04, E2E-08, E2E-09, E2E-10 |
| `E2E_OFFICER_EMAIL` | Email tài khoản cán bộ có `INTAKE_OFFICER` (hoặc `WARD_ADMIN`/`SYSTEM_ADMIN`), **đã tồn tại và active trong `public.users`** | E2E-05, E2E-06b, E2E-07 |
| `E2E_REVIEWER_EMAIL` | Email tài khoản **chỉ** có `REVIEW_OFFICER`, active trong `public.users` | E2E-06c (kiểm 403) |
| `AUTH_SECRET` | Secret THẬT của preview — dùng để mã hóa cookie phiên đăng nhập test, xem mục "Đăng nhập" | E2E-05, E2E-06b, E2E-06c, E2E-07 |
| `E2E_SESSION_COOKIE_SECURE` | Ghi đè phát hiện tự động tên cookie phiên (`true`/`false`). Chỉ cần đặt khi test nhắm `next dev` cục bộ qua HTTP | Tùy chọn |
| `E2E_TEST_PHONE` | Số điện thoại dùng cho toàn bộ hồ sơ E2E tạo ra, mặc định `0912345678` nếu không đặt | `scripts/cleanup-e2e-preview-data.ts` (phải khớp `PHONE` trong file spec) |
| `SUPABASE_DATABASE_URL` | Cơ sở dữ liệu preview thật | Toàn bộ, cộng `preflight`/`cleanup`/`report`/`audit` script |
| `GOOGLE_DRIVE_CLIENT_ID`/`GOOGLE_DRIVE_CLIENT_SECRET`/`GOOGLE_DRIVE_REFRESH_TOKEN`/`GOOGLE_MY_DRIVE_ROOT_FOLDER_ID` | Kho Drive test riêng | E2E-01, E2E-03, E2E-04, E2E-09 |
| `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cặp khóa sandbox Cloudflare — dùng nguyên cặp trong `.env.example`, luôn pass | E2E-01, E2E-02, E2E-08, E2E-10 |

## Đăng nhập cán bộ trong test — không cần OAuth thật

`tests/e2e/auth-helpers.ts` mã hóa thẳng một cookie phiên hợp lệ bằng `@auth/core/jwt`.`encode()`
và `AUTH_SECRET` của preview, thay vì tự động hóa màn hình chọn tài khoản Google (thuộc domain
`accounts.google.com`, ngoài tầm kiểm soát của Playwright, và không nên có mật khẩu tài khoản test
thật lưu trong CI). Cookie tạo ra vẫn đi qua `requireActiveUser` thật ở server — email không có
trong `public.users` hoặc bị khóa vẫn bị từ chối đúng cách như một phiên thật.

**Điều kiện:** `E2E_OFFICER_EMAIL`/`E2E_REVIEWER_EMAIL` phải là email của tài khoản **đã tồn tại
và `active = true`** trong bảng `users` của preview — helper chỉ tạo được cookie hợp lệ về mặt mã
hóa, không tự tạo tài khoản.

## Dữ liệu test phải chuẩn bị

1. **Fixture ảnh** — đã có sẵn ở `tests/fixtures/` (PNG 1×1, tạo bằng `base64` trong phiên rà soát
   này, không cần tạo lại).
2. **Ba tài khoản** trong `public.users` của preview, `active = true`:
   - một chỉ `INTAKE_OFFICER` (hoặc `WARD_ADMIN`/`SYSTEM_ADMIN`) → `E2E_OFFICER_EMAIL`;
   - một **chỉ** `REVIEW_OFFICER`, không kèm vai trò nào khác → `E2E_REVIEWER_EMAIL`;
   Đặt `display_name` là **tên người**, không phải email — E2E-07 kiểm đúng điều đó (H-04).
3. **Bốn migration đã chạy và preflight PASS** trên preview — xem
   `PUBLIC_INTAKE_V2_PREVIEW_MIGRATION_RUNBOOK.md`. Thiếu chúng thì gần như mọi test 500 chứ không
   fail vì lý do nghiệp vụ.
4. **Một thư mục Drive test riêng.** E2E tạo hồ sơ và tải ảnh thật; đừng trỏ vào kho production.
5. **`OFFICER_ASSISTED_INTAKE_ENABLED=true`** trên preview nếu muốn chạy E2E-06b/E2E-06c — kill
   switch server-side mặc định tắt (xem `docs/brain/03-decisions.md` [2026-07-28]).

## Trước khi chạy

```bash
npx playwright install chromium
```

```bash
E2E_BASE_URL="https://<preview-domain>" \
E2E_PUBLIC_INTAKE_READY=1 \
E2E_OFFICER_EMAIL="canbo-test@phongchau.gov.vn" \
E2E_REVIEWER_EMAIL="tham-dinh-test@phongchau.gov.vn" \
AUTH_SECRET="<AUTH_SECRET thật của preview>" \
npm run test:e2e:preview
```

`E2E_BASE_URL` đặt thì `playwright.config.ts` **không** tự dựng `next dev` cục bộ nữa (`webServer`
bị bỏ qua) — trỏ thẳng vào preview deployment. Domain đó phải đã có Cloudflare đứng trước, vì cổng
công khai đòi header `X-Origin-Auth` mà chỉ Cloudflare gắn được (`edge-guard.ts`).

Không đặt `E2E_BASE_URL` thì giữ hành vi cũ: tự dựng `next dev` cục bộ ở cổng 3001, chỉ chạy được
`tests/e2e/home.spec.ts` (không cần credential); mọi test trong `public-intake-v2.spec.ts` tự
`skip` vì thiếu các biến ở trên.

## Sau khi chạy — phải kiểm bằng mắt, spec không thay được

- Ảnh sau chuẩn hóa còn đọc được chữ trên bìa GCN không (bộ kiểm ở
  `PUBLIC_INTAKE_V2_UPLOAD_BENCHMARK.md`, mục "Bảng so sánh nguồn ↔ sau chuẩn hóa"). Không test tự
  động nào chứng minh được điều này — fixture PNG 1×1 của E2E không mang chữ để đọc.
- Ma trận thiết bị di động §17.4 — cần máy thật, không dùng emulator.
- Số đo trong `public.public_upload_attempts` sau vài lượt kê khai:
  `npx tsx scripts/report-upload-performance.ts --days=1` — đối chiếu với cảm nhận thực tế.
- `npx tsx scripts/audit-orphan-public-files.ts` (chế độ khô) sau đợt E2E — E2E-09 đã tự kiểm
  `MISSING_ON_DRIVE` không tăng, nhưng vẫn nên đọc log đầy đủ bằng mắt một lần.

## Sau khi xong — dọn dữ liệu

```bash
npm run cleanup:e2e-preview-data                                    # chạy khô, chỉ liệt kê
npm run cleanup:e2e-preview-data -- --apply --confirm=<token>       # xóa hồ sơ + bảng con
npx tsx scripts/audit-orphan-public-files.ts --apply --confirm=<token>  # dọn nốt Drive
```

Mọi hồ sơ E2E tạo ra dùng chung số điện thoại `E2E_TEST_PHONE` (mặc định `0912345678`) — đó là
nhãn nhận diện để dọn dẹp, thay cho "tiền tố mã tiếp nhận" (không khả thi vì mã tiếp nhận do máy
chủ sinh bằng HMAC, client không đặt được tiền tố). **Không xóa dữ liệu ngoài các hồ sơ mang số
điện thoại này** — script tự động chỉ nhắm đúng phạm vi đó.
