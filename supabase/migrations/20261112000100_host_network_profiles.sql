-- Panelden yönetilen site bazlı GPS/proxy profilleri; bağlı eklenti bunları /api/ext/control ile alıp uygular.
alter table hosts add column if not exists network_profiles jsonb not null default '[]'::jsonb;
