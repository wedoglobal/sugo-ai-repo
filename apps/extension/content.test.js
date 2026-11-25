import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('./content.js', import.meta.url), 'utf8');
// Sonsuz tarayıcı döngüsü yerine her test yalnız bir sohbet turunu çalıştırır.
const script = source.slice(0, source.lastIndexOf('(async function loop()'));

// Seçicilerin test id ve yön koşullarını uygulayan küçük DOM test dublörü.
function element(testId, { text = '', state, children = [] } = {}) {
  const node = {
    innerText: text || children.map((child) => child.innerText).join('\n'),
    getAttribute: (key) => key === 'data-state' ? state : null,
    matches(selector) {
      const ids = [...selector.matchAll(/\[data-testid=([^\]]+)\]/g)].map((match) => match[1]);
      const direction = selector.match(/\[data-state=([^\]]+)\]/)?.[1];
      return ids.includes(testId) && (!direction || direction === state);
    },
    querySelectorAll(selector) {
      return children.flatMap((child) => [
        ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
      ]);
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; },
  };
  return node;
}

describe('alıntılı mesajları okuma', () => {
  it('yeni cevabı okur, alıntı önizlemesini dışarıda tutar ve mesaj sırasını korur', () => {
    const quote = (state, preview, body) => element('private-quote-message', { state, children: [
      element('private-quote-preview', { children: [
        element('private-quote-author', { text: 'Karakter:' }),
        element('private-quote-content', { text: preview }),
      ] }),
      element('private-quote-body', { text: body }),
    ] });
    const dialog = element('private-chat-content', { children: [
      element('private-text-message', { state: 'sent', children: [element('private-text-bubble', { text: 'selam' })] }),
      quote('received', '[Görsel]', 'kim bu arkdas tanidik mi 🤔😅'),
      quote('sent', 'eski gelen mesaj', 'bir arkadaşım'),
      quote('received', '[Ses]', 'bu ne mk yaaa 😂😂\nhep ayni ses kaydi 😁😂'),
      quote('received', 'yalnız önizleme', '  '),
    ] });
    const context = createContext({ dialog, chrome: { runtime: { onMessage: { addListener() {} } } } });
    runInContext(script, context);
    expect(JSON.parse(JSON.stringify(runInContext('parseMessages(dialog)', context)))).toEqual([
      { dir: 'out', text: 'selam', ts: '', diamonds: 0 },
      { dir: 'in', text: 'kim bu arkdas tanidik mi 🤔😅', ts: '', diamonds: 0 },
      { dir: 'out', text: 'bir arkadaşım', ts: '', diamonds: 0 },
      { dir: 'in', text: 'bu ne mk yaaa 😂😂\nhep ayni ses kaydi 😁😂', ts: '', diamonds: 0 },
    ]);
    expect(runInContext('sentCount(dialog)', context)).toBe(2);
  });
});

describe('boşta konum hareketi', () => {
  it('konum yanıtını beklerken gelen görünür mesajı önce işler', async () => {
    const sendMessage = vi.fn(async () => true);
    const row = {
      innerText: 'yeni mesaj',
      getAttribute: () => '123',
      querySelector: () => ({}),
    };
    const context = createContext({
      location: { pathname: '/messages' },
      document: { querySelectorAll: () => [row] },
      chrome: { runtime: { onMessage: { addListener() {} }, sendMessage } },
    });
    runInContext(script, context);
    await runInContext('roamWhileIdle(Promise.resolve(1234))', context);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(runInContext("handled.set('123', { sig: 'yeni mesaj', at: Date.now() }).has('123')", context)).toBe(true);
    await runInContext('roamWhileIdle(Promise.resolve(1234))', context);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'roam-apply', stepAt: 1234 });
  });
});

async function turn({ peerSugoId = 'peer', status = 'pending', connected = true, queued = true, match = false, requests = [] } = {}) {
  const events = [];
  const dialog = { isConnected: connected, querySelector: () => null, querySelectorAll: () => [] };
  const row = { innerText: match ? '[Eşleşme] sohbet' : 'mesaj', getAttribute: () => 'peer', querySelector: () => null };
  const context = createContext({
    events, dialog, row, console: { info() {}, warn() {} }, setTimeout, clearTimeout,
    document: { querySelectorAll: () => [row] },
    chrome: { storage: { local: { async get() { return {}; }, async set() {}, async remove() {} } }, runtime: {
      onMessage: { addListener() {} },
      async sendMessage(request) {
        requests.push(request);
        if (request.path === '/api/ext/ingest') {
          events.push('ingest');
          return { ok: true, data: { job: { status } } };
        }
        if (request.path.startsWith('/api/ext/jobs/next')) {
          events.push('claim');
          return { ok: true, data: { job: queued ? { id: 1, peerSugoId, text: 'selam' } : null } };
        }
        events.push(request.path.endsWith('/complete') ? 'complete' : 'fail');
        return { ok: true };
      },
    } },
  });
  runInContext(script, context);
  runInContext(`
    nextRow = () => row;
    rowFor = (id) => { events.push('row:' + id); return row; };
    openChat = async () => { events.push('open'); return dialog; };
    leaveChat = async () => { events.push('leave'); };
    parseMessages = () => [{ dir: '${match ? "out" : "in"}', text: 'merhaba' }];
    endsWithOnlineNotice = () => ${match};
    voiceEnabled = () => false;
    typeAndSend = async (target, text) => {
      if (target !== dialog || text !== 'selam') throw new Error('yanlış hedef veya metin');
      events.push('send');
      return true;
    };
  `, context);
  await runInContext("ingestUnread({ hostSugoId: 'host' })", context);
  return events;
}

describe('okunan sohbete doğrudan cevap', () => {
  it('eski giden mesajı olan eşleşmeyi çevrim içi bildirimden ayırır ve işi aynı sohbet için alır', async () => {
    const requests = [];
    expect(await turn({ match: true, requests })).toContain('send');
    expect(requests[0].body).toMatchObject({ match: true, messages: [{ dir: 'out', text: 'merhaba' }] });
    expect(requests[0].body).not.toHaveProperty('online');
    expect(requests[1].body).toMatchObject({ replyOnly: false, visiblePeerIds: ['peer'] });
  });
  it('Bildirimlere geçmeden ve sohbeti yeniden açmadan hazır cevabı gönderir', async () => {
    expect(await turn()).toEqual(['open', 'ingest', 'claim', 'send', 'complete', 'row:peer', 'leave']);
  });
  it('başka kişiye ait kuyruk işini göndermeden önce onun sohbetini açar', async () => {
    expect(await turn({ peerSugoId: 'other' })).toEqual(['open', 'ingest', 'claim', 'row:other', 'open', 'send', 'complete', 'row:other', 'leave']);
  });
  it('açık pencere DOM’dan kaldırıldıysa sohbeti tekrar açar', async () => {
    expect(await turn({ connected: false })).toEqual(['open', 'ingest', 'claim', 'row:peer', 'open', 'send', 'complete', 'row:peer', 'leave']);
  });
  it('üretim başarısızsa mesaj göndermeden çıkar', async () => {
    expect(await turn({ status: 'failed' })).toEqual(['open', 'ingest', 'leave']);
  });
  it('iş başka istemci tarafından alınmışsa mesaj göndermeden çıkar', async () => {
    expect(await turn({ queued: false })).toEqual(['open', 'ingest', 'claim', 'leave']);
  });
});

describe('gönderim anında panel kontrolü', () => {
  it('panel durdurduysa yazılmış mesajın gönder düğmesine basmaz', async () => {
    const click = vi.fn();
    const sendMessage = vi.fn(async () => ({ enabled: false, hostSugoId: 'host' }));
    const context = createContext({ click, chrome: { runtime: { onMessage: { addListener() {} }, sendMessage } }, document: { querySelector: () => ({ disabled: false }) }, setTimeout: (fn) => fn() });
    runInContext(script, context);
    runInContext(`
      waitFor = async (fn) => fn();
      fillInput = async () => {};
      humanClick = click;
    `, context);
    context.dialog = { querySelector: () => ({}), querySelectorAll: () => [] };
    await expect(runInContext("typeAndSend(dialog, 'selam', { hostSugoId: 'host' })", context)).rejects.toThrow(/durduruldu/);
    expect(click).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'config', fresh: true });
  });
});

describe('boşta insansı hareketler', () => {
  const setup = () => {
    const events = [];
    const target = { dispatchEvent: (e) => events.push(e.type), scrollBy: () => {}, scrollHeight: 100, clientHeight: 100 };
    const Ev = class { constructor(type) { this.type = type; } };
    const context = createContext({
      console, window: {}, setTimeout: (fn) => { fn(); }, innerWidth: 1000, innerHeight: 700, MouseEvent: Ev, PointerEvent: Ev, WheelEvent: Ev,
      document: { elementFromPoint: () => target, body: target, scrollingElement: null },
      getComputedStyle: () => ({ overflowY: 'visible' }),
      chrome: { runtime: { onMessage: { addListener() {} } } },
    });
    runInContext(script, context);
    return { events, context };
  };
  it('fare hareketi pointermove ve mousemove olaylarını arka arkaya üretir', async () => {
    const { events, context } = setup();
    await runInContext('wanderMouse()', context);
    expect(events.filter((t) => t === 'pointermove').length).toBeGreaterThanOrEqual(10);
    expect(events.filter((t) => t === 'mousemove').length).toBe(events.filter((t) => t === 'pointermove').length);
  });
  it('zamanı gelmeden hareket etmez, gelince bir sonraki hareketi öteler', async () => {
    const { events, context } = setup();
    expect(runInContext('humanDue(10, 20)', context)).toBe(false);
    expect(runInContext('humanDue(20, 20)', context)).toBe(true);
    runInContext('nextHumanAt = Date.now() + 60000', context);
    await runInContext('humanIdle({})', context);
    expect(events).toEqual([]);
  });
});

describe('Mesajlar sayfasında kalma', () => {
  const setup = (stored) => {
    const store = { ...stored };
    const sendMessage = vi.fn(async (m) => (m.type === 'rest-start' ? { ok: true } : { enabled: true, hostSugoId: 'h' }));
    const reload = vi.fn();
    const context = createContext({
      console, window: {}, document: { querySelectorAll: () => [] }, setTimeout: (fn) => { fn(); }, location: { reload, pathname: '/' },
      chrome: {
        runtime: { onMessage: { addListener() {} }, sendMessage, getManifest: () => ({ version: 't' }) },
        storage: { local: {
          get: async (k) => ({ [k]: store[k] }),
          set: async (o) => { Object.assign(store, o); },
          remove: async (k) => { delete store[k]; },
        } },
      },
    });
    runInContext(script, context);
    runInContext('goTo = async () => {}; scriptStartedAt = 0;', context);
    return { store, sendMessage, reload, context };
  };
  const cfg = "{ hostSugoId: 'h' }";
  it('mesaj gidince boşta sayacı sıfırlanır', async () => {
    const { store, context } = setup({ 'sugo-last-sent:h': Date.now() - 11 * 60000 });
    await runInContext(`noteSent(${cfg})`, context);
    expect(Date.now() - store['sugo-last-sent:h']).toBeLessThan(5000);
  });
  it('ana sayfada takılı kalınca Mesajlar bağlantısına geçer; Mesajlar sayfasındaysa dokunmaz', async () => {
    const { context } = setup({});
    runInContext("globalThis.__nav = []; goTo = async (s, path) => { globalThis.__nav.push(path); }; scriptStartedAt = 0; nextBackTryAt = 0;", context);
    context.chrome.runtime.sendMessage = async () => ({ enabled: true, hostSugoId: 'h', apiKey: 'k' });
    expect(await runInContext('backToMessages()', context)).toBe(true);
    expect(runInContext('globalThis.__nav', context)).toEqual(['/messages']);
    expect(await runInContext('backToMessages()', context)).toBe(false);
  });
  it('Mesajlar açılamazsa Ana sayfa tam yüklenir, birkaç dakika bekleyip yine bağlantıyla geçer; /messages hiçbir zaman yüklenmez', async () => {
    const { store, reload, context } = setup({});
    const assign = vi.fn();
    context.location.assign = assign;
    context.location.pathname = '/';
    runInContext("goTo = async () => { throw new Error('yok'); }; scriptStartedAt = 0;", context);
    context.chrome.runtime.sendMessage = async () => ({ enabled: true, hostSugoId: 'h', apiKey: 'k' });
    for (let i = 0; i < 3; i++) {
      runInContext('nextBackTryAt = 0', context);
      await runInContext('backToMessages()', context);
    }
    expect(reload).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalledWith('/messages');
    expect(store['sugo-back-after:h'] - Date.now()).toBeGreaterThan(110000);
    runInContext('nextBackTryAt = 0; globalThis.__n = 0; goTo = async () => { globalThis.__n++; }', context);
    expect(await runInContext('backToMessages()', context)).toBe(false);
    expect(runInContext('globalThis.__n', context)).toBe(0);
    store['sugo-back-after:h'] = Date.now() - 1;
    expect(await runInContext('backToMessages()', context)).toBe(true);
  });
});


describe('eşleşme satırı sırası', () => {
  const matchRow = (id, unread) => ({
    id, innerText: `eşleşme ${id}`,
    getAttribute: () => id,
    querySelector: (sel) => (sel === '.conv-item-unread' ? (unread ? {} : null) : sel.includes('match-prefix') ? {} : null),
  });
  const pick = (rows) => {
    const context = createContext({
      rows, console: { info() {}, warn() {} }, setTimeout, clearTimeout,
      document: { querySelectorAll: () => rows },
      chrome: { storage: { local: { async get() { return {}; }, async set() {}, async remove() {} } }, runtime: { onMessage: { addListener() {} } } },
    });
    runInContext(script, context);
    return runInContext('nextMatchRow(rows)', context)?.id;
  };

  it('okunmamış eşleşme, üstteki okunmuş eşleşmelerden önce açılır', () => {
    expect(pick([matchRow('1', false), matchRow('2', false), matchRow('3', true)])).toBe('3');
  });

  it('okunmamış yoksa listenin başındaki eşleşme açılır', () => {
    expect(pick([matchRow('1', false), matchRow('2', false)])).toBe('1');
  });
});
