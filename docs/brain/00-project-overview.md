# 00 — Project Overview

## Mục tiêu

Xây dựng web app thử nghiệm giúp cán bộ Phường Phong Châu tiếp nhận, kiểm tra và theo dõi hồ sơ đất đai trong đợt chiến dịch 180 ngày xây dựng CSDL đất đai. Hệ thống là công cụ thu thập và chuẩn hóa trung gian, **không** thay thế CSDL đất đai chuyên ngành và không tự xác nhận giá trị pháp lý của hồ sơ.

Mã nội bộ dự án: `land-ocr-180`.

## Người dùng chính

- `SYSTEM_ADMIN` — cấu hình hệ thống, quản lý người dùng, tích hợp, toàn bộ dữ liệu.
- `WARD_ADMIN` — quản lý hồ sơ của Phường Phong Châu.
- `INTAKE_OFFICER` — tạo hồ sơ, upload ảnh CCCD/GCN, xem hồ sơ được phân công.
- `REVIEW_OFFICER` — sửa, kiểm tra, xác nhận hồ sơ.
- `REPORT_VIEWER` — xem dashboard, xuất dữ liệu trong phạm vi được cấp.
- `AUDITOR` — xem audit log, không sửa dữ liệu.
- `POPULATION_MATCH_OFFICER` — giữ chỗ cho nâng cấp đối soát dân cư, chưa có UI/luồng ở MVP.

## Phạm vi

### Trong scope (bản thử nghiệm)

- Web app/PWA dùng trên máy tính, Android và iPhone, phạm vi Phường Phong Châu (10 tổ dân phố).
- Google Sign-In, allowlist người dùng (sheet `USERS`) và phân quyền theo vai trò.
- Tạo hồ sơ, lưu nháp, tiếp nhận và kiểm tra thủ công.
- Cặp ảnh CCCD mặt trước/mặt sau cho từng cá nhân (tối đa 10 người) và 1–10 ảnh GCN/bìa đỏ cho mỗi hồ sơ.
- Đọc QR CCCD trên thiết bị (client-side) để gợi ý nhập liệu; QR thất bại thì nhập tay.
- Nhập thủ công thông tin GCN cơ bản: số phát hành, ngày cấp, số vào sổ, chủ sử dụng, ghi chú.
- Lưu ảnh trong Google My Drive cá nhân của tài khoản quản trị; lưu dữ liệu cấu trúc trong Google Sheets.
- Tra cứu, dashboard theo tổ dân phố, xuất báo cáo và audit log append-only.
- **Quy mô mục tiêu: 20.000 hồ sơ** (nâng từ 500 vào 2026-07-22). Phương án đã chốt: giữ **một**
  spreadsheet, không sharding, sửa ba chỗ ở tầng truy cập dữ liệu — xem `03-decisions.md`.

### Đầu ra cuối cùng

`Tai lieu/PL3.xlsx` — **49 trường**, mỗi dòng là một (GCN × thửa × người), giá trị ghi bằng chữ
chứ không phải mã. Đây là đích thay cho bộ 15 trường của Phụ lục 8 (đổi ngày 2026-07-22). Bảng đối
chiếu 49 trường với nguồn dữ liệu trong hệ thống nằm ở Phụ lục của `PLAN2.md`.

Mã ĐVHC cấp xã của Phường Phong Châu: **`07954`**.

### Ngoài scope (bản thử nghiệm)

- OCR CCCD/GCN, Google Cloud Vision, parser/queue OCR. _(Từ 2026-07-22 có ngoại lệ: Gemini đọc ảnh
  GCN để **đối chiếu** với bản người dân khai — xem `03-decisions.md`. Ảnh CCCD vẫn không gửi đi
  đâu, chỉ đọc QR trên máy người dân.)_
- Ảnh CCCD mặt sau.
- Đối soát dân cư tự động hoặc kết nối CSDL đất đai quốc gia.
- PostgreSQL, Vercel Blob, Google Shared Drive, service account.
- Cung cấp dữ liệu cho người dân hoặc link Drive công khai.

## Điểm khác biệt / giá trị cốt lõi

Đây là kiến trúc thử nghiệm có chủ đích, ưu tiên triển khai nhanh và giữ ảnh gốc mà không cần OCR: dùng Google My Drive cá nhân của quản trị viên (không phải Shared Drive tổ chức) và Vercel làm nơi chạy frontend/backend. Đây là ngoại lệ so với phương án vận hành chính thức lâu dài, không phải kiến trúc mặc định cho quy mô lớn — xem hướng nâng cấp trong [`03-decisions.md`](03-decisions.md).

## Trạng thái dự án (2026-07-22)

**M0–M2 xong; cổng kê khai công khai `/ke-khai` đã chạy thật trên production.** Tạo nháp, autosave,
upload thẳng lên Drive và gửi hồ sơ đều ghi vào Google Sheets/Drive thật.

**Kế hoạch đang có hiệu lực là [`PLAN2.md`](../../PLAN2.md)** — khi nó mâu thuẫn với `PLAN.md`
(M0–M5) hay `PLAN_NL.md`, `PLAN2.md` thắng. Trạng thái chi tiết và danh sách chặn ở
[`04-current-tasks.md`](04-current-tasks.md).

Nguồn nghiệp vụ gốc cần giữ lại nguyên vẹn, không chỉnh sửa:

- `UB - KH chiến dịch 180 ngày XD CSDL đất đai.signed.pdf`
- `Phụ lục 8.docx` — bộ 15 trường, nay là bối cảnh lịch sử
- `PL3.xlsx` — **bộ 49 trường, đích xuất cuối cùng**
- `DS THAM CHIEU PHUTHO VINHPHUC HOABINH 25052026.pdf` — bảng tham chiếu tờ bản đồ trước/sau sáp nhập
