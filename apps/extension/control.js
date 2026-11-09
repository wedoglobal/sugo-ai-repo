let cached;
let inFlight;
const defaults = {
  baseUrl: typeof __VELORA_API_URL__ === 'string' ? __VELORA_API_URL__ : 'https://sugo-host.b-erdincozer.workers.dev',
  apiKey: typeof __VELORA_EXTENSION_API_KEY__ === 'string' ? __VELORA_EXTENSION_API_KEY__ : '',
};
async function localConfig() {
  const c = await chrome.storage.local.get(['baseUrl', 'apiKey', 'hostSugoId', 'enabled']);
  return { ...c, baseUrl: c.baseUrl || defaults.baseUrl, apiKey: c.apiKey || defaults.apiKey };
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
      const response = await fetch(`${c.baseUrl.replace(/\/$/, '')}/api/ext/control?host=${encodeURIComponent(c.hostSugoId)}`, { headers: { authorization: `Bearer ${c.apiKey}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Panel bağlantısı HTTP ${response.status}`);
      const { host } = await response.json();
      if (!host?.id || String(host.sugoId) !== String(c.hostSugoId) || typeof host.active !== 'boolean' || !host.revision) throw new Error('Panelden geçerli profil durumu alınamadı.');
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
globalThis.veloraControl = { resolve };
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
