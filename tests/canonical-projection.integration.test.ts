/**
 * Integration test THẬT cho lưới an toàn tầng DB thêm ở Phase 3
 * (`supabase/migrations/202607250007_land_uses_cascade_delete.sql`):
 * `public_land_uses_parcel_id_fkey` phải có `on delete cascade`.
 *
 * CÁCH CHẠY:
 *   ACCEPTANCE_SAGA_TEST_DATABASE_URL=... npx vitest run tests/canonical-projection.integration.test.ts
 *
 * Không đặt biến này thì suite tự SKIP. AN TOÀN: tự chặn cứng nếu
 * `ACCEPTANCE_SAGA_TEST_DATABASE_URL` trùng `SUPABASE_DATABASE_URL` — cùng cơ chế đã dùng ở
 * `tests/staging-rehearsal-acceptance-saga.integration.test.ts`, không viết lại.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";

const TEST_DB_URL = process.env.ACCEPTANCE_SAGA_TEST_DATABASE_URL;
const hasTestDb = Boolean(TEST_DB_URL && TEST_DB_URL.trim().length > 0);

if (!hasTestDb) {
  console.warn(
    "[canonical-projection] BỎ QUA — đặt biến môi trường ACCEPTANCE_SAGA_TEST_DATABASE_URL trỏ " +
      "tới một Postgres THỬ NGHIỆM (không phải production) để chạy integration test này.",
  );
} else if (
  process.env.SUPABASE_DATABASE_URL &&
  process.env.SUPABASE_DATABASE_URL.trim() === TEST_DB_URL?.trim()
) {
  throw new Error(
    "ACCEPTANCE_SAGA_TEST_DATABASE_URL trùng với SUPABASE_DATABASE_URL — có vẻ đang trỏ nhầm vào " +
      "database THẬT. Dừng lại để tránh ghi dữ liệu rác vào production.",
  );
}

describe.skipIf(!hasTestDb)(
  "Canonical projection cascade delete integration test (Real Postgres)",
  () => {
    let sql: Sql;

    beforeAll(async () => {
      sql = postgres(TEST_DB_URL!, { max: 1 });
      // Migration 202607250007 là idempotent (drop constraint if exists + add constraint) — áp lại
      // an toàn dù database thử nghiệm đã có hay chưa có, đúng cách `bootstrapDatabase()` ở
      // `tests/staging-rehearsal-acceptance-saga.integration.test.ts` tự áp migration nền tảng.
      const migrationPath = join(
        __dirname,
        "..",
        "supabase/migrations/202607250007_land_uses_cascade_delete.sql",
      );
      await sql.unsafe(readFileSync(migrationPath, "utf8"));
    });

    afterAll(async () => {
      if (sql) await sql.end();
    });

    it("CP1: xóa thửa đất tự động xóa theo mục đích sử dụng (on delete cascade)", async () => {
      const submissionId = `test_sub_${randomUUID()}`;
      const parcelId = `test_parcel_${randomUUID()}`;
      const landUseId = `test_lu_${randomUUID()}`;

      await sql`
        insert into public.public_submissions
          (submission_id, receipt_code, status, phone, access_code_hash, consent_version,
           drive_folder_id, draft_json)
        values
          (${submissionId}, ${`PC-TEST-${randomUUID()}`}, 'SUBMITTED', '0912345678', 'test-hash',
           'v1', 'test-folder', '{}'::jsonb)
      `;

      await sql`
        insert into public.public_parcels
          (parcel_id, submission_id, map_sheet_number, parcel_number, address_on_certificate,
           old_ward, area)
        values
          (${parcelId}, ${submissionId}, '1', '100', 'Phong Châu', 'PHU_HO', '100')
      `;

      await sql`
        insert into public.public_land_uses
          (land_use_id, submission_id, parcel_id, purpose_code, area)
        values
          (${landUseId}, ${submissionId}, ${parcelId}, 'ODT', '100')
      `;

      const luBefore =
        await sql`select land_use_id from public.public_land_uses where land_use_id = ${landUseId}`;
      expect(luBefore.length).toBe(1);

      // Xóa thửa đất -> mục đích sử dụng phải bị xóa theo (cascade), không để lại bản ghi mồ côi.
      await sql`delete from public.public_parcels where parcel_id = ${parcelId}`;

      const luAfter =
        await sql`select land_use_id from public.public_land_uses where land_use_id = ${landUseId}`;
      expect(luAfter.length).toBe(0);

      // Dọn dẹp.
      await sql`delete from public.public_submissions where submission_id = ${submissionId}`;
    });
  },
);
