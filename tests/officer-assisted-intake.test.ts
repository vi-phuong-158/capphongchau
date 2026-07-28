/**
 * Phase 7 — chế độ cán bộ hỗ trợ kê khai.
 *
 * Bất biến quan trọng nhất: **client không có đường nào tự khai hồ sơ là do cán bộ nhập hộ**.
 * Nhãn `OFFICER_ASSISTED` chỉ được sinh ra từ một route đã xác thực nhân viên; mất bất biến này
 * thì việc phân biệt nguồn hồ sơ trở nên vô nghĩa.
 *
 * Các test đọc mã nguồn thay vì gọi route thật: route cần Supabase, Google Drive và next-auth,
 * không dựng được trong unit test. Đọc mã nguồn vẫn bắt được đúng loại hồi quy đáng sợ nhất ở đây
 * — ai đó nối `channel` từ body request vào service.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { INTAKE_CHANNELS } from "@/modules/public-intake/repository";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const publicRoute = read("../src/app/api/public/submissions/route.ts");
const staffRoute = read("../src/app/api/staff/assisted-submissions/route.ts");
const service = read("../src/modules/public-intake/create-submission.ts");
const migration = read("../supabase/migrations/202607280002_officer_assisted_intake.sql");

describe("Kênh tiếp nhận", () => {
  it("chỉ có đúng hai giá trị", () => {
    expect([...INTAKE_CHANNELS]).toEqual(["SELF_SERVICE", "OFFICER_ASSISTED"]);
  });

  it("migration ràng buộc đúng hai giá trị đó ở tầng cơ sở dữ liệu", () => {
    expect(migration).toContain("intake_channel in ('SELF_SERVICE', 'OFFICER_ASSISTED')");
  });

  it("hồ sơ cũ mặc định là hộ dân tự kê khai", () => {
    expect(migration).toContain("default 'SELF_SERVICE'");
  });

  it("migration bắt buộc có dấu vết cán bộ khi kênh là OFFICER_ASSISTED", () => {
    // Thiếu ràng buộc này thì một lỗi lập trình có thể ghi OFFICER_ASSISTED mà bỏ trống người
    // thực hiện, và hồ sơ đó vĩnh viễn không truy được về ai.
    expect(migration).toContain("public_submissions_assisted_actor_check");
    expect(migration).toContain("assisted_by_email is not null");
    expect(migration).toContain("assisted_at is not null");
  });
});

describe("Cổng công khai không thể tạo hồ sơ mang nhãn cán bộ", () => {
  it("gán cứng SELF_SERVICE", () => {
    expect(publicRoute).toContain('channel: "SELF_SERVICE"');
  });

  it("không đọc channel hay assistedBy từ body request", () => {
    expect(publicRoute).not.toMatch(/body\.(channel|assistedBy|intakeChannel)/);
    expect(publicRoute).not.toContain("OFFICER_ASSISTED");
  });
});

describe("Route cán bộ tự bảo vệ, không chỉ dựa vào proxy Edge", () => {
  it("đòi phiên đăng nhập còn hiệu lực và đúng vai trò", () => {
    expect(staffRoute).toContain("requireActiveUser(SUBMISSION_READ_ROLES)");
  });

  it("đòi CSRF", () => {
    expect(staffRoute).toContain("verifyCsrfToken");
  });

  it("lấy danh tính cán bộ từ phiên, không từ body", () => {
    expect(staffRoute).toContain(
      "assistedBy: { email: user.email, displayName: user.displayName }",
    );
    expect(staffRoute).not.toMatch(/body\.(assistedBy|assistedByEmail|channel)/);
  });

  it("ghi audit khi tạo hồ sơ hộ dân", () => {
    expect(staffRoute).toContain("ASSISTED_SUBMISSION_CREATED");
  });

  it("phân biệt chưa đăng nhập (401) với không đủ quyền (403)", () => {
    // Gộp cả hai vào 401 sẽ đá cán bộ về trang đăng nhập trong khi họ đã đăng nhập sẵn.
    expect(staffRoute).toContain('error.kind === "UNAUTHENTICATED"');
    expect(staffRoute).toContain("403");
  });

  it("vẫn tôn trọng chế độ tạm dừng tiếp nhận", () => {
    expect(staffRoute).toContain('PUBLIC_INTAKE_MODE === "PAUSED"');
  });

  it("không trả stack hay dữ liệu nội bộ khi lỗi", () => {
    expect(staffRoute).not.toContain("error.stack");
    expect(staffRoute).not.toContain("String(error)");
  });
});

describe("Service tạo hồ sơ dùng chung", () => {
  it("cả hai route gọi cùng một hàm — không có hai bản idempotency song song", () => {
    expect(publicRoute).toContain("createIntakeSubmission");
    expect(staffRoute).toContain("createIntakeSubmission");
    expect(service).toContain("export async function createIntakeSubmission");
  });

  it("channel là tham số bắt buộc, buộc mỗi route phải nói rõ mình là ai", () => {
    expect(service).toContain("readonly channel: IntakeChannel;");
  });

  it("chỉ ghi dấu vết cán bộ khi kênh đúng là OFFICER_ASSISTED", () => {
    const repository = read("../src/modules/public-intake/repository.ts");
    expect(repository).toContain(
      'const assisted = channel === "OFFICER_ASSISTED" ? (input.assistedBy ?? null) : null;',
    );
  });
});
