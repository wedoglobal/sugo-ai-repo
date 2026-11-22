import { json } from '@sveltejs/kit';
import { db, must } from '$lib/server/deps.js';

const text = (v, max) => String(v ?? '').slice(0, max);
const time = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

/** Eklentinin anlık durumunu panelde göstermek için kaydeder (profil başına bir satır). */
export async function POST({ request }) {
  const b = await request.json().catch(() => null);
  if (!/^\d{1,30}$/.test(String(b?.hostSugoId ?? ''))) return json({ error: 'Geçerli profil ID gerekli' }, { status: 400 });
  const host = must(await db().from('hosts').select('id').eq('sugo_id', String(b.hostSugoId)).maybeSingle());
  if (!host) return json({ error: 'Profil bulunamadı' }, { status: 404 });
  const value = {
    state: text(b.state, 40), detail: text(b.detail, 160), since: time(b.since), until: time(b.until),
    lastSentAt: time(b.lastSentAt), lastActivityAt: time(b.lastActivityAt),
    version: text(b.version, 20), at: Date.now(),
  };
  must(await db().from('app_settings').upsert({ key: `ext_state:${b.hostSugoId}`, value, updated_at: new Date().toISOString() }));
  return json({ ok: true });
}
