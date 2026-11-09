-- diamonds: bizim (out) mesajın karşılığında kazanılan elmas (sugo'daki "xN" rozeti); diamonds_at ilk görüldüğü an.
alter table public.messages
  add column diamonds int not null default 0 check (diamonds >= 0),
  add column diamonds_at timestamptz;
create index messages_diamonds_idx on public.messages(diamonds_at) where diamonds > 0;

-- Host başına bugün / bu hafta (pazartesiden) / bu ay kazancı, son 14 gün toplamı ve ilk kazanç zamanı.
create or replace function public.diamond_totals(p_tz text default 'Europe/Istanbul')
returns table(host_id uuid, today bigint, week bigint, month bigint, last14 bigint, first_at timestamptz)
language sql stable
as $$
  with b as (
    select (date_trunc('day', now() at time zone p_tz) at time zone p_tz) as d,
           (date_trunc('week', now() at time zone p_tz) at time zone p_tz) as w,
           (date_trunc('month', now() at time zone p_tz) at time zone p_tz) as m
  )
  select p.host_id,
         coalesce(sum(x.diamonds) filter (where x.diamonds_at >= b.d), 0)::bigint,
         coalesce(sum(x.diamonds) filter (where x.diamonds_at >= b.w), 0)::bigint,
         coalesce(sum(x.diamonds) filter (where x.diamonds_at >= b.m), 0)::bigint,
         coalesce(sum(x.diamonds) filter (where x.diamonds_at >= now() - interval '14 days'), 0)::bigint,
         min(x.diamonds_at)
  from public.messages x
  join public.pairs p on p.id = x.pair_id
  cross join b
  where x.diamonds > 0
  group by p.host_id;
$$;
revoke all on function public.diamond_totals from public, anon, authenticated;
