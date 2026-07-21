# 05 — Testing & Deploy

> Mọi lệnh để dựng môi trường, chạy, test, build, deploy. Agent đọc đây thay vì đoán lệnh.
>
> **Trạng thái hiện tại: M1 đang hoàn thiện.** Bootstrap Google và health check đã có mã nguồn; chưa tạo kho dữ liệu thật cho đến khi OAuth client secret được đặt an toàn trong `.env.local`.

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
SYSTEM_ADMIN_EMAIL, DATA_HASH_PEPPER, MAX_UPLOAD_MB, VERCEL_REGION
```

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
