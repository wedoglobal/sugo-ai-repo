-- Hazır normal cevaplar önce, eşleşme selamları sonra, dürtmeler en son alınır.
create or replace function public.claim_next_job(p_host uuid, p_lock_seconds int default 120)
returns setof public.jobs
language sql
as $$
  update public.jobs j set status = 'processing', attempts = attempts + 1,
         locked_until = now() + make_interval(secs => p_lock_seconds), updated_at = now()
  where j.id = (
    select id from public.jobs
    where host_id = p_host and reply_text is not null
      and ((status = 'pending' and due_at <= now()) or (status = 'processing' and locked_until < now()))
    order by case kind when 'reply' then 0 when 'welcome' then 1 else 2 end, due_at, id
    limit 1
    for update skip locked
  )
  returning j.*;
$$;
revoke all on function public.claim_next_job from public, anon, authenticated;

-- Eklenti yeni eşleşmeye geçmeden önce yalnız gerçek gelen mesajların kuyruğunu boşaltır.
create or replace function public.claim_next_reply_job(p_host uuid, p_lock_seconds int default 120)
returns setof public.jobs
language sql
as $$
  update public.jobs j set status = 'processing', attempts = attempts + 1,
         locked_until = now() + make_interval(secs => p_lock_seconds), updated_at = now()
  where j.id = (
    select id from public.jobs
    where host_id = p_host and kind = 'reply' and reply_text is not null
      and ((status = 'pending' and due_at <= now()) or (status = 'processing' and locked_until < now()))
    order by due_at, id
    limit 1
    for update skip locked
  )
  returning j.*;
$$;
revoke all on function public.claim_next_reply_job from public, anon, authenticated;
