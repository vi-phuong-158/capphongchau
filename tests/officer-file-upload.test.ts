/**
 * Đợt 2C — cán bộ tự tải ảnh giấy tờ bổ sung vào hồ sơ.
 *
 * Hai route mới ghi vào **cùng thư mục Drive và cùng bảng `public_files`** với đường của người dân,
 * nên bất biến đáng sợ nhất vẫn là bất biến của Phase 5: không bao giờ xóa một tệp mà cơ sở dữ liệu
 * đã nhận. Thêm vào đó là ba thứ chỉ đường cán bộ mới có:
 *
 *   1. **Cửa quyền.** Route nằm ngoài `matcher` của proxy Edge (`/api/submissions/*` không có
 *      trong đó), nên `requireActiveUser` + `verifyCsrfToken` + `mayStaffEdit` trong route là lớp
 *      chặn **duy nhất**. Thiếu một cái là mở đường ghi ảnh vào hồ sơ người khác.
 *   2. **Loại `request_log` riêng.** Dùng chung `PUBLIC_UPLOAD_COMPLETE` là hai đường đọc được
 *      replay của nhau: cán bộ gửi lại một khóa mà hộ dân đã dùng sẽ nhận về `fileId` của hộ dân.
 *   3. **Chủ sử dụng đọc từ lớp đang có hiệu lực,** không từ `draft_json`. Chủ do cán bộ thêm ở Bàn
 *      làm việc chỉ tồn tại ở `working_payload`; đọc `draft_json` là không gắn được ảnh CCCD cho họ.
 *
 * Test đọc mã nguồn vì hai route thật cần Supabase, Google Drive và phiên đăng nhập — cùng lý do và
 * cùng cách làm với `tests/public-upload-complete-route.test.ts`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MAX_CERTIFICATE_PHOTOS,
  SUBMISSION_BYTE_BUDGET,
} from "@/modules/public-intake/upload-commit";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

/**
 * Bỏ chú thích trước khi khẳng định "mã nguồn KHÔNG chứa X".
 *
 * Không có bước này thì mọi ca phủ định đều dính bẫy: chính chú thích giải thích *vì sao không dùng*
 * `resolvePublicRequest` hay `record.draft` lại làm ca đỏ. Tệ hơn là chiều ngược lại — muốn cho xanh
 * thì phải xóa đúng đoạn giải thích đáng giữ nhất.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const initiate = read("../src/app/api/submissions/[submissionId]/uploads/initiate/route.ts");
const complete = read("../src/app/api/submissions/[submissionId]/uploads/complete/route.ts");
const citizenInitiate = read(
  "../src/app/api/public/submissions/current/uploads/initiate/route.ts",
);
const uploadCommit = read("../src/modules/public-intake/upload-commit.ts");
const repository = read("../src/modules/public-intake/repository.ts");
const detail = read("../src/components/submission-detail.tsx");

const officerRoutes = [
  ["initiate", initiate],
  ["complete", complete],
] as const;

describe("cửa quyền của đường tải ảnh cán bộ", () => {
  it.each(officerRoutes)("%s tự kiểm phiên, CSRF và quyền sửa hồ sơ", (_name, source) => {
    // Proxy Edge không chặn `/api/submissions/*`, nên ba lớp này là lớp chặn duy nhất.
    expect(source).toContain("requireActiveUser(SUBMISSION_DECISION_ROLES)");
    expect(source).toContain("verifyCsrfToken(");
    expect(source).toContain("mayStaffEdit(record, user.email)");
  });

  it.each(officerRoutes)("%s không nhận CSRF qua header của bề mặt công khai", (_name, source) => {
    // `x-public-csrf-token` là token của phiên kê khai ẩn danh, không chứng minh được cán bộ nào.
    expect(source).toContain('request.headers.get("x-csrf-token")');
    expect(code(source)).not.toContain("x-public-csrf-token");
  });

  it.each(officerRoutes)("%s không dùng cửa của bề mặt công khai", (_name, source) => {
    // `resolvePublicRequest` xác thực bằng cookie phiên kê khai — dùng ở đây là nhận diện sai người.
    expect(code(source)).not.toContain("resolvePublicRequest");
    expect(code(source)).not.toContain("publicError");
  });

  /**
   * `mayStaffEdit` = đang giữ hồ sơ **và** `UNDER_REVIEW`. Nếu route tự viết lại điều kiện thay vì
   * gọi hàm dùng chung thì một ngày nghiệp vụ đổi, `PATCH` đổi theo mà hai route này nằm lại.
   */
  it.each(officerRoutes)("%s không tự viết lại điều kiện quyền sửa", (_name, source) => {
    expect(code(source)).not.toContain('status === "UNDER_REVIEW"');
    expect(code(source)).not.toContain("isClaimedBy(");
  });
});

describe("giới hạn là giới hạn của hồ sơ, không của một đường", () => {
  it("hai đường dùng chung hằng số trần, không có bản sao thứ hai", () => {
    for (const source of [initiate, citizenInitiate]) {
      expect(source).toContain('from "@/modules/public-intake/upload-commit"');
      // Khai lại hằng số cục bộ là mở đường cho hai bên lệch nhau.
      expect(code(source)).not.toMatch(/const (MAX_CERTIFICATE_PHOTOS|SUBMISSION_BYTE_BUDGET) =/);
    }
    expect(MAX_CERTIFICATE_PHOTOS).toBe(10);
    expect(SUBMISSION_BYTE_BUDGET).toBe(150 * 1024 * 1024);
  });

  it("ngân sách byte đếm toàn bộ ảnh của hồ sơ và trừ đúng ảnh bị thay", () => {
    expect(initiate).toContain(
      "files.reduce((sum, file) => sum + file.sizeBytes, 0) - (replaceTarget?.sizeBytes ?? 0)",
    );
  });

  it("đọc danh sách ảnh từ cơ sở dữ liệu, không từ bản chụp trong record", () => {
    // `record.fileSummaries` là bản chụp của phiên người dân; đường cán bộ không có phiên nào.
    expect(initiate).toContain("await repository.listFiles(submissionId)");
    expect(code(initiate)).not.toContain("record.fileSummaries");
  });
});

describe("không im lặng ghi đè bằng chứng đang dùng", () => {
  /**
   * `appendFile` tự đánh `REPLACED` cho ảnh cùng chủ + cùng mặt CCCD. Nếu route không chặn thì một
   * lần bấm nhầm đẩy ảnh đang dùng xuống lịch sử mà cán bộ không hề biết mình vừa thay gì.
   */
  it("initiate từ chối ảnh CCCD trùng chỗ khi không kèm replaceFileId", () => {
    expect(initiate).toContain("if (existing && existing.fileId !== replaceFileId)");
    expect(initiate).toContain("if (!existing && replaceFileId)");
  });

  it("complete kiểm lại trạng thái thay ảnh trên nguồn thật, không tin initiate", () => {
    // Giữa hai lượt gọi, ảnh có thể đã được thêm ở tab khác hoặc chính lượt này là lần thử thứ hai.
    const body = complete.slice(complete.indexOf("mayStaffEdit"));
    expect(body).toContain("await repository.listFiles(submissionId)");
    expect(body).toContain("(existing && existing.fileId !== replaceFileId) || (!existing && replaceFileId)");
  });

  it("initiate không cho thay ảnh khác loại giấy tờ", () => {
    expect(initiate).toContain("replaceTarget.documentType !== documentType");
  });

  it("ảnh cũ chuyển REPLACED chứ không bị xóa khỏi Drive", () => {
    const method = repository.slice(repository.indexOf("async appendFile"));
    expect(method).toContain("set status = 'REPLACED'");
    expect(code(complete)).not.toContain(".discardFile(");
  });
});

describe("chủ sử dụng đọc từ lớp dữ liệu đang có hiệu lực", () => {
  it.each(officerRoutes)("%s dùng effectivePayload, không dùng record.draft", (_name, source) => {
    expect(source).toContain("effectivePayload(record)?.owners");
    expect(code(source)).not.toContain("record.draft");
  });

  it.each(officerRoutes)("%s vẫn chặn chủ là tổ chức (không có CCCD)", (_name, source) => {
    expect(source).toContain("requiresCitizenId(owner.ownerType)");
  });
});

describe("chống gửi trùng không lẫn với đường của người dân", () => {
  it("dùng loại request_log riêng ở cả khóa, tra cứu và lúc ghi", () => {
    expect(complete).toContain("`OFFICER_UPLOAD_COMPLETE:${submissionId}:${rawIdempotencyKey}`");
    expect(complete).toContain(
      'findStoredMutation(idempotencyKey, "OFFICER_UPLOAD_COMPLETE")',
    );
    expect(complete).toContain('kind: "OFFICER_UPLOAD_COMPLETE"');
  });

  it("appendFile ghi đúng loại được truyền vào, mặc định là đường người dân", () => {
    const method = repository.slice(repository.indexOf("async appendFile"));
    expect(method).toContain('${idempotencyOptions.kind ?? "PUBLIC_UPLOAD_COMPLETE"}');
    // Loại là danh mục đóng — không nhận chuỗi tùy ý từ bên gọi.
    expect(repository).toContain(
      'kind?: "PUBLIC_UPLOAD_COMPLETE" | "OFFICER_UPLOAD_COMPLETE";',
    );
  });

  /**
   * Cùng lý do như đường người dân: sau lần commit đầu, chính ảnh vừa nhận làm kiểm tra "đã có ảnh
   * CCCD" thất bại. Nếu nhánh đó chạy trước replay thì lần gọi lại (response đầu mất mạng) sẽ đi
   * vào cửa dọn dẹp và xóa mất tệp mà cơ sở dữ liệu đang trỏ tới.
   */
  it("replay được xử lý TRƯỚC mọi kiểm tra trạng thái", () => {
    const replayLookup = complete.indexOf("const replay = await repository.findStoredMutation");
    const stateChecks = complete.indexOf("mayStaffEdit(record, user.email)");
    expect(replayLookup).toBeGreaterThan(0);
    expect(replayLookup).toBeLessThan(stateChecks);
  });

  it("khóa trùng nhưng nội dung khác thì báo xung đột, không ghi thêm", () => {
    expect(complete).toContain("replay.mutationHash !== mutationHash");
    // Người thao tác nằm trong hash: hai cán bộ dùng cùng khóa không được coi là một thao tác.
    expect(complete).toContain("actorEmail: user.email");
  });
});

describe("dọn tệp mồ côi dùng chung một cửa với đường người dân", () => {
  it("complete không tự gọi discardFile trên bất kỳ đường lỗi nào", () => {
    expect(complete).toContain('from "@/modules/public-intake/upload-commit"');
    expect(code(complete)).not.toContain("discardFile");
  });

  it("mọi nhánh thất bại sau khi tệp đã lên Drive đều đi qua discardIfOrphan", () => {
    // Đếm để một nhánh lỗi mới thêm vào mà quên dọn thì lệch số và ca này đỏ.
    const occurrences = complete.match(/await discardIfOrphan\(/g) ?? [];
    expect(occurrences.length).toBe(8);
    expect(complete).toMatch(/await discardIfOrphan\([\s\S]{0,120}?\);\s*\n\s*throw error;/);
  });

  it("cửa dọn dẹp vẫn nghiêng về GIỮ LẠI khi không hỏi được", () => {
    expect(uploadCommit).toContain("isDriveFileAdopted(driveFileId).catch(() => true)");
    expect(uploadCommit).toContain(".catch(() => false)");
  });
});

describe("dấu vết và bảo mật thông tin", () => {
  it("ghi một dòng audit cho việc cán bộ bổ sung ảnh", () => {
    expect(complete).toContain('action: "SUBMISSION_OFFICER_FILE_UPLOADED"');
    expect(complete).toContain("actorEmail: user.email");
  });

  it("audit không mang PII, tên tệp hay Drive ID", () => {
    const audit = complete.slice(complete.indexOf("appendAudit"));
    const metadata = audit.slice(audit.indexOf("metadata:"), audit.indexOf("});"));
    expect(metadata).toContain("documentType");
    expect(metadata).not.toContain("driveFileId");
    expect(metadata).not.toContain("fileName");
    expect(metadata).not.toContain("ownerId");
  });

  it("tên tệp trong kho do máy chủ đặt, không ghép mảnh nào của tên client", () => {
    expect(initiate).toContain(
      "const fileName = `OFFICER-${documentType}-${Date.now()}-${randomUUID().slice(0, 8)}",
    );
    expect(initiate).toContain("extensionFromMimeType(mimeType)");
    expect(code(initiate)).not.toMatch(/body\.data\.fileName[\s\S]{0,40}\$\{/);
  });

  it("không trả Drive ID hay URL phiên ra response thành công", () => {
    const success = code(complete).slice(code(complete).indexOf("appendAudit"));
    expect(success).not.toContain("driveFileId:");
  });

  it("mọi phản hồi đều no-store — hồ sơ và ảnh giấy tờ là PII", () => {
    for (const source of [initiate, complete]) {
      expect(code(source)).not.toMatch(/NextResponse\.json\((?![\s\S]{0,400}?cache-control)/);
    }
  });
});

describe("giao diện chỉ hiện nút khi đúng điều kiện", () => {
  it("nút tải ảnh gắn đúng điều kiện của mayStaffEdit ở client", () => {
    expect(detail).toContain(
      'isClaimedByMe && submission.status === "UNDER_REVIEW" && (',
    );
    expect(detail).toContain("<OfficerFileUpload");
  });

  it("tải lại hồ sơ sau khi thêm ảnh để khung xem ảnh thấy ảnh mới", () => {
    const block = detail.slice(detail.indexOf("<OfficerFileUpload"));
    expect(block.slice(0, block.indexOf("/>"))).toContain("loadSubmission(submission.submissionId)");
  });
});
