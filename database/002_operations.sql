create table source_deal_links (
  source_id uuid not null references sources(id),
  deal_id uuid not null references deals(id),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(source_id,deal_id)
);

create table maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null, started_at timestamptz not null default now(), finished_at timestamptz,
  state text not null check(state in ('running','success','failed')),
  summary jsonb not null default '{}'::jsonb, error_message text
);

create index source_deal_source_idx on source_deal_links(source_id);
create index maintenance_runs_job_time_idx on maintenance_runs(job_name,started_at desc);

