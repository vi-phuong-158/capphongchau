/**
 * Những thứ dùng chung khi chốt một lượt tải ảnh vào hồ sơ — trần số lượng/dung lượng và việc dọn
 * tệp mồ côi trên Drive.
 *
 * Tách ra khỏi route công khai vì từ Đợt 2C có **hai** đường tải ảnh vào cùng một thư mục Drive:
 * người dân qua `/api/public/submissions/current/uploads/*` và cán bộ qua
 * `/api/submissions/[submissionId]/uploads/*`. Hai trần này là ràng buộc của **hồ sơ**, không phải
 * của một trong hai đường: để mỗi route giữ hằng số riêng thì sửa một bên là hai bên lệch nhau, và
 * cán bộ tải thêm ảnh sẽ vượt ngân sách mà bên kia vẫn tưởng còn chỗ.
 */

import { getPublicIntakeStorage } from "./storage";

export const MAX_CERTIFICATE_PHOTOS = 10;

/** Ngân sách byte mỗi bản kê khai — chống lạm dụng trên endpoint ẩn danh (PLAN_NL §6.1). */
export const SUBMISSION_BYTE_BUDGET = 150 * 1024 * 1024;

/**
 * Xóa tệp trên Drive **chỉ khi** cả hai điều kiện dưới đây cùng đúng.
 *
 * 1. Chưa hồ sơ nào nhận tệp này (`isDriveFileAdopted`, hỏi toàn bảng chứ không lọc theo hồ sơ
 *    đang gọi).
 * 2. Tệp nằm đúng trong thư mục Drive của chính hồ sơ đang gọi.
 *
 * Vì sao cần điều kiện 2: phần lớn nhánh gọi hàm này truyền thẳng `body.driveFileId` — dữ liệu
 * client, chưa qua `verifyUploadedFile`. Chỉ với điều kiện 1, một `driveFileId` trỏ sang thư mục
 * hộ khác mà chưa kịp `complete` vẫn thỏa "chưa ai nhận" và sẽ bị xóa. Hai điều kiện cộng lại thu
 * hẹp phạm vi xóa về đúng những gì bên đang gọi tự tải lên.
 *
 * `.catch(() => true)` / `.catch(() => false)` không phải là nuốt lỗi cho gọn: hỏi mà không hỏi
 * được thì mặc định coi như **đã nhận** và **không xác nhận được thư mục**, tức là không xóa. Sai
 * theo hướng để lại một tệp thừa thì có `scripts/audit-orphan-public-files.ts` dọn sau; sai theo
 * hướng kia thì mất bằng chứng của hồ sơ, vĩnh viễn.
 *
 * `driveFolderId` là `null` khi hồ sơ tạo theo Phase lazy Drive folder mà chưa kịp có thư mục —
 * lúc đó không có thư mục nào để đối chiếu điều kiện 2, nên không xóa gì cả.
 */
export async function discardIfOrphan(
  repository: {
    isDriveFileAdopted(driveFileId: string): Promise<boolean>;
  },
  record: { readonly driveFolderId: string | null },
  driveFileId: string,
): Promise<void> {
  if (!driveFileId || !record.driveFolderId) return;
  const adopted = await repository.isDriveFileAdopted(driveFileId).catch(() => true);
  if (adopted) return;

  const storage = getPublicIntakeStorage();
  const ownedByCaller = await storage
    .isFileInFolder(driveFileId, record.driveFolderId)
    .catch(() => false);
  if (!ownedByCaller) return;

  await storage.discardFile(driveFileId).catch(() => undefined);
}
