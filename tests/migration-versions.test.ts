import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase migration file version integrity", () => {
  it("should have unique version timestamps for all migration files in supabase/migrations", () => {
    const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
    const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));

    const versions: string[] = [];
    const duplicates: string[] = [];

    for (const file of files) {
      const match = /^(\d{12})_/.exec(file);
      expect(match, `Migration filename '${file}' must start with a 12-digit timestamp prefix (YYYYMMDDHHMM_).`).not.toBeNull();

      const version = match![1];
      if (versions.includes(version)) {
        duplicates.push(version);
      } else {
        versions.push(version);
      }
    }

    expect(
      duplicates,
      `Found duplicate migration version timestamps: ${duplicates.join(", ")}. Every migration file must have a unique timestamp prefix.`,
    ).toEqual([]);
  });
});
