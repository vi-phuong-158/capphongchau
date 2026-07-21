# CSDL đất đai Phường Phong Châu — Bản thử nghiệm

Web app hỗ trợ tiếp nhận, kiểm tra và theo dõi hồ sơ đất đai trong đợt 180 ngày tại Phường Phong Châu.

> Đây là hệ thống thu thập và chuẩn hóa trung gian; không thay thế cơ sở dữ liệu đất đai chuyên ngành và không tự xác nhận giá trị pháp lý của hồ sơ.

## Trạng thái

M1 đang hoàn thiện: nền Next.js/PWA, module boundary, validation môi trường, bootstrap Google My Drive/Sheets và health check đã sẵn sàng. Cần chạy bootstrap với OAuth client secret được giữ cục bộ trước khi kho dữ liệu thật được tạo; luồng nghiệp vụ sẽ triển khai theo các mốc tiếp theo trong [PLAN.md](PLAN.md).

## Phạm vi bản thử nghiệm

- Dùng tại Phường Phong Châu, gồm 10 tổ dân phố.
- Một ảnh CCCD mặt trước và từ 1–10 ảnh GCN/bìa đỏ cho mỗi hồ sơ.
- Đọc QR CCCD ngay trên thiết bị; cán bộ xác nhận hoặc nhập tay kết quả.
- Chuyển HEIC/HEIF sang JPEG ngay trên thiết bị khi cần; PWA hoạt động online-only.
- Lưu ảnh trong Google My Drive của tài khoản quản trị.
- Lưu dữ liệu có cấu trúc, người dùng và audit log trong Google Sheets.
- Frontend và API cùng chạy trên Vercel, ưu tiên region Singapore (`sin1`).
- Chưa có OCR CCCD/GCN, Google Vision, đối soát dân cư hoặc PostgreSQL.

## Kiến trúc

```mermaid
flowchart LR
    U[Cán bộ] --> W[Next.js PWA trên Vercel]
    W --> A[Google Sign-In + USERS]
    W --> S[Google Sheets]
    W --> D[Google My Drive]
    U --> Q[QR CCCD tại thiết bị]
    Q --> W
```

Tài khoản `anmphongandn@gmail.com` sở hữu My Drive, spreadsheet, Google Cloud Project và là `SYSTEM_ADMIN` đầu tiên. Ứng dụng dùng OAuth với quyền `drive.file`; không dùng service account hoặc mật khẩu Google. Cây thư mục Drive phải được bootstrap bằng cùng OAuth client với ứng dụng, không tạo thủ công qua Drive UI.

## Tài liệu

- [Kế hoạch triển khai](PLAN.md)
- [Kiến trúc chi tiết](docs/architecture.md)
- [Chỉ dẫn cho coding agent](AGENTS.md)

## Nguyên tắc bảo mật

- Không commit `.env`, token OAuth, ảnh CCCD/GCN thật hoặc fixture chứa dữ liệu thật.
- Không tạo link Drive công khai; Drive ở chế độ `Restricted`.
- Không ghi CCCD đầy đủ, payload QR, URL upload hoặc token vào log.
- Bản thử nghiệm tối đa 500 hồ sơ. Trước khi mở rộng cần đánh giá migration sang Shared Drive/kho lưu trữ của cơ quan.
- Backup Drive trong cùng Gmail không đủ: cần export Sheets định kỳ ra nơi tách biệt và backup mã hóa ngoại tuyến.

## Khởi tạo sau khi có mã nguồn

1. Đã tạo Google Cloud Project, bật Google Drive API/Google Sheets API và khai báo scope `drive.file`.
2. Đặt OAuth client secret Desktop bootstrap trong `.env.local` (không commit), rồi chạy `npm run bootstrap:google` để tạo cấu trúc My Drive, spreadsheet, `REQUEST_LOG` và dữ liệu danh mục.
3. Sao chép các ID và refresh token do bootstrap tạo vào `.env.local`; gọi `GET /api/health/google` để xác minh.
4. Khi deploy, thêm redirect URI Vercel và các biến môi trường tương ứng; chuyển OAuth consent screen sang `In production` trước khi dùng dữ liệu thật.
5. Thử nghiệm bằng dữ liệu giả trước; trước pilot dữ liệu thật, chốt cơ sở pháp lý, thời hạn lưu trữ và quy trình xử lý yêu cầu dữ liệu cá nhân.
