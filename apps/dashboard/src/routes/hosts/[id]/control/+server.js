import { json } from '@sveltejs/kit';
import { db, must } from '$lib/server/deps.js';
/** Eklentinin sunucuyu son okuma zamanı; panel başka bir Chrome'da açık olsa da eşitlenmeyi buradan gösterir. */
export async function GET({ params }) {
  const { data } = await db().from('hosts').select('last_seen_at').eq('id', params.id).maybeSingle();
  return json({ lastSeenAt: data?.last_seen_at ?? null, now: new Date().toISOString() }, { headers: { 'cache-control': 'no-store' } });
}
export async function POST({ params, request }) {
  const input = await request.json().catch(() => null);
  if (typeof input?.active !== 'boolean') return json({ error: 'Başlat/durdur durumu gerekli' }, { status: 400 });
  const host = must(await db().from('hosts').update({ active: input.active, updated_at: new Date().toISOString() }).eq('id', params.id).select('id, sugo_id, active, updated_at').maybeSingle());
  if (!host) return json({ error: 'Profil bulunamadı' }, { status: 404 });
  return json({ host: { id: host.id, sugoId: host.sugo_id, active: host.active, revision: host.updated_at } }, { headers: { 'cache-control': 'no-store' } });
}
