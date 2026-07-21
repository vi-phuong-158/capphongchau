# Kế hoạch thử nghiệm Phường Phong Châu — My Drive cá nhân + Vercel

## 1. Mục tiêu và phạm vi

Xây dựng web app thử nghiệm cho Phường Phong Châu để tiếp nhận và quản lý hồ sơ đất đai. Ứng dụng triển khai toàn bộ frontend và backend trên Vercel; Google My Drive cá nhân lưu ảnh, Google Sheets lưu dữ liệu có cấu trúc.

Tài khoản `anmphongandn@gmail.com` là chủ sở hữu My Drive, Google Sheet, Google Cloud Project và tài khoản `SYSTEM_ADMIN` đầu tiên của ứng dụng.

Phạm vi MVP:

- Một cặp ảnh CCCD mặt trước/mặt sau cho mỗi cá nhân, tối đa 10 cá nhân mỗi bản kê khai.
- Từ 1 đến 10 ảnh GCN/bìa đỏ.
- Đọc QR CCCD trên thiết bị; QR thất bại thì nhập tay.
- Nhập thủ công thông tin GCN cơ bản.
- Tìm kiếm, dashboard theo tổ dân phố, xuất CSV và audit log.
- Chưa triển khai OCR cho CCCD hoặc GCN.
- Chưa dùng PostgreSQL, Vercel Blob hoặc dịch vụ dữ liệu khác.

Mười tổ dân phố cố định: Hà Thạch, Lũng Thượng, Phú An, Phú Cường, Phú Điền, Phú Hộ, Phú Lợi, Phú Xuân, Phúc Lợi và Thống Nhất.

Giới hạn vận hành của bản thử nghiệm là khoảng 500 hồ sơ. Trước khi mở rộng phải đánh giá lại My Drive và vị trí backend.

## 2. Quyết định kiến trúc

### 2.1. Ứng dụng

- Next.js App Router, TypeScript strict, PWA và API Route Handlers.
- Triển khai Vercel vùng `sin1` (Singapore).
- Dùng Tailwind CSS, Zod, Auth.js/Google OAuth, Google API Node client, `@zxing/browser`, Vitest và Playwright.
- Dùng `heic2any` hoặc `libheif-js` (WASM, chạy client-side) để chuyển HEIC/HEIF sang JPEG trên thiết bị trước khi upload — trình duyệt (kể cả Safari) không tự giải mã HEIC trong canvas/`<img>`.
- PWA hoạt động **online-only** ở bản thử nghiệm: không cam kết soạn nháp/upload khi mất mạng. Mất kết nối giữa chừng phải báo lỗi rõ ràng cho cán bộ, không được âm thầm mất dữ liệu đã nhập.
- Duy trì hai abstraction bắt buộc:
  - `DataRepository`: đọc/ghi Google Sheets.
  - `StorageRepository`: thao tác My Drive.
- Service nghiệp vụ và component frontend không được gọi trực tiếp Google Drive/Sheets API.

### 2.2. Google OAuth và quyền truy cập

- Luồng đăng nhập cán bộ chỉ yêu cầu `openid`, `email`, `profile`.
- Luồng kết nối kho dữ liệu của quản trị viên dùng OAuth `drive.file` với `access_type=offline`.
- Không dùng service account: service account không thể sở hữu file trong My Drive cá nhân.
- Không lưu mật khẩu Google. Refresh token chỉ tồn tại trong Vercel Environment Variables phía server.
- OAuth app phải chuyển sang `In production` trước khi vận hành, nếu để `Testing` refresh token Drive có thể hết hạn sau bảy ngày.
- Người dùng chỉ được vào hệ thống nếu email có trong sheet `USERS` và `active=true`.

### 2.3. My Drive

```text
CSDL-DAT-DAI-PHONG-CHAU-THU-NGHIEM/
├── 00_CONFIG/
├── 01_INBOX/
├── 02_CASES/
│   ├── HA_THACH/
│   │   └── PHONGCHAU-2026-000001/
│   │       ├── originals/
│   │       └── previews/
│   └── ...
├── 03_EXPORTS/
└── 99_BACKUP/
```

- My Drive và toàn bộ file phải ở chế độ `Restricted`; không tạo link công khai.
- Không chia sẻ thư mục gốc cho cán bộ. Cán bộ chỉ truy cập thông qua ứng dụng và phân quyền trong `USERS`.
- Ảnh gốc được giữ nguyên. Trình duyệt tạo thêm ảnh xem trước JPEG tối đa 2.5 MB để giao diện có thể hiển thị qua Vercel.
- File được tải trực tiếp từ trình duyệt lên Google Drive qua resumable upload; Vercel chỉ tạo phiên upload và xác minh kết quả.
- URL phiên upload không được ghi log. Backend phải kiểm tra thư mục cha, kích thước, checksum và metadata trước khi xác nhận file.
- `file_id` nội bộ tách khỏi `drive_file_id`, để có thể sao chép dữ liệu sang Shared Drive sau này mà không phá liên kết nghiệp vụ.
- **Ràng buộc scope `drive.file`:** app chỉ nhìn thấy file/thư mục do chính OAuth client của app tạo ra. Cây thư mục gốc (`CSDL-DAT-DAI-PHONG-CHAU-THU-NGHIEM/...`) **bắt buộc phải được tạo bởi bootstrap CLI chạy với cùng OAuth client dùng ở production** — không được tạo thủ công qua Drive UI rồi lấy `folder_id` gán vào `GOOGLE_MY_DRIVE_ROOT_FOLDER_ID`, vì khi đó app sẽ không có quyền ghi vào thư mục đó.

### 2.4. QR CCCD

- Đọc QR hoàn toàn trên thiết bị với `@zxing/browser`.
- Thử ảnh gốc và các hướng xoay 0, 90, 180, 270 độ.
- Chỉ chấp nhận CCCD 12 chữ số và ngày hợp lệ.
- Hiển thị kết quả cho cán bộ xác nhận; QR không tự ghi đè dữ liệu đã nhập/sửa thủ công.
- Không lưu chuỗi QR thô. Chỉ lưu trường đã tách, hash payload, phiên bản parser và trạng thái đọc.
- QR thất bại không được làm mất hồ sơ; cán bộ chuyển sang nhập thủ công.

## 3. Dữ liệu Google Sheets

Các sheet dùng trong MVP:

- `CASES`: mã hồ sơ, tổ dân phố, trạng thái, người tiếp nhận, thời gian, ghi chú, version và Drive folder ID.
- `CERTIFICATES`: số phát hành GCN, ngày cấp, số vào sổ và thông tin GCN nhập thủ công.
- `OWNERS`: họ tên, CCCD, ngày sinh, giới tính, địa chỉ, nguồn `QR` hoặc `MANUAL`.
- `FILES`: `file_id`, `case_id`, loại tài liệu, biến thể `ORIGINAL`/`PREVIEW`, Drive ID, MIME, dung lượng, checksum và trạng thái upload.
- `IDENTITY_QR_SCANS`: dữ liệu QR đã tách, trạng thái, phiên bản decoder/parser, hash payload và người xác nhận.
- `USERS`, `REFERENCE_DATA`, `AUDIT_LOGS`, `ID_RESERVATIONS`, `SEARCH_INDEX`.
- Tạo sẵn `PARCELS`, `ASSETS`, `OCR_FIELDS` để mở rộng về sau nhưng chưa đưa vào luồng MVP.

Quy tắc dữ liệu:

- Case ID: `PHONGCHAU-{YYYY}-{6 chữ số}`. `YYYY` luôn tính theo múi giờ `Asia/Ho_Chi_Minh` (UTC+7), không dùng giờ UTC của Vercel — tránh sai năm quanh thời điểm giao thừa.
- `ID_RESERVATIONS` là append-only. Số thứ tự **bắt buộc lấy từ `updatedRange` do chính lệnh `values.append` vừa gọi trả về**, tuyệt đối không đọc "số dòng hiện có" bằng một lệnh đọc riêng rồi cộng 1 — cách đó có race condition giữa đọc và ghi và có thể sinh trùng Case ID khi hai cán bộ tạo hồ sơ cùng lúc.
- Mọi thao tác ghi có `idempotency_key`, `request_id` và `version`.
  - `idempotency_key` lưu trong một sheet riêng (`REQUEST_LOG` hoặc tương đương) kèm `request_id`, kết quả trả về đã cache và timestamp; TTL tối thiểu 24 giờ. Request đến với key đã tồn tại trả lại đúng kết quả đã lưu thay vì ghi lại — không kiểm tra idempotency bằng cách đọc lại bản ghi nghiệp vụ.
  - Optimistic concurrency (`version` + `409 VERSION_CONFLICT`) trên Sheets không có transaction thật nên vẫn còn cửa sổ race nhỏ giữa lúc đọc version và lúc ghi; bản thử nghiệm **chấp nhận rủi ro này ở quy mô ≤500 hồ sơ/vài chục người dùng đồng thời** thay vì tự dựng cơ chế lock. Đây là hạn chế đã biết, không phải lỗi — không cần "sửa" trừ khi thực tế phát sinh xung đột.
- Không xóa dòng; hồ sơ loại bỏ dùng trạng thái `ARCHIVED`.
- CCCD chỉ hiện che trong danh sách, log và thông báo. Chỉ mục tra cứu CCCD dùng HMAC với secret phía server.
- Audit log append-only và phải che CCCD, QR, link Drive, token cùng dữ liệu nhạy cảm.
- Google Sheets API có write quota theo phút/user. Mỗi thao tác nghiệp vụ có thể kéo theo nhiều lần ghi (bản ghi chính + `AUDIT_LOGS` + `SEARCH_INDEX`) — gộp các ghi liên quan trong một request thành một lệnh `batchUpdate` thay vì nhiều lệnh riêng lẻ, để giảm khả năng chạm quota khi nhiều cán bộ thao tác cùng lúc.

Trạng thái dùng trong MVP:

```text
DRAFT → UPLOADED → PENDING_REVIEW → VERIFIED
                     └→ NEEDS_MORE_DOCUMENTS → UPLOADED
VERIFIED → ARCHIVED (SYSTEM_ADMIN/WARD_ADMIN)
```

## 4. PLAN và TASK triển khai

### M0 — Chuẩn hóa và khởi tạo

1. Cập nhật `AGENTS.md`, `README.md` và tài liệu kiến trúc để ghi rõ ngoại lệ thử nghiệm: My Drive thay Shared Drive, Vercel thay backend đặt tại Việt Nam, cặp ảnh CCCD cho từng cá nhân và chưa có OCR.
2. Khởi tạo Next.js, TypeScript strict, PWA, lint, test unit và test E2E.
3. Tạo các module `auth`, `cases`, `files`, `drive`, `sheets`, `qr`, `users`, `reports`, `audit`, `common`.
4. Tạo `.env.example`, validation biến môi trường và định dạng lỗi API thống nhất.

### M1 — Google Cloud, My Drive và Sheets

1. Tạo Google Cloud Project bằng `anmphongandn@gmail.com`.
2. Bật Google Drive API và Google Sheets API.
3. Tạo OAuth client cho đăng nhập web và OAuth client cho bootstrap kho dữ liệu.
4. Cấu hình consent screen, domain Vercel, redirect URI và chuyển OAuth app sang production trước khi dùng dữ liệu thật.
5. Viết bootstrap CLI: lấy refresh token, tạo cây thư mục Drive, tạo spreadsheet, tạo header sheet, import reference data và seed tài khoản admin.
6. Seed mười tổ dân phố, `CaseStatus`, `UserRole` và các danh mục cần dùng.
7. Thêm health check cho OAuth, Drive, Sheets, token bị thu hồi, hết dung lượng và sai schema.

### M2 — Đăng nhập và phân quyền

1. Tích hợp Google Sign-In và session bảo mật: secure cookie (`HttpOnly`, `Secure`, `SameSite`), OAuth `state`/PKCE và CSRF token cho mọi API write — triển khai **ngay từ M2**, không để dồn đến M5, vì auth thiếu CSRF là lỗ hổng ngay cả trên môi trường Preview.
2. Áp dụng middleware kiểm tra session, email trong `USERS`, trạng thái active và role.
3. Tạo trang hồ sơ cá nhân và quản trị `USERS` cho `SYSTEM_ADMIN`.
4. Khởi tạo `anmphongandn@gmail.com` với role `SYSTEM_ADMIN`.
5. Ghi audit cho thêm/sửa/khóa người dùng, thay đổi quyền và hành vi đăng nhập thất bại; không ghi PII đầy đủ.

### M3 — Tiếp nhận hồ sơ, QR và upload

1. Xây form mobile-first chọn tổ dân phố, nhập GCN cơ bản, thông tin chủ sử dụng và ghi chú.
2. Tạo case ID idempotent, thư mục hồ sơ và bản ghi `DRAFT`.
3. Cho phép chụp/chọn cặp CCCD mặt trước/mặt sau cho từng cá nhân (tối đa 10 người) và từ 1 đến 10 ảnh GCN.
4. Hỗ trợ HEIC/HEIF, preview, kiểm tra dung lượng/chất lượng và đọc QR client-side.
5. Tạo resumable upload session, hiển thị tiến độ, retry và xác minh upload hoàn tất.
6. Hỗ trợ lưu nháp, thay CCCD, thêm/xóa ảnh GCN trước khi xác nhận.
   - **Thay CCCD**: upload ảnh mới trước, xác minh thành công, sau đó mới đổi trạng thái file CCCD cũ sang `REPLACED` (không hard-delete khỏi Drive, không xóa dòng `FILES`) rồi gán ảnh mới làm CCCD hiện hành của case — đảm bảo case không bao giờ ở trạng thái "không có CCCD" giữa chừng thao tác.
   - **`DELETE /api/cases/:caseId/files/:fileId`**: chỉ áp dụng cho ảnh GCN (được phép xóa khi còn ≥1 ảnh GCN khác hoặc case chưa `UPLOADED`), không áp dụng cho CCCD — CCCD chỉ được "thay", không được xóa trắng. Xóa ở đây là soft-delete: đổi trạng thái dòng `FILES` sang `DELETED`, không hard-delete khỏi Drive.
7. Chuyển `DRAFT` sang `UPLOADED` khi đủ cặp CCCD của từng cá nhân và ít nhất một ảnh GCN.

### M4 — Kiểm tra, tra cứu, dashboard và xuất

1. Tạo màn hình chi tiết hiển thị preview ảnh cùng dữ liệu nhập/QR.
2. Tạo thao tác `Lưu tạm`, `Yêu cầu bổ sung`, `Xác nhận hoàn thành` và kiểm tra transition trạng thái.
3. Tìm kiếm theo mã hồ sơ, số GCN, số vào sổ, họ tên, CCCD và tổ dân phố.
4. Dashboard tổng hồ sơ, trạng thái, tiến độ theo ngày và theo mười tổ dân phố.
5. Xuất CSV theo ngày, tổ dân phố và trạng thái; lưu vào `03_EXPORTS` và ghi audit log.

### M5 — Bảo mật, triển khai và thí điểm

1. Thêm rate limit, security headers và giới hạn kích thước request (OAuth state/CSRF/secure cookie đã làm ở M2 — không lặp lại ở đây, chỉ kiểm tra lại).
2. Bảo đảm log không chứa token, refresh token, URL upload session, Drive link, nội dung QR hoặc CCCD đầy đủ.
3. Backup, có tính đến việc toàn bộ dữ liệu phụ thuộc một tài khoản Gmail cá nhân (`anmphongandn@gmail.com`) — đây là single point of failure của kiến trúc pilot, không chỉ là vấn đề "quên backup":
   - Vercel Cron snapshot Drive hằng ngày vào `99_BACKUP` — **lưu ý đây là copy trong cùng tài khoản**, không bảo vệ khỏi việc tài khoản bị khóa/mất quyền truy cập.
   - Bổ sung export **Google Sheets** (toàn bộ tab, dạng CSV/JSON) ra ngoài tài khoản gốc theo lịch (ví dụ ghi vào Drive của một tài khoản phụ, hoặc tải về lưu ngoại tuyến) — hiện PLAN chỉ nói backup ảnh (Drive), chưa nói backup dữ liệu cấu trúc (Sheets).
   - Bản backup mã hóa ngoại tuyến hằng tuần do quản trị viên thực hiện thủ công phải tách khỏi tài khoản `anmphongandn@gmail.com` (ví dụ ổ cứng ngoài hoặc tài khoản lưu trữ khác), không chỉ tải xuống rồi để lại trong cùng Drive.
4. Deploy Preview bằng dữ liệu giả, sau đó Production tại `sin1`.
5. Thí điểm tuần tự: 20 hồ sơ giả/ẩn danh, 100 hồ sơ thật, rồi tối đa 500 hồ sơ.
6. Viết runbook xử lý: token bị thu hồi, **tài khoản `anmphongandn@gmail.com` bị khóa/mất quyền truy cập** (không chỉ token — cả kịch bản mất tài khoản), Sheet sai schema, lỗi upload và phục hồi từ backup.

## 5. API và biến môi trường

API chính:

```text
POST/GET /api/cases
GET/PATCH /api/cases/:caseId
POST /api/cases/:caseId/uploads/initiate
POST /api/cases/:caseId/uploads/complete
DELETE /api/cases/:caseId/files/:fileId
POST /api/cases/:caseId/qr/confirm
POST /api/cases/:caseId/request-more-documents
POST /api/cases/:caseId/verify
GET /api/dashboard/summary
POST /api/exports
GET/POST/PATCH /api/users
```

Mọi API write yêu cầu `idempotency_key`; PATCH yêu cầu `version`. Xung đột trả `409 VERSION_CONFLICT`.

```env
APP_BASE_URL=
AUTH_SECRET=
AUTH_GOOGLE_CLIENT_ID=
AUTH_GOOGLE_CLIENT_SECRET=
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_MY_DRIVE_ROOT_FOLDER_ID=
GOOGLE_SHEETS_SPREADSHEET_ID=
SYSTEM_ADMIN_EMAIL=anmphongandn@gmail.com
DATA_HASH_PEPPER=
MAX_UPLOAD_MB=30
VERCEL_REGION=sin1
```

Không dùng `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHARED_DRIVE_ID`, `GOOGLE_VISION_PROJECT_ID` hoặc `TEMP_FILE_DIR` trong bản thử nghiệm này.

## 6. Kiểm thử và nghiệm thu

### Kiểm thử

- Unit: parser QR, chuẩn hóa CCCD/ngày, che/HMAC CCCD, case ID, trạng thái, phân quyền và optimistic concurrency.
- Integration: OAuth refresh, Drive folder, Sheets batch write, resumable upload, retry, idempotency và lỗi từng phần.
- E2E: tạo hồ sơ, upload cặp CCCD cho từng cá nhân và nhiều GCN, QR thành công/thất bại, sửa dữ liệu, xác nhận, tìm kiếm, dashboard, export và audit.
- Kiểm thử Android Chrome, iPhone Safari, Wi-Fi và mạng 4G yếu.

### Tiêu chí nghiệm thu

- Không thể tải CCCD thứ hai nếu chưa thao tác thay ảnh.
- Ảnh gốc không đi qua body của Vercel Function.
- Không có Drive link công khai.
- Email ngoài `USERS` bị từ chối dù đăng nhập Google thành công.
- Không lộ CCCD hoặc token trong log.
- QR thất bại không mất hồ sơ.
- Upload lặp không tạo case hoặc file trùng.
- Hoàn thành thí điểm 100 hồ sơ trước khi nâng lên 500.

## 7. Tuân thủ dữ liệu cá nhân

Hệ thống thu thập và lưu trữ dữ liệu cá nhân (CCCD, họ tên, ngày sinh, giới tính, địa chỉ) thuộc phạm vi điều chỉnh của Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân — việc "không tạo giá trị pháp lý" của hệ thống không miễn trừ nghĩa vụ này vì hệ thống vẫn _thu thập và xử lý_ PII. Trước khi thí điểm với dữ liệu thật (M5.5, mốc 100 hồ sơ), cần làm rõ và ghi vào [`docs/brain/03-decisions.md`](docs/brain/03-decisions.md):

- Cơ sở pháp lý/thẩm quyền thu thập CCCD của người dân trong khuôn khổ chiến dịch 180 ngày.
- Thời hạn lưu trữ dữ liệu cá nhân trong bản thử nghiệm và mốc thời gian xử lý sau khi kết thúc pilot hoặc migration.
- Quy trình xử lý khi người dân yêu cầu xóa/chỉnh sửa dữ liệu cá nhân của họ.

## 8. Hướng chuyển đổi sau thử nghiệm

Khi chuyển sang Google Workspace/Shared Drive, thực hiện migration riêng: sao chép file từ My Drive, cập nhật `drive_file_id`, giữ nguyên `file_id` và `case_id`, đối chiếu checksum và audit từng lô. Không giả định file thuộc Gmail cá nhân có thể di chuyển trực tiếp sang Shared Drive của tổ chức.
