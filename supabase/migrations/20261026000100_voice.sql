-- TTS ile üretilen geçici sesler katalog dışıdır; gönderilince silinir.
alter table public.media add column generated boolean not null default false;
-- Sesli cevapta metin ayrıca yazılmaz.
alter table public.jobs add column send_text boolean not null default true;
