alter table public.pairs add column delivery_retry_at timestamptz;

-- Görünmeyen sohbetin aynı hatayla tüm kuyruğu işgal etmesini önler. Mesajlar silinmez.
update public.pairs p set delivery_retry_at = now() + interval '10 minutes'
where (select j.error from public.jobs j where j.pair_id = p.id order by j.id desc limit 1) like 'sohbet listede yok:%';

-- Tamamlanmış cevabın kapsadığı eski mesaj, dürtme sonrası yeniden açılmışsa kapatılır.
update public.messages m set handled = true
where m.direction = 'in' and not m.handled
  and exists (select 1 from public.jobs j where j.pair_id = m.pair_id and j.kind = 'reply' and j.status = 'done' and j.covers_until >= m.id);

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
    order by case q.kind when 'reply' then 0 when 'welcome' then 1 else 2 end, q.due_at, q.id
    limit 1 for update of q skip locked
  ) returning j.*;
$$;
revoke all on function public.claim_available_job from public, anon, authenticated;

create or replace function public.claim_next_job(p_host uuid, p_lock_seconds int default 120)
returns setof public.jobs language sql as $$
  select * from public.claim_available_job(p_host, null, false, p_lock_seconds);
$$;
revoke all on function public.claim_next_job from public, anon, authenticated;

create or replace function public.claim_next_reply_job(p_host uuid, p_lock_seconds int default 120)
returns setof public.jobs language sql as $$
  select * from public.claim_available_job(p_host, null, true, p_lock_seconds);
$$;
revoke all on function public.claim_next_reply_job from public, anon, authenticated;

create or replace function public.queue_available_reply(p_host uuid, p_pair_ids text[] default null)
returns setof public.jobs language plpgsql as $$
declare target_pair text;
begin
  update public.jobs set status = 'failed', error = 'cevap üretimi yarıda kaldı; yeniden kuyruğa alınacak', updated_at = now()
  where host_id = p_host and status = 'pending' and reply_text is null and updated_at < now() - interval '3 minutes';

  select p.id into target_pair from public.pairs p
  where p.host_id = p_host and p.reply_disabled_reason is null
    and ((p_pair_ids is not null and p.id = any(p_pair_ids))
      or (p_pair_ids is null and (p.delivery_retry_at is null or p.delivery_retry_at <= now())))
    and exists (select 1 from public.messages m where m.pair_id = p.id and m.direction = 'in' and not m.handled)
    and not exists (select 1 from public.jobs j where j.pair_id = p.id and j.status in ('pending', 'processing'))
    and not exists (select 1 from public.jobs j where j.pair_id = p.id and j.status = 'failed' and j.updated_at > now() - interval '30 seconds')
  order by (select min(m.id) from public.messages m where m.pair_id = p.id and m.direction = 'in' and not m.handled)
  limit 1 for update of p skip locked;

  if target_pair is null then return; end if;
  return query insert into public.jobs(pair_id, host_id, kind) values (target_pair, p_host, 'reply')
    on conflict (pair_id) where status in ('pending', 'processing') do nothing returning *;
end;
$$;
revoke all on function public.queue_available_reply from public, anon, authenticated;

create or replace function public.queue_unanswered_reply(p_host uuid)
returns setof public.jobs language sql as $$
  select * from public.queue_available_reply(p_host, null);
$$;
revoke all on function public.queue_unanswered_reply from public, anon, authenticated;
