alter table public.hosts add column repair_enabled boolean not null default false;
alter table public.messages add column sent_job_id bigint;
alter table public.messages add constraint messages_sent_job_unique unique (sent_job_id);
alter table public.jobs add column filter_rejected boolean not null default false;
update public.messages m set sent_job_id = j.id
from public.jobs j where j.pair_id = m.pair_id and m.dedupe_key = 'sent#' || j.id and j.status = 'processing';
alter table public.jobs drop constraint jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check check (kind in ('reply', 'welcome', 'nudge', 'repair'));
create index jobs_repair_active_idx on public.jobs(host_id, status, due_at) where kind = 'repair'
  and status in ('pending', 'processing');

create table public.conversation_repair_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  lease_until timestamptz,
  cursor text not null default '',
  totals jsonb not null default '{}',
  report jsonb
);
create unique index conversation_repair_one_run on public.conversation_repair_runs ((true)) where completed_at is null;

create table public.conversation_repair_trials (
  pair_id text primary key references public.pairs(id) on delete cascade,
  host_id uuid not null references public.hosts(id) on delete cascade,
  version bigint not null references public.conversation_repair_runs(id),
  arm smallint not null check (arm between 0 and 3),
  reply_job_id bigint not null references public.jobs(id) on delete cascade,
  anchor_id bigint references public.messages(id) on delete set null,
  assigned_at timestamptz not null default now(),
  sent_at timestamptz,
  quiet_through timestamptz,
  first_in_at timestamptz,
  first_in_id bigint references public.messages(id) on delete set null,
  next_reply_at timestamptz,
  stop_at timestamptz,
  repair_queued_at timestamptz,
  repair_job_id bigint references public.jobs(id) on delete set null
);
create index conversation_repair_trials_host on public.conversation_repair_trials(host_id, arm);
create index conversation_repair_trials_reply on public.conversation_repair_trials(reply_job_id);
create index conversation_repair_trials_repair on public.conversation_repair_trials(repair_job_id);
alter table public.conversation_repair_trials enable row level security;
alter table public.conversation_repair_runs enable row level security;
grant select, insert, update on public.conversation_repair_runs, public.conversation_repair_trials to service_role;

-- Host kilidi, en az kullanılan kollar arasındaki rastgele atamayı eşzamanlı isteklerde de dengeler.
create function public.assign_conversation_repair(p_host uuid, p_pair text, p_job bigint)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_trial public.conversation_repair_trials;
  v_run public.conversation_repair_runs;
  v_arm smallint;
begin
  perform 1 from public.hosts where id = p_host and active and repair_enabled for update;
  if not found then return null; end if;
  select * into v_trial from public.conversation_repair_trials where pair_id = p_pair;
  if found and v_trial.reply_job_id <> p_job then return null; end if;
  if not found then
    select * into v_run from public.conversation_repair_runs
    where completed_at is not null
    order by id desc limit 1;
    if not found then return null; end if;
    select a.arm into v_arm from generate_series(0, 3) a(arm)
    left join public.conversation_repair_trials t on t.host_id = p_host and t.arm = a.arm
    group by a.arm order by count(t.pair_id), random() limit 1;
    insert into public.conversation_repair_trials(pair_id, host_id, version, arm, reply_job_id)
    select p.id, p.host_id, v_run.id, v_arm, j.id
    from public.pairs p join public.jobs j on j.pair_id = p.id and j.host_id = p.host_id
    where p.id = p_pair and p.host_id = p_host and p.peer_sugo_id ~ '^[0-9]+$'
      and p.reply_disabled_reason is null and j.id = p_job and j.kind = 'reply' and j.status = 'pending'
    returning * into v_trial;
    if not found then return null; end if;
  else
    select * into v_run from public.conversation_repair_runs where id = v_trial.version;
  end if;
  return jsonb_build_object('arm', v_trial.arm, 'recipes', v_run.report->'recipes');
end;
$$;

-- Gönderim kaydı, DOM senkronizasyonu dedupe_key'i değiştirdikten sonra da işi tanımlar.
create function public.note_conversation_repair_send() returns trigger
language plpgsql set search_path = '' as $$
declare v_job public.jobs;
begin
  select * into v_job from public.jobs where id = new.sent_job_id and pair_id = new.pair_id;
  if v_job.kind = 'reply' and v_job.send_text and v_job.media_id is null then
    update public.conversation_repair_trials set anchor_id = new.id, sent_at = new.created_at
    where reply_job_id = v_job.id and anchor_id is null;

    update public.conversation_repair_trials set next_reply_at = new.created_at
    where pair_id = new.pair_id and first_in_id is not null
      and v_job.covers_until >= first_in_id and next_reply_at is null;
  end if;
  return new;
end;
$$;
create trigger note_conversation_repair_send after insert on public.messages
for each row when (new.direction = 'out' and new.sent_job_id is not null)
execute function public.note_conversation_repair_send();

-- Gözlem yalnız çıpanın göründüğü bir snapshot'tan gelir. Bir mesaj geçmişe eklendiyse sıra snapshot'tan alınır.
create function public.observe_conversation_repair(p_pair text, p_snapshot jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_trial public.conversation_repair_trials;
  v_anchor bigint;
  v_first bigint;
  v_has_out boolean;
  v_stop boolean;
begin
  select * into v_trial from public.conversation_repair_trials where pair_id = p_pair
    and sent_at > now() - interval '48 hours' for update;
  if not found then return null; end if;

  select s.ord into v_anchor from jsonb_array_elements(p_snapshot) with ordinality s(val, ord)
  join public.messages m on m.pair_id = p_pair and m.dedupe_key = s.val->>'key'
  where m.id = v_trial.anchor_id and s.val->>'dir' = 'out';
  if v_anchor is null then return null; end if;

  select m.id into v_first from jsonb_array_elements(p_snapshot) with ordinality s(val, ord)
  join public.messages m on m.pair_id = p_pair and m.dedupe_key = s.val->>'key'
  where s.ord > v_anchor and s.val->>'dir' = 'in' and (s.val->>'real')::boolean
  order by s.ord limit 1;

  select coalesce(bool_or(s.val->>'dir' = 'out'), false), coalesce(bool_or((s.val->>'stop')::boolean), false)
  into v_has_out, v_stop from jsonb_array_elements(p_snapshot) with ordinality s(val, ord) where s.ord > v_anchor;

  update public.conversation_repair_trials set
    first_in_at = coalesce(first_in_at, case when v_first is not null then now() end),
    first_in_id = coalesce(first_in_id, v_first),
    stop_at = coalesce(stop_at, case when v_stop then now() end),
    quiet_through = case when v_first is null and first_in_at is null then now() else quiet_through end
  where pair_id = p_pair;

  if v_first is not null or v_has_out or v_stop then
    update public.jobs set status = 'failed', error = 'repair: sohbet değişti', locked_until = null, updated_at = now()
    where id = v_trial.repair_job_id and status = 'pending';
    return null;
  end if;
  if v_trial.arm >= 2 and v_trial.repair_queued_at is null and v_trial.stop_at is null and v_trial.first_in_at is null
    and v_trial.sent_at between now() - interval '120 minutes' and now() - interval '30 minutes'
    and (p_snapshot->-1)->>'key' = (select dedupe_key from public.messages where id = v_trial.anchor_id)
  then return jsonb_build_object('anchor', v_trial.anchor_id::text, 'observed_at', now());
  end if;
  return null;
end;
$$;

create function public.queue_conversation_repair(p_pair text, p_anchor bigint, p_text text, p_observed_at timestamptz)
returns setof public.jobs language plpgsql set search_path = '' as $$
declare
  v_trial public.conversation_repair_trials;
  v_job public.jobs;
begin
  perform 1 from public.hosts h join public.pairs p on p.host_id = h.id
  where p.id = p_pair and h.active and h.repair_enabled for update of h;
  if not found then return; end if;
  select * into v_trial from public.conversation_repair_trials where pair_id = p_pair for update;
  if not found or v_trial.anchor_id is distinct from p_anchor or v_trial.arm < 2
    or v_trial.repair_queued_at is not null or v_trial.first_in_at is not null or v_trial.stop_at is not null
    or v_trial.sent_at not between now() - interval '120 minutes' and now() - interval '30 minutes'
    or v_trial.quiet_through is null or v_trial.quiet_through <> p_observed_at or v_trial.quiet_through < now() - interval '30 seconds'
  then return; end if;

  insert into public.jobs(pair_id, host_id, kind, reply_text, due_at)
  select p.id, p.host_id, 'repair', p_text, now() from public.pairs p
  where p.id = p_pair and p.reply_disabled_reason is null
    and not exists (select 1 from public.messages m where m.pair_id = p_pair
      and ((m.direction = 'in' and not m.handled) or (m.direction = 'out' and m.id > p_anchor)))
    and not exists (select 1 from public.jobs j where j.pair_id = p_pair and j.status = 'failed'
      and j.error like 'sugo filtresi mesajları reddetti%' and j.updated_at > now() - interval '6 hours')
  on conflict (pair_id) where status in ('pending', 'processing') do nothing returning * into v_job;

  if v_job.id is null then return; end if;
  update public.conversation_repair_trials set repair_job_id = v_job.id, repair_queued_at = now() where pair_id = p_pair;
  return next v_job;
end;
$$;

create function public.set_conversation_repair(p_host uuid, p_enabled boolean) returns boolean
language plpgsql set search_path = '' as $$
begin
  update public.hosts set repair_enabled = p_enabled where id = p_host;
  if not found then return false; end if;
  if not p_enabled then
    update public.jobs set status = 'failed', error = 'repair: pilot kapatıldı', locked_until = null, updated_at = now()
    where host_id = p_host and kind = 'repair' and status = 'pending';
  end if;
  return true;
end;
$$;

create or replace function public.claim_available_job(
  p_host uuid, p_pair_ids text[] default null, p_reply_only boolean default false, p_lock_seconds int default 120
)
returns setof public.jobs language plpgsql set search_path = '' as $$
begin
  update public.jobs set status = 'failed', error = case when status = 'processing'
      then 'repair: teslim doğrulanamadı' else 'repair: güncel sohbet görüntüsünün süresi doldu' end,
      locked_until = null, updated_at = now()
    where host_id = p_host and kind = 'repair' and
      ((status = 'processing' and locked_until < now()) or (status = 'pending' and due_at < now() - interval '20 seconds'));

  return query update public.jobs j set status = 'processing', attempts = j.attempts + 1,
    locked_until = now() + make_interval(secs => p_lock_seconds), updated_at = now()
  where j.id = (
    select q.id from public.jobs q join public.pairs p on p.id = q.pair_id
    where q.host_id = p_host and q.kind <> 'repair' and q.reply_text is not null and p.reply_disabled_reason is null
      and (not p_reply_only or q.kind = 'reply')
      and ((p_pair_ids is not null and q.pair_id = any(p_pair_ids))
        or (p_pair_ids is null and (p.delivery_retry_at is null or p.delivery_retry_at <= now())))
      and ((q.status = 'pending' and q.due_at <= now()) or (q.status = 'processing' and q.locked_until < now()))
    order by case when q.kind = 'reply' then 0 when q.online_greeting then 3 when q.kind = 'welcome' then 1 else 2 end, q.due_at, q.id
    limit 1 for update of q skip locked
  ) returning j.*;
end;
$$;


create function public.claim_conversation_repair_job(p_host uuid, p_pair_ids text[])
returns setof public.jobs language sql set search_path = '' as $$
  update public.jobs j set status = 'processing', attempts = j.attempts + 1,
    locked_until = now() + interval '2 minutes', updated_at = now()
  where j.id = (
    select q.id from public.jobs q
    join public.pairs p on p.id = q.pair_id
    join public.conversation_repair_trials t on t.repair_job_id = q.id and t.pair_id = p.id
    join public.hosts h on h.id = t.host_id
    where q.host_id = p_host and q.pair_id = any(p_pair_ids) and h.active and h.repair_enabled
      and q.kind = 'repair' and q.status = 'pending' and q.attempts = 0
      and q.due_at between now() - interval '20 seconds' and now()
      and p.reply_disabled_reason is null and t.first_in_at is null and t.stop_at is null
      and t.quiet_through >= now() - interval '30 seconds'
      and not exists (select 1 from public.messages m where m.pair_id = q.pair_id
        and ((m.direction = 'in' and not m.handled) or (m.direction = 'out' and m.id > t.anchor_id)))
    order by q.due_at, q.id limit 1 for update of q skip locked
  ) returning j.*;
$$;

create or replace function public.queue_online_greeting(p_host uuid, p_pair text, p_text text, p_since timestamptz)
returns setof public.jobs language sql set search_path = '' as $$
  insert into public.jobs (host_id, pair_id, kind, online_greeting, reply_text)
  select p.host_id, p.id, 'welcome', true, p_text
  from public.pairs p join public.hosts h on h.id = p.host_id
  where p.host_id = p_host and p.id = p_pair and p.reply_disabled_reason is null
    and not exists (
      select 1 from public.messages m where m.pair_id = p.id and (
        (m.direction = 'out' and m.created_at >= p_since) or (m.direction = 'in' and not m.handled)
      )
    )
    and not exists (
      select 1 from public.conversation_repair_trials t where t.pair_id = p.id
        and h.repair_enabled and t.sent_at >= now() - interval '24 hours 30 minutes'
    )
  on conflict (pair_id) where status in ('pending', 'processing') do nothing
  returning *;
$$;

create function public.claim_conversation_repair_run(p_start boolean default false) returns setof public.conversation_repair_runs
language plpgsql set search_path = '' as $$
begin
  if p_start or (exists (select 1 from public.conversation_repair_runs)
      and not exists (select 1 from public.conversation_repair_runs where started_at > now() - interval '1 day')) then
    insert into public.conversation_repair_runs default values on conflict do nothing;
  end if;
  return query update public.conversation_repair_runs r set lease_until = now() + interval '1 minute'
  where r.id = (select q.id from public.conversation_repair_runs q where q.completed_at is null
    and (q.lease_until is null or q.lease_until <= now()) limit 1 for update skip locked)
  returning r.*;
end;
$$;

create function public.conversation_repair_history(p_since timestamptz, p_until timestamptz, p_cursor text)
returns table(pair_id text, host_id uuid, messages jsonb, quiet_anchor bigint, quiet_through timestamptz)
language sql set search_path = '' as $$
  select p.id, p.host_id, coalesce(m.history, '[]'::jsonb), t.anchor_id, t.quiet_through
  from (
    select * from public.pairs where id > p_cursor and created_at <= p_until and last_activity_at >= p_since
      and peer_sugo_id ~ '^[0-9]+$' order by id limit 12
  ) p
  left join public.conversation_repair_trials t on t.pair_id = p.id
  cross join lateral (
    select jsonb_agg(to_jsonb(x) order by x.id) history from (
      select m.id, m.direction, left(m.text, 500) as text, m.sugo_ts, m.created_at, j.kind, j.status,
        (m.sent_job_id is not null or m.dedupe_key like 'sent#%') as confirmed
      from public.messages m left join public.jobs j on j.id = coalesce(m.sent_job_id,
        substring(m.dedupe_key from '^sent#([0-9]{1,18})$')::bigint)
      where m.pair_id = p.id and m.created_at <= p_until and m.created_at >= p_since - interval '1 day'
      order by m.id desc limit 200
    ) x
  ) m
  order by p.id;
$$;

create function public.conversation_repair_results(p_version bigint default null)
returns table(arm smallint, assigned bigint, sent bigint, early_yes bigint, early_no bigint, late_yes bigint, late_no bigint,
  late_unknown bigint, continued bigint, repair_queued bigint, repair_sent bigint, rejected bigint, failed bigint, stopped bigint)
language sql set search_path = '' as $$
  with rows as (
    select t.*, j.status as repair_status, j.error as repair_error,
      r.status as reply_status, r.error as reply_error, r.filter_rejected,
      t.quiet_through >= t.sent_at + interval '30 minutes'
        and (t.first_in_at is null or t.first_in_at > t.sent_at + interval '30 minutes') as quiet30
    from public.conversation_repair_trials t left join public.jobs j on j.id = t.repair_job_id
    left join public.jobs r on r.id = t.reply_job_id
    where p_version is null or t.version = p_version
  )
  select a.arm::smallint, count(t.pair_id), count(t.sent_at),
    count(*) filter (where t.first_in_at <= t.sent_at + interval '30 minutes'),
    count(*) filter (where quiet30),
    count(*) filter (where quiet30 and t.first_in_at <= t.sent_at + interval '24 hours 30 minutes'),
    count(*) filter (where quiet30 and t.quiet_through >= t.sent_at + interval '24 hours 30 minutes'
      and (t.first_in_at is null or t.first_in_at > t.sent_at + interval '24 hours 30 minutes')),
    count(*) filter (where quiet30 and (t.first_in_at is null or t.first_in_at > t.sent_at + interval '24 hours 30 minutes')
      and t.quiet_through < t.sent_at + interval '24 hours 30 minutes'),
    count(*) filter (where t.first_in_at <= t.sent_at + interval '24 hours 30 minutes'
      and t.next_reply_at <= t.sent_at + interval '24 hours 30 minutes'),
    count(t.repair_queued_at),
    count(*) filter (where t.repair_status = 'done'),
    count(*) filter (where t.repair_error like 'sugo filtresi mesajları reddetti%' or t.reply_error like 'sugo filtresi mesajları reddetti%' or t.filter_rejected),
    count(*) filter (where (t.repair_status = 'failed' and t.repair_error not like 'sugo filtresi mesajları reddetti%'
      and t.repair_error not in ('repair: sohbet değişti', 'repair: pilot kapatıldı'))
      or (t.reply_status = 'failed' and t.reply_error not like 'sugo filtresi mesajları reddetti%')),
    count(*) filter (where t.stop_at is not null)
  from generate_series(0,3) a(arm) left join rows t on t.arm = a.arm group by a.arm order by a.arm;
$$;

revoke execute on function public.assign_conversation_repair(uuid,text,bigint), public.observe_conversation_repair(text,jsonb),
  public.queue_conversation_repair(text,bigint,text,timestamptz), public.set_conversation_repair(uuid,boolean),
  public.claim_conversation_repair_run(boolean), public.conversation_repair_history(timestamptz,timestamptz,text),
  public.conversation_repair_results(bigint), public.claim_conversation_repair_job(uuid,text[]) from public, anon, authenticated;
grant execute on function public.assign_conversation_repair(uuid,text,bigint), public.observe_conversation_repair(text,jsonb),
  public.queue_conversation_repair(text,bigint,text,timestamptz), public.set_conversation_repair(uuid,boolean),
  public.claim_conversation_repair_run(boolean), public.conversation_repair_history(timestamptz,timestamptz,text),
  public.conversation_repair_results(bigint), public.claim_conversation_repair_job(uuid,text[]) to service_role;
