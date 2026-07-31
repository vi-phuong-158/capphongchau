-- Đợt 2A-2: một ô ghi chú nội bộ cho cán bộ, không hiển thị cho người dân.
--
-- Số hiệu 202607290005 đã bị migration `lazy_drive_folder_creation` chiếm trên `main` (hai nhánh
-- cấp cùng số cho hai nội dung khác nhau). Migration này đổi sang 202607290006 — số lớn hơn toàn
-- bộ migration hiện có nên thứ tự áp dụng không phụ thuộc nhánh nào merge trước.
alter table public.public_submissions
  add column if not exists internal_notes text not null default '';
