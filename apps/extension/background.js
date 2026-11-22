import './automation.js';
import './control.js';
import './rest.js';
import { networkMessage } from './network.js';
// control.js bağımsız test edilebilsin diye ağ profili uygulayıcısı buradan verilir.
globalThis.veloraNetworkMessage = networkMessage;

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== 'sugo-network') return false;
  const url = new URL(sender.url ?? 'about:blank');
  const panel = ['http://localhost:5190', 'http://127.0.0.1:5190', 'https://sugo-host.b-erdincozer.workers.dev'].includes(url.origin);
  const popup = sender.id === chrome.runtime.id && url.protocol === 'chrome-extension:';
  if (!panel && !popup) { reply({ ok: false, error: 'Panel bağlantısı yetkisiz.' }); return false; }
  networkMessage(msg).then((data) => reply({ ok: true, data })).catch((e) => reply({ ok: false, error: e.message }));
  return true;
});
