import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";

const testDbUrl = process.env.ACCEPTANCE_SAGA_TEST_DATABASE_URL || "";
const isTestDbAvailable = testDbUrl.trim().length > 0;

describe.skipIf(!isTestDbAvailable)(
  "Canonical projection and cascade delete integration test (Real Postgres)",
  () => {
    let sql: Sql;

    beforeAll(async () => {
      if (!isTestDbAvailable) return;
      sql = postgres(testDbUrl, { max: 1 });
    });

    afterAll(async () => {
      if (sql) await sql.end();
    });

    it("CP1: deleting a parcel cascades to delete associated land uses", async () => {
      const submissionId = `test_sub_${Date.now()}`;
      const parcelId = `test_parcel_${Date.now()}`;
      const landUseId = `test_lu_${Date.now()}`;

      await sql`
        insert into public.public_submissions (submissionId, receiptCode, status, phone, draft_json)
        values (${submissionId}, ${`PC-${Date.now()}`}, 'SUBMITTED', '0912345678', '{}'::jsonb)
      `;

      await sql`
        insert into public.public_parcels (parcel_id, submission_id, map_sheet_number, parcel_number, address_on_certificate, old_ward, area)
        values (${parcelId}, ${submissionId}, '1', '100', 'Phong Châu', 'PHU_HO', 100)
      `;

      await sql`
        insert into public.public_land_uses (land_use_id, parcel_id, purpose_code, area)
        values (${landUseId}, ${parcelId}, 'ODT', 100)
      `;

      const luBefore =
        await sql`select land_use_id from public.public_land_uses where land_use_id = ${landUseId}`;
      expect(luBefore.length).toBe(1);

      // Delete parcel -> should cascade delete land use
      await sql`delete from public.public_parcels where parcel_id = ${parcelId}`;

      const luAfter =
        await sql`select land_use_id from public.public_land_uses where land_use_id = ${landUseId}`;
      expect(luAfter.length).toBe(0);

      // Cleanup
      await sql`delete from public.public_submissions where submissionId = ${submissionId}`;
    });
  },
);

if (!isTestDbAvailable) {
  console.log(
    "[canonical-projection-test] BỎ QUA — đặt biến môi trường ACCEPTANCE_SAGA_TEST_DATABASE_URL để chạy integration test Postgres thật.",
  );
}
