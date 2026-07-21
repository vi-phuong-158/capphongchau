# 04 — Current Tasks

> Cập nhật mỗi khi bắt đầu hoặc hoàn thành task. Agent đọc đây để biết được phép làm gì.
> Nguồn: `PLAN.md` (kế hoạch M0–M5 đầy đủ). File này là bản tóm tắt trạng thái, không thay thế `PLAN.md`.

---

## Đang làm

M2 đã hoàn thành và được kiểm tra build.

**Cổng kê khai công khai `/ke-khai` đã chạy thật**: tạo nháp, autosave, upload trực tiếp lên
Drive và gửi hồ sơ đều ghi vào Google Sheets + Google Drive thật. 7 tab `PUBLIC_*` đã được tạo
bằng `npm run migrate:public-intake` (idempotent, chỉ thêm tab mới — **chưa** đụng cột của
`CASES`/`CERTIFICATES`/`OWNERS`). Xem `PLAN_NL.md` (kế hoạch đầy đủ M3.5) và entry log
[2026-07-21] trong `06-ai-working-log.md`.

**Lớp biên — phần code đã xong (2026-07-22, nhánh `feat/edge-protection`):** Turnstile fail-closed
ở hai hành động `create`/`submit`, và chốt chặn `ORIGIN_SHARED_SECRET` ở `/api/public/*` +
`/ke-khai`. **Phần dashboard chưa làm và AI không làm được:** DNS proxy qua Cloudflare, SSL Full
(strict), Transform Rule gắn header `X-Origin-Auth`, cache rule bypass `/api/*` + `/ke-khai*`,
rate limiting rules, đặt biến môi trường mới trên Vercel, bật Deployment Protection cho Preview.
Chưa xong các mục đó thì chốt chặn ở origin **chưa bảo vệ được gì**.

**Chưa làm, bắt buộc trước khi mở công khai:** luồng truy cập lại bằng mã tiếp nhận + mã bí mật
(hiện `accessSecretMatches` là mã chết, `failedAttempts`/`lockedUntil` không ai ghi — người dân mất
cookie là mất bản khai), security headers, và toàn bộ đường cán bộ duyệt
(`/api/submissions/*` + acceptance saga).

Hạng mục tiếp theo theo kế hoạch là **M3** (tiếp nhận hồ sơ phía cán bộ, QR, upload) — phải làm
trước M3.5 để `modules/uploads` + `modules/media` được dùng chung, tránh hai đường upload.

### Chặn trước khi đưa cổng công khai vào dữ liệu thật

- **Danh mục trường 12 Phụ lục 8:** mã loại đất demo đã dùng Mục A, Phụ lục II Thông tư
  08/2024/TT-BTNMT; các mã nguồn gốc/hình thức/thời hạn là mã nội bộ có thể map lại. Trước dữ liệu
  thật vẫn cần đối chiếu danh mục trao đổi dữ liệu của Chi nhánh VPĐKĐĐ Phú Thọ.
- **Định nghĩa phân nhóm A/B/C/E** (KH 247/KH-UBND ngày 30/6/2026 của tỉnh) — ảnh hưởng schema và
  dashboard báo cáo, phải chốt trước migration.
- Ba việc cần người am hiểu nghiệp vụ, AI không làm thay: nội hàm trường 7 "vai trò pháp nhân";
  cách xử lý địa chỉ 2 cấp mới so với địa danh cũ in trên GCN; tỷ lệ GCN nhiều thửa ở Phong Châu
  (đếm trên ~30 GCN thật).

---

## Chờ làm (backlog)

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

- OCR CCCD/GCN, Google Cloud Vision — chưa trong scope MVP (xem `03-decisions.md`).
- PostgreSQL, Vercel Blob, Shared Drive, service account — kiến trúc đã chốt dùng My Drive + Sheets + Vercel.
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
