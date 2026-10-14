const { Client } = require('pg');
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/da_youhui';
(async () => {
  const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });
  await client.connect();
  const result = await client.query(`select
    current_database() database,
    (select count(*)::int from information_schema.tables where table_schema='public') tables,
    (select count(*)::int from schema_migrations) migrations,
    now() checked_at`);
  console.log(JSON.stringify({ ok: true, ...result.rows[0] }));
  await client.end();
})().catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exit(1); });

