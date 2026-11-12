import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateProfile } from './network-model.js';
const event = () => ({ addListener: vi.fn() });
let local, session, chrome, networkMessage;
const p = (domain = 'sugo.live') => validateProfile({ domain, gps: { enabled: true, latitude: 12, longitude: 23 }, proxy: { enabled: true, ip: '1.2.3.4', port: 80, auth: true, username: 'u', password: 'p' } });
beforeEach(async () => {
  vi.resetModules(); local = {}; session = {};
  const storage = (data) => ({ get: vi.fn(async (key) => key === null ? { ...data } : typeof key === 'string' ? { [key]: data[key] } : Object.fromEntries(key.map((k) => [k, data[k]]))), set: vi.fn(async (value) => Object.assign(data, structuredClone(value))), remove: vi.fn(async (key) => { delete data[key]; }) });
  chrome = {
    storage: { local: storage(local), session: storage(session) },
    tabs: { query: vi.fn(async () => [{ id: 1, url: 'https://sugo.live' }, { id: 2, url: 'https://other.test' }]), onUpdated: event(), onRemoved: event() },
    contentSettings: { location: { clear: vi.fn(async () => {}), set: vi.fn(async () => {}), get: vi.fn(async () => ({ setting: 'allow' })) } },
    proxy: { settings: { get: vi.fn(async () => ({ levelOfControl: 'controllable_by_this_extension' })), set: vi.fn(async () => {}), clear: vi.fn(async () => {}) }, onProxyError: event() },
    debugger: { attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), sendCommand: vi.fn(async () => {}), getTargets: vi.fn(async () => []), onDetach: event() },
    webRequest: { onAuthRequired: event(), onCompleted: event(), onErrorOccurred: event() },
  };
  vi.stubGlobal('chrome', chrome);
  ({ networkMessage } = await import('./network.js'));
  await networkMessage({ action: 'read', host: 'host' });
});
describe('Chrome ağ yönetimi', () => {
  it('ilk açılışta proxy veya debugger ayarına dokunmaz', () => {
    expect(chrome.proxy.settings.set).not.toHaveBeenCalled(); expect(chrome.proxy.settings.clear).not.toHaveBeenCalled(); expect(chrome.debugger.attach).not.toHaveBeenCalled();
  });
  it('pasif host kaydı uygulanmaz; etkinleştirilince doğru sekmeye GPS ve mandatory PAC uygulanır', async () => {
    await networkMessage({ action: 'save', host: 'host', profile: p() });
    expect(chrome.proxy.settings.set).not.toHaveBeenCalled();
    await networkMessage({ action: 'activate', host: 'host' });
    expect(chrome.proxy.settings.set).toHaveBeenCalledWith(expect.objectContaining({ value: expect.objectContaining({ pacScript: expect.objectContaining({ mandatory: true }) }) }));
    expect(chrome.debugger.attach).toHaveBeenCalledExactlyOnceWith({ tabId: 1 }, '1.3');
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 1 }, 'Emulation.setGeolocationOverride', { latitude: 12, longitude: 23, accuracy: 20 });
  });
  it('GPS kapatılınca override temizlenir ve proxy açık kalır', async () => {
    await networkMessage({ action: 'save', host: 'host', profile: p() }); await networkMessage({ action: 'activate', host: 'host' });
    const changed = p(); changed.gps.enabled = false;
    await networkMessage({ action: 'save', host: 'host', profile: changed });
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 1 }, 'Emulation.clearGeolocationOverride');
    expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 1 });
    expect(local.networkProfiles.hosts.host[0].proxy.enabled).toBe(true);
  });
  it('proxy politika engelinde etkinleştirmeyi geri alır', async () => {
    await networkMessage({ action: 'save', host: 'host', profile: p() });
    chrome.proxy.settings.get.mockResolvedValue({ levelOfControl: 'not_controllable' });
    await expect(networkMessage({ action: 'activate', host: 'host' })).rejects.toThrow(/politika/);
    expect(local.networkProfiles.activeHost).toBe('');
  });
  it('kimlik bilgilerini yalnızca doğru proxy ve hedef için verir; tekrarlanan auth iptal edilir', async () => {
    await networkMessage({ action: 'save', host: 'host', profile: p() }); await networkMessage({ action: 'activate', host: 'host' });
    const listener = chrome.webRequest.onAuthRequired.addListener.mock.calls[0][0];
    const auth = (changes = {}) => new Promise((resolve) => listener({ requestId: '1', isProxy: true, url: 'https://sugo.live/a', challenger: { host: '1.2.3.4', port: 80 }, ...changes }, resolve));
    expect(await auth({ isProxy: false })).toEqual({});
    expect(await auth({ challenger: { host: '9.9.9.9', port: 80 } })).toEqual({});
    expect(await auth()).toEqual({ authCredentials: { username: 'u', password: 'p' } });
    expect(await auth()).toEqual({ cancel: true });
  });
  it('aynı endpoint için çelişen şifreleri engeller', async () => {
    await networkMessage({ action: 'save', host: 'host', profile: p() }); await networkMessage({ action: 'activate', host: 'host' });
    const second = p('other.test'); second.proxy.password = 'different';
    await expect(networkMessage({ action: 'save', host: 'host', profile: second })).rejects.toThrow(/farklı kimlik/);
  });
  it('navigasyonla başka siteye geçince GPS bırakılır', async () => {
    await networkMessage({ action: 'save', host: 'host', profile: p() }); await networkMessage({ action: 'activate', host: 'host' });
    chrome.tabs.onUpdated.addListener.mock.calls[0][0](1, { url: 'https://other.test' }, { id: 1, url: 'https://other.test' });
    await networkMessage({ action: 'read', host: 'host' });
    expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 1 });
  });
  it('GPS etkin sitede izin uygular; kapatınca yalnız kendi izin kurallarını kaldırır', async () => {
    await networkMessage({ action: 'save', host: 'host', profile: p() });
    await networkMessage({ action: 'activate', host: 'host' });
    expect(chrome.contentSettings.location.set).toHaveBeenCalledWith(expect.objectContaining({ primaryPattern: 'https://sugo.live/*', setting: 'allow' }));
    const changed = p(); changed.gps.enabled = false;
    await networkMessage({ action: 'save', host: 'host', profile: changed });
    expect(local.gpsPermissionDomains).toEqual([]);
  });
  it('debugger hatasında eşitlendi onayı vermez', async () => {
    await networkMessage({ action: 'save', host: 'host', profile: p() });
    chrome.debugger.attach.mockRejectedValue(new Error('DevTools açık'));
    const result = await networkMessage({ action: 'activate', host: 'host' });
    expect(result.sync.status).toBe('error');
    expect(result.sync.errors[0]).toContain('DevTools');
    expect(chrome.contentSettings.location.set).toHaveBeenLastCalledWith(expect.objectContaining({ primaryPattern: 'https://sugo.live/*', setting: 'block' }));
  });

});
