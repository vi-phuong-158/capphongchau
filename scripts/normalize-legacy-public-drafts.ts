/**
 * Chuẩn hóa nháp legacy từng bị lưu hai lần: JSONB string chứa object JSON.
 *
 * Dùng `--apply` mới ghi; output chỉ là số lượng, không có PII hoặc mã hồ sơ.
 */
import { randomUUID } from "node:crypto";

import { loadEnvConfig } from "@next/env";
import type { Sql } from "postgres";

import { getDatabase } from "@/modules/supabase/database";

const REQUEST_ID = "migration-202607240002-public-draft-json";

async function createSafeJsonParser(database: Sql): Promise<void> {
  await database.unsafe(`
    create or replace function pg_temp.try_parse_jsonb(value text)
    returns jsonb
    language plpgsql
    immutable
    as $$
    begin
      return value::jsonb;
    exception when others then
      return null;
    end;
    $$;
  `);
}

async function stringDraftCount(database: Sql): Promise<number> {
  const rows = await database<{ count: number }[]>`
    select count(*)::int as count
    from public.public_submissions
    where jsonb_typeof(draft_json) = 'string'
      and jsonb_typeof(pg_temp.try_parse_jsonb(draft_json #>> '{}')) = 'object'
  `;
  return rows[0]?.count ?? 0;
}

async function normalize(database: Sql): Promise<number> {
  return database.begin(async (transaction) => {
    await transaction.unsafe("lock table public.public_submissions in share row exclusive mode");
    const normalized = await transaction<{ submission_id: string }[]>`
      update public.public_submissions
      set
        draft_json = (draft_json #>> '{}')::jsonb,
        version = version + 1,
        updated_at = now()
      where jsonb_typeof(draft_json) = 'string'
        and jsonb_typeof(pg_temp.try_parse_jsonb(draft_json #>> '{}')) = 'object'
      returning submission_id
    `;
    for (const row of normalized) {
      await transaction`
        insert into public.audit_logs
          (audit_id, actor_email, action, entity_type, entity_id, request_id, metadata)
        values (
          ${randomUUID()}, 'SYSTEM', 'PUBLIC_SUBMISSION_DRAFT_JSON_NORMALIZED',
          'PUBLIC_SUBMISSION', ${row.submission_id}, ${REQUEST_ID},
          ${transaction.json({ migration: "202607240002", normalization: "JSON_STRING_TO_OBJECT" })}
        )
      `;
    }
    return normalized.length;
  });
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const apply = process.argv.slice(2).includes("--apply");
  const database = getDatabase();
  try {
    await createSafeJsonParser(database);
    const before = await stringDraftCount(database);
    console.log(`Kiểm tra: ${before} nháp JSON lồng cần chuẩn hóa.`);
    if (!apply) {
      console.log("Chưa thay đổi dữ liệu. Chạy lại với --apply để chuẩn hóa.");
      return;
    }
    const normalized = await normalize(database);
    const after = await stringDraftCount(database);
    if (after !== 0) throw new Error("Còn nháp JSON lồng sau khi chuẩn hóa.");
    console.log(`Đã chuẩn hóa ${normalized} nháp và ghi audit; không lộ dữ liệu cá nhân.`);
  } finally {
    await database.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Chuẩn hóa nháp legacy thất bại.");
  process.exitCode = 1;
});
