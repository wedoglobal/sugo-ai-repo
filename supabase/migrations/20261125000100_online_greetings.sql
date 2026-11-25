alter table public.jobs add column online_greeting boolean not null default false;

create function public.queue_online_greeting(p_host uuid, p_pair text, p_text text, p_since timestamptz)
returns setof public.jobs
language sql set search_path = '' as $$
  insert into public.jobs (host_id, pair_id, kind, online_greeting, reply_text)
  select p.host_id, p.id, 'welcome', true, p_text
  from public.pairs p
  where p.host_id = p_host and p.id = p_pair and p.reply_disabled_reason is null
    and not exists (
      select 1 from public.messages m where m.pair_id = p.id and (
        (m.direction = 'out' and m.created_at >= p_since) or (m.direction = 'in' and not m.handled)
      )
    )
  on conflict (pair_id) where status in ('pending', 'processing') do nothing
  returning *;
$$;
revoke execute on function public.queue_online_greeting(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.queue_online_greeting(uuid, text, text, timestamptz) to service_role;

create or replace function public.claim_available_job(
  p_host uuid, p_pair_ids text[] default null, p_reply_only boolean default false, p_lock_seconds int default 120
)
returns setof public.jobs
language sql
as $$
  update public.jobs j set status = 'processing', attempts = attempts + 1,
    locked_until = now() + make_interval(secs => p_lock_seconds), updated_at = now()
  where j.id = (
    select q.id from public.jobs q join public.pairs p on p.id = q.pair_id
    where q.host_id = p_host and q.reply_text is not null and p.reply_disabled_reason is null
      and (not p_reply_only or q.kind = 'reply')
      and ((p_pair_ids is not null and q.pair_id = any(p_pair_ids))
        or (p_pair_ids is null and (p.delivery_retry_at is null or p.delivery_retry_at <= now())))
      and ((q.status = 'pending' and q.due_at <= now()) or (q.status = 'processing' and q.locked_until < now()))
    order by case when q.kind = 'reply' then 0 when q.online_greeting then 3 when q.kind = 'welcome' then 1 else 2 end, q.due_at, q.id
    limit 1 for update of q skip locked
  ) returning j.*;
$$;
