import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let stored, chrome, fetch, listener;
const host = (active = true, revision = 'r1') => ({ id: 'host', sugoId: '123', name: 'Test', active, revision });
const panel = { id: 'test', url: 'http://localhost:5190/hosts' };
const message = (msg, sender = panel) => new Promise((resolve) => listener({ type: 'sugo-control', ...msg }, sender, resolve));
beforeEach(async () => {
  vi.resetModules(); stored = { baseUrl: 'https://example.test', apiKey: 'key', hostSugoId: '123', enabled: true };
  chrome = { runtime: { id: 'test', onMessage: { addListener: (fn) => listener = fn } }, storage: { local: { get: vi.fn(async () => ({ ...stored })), set: vi.fn(async (value) => Object.assign(stored, value)) } } };
  fetch = vi.fn(async () => ({ ok: true, json: async () => ({ host: host() }) }));
  vi.stubGlobal('chrome', chrome); vi.stubGlobal('fetch', fetch);
  await import('./control.js');
});
afterEach(() => { delete globalThis.veloraControl; vi.unstubAllGlobals(); });
describe('panelden kesin profil kontrolü', () => {
  it('sunucunun durdurma kararını eski yerel açık ayarının önüne alır', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ host: host(false) }) });
    expect((await globalThis.veloraControl.resolve(stored)).enabled).toBe(false);
  });
  it('panel ayarını önbellek süresini beklemeden yeniden okuyup doğru revizyonla onaylar', async () => {
    expect((await message({ action: 'read' })).data.active).toBe(true);
    fetch.mockResolvedValue({ ok: true, json: async () => ({ host: host(false, 'r2') }) });
    const result = await message({ action: 'refresh' });
    expect(result.data).toMatchObject({ synced: true, active: false, revision: 'r2' });
  });
  it('çevrimdışı durumunda çalışıyor veya eşitlendi demez', async () => {
    fetch.mockRejectedValue(new Error('offline'));
    const result = await globalThis.veloraControl.resolve(stored);
    expect(result.enabled).toBe(false); expect(result.control.synced).toBe(false);
  });
  it('aynı profilin sık durum okumalarını birleştirir', async () => {
    await Promise.all([globalThis.veloraControl.resolve(stored), globalThis.veloraControl.resolve(stored)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('yalnız sunucudan doğrulanmış profil bağlanır; anahtar panel yanıtına eklenmez', async () => {
    const result = await message({ action: 'bind', hostSugoId: '123' });
    expect(result.ok).toBe(true); expect(result.data.apiKey).toBeUndefined();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ baseUrl: 'http://localhost:5190', apiKey: 'key', hostSugoId: '123', enabled: true });
    fetch.mockResolvedValue({ ok: false, status: 404 });
    expect((await message({ action: 'bind', hostSugoId: '456' })).ok).toBe(false);
    expect(stored.hostSugoId).toBe('123');
  });
  it('platform sayfası veya farklı bir origin yönetim talimatı veremez', async () => {
    const result = await message({ action: 'bind', hostSugoId: '123' }, { url: 'https://sugo.live/messages' });
    expect(result.ok).toBe(false); expect(fetch).not.toHaveBeenCalled();
  });
});
