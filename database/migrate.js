const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/da_youhui';

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  await client.query(`create table if not exists schema_migrations (
    filename text primary key, checksum text not null, applied_at timestamptz not null default now()
  )`);
  const files = fs.readdirSync(__dirname).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const filename of files) {
    const source = fs.readFileSync(path.join(__dirname, filename), 'utf8');
    const sql = source.replace(/^\\i\s+(.+)$/gm, (_, include) => fs.readFileSync(path.join(__dirname, include.trim()), 'utf8'));
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const applied = await client.query('select checksum from schema_migrations where filename=$1', [filename]);
    if (applied.rowCount) {
      if (applied.rows[0].checksum !== checksum) throw new Error(`Migration changed after apply: ${filename}`);
      console.log(`[skip] ${filename}`); continue;
    }
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations(filename, checksum) values($1,$2)', [filename, checksum]);
      await client.query('commit'); console.log(`[apply] ${filename}`);
    } catch (error) { await client.query('rollback'); throw error; }
  }
  const health = await client.query("select current_database() database, current_user db_user, now() checked_at");
  console.log(JSON.stringify(health.rows[0]));
  await client.end();
}
run().catch((error) => { console.error(error); process.exit(1); });
