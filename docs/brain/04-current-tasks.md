# 04 — Current Tasks

> Cập nhật mỗi khi bắt đầu hoặc hoàn thành task. Agent đọc đây để biết được phép làm gì.
> Nguồn: `PLAN.md` (kế hoạch M0–M5 đầy đủ). File này là bản tóm tắt trạng thái, không thay thế `PLAN.md`.

---

## Đang làm

M1 đang thực hiện. Đã hoàn thành Task 5–7 (tạo Google Cloud Project, bật Google Drive API/Google Sheets API, cấu hình OAuth và tạo hai OAuth client); tiếp theo là viết bootstrap CLI.

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

- **Mô tả:** Google Sign-In, middleware kiểm tra `USERS`/role, trang quản trị `USERS`, seed `SYSTEM_ADMIN` đầu tiên, audit log cho hành vi liên quan tài khoản.
- **Liên quan:** module `auth`, `users`, `audit`.
- **Ưu tiên:** Cao.

### M3: Tiếp nhận hồ sơ, QR và upload

- **Mô tả:** Form mobile-first tạo hồ sơ, upload 1 CCCD + 1–10 GCN, đọc QR client-side, resumable upload, lưu nháp, chuyển trạng thái DRAFT → UPLOADED.
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
- Ảnh CCCD mặt sau — chủ động không thu thập.
- Cung cấp dữ liệu công khai hoặc link Drive công khai — vi phạm nguyên tắc bảo mật của dự án.

---

## Đã hoàn thành gần đây

- [2026-07-21] Hoàn thành M1 Task 5: tạo Google Cloud Project dưới tài khoản `anmphongandn@gmail.com`; Project ID: `resolute-future-478306-e7`. Chưa bật API, chưa tạo OAuth client hoặc secret.
- [2026-07-21] Hoàn thành M1 Task 6: bật `drive.googleapis.com` và `sheets.googleapis.com` trong Project ID `resolute-future-478306-e7`. Chưa tạo OAuth client, API key hoặc secret.
- [2026-07-21] Hoàn thành M1 Task 7: cấu hình Google Auth Platform ở chế độ External/Testing và tạo OAuth client Web + Desktop bootstrap. Chỉ đăng ký URL local; URL Vercel và chuyển Production còn chờ deploy/rà soát trước pilot dữ liệu thật.
- [2026-07-21] Hoàn thành M0 Task 2: tạo Next.js App Router + TypeScript strict, PWA online-only, Tailwind, ESLint/Prettier, Vitest và Playwright; build/typecheck/unit test đạt.
- [2026-07-21] Hoàn thành M0 Task 3: tạo khung module domain, repository và hợp đồng dữ liệu; `DataRepository`/`StorageRepository` tách khỏi service/frontend.
- [2026-07-21] Hoàn thành M0 Task 4: thêm `.env.example`, validation server không lộ secret và payload lỗi API thống nhất.
- [2026-07-21] Hoàn thành M0 Task 1: đồng bộ `AGENTS.md`, `README.md`, `docs/architecture.md` và tài liệu brain theo PLAN đã rà soát (online-only, HEIC/HEIF, `drive.file` bootstrap, idempotency, an toàn thay/xóa file, backup và PII).
- [2026-07-21] Hoàn tất tài liệu kiến trúc và kế hoạch: `README.md`, `AGENTS.md`, `PLAN.md`, `docs/architecture.md`.
- [2026-07-21] Khởi tạo bộ não dự án AI dùng chung: `CLAUDE.md`, `docs/brain/00-06` (merge với `AGENTS.md` hiện có, không ghi đè).
