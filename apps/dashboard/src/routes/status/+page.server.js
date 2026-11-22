import { fail } from '@sveltejs/kit';
import { db, must } from '$lib/server/deps.js';

export const load = async () => {
  const hosts = must(await db().from('hosts').select('id, name, sugo_id, active, last_seen_at').order('created_at'));
  const rows = hosts.length ? must(await db().from('app_settings').select('key, value').in('key', hosts.map((h) => `ext_state:${h.sugo_id}`))) : [];
  const states = Object.fromEntries(rows.map((r) => [r.key.replace('ext_state:', ''), r.value]));
  return { hosts: hosts.map((h) => ({ ...h, live: states[h.sugo_id] ?? null })), now: Date.now() };
};

export const actions = {
  /** Dinlenmedeki (veya bekleyen) profile "hemen başla" komutu bırakır. */
  wake: async ({ request }) => {
    const sugoId = String((await request.formData()).get('sugo_id') ?? '');
    if (!/^\d{1,30}$/.test(sugoId)) return fail(400, { error: 'Geçersiz profil' });
    must(await db().from('app_settings').upsert({ key: `ext_cmd:${sugoId}`, value: { wakeAt: Date.now() }, updated_at: new Date().toISOString() }));
    return { ok: true };
  },
};
