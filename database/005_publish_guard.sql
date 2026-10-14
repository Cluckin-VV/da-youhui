create or replace function enforce_deal_publish_guard()
returns trigger language plpgsql as $$
begin
  if new.review_state='approved' then
    if new.state not in ('active','limited') then raise exception 'publish_guard: deal state is not publishable'; end if;
    if new.official_url is null or btrim(new.official_url)='' then raise exception 'publish_guard: official URL required'; end if;
    if new.evidence_summary is null or btrim(new.evidence_summary)='' then raise exception 'publish_guard: evidence summary required'; end if;
    if new.last_verified_at is null or new.published_at is null then raise exception 'publish_guard: verification and publish timestamps required'; end if;
    if new.ends_at is not null and new.ends_at<=now() then raise exception 'publish_guard: expired deal cannot be published'; end if;
    if new.confidence<0.7 then raise exception 'publish_guard: confidence below 0.7'; end if;
    if exists(select 1 from review_queue q where q.deal_id=new.id and q.state='needs_review') then
      raise exception 'publish_guard: open review still exists';
    end if;
    if not exists(select 1 from deal_evidence e where e.deal_id=new.id and e.supports) then
      raise exception 'publish_guard: supporting evidence required';
    end if;
    if not exists(
      select 1 from source_deal_links l join sources s on s.id=l.source_id
      where l.deal_id=new.id and s.trust in ('official','authorized_partner','merchant','platform')
    ) then raise exception 'publish_guard: trusted source link required'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists deals_publish_guard on deals;
create constraint trigger deals_publish_guard
after insert or update of review_state,state,official_url,evidence_summary,last_verified_at,published_at,ends_at,confidence
on deals deferrable initially immediate for each row execute function enforce_deal_publish_guard();
