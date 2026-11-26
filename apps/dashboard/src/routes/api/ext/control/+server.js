import { json } from '@sveltejs/kit';
import { db, must } from '$lib/server/deps.js';
import { roamDomains, roamTarget } from '$lib/server/location-roam.js';

const lastVersion = new Map();

async function pollRoam(hostId, { domain, gps }) {
  try {
    const { data, error } = await db().rpc('poll_location_roam', { p_host_id: hostId, p_domain: domain })
      .abortSignal(AbortSignal.timeout(1500));
    if (!error && data?.latitude === gps.latitude && data?.longitude === gps.longitude) {
      return await roamTarget(hostId, domain, data);
    }
  } catch { /* Gezinti sorgusu başarısızsa kayıtlı konum ile kontrol yanıtı verilir. */ }
  return null;
}

/** Profilin eklenti sürümü değiştiğinde app_settings.ext_versions geçmişine ekler; sürüm başına eşleşme karşılaştırması buna dayanır. */
async function recordVersion(hostId, version) {
  if (lastVersion.get(hostId) === version) return;
  const row = must(await db().from('app_settings').select('value').eq('key', 'ext_versions').maybeSingle());
  const log = row?.value ?? {};
  const list = log[hostId] ?? [];
  if (list.at(-1)?.v !== version) {
    log[hostId] = [...list, { v: version, at: new Date().toISOString() }].slice(-100);
    must(await db().from('app_settings').upsert({ key: 'ext_versions', value: log, updated_at: new Date().toISOString() }));
  }
  lastVersion.set(hostId, version);
}
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
  const version = url.searchParams.get('v') ?? '';
  if (/^\d{1,3}\.\d{1,3}\.\d{1,4}$/.test(version)) await recordVersion(host.id, version).catch(() => {});
  // Dinlenen eklenti panelden "şimdi başlat" komutunu yalnız `cmd=1` ile sorar.
  const wantsCommand = url.searchParams.get('cmd') === '1';
  let command = null;
  if (wantsCommand) command = must(await db().from('app_settings').select('value').eq('key', `ext_cmd:${id}`).maybeSingle())?.value ?? null;
  const domain = url.searchParams.get('roam');
  let network = host.network_profiles ?? [];
  let roam;
  if (roamDomains.has(domain)) {
    const profile = network.find((p) => p.domain === domain && p.gps?.enabled);
    roam = host.active && profile ? await pollRoam(host.id, profile) : null;
  } else if (domain === null && !wantsCommand && host.active) {
    // İstemciler etkin konumu normal ağ profili eşitlemesiyle alır.
    network = await Promise.all(network.map(async (profile) => {
      if (!profile.gps?.enabled || !roamDomains.has(profile.domain)) return profile;
      const target = await pollRoam(host.id, profile);
      if (!target) return profile;
      return { ...profile, gps: { ...profile.gps, latitude: target.latitude, longitude: target.longitude } };
    }));
  }
  return json({ command, roam, host: { id: host.id, sugoId: host.sugo_id, name: host.name, active: host.active, revision: host.updated_at, network } }, { headers: { 'cache-control': 'no-store' } });
}
