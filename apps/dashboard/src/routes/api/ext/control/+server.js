import { json } from '@sveltejs/kit';
import { db, must } from '$lib/server/deps.js';
import { roamDomains, roamTarget } from '$lib/server/location-roam.js';

const lastVersion = new Map();

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
  let command = null;
  if (url.searchParams.get('cmd') === '1') command = must(await db().from('app_settings').select('value').eq('key', `ext_cmd:${id}`).maybeSingle())?.value ?? null;
  const domain = url.searchParams.get('roam');
  let roam;
  if (roamDomains.has(domain)) {
    roam = null;
    if (host.active && host.network_profiles?.some((p) => p.domain === domain && p.gps?.enabled)) {
      const { data, error } = await db().rpc('poll_location_roam', { p_host_id: host.id, p_domain: domain });
      if (!error) roam = await roamTarget(host.id, domain, data);
    }
  }
  return json({ command, roam, host: { id: host.id, sugoId: host.sugo_id, name: host.name, active: host.active, revision: host.updated_at, network: host.network_profiles ?? [] } }, { headers: { 'cache-control': 'no-store' } });
}
