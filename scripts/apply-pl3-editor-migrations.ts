/**
 * Áp hai migration của Bàn biên tập PL3 theo đúng thứ tự, mỗi file trong MỘT transaction.
 *
 *     npx tsx scripts/apply-pl3-editor-migrations.ts
 *
 * Cả hai file đều idempotent (`add column if not exists` / `drop column if exists`) nên chạy lại
 * là vô hại. Chạy thất bại giữa chừng thì transaction của file đó rollback nguyên vẹn; file đã
 * xong trước đó vẫn giữ — đúng thứ tự nên trạng thái trung gian vẫn hợp lệ.
 *
 * Không có `supabase_migrations.schema_migrations` trong project này (các migration trước được áp
 * thủ công), nên script không ghi bản ghi theo dõi — giữ nguyên cách làm đang có.
 */

import fs from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { getDatabase } from "@/modules/supabase/database";

const MIGRATIONS = [
  "202607290002_full_pl3_editor.sql",
  "202607290003_drop_working_payload_override_columns.sql",
] as const;

async function main(): Promise<void> {
  const database = getDatabase();

  for (const name of MIGRATIONS) {
    const file = path.join(process.cwd(), "supabase/migrations", name);
    const sql = fs.readFileSync(file, "utf8");
    process.stdout.write(`\n[ÁP] ${name} (${sql.length} byte)\n`);
    const startedAt = process.hrtime.bigint();
    try {
      await database.begin(async (transaction) => {
        await transaction.unsafe(sql);
      });
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      process.stdout.write(`[OK]  ${name} — ${ms.toFixed(0)} ms\n`);
    } catch (error) {
      process.stdout.write(
        `[LỖI] ${name} — đã rollback: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      await database.end();
      process.exit(1);
    }
  }

  await database.end();
  process.stdout.write("\nHoàn tất cả hai migration.\n");
}

main().catch((error: unknown) => {
  console.error("Áp migration thất bại:", error instanceof Error ? error.message : error);
  process.exit(1);
});
