// Evidence collector: fetches configured public pages, stores append-only metadata,
// and creates a review item only when the normalized page hash changes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const CONFIG = path.join(ROOT, 'sources.production.json');
const SNAPSHOT_DIR = path.join(ROOT, 'out', 'snapshots');
const INDEX_PATH = path.join(ROOT, 'out', 'snapshot-index.json');
const QUEUE_PATH = path.join(ROOT, 'out', 'review.queue.json');
const CADENCE = { daily: 1440, weekly: 10080, monthly: 43200 };

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function normalize(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function safeName(value) { return value.replace(/[^a-zA-Z0-9_-]/g, '_'); }

async function fetchOne(source, previous) {
  const headers = { 'user-agent': 'DaYouhuiEvidenceMonitor/1.0 (+manual-review; public pages only)' };
  if (previous?.etag) headers['if-none-match'] = previous.etag;
  if (previous?.last_modified) headers['if-modified-since'] = previous.last_modified;
  const response = await fetch(source.url, { headers, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (response.status === 304) return { unchanged: true, status: 304 };
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  if (!/text\/(html|plain)|application\/(xhtml\+xml|json)/i.test(contentType)) throw new Error('UNSUPPORTED_CONTENT_TYPE');
  const text = normalize(await response.text());
  if (text.length < 80) throw new Error('CONTENT_TOO_SHORT');
  return { status: response.status, final_url: response.url, content_type: contentType,
    etag: response.headers.get('etag'), last_modified: response.headers.get('last-modified'),
    hash: hash(text), text };
}

async function run() {
  const sources = readJson(CONFIG, { sources: [] }).sources.filter((s) => s.method === 'http_hash');
  const index = readJson(INDEX_PATH, {});
  const queue = readJson(QUEUE_PATH, []);
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  for (const source of sources) {
    const now = new Date(); const previous = index[source.id];
    if (previous?.next_fetch_at && new Date(previous.next_fetch_at) > now) {
      console.log(`[skip] ${source.id} due ${previous.next_fetch_at}`);
      continue;
    }
    try {
      const result = await fetchOne(source, previous);
      if (result.unchanged) {
        index[source.id] = { ...previous, last_attempt_at: now.toISOString(), last_status: 304,
          next_fetch_at: new Date(now.getTime() + (CADENCE[source.cadence] || CADENCE.weekly) * 60000).toISOString(),
          consecutive_failures: 0, last_error: undefined };
        console.log(`[ok] ${source.id} unchanged`);
        continue;
      }
      const changed = previous?.hash && previous.hash !== result.hash;
      const stamp = now.toISOString().replace(/[:.]/g, '-');
      const snapshot = path.join(SNAPSHOT_DIR, `${safeName(source.id)}-${stamp}.json`);
      writeJson(snapshot, { source_id: source.id, source_url: source.url, fetched_at: now.toISOString(), ...result });
      index[source.id] = { hash: result.hash, etag: result.etag, last_modified: result.last_modified,
        last_attempt_at: now.toISOString(), last_success_at: now.toISOString(), last_status: result.status,
        next_fetch_at: new Date(now.getTime() + (CADENCE[source.cadence] || CADENCE.weekly) * 60000).toISOString(), snapshot };
      if (changed && !queue.some((q) => q.source_id === source.id && q.hash === result.hash)) {
        queue.unshift({ id: crypto.randomUUID(), source_id: source.id, source_name: source.name, hash: result.hash,
          reason: '官方页面内容哈希发生变化，需人工核对优惠字段', priority: source.trust === 'official' ? 80 : 50,
          state: 'needs_review', created_at: now.toISOString(), snapshot });
      }
      console.log(`[ok] ${source.id} ${changed ? 'changed' : 'baseline'} ${result.hash.slice(0, 12)}`);
    } catch (error) {
      const failedAt = new Date();
      const failures = (previous?.consecutive_failures || 0) + 1;
      const retryMinutes = Math.min(1440, 60 * (2 ** Math.min(failures - 1, 4)));
      index[source.id] = { ...previous, last_attempt_at: failedAt.toISOString(),
        next_fetch_at: new Date(failedAt.getTime() + retryMinutes * 60000).toISOString(),
        consecutive_failures: failures, last_error: String(error.message || error) };
      console.error(`[error] ${source.id} ${error.message || error}`);
    }
  }
  writeJson(INDEX_PATH, index); writeJson(QUEUE_PATH, queue);
  console.log(`sources=${sources.length} review_queue=${queue.filter((q) => q.state === 'needs_review').length}`);
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
