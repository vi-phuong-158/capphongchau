/**
 * Đợt 2C (bổ sung thứ hai) — cán bộ gán lại chủ sử dụng của một ảnh CCCD.
 *
 * Vá lỗ mà cả thay ảnh lẫn gỡ ảnh đều không vá được: cán bộ tải nhầm ảnh CCCD của chủ 2 vào ô mặt
 * trước của chủ 1. Nếu chủ 1 chưa có ảnh nào khác thì "thay ảnh" không có gì để thay, còn "gỡ ảnh"
 * chỉ để lại một ô trống — ảnh đúng của chủ 2 biến mất, phải tải lại từ đầu dù ảnh vốn đã đúng, chỉ
 * sai nhãn. `PATCH .../files/:fileId` sửa đúng cái nhãn đó, không đụng tới tệp trên Drive.
 *
 * Bốn bất biến cần khóa, xếp theo mức độ nguy hiểm nếu sai:
 *
 *   1. **Không tự động đánh `REPLACED` ảnh đang có ở ô đích.** Reassign khác thay ảnh ở một điểm
 *      quan trọng: thay ảnh là "tôi vừa chụp ảnh mới cho đúng người", còn reassign là "tôi sửa nhãn
 *      của một ảnh cũ". Ảnh đang chiếm ô đích có thể đang đúng — tự động đẩy nó xuống lịch sử là im
 *      lặng phá một dữ liệu đúng để sửa một dữ liệu sai.
 *   2. **Chỉ ảnh CCCD**, không áp dụng cho `CERTIFICATE` — ảnh GCN không gắn với một chủ cụ thể.
 *   3. **Không tự viết lại cửa quyền** — vẫn `mayStaffEdit`, không nới hay thu hẹp.
 *   4. **Không đòi `idempotency-key`** vì "gán lại đúng chủ đang có" được coi là no-op thành công,
 *      nhưng đây là an toàn CÓ ĐIỀU KIỆN: phải có khóa hàng đích trong cùng transaction, nếu không
 *      hai yêu cầu gán lại đồng thời có thể cùng thấy "còn trống" rồi cùng ghi đè lên nhau.
 *
 * Test đọc mã nguồn vì route thật cần Supabase và phiên đăng nhập — cùng lý do và cùng cách làm với
 * `tests/officer-file-delete.test.ts`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

/** Bỏ chú thích trước khi khẳng định "mã nguồn KHÔNG chứa X" — xem các test 2C trước. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const route = read("../src/app/api/submissions/[submissionId]/files/[fileId]/route.ts");
const repository = read("../src/modules/public-intake/repository.ts");
const viewer = read("../src/components/admin/document-viewer.tsx");
const detail = read("../src/components/submission-detail.tsx");

const patchBody = code(route).slice(code(route).indexOf("export async function PATCH"));
const reassignMethod = repository.slice(
  repository.indexOf("async reassignFileOwner"),
  repository.indexOf("async submit(input:"),
);

describe("không im lặng ghi đè ảnh đang đúng ở ô đích", () => {
  it("có kiểm tra xung đột trước khi ghi, và ném lỗi thay vì tự động REPLACED", () => {
    expect(reassignMethod).toContain("FileOwnerReassignConflictError");
    // Đây là điểm khác biệt cốt lõi với appendFile — không được có dòng UPDATE ... REPLACED nào ở
    // gần chỗ phát hiện xung đột.
    expect(reassignMethod).not.toContain("REPLACED");
  });

  it("route dịch xung đột thành lỗi rõ ràng cho cán bộ, không phải 500", () => {
    expect(patchBody).toContain("FileOwnerReassignConflictError");
    expect(patchBody).toContain('"VERSION_CONFLICT"');
  });

  it("khóa cả hàng nguồn lẫn hàng đích trong cùng transaction — chống race hai gán lại đồng thời", () => {
    const collisionQuery = reassignMethod.slice(reassignMethod.indexOf("collision"));
    expect(reassignMethod).toMatch(/select owner_id, document_type, status[\s\S]{0,160}for update/);
    expect(collisionQuery).toMatch(/status = 'UPLOADED'\s*for update/);
  });
});

describe("chỉ ảnh CCCD gán lại được, không áp dụng cho Giấy chứng nhận", () => {
  it("repository từ chối CERTIFICATE trước khi chạm dữ liệu", () => {
    expect(reassignMethod).toContain('document_type === "CERTIFICATE"');
  });

  it("route cũng từ chối CERTIFICATE — hai lớp không lệch nhau", () => {
    expect(patchBody).toContain('file.documentType === "CERTIFICATE"');
  });

  it("nút gán lại ở viewer chỉ hiện khi ảnh KHÔNG phải Giấy chứng nhận", () => {
    expect(viewer).toContain('activeFile.documentType !== "CERTIFICATE"');
  });
});

describe("cửa quyền không rộng hơn, không hẹp hơn các route uploads/*", () => {
  it("đòi đủ ba lớp: phiên cán bộ, CSRF, mayStaffEdit", () => {
    expect(patchBody).toContain("requireActiveUser(SUBMISSION_DECISION_ROLES)");
    expect(patchBody).toContain("verifyCsrfToken(");
    expect(patchBody).toContain("mayStaffEdit(record, user.email)");
  });

  it("không tự viết lại điều kiện quyền", () => {
    expect(patchBody).not.toContain('status === "UNDER_REVIEW"');
    expect(patchBody).not.toContain("isClaimedBy(");
  });

  it("chủ đích đọc từ lớp dữ liệu đang có hiệu lực, không từ record.draft", () => {
    expect(patchBody).toContain("effectivePayload(record)?.owners");
    expect(code(patchBody)).not.toContain("record.draft");
  });

  it("vẫn chặn chủ đích là tổ chức (không có CCCD)", () => {
    expect(patchBody).toContain("requiresCitizenId(targetOwner.ownerType)");
  });

  it("giao diện gắn đúng điều kiện mayStaffEdit rồi mới truyền hàm gán lại xuống viewer", () => {
    const block = detail.slice(detail.indexOf("onReassignOwner={"));
    expect(block.slice(0, block.indexOf("}\n          />"))).toContain(
      'isClaimedByMe && submission.status === "UNDER_REVIEW"',
    );
    // Không truyền hàm = viewer không hiện nút. Quyền nằm đúng một nơi ở client.
    expect(viewer).toContain("Boolean(onReassignOwner)");
  });

  it("danh sách chủ đích lọc đúng requiresCitizenId ở phía client trước khi truyền xuống", () => {
    const block = detail.slice(
      detail.indexOf("reassignableOwners={"),
      detail.indexOf("onReassignOwner={"),
    );
    expect(block).toContain("requiresCitizenId(owner.ownerType as OwnerType)");
  });
});

describe("gọi lại an toàn — no-op khi gán đúng chủ đang có, không phải lỗi", () => {
  it("repository trả NOOP khi ownerId trùng chủ hiện tại, không ném lỗi", () => {
    expect(reassignMethod).toContain('if (current[0].owner_id === newOwnerId) return "NOOP";');
  });

  it("route chỉ ghi audit khi thật sự REASSIGNED, không ghi khi NOOP", () => {
    expect(patchBody).toContain('if (outcome === "REASSIGNED") {');
    const guarded = patchBody.slice(patchBody.indexOf('if (outcome === "REASSIGNED") {'));
    expect(guarded.slice(0, guarded.indexOf("\n    }"))).toContain("appendAudit");
  });

  it("không đòi header idempotency-key", () => {
    expect(code(patchBody)).not.toContain("idempotency-key");
  });
});

describe("chuyển owner_id có khóa dòng, không đọc-rồi-ghi hở, và refresh file_summary_json", () => {
  it("khóa dòng nguồn bằng for update trước khi đọc trạng thái", () => {
    expect(reassignMethod).toMatch(/where submission_id = \$\{submissionId\} and file_id = \$\{fileId\} for update/);
  });

  it("cập nhật lại file_summary_json sau khi đổi owner_id", () => {
    expect(reassignMethod).toContain("refreshFileSummaries(transaction, submissionId)");
  });

  it("chỉ đổi owner_id, không chạm document_type/mime_type/drive_file_id", () => {
    const updateStatement = reassignMethod.slice(reassignMethod.indexOf("update public.public_files"));
    expect(updateStatement.slice(0, updateStatement.indexOf("`;"))).toContain(
      "set owner_id = ${newOwnerId}, updated_at = now()",
    );
  });
});

describe("dấu vết và bảo mật thông tin", () => {
  it("ghi audit riêng cho việc gán lại chủ, không ghi ownerId", () => {
    expect(patchBody).toContain('action: "SUBMISSION_OFFICER_FILE_OWNER_REASSIGNED"');
    const audit = patchBody.slice(patchBody.indexOf("appendAudit"));
    const metadata = audit.slice(audit.indexOf("metadata:"), audit.indexOf("});"));
    expect(metadata).toContain("documentType");
    expect(metadata).not.toContain("ownerId");
  });

  it("mọi phản hồi đều no-store", () => {
    expect(code(patchBody)).not.toMatch(/NextResponse\.json\((?![\s\S]{0,300}?cache-control)/);
  });

  it("không có đường xóa hay chạm Drive nào trong PATCH", () => {
    expect(code(patchBody)).not.toContain("discardFile");
    expect(code(patchBody)).not.toContain("verifyUploadedFile");
    expect(code(patchBody)).not.toContain("markFileDeleted");
  });
});
