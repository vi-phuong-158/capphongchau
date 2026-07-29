/**
 * `scripts/audit-orphan-public-files.ts` chạm Postgres + Google Drive thật, nên phần phân tích
 * tham số dòng lệnh và token xác nhận được tách sang `orphan-audit-support.ts` (thuần) để test
 * được ở đây mà không cần môi trường preview.
 */
import { describe, expect, it } from "vitest";

import {
  driveOrphanConfirmationToken,
  parseAuditOptions,
  type OrphanFinding,
} from "@/modules/public-intake/orphan-audit-support";

describe("parseAuditOptions", () => {
  it("mặc định chạy khô, giới hạn 500 hồ sơ", () => {
    const options = parseAuditOptions([]);
    expect(options.apply).toBe(false);
    expect(options.confirm).toBe("");
    expect(options.limit).toBe(500);
  });

  it("--apply và --confirm= đọc đúng", () => {
    const options = parseAuditOptions(["--apply", "--confirm=abc123"]);
    expect(options.apply).toBe(true);
    expect(options.confirm).toBe("abc123");
  });

  it("--limit= ghi đè giới hạn mặc định", () => {
    expect(parseAuditOptions(["--limit=50"]).limit).toBe(50);
  });

  it("--dry-run được chấp nhận nhưng không ảnh hưởng gì — mặc định vốn đã là chạy khô", () => {
    expect(parseAuditOptions(["--dry-run"]).apply).toBe(false);
  });
});

describe("driveOrphanConfirmationToken", () => {
  const orphanA: OrphanFinding = {
    kind: "DRIVE_ORPHAN",
    submissionId: "sub-1",
    driveFileId: "drive-a",
    sizeBytes: 1000,
  };
  const orphanB: OrphanFinding = {
    kind: "DRIVE_ORPHAN",
    submissionId: "sub-2",
    driveFileId: "drive-b",
    sizeBytes: 2000,
  };
  const missing: OrphanFinding = {
    kind: "MISSING_ON_DRIVE",
    submissionId: "sub-3",
    driveFileId: "drive-c",
    sizeBytes: 0,
  };

  it("không đổi theo thứ tự đầu vào — thứ tự tìm thấy không nên ảnh hưởng token", () => {
    expect(driveOrphanConfirmationToken([orphanA, orphanB])).toBe(
      driveOrphanConfirmationToken([orphanB, orphanA]),
    );
  });

  it("chỉ tính trên nhóm DRIVE_ORPHAN — MISSING_ON_DRIVE không được quyền xóa nên không tham gia token", () => {
    expect(driveOrphanConfirmationToken([orphanA])).toBe(
      driveOrphanConfirmationToken([orphanA, missing]),
    );
  });

  it("đổi khi tập tệp đổi — không dùng lại token của lần chạy trước cho tập khác", () => {
    expect(driveOrphanConfirmationToken([orphanA])).not.toBe(
      driveOrphanConfirmationToken([orphanA, orphanB]),
    );
  });

  it("danh sách rỗng vẫn ra một token ổn định, không ném lỗi", () => {
    expect(() => driveOrphanConfirmationToken([])).not.toThrow();
    expect(driveOrphanConfirmationToken([])).toHaveLength(16);
  });
});
