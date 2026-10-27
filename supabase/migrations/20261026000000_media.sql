insert into storage.buckets (id, name, public) values ('media', 'media', false) on conflict (id) do nothing;

create table public.media (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  path text not null unique,
  name text not null default '',
  content_type text not null,
  created_at timestamptz not null default now()
);
create index media_host_idx on public.media(host_id, created_at);

-- Bir pair'e gönderilen fotoğraf bir daha seçilmez.
create table public.media_sent (
  pair_id text not null references public.pairs(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (pair_id, media_id)
);

alter table public.jobs add column media_id uuid references public.media(id) on delete set null;

alter table public.media enable row level security;
alter table public.media_sent enable row level security;
