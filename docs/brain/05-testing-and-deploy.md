# 05 — Testing & Deploy

> Mọi lệnh để dựng môi trường, chạy, test, build, deploy. Agent đọc đây thay vì đoán lệnh.
>
> **Trạng thái hiện tại (2026-07-22): M0–M2 xong, cổng kê khai công khai M3.5 đã chạy thật.**
> Kho Google đã bootstrap; `npm run dev`, `build`, `lint`, `test` đều chạy được. Phần code của lớp
> biên (Turnstile + chốt chặn Cloudflare) đã có; phần cấu hình dashboard Cloudflare/Vercel chưa làm.

## Cài đặt môi trường local

```powershell
npm install
```

Trong PowerShell có execution policy chặn `npm.ps1`, dùng `npm.cmd` thay cho `npm`.

Sao chép `.env.example` thành `.env.local` và thay toàn bộ placeholder bằng secret/ID thật. Không commit `.env.local`. Next.js và bootstrap CLI đều tự nạp `.env.local`. Validation server (`loadServerEnvironment`) từ chối cấu hình thiếu/sai và chỉ nêu tên biến lỗi, không in secret.

Biến môi trường cần thiết (xem đầy đủ trong `01-architecture.md`):

```
APP_BASE_URL, AUTH_SECRET, AUTH_GOOGLE_CLIENT_ID, AUTH_GOOGLE_CLIENT_SECRET,
GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN,
GOOGLE_MY_DRIVE_ROOT_FOLDER_ID, GOOGLE_SHEETS_SPREADSHEET_ID,
SYSTEM_ADMIN_EMAIL, DATA_HASH_PEPPER, MAX_UPLOAD_MB, VERCEL_REGION,
PUBLIC_SESSION_SECRET, PUBLIC_ACCESS_CODE_PEPPER,
ORIGIN_SHARED_SECRET, NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY
```

Ở máy local, dùng đúng cặp khóa thử nghiệm chính thức của Cloudflare cho Turnstile
(`1x00000000000000000000AA` và `1x0000000000000000000000000000000AA`) — chúng luôn pass nên mã
nguồn không cần bất kỳ nhánh bypass nào cho dev. `ORIGIN_SHARED_SECRET` chỉ được kiểm khi
`NODE_ENV=production`, nhưng vẫn phải có giá trị hợp lệ, nếu không `build` sẽ dừng.

## Bootstrap My Drive và Google Sheets (chạy một lần)

1. Trong `.env.local`, đặt `GOOGLE_DRIVE_CLIENT_ID` và `GOOGLE_DRIVE_CLIENT_SECRET` của OAuth client **Desktop bootstrap**; giữ `SYSTEM_ADMIN_EMAIL=anmphongandn@gmail.com`. Có thể để trống refresh token và hai ID kho dữ liệu ở lần chạy đầu.
2. Chạy `npm run bootstrap:google`. Trình duyệt sẽ mở trang Google OAuth; đăng nhập đúng tài khoản quản trị và chấp thuận scope `drive.file`.
3. Script tạo hoặc dùng lại cây `CSDL-DAT-DAI-PHONG-CHAU-THU-NGHIEM`, spreadsheet cùng 14 tab, seed 10 tổ dân phố và `SYSTEM_ADMIN`. Không tạo thủ công các file/folder này trong Drive UI.
4. Sao chép `rootFolderId` và `spreadsheetId` từ `.bootstrap-state.json` sang `GOOGLE_MY_DRIVE_ROOT_FOLDER_ID` và `GOOGLE_SHEETS_SPREADSHEET_ID`; chuyển refresh token từ `.bootstrap-secrets.json` sang `GOOGLE_DRIVE_REFRESH_TOKEN`, rồi xóa `.bootstrap-secrets.json` khỏi máy. Không gửi hay commit các giá trị này.
5. Khởi động `npm run dev`, gọi `GET http://localhost:3000/api/health/google`; kết quả `status: "ok"` xác nhận OAuth, Drive và schema Sheets. Endpoint này chỉ cần năm biến `GOOGLE_*` của kho dữ liệu, nên có thể chạy trước M2.

`.bootstrap-state.json` và `.bootstrap-secrets.json` đã bị `.gitignore`; tệp thứ hai chứa refresh token và chỉ được dùng tạm trong bước bootstrap.

## Chạy local (dev)

```powershell
npm run dev
```

Truy cập: `http://localhost:3000`

## Build (production)

```powershell
npm run build
```

## Test

```powershell
npm run lint
npm run format:check
npm run test
npm run test:e2e
```

Vitest đã có test scaffold. Playwright có smoke test trang khởi tạo; môi trường Windows hiện tại đã chạy assertion thành công nhưng runner không tự dừng Next dev server trước giới hạn lệnh, cần kiểm tra lại khi chạy ngoài môi trường agent/CI.

Checklist thủ công trước khi commit/push (theo `AGENTS.md` §7.2 — Definition of Done):

- [ ] TypeScript strict, có validation và xử lý lỗi.
- [ ] Có kiểm tra quyền và audit log cho thao tác write/nhạy cảm.
- [ ] Không lộ PII, token, QR raw hoặc link Drive trong log.
- [ ] Không tạo case/file trùng khi upload hoặc gửi lại request (idempotency).
- [ ] Không thể tải trùng một mặt CCCD của cùng người nếu chưa thực hiện thao tác thay ảnh; thay ảnh chỉ chuyển ảnh cũ sang `REPLACED` sau khi ảnh mới xác minh thành công.
- [ ] Ảnh gốc không đi qua body của Vercel Function.
- [ ] Email ngoài `USERS` bị từ chối dù đăng nhập Google thành công.
- [ ] QR thất bại không làm mất hồ sơ.

## Deploy

Kế hoạch (M5 trong `PLAN.md`): Deploy Preview trên Vercel bằng dữ liệu giả trước, sau đó Production tại region `sin1`. OAuth consent screen phải chuyển sang `In production` trước khi dùng dữ liệu thật. Thí điểm tuần tự: 20 hồ sơ giả/ẩn danh → 100 hồ sơ thật → tối đa 500 hồ sơ.

### Cấu hình Cloudflare (làm trong dashboard, trước khi deploy code lớp biên)

Thứ tự quan trọng: cấu hình Cloudflare **trước**, deploy code **sau**. Làm ngược thì trong khoảng
giữa cổng công khai trả 404/403 cho mọi người.

1. Turnstile → tạo widget chế độ **Managed**, lấy site key + secret key.
2. DNS trỏ domain về Vercel, bật **proxy** (mây cam). SSL/TLS đặt **Full (strict)** — chế độ
   Flexible gây vòng lặp chuyển hướng với Vercel.
3. **Transform Rule** (Modify Request Header): thêm `X-Origin-Auth` mang giá trị
   `ORIGIN_SHARED_SECRET` vào mọi request. Thiếu bước này thì origin từ chối toàn bộ cổng công khai.
4. **Cache Rule**: bypass cache cho `/api/*` và `/ke-khai*`. Không bật "Cache Everything" hay
   Automatic Platform Optimization — một trang nháp bị cache là lộ PII sang người khác.
5. **Rate limiting** theo bảng `PLAN_NL` §10.2 (`/api/public/*` 120 req/10 phút/IP;
   `/api/public/submissions/access` 10 req/10 phút/IP; POST tạo nháp 5 req/giờ/IP). Bật chế độ
   **Log** trước, quan sát rồi mới chuyển Block. Kiểm số rule gói hiện tại cho phép trước khi
   thiết kế — gói Free thường chỉ được một rule.
6. Vercel: đặt `ORIGIN_SHARED_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`
   cho **cả Production lẫn Preview**; bật Deployment Protection cho Preview.

Nghiệm thu bắt buộc (`PLAN_NL` §11):

- [ ] `curl -X POST https://<project>.vercel.app/api/public/submissions` → **403**.
- [ ] Cùng request qua domain thật → chạy bình thường.
- [ ] `curl -I https://<domain>/ke-khai` → `CF-Cache-Status` không bao giờ là `HIT`.
- [ ] Turnstile: token rỗng → 403; token gửi lại lần hai → 403; chặn mạng tới siteverify → 403.
- [ ] Cán bộ vẫn đăng nhập được và `/ke-khai` không bị đá về trang chủ.

## Môi trường

| Môi trường | Branch           | URL                                    |
| ---------- | ---------------- | -------------------------------------- |
| Production | `main` (dự kiến) | _(cần bổ sung sau khi deploy lần đầu)_ |
| Local      | —                | _(cần bổ sung sau M0)_                 |

## Lưu ý

- Giới hạn quy mô bản thử nghiệm: tối đa 500 hồ sơ.
- Upload file gốc giới hạn 30 MB/file (`MAX_UPLOAD_MB`), preview tối đa 2.5 MB.
- OAuth app ở trạng thái `Testing` có thể khiến refresh token Drive hết hạn sau 7 ngày — phải chuyển `In production` trước khi dùng dữ liệu thật.
- Vercel Cron tạo snapshot hằng ngày trong `99_BACKUP` — đây là copy **trong cùng tài khoản**, không bảo vệ khỏi việc tài khoản `anmphongandn@gmail.com` bị khóa/mất quyền truy cập (single point of failure, xem `01-architecture.md` và `03-decisions.md`). Cần thêm export Google Sheets định kỳ ra ngoài tài khoản gốc, và bản backup mã hóa ngoại tuyến hằng tuần phải tách khỏi tài khoản này.
- Chỉ dùng dữ liệu giả/ẩn danh cho test tự động và môi trường Preview.
