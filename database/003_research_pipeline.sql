create type offer_evidence_tier as enum (
  'official_direct',
  'official_entry',
  'platform_verified',
  'authoritative_secondary',
  'community_lead'
);

create type offer_lead_state as enum (
  'new',
  'needs_manual_check',
  'promoted',
  'rejected',
  'expired'
);

create table offer_verticals (
  id text primary key,
  category_id text not null references categories(id),
  name text not null,
  sort_order integer not null default 999,
  active boolean not null default true
);

alter table deals add column vertical_id text references offer_verticals(id);

create table offer_leads (
  id uuid primary key default gen_random_uuid(),
  lead_key text unique not null,
  brand text not null,
  title text not null,
  category_id text not null references categories(id),
  vertical_id text references offer_verticals(id),
  scope text not null check (scope in ('national','regional','city','campus','store')),
  city_id text references cities(id),
  discount_text text,
  eligibility text,
  student_verification text,
  channel text,
  claim_method text not null,
  source_name text not null,
  source_url text not null,
  evidence_tier offer_evidence_tier not null,
  observed_at timestamptz not null,
  starts_at timestamptz,
  ends_at timestamptz,
  state offer_lead_state not null default 'new',
  confidence numeric(4,3) not null default 0,
  next_review_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table research_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text unique not null,
  researched_at timestamptz not null,
  scope_note text not null,
  source_count integer not null default 0,
  deal_count integer not null default 0,
  lead_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index deals_vertical_idx on deals(vertical_id, review_state, state);
create index offer_leads_review_idx on offer_leads(state, evidence_tier, next_review_at);
create index offer_leads_city_category_idx on offer_leads(city_id, category_id, vertical_id);
