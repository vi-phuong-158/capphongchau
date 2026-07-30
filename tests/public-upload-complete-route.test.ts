/**
 * Phase 5 — hợp đồng dọn dẹp của route hoàn tất tải lên.
 *
 * Bất biến quan trọng nhất, và nó **không đối xứng**:
 *
 *   - để sót một tệp thừa trên Drive → có script rà soát dọn sau, mất một ít dung lượng;
 *   - xóa nhầm một tệp cơ sở dữ liệu đã nhận → hồ sơ trỏ vào Drive ID không còn tồn tại, ảnh giấy
 *     tờ của người dân mất vĩnh viễn, và không ai phát hiện cho tới lúc cán bộ mở hồ sơ ra đối
 *     chiếu.
 *
 * Vì vậy mọi tình huống không chắc chắn đều phải nghiêng về **giữ lại**. Các test ở đây đọc mã
 * nguồn vì route thật cần Supabase, Google Drive và cookie phiên — không dựng được trong unit
 * test — nhưng chúng bắt đúng loại hồi quy đáng sợ nhất: ai đó đổi `.catch(() => true)` thành
 * `.catch(() => false)` cho "hợp lý hơn".
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const route = read("../src/app/api/public/submissions/current/uploads/complete/route.ts");
const initiateRoute = read(
  "../src/app/api/public/submissions/current/uploads/initiate/route.ts",
);
const repository = read("../src/modules/public-intake/repository.ts");
/**
 * Từ Đợt 2C, `discardIfOrphan` nằm ở module dùng chung: cán bộ cũng tải ảnh vào đúng thư mục Drive
 * của hồ sơ, nên cùng một cửa dọn dẹp phải phục vụ cả hai đường. Các bất biến dưới đây không đổi —
 * chỉ đổi nơi đọc, và giờ chúng khóa cho cả hai đường một lượt.
 */
const uploadCommit = read("../src/modules/public-intake/upload-commit.ts");

describe("Ghi cơ sở dữ liệu hỏng không để lại tệp mồ côi", () => {
  it("dọn dẹp trước khi ném lỗi ra ngoài", () => {
    expect(route).toMatch(/await discardIfOrphan\([\s\S]{0,200}?\);\s*\n\s*throw error;/);
  });

  it("xung đột idempotency cũng đi qua cùng cửa dọn dẹp", () => {
    const conflictBlock = route.slice(route.indexOf("SubmissionIdempotencyConflictError"));
    expect(conflictBlock).toContain("discardIfOrphan");
  });
});

describe("Không bao giờ xóa tệp cơ sở dữ liệu đã nhận", () => {
  it("response đầu bị mất rồi retry: replay được xử lý trước validation trạng thái upload mới", () => {
    const replayLookup = route.indexOf('findStoredMutation(idempotencyKey, "PUBLIC_UPLOAD_COMPLETE")');
    const stateValidation = route.indexOf("const identityImage");
    expect(replayLookup).toBeGreaterThan(0);
    expect(replayLookup).toBeLessThan(stateValidation);
    expect(route.slice(replayLookup, stateValidation)).toContain("replay.response.fileId");
    expect(route.slice(replayLookup, stateValidation)).toContain("replay.response.sizeBytes");
  });

  it("route không gọi discardFile trực tiếp trên bất kỳ đường lỗi nào", () => {
    expect(route).not.toContain(".discardFile(");
  });

  it("hỏi cơ sở dữ liệu trước khi xóa", () => {
    expect(uploadCommit).toContain("isDriveFileAdopted");
    expect(uploadCommit).toMatch(/if \(adopted\) return;/);
  });

  it("hỏi không được thì mặc định coi như ĐÃ nhận", () => {
    // Đảo chiều `.catch` ở đây là lỗi mất dữ liệu, không phải lỗi phong cách.
    expect(uploadCommit).toContain("isDriveFileAdopted(driveFileId).catch(() => true)");
  });

  it("không xác nhận được thư mục thì KHÔNG xóa", () => {
    // Hai `.catch` ngược chiều nhau nhưng cùng một ý: không chắc thì giữ tệp lại.
    //   - hỏi cơ sở dữ liệu hỏng  → coi như ĐÃ nhận (`true`)  → không xóa;
    //   - hỏi Drive hỏng          → coi như KHÔNG thuộc (`false`) → không xóa.
    const guard = uploadCommit.slice(uploadCommit.indexOf("export async function discardIfOrphan"));
    expect(guard).toContain(".isFileInFolder(driveFileId, record.driveFolderId)");
    expect(guard).toContain(".catch(() => false)");
    expect(guard).toMatch(/if \(!ownedByCaller\) return;/);
  });

  it("kiểm thư mục đứng TRƯỚC lệnh xóa, không phải sau", () => {
    const guard = uploadCommit.slice(uploadCommit.indexOf("export async function discardIfOrphan"));
    expect(guard.indexOf("isFileInFolder")).toBeLessThan(guard.indexOf("discardFile("));
  });

  it("truy vấn adopt tính cả tệp đã REPLACED — tệp bị thay vẫn là bằng chứng của hồ sơ", () => {
    const method = repository.slice(
      repository.indexOf("async isDriveFileAdopted"),
      repository.indexOf("async appendUploadAttempt"),
    );
    expect(method).toContain("where drive_file_id = ");
    expect(method).not.toContain("status = 'UPLOADED'");
  });

  it("truy vấn adopt KHÔNG lọc theo hồ sơ đang gọi", () => {
    /*
     * Hồi quy đã từng có thật: lọc thêm `submission_id = <hồ sơ đang gọi>` biến câu hỏi "có ai
     * đang trỏ vào tệp này không" thành "hồ sơ đang gọi có trỏ vào nó không". Một `driveFileId`
     * do client gửi lên trỏ sang hồ sơ khác khi đó bị coi là mồ côi và bị xóa — mất bằng chứng
     * của một hộ dân không liên quan.
     */
    const method = repository.slice(
      repository.indexOf("async isDriveFileAdopted"),
      repository.indexOf("async appendUploadAttempt"),
    );
    expect(method).not.toContain("submission_id");
  });

  it("phát lại idempotent trả bản ghi cũ, không chèn bản mới", () => {
    // Nếu replay chèn thêm dòng thì tệp cũ mất tham chiếu và trở thành mồi cho script dọn rác.
    const method = repository.slice(repository.indexOf("async appendFile"));
    expect(method).toContain("return cached[0].response_json as PublicFileSummary;");
  });

  it("replay dùng cùng driveFileId cho cả upload mới và replace", () => {
    expect(route).toContain("driveFileId,\n        documentType,\n        ownerId,\n        replaceFileId,");
  });
});

describe("Tên tệp trong kho do máy chủ đặt", () => {
  it("không ghép bất kỳ mảnh nào của tên client gửi lên", () => {
    // Tên do máy ảnh sinh hay mang số CCCD và họ tên. Trình duyệt của app đã gửi tên trung tính,
    // nhưng đó là biện pháp phía client — ranh giới tin cậy nằm ở route này.
    expect(initiateRoute).not.toMatch(/body\.fileName[\s\S]{0,40}\$\{/);
    expect(initiateRoute).toContain(
      "const fileName = `${documentType}-${Date.now()}-${randomUUID().slice(0, 8)}",
    );
  });

  it("phần mở rộng lấy từ mimeType đã kiểm, không từ tên client", () => {
    expect(initiateRoute).toContain("extensionFromMimeType(mimeType)");
  });
});
