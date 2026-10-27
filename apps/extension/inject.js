// Sayfanın kendi bağlamında (MAIN world) çalışır. Bir ses hazırlandığında, sayfa kaydı bitene kadar yapılan
// her mikrofon isteğine gerçek mikrofon yerine bu sesi veren akış döner; gerçek mikrofona hiç düşülmez.
(() => {
  const LEAD_SECONDS = 0.4;
  /** @type {{ctx:AudioContext, buffer:AudioBuffer, destination:MediaStreamAudioDestinationNode}|null} */
  let fake = null;

  const post = (type, extra = {}) => window.postMessage({ source: 'sugo-ext-main', type, ...extra }, '*');
  const close = () => { fake?.ctx.close().catch(() => {}); fake = null; };

  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.source !== 'sugo-ext') return;
    const { type } = e.data;
    if (type === 'mic-clear') return close();
    if (type === 'mic-play' && fake) {
      await fake.ctx.resume();
      const source = fake.ctx.createBufferSource();
      source.buffer = fake.buffer;
      source.connect(fake.destination);
      source.start(fake.ctx.currentTime + LEAD_SECONDS);
      return;
    }
    if (type !== 'mic-prepare') return;
    try {
      close();
      const ctx = new AudioContext();
      const buffer = await ctx.decodeAudioData(e.data.bytes.slice(0));
      fake = { ctx, buffer, destination: ctx.createMediaStreamDestination() };
      post('mic-ready', { duration: buffer.duration + LEAD_SECONDS });
    } catch (err) {
      post('mic-error', { error: String(err?.message ?? err) });
    }
  });

  // Her istek kendi kopyasını alır: sayfa izi durdurursa sonraki istek de çalışır.
  const fakeStream = () => {
    console.info('[sugo-host] sahte mikrofon verildi');
    post('mic-used');
    return new MediaStream(fake.destination.stream.getAudioTracks().map((t) => t.clone()));
  };

  const proto = window.MediaDevices?.prototype;
  const real = proto?.getUserMedia;
  if (real) {
    proto.getUserMedia = function (constraints) {
      return fake && constraints?.audio ? Promise.resolve(fakeStream()) : real.call(this, constraints);
    };
  }
  for (const name of ['webkitGetUserMedia', 'mozGetUserMedia', 'getUserMedia']) {
    const legacy = navigator[name];
    if (typeof legacy !== 'function') continue;
    navigator[name] = function (constraints, ok, fail) {
      if (fake && constraints?.audio) { ok?.(fakeStream()); return undefined; }
      return legacy.call(this, constraints, ok, fail);
    };
  }

  // Sentetik pointer olaylarında gerçek bir işaretçi olmadığı için capture çağrıları hata verebilir; sayfa bozulmasın.
  for (const name of ['setPointerCapture', 'releasePointerCapture']) {
    const original = Element.prototype[name];
    Element.prototype[name] = function (...args) { try { return original.apply(this, args); } catch { /* sentetik işaretçi */ } };
  }
})();
