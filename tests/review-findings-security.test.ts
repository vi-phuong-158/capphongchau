import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("atomic consent audit", () => {
  it("submission, request log và consent audit nằm trong cùng repository transaction", () => {
    const source = read("../src/modules/public-intake/repository.ts");
    const create = source.slice(source.indexOf("async create(input:"), source.indexOf("async findCreation"));
    expect(create).toContain("database.begin");
    expect(create).toContain("insert into public.public_submissions");
    expect(create).toContain("insert into public.request_log");
    expect(create).toContain("await this.insertAudit(transaction");
    expect(create).toContain("consentAccepted: true");
    expect(create).toContain("ASSISTED_SUBMISSION_CREATED");
  });
});

describe("telemetry RLS", () => {
  it("migration mới force RLS, revoke client roles và không mở public policy", () => {
    const sql = read("../supabase/migrations/202607290001_public_upload_attempts_rls.sql");
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/force row level security/i);
    expect(sql).toMatch(/revoke all on table public\.public_upload_attempts from anon, authenticated/i);
    expect(sql).not.toMatch(/create policy/i);
    const database = read("../src/modules/supabase/database.ts");
    expect(database).toContain("SUPABASE_DATABASE_URL");
    expect(database).not.toMatch(/anon|authenticated/);
  });
});

describe("assisted submit separation", () => {
  it("route staff dùng auth + role + CSRF và tuyệt đối không Turnstile", () => {
    const route = read(
      "../src/app/api/staff/assisted-submissions/current/submit/route.ts",
    );
    expect(route).toContain("requireActiveUser(ASSISTED_INTAKE_ROLES)");
    expect(route).toContain("verifyCsrfToken");
    expect(route).not.toContain("verifyTurnstileToken");
    expect(route).toContain('record.intakeChannel !== "OFFICER_ASSISTED"');
  });

  it("UI chỉ yêu cầu challengeToken cho self-service", () => {
    const wizard = read("../src/app/ke-khai/wizard.tsx");
    expect(wizard).toContain('disabled={busy || (!assisted && !challengeToken)}');
    expect(wizard).toContain('"/api/staff/assisted-submissions/current/submit"');
  });
});
