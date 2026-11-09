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

async function turn({ peerSugoId = 'peer', status = 'pending', connected = true, queued = true } = {}) {
  const events = [];
  const dialog = { isConnected: connected, querySelector: () => null, querySelectorAll: () => [] };
  const row = { innerText: 'mesaj', getAttribute: () => 'peer', querySelector: () => null };
  const context = createContext({
    events, dialog, row, console: { info() {}, warn() {} }, setTimeout, clearTimeout,
    document: { querySelectorAll: () => [row] },
    chrome: { storage: { local: { async get() { return {}; }, async set() {}, async remove() {} } }, runtime: {
      onMessage: { addListener() {} },
      async sendMessage(request) {
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
    parseMessages = () => [{ dir: 'in', text: 'merhaba' }];
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
