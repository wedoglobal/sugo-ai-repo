// Eski yayın adresi; kayıtlı ayarlarda kalmışsa yeni adrese geçilir.
const LEGACY_URL = 'https://sugo-host.b-erdincozer.workers.dev';
import { domainOf } from './network-model.js';
const $ = (id) => document.getElementById(id);
let profile;
let host;
let domain = '';
let hostUuid = '';
let shown = '';
const val = (id) => $(id).value;
function toggleFields() {
  $('gpsFields').classList.toggle('open', $('networkGps').checked);
  $('proxyFields').classList.toggle('open', $('networkProxy').checked);
}
function fill(p) {
  $('networkGps').checked = !!p?.gps.enabled;
  $('networkProxy').checked = !!p?.proxy.enabled;
  $('netLat').value = p?.gps.latitude ?? 41.0082;
  $('netLon').value = p?.gps.longitude ?? 28.9784;
  $('netProto').value = p?.proxy.protocol ?? 'http';
  $('netIp').value = p?.proxy.ip ?? '';
  $('netPort').value = p?.proxy.port ?? 8080;
  $('netUser').value = p?.proxy.username ?? '';
  $('netPass').value = p?.proxy.password ?? '';
  toggleFields();
}
async function load() {
  const c = await chrome.storage.local.get(['networkProfiles']);
  host = c.networkProfiles?.activeHost;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  domain = domainOf(tab?.url ?? '');
  $('networkDomain').textContent = domain || 'Web sitesi yok';
  profile = c.networkProfiles?.hosts?.[host]?.find((p) => p.domain === domain);
  // Kullanıcı yazarken form üzerine yazılmaz; yalnız site değişince veya kayıtlı ayar gelince doldurulur.
  const key = `${domain}|${JSON.stringify(profile ?? null)}`;
  if (key !== shown && !document.querySelector('.net-fields :focus')) { shown = key; fill(profile); }
  const runtime = await chrome.storage.session.get([`gps:${tab?.id}`, 'proxyError', 'networkSyncError']);
  const lines = [];
  if (!domain) lines.push('Önce bir web sitesi sekmesi açın.');
  else if (!profile) lines.push(runtime.networkSyncError ? `✗ Panel ayarları uygulanamadı: ${runtime.networkSyncError}` : '○ Bu site için ayar yok. Panelden veya aşağıdan ekleyin.');
  else {
    if (profile.gps.enabled) {
      const attached = (await chrome.debugger.getTargets()).some((t) => t.tabId === tab?.id && t.attached);
      const err = runtime[`gps:${tab?.id}`];
      lines.push(err ? `✗ GPS uygulanamadı: ${err}` : attached ? `✓ GPS bu sekmede uygulanıyor (${profile.gps.latitude}, ${profile.gps.longitude})` : '✗ GPS bu sekmede henüz uygulanmadı. Sayfayı yenileyin.');
    } else lines.push('○ GPS kapalı.');
    if (profile.proxy.enabled) lines.push(runtime.proxyError ? `✗ Proxy hatası: ${runtime.proxyError}` : `✓ Proxy: ${profile.proxy.ip}:${profile.proxy.port}`);
    else lines.push('○ Proxy kapalı.');
    if (runtime.networkSyncError) lines.push(`✗ Panel ayarı uygulanamadı: ${runtime.networkSyncError}`);
  }
  $('networkStatus').textContent = lines.join('\n');
  const config = await chrome.runtime.sendMessage({ type: 'config' }).catch(() => null);
  hostUuid = config?.control?.hostId ?? '';
}
$('networkGps').onchange = toggleFields;
$('networkProxy').onchange = toggleFields;
$('networkSave').onclick = async () => {
  if (!domain) { $('networkStatus').textContent = 'Önce bir web sitesi sekmesi açın.'; return; }
  if (!hostUuid) { $('networkStatus').textContent = 'Önce yukarıdan profili bağlayın.'; return; }
  $('networkSave').disabled = true;
  try {
    const p = {
      domain,
      gps: { enabled: $('networkGps').checked, latitude: val('netLat'), longitude: val('netLon'), accuracy: profile?.gps.accuracy ?? 20 },
      proxy: { enabled: $('networkProxy').checked, protocol: val('netProto'), ip: val('netIp'), port: val('netPort'), auth: !!val('netUser'), username: val('netUser'), password: val('netPass') },
    };
    for (const msg of [{ action: 'save', profile: p, originalDomain: domain }, { action: 'activate' }]) {
      const r = await chrome.runtime.sendMessage({ type: 'sugo-network', host: hostUuid, ...msg });
      if (!r?.ok) throw new Error(r?.error || 'Kaydedilemedi.');
      if (msg.action === 'activate' && r.data?.sync?.status === 'error') throw new Error(r.data.sync.errors.join('; '));
    }
    shown = '';
    $('networkStatus').textContent = 'Kaydedildi ve uygulandı. Sayfayı yenileyin.';
  } catch (e) { $('networkStatus').textContent = e.message; }
  $('networkSave').disabled = false;
};
$('networkOpen').onclick = async () => {
  const c = await chrome.storage.local.get(['baseUrl']);
  const base = (c.baseUrl !== LEGACY_URL && c.baseUrl) || (typeof __VELORA_API_URL__ === 'string' ? __VELORA_API_URL__ : 'https://studio.elseweb.lol');
  await chrome.tabs.create({ url: `${base.replace(/\/$/, '')}/hosts${host ? `/${encodeURIComponent(host)}/network` : ''}` });
};
load().catch((e) => $('networkStatus').textContent = e.message);

setInterval(() => load().catch((e) => $('networkStatus').textContent = e.message), 2000);
