// Eski yayın adresi; kayıtlı ayarlarda kalmışsa yeni adrese geçilir.
const LEGACY_URL = 'https://sugo-host.b-erdincozer.workers.dev';
let cached;
let inFlight;
const defaults = {
  baseUrl: typeof __VELORA_API_URL__ === 'string' ? __VELORA_API_URL__ : 'https://studio.elseweb.lol',
  apiKey: typeof __VELORA_EXTENSION_API_KEY__ === 'string' ? __VELORA_EXTENSION_API_KEY__ : '',
};
const version = () => { try { return `&v=${chrome.runtime.getManifest().version}`; } catch { return ''; } };
async function localConfig() {
  const c = await chrome.storage.local.get(['baseUrl', 'apiKey', 'hostSugoId', 'enabled']);
  return { ...c, baseUrl: !c.baseUrl || c.baseUrl === LEGACY_URL ? defaults.baseUrl : c.baseUrl, apiKey: c.apiKey || defaults.apiKey };
}
/** Panelde kaydedilen GPS/proxy profillerini bu Chrome'a uygular; yalnız içerik değişince veya yerel kayıt farklıysa çalışır. */
async function syncNetwork(host) {
  const apply = globalThis.veloraNetworkMessage;
  if (!Array.isArray(host.network) || !apply) return;
  const signature = JSON.stringify([host.id, host.network]);
  const local = await chrome.storage.local.get(['networkSyncSig', 'networkSyncTriedAt', 'networkProfiles']);
  if (local.networkSyncSig === signature && local.networkProfiles?.activeHost === host.id) return;
  if (local.networkSyncSig !== signature && Date.now() - (local.networkSyncTriedAt ?? 0) < 30000) return;
  await chrome.storage.local.set({ networkSyncTriedAt: Date.now() });
  try {
    await apply({ action: 'replace', host: host.id, profiles: host.network });
    await chrome.storage.local.set({ networkSyncSig: signature });
    await chrome.storage.session.set({ networkSyncError: '' });
  } catch (e) { await chrome.storage.session.set({ networkSyncError: e.message, proxyError: e.message }); }
}
async function resolve(c, force = false) {
  if (!c.apiKey) return { ...c, enabled: false, control: { synced: false, error: 'Eklentide API anahtarı yok. Kaynak klasör yerine `pnpm extension:package` ile üretilen paketi Chrome’a yükleyin.' } };
  if (!c.hostSugoId) return { ...c, enabled: false, control: { synced: false, error: 'Panelden bu Chrome’a bir profil bağlayın.' } };
  const key = `${c.baseUrl}|${c.hostSugoId}|${c.apiKey}`;
  if (inFlight) await inFlight;
  if (!force && cached?.key === key && Date.now() - cached.time < 1000) return { ...c, enabled: cached.status.synced && cached.status.active, control: cached.status };
  inFlight = (async () => {
    let status;
    try {
      const response = await fetch(`${c.baseUrl.replace(/\/$/, '')}/api/ext/control?host=${encodeURIComponent(c.hostSugoId)}${version()}`, { headers: { authorization: `Bearer ${c.apiKey}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Panel bağlantısı HTTP ${response.status}`);
      const { host } = await response.json();
      if (!host?.id || String(host.sugoId) !== String(c.hostSugoId) || typeof host.active !== 'boolean' || !host.revision) throw new Error('Panelden geçerli profil durumu alınamadı.');
      await syncNetwork(host).catch(() => {});
      status = { synced: true, hostId: host.id, sugoId: host.sugoId, name: host.name, active: host.active, revision: host.revision, checkedAt: new Date().toISOString() };
    } catch (e) {
      status = { synced: false, sugoId: c.hostSugoId, active: false, error: e.message, checkedAt: new Date().toISOString() };
    }
    cached = { key, time: Date.now(), status };
  })();
  try { await inFlight; } finally { inFlight = null; }
  // Profil bağlama sırasında başka bir isteğin önbelleği değişmiş olabilir.
  if (cached.key !== key) return resolve(c, true);
  return { ...c, enabled: cached.status.synced && cached.status.active, control: cached.status };
}
globalThis.veloraControl = { resolve, localConfig };
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== 'sugo-control') return false;
  const url = new URL(sender.url ?? 'about:blank');
  const panel = ['http://localhost:5190', 'http://127.0.0.1:5190', defaults.baseUrl].includes(url.origin);
  const popup = sender.id === chrome.runtime.id && url.protocol === 'chrome-extension:';
  if (!panel && !popup) { reply({ ok: false, error: 'Panel bağlantısı yetkisiz.' }); return false; }
  (async () => {
    if (msg.action === 'bind') {
      if (!/^\d{1,30}$/.test(String(msg.hostSugoId ?? ''))) throw new Error('Geçerli profil ID gerekli.');
      const c = await localConfig();
      const baseUrl = panel ? url.origin : c.baseUrl;
      const apiKey = defaults.apiKey || c.apiKey;
      const result = await resolve({ ...c, baseUrl, apiKey, hostSugoId: String(msg.hostSugoId) }, true);
      if (!result.control.synced) throw new Error(result.control.error);
      await chrome.storage.local.set({ baseUrl, apiKey, hostSugoId: String(msg.hostSugoId), enabled: result.enabled });
      return result.control;
    }
    if (!['read', 'refresh'].includes(msg.action)) throw new Error('Kontrol işlemi geçersiz.');
    return (await resolve(await localConfig(), msg.action === 'refresh')).control;
  })().then((data) => reply({ ok: true, data })).catch((e) => reply({ ok: false, error: e.message }));
  return true;
});
