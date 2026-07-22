# Kế hoạch vận hành 20.000 hồ sơ bằng Google Sheets và My Drive

## Tóm tắt

- Giữ Google Sheets/My Drive, nhưng chuyển từ một kho duy nhất sang 10 cụm dữ liệu theo tổ dân phố và một kho điều phối trung tâm không chứa PII.
- Phù hợp cho chiến dịch 4–8 tuần, có điều tiết lượt nộp; không phù hợp để mở tự do cho hàng nghìn người đồng thời.
- Google Sheets có quota mặc định 300 ghi/phút/dự án và 60 ghi/phút/người dùng/dự án; thiết kế sẽ giữ tải ứng dụng dưới 45 ghi/phút, dùng batch và backoff. Xem [Google Sheets API limits](https://developers.google.com/workspace/sheets/api/limits).
- Tiến độ dự kiến: 14–18 tuần cho một kỹ sư full-stack và cán bộ nghiệp vụ nghiệm thu.

## 1. Kiến trúc dữ liệu và điều phối chiến dịch

- Tạo 10 spreadsheet vận hành, mỗi tổ dân phố một cụm, có cùng schema `PUBLIC_*`, hồ sơ chính thức, file index, audit và search index.
- Tạo một spreadsheet `CONTROL_PLANE` trung tâm, chỉ lưu:
  - Người dùng, vai trò và phạm vi tổ dân phố.
  - Danh mục/version chính thức.
  - `ID_RESERVATIONS` sinh Case ID toàn phường.
  - `GLOBAL_RECEIPT_INDEX`: hash mã tiếp nhận, shard, submission ID, trạng thái; không lưu điện thoại/CCCD.
  - Cấu hình chiến dịch, lịch mở cổng, chỉ số tổng hợp, job export.
- File Drive giữ cấu trúc theo tổ dân phố và Case ID; mỗi shard không truy cập dữ liệu PII của shard khác nếu không có quyền.
- Bổ sung phạm vi `neighborhood_scopes` cho cán bộ; `WARD_ADMIN` và `SYSTEM_ADMIN` có quyền liên tổ, các vai trò khác chỉ thấy tổ được phân công.
- Migration giữ nguyên kho hiện có ở chế độ archive/read-only, sao chép dữ liệu thử vào shard xác định theo tổ dân phố, kiểm tra đối chiếu và không xóa dữ liệu nguồn.

## 2. Điều tiết tải cho 20.000 hồ sơ

- Chia chiến dịch theo lịch tổ dân phố; cổng chỉ nhận tạo mới trong khung giờ được cấu hình.
- Cấu hình ban đầu: tối đa 15 lượt tạo hồ sơ mới/giờ/tổ, tổng tối đa 150 lượt/giờ toàn phường. Với 20 ngày làm việc × 8 giờ, năng lực lý thuyết là 24.000 lượt.
- Autosave chờ 20 giây sau thao tác cuối, tối thiểu 45 giây giữa hai lần ghi; luôn lưu khi đổi bước hoặc bấm gửi.
- Mọi ghi Sheets dùng batch; reference data được cache; upload đi thẳng Drive, không đi qua Vercel.
- Khi nhận `429` hoặc lỗi tạm thời: retry mũ 1–2–4–8–16–32–64 giây, tối đa 5 lần; sau đó hiển thị trạng thái “đã lưu đến lần gần nhất” và cho tiếp tục bằng mã hồ sơ.
- WAF/Turnstile giới hạn tạo mới, truy cập mã bí mật và autosave theo IP/session; không dùng hàng đợi in-memory.
- Trước mở chiến dịch, kiểm thử tải bằng dữ liệu giả với mục tiêu 150 lượt tạo/giờ, tải Sheets không vượt 45 ghi/phút và không mất hồ sơ khi retry.
- Nếu không đạt chỉ tiêu tải, chỉ được mở theo khung giờ nhỏ hơn; không tăng quota bằng cách bỏ kiểm soát dữ liệu.

## 3. Khắc phục cổng người dân

- Thay `input type="date"` bằng `VietnameseDateInput`: nhập `DD/MM/YYYY`, chấp nhận dạng không dấu ngăn cách, bàn phím số, lịch tùy chọn và chọn nhanh năm.
- Chuẩn hóa diện tích kiểu Việt Nam bằng fixed-point; chấp nhận dấu phẩy/dấu chấm, không dùng `Number()` trực tiếp.
- Xây “Tiếp tục hồ sơ” bằng mã tiếp nhận + mã bí mật:
  - Tra shard qua `GLOBAL_RECEIPT_INDEX`.
  - Rate limit, đếm sai, khóa tạm thời.
  - Cấp lại session/CSRF và trả draft, file summary, trạng thái, yêu cầu bổ sung.
- Thêm thumbnail, xem, thay, xóa mềm, sắp xếp và gắn nhãn trang GCN.
- Giữ file gốc; sinh preview JPEG để xem/QR; xác minh MIME, magic bytes, checksum, dung lượng và thư mục Drive.
- Đổi thứ tự CCCD thành mặt trước → mặt sau → tự đọc QR → nhập tay nếu QR lỗi.
- Trang kiểm tra cuối hiển thị chi tiết toàn bộ nội dung, file và nút sửa từng nhóm.
- Chặn gửi chính thức với “Hộ gia đình/Tổ chức” cho đến khi có quy định giấy tờ và người đại diện.
- Bổ sung mô tả dễ hiểu cho trường đất đai, lựa chọn “Cán bộ đối chiếu”, thông tin điểm hỗ trợ và accessibility đầy đủ.

## 4. Quy trình cán bộ, dữ liệu chính thức và báo cáo

- Chuẩn hóa trạng thái:

  `DRAFT → SUBMITTED → UNDER_REVIEW → NEEDS_SUPPLEMENT → RESUBMITTED → UNDER_REVIEW → ACCEPTING → ACCEPTED`

  Nhánh kết thúc: `REJECTED`.

- Gửi lại phải dùng upsert theo ID/version, không append owner/thửa/mục đích sử dụng trùng.
- Cán bộ yêu cầu bổ sung hoặc từ chối bắt buộc nhập mã lý do, nội dung, trường cần sửa và xác nhận thao tác.
- Ghi trạng thái, audit và idempotency result trong cùng batch; admin không được bỏ qua state machine.
- Mặc định che PII; thao tác mở dữ liệu nhạy cảm có role check và audit.
- Hoàn thiện saga tiếp nhận theo checkpoint: claim → reserve Case ID → tạo thư mục → xác minh/di chuyển file → ghi hồ sơ chính thức → checklist → `ACCEPTED`.
- Mỗi shard tự tiếp nhận hồ sơ của mình; Case ID vẫn duy nhất toàn phường từ `CONTROL_PLANE`.
- Chỉ mở saga khi có thông báo dữ liệu cá nhân, danh mục trường 12, mã phường và phân loại nhóm 4/5 đã được phê duyệt.

### Báo cáo Phụ lục 8

- Tạo checklist 15 trường cho mỗi Case, gồm giá trị, đủ/thiếu/chờ xác minh, nguồn, người xác nhận và version danh mục.
- PDF Phụ lục 8 được sinh theo từng hồ sơ khi tiếp nhận thành công hoặc khi cán bộ yêu cầu xuất lại.
- Với 20.000 hồ sơ, không tạo một PDF tổng khổng lồ:
  - Mỗi tổ xuất một XLSX tối đa khoảng 2.000 hồ sơ.
  - Toàn chiến dịch gồm 10 XLSX theo tổ và một XLSX tổng hợp không PII.
  - PDF từng hồ sơ tải theo quyền từ danh sách hoặc xuất theo lô nhỏ.
- Thêm `EXPORT_JOBS` có checkpoint; export đọc từng shard theo trang, ghi file Restricted vào `03_EXPORTS`, có audit và checksum.

## 5. API, migration và kiểm thử

### API chính

- `POST /api/public/submissions/access`: mã tiếp nhận + mã bí mật, tra locator và cấp lại session.
- `GET /api/public/submissions/current`: draft, version, file summary, trạng thái và yêu cầu bổ sung.
- `DELETE /api/public/submissions/current/files/:fileId`: xóa mềm GCN.
- Upload API hỗ trợ original/preview, `replaceFileId`, thứ tự trang và xác minh file.
- Staff action nhận thêm `reasonCode`, `reasonText`, `requestedFields`.
- Thêm API reveal PII có audit, dashboard tổng hợp, export job và tải file export có kiểm quyền.
- Mọi API route theo shard ở server; client không truyền hoặc nhìn thấy ID spreadsheet/Drive.

### Kiểm thử và rollout

- Unit: ngày Việt Nam, số thập phân, validation, trạng thái, idempotency, routing shard, locator, danh mục và checklist.
- Integration: migration 10 shard, retry/quota, upload replacement, access-code lockout, resubmit không trùng, saga resume và export job.
- E2E: Android Chrome, iPhone Safari, desktop; reload/đổi thiết bị, mạng 4G yếu, nhiều file, bổ sung, tiếp nhận và xuất báo cáo.
- Accessibility kiểm tra tự động và thủ công.
- Mở theo bốn nấc:
  1. 200 hồ sơ dữ liệu giả/một tổ.
  2. 2.000 hồ sơ ở hai tổ.
  3. 10.000 hồ sơ ở năm tổ.
  4. 20.000 hồ sơ toàn phường.
- Mỗi nấc chỉ mở khi không có mất dữ liệu, retry an toàn, quota ổn định, backup/restore đạt và không còn lỗi P0/P1.

## Giả định và điều kiện chặn

- Chiến dịch kéo dài 4–8 tuần, có lịch tiếp nhận theo tổ dân phố.
- Dữ liệu hiện hữu là dữ liệu thử và phải được bảo toàn.
- Google Sheets/My Drive vẫn là giới hạn vận hành: cần backup mã hóa ngoài tài khoản chủ, OAuth Production, custom domain, WAF và giám sát quota.
- Google Drive có giới hạn số lượng item theo thư mục; việc phân tách theo tổ và Case giúp tránh một thư mục quá lớn. Xem [Google Drive migration guidance](https://knowledge.workspace.google.com/admin/getting-started/google-drive-large-migration-best-practices).
- Nếu kiểm thử tải không đạt 150 lượt tạo/giờ hoặc thời lượng chiến dịch bị rút xuống dưới 4 tuần, kế hoạch phải quay lại phương án PostgreSQL + object storage; không mở rộng bằng cách bỏ các kiểm soát an toàn.
