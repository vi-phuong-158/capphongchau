import { describe, expect, it } from "vitest";

import {
  decideResultOutcome,
  parseLocalDraftOptions,
} from "@/modules/ai-extraction/local-draft-support";
import type { ValidationIssue } from "../scripts/ai/validator";

const DRIVE_ROOT = "G:/My Drive/CSDL";

function issue(severity: ValidationIssue["severity"], code = "X"): ValidationIssue {
  return { code, message: "", severity };
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
