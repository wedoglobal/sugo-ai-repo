import { json } from '@sveltejs/kit';
import { db, must } from '$lib/server/deps.js';
import { cleanProfiles } from '$lib/server/network.js';
import { roamDomains, roamStatus } from '$lib/server/location-roam.js';

const headers = { 'cache-control': 'no-store' };

/** Kayıtlı site profilleri ve istemcilerin konum kontrolleri. */
export async function GET({ params }) {
  const host = must(await db().from('hosts').select('id, active, network_profiles, last_seen_at, last_incoming_at, host_location_roam(domain, connected_at, seen_at)').eq('id', params.id).maybeSingle());
  if (!host) return json({ error: 'Profil bulunamadı' }, { status: 404 });
  const profiles = host.network_profiles ?? [];
  const now = Date.now();
  const roaming = await Promise.all(profiles.filter((p) => p.gps && roamDomains.has(p.domain)).map((profile) =>
    roamStatus(host, profile, host.host_location_roam.find((c) => c.domain === profile.domain), now)
  ));
  return json({ profiles, roaming, lastSeenAt: host.last_seen_at ?? null, now: new Date(now).toISOString() }, { headers });
}

export async function PUT({ params, request }) {
  const input = await request.json().catch(() => null);
  let profiles;
  try { profiles = cleanProfiles(input?.profiles); } catch (e) { return json({ error: e.message }, { status: 400 }); }
  const host = must(await db().from('hosts').update({ network_profiles: profiles }).eq('id', params.id).select('id').maybeSingle());
  if (!host) return json({ error: 'Profil bulunamadı' }, { status: 404 });
  return json({ profiles }, { headers });
}
