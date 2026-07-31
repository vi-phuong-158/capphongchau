import path from "node:path";

import { describe, expect, it } from "vitest";

import type { AiExtractionPayload } from "@/modules/ai-extraction/draft";
import {
  decideResultOutcome,
  findPersonalInfoInFreeText,
  parseLocalDraftOptions,
  parseStoredLocalResult,
  resolveManifestFilePath,
} from "@/modules/ai-extraction/local-draft-support";
import type { ValidationIssue } from "../scripts/ai/validator";

const DRIVE_ROOT = "G:/My Drive/CSDL";
const SUBMISSION_ID = "231f9110-bed5-5e1f-92f1-cc6ef21c2fc5";

function issue(severity: ValidationIssue["severity"], code = "X"): ValidationIssue {
  return { code, message: "", severity };
}

function payloadWithNotes(
  qualityNote: string,
  evidenceNote = "",
  pageLabel = "",
): AiExtractionPayload {
  const empty = {
    value: null,
    sourceValue: null,
    status: "MANUAL_REQUIRED" as const,
    evidence: null,
  };
  return {
    quality: { documentType: "CERTIFICATE", imageStatus: "CLEAR", note: qualityNote },
    certificate: {
      issueNumber: {
        value: "DR 819131",
        sourceValue: "DR 819131",
        status: "CLEAR",
        evidence: { fileId: "file-1", pageLabel, note: evidenceNote },
      },
      issueDate: empty,
      registryNumber: empty,
    },
    unreadableFields: [],
  };
}

describe("parseLocalDraftOptions", () => {
  it("lấy thư mục Drive từ môi trường khi không truyền cờ", () => {
    expect(parseLocalDraftOptions(["list"], DRIVE_ROOT).driveRoot).toBe(DRIVE_ROOT);
  });

  it("cờ --drive-root thắng biến môi trường", () => {
    expect(parseLocalDraftOptions(["list", "--drive-root=D:/khac"], DRIVE_ROOT).driveRoot).toBe(
      "D:/khac",
    );
  });

  it("từ chối khi không có thư mục Drive nào", () => {
    expect(() => parseLocalDraftOptions(["list"], "")).toThrow(/Thiếu thư mục Drive/);
  });

  it("từ chối chế độ lạ", () => {
    expect(() => parseLocalDraftOptions(["apply"], DRIVE_ROOT)).toThrow(/Chế độ/);
  });

  it("từ chối tham số không đúng dạng --khoa=giatri", () => {
    expect(() => parseLocalDraftOptions(["list", "-x"], DRIVE_ROOT)).toThrow(/không hợp lệ/);
  });

  it("từ chối --limit ngoài khoảng", () => {
    expect(() => parseLocalDraftOptions(["list", "--limit=0"], DRIVE_ROOT)).toThrow(/--limit/);
    expect(() => parseLocalDraftOptions(["list", "--limit=201"], DRIVE_ROOT)).toThrow(/--limit/);
    expect(() => parseLocalDraftOptions(["list", "--limit=abc"], DRIVE_ROOT)).toThrow(/--limit/);
  });

  it("enqueue bắt buộc có --submission", () => {
    expect(() => parseLocalDraftOptions(["enqueue"], DRIVE_ROOT)).toThrow(/--submission/);
    expect(parseLocalDraftOptions(["enqueue", "--submission=sub-1"], DRIVE_ROOT).submissionId).toBe(
      "sub-1",
    );
  });

  it("submit bắt buộc đủ --job, --result và --model", () => {
    expect(() =>
      parseLocalDraftOptions(["submit", "--job=j1", "--result=r.json"], DRIVE_ROOT),
    ).toThrow(/--model/);
    const options = parseLocalDraftOptions(
      ["submit", "--job=j1", "--result=r.json", "--model=claude-opus-5"],
      DRIVE_ROOT,
    );
    expect(options).toMatchObject({ mode: "submit", jobId: "j1", modelName: "claude-opus-5" });
  });
});

describe("decideResultOutcome", () => {
  it("không lỗi, không cảnh báo thì job hoàn tất", () => {
    expect(decideResultOutcome([], 0)).toMatchObject({
      validationStatus: "PASSED",
      nextJobStatus: "COMPLETED",
    });
  });

  it("chỉ có cảnh báo thì cán bộ phải xem lại", () => {
    expect(decideResultOutcome([issue("WARNING")], 0)).toMatchObject({
      warningCount: 1,
      validationStatus: "REVIEW_REQUIRED",
      nextJobStatus: "NEEDS_REVIEW",
    });
  });

  it("lỗi chặn thì job bị cách ly", () => {
    expect(decideResultOutcome([issue("BLOCKING"), issue("WARNING")], 0)).toMatchObject({
      blockingCount: 1,
      validationStatus: "BLOCKED",
      nextJobStatus: "QUARANTINED",
    });
  });

  it("bằng chứng CLEAR trỏ ngoài manifest được tính là lỗi chặn", () => {
    expect(decideResultOutcome([], 2)).toMatchObject({
      blockingCount: 2,
      validationStatus: "BLOCKED",
      nextJobStatus: "QUARANTINED",
    });
  });
});

describe("resolveManifestFilePath", () => {
  it("dựng đúng đường dẫn originals của hồ sơ", () => {
    const filePath = resolveManifestFilePath(DRIVE_ROOT, SUBMISSION_ID, "CERTIFICATE-1-ab.jpg");
    expect(filePath).toBe(
      path.resolve(DRIVE_ROOT, "01_INBOX", SUBMISSION_ID, "originals", "CERTIFICATE-1-ab.jpg"),
    );
  });

  it("từ chối tên tệp có `..`", () => {
    expect(() =>
      resolveManifestFilePath(DRIVE_ROOT, SUBMISSION_ID, "../../../etc/passwd.jpg"),
    ).toThrow(/không đúng dạng máy chủ đặt/);
  });

  it("từ chối đường dẫn tuyệt đối", () => {
    expect(() => resolveManifestFilePath(DRIVE_ROOT, SUBMISSION_ID, "C:/Windows/x.jpg")).toThrow(
      /không đúng dạng máy chủ đặt/,
    );
  });

  it("từ chối separator và ký tự điều khiển trong tên tệp", () => {
    expect(() => resolveManifestFilePath(DRIVE_ROOT, SUBMISSION_ID, "a/b.jpg")).toThrow();
    expect(() => resolveManifestFilePath(DRIVE_ROOT, SUBMISSION_ID, "a\u0000.jpg")).toThrow();
  });

  it("từ chối mã hồ sơ có `..`", () => {
    expect(() => resolveManifestFilePath(DRIVE_ROOT, "../other", "CERTIFICATE-1-ab.jpg")).toThrow(
      /Mã hồ sơ không đúng dạng/,
    );
  });

  it("từ chối phần mở rộng không phải ảnh", () => {
    expect(() =>
      resolveManifestFilePath(DRIVE_ROOT, SUBMISSION_ID, "CERTIFICATE-1-ab.exe"),
    ).toThrow(/Phần mở rộng/);
  });

  it("chấp nhận các đuôi ảnh được phép, không phân biệt hoa thường", () => {
    for (const extension of ["jpg", "JPEG", "png", "webp", "heic", "HEIF"]) {
      expect(() =>
        resolveManifestFilePath(DRIVE_ROOT, SUBMISSION_ID, `CERTIFICATE-1-ab.${extension}`),
      ).not.toThrow();
    }
  });
});

describe("findPersonalInfoInFreeText", () => {
  it("bỏ qua ghi chú chỉ mô tả chất lượng ảnh", () => {
    expect(findPersonalInfoInFreeText(payloadWithNotes("Anh chup nghieng, chu nho."))).toEqual([]);
  });

  it("bắt nhãn định danh có dấu", () => {
    expect(findPersonalInfoInFreeText(payloadWithNotes("Địa chỉ thửa đất ghi ở trang 2."))).toEqual(
      ["quality.note"],
    );
  });

  it("bắt nhãn định danh viết không dấu", () => {
    expect(findPersonalInfoInFreeText(payloadWithNotes("Ho va ten chu su dung mo."))).toEqual([
      "quality.note",
    ]);
  });

  it("quét cả pageLabel và note của bằng chứng", () => {
    expect(
      findPersonalInfoInFreeText(payloadWithNotes("", "So dinh danh bi che", "ngay sinh")),
    ).toEqual([
      "certificate.issueNumber.evidence.pageLabel",
      "certificate.issueNumber.evidence.note",
    ]);
  });

  it("bắt CCCD/CMND viết tắt", () => {
    expect(findPersonalInfoInFreeText(payloadWithNotes("Anh co kem CCCD."))).toEqual([
      "quality.note",
    ]);
    expect(findPersonalInfoInFreeText(payloadWithNotes("Trang nay la CMND."))).toEqual([
      "quality.note",
    ]);
  });
});

describe("parseStoredLocalResult", () => {
  const valid = {
    resultId: "aires_1",
    resultVersion: 1,
    validationStatus: "REVIEW_REQUIRED",
    warningCount: 1,
    blockingCount: 0,
  };

  it("đọc được bản ghi hợp lệ dạng object", () => {
    expect(parseStoredLocalResult(valid)).toMatchObject(valid);
  });

  it("đọc được bản ghi hợp lệ dạng chuỗi JSON", () => {
    expect(parseStoredLocalResult(JSON.stringify(valid))).toMatchObject(valid);
  });

  it("trả null khi JSON hỏng", () => {
    expect(parseStoredLocalResult("{khong-phai-json")).toBeNull();
  });

  it("trả null khi thiếu trường hoặc sai kiểu", () => {
    expect(parseStoredLocalResult({ ...valid, resultId: "" })).toBeNull();
    expect(parseStoredLocalResult({ ...valid, resultVersion: 0 })).toBeNull();
    expect(parseStoredLocalResult({ ...valid, resultVersion: 1.5 })).toBeNull();
    expect(parseStoredLocalResult({ ...valid, validationStatus: "OK" })).toBeNull();
    expect(parseStoredLocalResult({ ...valid, warningCount: -1 })).toBeNull();
    expect(parseStoredLocalResult({ ...valid, blockingCount: "0" })).toBeNull();
  });

  it("trả null với mảng, null và giá trị nguyên thủy", () => {
    expect(parseStoredLocalResult([valid])).toBeNull();
    expect(parseStoredLocalResult(null)).toBeNull();
    expect(parseStoredLocalResult(42)).toBeNull();
  });
});
