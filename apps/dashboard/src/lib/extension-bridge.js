/** Aynı Chrome’daki eklentiden kimlikli bir yanıt bekler; zaman aşımı eşitleme sayılmaz. */
export function extensionRequest(payload, timeoutMs = 3500) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { window.removeEventListener('message', receive); reject(new Error('Eklenti yanıtı bekleniyor. Velora AI 0.2.0 açık olmalı.')); }, timeoutMs);
    function receive(event) {
      if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'sugo-network-response' || event.data.id !== id) return;
      clearTimeout(timer); window.removeEventListener('message', receive);
      if (event.data.result?.ok) resolve(event.data.result.data);
      else reject(new Error(event.data.result?.error ?? 'Eklenti işlemi başarısız.'));
    }
    window.addEventListener('message', receive);
    window.postMessage({ channel: 'sugo-network-request', id, payload }, location.origin);
  });
}
