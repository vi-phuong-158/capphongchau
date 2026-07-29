/**
 * Phase 8 — "Cán bộ tiếp nhận là ai?".
 *
 * Bất biến quan trọng nhất: **cổng công khai không bao giờ trả email cán bộ**. Email công vụ đưa
 * ra ngoài là địa chỉ thật có thể bị thu thập để gửi thư rác hoặc lừa đảo nhân danh phường.
 */
import { describe, expect, it } from "vitest";

import {
  assignedOfficerAccount,
  assignedOfficerLabel,
  publicAssignedOfficer,
  publicHasAssignedOfficer,
} from "@/modules/submissions/assigned-officer";
import type { PublicStatus } from "@/modules/public-intake/workflow";

const EMAIL = "nva@phongchau.example";
const NAME = "Nguyễn Văn A";

function source(overrides: Partial<{ claimedBy: string; claimedByDisplayName: string }> = {}) {
  return { claimedBy: EMAIL, claimedByDisplayName: NAME, ...overrides };
}

describe("Màn hình quản trị", () => {
  it("hiện tên cán bộ, email ở dòng phụ", () => {
    expect(assignedOfficerLabel(source())).toBe(NAME);
    expect(assignedOfficerAccount(source())).toBe(EMAIL);
  });

  it("hồ sơ cũ chưa có tên thì lùi về email, không có dòng phụ trùng lặp", () => {
    const legacy = source({ claimedByDisplayName: "" });
    expect(assignedOfficerLabel(legacy)).toBe(EMAIL);
    expect(assignedOfficerAccount(legacy)).toBe("");
  });

  it("chưa ai nhận thì hiện “Chưa nhận”", () => {
    expect(assignedOfficerLabel({ claimedBy: "", claimedByDisplayName: "" })).toBe("Chưa nhận");
    expect(assignedOfficerAccount({ claimedBy: "", claimedByDisplayName: "" })).toBe("");
  });

  it("tên chỉ có khoảng trắng coi như không có", () => {
    expect(assignedOfficerLabel(source({ claimedByDisplayName: "   " }))).toBe(EMAIL);
  });
});

describe("Cổng công khai — không bao giờ lộ email", () => {
  const active: PublicStatus[] = ["UNDER_REVIEW", "NEEDS_SUPPLEMENT", "RESUBMITTED", "ACCEPTING"];
  const inactive: PublicStatus[] = [
    "DRAFT",
    "SUBMITTED",
    "ACCEPTED",
    "REJECTED",
    "EXPIRED",
    "NO_ACTION_REQUIRED",
  ];

  it("trả đúng một trường displayName, không có email", () => {
    const result = publicAssignedOfficer({ ...source(), status: "UNDER_REVIEW" });
    expect(result).toEqual({ displayName: NAME });
    expect(JSON.stringify(result)).not.toContain(EMAIL);
    expect(JSON.stringify(result)).not.toContain("@");
  });

  it("chỉ trả khi hồ sơ đang được xử lý", () => {
    for (const status of active) {
      expect(publicAssignedOfficer({ ...source(), status }), status).not.toBeNull();
    }
    for (const status of inactive) {
      expect(publicAssignedOfficer({ ...source(), status }), status).toBeNull();
    }
  });

  it("hồ sơ cũ có email nhưng chưa có tên: KHÔNG trả email, chỉ báo đã phân công", () => {
    const legacy = { ...source({ claimedByDisplayName: "" }), status: "UNDER_REVIEW" as const };
    expect(publicAssignedOfficer(legacy)).toBeNull();
    expect(publicHasAssignedOfficer(legacy)).toBe(true);
  });

  it("chưa ai nhận thì không trả gì và không báo đã phân công", () => {
    const unclaimed = {
      claimedBy: "",
      claimedByDisplayName: "",
      status: "SUBMITTED" as const,
    };
    expect(publicAssignedOfficer(unclaimed)).toBeNull();
    expect(publicHasAssignedOfficer(unclaimed)).toBe(false);
  });

  it("hồ sơ đã đóng thì không báo đã phân công dù cột claimed_by còn giá trị cũ", () => {
    expect(publicHasAssignedOfficer({ ...source(), status: "ACCEPTED" })).toBe(false);
    expect(publicHasAssignedOfficer({ ...source(), status: "REJECTED" })).toBe(false);
  });
});
