# Vận hành Antigravity local station

> **Đây là bản rút gọn.** Hướng dẫn đầy đủ cho agent — gồm schema JSON, bảng quyết định trạng thái,
> vị trí từng trường trên GCN, ví dụ thật và bảng lỗi — nằm ở [`agent/AGENTS.md`](AGENTS.md). Agent
> lần đầu nhận việc phải đọc file đó, không phải file này.
>
> Cập nhật 2026-07-31: quy trình gọi `/api/ai/*` đã được thay bằng script chạy tại máy trạm. Route
> API vẫn còn trong mã nguồn nhưng `AI_EXTRACTION_ENABLED=false` là đã tắt đường đó.

1. Máy trạm đồng bộ My Drive bằng tài khoản quản trị theo quyết định vận hành hiện tại. Đặt trong
   `.env.local`: `SUPABASE_DATABASE_URL` và `AI_LOCAL_DRIVE_ROOT` (thư mục
   `CSDL-DAT-DAI-PHONG-CHAU-THU-NGHIEM` đã sync về máy).

2. Lấy danh sách việc:

```bash
npm run ai:list-jobs
```

In ra từng job kèm `fileId`, đường dẫn ảnh cục bộ và trạng thái checksum. Cuối bản in là danh sách
hồ sơ có ảnh GCN nhưng chưa có job phủ đúng bộ ảnh hiện tại.

3. Hồ sơ thiếu job (thường do cán bộ bổ sung ảnh sau lúc gửi):

```bash
npm run ai:enqueue -- --submission=<submissionId>
```

4. Mở đúng các ảnh có trạng thái `OK`, đọc số phát hành / ngày cấp / số vào sổ, viết kết quả ra file
   JSON theo schema v2 (`aiExtractionPayloadSchema`). Mỗi trường `CLEAR` phải có
   `evidence.fileId` nằm trong danh sách file của job. Không mở ảnh CCCD, không đọc QR.

5. Ghi nháp:

```bash
npm run ai:submit-draft -- --job=<jobId> --result=<duong-dan.json> --model=<ten-model>
```

Script chạy lại toàn bộ guard rồi ghi `ai_extraction_results` + `ai_field_comparisons` trong một
transaction. Chạy lại cùng file JSON trả về kết quả cũ, không sinh bản ghi trùng.

6. Nếu script báo `STALE`: ảnh GCN hoặc dữ liệu nguồn đã đổi kể từ lúc tạo job. Chạy `enqueue` cho
   hồ sơ đó rồi đọc lại theo bộ ảnh mới. Không retry để suy đoán nội dung.

7. Kết quả `BLOCKED` (ví dụ ảnh không phải GCN) vẫn được lưu để cán bộ thấy vì sao AI không đọc
   được, nhưng job chuyển `QUARANTINED` và không có giá trị nào nạp được vào hồ sơ.

Cán bộ là người duy nhất nạp giá trị vào bản làm việc, qua màn hình đối chiếu AI. Script không sửa
`public_submissions` và không duyệt hồ sơ.
