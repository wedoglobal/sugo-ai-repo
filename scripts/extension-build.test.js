import { describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { protectedScript } from './extension-build.js';
const settings = { baseUrl: 'https://studio.elseweb.lol', apiKey: 'test-bundled-key-never-production' };
const entry = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const context = (code, globals) => runInNewContext(code, globals, { timeout: 1500, contextCodeGeneration: { strings: false, wasm: false } });

describe('korumalı dağıtım paketleri', () => {
  it('karıştırılmış arka plan eski mesajları ve kayıtlı ayarları korur; dinamik kod çalıştırmaz', async () => {
    const code = await protectedScript(entry('apps/extension/automation.js'), settings);
    const stored = { baseUrl: 'https://existing.test', apiKey: 'old-client-key', hostSugoId: '123', enabled: true };
    const listeners = [];
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ job: null }) }));
    context(code, { chrome: { storage: { local: { get: async () => stored } }, runtime: { onMessage: { addListener: (f) => listeners.push(f) } } }, fetch, AbortSignal, URL, Uint8Array, btoa });
    const message = (msg) => new Promise((reply) => expect(listeners[0](msg, {}, reply)).toBe(true));
    expect(await message({ type: 'config' })).toEqual(stored);
    expect(await message({ type: 'api', path: '/api/ext/jobs/next?host=123' })).toEqual({ ok: true, data: { job: null } });
    expect(fetch).toHaveBeenCalledWith('https://existing.test/api/ext/jobs/next?host=123', expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer old-client-key' }) }));
    expect(code).not.toContain('sourceMappingURL');
    expect(code).not.toContain(settings.apiKey);
  });
  it.each([{}, { baseUrl: '', apiKey: '' }])('yeni veya boş ayarlı kurulumda gömülü bağlantıyı kullanır: %j', async (stored) => {
    const code = await protectedScript(entry('apps/extension/automation.js'), settings);
    let listener;
    context(code, { chrome: { storage: { local: { get: async () => stored } }, runtime: { onMessage: { addListener: (f) => listener = f } } } });
    const result = await new Promise((reply) => listener({ type: 'config' }, {}, reply));
    expect(result.apiKey).toBe(settings.apiKey);
    expect(result.baseUrl).toBe(settings.baseUrl);
    expect(result.enabled).toBe(false);
  });
  it('popup panelden gelen profil durumunu gösterir ve yerel ayarları değiştirmez', async () => {
    const code = await protectedScript(entry('apps/extension/popup.js'), settings);
    const elements = new Map();
    const getElementById = (id) => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); };
    const set = vi.fn();
    context(code, { document: { getElementById, activeElement: null }, setInterval: vi.fn(), chrome: { runtime: { sendMessage: async () => ({ baseUrl: settings.baseUrl, hostSugoId: '123', enabled: false, control: { hostId: 'host', synced: true } }) }, storage: { local: { set } } } });
    await vi.waitFor(() => expect(elements.has('baseUrl')).toBe(true));
    expect(elements.get('baseUrl').value).toBe(settings.baseUrl);
    expect(elements.get('hostSugoId').value).toBe('123');
    expect(elements.get('enabled').checked).toBe(false);
    expect(elements.get('status').textContent).toContain('Durduruldu');
    expect(set).not.toHaveBeenCalled();
  });
  it('karıştırılmış content betiği otomasyon kapalıyken hiçbir site işlemi başlatmaz', async () => {
    const code = await protectedScript(entry('apps/extension/content.js'), settings);
    const querySelectorAll = vi.fn();
    const sendMessage = vi.fn(async () => ({ enabled: false }));
    context(code, { chrome: { runtime: { onMessage: { addListener() {} }, sendMessage } }, document: { querySelectorAll }, location: { pathname: '/messages' }, setTimeout: vi.fn(), console: { info() {}, warn() {} } });
    await Promise.resolve(); await Promise.resolve();
    expect(querySelectorAll).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'config' });
  });
  it('MAIN-world ses köprüsü eval kullanmadan yüklenir', async () => {
    const code = await protectedScript(entry('apps/extension/inject.js'), settings);
    const addEventListener = vi.fn();
    const getUserMedia = vi.fn();
    context(code, { window: { addEventListener }, navigator: { mediaDevices: { getUserMedia } }, Element: class { setPointerCapture() {} releasePointerCapture() {} } });
    expect(addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });
  it('birleşik karıştırılmış worker eski config mesajını yanıtlar; varsayılan GPS/proxy kapalıdır', async () => {
    const code = await protectedScript(entry('apps/extension/background.js'), settings);
    const event = () => ({ addListener: vi.fn() });
    const listeners = [];
    const get = async (keys) => Array.isArray(keys) ? { hostSugoId: '123', enabled: true } : {};
    const proxySet = vi.fn();
    const attach = vi.fn();
    const chrome = {
      runtime: { id: 'test', onMessage: { addListener: (f) => listeners.push(f) }, onStartup: event(), onInstalled: event() },
      storage: { local: { get, set: vi.fn() }, session: { get: async () => ({}), set: vi.fn(), remove: vi.fn() } },
      alarms: { create: vi.fn(), clear: vi.fn(async () => true), onAlarm: event() },
      tabs: { query: async () => [], onUpdated: event(), onRemoved: event() },
      proxy: { settings: { get: async () => ({ levelOfControl: 'controllable_by_this_extension' }), set: proxySet }, onProxyError: event() },
      debugger: { getTargets: async () => [], attach, onDetach: event() },
      webRequest: { onAuthRequired: event(), onCompleted: event(), onErrorOccurred: event() },
    };
    context(code, { chrome, URL, structuredClone, AbortSignal, fetch: async () => ({ ok: true, json: async () => ({ host: { id: 'host', sugoId: '123', active: true, revision: '2026-11-08T00:00:00.000Z' } }) }) });
    const request = (msg, sender = {}) => new Promise((reply) => {
      expect(listeners.some((f) => f(msg, sender, reply) === true)).toBe(true);
    });
    expect(await request({ type: 'config' })).toEqual(expect.objectContaining({ hostSugoId: '123', apiKey: settings.apiKey, enabled: true }));
    const result = await request({ type: 'sugo-network', action: 'read', host: 'host' }, { id: 'test', url: 'chrome-extension://test/popup.html' });
    expect(result.ok).toBe(true);
    expect(result.data.profiles).toEqual([]);
    expect(proxySet).not.toHaveBeenCalled();
    expect(attach).not.toHaveBeenCalled();
  });

});
