-- PostgreSQL 15+ production schema for the 大优惠 evidence pipeline.
-- Raw observations are append-only; published facts require review.
create extension if not exists pgcrypto;

create type source_trust as enum ('official','authorized_partner','merchant','platform','community');
create type review_state as enum ('discovered','needs_review','approved','rejected','expired');
create type deal_state as enum ('active','limited','possibly_expired','offline');

create table cities (
  id text primary key, name text not null, province text not null,
  tier text not null check (tier in ('tier1','new_tier1','tier2','other')),
  operation_state text not null default 'candidate' check (operation_state in ('active','candidate','paused')),
  timezone text not null default 'Asia/Shanghai', sort_order integer not null default 999
);

create table categories (
  id text primary key, parent_id text references categories(id), name text not null,
  icon_key text not null, sort_order integer not null default 999, active boolean not null default true
);

create table sources (
  id uuid primary key default gen_random_uuid(), source_key text unique not null,
  name text not null, url text not null, trust source_trust not null,
  source_type text not null, fetch_method text not null default 'http',
  cadence_minutes integer not null check (cadence_minutes >= 60),
  terms_note text, robots_checked_at timestamptz, enabled boolean not null default true,
  last_attempt_at timestamptz, last_success_at timestamptz, next_fetch_at timestamptz,
  consecutive_failures integer not null default 0, created_at timestamptz not null default now()
);

create table source_snapshots (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references sources(id),
  fetched_at timestamptz not null default now(), http_status integer, final_url text,
  etag text, last_modified text, content_hash text, content_type text,
  body_text text, storage_url text, error_code text,
  unique(source_id, content_hash)
);

create table deals (
  id uuid primary key default gen_random_uuid(), slug text unique not null,
  brand text not null, title text not null, category_id text not null references categories(id),
  scope text not null check (scope in ('national','regional','city','campus','store')),
  city_id text references cities(id), district text, campus_scope text, store_scope text,
  final_price numeric(12,2), original_price numeric(12,2), minimum_spend numeric(12,2),
  discount_text text, platform text, fulfillment_type text, usage_window text,
  eligibility text, student_verification text, stackable boolean,
  delivery_fee numeric(12,2), service_fee numeric(12,2),
  claim_method text not null, official_url text, evidence_summary text,
  starts_at timestamptz, ends_at timestamptz, state deal_state not null default 'limited',
  review_state review_state not null default 'discovered', confidence numeric(4,3) not null default 0,
  last_verified_at timestamptz, next_review_at timestamptz,
  published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table deal_evidence (
  deal_id uuid not null references deals(id), snapshot_id uuid not null references source_snapshots(id),
  claim text not null, supports boolean not null default true, extracted_at timestamptz not null default now(),
  primary key (deal_id, snapshot_id, claim)
);

create table review_queue (
  id uuid primary key default gen_random_uuid(), deal_id uuid references deals(id),
  snapshot_id uuid references source_snapshots(id), reason text not null,
  priority integer not null default 50, state review_state not null default 'needs_review',
  assigned_to text, resolved_at timestamptz, resolution_note text, created_at timestamptz not null default now()
);

create table user_reports (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references deals(id),
  report_type text not null check (report_type in ('available','expired','changed','store_refused')),
  note text, evidence_url text, created_at timestamptz not null default now()
);

create index deals_discovery_idx on deals (state, review_state, category_id, city_id, next_review_at);
create index sources_due_idx on sources (enabled, next_fetch_at);
create index snapshots_source_time_idx on source_snapshots (source_id, fetched_at desc);
create index review_open_idx on review_queue (state, priority desc, created_at);

