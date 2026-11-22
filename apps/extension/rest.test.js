import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('dinlenme: her zaman tek sekme', () => {
  let tabs;
  let store;
  let chromeMock;
  beforeEach(() => {
    store = {};
    tabs = [{ id: 1, url: 'https://sugo.live/messages' }, { id: 2, url: 'https://www.sugo.live/' }];
    let next = 10;
    chromeMock = {
      tabs: {
        create: vi.fn(async ({ url }) => { const t = { id: next++, url }; tabs.push(t); return t; }),
        remove: vi.fn(async (id) => { tabs = tabs.filter((t) => t.id !== id); }),
        update: vi.fn(async (id, { url }) => { const t = tabs.find((x) => x.id === id); t.url = url; return t; }),
        get: vi.fn(async (id) => tabs.find((t) => t.id === id)),
        query: vi.fn(async () => tabs.filter((t) => /sugo\.live/.test(t.url))),
      },
      alarms: { create: vi.fn(), clear: vi.fn(async () => true), onAlarm: { addListener() {} } },
      storage: { local: {
        get: async (k) => ({ [k]: store[k] }),
        set: async (o) => { Object.assign(store, o); },
        remove: async (k) => { delete store[k]; },
      } },
      runtime: { id: 'x', getManifest: () => ({ version: 't' }), onMessage: { addListener() {} }, onStartup: { addListener() {} }, onInstalled: { addListener() {} } },
    };
    globalThis.chrome = chromeMock;
    globalThis.veloraControl = { localConfig: async () => ({ apiKey: '', hostSugoId: 'h', baseUrl: 'https://x.test' }) };
    vi.resetModules();
  });
  it('dinlenmeye geçince boş sekme açılır, tüm sugo.live sekmeleri kapanır', async () => {
    const { startRest } = await import('./rest.js');
    await startRest({ minutes: 7, hostSugoId: 'h' }, 1);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].url).toBe('about:blank');
    expect(store.veloraRest.until).toBeGreaterThan(Date.now());
  });
  it('uyanınca aynı boş sekme sugo.live olur ve başka sugo.live sekmesi kalmaz', async () => {
    const { startRest, wake } = await import('./rest.js');
    await startRest({ minutes: 7, hostSugoId: 'h' }, 1);
    tabs.push({ id: 99, url: 'https://sugo.live/nearby' });
    expect(await wake('test')).toBe(true);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].url).toBe('https://sugo.live/messages');
    expect(store.veloraRest).toBeUndefined();
  });
});
