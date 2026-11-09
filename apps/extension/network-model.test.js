import { describe, it, expect } from 'vitest';
import { runInNewContext } from 'node:vm';
import { domainOf, validateProfile, pacScript, activeProfiles } from './network-model.js';
const profile = (extra = {}) => validateProfile({ domain: 'sugo.live', proxy: { enabled: true, ip: '203.0.113.10', port: 8080 }, ...extra });
describe('domain profilleri', () => {
  it('domain normalizasyonu ve sınırlı URL protokolleri', () => {
    expect(domainOf('https://SUGO.live./profile/a')).toBe('sugo.live');
    expect(domainOf('chrome://settings')).toBe('');
    expect(() => profile({ domain: '";return DIRECT' })).toThrow();
  });
  it('GPS ve proxy bağımsızdır ve varsayılan kapalıdır', () => {
    const p = validateProfile({ domain: 'sugo.live' });
    expect(p.gps.enabled).toBe(false); expect(p.proxy.enabled).toBe(false);
    expect(profile({ gps: { enabled: true, latitude: 0, longitude: 0 } }).gps.latitude).toBe(0);
  });
  it.each([NaN, Infinity, -91, 91])('hatalı enlemi reddeder: %s', (latitude) => expect(() => profile({ gps: { latitude } })).toThrow());
  it.each(['256.1.1.1', '1.2.3', '1.2.3.04', 'server.test', '1.2.3.4; DIRECT'])('hatalı IPv4 reddedilir: %s', (ip) => expect(() => profile({ proxy: { enabled: true, ip, port: 80 } })).toThrow());
  it.each([0, 65536, 1.5])('hatalı port reddedilir: %s', (port) => expect(() => profile({ proxy: { enabled: true, ip: '1.2.3.4', port } })).toThrow());
  it('SOCKS5 şifre desteğini yanlış vaat etmez', () => expect(() => profile({ proxy: { enabled: true, ip: '1.2.3.4', port: 1080, protocol: 'socks5', auth: true, username: 'a' } })).toThrow(/SOCKS5/));
  it('şifresiz profilde kimlik bilgilerini temizler; boş şifreye izin verir', () => {
    expect(profile({ proxy: { enabled: false, auth: false, password: 'secret' } }).proxy.password).toBe('');
    expect(profile({ proxy: { enabled: true, ip: '1.2.3.4', port: 80, auth: true, username: 'a', password: '' } }).proxy.password).toBe('');
  });
});
describe('PAC izolasyonu ve fail-closed', () => {
  it('üç protokol, tam domain ve DIRECT olmayan proxy kuralı', () => {
    const ps = ['http', 'https', 'socks5'].map((protocol, i) => profile({ domain: `site${i}.test`, proxy: { enabled: true, protocol, ip: '1.2.3.4', port: 80 } }));
    const context = {}; runInNewContext(pacScript(ps), context);
    expect(context.FindProxyForURL('', 'site0.test')).toBe('PROXY 1.2.3.4:80');
    expect(context.FindProxyForURL('', 'SITE1.TEST.')).toBe('HTTPS 1.2.3.4:80');
    expect(context.FindProxyForURL('', 'site2.test')).toBe('SOCKS5 1.2.3.4:80');
    for (const host of ['sub.site0.test', 'site0.test.evil', 'unconfigured.test']) expect(context.FindProxyForURL('', host)).toBe('DIRECT');
  });
  it('kapalı proxy ve pasif host kurallarını kullanmaz', () => {
    const p = profile(); p.proxy.enabled = false;
    expect(pacScript([p])).not.toContain('203.0.113.10');
    expect(activeProfiles({ activeHost: '', hosts: { test: [p] } })).toEqual([]);
  });
});
