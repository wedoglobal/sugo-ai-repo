alter table public.conversation_repair_runs
  add column scanned_pairs integer not null default 0,
  add column progress_at timestamptz,
  add column last_error_at timestamptz;

update public.conversation_repair_runs r set scanned_pairs = (
  select count(*) from public.pairs p where p.id <= r.cursor and p.created_at <= r.started_at
    and p.last_activity_at >= r.started_at - interval '30 days' and p.peer_sugo_id ~ '^[0-9]+$'
)
where r.completed_at is null and r.cursor <> '';

create function public.conversation_repair_history_batch(p_since timestamptz, p_until timestamptz, p_cursor text, p_limit int)
returns table(pair_id text, host_id uuid, messages jsonb, quiet_anchor bigint, quiet_through timestamptz)
language sql set search_path = '' as $$
  select p.id, p.host_id, coalesce(m.history, '[]'::jsonb), t.anchor_id, t.quiet_through
  from (
    select * from public.pairs where id > p_cursor and created_at <= p_until and last_activity_at >= p_since
      and peer_sugo_id ~ '^[0-9]+$' order by id limit least(greatest(p_limit, 1), 100)
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

create or replace function public.conversation_repair_history(p_since timestamptz, p_until timestamptz, p_cursor text)
returns table(pair_id text, host_id uuid, messages jsonb, quiet_anchor bigint, quiet_through timestamptz)
language sql set search_path = '' as $$
  select * from public.conversation_repair_history_batch(p_since, p_until, p_cursor, 12);
$$;

revoke execute on function public.conversation_repair_history_batch(timestamptz,timestamptz,text,int) from public, anon, authenticated;
grant execute on function public.conversation_repair_history_batch(timestamptz,timestamptz,text,int) to service_role;
