create table public.hosts (
  id uuid primary key default gen_random_uuid(),
  sugo_id text not null unique,
  name text not null default '',
  active boolean not null default true,
  persona jsonb not null default '{}',
  knowledge jsonb not null default '[]',
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pairs (
  id text primary key,
  host_id uuid not null references public.hosts(id) on delete cascade,
  peer_sugo_id text not null,
  peer_name text not null default '',
  permanent jsonb not null default '{}',
  disclosed jsonb not null default '{}',
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pair_id_format check (id = split_part(id, '-', 1) || '-' || peer_sugo_id)
);
create index pairs_host_idx on public.pairs(host_id, last_activity_at desc);

create table public.messages (
  id bigint generated always as identity primary key,
  pair_id text not null references public.pairs(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  text text not null check (char_length(text) between 1 and 4000),
  dedupe_key text not null,
  sugo_ts text,
  handled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (pair_id, dedupe_key)
);
create index messages_pair_idx on public.messages(pair_id, id desc);
create index messages_unread_idx on public.messages(pair_id) where direction = 'in' and not handled;

create table public.temp_context (
  id bigint generated always as identity primary key,
  pair_id text not null references public.pairs(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index temp_context_pair_idx on public.temp_context(pair_id, expires_at);

create table public.jobs (
  id bigint generated always as identity primary key,
  pair_id text not null references public.pairs(id) on delete cascade,
  host_id uuid not null references public.hosts(id) on delete cascade,
  kind text not null check (kind in ('reply', 'welcome')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  reply_text text,
  covers_until bigint,
  error text,
  attempts int not null default 0,
  due_at timestamptz not null default now(),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index jobs_one_active_per_pair on public.jobs(pair_id) where status in ('pending', 'processing');
create index jobs_host_status_idx on public.jobs(host_id, status, due_at);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.hosts enable row level security;
alter table public.pairs enable row level security;
alter table public.messages enable row level security;
alter table public.temp_context enable row level security;
alter table public.jobs enable row level security;
alter table public.app_settings enable row level security;

-- Kuyruktan atomik iş alma: pair başına tek aktif job, kilit süresi dolmuşlar tekrar alınır.
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
    order by due_at, id
    limit 1
    for update skip locked
  )
  returning j.*;
$$;
revoke all on function public.claim_next_job from public, anon, authenticated;
