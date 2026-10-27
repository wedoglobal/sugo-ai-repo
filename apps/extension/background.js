// API çağrıları burada yapılır; content script sayfa origin'inden istek atamaz.
const DEFAULTS = { baseUrl: 'http://localhost:5190', apiKey: '', hostSugoId: '', enabled: false };

async function config() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

async function api({ path, method = 'GET', body }) {
  const c = await config();
  if (!c.apiKey) return { ok: false, error: 'API anahtarı ayarlanmamış' };
  try {
    const res = await fetch(c.baseUrl.replace(/\/$/, '') + path, {
      method,
      headers: { authorization: `Bearer ${c.apiKey}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Fotoğraf baytlarını mesaj kanalından geçebilecek şekilde base64 olarak döner. */
async function media(id) {
  const c = await config();
  try {
    const res = await fetch(`${c.baseUrl.replace(/\/$/, '')}/api/ext/media/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${c.apiKey}` } });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { ok: true, contentType: res.headers.get('content-type') ?? 'image/jpeg', base64: btoa(bin) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'api') api(msg).then(reply);
  else if (msg?.type === 'media') media(msg.id).then(reply);
  else if (msg?.type === 'config') config().then(reply);
  else return false;
  return true;
});
