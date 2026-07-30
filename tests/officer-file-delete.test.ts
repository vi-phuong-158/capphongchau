/**
 * Đợt 2C (bổ sung) — cán bộ gỡ ảnh Giấy chứng nhận khỏi hồ sơ.
 *
 * Bất biến quan trọng nhất ở đây **không đối xứng**, giống Phase 5 nhưng vì lý do khác:
 *
 *   - giữ lại một ảnh đáng gỡ → cán bộ bấm lại, mất vài giây;
 *   - xóa thật một ảnh giấy tờ → bằng chứng của hộ dân mất vĩnh viễn, và không ai biết cho tới lúc
 *     cần tra lại.
 *
 * Nên "xóa" ở đây **chỉ được là xóa mềm**: đổi `status` sang `DELETED`, tệp nằm nguyên trên Drive.
 * Ai đó thêm một lời gọi `discardFile`/`drive.files.delete` vào route này cho "gọn kho" là hồi quy
 * mất dữ liệu, không phải hồi quy phong cách — và đó là thứ các ca dưới đây canh.
 *
 * Hai giới hạn còn lại cũng được khóa vì cả hai đều dễ bị nới ra cho "tiện":
 *   1. **Chỉ ảnh `CERTIFICATE`.** `completionChecks.checkFiles` chặn tiếp nhận khi một chủ sử dụng
 *      thiếu CCCD mặt trước/mặt sau, nên mở cửa gỡ CCCD chỉ tạo ra trạng thái không tiếp nhận được.
 *   2. **Cùng cửa quyền với upload** (`mayStaffEdit`), không rộng hơn.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

/** Bỏ chú thích trước khi khẳng định "mã nguồn KHÔNG chứa X" — xem `officer-file-upload.test.ts`. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const route = read("../src/app/api/submissions/[submissionId]/files/[fileId]/route.ts");
const citizenRoute = read(
  "../src/app/api/public/submissions/current/files/[fileId]/route.ts",
);
const repository = read("../src/modules/public-intake/repository.ts");
const viewer = read("../src/components/admin/document-viewer.tsx");
const detail = read("../src/components/submission-detail.tsx");

/** Chỉ thân hàm DELETE — để ca phủ định không bị GET trong cùng file làm nhiễu. */
const deleteBody = code(route).slice(code(route).indexOf("export async function DELETE"));

describe("gỡ ảnh là xóa MỀM, không bao giờ chạm Drive", () => {
  it("route không có bất kỳ đường xóa tệp thật nào", () => {
    expect(deleteBody).toContain("markFileDeleted");
    // Ba cách xóa thật có thể lọt vào: storage.discardFile, drive.files.delete, và discardIfOrphan.
    expect(deleteBody).not.toContain("discardFile");
    expect(deleteBody).not.toContain("files.delete");
    expect(deleteBody).not.toContain("discardIfOrphan");
  });

  it("markFileDeleted chỉ đổi status, không xóa dòng", () => {
    const method = repository.slice(
      repository.indexOf("private async markFileStatus"),
      repository.indexOf("private async refreshFileSummaries"),
    );
    expect(method).toContain("update public.public_files set status =");
    expect(method).not.toContain("delete from");
  });

  /**
   * Xóa mềm chỉ an toàn nếu script rà soát tệp mồ côi **không** coi ảnh đã `DELETED` là rác.
   * `isDriveFileAdopted` không lọc theo `status`, nên tệp vẫn được coi là "đã có hồ sơ nhận".
   */
  it("script dọn tệp mồ côi không dọn mất ảnh đã gỡ", () => {
    const method = repository.slice(
      repository.indexOf("async isDriveFileAdopted"),
      repository.indexOf("async appendUploadAttempt"),
    );
    expect(method).toContain("where drive_file_id = ");
    expect(method).not.toContain("status = 'UPLOADED'");
  });
});

describe("chỉ gỡ được ảnh Giấy chứng nhận", () => {
  it("route từ chối mọi loại giấy tờ khác", () => {
    expect(deleteBody).toContain('file.documentType !== "CERTIFICATE"');
  });

  it("nút gỡ ở khung xem ảnh cũng chỉ hiện với ảnh GCN", () => {
    // Hai lớp cùng một luật: ẩn nút là phép lịch sự, server mới là chốt.
    expect(viewer).toContain('activeFile.documentType === "CERTIFICATE"');
  });

  /** Cùng luật với đường hộ dân — hai bên lệch nhau là nghiệp vụ có hai câu trả lời khác nhau. */
  it("giữ đúng luật của đường hộ dân đã có", () => {
    expect(citizenRoute).toContain('file.documentType !== "CERTIFICATE"');
  });
});

describe("cửa quyền không rộng hơn cửa tải ảnh", () => {
  it("đòi đủ ba lớp: phiên cán bộ, CSRF, quyền sửa hồ sơ", () => {
    expect(deleteBody).toContain("requireActiveUser(SUBMISSION_DECISION_ROLES)");
    expect(deleteBody).toContain("verifyCsrfToken(");
    expect(deleteBody).toContain("mayStaffEdit(record, user.email)");
  });

  it("không tự viết lại điều kiện quyền", () => {
    expect(deleteBody).not.toContain('status === "UNDER_REVIEW"');
    expect(deleteBody).not.toContain("isClaimedBy(");
  });

  it("không nhận CSRF của bề mặt công khai", () => {
    expect(deleteBody).toContain('request.headers.get("x-csrf-token")');
    expect(deleteBody).not.toContain("x-public-csrf-token");
  });

  it("giao diện gắn đúng điều kiện của mayStaffEdit rồi mới truyền hàm gỡ xuống viewer", () => {
    const block = detail.slice(detail.indexOf("onDeleteFile={"));
    expect(block.slice(0, block.indexOf("}\n          />"))).toContain(
      'isClaimedByMe && submission.status === "UNDER_REVIEW"',
    );
    // Không truyền hàm = viewer không hiện nút. Quyền nằm đúng một nơi ở client.
    expect(viewer).toContain("Boolean(onDeleteFile)");
  });
});

describe("gọi lại không gây tác dụng phụ", () => {
  /**
   * Mạng đứt sau khi server đã ghi: cán bộ bấm lại. Phải là no-op, và **không** ghi thêm một dòng
   * audit thứ hai cho cùng một hành động — audit trùng làm việc đối soát "ai gỡ ảnh nào" sai số.
   */
  it("chỉ ghi audit khi thật sự có chuyển trạng thái", () => {
    expect(deleteBody).toContain('if (file.status === "UPLOADED") {');
    const guarded = deleteBody.slice(deleteBody.indexOf('if (file.status === "UPLOADED") {'));
    const guardEnd = guarded.indexOf("\n    }");
    expect(guarded.slice(0, guardEnd)).toContain("appendAudit");
  });

  it("tìm ảnh có tính cả trạng thái DELETED để lần gọi thứ hai không thành 404", () => {
    expect(deleteBody).toContain("listFiles(submissionId, true)");
    expect(deleteBody).toContain('candidate.status === "UPLOADED" || candidate.status === "DELETED"');
  });

  it("chuyển trạng thái có khóa dòng, không đọc-rồi-ghi hở", () => {
    const method = repository.slice(
      repository.indexOf("private async markFileStatus"),
      repository.indexOf("private async refreshFileSummaries"),
    );
    expect(method).toContain("for update");
    expect(method).toContain("if (current[0].status !== status)");
  });

  it("cập nhật lại file_summary_json để completionChecks thấy bộ ảnh mới", () => {
    // `checkFiles` đọc `record.fileSummaries`; không refresh là hồ sơ thiếu ảnh vẫn tiếp nhận được.
    const method = repository.slice(
      repository.indexOf("private async markFileStatus"),
      repository.indexOf("private async refreshFileSummaries"),
    );
    expect(method).toContain("refreshFileSummaries(transaction, submissionId)");
  });
});

describe("dấu vết và bảo mật thông tin", () => {
  it("ghi audit riêng cho việc cán bộ gỡ ảnh", () => {
    expect(deleteBody).toContain('action: "SUBMISSION_OFFICER_FILE_DELETED"');
    expect(deleteBody).toContain("actorEmail: user.email");
  });

  it("audit không mang tên tệp, Drive ID hay ownerId", () => {
    const audit = deleteBody.slice(deleteBody.indexOf("appendAudit"));
    const metadata = audit.slice(audit.indexOf("metadata:"), audit.indexOf("});"));
    expect(metadata).toContain("documentType");
    expect(metadata).not.toContain("driveFileId");
    expect(metadata).not.toContain("fileName");
    expect(metadata).not.toContain("ownerId");
  });

  it("mọi phản hồi đều no-store", () => {
    expect(deleteBody).not.toMatch(/NextResponse\.json\((?![\s\S]{0,300}?cache-control)/);
  });
});

describe("không chặn ảnh GCN cuối cùng ở tầng route", () => {
  /**
   * Việc "hồ sơ phải có ít nhất một ảnh GCN" thuộc `completionChecks` — nó báo
   * `FILES_CERTIFICATE_MISSING` lúc tiếp nhận. Chặn ngay ở route là bắt cán bộ muốn thay cả bộ ảnh
   * phải làm ngược thứ tự (tải mới trước, gỡ sau), và có thể vượt trần 10 ảnh giữa đường.
   */
  it("route không đếm số ảnh GCN còn lại", () => {
    expect(deleteBody).not.toContain("MAX_CERTIFICATE_PHOTOS");
    expect(deleteBody).not.toMatch(/filter\([\s\S]{0,80}CERTIFICATE[\s\S]{0,40}\)\.length/);
  });

  it("completionChecks vẫn là nơi chặn tiếp nhận khi không còn ảnh GCN", () => {
    const checks = read("../src/modules/submissions/completion-checks.ts");
    expect(checks).toContain("FILES_CERTIFICATE_MISSING");
    expect(checks).toContain('record.fileSummaries.filter((file) => file.status === "UPLOADED")');
  });
});
