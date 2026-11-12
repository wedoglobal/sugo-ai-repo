import { json } from '@sveltejs/kit';
import { db, must } from '$lib/server/deps.js';
export async function GET({ url }) {
  const id = url.searchParams.get('host');
  if (!/^\d{1,30}$/.test(id ?? '')) return json({ error: 'Geçerli profil ID gerekli' }, { status: 400 });
  const host = must(await db().from('hosts').select('id, sugo_id, name, active, updated_at, network_profiles').eq('sugo_id', id).maybeSingle());
  if (!host) return json({ error: 'Profil bulunamadı' }, { status: 404 });
  // Panel eşitlenmeyi eklentiden değil buradan görür; 15 saniyede bir yazılır, kolon yoksa okuma yine çalışır.
  try {
    const stale = new Date(Date.now() - 15000).toISOString();
    await db().from('hosts').update({ last_seen_at: new Date().toISOString() }).eq('id', host.id).or(`last_seen_at.is.null,last_seen_at.lt.${stale}`);
  } catch {}
  return json({ host: { id: host.id, sugoId: host.sugo_id, name: host.name, active: host.active, revision: host.updated_at, network: host.network_profiles ?? [] } }, { headers: { 'cache-control': 'no-store' } });
}
