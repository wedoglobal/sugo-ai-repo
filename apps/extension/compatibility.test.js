import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const file = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
describe('mevcut otomasyon eklentisi uyumluluğu', () => {
  it('birleşik pakette eski otomasyon betikleri ve alanları korunur', () => {
    const manifest = JSON.parse(file('./manifest.json'));
    expect(manifest.permissions).toEqual(expect.arrayContaining(['storage', 'debugger', 'proxy', 'webRequestAuthProvider']));
    expect(manifest.name).toBe('Velora AI');
    expect(manifest.version).toBe('0.2.1');
    expect(manifest.host_permissions).toContain('<all_urls>');
    expect(manifest.content_scripts.flatMap((s) => s.js)).toEqual(['inject.js', 'content.js', 'network-bridge.js']);
    expect(file('./automation.js')).not.toContain('network.js');
    for (const id of ['baseUrl', 'hostSugoId', 'enabled', 'save']) expect(file('./popup.html')).toContain(`id="${id}"`);
  });
  it('eski config ve API mesajlarını aynı cevap biçimiyle karşılar', async () => {
    const settings = { baseUrl: 'https://example.test', apiKey: 'existing-key', hostSugoId: '123', enabled: true };
    const listeners = [];
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ job: null }) }));
    const storage = { get: vi.fn(async () => settings), set: vi.fn() };
    runInNewContext(file('./automation.js'), { chrome: { storage: { local: storage }, runtime: { onMessage: { addListener: (f) => listeners.push(f) } } }, fetch, AbortSignal, URL, Uint8Array, btoa });
    const request = (msg) => new Promise((reply) => expect(listeners[0](msg, {}, reply)).toBe(true));
    expect(await request({ type: 'config' })).toEqual(settings);
    expect(await request({ type: 'api', path: '/api/ext/jobs/next?host=123' })).toEqual({ ok: true, data: { job: null } });
    expect(fetch).toHaveBeenCalledWith('https://example.test/api/ext/jobs/next?host=123', expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer existing-key' }) }));
    expect(storage.set).not.toHaveBeenCalled();
  });
  it('bilinmeyen mesaj eski akışı ele geçirmez', () => {
    const listeners = [];
    runInNewContext(file('./automation.js'), { chrome: { runtime: { onMessage: { addListener: (f) => listeners.push(f) } } } });
    expect(listeners[0]({ type: 'sugo-network' }, {}, vi.fn())).toBe(false);
  });
  it('tek arka plan otomasyon ve ağ yönetimini yükler', () => {
    expect(file('./background.js')).toContain("import './automation.js'");
    expect(file('./background.js')).toContain("from './network.js'");
  });
});
