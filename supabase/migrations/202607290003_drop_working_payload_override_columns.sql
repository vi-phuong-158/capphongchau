-- `working_payload_json` là nguồn sự thật DUY NHẤT cho mã ĐVHC ghi đè (cột B) và tên file quét
-- ghi đè (cột AX). Bốn cột dưới đây do 202607290002 thêm vào chỉ từng được GHI, không có đường đọc
-- nào — giữ lại là duy trì hai nguồn dữ liệu song song có thể lệch nhau.
--
-- KHÔNG sửa 202607290002: file đó có thể đã chạy ở môi trường local/preview. Migration này
-- idempotent (`drop column if exists`) nên đúng trong cả hai trạng thái: môi trường đã áp
-- 202607290002 thì cột bị gỡ, môi trường chưa áp thì lệnh không làm gì.
--
-- An toàn dữ liệu: mọi giá trị từng ghi vào bốn cột này đều được sao chép nguyên vẹn từ
-- `working_payload_json`/`draft_json` trong cùng transaction, nên không có dữ liệu nào chỉ tồn tại
-- ở đây. Không cần backfill trước khi gỡ.

alter table public.public_submissions
  drop column if exists ward_admin_code_override,
  drop column if exists ward_admin_code_override_reason,
  drop column if exists scanned_file_names_override,
  drop column if exists scanned_file_names_override_reason;
