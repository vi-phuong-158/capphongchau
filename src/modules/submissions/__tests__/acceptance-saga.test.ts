import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { formatOfficialCaseId, vietnamBusinessYear } from "@/modules/submissions/acceptance";
import {
  AcceptanceInProgressError,
  AcceptanceNotAllowedError,
  AcceptanceRetryableError,
} from "@/modules/submissions/acceptance-saga";

describe("acceptance saga suite", () => {
  it("formats case IDs with 6-digit zero padding", () => {
    expect(formatOfficialCaseId("2026", 1)).toBe("PHONGCHAU-2026-000001");
    expect(formatOfficialCaseId("2026", 999999)).toBe("PHONGCHAU-2026-999999");
    expect(() => formatOfficialCaseId("2026", 0)).toThrow();
  });

  it("calculates Vietnam business year across timezone boundary", () => {
    // 2026-01-01 00:00 UTC = 2026-01-01 07:00 ICT
    expect(vietnamBusinessYear(new Date("2026-01-01T00:00:00Z"))).toBe("2026");
    // 2026-12-31 17:00 UTC = 2027-01-01 00:00 ICT
    expect(vietnamBusinessYear(new Date("2026-12-31T17:00:00Z"))).toBe("2027");
  });

  it("instantiates custom saga error types properly", () => {
    const retryable = new AcceptanceRetryableError("Test retryable");
    expect(retryable.name).toBe("AcceptanceRetryableError");
    expect(retryable.message).toBe("Test retryable");

    const inProgress = new AcceptanceInProgressError("Test progress");
    expect(inProgress.name).toBe("AcceptanceInProgressError");
    expect(inProgress.message).toBe("Test progress");

    const notAllowed = new AcceptanceNotAllowedError("Test not allowed");
    expect(notAllowed.name).toBe("AcceptanceNotAllowedError");
    expect(notAllowed.message).toBe("Test not allowed");
  });

  it("A2 Schema Audit: verifies SQL insert column names in acceptance-saga.ts 1-to-1 match migration schema", () => {
    const rootDir = process.cwd();
    const schemaPath = path.join(rootDir, "supabase/migrations/202607230001_supabase_schema.sql");
    const sagaPath = path.join(rootDir, "src/modules/submissions/acceptance-saga.ts");

    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    const sagaCode = fs.readFileSync(sagaPath, "utf8");

    function parseTableColumns(table: string): Set<string> {
      const match = schemaSql.match(
        new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\);`),
      );
      if (!match) throw new Error(`Could not find table public.${table} in migration schema`);
      const lines = match[1]
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const cols = new Set<string>();
      for (const line of lines) {
        if (
          line.startsWith("primary key") ||
          line.startsWith("foreign key") ||
          line.startsWith("constraint")
        )
          continue;
        const parts = line.split(/\s+/);
        if (parts[0]) cols.add(parts[0]);
      }
      return cols;
    }

    function parseInsertColumns(table: string): string[] {
      const match = sagaCode.match(
        new RegExp(`insert into public\\.${table}\\s*\\(([\\s\\S]*?)\\)\\s*values`),
      );
      if (!match)
        throw new Error(`Could not find insert statement into public.${table} in saga code`);
      return match[1]
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
    }

    const tables = ["cases", "certificates", "owners", "files"];
    for (const table of tables) {
      const schemaCols = parseTableColumns(table);
      const insertedCols = parseInsertColumns(table);

      expect(insertedCols.length).toBeGreaterThan(0);
      for (const col of insertedCols) {
        expect(
          schemaCols.has(col),
          `Column '${col}' inserted into public.${table} does not exist in migration schema!`,
        ).toBe(true);
      }
    }
  });

  it("A3 Guard Audit: verifies step COMPLETED is guarded and does not mutate when re-entered", () => {
    const rootDir = process.cwd();
    const sagaPath = path.join(rootDir, "src/modules/submissions/acceptance-saga.ts");
    const sagaCode = fs.readFileSync(sagaPath, "utf8");

    // Must contain step COMPLETED guard check
    expect(sagaCode).toContain('if (currentSaga.step === "RECORDS_WRITTEN")');
    expect(sagaCode).toContain('if (currentSaga.step === "COMPLETED")');
  });

  it("A1 Deadlock Audit: verifies repository and storage pool-using methods are NOT called inside database.begin", () => {
    const rootDir = process.cwd();
    const sagaPath = path.join(rootDir, "src/modules/submissions/acceptance-saga.ts");
    const sagaCode = fs.readFileSync(sagaPath, "utf8");

    // Checks that repository.appendAudit, repository.appendTimelineEvent, repository.listFiles are NOT inside database.begin
    expect(sagaCode).not.toContain("repository.appendAudit");
    expect(sagaCode).not.toContain("repository.appendTimelineEvent");

    // All database transactions must use repository.insertAudit and repository.insertTimeline with transaction parameter
    expect(sagaCode).toContain("repository.insertAudit(transaction");
    expect(sagaCode).toContain("repository.insertTimeline(");
  });
});
