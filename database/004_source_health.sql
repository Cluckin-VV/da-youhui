alter table sources add column last_error_code text;
alter table sources add column last_error_at timestamptz;

update sources set
  last_attempt_at=least(last_attempt_at,now()),
  last_success_at=least(last_success_at,now()),
  next_fetch_at=greatest(next_fetch_at,now())
where last_attempt_at>now() or last_success_at>now();

create index sources_health_idx on sources(enabled, consecutive_failures desc, last_attempt_at desc);
