import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const page = read("../src/app/submissions/[submissionId]/page.tsx");
const detail = read("../src/components/submission-detail.tsx");
const viewer = read("../src/components/admin/document-viewer.tsx");
const previewRoute = read("../src/app/api/submissions/[submissionId]/files/[fileId]/route.ts");
const repository = read("../src/modules/public-intake/repository.ts");

describe("Phase 2 detail performance contracts", () => {
  it("server-primes the detail and does not client-fetch it on mount", () => {
    expect(page).toContain("loadStaffSubmissionDetail");
    expect(page).toContain("initialSubmission={initialSubmission}");
    expect(detail).toContain("readonly initialSubmission: StaffSubmissionDetail");
    expect(detail).not.toContain("useEffect(() =>");
  });

  it("defers AI and image preview until an explicit interaction", () => {
    expect(detail).toContain("const [aiPanelOpen, setAiPanelOpen] = useState(false)");
    expect(detail).toContain("{aiPanelOpen && (");
    expect(viewer).toContain("const [previewFileId, setPreviewFileId] = useState<string | null>(null)");
    expect(viewer).toContain("onClick={() => setPreviewFileId(activeFile.fileId)}");
    expect(viewer).toContain("{imageSrc ? (");
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
    expect(previewRoute).not.toContain("repository.findById(submissionId)");
    expect(previewRoute).not.toContain("repository.listFiles(submissionId)");
    expect(previewRoute).toContain("preview_db;dur=");
    expect(previewRoute).toContain("preview_drive;dur=");
  });
});
