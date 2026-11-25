import './automation.js';
import './control.js';
import './rest.js';
import { checkRoam } from './control.js';
import { applyRoam, networkMessage } from './network.js';
// control.js bağımsız test edilebilsin diye ağ profili uygulayıcısı buradan verilir.
globalThis.veloraNetworkMessage = networkMessage;

const offers = new Map();
chrome.tabs.onRemoved.addListener((id) => offers.delete(id));
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!['roam-check', 'roam-apply'].includes(msg?.type) || sender.id !== chrome.runtime.id ||
      sender.frameId !== 0 || sender.tab?.id == null) return false;
  const url = new URL(sender.url ?? 'about:blank');
  if (!['https://sugo.live', 'https://www.sugo.live'].includes(url.origin) || !url.pathname.startsWith('/messages')) return false;
  const tabId = sender.tab.id;
  (async () => {
    if (msg.type === 'roam-check') {
      offers.delete(tabId);
      const result = await checkRoam(msg.hostSugoId, url.hostname);
      if (!result) return null;
      offers.set(tabId, { ...result, domain: url.hostname, expiresAt: Date.now() + 5000 });
      return result.roam.stepAt;
    }
    const offer = offers.get(tabId);
    offers.delete(tabId);
    if (!offer || offer.domain !== url.hostname || offer.roam.stepAt !== msg.stepAt) return false;
    return applyRoam(tabId, offer.domain, offer.host, offer.roam, offer.expiresAt);
  })().then(reply, () => reply(null));
  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== 'sugo-network') return false;
  const url = new URL(sender.url ?? 'about:blank');
  const panel = ['http://localhost:5190', 'http://127.0.0.1:5190', 'https://studio.elseweb.lol'].includes(url.origin);
  const popup = sender.id === chrome.runtime.id && url.protocol === 'chrome-extension:';
  if (!panel && !popup) { reply({ ok: false, error: 'Panel bağlantısı yetkisiz.' }); return false; }
  networkMessage(msg).then((data) => reply({ ok: true, data })).catch((e) => reply({ ok: false, error: e.message }));
  return true;
});
