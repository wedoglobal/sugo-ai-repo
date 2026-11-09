import { domainOf } from './network-model.js';
const $ = (id) => document.getElementById(id);
let profile;
let host;
async function load() {
  const c = await chrome.storage.local.get(['networkProfiles']);
  host = c.networkProfiles?.activeHost;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = domainOf(tab?.url ?? '');
  $('networkDomain').textContent = domain || 'Web sitesi yok';
  profile = c.networkProfiles?.hosts?.[host]?.find((p) => p.domain === domain);
  for (const [id, key] of [['networkGps', 'gps'], ['networkProxy', 'proxy']]) {
    $(id).checked = !!profile?.[key].enabled;
    $(id).disabled = true;
  }
  const runtime = await chrome.storage.session.get([`gps:${tab?.id}`, 'proxyError']);
  $('networkStatus').textContent = runtime[`gps:${tab?.id}`] || runtime.proxyError || (profile ? 'GPS sekmeye; proxy bu domain’in tüm sekmelerine uygulanır.' : 'Bu site için etkin profil yok. Panelde bir profil ekleyin.');
}
$('networkOpen').onclick = async () => {
  const c = await chrome.storage.local.get(['baseUrl']);
  const base = c.baseUrl || (typeof __VELORA_API_URL__ === 'string' ? __VELORA_API_URL__ : 'https://sugo-host.b-erdincozer.workers.dev');
  await chrome.tabs.create({ url: `${base.replace(/\/$/, '')}/hosts${host ? `/${encodeURIComponent(host)}/network` : ''}` });
};
load().catch((e) => $('networkStatus').textContent = e.message);

setInterval(() => load().catch((e) => $('networkStatus').textContent = e.message), 2000);
