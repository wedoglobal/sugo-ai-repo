alter table public.jobs add column android_send_started_at timestamptz;
alter table public.jobs add column delivery_stopped boolean not null default false;
create index jobs_stopped_reply_idx on public.jobs(pair_id, covers_until desc)
  where delivery_stopped and kind = 'reply' and covers_until is not null;

create function public.begin_android_delivery(p_job bigint) returns boolean
language sql set search_path = '' as $$
  with reserved as (
    update public.jobs j set android_send_started_at = now()
    from public.hosts h, public.pairs p
    where j.id = p_job and j.status = 'processing' and j.locked_until > now()
      and j.android_send_started_at is null and not j.delivery_stopped and j.send_text and j.kind <> 'repair'
      and h.id = j.host_id and h.active and p.id = j.pair_id and p.reply_disabled_reason is null
    returning j.id
  )
  select exists (select 1 from reserved);
$$;

create function public.stop_android_delivery(p_job bigint, p_error text) returns void
language sql set search_path = '' as $$
  with stopped as (
    update public.jobs set status = 'failed', delivery_stopped = true, locked_until = null,
      error = left(p_error, 500), updated_at = now()
    where id = p_job and status in ('pending', 'processing') and not delivery_stopped
    returning pair_id, kind, covers_until
  )
  update public.messages m set handled = true from stopped j
  where j.kind = 'reply' and m.pair_id = j.pair_id and m.direction = 'in' and not m.handled and m.id <= j.covers_until;
$$;

revoke execute on function public.begin_android_delivery(bigint), public.stop_android_delivery(bigint,text) from public, anon, authenticated;
grant execute on function public.begin_android_delivery(bigint), public.stop_android_delivery(bigint,text) to service_role;

create function public.claim_available_delivery_job(
  p_host uuid, p_pair_ids text[], p_reply_only boolean, p_lock_seconds int, p_android boolean
)
returns setof public.jobs language plpgsql set search_path = '' as $$
begin
  perform public.stop_android_delivery(j.id, 'android: teslim belirsiz; gönderim kilidi doldu')
  from public.jobs j
  where j.host_id = p_host and j.status = 'processing' and j.android_send_started_at is not null
    and j.locked_until < now();

  update public.jobs set status = 'failed', error = case when status = 'processing'
      then 'repair: teslim doğrulanamadı' else 'repair: güncel sohbet görüntüsünün süresi doldu' end,
      locked_until = null, updated_at = now()
    where host_id = p_host and kind = 'repair' and
      ((status = 'processing' and locked_until < now()) or (status = 'pending' and due_at < now() - interval '20 seconds'));

  return query update public.jobs j set status = 'processing', attempts = j.attempts + 1,
    locked_until = now() + make_interval(secs => p_lock_seconds), updated_at = now()
  where j.id = (
    select q.id from public.jobs q join public.pairs p on p.id = q.pair_id
    where q.host_id = p_host and q.kind <> 'repair' and q.android_send_started_at is null and q.reply_text is not null and p.reply_disabled_reason is null
      and (not p_android or q.kind <> 'nudge')
      and (not p_reply_only or q.kind = 'reply')
      and ((p_pair_ids is not null and q.pair_id = any(p_pair_ids))
        or (p_pair_ids is null and (p.delivery_retry_at is null or p.delivery_retry_at <= now())))
      and ((q.status = 'pending' and q.due_at <= now()) or (q.status = 'processing' and q.locked_until < now()))
    order by case when q.kind = 'reply' then 0 when q.online_greeting then 3 when q.kind = 'welcome' then 1 else 2 end, q.due_at, q.id
    limit 1 for update of q skip locked
  ) returning j.*;
end;
$$;

create or replace function public.claim_available_job(
  p_host uuid, p_pair_ids text[] default null, p_reply_only boolean default false, p_lock_seconds int default 120
) returns setof public.jobs language sql set search_path = '' as $$
  select * from public.claim_available_delivery_job(p_host, p_pair_ids, p_reply_only, p_lock_seconds, false);
$$;
create function public.claim_available_android_job(p_host uuid, p_pair_ids text[], p_reply_only boolean)
returns setof public.jobs language sql set search_path = '' as $$
  select * from public.claim_available_delivery_job(p_host, p_pair_ids, p_reply_only, 120, true);
$$;
revoke execute on function public.claim_available_delivery_job(uuid,text[],boolean,int,boolean),
  public.claim_available_android_job(uuid,text[],boolean) from public, anon, authenticated;
grant execute on function public.claim_available_delivery_job(uuid,text[],boolean,int,boolean),
  public.claim_available_android_job(uuid,text[],boolean) to service_role;
