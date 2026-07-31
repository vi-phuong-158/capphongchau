/**
 * Hợp đồng hiệu năng của màn duyệt hồ sơ (Phase 2) — những thứ **không thấy được** trong một test
 * hành vi vì chúng là quan hệ giữa nhiều tệp, và mất đi thì không có gì đỏ:
 *
 *   1. Trang server nạp sẵn hồ sơ, client **không** fetch lại khi đã có dữ liệu nạp sẵn.
 *   2. Kết quả AI và ảnh xem trước chỉ tải khi cán bộ **bấm**, không tải khi mở hồ sơ.
 *   3. Route ảnh xem trước chỉ truy vấn đúng một tệp và chỉ phát ra số đo thời gian.
 *
 * Hành vi của từng đường ghi/đọc được khóa ở test hành vi riêng (`submission-detail-load`,
 * `officer-file-*`); tệp này chỉ canh ba quan hệ trên.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const page = read("../src/app/submissions/[submissionId]/page.tsx");
const detail = read("../src/components/submission-detail.tsx");
const viewer = read("../src/components/admin/document-viewer.tsx");
const aiPanel = read("../src/components/admin/ai-draft-panel.tsx");
const previewRoute = read("../src/app/api/submissions/[submissionId]/files/[fileId]/route.ts");
const repository = read("../src/modules/public-intake/repository.ts");
const detailService = read("../src/modules/submissions/detail.ts");

describe("Phase 2 detail performance contracts", () => {
  it("server-primes the detail and does not client-fetch it when priming succeeded", () => {
    expect(page).toContain("loadStaffSubmissionDetail");
    expect(page).toContain("initialSubmission={initialSubmission}");
    expect(detail).toContain("readonly initialSubmission?: Submission | null;");
    // Có dữ liệu nạp sẵn thì thoát sớm khỏi effect — không thêm một vòng fetch + một dòng audit nữa.
    expect(detail).toContain("if (initialSubmission) return;");
  });

  it("đọc hồ sơ và danh sách ảnh song song, chỉ có MỘT service đọc chi tiết", () => {
    expect(detailService).toContain("await Promise.all([");
    // `detail-view.ts` từng là service thứ hai cùng chức năng, đọc nối tiếp — đã gỡ, đừng dựng lại.
    expect(page).not.toContain("detail-view");
    expect(detail).not.toContain("detail-view");
  });

  it("defers AI and image preview until an explicit interaction", () => {
    // Panel AI tự quản việc mở/tải: chỉ fetch khi `open`, và tải lại khi version đổi nếu đang mở.
    expect(aiPanel).toContain("const [open, setOpen] = useState(false)");
    expect(aiPanel).toContain("if (!open || loadedVersion === version) return;");
    expect(detail).toContain("<AiDraftPanel");

    // Ảnh: mở hồ sơ không kéo byte ảnh nào; phải bấm "Xem ảnh" cho đúng tệp đó.
    expect(viewer).toContain("const [revealedFileIds, setRevealedFileIds] = useState");
    expect(viewer).toContain("onClick={() => reveal(activeFile.fileId)}");
    expect(viewer).toContain("Xem ảnh");
    expect(viewer).toContain("const revealed = revealedFileIds.includes(activeFile.fileId);");
    // Không có effect nào tự yêu cầu ảnh của tệp đang chọn.
    expect(viewer).not.toContain("requestPreview(activeFileId)");
    // Khung nhỏ và khung toàn màn hình dùng chung một object URL — không tải ảnh hai lần.
    expect(viewer).toContain("{fullscreen && imageSrc && (");
  });

  it("scopes a preview lookup to one active file and exposes only timing metrics", () => {
    const lookup = repository.slice(
      repository.indexOf("async findActiveFile"),
      repository.indexOf("async markFileReplaced"),
    );
    expect(lookup).toContain("where submission_id = ${submissionId}");
    expect(lookup).toContain("and file_id = ${fileId}");
    expect(lookup).toContain("and status = 'UPLOADED'");
    expect(previewRoute).toContain("repository.findActiveFile(submissionId, fileId)");
    // GET ảnh không được thêm một lượt đọc hồ sơ nào: `findActiveFile` đã lọc theo `submissionId`.
    const previewGet = previewRoute.slice(
      previewRoute.indexOf("export async function GET"),
      previewRoute.indexOf("export async function DELETE"),
    );
    expect(previewGet).not.toContain("repository.findById(submissionId)");
    expect(previewGet).not.toContain("repository.listFiles(submissionId)");
    expect(previewRoute).toContain("preview_db;dur=");
    expect(previewRoute).toContain("preview_drive;dur=");
  });
});
