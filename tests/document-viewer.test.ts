import { describe, expect, it } from "vitest";

import { documentFileLabel, type DocumentFile } from "@/components/admin/document-viewer";

const files: DocumentFile[] = [
  { fileId: "front-1", documentType: "CITIZEN_ID_FRONT", ownerId: "owner-1" },
  { fileId: "back-1", documentType: "CITIZEN_ID_BACK", ownerId: "owner-1" },
  { fileId: "certificate-1", documentType: "CERTIFICATE", ownerId: "" },
  { fileId: "front-2", documentType: "CITIZEN_ID_FRONT", ownerId: "owner-2" },
  { fileId: "certificate-2", documentType: "CERTIFICATE", ownerId: "" },
  { fileId: "back-2", documentType: "CITIZEN_ID_BACK", ownerId: "owner-2" },
];

describe("documentFileLabel", () => {
  it("labels CCCD by owner and certificate pages independently", () => {
    const labels = files.map((file) => documentFileLabel(file, files, ["owner-1", "owner-2"]));

    expect(labels).toEqual([
      "CCCD chủ 1 — mặt trước",
      "CCCD chủ 1 — mặt sau",
      "GCN trang 1",
      "CCCD chủ 2 — mặt trước",
      "GCN trang 2",
      "CCCD chủ 2 — mặt sau",
    ]);
  });
});
