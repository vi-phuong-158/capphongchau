const postgres = require('postgres');
const sql = postgres(process.env.ACCEPTANCE_SAGA_TEST_DATABASE_URL);

sql`ALTER TABLE public_submissions ADD COLUMN IF NOT EXISTS internal_notes TEXT`
  .then(() => console.log('Done'))
  .catch(console.error)
  .finally(() => sql.end());
