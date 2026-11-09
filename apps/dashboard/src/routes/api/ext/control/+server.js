import { json } from '@sveltejs/kit';
import { db, must } from '$lib/server/deps.js';
export async function GET({ url }) {
  const id = url.searchParams.get('host');
  if (!/^\d{1,30}$/.test(id ?? '')) return json({ error: 'Geçerli profil ID gerekli' }, { status: 400 });
  const host = must(await db().from('hosts').select('id, sugo_id, name, active, updated_at').eq('sugo_id', id).maybeSingle());
  if (!host) return json({ error: 'Profil bulunamadı' }, { status: 404 });
  return json({ host: { id: host.id, sugoId: host.sugo_id, name: host.name, active: host.active, revision: host.updated_at } }, { headers: { 'cache-control': 'no-store' } });
}
