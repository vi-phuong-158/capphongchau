import postgres, { type Sql } from "postgres";

import { loadSupabaseEnvironment } from "@/modules/common/env";

const globalDatabase = globalThis as typeof globalThis & { __landOcrSupabaseSql?: Sql };

/** Kết nối PostgreSQL phía server qua Supavisor transaction pooler. */
export function getDatabase(): Sql {
  if (globalDatabase.__landOcrSupabaseSql) return globalDatabase.__landOcrSupabaseSql;

  const environment = loadSupabaseEnvironment();
  const database = postgres(environment.SUPABASE_DATABASE_URL, {
    // Supavisor transaction mode không hỗ trợ prepared statements.
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
    transform: { undefined: null },
  });

  globalDatabase.__landOcrSupabaseSql = database;
  return database;
}

export async function checkDatabaseHealth(): Promise<void> {
  const database = getDatabase();
  await database`select 1 as ok`;
  const rows = await database`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name = 'public_submissions'
  `;
  if (rows.length !== 1) {
    throw new Error("Supabase thiếu schema bắt buộc.");
  }
}
