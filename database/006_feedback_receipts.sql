-- Append-only feedback receipts, with idempotency and anonymous rate limiting.
alter table user_reports add column if not exists submission_id uuid;
alter table user_reports add column if not exists client_hash text;
alter table user_reports add column if not exists redacted_at timestamptz;
create unique index if not exists user_reports_submission_idx on user_reports(submission_id);
create index if not exists user_reports_rate_idx on user_reports(client_hash,created_at);
