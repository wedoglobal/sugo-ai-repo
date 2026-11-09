(() => {
  const origins = ['http://localhost:5190', 'http://127.0.0.1:5190', 'https://sugo-host.b-erdincozer.workers.dev'];
  if (!origins.includes(location.origin)) return;
  window.addEventListener('message', async (event) => {
    if (!/^\/hosts(?:\/[^/]+(?:\/network)?)?\/?$/.test(location.pathname)) return;
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'sugo-network-request') return;
    const { id, payload } = event.data;
    if (typeof id !== 'string') return;
    try {
      const result = await chrome.runtime.sendMessage({ ...payload, type: payload?.control ? 'sugo-control' : 'sugo-network' });
      window.postMessage({ channel: 'sugo-network-response', id, result }, location.origin);
    } catch { window.postMessage({ channel: 'sugo-network-response', id, result: { ok: false, error: 'Eklentiyi ve sayfayı yenileyin.' } }, location.origin); }
  });
})();
