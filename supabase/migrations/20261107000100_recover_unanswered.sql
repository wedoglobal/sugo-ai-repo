-- Mesaj işlendi olarak işaretlenmedikçe, başarısız/kesilmiş üretimden sonra da yeniden ele alınır.
create or replace function public.queue_unanswered_reply(p_host uuid)
returns setof public.jobs
language plpgsql
as $$
declare
  target_pair text;
begin
  update public.jobs set status = 'failed', error = 'cevap üretimi yarıda kaldı; yeniden kuyruğa alınacak', updated_at = now()
  where host_id = p_host and status = 'pending' and reply_text is null
    and updated_at < now() - interval '3 minutes';

  select p.id into target_pair
  from public.pairs p
  where p.host_id = p_host
    and exists (select 1 from public.messages m where m.pair_id = p.id and m.direction = 'in' and not m.handled)
    and not exists (select 1 from public.jobs j where j.pair_id = p.id and j.status in ('pending', 'processing'))
    and not exists (select 1 from public.jobs j where j.pair_id = p.id and j.status = 'failed' and j.updated_at > now() - interval '30 seconds')
  order by (select min(m.id) from public.messages m where m.pair_id = p.id and m.direction = 'in' and not m.handled)
  limit 1
  for update of p skip locked;

  if target_pair is null then return; end if;
  return query insert into public.jobs(pair_id, host_id, kind)
    values (target_pair, p_host, 'reply')
    on conflict (pair_id) where status in ('pending', 'processing') do nothing
    returning *;
end;
$$;
revoke all on function public.queue_unanswered_reply from public, anon, authenticated;
create index if not exists messages_unhandled_in_idx on public.messages(pair_id, id)
where direction = 'in' and not handled;
