import { describe, expect, it } from "vitest";

import { CaseStatus, NEIGHBORHOODS, UserRole } from "@/modules/common/domain";

describe("domain nền", () => {
  it("cố định đúng mười tổ dân phố của Phường Phong Châu", () => {
    expect(NEIGHBORHOODS).toHaveLength(10);
    expect(NEIGHBORHOODS).toContain("Hà Thạch");
    expect(NEIGHBORHOODS).toContain("Thống Nhất");
  });

  it("công bố các enum nghiệp vụ không dùng chuỗi tùy ý", () => {
    expect(UserRole.SYSTEM_ADMIN).toBe("SYSTEM_ADMIN");
    expect(CaseStatus.DRAFT).toBe("DRAFT");
  });
});
