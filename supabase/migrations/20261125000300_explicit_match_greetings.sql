alter table public.pairs add column match_event_token text;
alter table public.jobs add column match_event_token text;
create index jobs_match_event_idx on public.jobs(pair_id, id desc) where match_event_token is not null;

create function public.queue_match_greeting(p_host uuid, p_pair text, p_event text)
returns setof public.jobs language plpgsql set search_path = '' as $$
declare
  v_pair public.pairs;
  v_job public.jobs;
begin
  select * into v_pair from public.pairs
  where id = p_pair and host_id = p_host and reply_disabled_reason is null for update;
  if not found or p_event is null or char_length(p_event) not between 1 and 150
    or exists (select 1 from public.messages m where m.pair_id = p_pair and m.direction = 'in' and not m.handled)
  then return; end if;

  if v_pair.match_event_token = p_event or p_event <> 'visible' then
    select * into v_job from public.jobs where pair_id = p_pair and match_event_token = p_event
      order by id desc limit 1;
    if found and (v_job.status <> 'failed' or v_job.updated_at > now() - interval '1 minute'
      or (v_job.attempts > 0 and coalesce(v_job.error, '') not like 'sohbet listede yok:%'
        and coalesce(v_job.error, '') not in ('sohbet penceresi açılmadı', 'sohbet açılmadı')))
    then return; end if;
  end if;

  select * into v_job from public.jobs where pair_id = p_pair and status in ('pending', 'processing') for update;
  if found then
    if v_job.status <> 'pending' or v_job.kind <> 'welcome' or v_job.match_event_token is not null then return; end if;
    update public.jobs set online_greeting = false, match_event_token = p_event, reply_text = null,
      error = null, updated_at = now() where id = v_job.id returning * into v_job;
  else
    insert into public.jobs (pair_id, host_id, kind, match_event_token)
    values (p_pair, p_host, 'welcome', p_event)
    on conflict (pair_id) where status in ('pending', 'processing') do nothing returning * into v_job;
  end if;

  if v_job.id is null then return; end if;
  update public.pairs set match_event_token = p_event where id = p_pair;
  return next v_job;
end;
$$;
revoke execute on function public.queue_match_greeting(uuid,text,text) from public, anon, authenticated;
grant execute on function public.queue_match_greeting(uuid,text,text) to service_role;
