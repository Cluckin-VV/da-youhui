// Exercises the real route + PostgreSQL, using connection-local TEMP tables.
// Never inserts a fake report or review into the production public schema.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const { Client } = require('pg');
function handler(db) {
  const file = path.resolve(__dirname, '../app/api/v1/feedback/route.ts');
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { exports: module.exports, module, Buffer, require: key => key === '@/lib/database' ? { db } : require(key) }, { filename: file });
  return module.exports.POST;
}
function request(payload, headers = { 'content-type': 'application/json' }) {
  return new Request('http://localhost/api/v1/feedback', { method: 'POST', headers, body: typeof payload === 'string' ? payload : JSON.stringify(payload) });
}
test('feedback HTTP validation happens before any database write', async () => {
  const post = handler({ connect: () => { throw Error('Database must not be reached'); } });
  assert.equal((await post(request('{}', {}))).status, 415);
  assert.equal((await post(request('{'))).status, 400);
  assert.equal((await post(request('{}'))).status, 400);
  assert.equal((await post(request('x'.repeat(4097)))).status, 413);
});
test('receipt, retries, conflicts, report queue and rate limit with isolated PostgreSQL tables', async () => {
  const connection = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/da_youhui', connectionTimeoutMillis: 3000 });
  await connection.connect();
  try {
    await connection.query('begin');
    await connection.query('set local search_path = pg_temp');
    await connection.query(`create temp table deals (id uuid primary key,slug text unique,published_at timestamptz);
      create temp table user_reports (id uuid primary key default gen_random_uuid(),deal_id uuid references deals(id),report_type text,note text,submission_id uuid unique,client_hash text,created_at timestamptz default now());
      create temp table review_queue (id uuid primary key default gen_random_uuid(),deal_id uuid references deals(id),reason text,priority integer,state text default 'needs_review');`);
    const table = await connection.query("select n.nspname from pg_class c join pg_namespace n on c.relnamespace=n.oid where c.oid='deals'::regclass");
    assert.match(table.rows[0].nspname, /^pg_temp_/);
    await connection.query('insert into deals values ($1,$2,now()),($3,$4,null)', [crypto.randomUUID(), 'integration-fixture', crypto.randomUUID(), 'unpublished-fixture']);
    const wrapped = {
      query: (sql, values) => {
        const command = sql.toLowerCase().trim();
        if (command === 'begin') return connection.query('savepoint feedback_request');
        if (command === 'commit') return connection.query('release savepoint feedback_request');
        if (command === 'rollback') return connection.query('rollback to savepoint feedback_request');
        return connection.query(sql, values);
      }, release() {}
    };
    const post = handler({ connect: async () => wrapped });
    const payload = { submission_id: crypto.randomUUID(), client_id: crypto.randomUUID(), deal_id: 'integration-fixture', type: 'changed', note: '  集成测试，仅临时表  ' };
    const first = await post(request(payload)); assert.equal(first.status, 201);
    const receipt = (await first.json()).receipt_id; assert.ok(receipt);
    const duplicate = await post(request(payload)); assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).receipt_id, receipt);
    assert.equal((await post(request({ ...payload, note: 'conflicting payload' }))).status, 409);
    assert.equal((await post(request({ ...payload, submission_id: crypto.randomUUID(), deal_id: 'unpublished-fixture' }))).status, 404);
    for (let i = 0; i < 9; i++) assert.equal((await post(request({ ...payload, submission_id: crypto.randomUUID() }))).status, 201);
    assert.equal((await post(request({ ...payload, submission_id: crypto.randomUUID() }))).status, 429);
    assert.equal((await connection.query('select count(*)::int count from user_reports')).rows[0].count, 10);
    assert.equal((await connection.query('select count(*)::int count from review_queue')).rows[0].count, 1);
    // Feedback only queues a review: it never approves or rewrites deal facts.
    assert.equal((await connection.query('select count(*)::int count from deals where published_at is not null')).rows[0].count, 1);
  } finally {
    await connection.query('rollback');
    await connection.end();
  }
});
