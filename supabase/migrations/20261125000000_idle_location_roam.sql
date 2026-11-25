alter table public.hosts add column last_incoming_at timestamptz;

create table public.host_location_roam (
  host_id uuid not null references public.hosts(id) on delete cascade,
  domain text not null check (domain in ('sugo.live', 'www.sugo.live')),
  connected_at timestamptz not null,
  seen_at timestamptz not null,
  primary key (host_id, domain)
);
alter table public.host_location_roam enable row level security;
grant select, insert, update, delete on public.host_location_roam to service_role;

create function public.note_roam_incoming() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.hosts h
  set last_incoming_at = greatest(h.last_incoming_at, statement_timestamp())
  from public.pairs p
  where p.id = new.pair_id and p.host_id = h.id;
  return new;
end;
$$;

-- Ingest stores follow notices and answered history as handled. A replay does not insert another row.
create trigger note_roam_incoming after insert on public.messages
for each row when (new.direction = 'in' and not new.handled)
execute function public.note_roam_incoming();

create function public.reset_location_roam() returns trigger
language plpgsql set search_path = '' as $$
begin
  delete from public.host_location_roam r
  where r.host_id = new.id and (old.active is distinct from new.active or
    (select (p->'gps') - 'accuracy' from jsonb_array_elements(old.network_profiles) p where p->>'domain' = r.domain)
    is distinct from
    (select (p->'gps') - 'accuracy' from jsonb_array_elements(new.network_profiles) p where p->>'domain' = r.domain));
  return new;
end;
$$;

create trigger reset_location_roam after update of active, network_profiles on public.hosts
for each row when (old.active is distinct from new.active or old.network_profiles is distinct from new.network_profiles)
execute function public.reset_location_roam();

create function public.poll_location_roam(p_host_id uuid, p_domain text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  profile public.hosts%rowtype;
  connection public.host_location_roam%rowtype;
  gps jsonb;
  checked_at timestamptz;
begin
  if p_domain is null or p_domain not in ('sugo.live', 'www.sugo.live') then return null; end if;
  select * into profile from public.hosts where id = p_host_id for share;
  if not found or not profile.active then return null; end if;
  select p->'gps' into gps from jsonb_array_elements(profile.network_profiles) p
  where p->>'domain' = p_domain and p->'gps'->'enabled' = 'true'::jsonb;
  if gps is null then return null; end if;

  checked_at := clock_timestamp();
  insert into public.host_location_roam as r (host_id, domain, connected_at, seen_at)
  values (p_host_id, p_domain, checked_at, checked_at)
  on conflict (host_id, domain) do update set
    connected_at = case when r.seen_at <= excluded.seen_at - interval '4 minutes' then excluded.seen_at else r.connected_at end,
    seen_at = excluded.seen_at
  where r.seen_at <= excluded.seen_at - interval '30 seconds';
  select * into connection from public.host_location_roam where host_id = p_host_id and domain = p_domain;

  return jsonb_build_object(
    'at', checked_at, 'idleSince', greatest(connection.connected_at, profile.last_incoming_at),
    'latitude', gps->'latitude', 'longitude', gps->'longitude'
  );
end;
$$;

revoke execute on function public.poll_location_roam(uuid, text) from public, anon, authenticated;
grant execute on function public.poll_location_roam(uuid, text) to service_role;
