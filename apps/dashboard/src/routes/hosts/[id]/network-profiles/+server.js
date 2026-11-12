import { json } from '@sveltejs/kit';
import { db, must } from '$lib/server/deps.js';
import { cleanProfiles } from '$lib/server/network.js';

const headers = { 'cache-control': 'no-store' };

/** Panelin kaydettiği site profilleri ve eklentinin sunucuyu son okuma zamanı. */
export async function GET({ params }) {
  const host = must(await db().from('hosts').select('network_profiles, last_seen_at').eq('id', params.id).maybeSingle());
  if (!host) return json({ error: 'Profil bulunamadı' }, { status: 404 });
  return json({ profiles: host.network_profiles ?? [], lastSeenAt: host.last_seen_at ?? null, now: new Date().toISOString() }, { headers });
}

export async function PUT({ params, request }) {
  const input = await request.json().catch(() => null);
  let profiles;
  try { profiles = cleanProfiles(input?.profiles); } catch (e) { return json({ error: e.message }, { status: 400 }); }
  const host = must(await db().from('hosts').update({ network_profiles: profiles }).eq('id', params.id).select('id').maybeSingle());
  if (!host) return json({ error: 'Profil bulunamadı' }, { status: 404 });
  return json({ profiles }, { headers });
}
