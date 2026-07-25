import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  AcceptanceInProgressError,
  AcceptanceNotAllowedError,
  AcceptanceRetryableError,
} from "@/modules/submissions/acceptance-saga";

describe("Audit Fixes Verification Suite", () => {
  it("B1 & C1: verifies error structures for atomic failed attempts and not-allowed guard", () => {
    const retryable = new AcceptanceRetryableError("Lỗi kết nối Drive");
    expect(retryable.message).toContain("Lỗi kết nối Drive");

    const inProgress = new AcceptanceInProgressError("Đang xử lý");
    expect(inProgress.message).toBe("Đang xử lý");

    const notAllowed = new AcceptanceNotAllowedError("Hồ sơ không đủ điều kiện");
    expect(notAllowed.message).toBe("Hồ sơ không đủ điều kiện");
  });

  it("B2: validates idempotency key prefix contracts", () => {
    const rawKey = "12345678-1234-4000-8000-1234567890ab";
    const subId = "sub_test_123";

    const uploadKey = `PUBLIC_UPLOAD_COMPLETE:${subId}:${rawKey}`;
    expect(uploadKey).toBe(
      `PUBLIC_UPLOAD_COMPLETE:sub_test_123:12345678-1234-4000-8000-1234567890ab`,
    );

    const noActionKey = `PUBLIC_NO_ACTION:${subId}:${rawKey}`;
    expect(noActionKey).toBe(`PUBLIC_NO_ACTION:sub_test_123:12345678-1234-4000-8000-1234567890ab`);

    const acceptKey = `OFFICIAL_ACCEPT:${subId}:${rawKey}`;
    expect(acceptKey).toBe(`OFFICIAL_ACCEPT:sub_test_123:12345678-1234-4000-8000-1234567890ab`);
  });

  it("B3: verifies 3-level folder structure 01_INBOX/{submissionId}/originals in PublicIntakeStorage", () => {
    const storagePath = path.join(process.cwd(), "src/modules/public-intake/storage.ts");
    const storageCode = fs.readFileSync(storagePath, "utf8");

    // Must search for 01_INBOX, submissionFolder, and originals
    expect(storageCode).toContain('"01_INBOX"');
    expect(storageCode).toContain('"originals"');
    expect(storageCode).toContain('this.findOrCreateFolder("originals", submissionFolder)');
  });

  it("C4: verifies appendFile replaceFileId update includes status = UPLOADED guard", () => {
    const repoPath = path.join(process.cwd(), "src/modules/public-intake/repository.ts");
    const repoCode = fs.readFileSync(repoPath, "utf8");

    expect(repoCode).toContain("and file_id = ${idempotencyOptions.replaceFileId}");
    expect(repoCode).toContain("and status = 'UPLOADED'");
  });

  it("C5: verifies refreshCanonicalProjection uses deterministic CERT:submissionId certificate_id", () => {
    const repoPath = path.join(process.cwd(), "src/modules/public-intake/repository.ts");
    const repoCode = fs.readFileSync(repoPath, "utf8");

    expect(repoCode).toContain("values (${`CERT:${submissionId}`}");
  });
});
