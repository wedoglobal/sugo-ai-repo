-- voice_enabled: sohbette sesli mesaj açık (yakınlık seviyesi yeterli); extension bildirir.
-- nudged_at: cevapsız kalan kişiye son sesli dürtmenin zamanı; bir sessizlik için en fazla bir dürtme.
alter table public.pairs add column voice_enabled boolean not null default false, add column nudged_at timestamptz;
alter table public.jobs drop constraint jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check check (kind in ('reply', 'welcome', 'nudge'));
